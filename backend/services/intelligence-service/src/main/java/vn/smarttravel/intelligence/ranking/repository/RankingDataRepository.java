package vn.smarttravel.intelligence.ranking.repository;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import vn.smarttravel.intelligence.models.artifacts.ArtifactStore;
import vn.smarttravel.intelligence.projections.service.ProjectionService;
import vn.smarttravel.intelligence.ranking.domain.ContentScorer;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;

/**
 * Persistence adapter for the Modular Hybrid Recommendation Ranking Engine.
 * Reads ONLY from intelligence-owned projections and tables (never cross-DB).
 */
@Repository
public class RankingDataRepository {

    private record TimedValue<T>(T value, long expiresAtNanos) {
        boolean isFresh() {
            return System.nanoTime() < expiresAtNanos;
        }
    }

    private final JdbcTemplate db;
    private final ArtifactStore artifacts;
    private final ProjectionService projections;
    private final long cacheTtlNanos;

    private volatile TimedValue<ActiveDeployment> activeDeploymentCache;
    private volatile TimedValue<Set<UUID>> inactiveCategoriesCache;
    private final ConcurrentHashMap<Integer, TimedValue<List<PlaceSnapshot>>> publishedPlacesCache = new ConcurrentHashMap<>();

    public RankingDataRepository(
            JdbcTemplate db,
            ArtifactStore artifacts,
            ProjectionService projections,
            @Value("${intelligence.ranking.cache-ttl-seconds:15}") long cacheTtlSeconds
    ) {
        this.db = db;
        this.artifacts = artifacts;
        this.projections = projections;
        this.cacheTtlNanos = Math.max(0L, cacheTtlSeconds) * 1_000_000_000L;
    }

    /** Explicitly clear short-TTL read caches after any deployment, config, cohort, CF, or projection mutation. */
    public void invalidateCaches() {
        activeDeploymentCache = null;
        inactiveCategoriesCache = null;
        publishedPlacesCache.clear();
    }

    public record ActiveDeployment(
            UUID deploymentId,
            UUID configVersionId,
            UUID cohortSnapshotId,
            UUID cfArtifactId,
            RankingConfig config,
            CohortStats cohortStats,
            CfArtifactData cfArtifact,
            String qualityStatus,
            boolean demoActivation,
            Instant activatedAt,
            String reason
    ) {}

    public ActiveDeployment loadActiveDeployment() {
        if (cacheTtlNanos > 0) {
            TimedValue<ActiveDeployment> cached = activeDeploymentCache;
            if (cached != null && cached.isFresh()) {
                return cached.value();
            }
        }
        ActiveDeployment fresh = fetchActiveDeploymentFromDb();
        if (cacheTtlNanos > 0) {
            activeDeploymentCache = new TimedValue<>(fresh, System.nanoTime() + cacheTtlNanos);
        }
        return fresh;
    }

    private ActiveDeployment fetchActiveDeploymentFromDb() {
        var rows = db.queryForList("""
                SELECT d.deployment_id, d.config_version_id, d.cohort_snapshot_id, d.cf_artifact_id,
                       d.quality_status AS dep_quality_status, d.is_demo_activation, d.activated_at, d.reason,
                       c.version_tag AS cfg_version_tag, c.weights AS cfg_weights, c.sub_params AS cfg_sub_params,
                       c.scorer_versions AS cfg_scorer_versions, c.quality_status AS cfg_quality_status,
                       s.version_tag AS cohort_version_tag, s.computed_at AS cohort_computed_at,
                       s.window_days AS cohort_window_days, s.min_sample AS cohort_min_sample,
                       s.cohort_stats AS cohort_stats_json
                FROM intelligence.ranking_deployments d
                LEFT JOIN intelligence.ranking_config_versions c ON c.config_version_id = d.config_version_id
                LEFT JOIN LATERAL (
                  SELECT version_tag, computed_at, window_days, min_sample, cohort_stats
                  FROM intelligence.cohort_stat_snapshots
                  WHERE (d.cohort_snapshot_id IS NOT NULL AND snapshot_id = d.cohort_snapshot_id)
                     OR (d.cohort_snapshot_id IS NULL)
                  ORDER BY computed_at DESC
                  LIMIT 1
                ) s ON true
                WHERE d.use_case = 'place_ranking' AND d.deactivated_at IS NULL
                LIMIT 1
                """);
        if (rows.isEmpty()) {
            RankingConfig fallback = RankingConfig.baseline();
            return new ActiveDeployment(
                    null, fallback.configVersionId(), null, null,
                    fallback, loadLatestCohortStats().orElse(CohortStats.empty()), null,
                    "UNVALIDATED", false, Instant.now(), "Default in-memory baseline"
            );
        }
        var row = rows.getFirst();
        UUID depId = (UUID) row.get("deployment_id");
        UUID cfgId = (UUID) row.get("config_version_id");
        UUID cohortId = (UUID) row.get("cohort_snapshot_id");
        UUID cfId = (UUID) row.get("cf_artifact_id");

        RankingConfig cfg;
        if (row.get("cfg_version_tag") != null) {
            Map<String, Object> cfgRow = new LinkedHashMap<>();
            cfgRow.put("config_version_id", cfgId);
            cfgRow.put("version_tag", row.get("cfg_version_tag"));
            cfgRow.put("weights", row.get("cfg_weights"));
            cfgRow.put("sub_params", row.get("cfg_sub_params"));
            cfgRow.put("scorer_versions", row.get("cfg_scorer_versions"));
            cfgRow.put("quality_status", row.get("cfg_quality_status"));
            cfg = mapConfig(cfgRow);
        } else {
            cfg = RankingConfig.baseline();
        }

        CohortStats cohorts;
        if (row.get("cohort_version_tag") != null) {
            Map<String, Object> cohortRow = new LinkedHashMap<>();
            cohortRow.put("version_tag", row.get("cohort_version_tag"));
            cohortRow.put("computed_at", row.get("cohort_computed_at"));
            cohortRow.put("window_days", row.get("cohort_window_days"));
            cohortRow.put("min_sample", row.get("cohort_min_sample"));
            cohortRow.put("cohort_stats", row.get("cohort_stats_json"));
            cohorts = mapCohortStats(cohortRow);
        } else {
            cohorts = CohortStats.empty();
        }

        CfArtifactData cf = cfId != null ? loadCfArtifactSafe(cfId) : null;

        return new ActiveDeployment(
                depId, cfgId, cohortId, cfId, cfg, cohorts, cf,
                String.valueOf(row.get("dep_quality_status")),
                Boolean.TRUE.equals(row.get("is_demo_activation")),
                ((Timestamp) row.get("activated_at")).toInstant(),
                String.valueOf(row.get("reason"))
        );
    }

    public Optional<RankingConfig> loadConfig(UUID configId) {
        var rows = db.queryForList("select * from intelligence.ranking_config_versions where config_version_id = ?", configId);
        if (rows.isEmpty()) return Optional.empty();
        return Optional.of(mapConfig(rows.getFirst()));
    }

    public RankingConfig mapConfig(Map<String, Object> row) {
        JsonNode w = read(row.get("weights"));
        JsonNode s = read(row.get("sub_params"));
        JsonNode sv = read(row.get("scorer_versions"));
        Map<String, String> versions = new LinkedHashMap<>(RankingConfig.defaultScorerVersions());
        sv.fields().forEachRemaining(e -> versions.put(e.getKey(), e.getValue().asText()));

        UnknownPricePolicy upp = "ALLOW".equalsIgnoreCase(s.path("unknown_price_policy").asText("EXCLUDE"))
                ? UnknownPricePolicy.ALLOW : UnknownPricePolicy.EXCLUDE;

        return new RankingConfig(
                (UUID) row.get("config_version_id"),
                String.valueOf(row.get("version_tag")),
                w.path("basic").asDouble(0.20),
                w.path("content").asDouble(0.45),
                w.path("collaborative").asDouble(0.10),
                w.path("context").asDouble(0.25),
                s.path("rating_m").asDouble(10.0),
                s.path("rating_weight").asDouble(0.60),
                s.path("popularity_weight").asDouble(0.40),
                s.path("popularity_window_days").asInt(30),
                s.path("min_observation_days").asInt(7),
                s.path("cohort_min_sample").asInt(5),
                s.path("distance_scale_km").asDouble(5.0),
                s.path("distance_weight").asDouble(0.70),
                s.path("weather_weight").asDouble(0.30),
                s.path("use_max_distance_as_scale").asBoolean(false),
                s.path("cf_lambda").asDouble(10.0),
                s.path("cf_top_k").asInt(100),
                s.path("cf_history_limit").asInt(50),
                s.path("cf_favorite_weight").asDouble(3.0),
                s.path("cf_trip_weight").asDouble(5.0),
                s.path("candidate_cap").asInt(1000),
                s.path("top_n_default").asInt(10),
                s.path("top_n_max").asInt(50),
                s.path("diversity_enabled").asBoolean(false),
                upp,
                versions,
                String.valueOf(row.get("quality_status"))
        );
    }

    public Optional<CohortStats> loadCohortStats(UUID snapshotId) {
        var rows = db.queryForList("select * from intelligence.cohort_stat_snapshots where snapshot_id = ?", snapshotId);
        if (rows.isEmpty()) return Optional.empty();
        return Optional.of(mapCohortStats(rows.getFirst()));
    }

    public Optional<CohortStats> loadLatestCohortStats() {
        var rows = db.queryForList("select * from intelligence.cohort_stat_snapshots order by computed_at desc limit 1");
        if (rows.isEmpty()) return Optional.empty();
        return Optional.of(mapCohortStats(rows.getFirst()));
    }

    private CohortStats mapCohortStats(Map<String, Object> row) {
        JsonNode node = read(row.get("cohort_stats"));
        Map<String, CohortStatEntry> entries = new LinkedHashMap<>();
        node.fields().forEachRemaining(e -> {
            JsonNode v = e.getValue();
            Double mu = v.hasNonNull("rating_prior_mu") ? v.path("rating_prior_mu").asDouble() : null;
            int rSample = v.path("rating_sample_size").asInt(0);
            Double p95 = v.hasNonNull("popularity_p95_ref") ? v.path("popularity_p95_ref").asDouble() : null;
            int pSample = v.path("popularity_sample_size").asInt(0);
            entries.put(e.getKey(), new CohortStatEntry(e.getKey(), mu, rSample, p95, pSample));
        });
        return new CohortStats(
                String.valueOf(row.get("version_tag")),
                ((Timestamp) row.get("computed_at")).toInstant(),
                ((Number) row.get("window_days")).intValue(),
                ((Number) row.get("min_sample")).intValue(),
                entries
        );
    }

    public CfArtifactData loadCfArtifactSafe(UUID artifactId) {
        var rows = db.queryForList("select * from intelligence.cf_artifacts where artifact_id = ?", artifactId);
        if (rows.isEmpty()) return null;
        var row = rows.getFirst();
        String status = String.valueOf(row.get("lifecycle_status"));
        if ("REVOKED".equals(status)) return null;
        try {
            String key = String.valueOf(row.get("artifact_object_key"));
            String checksum = String.valueOf(row.get("checksum"));
            JsonNode content = read(artifacts.read(key, checksum));
            Set<UUID> supported = new HashSet<>();
            content.path("supported_items").forEach(n -> supported.add(UUID.fromString(n.asText())));
            Map<UUID, List<CfNeighbor>> neighbors = new HashMap<>();
            content.path("neighbors").fields().forEachRemaining(e -> {
                UUID item = UUID.fromString(e.getKey());
                List<CfNeighbor> list = new ArrayList<>();
                for (JsonNode n : e.getValue()) {
                    list.add(new CfNeighbor(
                            UUID.fromString(n.path("neighbor_place_id").asText()),
                            n.path("adjusted_similarity").asDouble(),
                            n.path("raw_cosine").asDouble(),
                            n.path("common_users").asInt()
                    ));
                }
                neighbors.put(item, List.copyOf(list));
            });
            JsonNode params = read(row.get("params"));
            return new CfArtifactData(
                    artifactId,
                    String.valueOf(row.get("version_tag")),
                    checksum,
                    ((Timestamp) row.get("cutoff_at")).toInstant(),
                    params.path("lambda").asDouble(10.0),
                    params.path("top_k").asInt(100),
                    Set.copyOf(supported),
                    Collections.unmodifiableMap(neighbors),
                    Set.of("VALIDATED", "ACTIVE").contains(status)
            );
        } catch (Exception ex) {
            // Corrupt checksum or missing artifact -> safely mark unavailable so Hybrid degrades gracefully
            return new CfArtifactData(
                    artifactId,
                    String.valueOf(row.get("version_tag")),
                    String.valueOf(row.get("checksum")),
                    ((Timestamp) row.get("cutoff_at")).toInstant(),
                    10.0, 100, Set.of(), Map.of(), false
            );
        }
    }

    /** Load distinct active user popularity counts per place over the configured window (default 30d). */
    public Map<UUID, Long> loadActivePopularityCounts(int windowDays) {
        // State semantics: count distinct users whose latest favorite state is FAVORITE_ADDED OR who have TRIP_ITEM_ADDED in window.
        Map<UUID, Long> counts = new HashMap<>();
        db.query("""
                WITH recent AS (
                  SELECT user_id, place_id, event_type, occurred_at,
                         ROW_NUMBER() OVER (PARTITION BY user_id, place_id, CASE WHEN event_type IN ('FAVORITE_ADDED','FAVORITE_REMOVED') THEN 'FAV' ELSE 'TRIP' END ORDER BY occurred_at DESC, interaction_id DESC) AS rn
                  FROM intelligence.interactions
                  WHERE user_id IS NOT NULL
                    AND place_id IS NOT NULL
                    AND event_type IN ('FAVORITE_ADDED','FAVORITE_REMOVED','TRIP_ITEM_ADDED')
                    AND occurred_at >= now() - (? || ' days')::interval
                ),
                active_pairs AS (
                  SELECT DISTINCT user_id, place_id
                  FROM recent
                  WHERE rn = 1 AND event_type IN ('FAVORITE_ADDED','TRIP_ITEM_ADDED')
                )
                SELECT place_id, COUNT(DISTINCT user_id) AS cnt
                FROM active_pairs
                GROUP BY place_id
                """, rs -> {
            counts.put(rs.getObject(1, UUID.class), rs.getLong(2));
        }, windowDays);
        return counts;
    }

    public boolean isPopularityPipelineActive() {
        Integer count = db.queryForObject("""
                SELECT COUNT(*) FROM intelligence.interactions
                WHERE event_type IN ('FAVORITE_ADDED','FAVORITE_REMOVED','TRIP_ITEM_ADDED')
                """, Integer.class);
        return count != null && count > 0;
    }

    public Set<UUID> loadInactiveCategories() {
        if (cacheTtlNanos > 0) {
            TimedValue<Set<UUID>> cached = inactiveCategoriesCache;
            if (cached != null && cached.isFresh()) {
                return cached.value();
            }
        }
        Set<UUID> fresh = Set.copyOf(db.query(
                "select aggregate_id from intelligence.projection_versions where stream='category' and payload->>'active'='false'",
                (rs, i) -> rs.getObject(1, UUID.class)
        ));
        if (cacheTtlNanos > 0) {
            inactiveCategoriesCache = new TimedValue<>(fresh, System.nanoTime() + cacheTtlNanos);
        }
        return fresh;
    }

    /** Load all published place projections enriched with active 30d unique-user popularity counts in a single DB round-trip. */
    public List<PlaceSnapshot> loadPublishedPlaceSnapshots(int popularityWindowDays) {
        if (cacheTtlNanos > 0) {
            TimedValue<List<PlaceSnapshot>> cached = publishedPlacesCache.get(popularityWindowDays);
            if (cached != null && cached.isFresh()) {
                return cached.value();
            }
        }
        List<PlaceSnapshot> result = new ArrayList<>();
        db.query("""
                WITH recent AS (
                  SELECT user_id, place_id, event_type, occurred_at,
                         ROW_NUMBER() OVER (
                           PARTITION BY user_id, place_id,
                                        CASE WHEN event_type IN ('FAVORITE_ADDED','FAVORITE_REMOVED') THEN 'FAV' ELSE 'TRIP' END
                           ORDER BY occurred_at DESC, interaction_id DESC
                         ) AS rn
                  FROM intelligence.interactions
                  WHERE user_id IS NOT NULL
                    AND place_id IS NOT NULL
                    AND event_type IN ('FAVORITE_ADDED','FAVORITE_REMOVED','TRIP_ITEM_ADDED')
                    AND occurred_at >= now() - (? || ' days')::interval
                ),
                active_pairs AS (
                  SELECT DISTINCT user_id, place_id
                  FROM recent
                  WHERE rn = 1 AND event_type IN ('FAVORITE_ADDED','TRIP_ITEM_ADDED')
                ),
                pop AS (
                  SELECT place_id, COUNT(DISTINCT user_id) AS cnt
                  FROM active_pairs
                  GROUP BY place_id
                ),
                pipeline AS (
                  SELECT EXISTS (
                    SELECT 1 FROM intelligence.interactions
                    WHERE event_type IN ('FAVORITE_ADDED','FAVORITE_REMOVED','TRIP_ITEM_ADDED')
                  ) AS active
                )
                SELECT pf.place_id, pf.catalog_version, pf.rating_version, pf.status, pf.features, pf.as_of,
                       COALESCE(pop.cnt, 0) AS pop_cnt, pipeline.active AS pipeline_active
                FROM intelligence.place_features pf
                LEFT JOIN pop ON pop.place_id = pf.place_id
                CROSS JOIN pipeline
                WHERE pf.status = 'PUBLISHED'
                ORDER BY pf.place_id
                """, rs -> {
            UUID id = rs.getObject(1, UUID.class);
            long catVer = rs.getLong(2);
            long ratVer = rs.getLong(3);
            String status = rs.getString(4);
            JsonNode f = read(rs.getString(5));
            Instant asOf = rs.getTimestamp(6).toInstant();
            long popCnt = rs.getLong(7);
            boolean pipelineActive = rs.getBoolean(8);
            result.add(toPlaceSnapshot(id, catVer, ratVer, status, f, asOf, popCnt, pipelineActive));
        }, popularityWindowDays);
        List<PlaceSnapshot> immutable = List.copyOf(result);
        if (cacheTtlNanos > 0) {
            publishedPlacesCache.put(popularityWindowDays, new TimedValue<>(immutable, System.nanoTime() + cacheTtlNanos));
        }
        return immutable;
    }

    public PlaceSnapshot toPlaceSnapshot(
            UUID id, long catalogVersion, long ratingVersion, String status,
            JsonNode f, Instant asOf, long popUsers30d, boolean popPipelineActive
    ) {
        Set<UUID> catIds = new LinkedHashSet<>();
        f.path("category_ids").forEach(n -> parseUuid(n.asText()).ifPresent(catIds::add));

        UUID geoId = parseUuid(f.path("geographic_unit_id").asText(null)).orElse(null);

        Set<UUID> destIds = new LinkedHashSet<>();
        parseUuid(f.path("destination_id").asText(null)).ifPresent(destIds::add);
        f.path("destination_ids").forEach(n -> parseUuid(n.asText()).ifPresent(destIds::add));

        Set<String> structuredTags = new LinkedHashSet<>();
        f.path("tag_ids").forEach(n -> addNorm(structuredTags, n.asText()));
        f.path("tags").forEach(n -> addNorm(structuredTags, n.asText()));
        f.path("amenity_ids").forEach(n -> addNorm(structuredTags, "amenity:" + n.asText()));
        f.path("amenities").forEach(n -> addNorm(structuredTags, n.asText()));
        f.path("structured_tags").forEach(n -> addNorm(structuredTags, n.asText()));

        // Extract deterministic structured experience tags from explicit structured fields only (no NLP/vector)
        Set<String> confirmedAbsent = new LinkedHashSet<>();
        f.path("absent_tags").forEach(n -> addNorm(confirmedAbsent, n.asText()));

        Double priceMin = parseDoubleOrNull(f.hasNonNull("price_min") ? f.path("price_min") : f.path("price"));
        Double priceMax = parseDoubleOrNull(f.path("price_max"));
        String currency = f.hasNonNull("currency") ? f.path("currency").asText("VND") : "VND";
        BudgetBasis basis = parseBasis(f.path("price_basis").asText(null));

        Double lat = parseDoubleOrNull(f.path("latitude"));
        Double lon = parseDoubleOrNull(f.path("longitude"));

        long ratingCount = f.path("rating_count").asLong(0L);
        double ratingSum = f.path("rating_sum").asDouble(0.0);
        if (ratingCount == 0 && f.hasNonNull("review_count") && f.hasNonNull("rating_avg")) {
            long rc = f.path("review_count").asLong(0L);
            double ra = f.path("rating_avg").asDouble(Double.NaN);
            if (rc > 0 && Double.isFinite(ra) && ra >= 1.0 && ra <= 5.0) {
                ratingCount = rc;
                ratingSum = rc * ra;
            }
        }

        // If popularity pipeline has no server interaction events yet, also respect explicit numeric popularity projection only for legacy compatibility
        long effectivePop = popUsers30d;
        boolean effectivePipeActive = popPipelineActive;
        if (!popPipelineActive && f.hasNonNull("popularity") && f.path("popularity").asDouble(0.0) > 0.0) {
            effectivePop = Math.round(f.path("popularity").asDouble(0.0));
            effectivePipeActive = true;
        }

        SpaceType space = parseSpace(f);
        List<OpeningShift> shifts = parseOpeningHours(f.path("opening_hours"));
        Instant firstObserved = f.hasNonNull("created_at") ? parseInstantOrNull(f.path("created_at").asText()) : asOf;
        UUID sourceId = parseUuid(f.path("source_id").asText(null)).orElse(null);

        return new PlaceSnapshot(
                id, catalogVersion, ratingVersion, status,
                f.path("name").asText(""),
                f.hasNonNull("name_en") ? f.path("name_en").asText() : null,
                f.hasNonNull("address") ? f.path("address").asText() : null,
                f.hasNonNull("description") ? f.path("description").asText() : null,
                Set.copyOf(catIds),
                geoId,
                Set.copyOf(destIds),
                Set.copyOf(structuredTags),
                Set.copyOf(confirmedAbsent),
                priceMin, priceMax, currency, basis,
                lat, lon,
                ratingCount, ratingSum,
                effectivePop, effectivePipeActive,
                space, shifts,
                firstObserved != null ? firstObserved : asOf,
                asOf,
                sourceId
        );
    }

    public UserContext loadUserContext(UUID userId, boolean allowPersonalization) {
        if (userId == null) return UserContext.guest();
        Optional<JsonNode> profileOpt = projections.profile(userId);
        if (profileOpt.isEmpty() || !allowPersonalization) {
            return new UserContext(userId, true, false, null, Set.of(), Set.of(), List.of());
        }
        JsonNode profile = profileOpt.get();
        long consentVersion = profile.path("consent_version").asLong(0L);
        Set<UUID> catIds = new LinkedHashSet<>();
        profile.path("category_ids").forEach(n -> parseUuid(n.asText()).ifPresent(catIds::add));

        Set<String> prefTags = new LinkedHashSet<>();
        profile.path("tags").forEach(n -> addNorm(prefTags, n.asText()));
        profile.path("travel_style_ids").forEach(n -> addNorm(prefTags, "style:" + n.asText()));
        profile.path("food_preference_ids").forEach(n -> addNorm(prefTags, "food:" + n.asText()));

        // Load active positive history (FAVORITE_ADDED not later removed, TRIP_ITEM_ADDED) respecting consent
        Map<UUID, boolean[]> stateByPlace = new LinkedHashMap<>();
        Map<UUID, Instant> latestByPlace = new HashMap<>();

        db.query("""
                SELECT place_id, event_type, occurred_at
                FROM intelligence.interactions
                WHERE user_id = ?
                  AND place_id IS NOT NULL
                  AND event_type IN ('FAVORITE_ADDED','FAVORITE_REMOVED','TRIP_ITEM_ADDED')
                ORDER BY occurred_at ASC, interaction_id ASC
                """, rs -> {
            UUID pid = rs.getObject(1, UUID.class);
            String type = rs.getString(2);
            Instant at = rs.getTimestamp(3).toInstant();
            boolean[] flags = stateByPlace.computeIfAbsent(pid, k -> new boolean[2]);
            switch (type) {
                case "FAVORITE_ADDED" -> flags[0] = true;
                case "FAVORITE_REMOVED" -> flags[0] = false;
                case "TRIP_ITEM_ADDED" -> flags[1] = true;
            }
            latestByPlace.merge(pid, at, (a, b) -> b.isAfter(a) ? b : a);
        }, userId);

        List<UserHistoryItem> history = new ArrayList<>();
        for (var e : stateByPlace.entrySet()) {
            boolean fav = e.getValue()[0];
            boolean trip = e.getValue()[1];
            if (fav || trip) {
                history.add(new UserHistoryItem(e.getKey(), fav, trip, latestByPlace.get(e.getKey())));
            }
        }

        return new UserContext(userId, true, true, consentVersion, Set.copyOf(catIds), Set.copyOf(prefTags), List.copyOf(history));
    }

    public Map<String, Object> loadPublicStats() {
        Integer publishedPlaces = db.queryForObject(
                "SELECT COUNT(*) FROM intelligence.place_features WHERE status = 'PUBLISHED'", Integer.class);
        Integer destinations = db.queryForObject("""
                SELECT COUNT(DISTINCT dest)
                FROM intelligence.place_features,
                     LATERAL jsonb_array_elements_text(COALESCE(features->'destination_ids', '[]'::jsonb)) AS dest
                WHERE status = 'PUBLISHED'
                """, Integer.class);
        Integer geoUnits = db.queryForObject("""
                SELECT COUNT(DISTINCT features->>'geographic_unit_id')
                FROM intelligence.place_features
                WHERE status = 'PUBLISHED' AND features->>'geographic_unit_id' IS NOT NULL
                """, Integer.class);
        Integer categories = db.queryForObject("""
                SELECT COUNT(DISTINCT cat)
                FROM intelligence.place_features,
                     LATERAL jsonb_array_elements_text(COALESCE(features->'category_ids', '[]'::jsonb)) AS cat
                WHERE status = 'PUBLISHED'
                """, Integer.class);
        Timestamp maxAsOf = db.queryForObject(
                "SELECT MAX(as_of) FROM intelligence.place_features WHERE status = 'PUBLISHED'", Timestamp.class);
        ActiveDeployment active = loadActiveDeployment();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("published_places_count", publishedPlaces != null ? publishedPlaces : 0);
        out.put("destinations_count", destinations != null ? destinations : 0);
        out.put("geographic_units_count", geoUnits != null ? geoUnits : 0);
        out.put("categories_count", categories != null ? categories : 0);
        out.put("data_as_of", maxAsOf != null ? maxAsOf.toInstant().toString() : null);
        out.put("active_config_version", active.config().versionTag());
        out.put("quality_status", active.qualityStatus());
        out.put("cf_active", active.cfArtifact() != null && active.cfArtifact().activeAndValid());
        return out;
    }

    private static Optional<UUID> parseUuid(String s) {
        if (s == null || s.isBlank()) return Optional.empty();
        try { return Optional.of(UUID.fromString(s.trim())); } catch (Exception e) { return Optional.empty(); }
    }

    private static void addNorm(Set<String> set, String raw) {
        String n = ContentScorer.normalizeKey(raw);
        if (!n.isBlank()) set.add(n);
    }

    private static Double parseDoubleOrNull(JsonNode n) {
        if (n == null || n.isNull() || n.isMissingNode()) return null;
        try {
            double v = n.isNumber() ? n.asDouble() : Double.parseDouble(n.asText().trim());
            return Double.isFinite(v) ? v : null;
        } catch (Exception e) {
            return null;
        }
    }

    private static BudgetBasis parseBasis(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try { return BudgetBasis.valueOf(raw.trim().toUpperCase(Locale.ROOT)); } catch (Exception e) { return null; }
    }

    private static SpaceType parseSpace(JsonNode f) {
        for (String key : List.of("space_type", "indoor_outdoor", "environment")) {
            if (f.hasNonNull(key)) {
                String v = f.path(key).asText("").trim().toUpperCase(Locale.ROOT);
                if (v.equals("INDOOR")) return SpaceType.INDOOR;
                if (v.equals("OUTDOOR")) return SpaceType.OUTDOOR;
                if (v.equals("BOTH")) return SpaceType.BOTH;
            }
        }
        return SpaceType.UNKNOWN;
    }

    private static List<OpeningShift> parseOpeningHours(JsonNode node) {
        if (node == null || !node.isArray() || node.isEmpty()) return List.of();
        List<OpeningShift> shifts = new ArrayList<>();
        for (JsonNode entry : node) {
            Integer open = parseMinutes(entry.path("open").asText(entry.path("open_time").asText(null)));
            Integer close = parseMinutes(entry.path("close").asText(entry.path("close_time").asText(null)));
            if (open != null && close != null) {
                int weekday = entry.path("weekday").asInt(-1);
                boolean overnight = entry.path("overnight").asBoolean(false);
                shifts.add(new OpeningShift(weekday, open, close, overnight));
            }
        }
        return List.copyOf(shifts);
    }

    private static Integer parseMinutes(String hhmm) {
        if (hhmm == null || hhmm.isBlank()) return null;
        String[] parts = hhmm.trim().split(":");
        if (parts.length < 2) return null;
        try {
            int h = Integer.parseInt(parts[0]);
            int m = Integer.parseInt(parts[1]);
            if (h < 0 || h > 24 || m < 0 || m > 59) return null;
            return h * 60 + m;
        } catch (Exception e) {
            return null;
        }
    }

    private static Instant parseInstantOrNull(String raw) {
        if (raw == null || raw.isBlank()) return null;
        try { return Instant.parse(raw); } catch (Exception e) { return null; }
    }
}
