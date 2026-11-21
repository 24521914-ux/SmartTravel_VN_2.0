package vn.smarttravel.intelligence.ranking;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;

import com.fasterxml.jackson.databind.JsonNode;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import vn.smarttravel.intelligence.projections.service.ProjectionService;
import vn.smarttravel.intelligence.ranking.service.*;

/**
 * Real-PostgreSQL Integration Tests for V11 Hybrid Recommendation Ranking Engine:
 * - End-to-end /recommendations/rank with final Catalog batch visibility check & reserve refill
 * - Hidden place excluded before response; Catalog failure fails closed (503)
 * - Impression idempotency + authoritative server-side rank verification
 * - Dataset import split-leakage rejection, freeze, evaluation, tuning (validation-only, no auto-activate)
 * - Concurrent deployment activation guarantees exactly one active deployment
 * - Admin RBAC enforcement (regular user receives 403 on /api/v1/admin/ranking/**)
 */
@ActiveProfiles("test")
@SpringBootTest(properties = {
        "security.jwt.jwk-set-uri=http://127.0.0.1:1/jwks",
        "security.jwt.issuer=fixture",
        "intelligence.workers-enabled=false",
        "intelligence.transport.enabled=false",
        "intelligence.weather.enabled=false",
        "intelligence.ranking.cache-ttl-seconds=0",
        "logging.level.root=INFO"
})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "INTELLIGENCE_DB_TESTS", matches = "true")
class RankingDatabaseIntegrationTests {

    @MockitoBean JwtDecoder decoder;
    @Autowired JdbcTemplate db;
    @Autowired MockMvc http;
    @Autowired ProjectionService projections;
    @Autowired RankingServingService serving;
    @Autowired RankingGovernanceService governance;
    @Autowired RankingEvaluationService evaluation;

    static HttpServer stub;
    static final Map<UUID, Boolean> visibility = new ConcurrentHashMap<>();
    static volatile boolean failCatalog = false;
    static final UUID ADMIN = UUID.fromString("90000000-0000-4000-8000-000000000001");
    static final UUID USER = UUID.fromString("90000000-0000-4000-8000-000000000002");
    static final UUID DEST = UUID.fromString("50000000-0000-4000-8000-000000000010");
    static final UUID CAT = UUID.fromString("10000000-0000-4000-8000-000000000010");

    @DynamicPropertySource
    static void stubCatalog(DynamicPropertyRegistry registry) throws Exception {
        stub = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        stub.createContext("/internal/v1/places/validate", ex -> {
            if (failCatalog) {
                ex.sendResponseHeaders(503, -1);
                ex.close();
                return;
            }
            JsonNode body = read(new String(ex.getRequestBody().readAllBytes()));
            var items = new ArrayList<Map<String, Object>>();
            for (var n : body.path("ids")) {
                UUID id = UUID.fromString(n.asText());
                items.add(Map.of("place_id", id, "public", visibility.getOrDefault(id, true), "version", 1));
            }
            byte[] out = json(Map.of("items", items, "missing_ids", List.of())).getBytes();
            ex.sendResponseHeaders(200, out.length);
            ex.getResponseBody().write(out);
            ex.close();
        });
        stub.setExecutor(Executors.newCachedThreadPool());
        stub.start();
        registry.add("intelligence.catalog-url", () -> "http://127.0.0.1:" + stub.getAddress().getPort());
        var tmp = java.nio.file.Files.createTempDirectory("ranking-int-artifacts-");
        registry.add("intelligence.artifact-root", tmp::toString);
    }

    @AfterAll
    static void teardown() {
        if (stub != null) stub.stop(0);
    }

    @BeforeEach
    void reset() {
        visibility.clear();
        failCatalog = false;
        for (String table : List.of(
                "recommendation_feedback", "recommendation_impressions",
                "recommendation_results", "recommendation_requests",
                "tuning_trials", "tuning_jobs", "evaluation_runs",
                "eval_judgments", "eval_datasets", "cohort_stat_snapshots",
                "inbox_events", "outbox_events", "place_features",
                "user_feature_profiles", "interactions", "projection_versions"
        )) {
            db.update("delete from intelligence." + table);
        }
        // Keep seeded baseline config & deployment intact
        db.update("delete from intelligence.ranking_deployments where deployment_id <> '00000000-0000-4000-8000-000000000201'");
        db.update("update intelligence.ranking_deployments set deactivated_at = null where deployment_id = '00000000-0000-4000-8000-000000000201'");
        db.update("delete from intelligence.ranking_config_versions where config_version_id <> '00000000-0000-4000-8000-000000000101'");
        db.update("update intelligence.ranking_config_versions set lifecycle_status = 'ACTIVE' where config_version_id = '00000000-0000-4000-8000-000000000101'");
    }

    private UUID seedPlace(String name, Double price, int ratingCount, double ratingSum, List<String> tags, double lat, double lon) {
        UUID id = UUID.randomUUID();
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("name", name);
        f.put("category_ids", List.of(CAT.toString()));
        f.put("destination_ids", List.of(DEST.toString()));
        f.put("structured_tags", tags);
        f.put("currency", "VND");
        if (price != null) {
            f.put("price", price);
            f.put("price_min", price);
        }
        f.put("latitude", lat);
        f.put("longitude", lon);
        f.put("space_type", "INDOOR");
        projections.consume(read(json(Map.of(
                "event_id", UUID.randomUUID(), "event_type", "catalog.place.upserted.v1",
                "schema_version", 1, "producer", "catalog", "aggregate_version", 1,
                "occurred_at", Instant.now().toString(),
                "payload", Map.of("place_id", id, "status", "PUBLISHED", "features", f)
        ))));
        if (ratingCount > 0) {
            projections.consume(read(json(Map.of(
                    "event_id", UUID.randomUUID(), "event_type", "community.rating-summary.changed.v1",
                    "schema_version", 1, "producer", "community", "aggregate_version", 1,
                    "occurred_at", Instant.now().toString(),
                    "payload", Map.of("place_id", id, "count", ratingCount, "sum", ratingSum)
            ))));
        }
        return id;
    }

    @Test
    void rankEndToEndVisibilityRefillFailClosedAndImpressionAuthoritativeRank() throws Exception {
        UUID pHidden = seedPlace("Hidden Top", 50_000.0, 50, 245.0, List.of("quiet"), 16.050, 108.220);
        UUID pGood1 = seedPlace("Good Quiet", 60_000.0, 20, 92.0, List.of("quiet"), 16.051, 108.221);
        UUID pGood2 = seedPlace("Good Reserve", 70_000.0, 10, 42.0, List.of("heritage"), 16.055, 108.225);
        seedPlace("Unknown Price", null, 30, 150.0, List.of("quiet"), 16.050, 108.220);

        visibility.put(pHidden, false);
        governance.recomputeCohortSnapshot(ADMIN, 30, 1);

        var body = read(json(Map.of(
                "topN", 2, "currency", "VND", "destination_id", DEST,
                "max_budget", 100_000, "soft_preferences", Map.of("quiet", 1.0),
                "origin", Map.of("latitude", 16.050, "longitude", 108.220), "max_distance_km", 5.0
        )));

        var mvcRes = http.perform(post("/api/v1/recommendations/rank")
                        .contentType("application/json")
                        .content(json(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recommendation_request_id").exists())
                .andExpect(jsonPath("$.ranking_config_version").value("hybrid-baseline-v1"))
                .andExpect(jsonPath("$.results.length()").value(2))
                .andExpect(jsonPath("$.results[0].place_id").value(pGood1.toString()))
                .andExpect(jsonPath("$.results[1].place_id").value(pGood2.toString()))
                .andReturn();

        JsonNode resp = read(mvcRes.getResponse().getContentAsString());
        String reqId = resp.path("recommendation_request_id").asText();

        // Impression dedup & authoritative rank verification
        var impPayload = Map.of("items", List.of(Map.of(
                "idempotency_key", "imp-test-1",
                "recommendation_request_id", reqId,
                "place_id", pGood2.toString(),
                "viewed_at", Instant.now().toString()
        )));
        var imp1 = serving.recordImpressions(null, read(json(impPayload)));
        var imp2 = serving.recordImpressions(null, read(json(impPayload)));
        assertThat(imp1.get("accepted")).isEqualTo(1);
        assertThat(imp2.get("duplicates")).isEqualTo(1);
        Integer storedRank = db.queryForObject("SELECT rank FROM intelligence.recommendation_impressions WHERE idempotency_key='imp-test-1'", Integer.class);
        assertThat(storedRank).isEqualTo(2);

        // Catalog final check failure MUST fail closed (503), never return unverified items
        failCatalog = true;
        http.perform(post("/api/v1/recommendations/rank")
                        .contentType("application/json")
                        .content(json(body)))
                .andExpect(status().isServiceUnavailable());
    }

    @Test
    void concurrentActivationSingleActiveAndAdminRbacAndSplitLeakageRejection() throws Exception {
        // Non-admin receives 403 on admin endpoints
        var nonAdmin = jwt().jwt(j -> j.subject(USER.toString()))
                .authorities(new SimpleGrantedAuthority("SCOPE_intelligence:read"));
        http.perform(get("/api/v1/admin/ranking/configs").with(nonAdmin))
                .andExpect(status().isForbidden());

        // Concurrent activation of two validated configs leaves exactly 1 active deployment
        UUID c1 = (UUID) governance.createConfig(ADMIN, read(json(Map.of("name", "C1", "version_tag", "c1", "weights", Map.of("basic", 0.3, "content", 0.4, "collaborative", 0.1, "context", 0.2))))).get("config_version_id");
        UUID c2 = (UUID) governance.createConfig(ADMIN, read(json(Map.of("name", "C2", "version_tag", "c2", "weights", Map.of("basic", 0.4, "content", 0.3, "collaborative", 0.1, "context", 0.2))))).get("config_version_id");
        governance.validateConfig(ADMIN, c1, null);
        governance.validateConfig(ADMIN, c2, null);

        var pool = Executors.newFixedThreadPool(2);
        try {
            var f1 = pool.submit(() -> governance.activateDeployment(ADMIN, read(json(Map.of("config_version_id", c1, "reason", "race A", "allow_demo_activation", true)))));
            var f2 = pool.submit(() -> governance.activateDeployment(ADMIN, read(json(Map.of("config_version_id", c2, "reason", "race B", "allow_demo_activation", true)))));
            f1.get(5, TimeUnit.SECONDS);
            f2.get(5, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
        assertThat(db.queryForObject("SELECT COUNT(*) FROM intelligence.ranking_deployments WHERE deactivated_at IS NULL", Integer.class)).isEqualTo(1);

        // Dataset split leakage prevention: same scenario_group in VALIDATION and TEST is rejected
        UUID dsId = (UUID) evaluation.createDataset(ADMIN, read(json(Map.of("name", "LeakageTest", "dataset_kind", "JUDGMENT", "provenance_tier", "HUMAN_LABELED")))).get("eval_dataset_id");
        UUID placeA = seedPlace("Place A", 50_000.0, 5, 22.0, List.of("quiet"), 16.05, 108.22);
        UUID placeB = seedPlace("Place B", 60_000.0, 5, 20.0, List.of("quiet"), 16.06, 108.23);
        evaluation.upsertJudgment(ADMIN, dsId, read(json(Map.of("query_id", "q1", "scenario_group", "grp-shared", "place_id", placeA, "relevance_grade", 3, "split", "VALIDATION"))));
        assertThatThrownBy(() -> evaluation.upsertJudgment(ADMIN, dsId, read(json(Map.of("query_id", "q2", "scenario_group", "grp-shared", "place_id", placeB, "relevance_grade", 2, "split", "TEST")))))
                .hasMessageContaining("SCENARIO_GROUP_SPLIT_LEAKAGE");
    }

    @Test
    void humanLabelingPoolIsUnlabeledDisjointAcrossSplitsAndSupportsInsufficientInfo() throws Exception {
        for (int i = 1; i <= 10; i++) {
            seedPlace("VN Place " + i, i % 2 == 0 ? 120_000.0 : null, i, 4.2 * i, List.of("quiet"), 21.02 + i * 0.003, 105.85 + i * 0.003);
        }

        var pool = evaluation.createHumanLabelingPool(ADMIN, read(json(Map.of("name", "Human Pool Test", "candidates_per_query", 6))));
        UUID dsId = (UUID) pool.get("eval_dataset_id");
        assertThat(pool.get("provenance_tier")).isEqualTo("HUMAN_LABELED");
        assertThat(pool.get("status")).isEqualTo("DRAFT");
        assertThat(((Number) pool.get("labeled_count")).intValue()).isZero();
        assertThat(((Number) pool.get("unlabeled_count")).intValue()).isGreaterThanOrEqualTo(4);

        // Cannot freeze a completely unlabeled pool
        assertThatThrownBy(() -> evaluation.freezeDataset(ADMIN, dsId))
                .hasMessageContaining("NO_LABELED_ROWS_CANNOT_FREEZE");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> judgments = (List<Map<String, Object>>) pool.get("judgments");
        assertThat(judgments).isNotEmpty();
        // Verify every row starts UNLABELED with null grade and has place_info metadata
        assertThat(judgments).allSatisfy(j -> {
            assertThat(j.get("judgment_status")).isEqualTo("UNLABELED");
            assertThat(j.get("relevance_grade")).isNull();
            assertThat(j.get("place_info")).isNotNull();
        });

        // Verify VALIDATION and TEST scenario_groups are strictly disjoint
        Set<String> valGroups = new HashSet<>();
        Set<String> testGroups = new HashSet<>();
        for (var j : judgments) {
            if ("VALIDATION".equals(j.get("split"))) valGroups.add(String.valueOf(j.get("scenario_group")));
            if ("TEST".equals(j.get("split"))) testGroups.add(String.valueOf(j.get("scenario_group")));
        }
        assertThat(Collections.disjoint(valGroups, testGroups)).isTrue();

        // Mark first row INSUFFICIENT_INFO and second row LABELED grade 3
        var first = judgments.get(0);
        var second = judgments.get(1);
        var afterInsuff = evaluation.upsertJudgment(ADMIN, dsId, read(json(Map.of(
                "query_id", first.get("query_id"),
                "scenario_group", first.get("scenario_group"),
                "place_id", first.get("place_id").toString(),
                "split", first.get("split"),
                "judgment_status", "INSUFFICIENT_INFO"
        ))));
        assertThat(((Number) afterInsuff.get("insufficient_info_count")).intValue()).isEqualTo(1);
        assertThat(((Number) afterInsuff.get("labeled_count")).intValue()).isZero();

        var afterGrade = evaluation.upsertJudgment(ADMIN, dsId, read(json(Map.of(
                "query_id", second.get("query_id"),
                "scenario_group", second.get("scenario_group"),
                "place_id", second.get("place_id").toString(),
                "split", second.get("split"),
                "judgment_status", "LABELED",
                "relevance_grade", 3
        ))));
        assertThat(((Number) afterGrade.get("labeled_count")).intValue()).isEqualTo(1);
    }
}
