package vn.smarttravel.intelligence.ranking.service;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import vn.smarttravel.intelligence.projections.service.ProjectionService;
import vn.smarttravel.intelligence.ranking.domain.*;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;
import vn.smarttravel.intelligence.ranking.repository.RankingDataRepository;
import vn.smarttravel.intelligence.ranking.repository.RankingDataRepository.ActiveDeployment;
import vn.smarttravel.intelligence.ranking.repository.RankingServingRepository;
import vn.smarttravel.intelligence.ranking.repository.RankingServingRepository.ResultRow;
import vn.smarttravel.intelligence.recommendations.client.DependencyClient;
import vn.smarttravel.intelligence.shared.http.RecommendationDeadline;

/**
 * End-to-end online Recommendation Ranking service:
 * Validate -> Principal -> Consent -> Pin Deployment Snapshot -> Hard Filters ->
 * B/C/F/X Independent Scoring -> Hybrid Combine -> Stable Sort -> Final Catalog Batch Visibility ->
 * Persist Request/Results/Telemetry -> Return Public or Admin Debug response.
 */
@Service
public class RankingServingService {

    private static final Set<String> ALLOWED_REQUEST_FIELDS = Set.of(
            "topN", "currency", "budget_basis", "destination_id", "geographic_unit_id",
            "expanded_geo_unit_ids", "category_ids", "hard_tags", "soft_preferences",
            "budget", "min_budget", "max_budget", "min_rating", "space_type",
            "latitude", "longitude", "radius_m", "origin", "max_distance_km",
            "visit_time", "visit_day_of_week", "visit_start_at", "timezone",
            "exclude_closed", "include_unknown_price", "personalization", "session_id"
    );

    private static final Map<String, int[]> VISIT_SLOTS = Map.of(
            "MORNING", new int[]{360, 660},
            "NOON", new int[]{660, 840},
            "AFTERNOON", new int[]{840, 1080},
            "EVENING", new int[]{1080, 1380}
    );

    private final RankingServingRepository servingRepo;
    private final RankingDataRepository data;
    private final ProjectionService projections;
    private final DependencyClient dependencies;
    private final HybridRankingEngine engine;

    public RankingServingService(
            RankingServingRepository servingRepo,
            RankingDataRepository data,
            ProjectionService projections,
            DependencyClient dependencies,
            OpenMeteoWeatherAdapter weatherAdapter
    ) {
        this.servingRepo = servingRepo;
        this.data = data;
        this.projections = projections;
        this.dependencies = dependencies;
        this.engine = new HybridRankingEngine(
                new HardConstraintFilter(),
                new BasicScorer(),
                new ContentScorer(),
                new CollaborativeScorer(),
                new ContextScorer(weatherAdapter),
                new ExplanationBuilder()
        );
    }

    public Map<String, Object> loadPublicStats() {
        return data.loadPublicStats();
    }

    @Transactional
    public Map<String, Object> rankPublic(UUID userId, JsonNode input) {
        long startNanos = System.nanoTime();
        try (var budget = RecommendationDeadline.start()) {
            servingRepo.setRequestTimeouts();
            if (userId != null) projections.userLock(userId);

            // Pin active deployment ONCE per request so config/cohort/CF never mix mid-request
            ActiveDeployment deployment = data.loadActiveDeployment();
            RankingRequest request = parseAndValidateRequest(input, deployment.config());
            boolean allowPersonalization = !"OFF".equalsIgnoreCase(input.path("personalization").asText("AUTO"));
            UserContext user = data.loadUserContext(userId, allowPersonalization);

            List<PlaceSnapshot> allPlaces = data.loadPublishedPlaceSnapshots(deployment.config().popularityWindowDays());
            Set<UUID> inactiveCats = data.loadInactiveCategories();

            RankingOutput output = engine.rank(
                    allPlaces, user, request, deployment.config(),
                    deployment.cohortStats(), deployment.cfArtifact(), inactiveCats
            );

            // Final Catalog batch visibility check within single deadline budget (refill from reserve candidates)
            List<RankedCandidate> verified = new ArrayList<>();
            int visibilityRejected = 0;
            int pageSize = Math.min(100, Math.max(request.topN() + 10, 20));
            List<RankedCandidate> ranked = output.ranked();
            for (int start = 0; start < ranked.size() && verified.size() < request.topN(); start += pageSize) {
                RecommendationDeadline.remaining();
                var page = ranked.subList(start, Math.min(start + pageSize, ranked.size()));
                Map<UUID, Long> visible = dependencies.visible(page.stream().map(c -> c.place().placeId()).toList());
                for (RankedCandidate rc : page) {
                    Long liveVer = visible.get(rc.place().placeId());
                    if (liveVer != null && liveVer >= rc.place().catalogVersion()) {
                        if (verified.size() < request.topN()) {
                            verified.add(reRank(rc, verified.size() + 1));
                        }
                    } else {
                        visibilityRejected++;
                    }
                }
            }

            int latencyMs = (int) Math.max(0, (System.nanoTime() - startNanos) / 1_000_000L);
            UUID requestId = UUID.randomUUID();
            UUID sessionId = parseOptionalUuid(input.path("session_id")).orElseGet(UUID::randomUUID);
            boolean partial = verified.size() < request.topN() && output.passedHardFilters() > verified.size();
            String emptyReason = verified.isEmpty()
                    ? (output.emptyReason() != null ? output.emptyReason()
                    : (visibilityRejected > 0 ? "ALL_CANDIDATES_HIDDEN_AT_FINAL_CHECK" : "NO_MATCHING_CANDIDATES"))
                    : null;

            Map<String, Object> scorerAvailability = summarizeAvailability(verified);
            Map<String, Object> avgWeights = summarizeEffectiveWeights(verified);
            Map<String, Object> debugPayload = buildDebugPayload(request, output, verified, deployment, visibilityRejected, latencyMs);

            String mode = output.fallbackUsed() ? "FALLBACK" : "BASIC";
            List<Map<String, Object>> publicResults = new ArrayList<>(verified.size());
            if (verified.isEmpty()) {
                servingRepo.insertEmptyRecommendationRequest(
                        requestId,
                        user.personalizationConsent() ? user.userId() : null,
                        sessionId,
                        mode,
                        "hybrid-v1:" + deployment.config().versionTag(),
                        json(input),
                        request.topN(),
                        latencyMs,
                        output.fallbackReason(),
                        deployment.configVersionId(),
                        deployment.deploymentId(),
                        output.degraded() || partial,
                        json(output.degradedReasons()),
                        output.passedHardFilters(),
                        json(scorerAvailability),
                        json(avgWeights),
                        emptyReason,
                        json(debugPayload)
                );
            } else {
                List<ResultRow> resultRows = new ArrayList<>(verified.size());
                for (RankedCandidate rc : verified) {
                    Map<String, Object> explanationStore = new LinkedHashMap<>();
                    explanationStore.put("reason_codes", rc.reasonCodes());
                    explanationStore.put("reasons_vi", rc.reasonsVi());
                    explanationStore.put("reasons_en", rc.reasonsEn());
                    explanationStore.put("summary_vi", rc.summaryVi());
                    explanationStore.put("summary_en", rc.summaryEn());

                    resultRows.add(new ResultRow(
                            rc.place().placeId(),
                            rc.rank(),
                            rc.finalScore(),
                            json(explanationStore),
                            rc.place().catalogVersion()
                    ));
                    publicResults.add(toPublicItem(rc));
                }
                servingRepo.insertRecommendationRequestAndResults(
                        requestId,
                        user.personalizationConsent() ? user.userId() : null,
                        sessionId,
                        mode,
                        "hybrid-v1:" + deployment.config().versionTag(),
                        json(input),
                        request.topN(),
                        latencyMs,
                        output.fallbackReason(),
                        deployment.configVersionId(),
                        deployment.deploymentId(),
                        output.degraded() || partial,
                        json(output.degradedReasons()),
                        output.passedHardFilters(),
                        verified.size(),
                        json(scorerAvailability),
                        json(avgWeights),
                        emptyReason,
                        json(debugPayload),
                        resultRows
                );
            }

            Map<String, Object> response = new LinkedHashMap<>();
            response.put("recommendation_request_id", requestId);
            response.put("request_id", requestId);
            response.put("algorithm_version", deployment.config().scorerVersions().getOrDefault("hybrid", "hybrid_v1"));
            response.put("ranking_config_version", deployment.config().versionTag());
            response.put("scorer_versions", deployment.config().scorerVersions());
            response.put("model_versions", Map.of(
                    "cohort_snapshot", deployment.cohortStats().snapshotVersion(),
                    "cf_artifact", deployment.cfArtifact() != null ? deployment.cfArtifact().versionTag() : "UNAVAILABLE"
            ));
            response.put("quality_status", deployment.qualityStatus());
            response.put("data_as_of", output.dataAsOf().toString());
            response.put("fallback", output.fallbackUsed());
            response.put("fallback_reason", output.fallbackReason());
            response.put("degraded", output.degraded() || partial);
            response.put("degraded_reasons", output.degradedReasons());
            response.put("partial", partial);
            response.put("empty_reason", emptyReason);
            response.put("personalized", user.personalizationConsent() && !output.fallbackUsed());
            response.put("analytics_allowed", user.personalizationConsent());
            response.put("candidate_count", output.passedHardFilters());
            response.put("total_returned", verified.size());
            response.put("results", publicResults);
            return response;
        }
    }

    /** Admin playground execution: never pollutes user analytics (is_admin_test=true), supports config A/B comparison. */
    @Transactional(readOnly = true)
    public Map<String, Object> runAdminPlayground(UUID adminId, JsonNode body) {
        projections.guardActor(adminId);
        JsonNode reqNode = body.has("request") ? body.path("request") : body;
        UUID configAId = parseOptionalUuid(body.path("config_version_id")).orElse(null);
        UUID configBId = parseOptionalUuid(body.path("compare_config_version_id")).orElse(null);
        UUID cfArtifactId = parseOptionalUuid(body.path("cf_artifact_id")).orElse(null);
        UUID simulateUserId = parseOptionalUuid(body.path("simulate_user_id")).orElse(null);

        ActiveDeployment active = data.loadActiveDeployment();
        RankingConfig configA = configAId != null ? data.loadConfig(configAId).orElseThrow(() -> bad("CONFIG_NOT_FOUND")) : active.config();
        CohortStats cohorts = active.cohortStats();
        CfArtifactData cf = cfArtifactId != null ? data.loadCfArtifactSafe(cfArtifactId) : active.cfArtifact();

        RankingRequest request = parseAndValidateRequest(reqNode, configA);
        UserContext user = simulateUserId != null ? data.loadUserContext(simulateUserId, true) : UserContext.guest();
        List<PlaceSnapshot> places = data.loadPublishedPlaceSnapshots(configA.popularityWindowDays());
        Set<UUID> inactiveCats = data.loadInactiveCategories();

        long t0 = System.nanoTime();
        RankingOutput outA = engine.rank(places, user, request, configA, cohorts, cf, inactiveCats);
        int latA = (int) ((System.nanoTime() - t0) / 1_000_000L);
        List<RankedCandidate> topA = outA.ranked().subList(0, Math.min(request.topN(), outA.ranked().size()));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("is_admin_test", true);
        result.put("primary", buildDebugPayload(request, outA, topA, new ActiveDeployment(
                active.deploymentId(), configA.configVersionId(), active.cohortSnapshotId(),
                cf != null ? cf.artifactId() : null, configA, cohorts, cf,
                configA.qualityStatus(), active.demoActivation(), active.activatedAt(), "Admin Playground"
        ), 0, latA));

        if (configBId != null) {
            RankingConfig configB = data.loadConfig(configBId).orElseThrow(() -> bad("COMPARE_CONFIG_NOT_FOUND"));
            long t1 = System.nanoTime();
            RankingOutput outB = engine.rank(places, user, request, configB, cohorts, cf, inactiveCats);
            int latB = (int) ((System.nanoTime() - t1) / 1_000_000L);
            List<RankedCandidate> topB = outB.ranked().subList(0, Math.min(request.topN(), outB.ranked().size()));
            result.put("comparison", buildDebugPayload(request, outB, topB, new ActiveDeployment(
                    null, configB.configVersionId(), active.cohortSnapshotId(),
                    cf != null ? cf.artifactId() : null, configB, cohorts, cf,
                    configB.qualityStatus(), false, Instant.now(), "Admin Playground Compare"
            ), 0, latB));
            result.put("rank_diff", computeRankDiff(topA, topB));
        }

        return result;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getRequestDebug(UUID adminId, UUID requestId) {
        projections.guardActor(adminId);
        var rows = servingRepo.findRequestDebug(requestId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "REQUEST_NOT_FOUND");
        var row = rows.getFirst();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("request_id", row.get("request_id"));
        out.put("created_at", ((Timestamp) row.get("created_at")).toInstant().toString());
        out.put("algorithm_version", row.get("algorithm_version"));
        out.put("latency_ms", row.get("latency_ms"));
        out.put("fallback_reason", row.get("fallback_reason"));
        out.put("degraded", row.get("degraded"));
        out.put("candidate_count", row.get("candidate_count"));
        out.put("returned_count", row.get("returned_count"));
        out.put("debug", row.get("debug_payload") != null ? read(row.get("debug_payload")) : Map.of());
        return out;
    }

    /** Record verified viewport impressions; backend enforces authoritative rank & result membership. */
    @Transactional
    public Map<String, Object> recordImpressions(UUID userId, JsonNode body) {
        fields(body, Set.of("items", "session_id"));
        JsonNode items = body.path("items");
        require(items.isArray() && !items.isEmpty() && items.size() <= 50, "INVALID_IMPRESSION_BATCH");

        UUID sessionId = parseOptionalUuid(body.path("session_id")).orElse(null);
        Optional<JsonNode> profile = userId != null ? projections.profile(userId) : Optional.empty();
        Long consentVersion = profile.map(p -> p.path("consent_version").asLong()).orElse(null);
        // Never persist user_id in behavioral telemetry when consent is missing
        UUID persistedUserId = profile.isPresent() ? userId : null;

        int accepted = 0;
        int duplicates = 0;
        List<Map<String, Object>> rejected = new ArrayList<>();

        for (JsonNode item : items) {
            try {
                fields(item, Set.of("idempotency_key", "recommendation_request_id", "place_id", "viewed_at"));
                String idemKey = item.path("idempotency_key").asText("");
                require(!idemKey.isBlank() && idemKey.length() <= 160, "INVALID_IDEMPOTENCY_KEY");
                UUID reqId = uuid(item, "recommendation_request_id");
                UUID placeId = uuid(item, "place_id");
                Instant viewedAt = time(item, "viewed_at");
                require(!viewedAt.isAfter(Instant.now().plusSeconds(60)) && !viewedAt.isBefore(Instant.now().minus(Duration.ofDays(7))), "INVALID_VIEWED_AT");

                // Verify item belonged to the actual persisted recommendation_results and read authoritative rank
                var resRows = servingRepo.findResultRankAndAdminFlag(reqId, placeId);
                require(!resRows.isEmpty(), "RESULT_ITEM_NOT_FOUND");
                int authoritativeRank = ((Number) resRows.getFirst().get("rank")).intValue();
                boolean isAdminTest = Boolean.TRUE.equals(resRows.getFirst().get("is_admin_test"));

                int inserted = servingRepo.insertImpression(
                        UUID.randomUUID(), idemKey, reqId, placeId, authoritativeRank,
                        persistedUserId, sessionId, consentVersion, isAdminTest, viewedAt
                );
                if (inserted > 0) accepted++; else duplicates++;
            } catch (ResponseStatusException ex) {
                rejected.add(Map.of("code", Objects.requireNonNullElse(ex.getReason(), "INVALID_IMPRESSION")));
            }
        }
        return Map.of("accepted", accepted, "duplicates", duplicates, "rejected", rejected);
    }

    /** Record click / accept / skip attribution; never mutates popularity counts (owner events are authoritative). */
    @Transactional
    public Map<String, Object> recordFeedback(UUID userId, JsonNode body) {
        fields(body, Set.of("idempotency_key", "recommendation_request_id", "place_id", "action_type", "occurred_at", "session_id"));
        String idemKey = body.path("idempotency_key").asText("");
        require(!idemKey.isBlank() && idemKey.length() <= 160, "INVALID_IDEMPOTENCY_KEY");
        UUID reqId = uuid(body, "recommendation_request_id");
        UUID placeId = uuid(body, "place_id");
        String action = body.path("action_type").asText("");
        require(Set.of("CLICK", "ACCEPT", "SKIP", "ADD_TO_TRIP_CLICK", "FAVORITE_CLICK").contains(action), "INVALID_ACTION_TYPE");
        Instant occurredAt = body.hasNonNull("occurred_at") ? time(body, "occurred_at") : Instant.now();
        UUID sessionId = parseOptionalUuid(body.path("session_id")).orElse(null);

        var resRows = servingRepo.findResultRankAndAdminFlag(reqId, placeId);
        require(!resRows.isEmpty(), "RESULT_ITEM_NOT_FOUND");
        int authoritativeRank = ((Number) resRows.getFirst().get("rank")).intValue();
        boolean isAdminTest = Boolean.TRUE.equals(resRows.getFirst().get("is_admin_test"));

        Optional<JsonNode> profile = userId != null ? projections.profile(userId) : Optional.empty();
        Long consentVersion = profile.map(p -> p.path("consent_version").asLong()).orElse(null);
        UUID persistedUserId = profile.isPresent() ? userId : null;

        int inserted = servingRepo.insertFeedback(
                UUID.randomUUID(), idemKey, reqId, placeId, authoritativeRank, action,
                persistedUserId, sessionId, consentVersion, isAdminTest, occurredAt
        );
        return Map.of("recorded", inserted > 0, "duplicate", inserted == 0, "authoritative_rank", authoritativeRank);
    }

    public RankingRequest parseAndValidateRequest(JsonNode input, RankingConfig config) {
        fields(input, ALLOWED_REQUEST_FIELDS);

        int topN = input.hasNonNull("topN") ? input.path("topN").asInt(-1) : config.topNDefault();
        require(topN >= 1 && topN <= config.topNMax(), "INVALID_TOP_N");

        String currency = input.hasNonNull("currency") ? input.path("currency").asText("") : "VND";
        require("VND".equalsIgnoreCase(currency), "UNSUPPORTED_CURRENCY");

        BudgetBasis basis = BudgetBasis.PER_PERSON;
        if (input.hasNonNull("budget_basis")) {
            try { basis = BudgetBasis.valueOf(input.path("budget_basis").asText().trim().toUpperCase(Locale.ROOT)); }
            catch (Exception e) { throw bad("INVALID_BUDGET_BASIS"); }
        }

        UUID destinationId = parseOptionalUuid(input.path("destination_id")).orElse(null);
        UUID geoId = parseOptionalUuid(input.path("geographic_unit_id")).orElse(null);
        Set<UUID> expandedGeoIds = new LinkedHashSet<>();
        if (geoId != null) expandedGeoIds.add(geoId);
        if (input.has("expanded_geo_unit_ids") && input.path("expanded_geo_unit_ids").isArray()) {
            require(input.path("expanded_geo_unit_ids").size() <= 100, "TOO_MANY_GEO_UNITS");
            for (JsonNode n : input.path("expanded_geo_unit_ids")) {
                expandedGeoIds.add(UUID.fromString(n.asText()));
            }
        }

        Set<UUID> categoryIds = new LinkedHashSet<>();
        if (input.has("category_ids") && !input.path("category_ids").isNull()) {
            require(input.path("category_ids").isArray() && input.path("category_ids").size() <= 100, "INVALID_CATEGORIES");
            for (JsonNode n : input.path("category_ids")) {
                try { categoryIds.add(UUID.fromString(n.asText())); }
                catch (Exception e) { throw bad("INVALID_CATEGORY"); }
            }
        }

        Set<String> hardTags = new LinkedHashSet<>();
        if (input.has("hard_tags") && !input.path("hard_tags").isNull()) {
            require(input.path("hard_tags").isArray() && input.path("hard_tags").size() <= 50, "INVALID_HARD_TAGS");
            for (JsonNode n : input.path("hard_tags")) {
                String k = ContentScorer.normalizeKey(n.asText(""));
                if (!k.isBlank()) hardTags.add(k);
            }
        }

        Map<String, Double> softPrefs = new LinkedHashMap<>();
        if (input.has("soft_preferences") && !input.path("soft_preferences").isNull()) {
            JsonNode sp = input.path("soft_preferences");
            if (sp.isArray()) {
                require(sp.size() <= 50, "TOO_MANY_SOFT_PREFERENCES");
                for (JsonNode n : sp) {
                    String k = ContentScorer.normalizeKey(n.asText(""));
                    if (!k.isBlank()) softPrefs.put(k, 1.0);
                }
            } else if (sp.isObject()) {
                require(sp.size() <= 50, "TOO_MANY_SOFT_PREFERENCES");
                sp.fields().forEachRemaining(e -> {
                    double w = e.getValue().asDouble(1.0);
                    require(Double.isFinite(w) && w > 0.0 && w <= 10.0, "INVALID_PREFERENCE_WEIGHT");
                    String k = ContentScorer.normalizeKey(e.getKey());
                    if (!k.isBlank()) softPrefs.put(k, w);
                });
            } else {
                throw bad("INVALID_SOFT_PREFERENCES");
            }
        }

        Double minBudget = null;
        if (input.hasNonNull("min_budget")) {
            require(input.path("min_budget").isNumber() && Double.isFinite(input.path("min_budget").asDouble()) && input.path("min_budget").asDouble() >= 0.0, "INVALID_MIN_BUDGET");
            minBudget = input.path("min_budget").asDouble();
        }
        Double maxBudget = null;
        JsonNode maxBudgetNode = input.hasNonNull("max_budget") ? input.path("max_budget") : input.path("budget");
        if (!maxBudgetNode.isMissingNode() && !maxBudgetNode.isNull()) {
            require(maxBudgetNode.isNumber() && Double.isFinite(maxBudgetNode.asDouble()) && maxBudgetNode.asDouble() >= 0.0, "INVALID_BUDGET");
            maxBudget = maxBudgetNode.asDouble();
        }
        if (minBudget != null && maxBudget != null) {
            require(minBudget <= maxBudget, "INVALID_BUDGET_RANGE");
        }

        Double minRating = null;
        if (input.hasNonNull("min_rating")) {
            double r = input.path("min_rating").asDouble(Double.NaN);
            require(Double.isFinite(r) && r >= 1.0 && r <= 5.0, "INVALID_MIN_RATING");
            minRating = r;
        }

        SpaceType space = null;
        if (input.hasNonNull("space_type") && !input.path("space_type").asText().isBlank()) {
            try { space = SpaceType.valueOf(input.path("space_type").asText().trim().toUpperCase(Locale.ROOT)); }
            catch (Exception e) { throw bad("INVALID_SPACE_TYPE"); }
        }

        // Origin coordinates (accepts either origin:{latitude,longitude} or legacy latitude/longitude)
        Double originLat = null;
        Double originLon = null;
        if (input.hasNonNull("origin")) {
            JsonNode o = input.path("origin");
            require(o.isObject() && o.hasNonNull("latitude") && o.hasNonNull("longitude"), "INVALID_ORIGIN");
            originLat = o.path("latitude").asDouble(Double.NaN);
            originLon = o.path("longitude").asDouble(Double.NaN);
        } else if (input.hasNonNull("latitude") || input.hasNonNull("longitude")) {
            require(input.hasNonNull("latitude") && input.hasNonNull("longitude"), "GEO_PAIR_REQUIRED");
            originLat = input.path("latitude").asDouble(Double.NaN);
            originLon = input.path("longitude").asDouble(Double.NaN);
        }
        if (originLat != null) {
            require(Double.isFinite(originLat) && Double.isFinite(originLon) && Math.abs(originLat) <= 90.0 && Math.abs(originLon) <= 180.0, "INVALID_LOCATION");
        }

        Double maxDistanceKm = null;
        if (input.hasNonNull("max_distance_km")) {
            require(originLat != null, "ORIGIN_REQUIRED_FOR_DISTANCE");
            double km = input.path("max_distance_km").asDouble(Double.NaN);
            require(Double.isFinite(km) && km > 0.0 && km <= 100.0, "INVALID_MAX_DISTANCE");
            maxDistanceKm = km;
        } else if (input.hasNonNull("radius_m")) {
            require(originLat != null, "INVALID_RADIUS");
            double m = input.path("radius_m").asDouble(Double.NaN);
            require(Double.isFinite(m) && m >= 1.0 && m <= 100_000.0, "INVALID_RADIUS");
            maxDistanceKm = m / 1000.0;
        }

        // Visit time & timezone validation
        String tz = input.hasNonNull("timezone") ? input.path("timezone").asText("Asia/Ho_Chi_Minh") : "Asia/Ho_Chi_Minh";
        ZoneId zoneId;
        try { zoneId = ZoneId.of(tz); } catch (Exception e) { throw bad("INVALID_TIMEZONE"); }

        String visitSlot = null;
        Integer visitDay = null;
        Integer visitStartMin = null;
        Integer visitEndMin = null;
        if (input.hasNonNull("visit_start_at") && !input.path("visit_start_at").asText().isBlank()) {
            try {
                ZonedDateTime zdt = OffsetDateTime.parse(input.path("visit_start_at").asText()).atZoneSameInstant(zoneId);
                visitDay = zdt.getDayOfWeek().getValue() % 7; // 0=Sun..6=Sat or 0..6
                visitStartMin = zdt.getHour() * 60 + zdt.getMinute();
                visitEndMin = Math.min(1440, visitStartMin + 60);
            } catch (Exception e) {
                throw bad("INVALID_VISIT_TIME");
            }
        } else if (input.hasNonNull("visit_time") && !input.path("visit_time").asText().isBlank()) {
            visitSlot = input.path("visit_time").asText().trim().toUpperCase(Locale.ROOT);
            int[] bounds = VISIT_SLOTS.get(visitSlot);
            require(bounds != null, "INVALID_VISIT_TIME_SLOT");
            visitStartMin = bounds[0];
            visitEndMin = bounds[1];
            if (input.hasNonNull("visit_day_of_week")) {
                int d = input.path("visit_day_of_week").asInt(-1);
                require(d >= 0 && d <= 6, "INVALID_WEEKDAY");
                visitDay = d;
            }
        }

        boolean excludeClosed = input.hasNonNull("exclude_closed") ? input.path("exclude_closed").asBoolean(true) : (visitStartMin != null);
        boolean includeUnknownPrice = input.path("include_unknown_price").asBoolean(false);

        return new RankingRequest(
                topN, currency.toUpperCase(Locale.ROOT), basis,
                destinationId, geoId, Set.copyOf(expandedGeoIds),
                Set.copyOf(categoryIds), Set.copyOf(hardTags), Collections.unmodifiableMap(softPrefs),
                minBudget, maxBudget, minRating, space,
                originLat, originLon, maxDistanceKm,
                visitSlot, visitDay, visitStartMin, visitEndMin, tz,
                excludeClosed, includeUnknownPrice, null, Instant.now()
        );
    }

    private static Map<String, Object> toPublicItem(RankedCandidate rc) {
        PlaceSnapshot p = rc.place();
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("place_id", p.placeId());
        item.put("rank", rc.rank());
        item.put("explanation", Map.of(
                "reason_codes", rc.reasonCodes(),
                "reasons_vi", rc.reasonsVi(),
                "reasons_en", rc.reasonsEn(),
                "summary_vi", rc.summaryVi(),
                "summary_en", rc.summaryEn()
        ));
        Map<String, Object> facts = new LinkedHashMap<>();
        facts.put("name", p.name());
        facts.put("name_en", p.nameEn());
        facts.put("address", p.address());
        facts.put("category_ids", p.categoryIds());
        facts.put("geographic_unit_id", p.geographicUnitId());
        facts.put("destination_ids", p.destinationIds());
        facts.put("price_min", p.priceMin());
        facts.put("price_max", p.priceMax());
        facts.put("currency", p.currency());
        facts.put("price_basis", p.priceBasis() != null ? p.priceBasis().name() : "PER_PERSON");
        facts.put("rating_avg", p.approvedRatingAvg());
        facts.put("rating_count", p.approvedRatingCount());
        facts.put("distance_km", rc.distanceKm() != null ? Math.round(rc.distanceKm() * 100.0) / 100.0 : null);
        facts.put("distance_note", rc.distanceKm() != null ? "STRAIGHT_LINE" : null);
        facts.put("opening_status", rc.openingStatus().name());
        facts.put("space_type", p.spaceType().name());
        item.put("facts", facts);
        return item;
    }

    private static Map<String, Object> buildDebugPayload(
            RankingRequest request,
            RankingOutput output,
            List<RankedCandidate> returned,
            ActiveDeployment deployment,
            int visibilityRejected,
            int latencyMs
    ) {
        Map<String, Object> debug = new LinkedHashMap<>();
        debug.put("latency_ms", latencyMs);
        debug.put("total_scanned", output.totalScanned());
        debug.put("passed_hard_filters", output.passedHardFilters());
        debug.put("candidate_capped_from", output.candidateCappedFrom());
        debug.put("candidate_cap_policy", output.candidateCapPolicy());
        debug.put("visibility_rejected", visibilityRejected);
        debug.put("returned_count", returned.size());
        debug.put("fallback_used", output.fallbackUsed());
        debug.put("fallback_reason", output.fallbackReason());
        debug.put("degraded", output.degraded());
        debug.put("degraded_reasons", output.degradedReasons());
        debug.put("pre_rerank_top_ids", output.preRerankOrder().subList(0, Math.min(20, output.preRerankOrder().size())));
        debug.put("post_rerank_top_ids", output.postRerankOrder().subList(0, Math.min(20, output.postRerankOrder().size())));

        // Exclusion summary by reason code + sample excluded places
        Map<String, Long> exclusionCounts = new LinkedHashMap<>();
        for (FilterExclusion ex : output.exclusions()) {
            exclusionCounts.merge(ex.reasonCode(), 1L, Long::sum);
        }
        debug.put("exclusion_counts", exclusionCounts);
        debug.put("exclusions_sample", output.exclusions().subList(0, Math.min(50, output.exclusions().size())));

        Map<String, Object> manifest = new LinkedHashMap<>();
        manifest.put("deployment_id", deployment.deploymentId());
        manifest.put("config_version_id", deployment.configVersionId());
        manifest.put("config_version_tag", deployment.config().versionTag());
        manifest.put("quality_status", deployment.qualityStatus());
        manifest.put("demo_activation", deployment.demoActivation());
        manifest.put("scorer_versions", deployment.config().scorerVersions());
        manifest.put("cohort_snapshot_version", deployment.cohortStats().snapshotVersion());
        manifest.put("cf_artifact_version", deployment.cfArtifact() != null ? deployment.cfArtifact().versionTag() : null);
        manifest.put("cf_artifact_active", deployment.cfArtifact() != null && deployment.cfArtifact().activeAndValid());
        debug.put("deployment_manifest", manifest);

        List<Map<String, Object>> items = new ArrayList<>();
        for (RankedCandidate rc : returned) {
            HybridBreakdown hb = rc.breakdown();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("rank", rc.rank());
            row.put("place_id", rc.place().placeId());
            row.put("name", rc.place().name());
            row.put("final_score", round4(rc.finalScore()));
            row.put("fallback_used", hb.fallbackUsed());
            row.put("fallback_reason", hb.fallbackReason());
            row.put("configured_weights", hb.configuredWeights());
            row.put("effective_weights", hb.effectiveWeights());
            row.put("contributions", hb.contributions());
            row.put("scorers", Map.of(
                    "basic", scorerDebug(hb.basic()),
                    "content", scorerDebug(hb.content()),
                    "collaborative", scorerDebug(hb.collaborative()),
                    "context", scorerDebug(hb.context())
            ));
            row.put("reason_codes", rc.reasonCodes());
            row.put("summary_vi", rc.summaryVi());
            items.add(row);
        }
        debug.put("items", items);
        return debug;
    }

    private static Map<String, Object> scorerDebug(ScorerResult sr) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("available", sr.available());
        m.put("score", sr.score() != null ? round4(sr.score()) : null);
        m.put("unavailable_reason", sr.unavailableReason() != null ? sr.unavailableReason().name() : null);
        m.put("scorer_version", sr.scorerVersion());
        m.put("feature_snapshot_version", sr.featureSnapshotVersion());
        m.put("data_as_of", sr.dataAsOf() != null ? sr.dataAsOf().toString() : null);
        m.put("reason_codes", sr.reasonCodes());
        m.put("breakdown", sr.breakdown());
        return m;
    }

    private static List<Map<String, Object>> computeRankDiff(List<RankedCandidate> a, List<RankedCandidate> b) {
        Map<UUID, Integer> rankB = new HashMap<>();
        Map<UUID, Double> scoreB = new HashMap<>();
        for (RankedCandidate rc : b) {
            rankB.put(rc.place().placeId(), rc.rank());
            scoreB.put(rc.place().placeId(), rc.finalScore());
        }
        List<Map<String, Object>> diff = new ArrayList<>();
        for (RankedCandidate rc : a) {
            UUID id = rc.place().placeId();
            Integer rb = rankB.get(id);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("place_id", id);
            row.put("name", rc.place().name());
            row.put("rank_a", rc.rank());
            row.put("rank_b", rb);
            row.put("rank_delta", rb != null ? rc.rank() - rb : null);
            row.put("score_a", round4(rc.finalScore()));
            row.put("score_b", scoreB.containsKey(id) ? round4(scoreB.get(id)) : null);
            diff.add(row);
        }
        return diff;
    }

    private static Map<String, Object> summarizeAvailability(List<RankedCandidate> items) {
        if (items.isEmpty()) return Map.of("basic", 0.0, "content", 0.0, "collaborative", 0.0, "context", 0.0);
        int n = items.size();
        long b = items.stream().filter(i -> i.breakdown().basic().available()).count();
        long c = items.stream().filter(i -> i.breakdown().content().available()).count();
        long f = items.stream().filter(i -> i.breakdown().collaborative().available()).count();
        long x = items.stream().filter(i -> i.breakdown().context().available()).count();
        return Map.of("basic", round4((double) b / n), "content", round4((double) c / n),
                "collaborative", round4((double) f / n), "context", round4((double) x / n));
    }

    private static Map<String, Object> summarizeEffectiveWeights(List<RankedCandidate> items) {
        if (items.isEmpty()) return Map.of("basic", 0.0, "content", 0.0, "collaborative", 0.0, "context", 0.0);
        double b = 0, c = 0, f = 0, x = 0;
        for (RankedCandidate rc : items) {
            b += rc.breakdown().effectiveWeights().getOrDefault("basic", 0.0);
            c += rc.breakdown().effectiveWeights().getOrDefault("content", 0.0);
            f += rc.breakdown().effectiveWeights().getOrDefault("collaborative", 0.0);
            x += rc.breakdown().effectiveWeights().getOrDefault("context", 0.0);
        }
        int n = items.size();
        return Map.of("basic", round4(b / n), "content", round4(c / n), "collaborative", round4(f / n), "context", round4(x / n));
    }

    private static RankedCandidate reRank(RankedCandidate rc, int newRank) {
        return new RankedCandidate(
                rc.place(), newRank, rc.finalScore(), rc.distanceKm(), rc.openingStatus(),
                rc.breakdown(), rc.reasonCodes(), rc.reasonsVi(), rc.reasonsEn(),
                rc.summaryVi(), rc.summaryEn()
        );
    }

    private static Optional<UUID> parseOptionalUuid(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode() || node.asText().isBlank()) return Optional.empty();
        try { return Optional.of(UUID.fromString(node.asText().trim())); }
        catch (Exception e) { throw bad("INVALID_UUID"); }
    }

    private static double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }
}
