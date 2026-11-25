package vn.smarttravel.intelligence.ranking.service;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import vn.smarttravel.intelligence.models.artifacts.ArtifactStore;
import vn.smarttravel.intelligence.projections.service.ProjectionService;
import vn.smarttravel.intelligence.projections.service.SnapshotRebuild;
import vn.smarttravel.intelligence.ranking.domain.*;
import vn.smarttravel.intelligence.ranking.domain.ItemBasedCfBuilder.InteractionRecord;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;
import vn.smarttravel.intelligence.ranking.repository.RankingDataRepository;
import vn.smarttravel.intelligence.ranking.repository.RankingGovernanceRepository;

/**
 * Governance service for ranking config versions, cohort stat snapshots, Item-based CF builds,
 * transaction-safe deployments & rollbacks, projection sync, and operational analytics.
 */
@Service
public class RankingGovernanceService {

    private final RankingGovernanceRepository govRepo;
    private final RankingDataRepository data;
    private final ArtifactStore artifacts;
    private final ProjectionService projections;
    private final SnapshotRebuild snapshotRebuild;
    private final RankingBackgroundExecutor bgExecutor;
    private final CohortStatsCalculator cohortCalculator = new CohortStatsCalculator();
    private final ItemBasedCfBuilder cfBuilder = new ItemBasedCfBuilder();

    public RankingGovernanceService(
            RankingGovernanceRepository govRepo,
            RankingDataRepository data,
            ArtifactStore artifacts,
            ProjectionService projections,
            SnapshotRebuild snapshotRebuild,
            RankingBackgroundExecutor bgExecutor
    ) {
        this.govRepo = govRepo;
        this.data = data;
        this.artifacts = artifacts;
        this.projections = projections;
        this.snapshotRebuild = snapshotRebuild;
        this.bgExecutor = bgExecutor;
    }

    // ── Config Versions ──────────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listConfigs() {
        return govRepo.listConfigs().stream().map(this::formatConfigRow).toList();
    }

    @Transactional
    public Map<String, Object> createConfig(UUID actor, JsonNode body) {
        projections.guardActor(actor);
        String name = body.path("name").asText("").trim();
        require(!name.isBlank() && name.length() <= 120, "NAME_REQUIRED");
        String versionTag = body.hasNonNull("version_tag") && !body.path("version_tag").asText().isBlank()
                ? body.path("version_tag").asText().trim()
                : "cfg-" + Instant.now().toEpochMilli();
        String description = body.path("description").asText("");

        JsonNode w = body.path("weights");
        double wB = w.path("basic").asDouble(0.20);
        double wC = w.path("content").asDouble(0.45);
        double wF = w.path("collaborative").asDouble(0.10);
        double wX = w.path("context").asDouble(0.25);

        JsonNode s = body.path("sub_params");
        Map<String, Object> subParams = mergeSubParams(s);
        Map<String, Object> weights = normalizeWeightsMap(wB, wC, wF, wX, body.path("normalize_weights").asBoolean(true));
        Map<String, String> scorerVersions = RankingConfig.defaultScorerVersions();

        // Validate domain invariants by constructing RankingConfig
        UUID id = UUID.randomUUID();
        validateConfigInvariants(id, versionTag, weights, subParams, scorerVersions);

        String checksum = hash(json(Map.of("weights", weights, "sub_params", subParams, "scorer_versions", scorerVersions)));
        govRepo.insertConfig(id, versionTag, name, description, json(weights), json(subParams), json(scorerVersions), checksum, actor);
        projections.audit(actor, "ranking_config", id.toString(), "CREATE", Map.of("version_tag", versionTag, "checksum", checksum));
        return getConfig(id);
    }

    @Transactional
    public Map<String, Object> updateDraftConfig(UUID actor, UUID id, JsonNode body) {
        projections.guardActor(actor);
        var rows = govRepo.findConfigForUpdate(id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "CONFIG_NOT_FOUND");
        var row = rows.getFirst();
        require("DRAFT".equals(row.get("lifecycle_status")), "ONLY_DRAFT_EDITABLE");

        String name = body.hasNonNull("name") ? body.path("name").asText().trim() : String.valueOf(row.get("name"));
        String desc = body.hasNonNull("description") ? body.path("description").asText() : Objects.toString(row.get("description"), "");
        JsonNode curW = read(row.get("weights"));
        JsonNode w = body.has("weights") ? body.path("weights") : curW;
        Map<String, Object> weights = normalizeWeightsMap(
                w.path("basic").asDouble(curW.path("basic").asDouble()),
                w.path("content").asDouble(curW.path("content").asDouble()),
                w.path("collaborative").asDouble(curW.path("collaborative").asDouble()),
                w.path("context").asDouble(curW.path("context").asDouble()),
                body.path("normalize_weights").asBoolean(true)
        );
        Map<String, Object> subParams = body.has("sub_params") ? mergeSubParams(body.path("sub_params")) : readAsMap(row.get("sub_params"));
        Map<String, String> scorerVersions = RankingConfig.defaultScorerVersions();
        validateConfigInvariants(id, String.valueOf(row.get("version_tag")), weights, subParams, scorerVersions);

        String checksum = hash(json(Map.of("weights", weights, "sub_params", subParams, "scorer_versions", scorerVersions)));
        govRepo.updateDraftConfig(id, name, desc, json(weights), json(subParams), checksum);
        projections.audit(actor, "ranking_config", id.toString(), "UPDATE", Map.of("checksum", checksum));
        return getConfig(id);
    }

    @Transactional
    public Map<String, Object> validateConfig(UUID actor, UUID id, JsonNode body) {
        projections.guardActor(actor);
        var rows = govRepo.findConfigForUpdate(id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "CONFIG_NOT_FOUND");
        var row = rows.getFirst();
        RankingConfig cfg = data.mapConfig(row); // Validates all bounds/weights

        String qualityStatus = String.valueOf(row.get("quality_status"));
        if (body != null && body.hasNonNull("evaluation_run_id")) {
            UUID evalRunId = uuid(body, "evaluation_run_id");
            var evalRows = govRepo.findEvaluationRunForValidation(evalRunId);
            require(!evalRows.isEmpty() && "SUCCEEDED".equals(evalRows.getFirst().get("status")), "EVALUATION_NOT_SUCCEEDED");
            var evalRow = evalRows.getFirst();
            String tier = String.valueOf(evalRow.get("provenance_tier"));
            String evalSplit = String.valueOf(evalRow.get("split"));
            int qEvaluated = ((Number) evalRow.get("query_evaluated")).intValue();
            double judgedCov = evalRow.get("judged_coverage") instanceof Number n ? n.doubleValue() : 0.0;
            JsonNode metrics = read(evalRow.get("metrics"));
            int violations = metrics.path("hard_constraint_violations").asInt(1);
            require(violations == 0, "HARD_CONSTRAINT_VIOLATION_IN_EVAL");

            String reviewerNote = body.path("reviewer_note").asText("").trim();
            if ("SYNTHETIC_FIXTURE".equals(tier)) {
                // Synthetic fixtures verify mechanics, NOT production quality
                qualityStatus = "QUALITY_PENDING";
            } else if (!"TEST".equals(evalSplit) || qEvaluated < 3 || judgedCov < 0.5 || reviewerNote.isBlank()) {
                // Having human labels alone NEVER auto-grants PASSED/QUALITY_VALIDATED:
                // requires independent holdout TEST eval (>=3 judged queries, >=50% judged coverage) + explicit human reviewer sign-off.
                qualityStatus = "QUALITY_PENDING";
            } else {
                double ndcg = metrics.path("ndcg_at_10").asDouble(0.0);
                qualityStatus = ndcg > 0.0 ? "PASSED" : "FAILED";
            }
        }

        String nextLifecycle = "ACTIVE".equals(row.get("lifecycle_status")) ? "ACTIVE" : "VALIDATED";
        govRepo.updateConfigValidation(id, nextLifecycle, qualityStatus);
        data.invalidateCaches();
        projections.audit(actor, "ranking_config", id.toString(), "VALIDATE", Map.of("quality_status", qualityStatus, "version_tag", cfg.versionTag()));
        return getConfig(id);
    }

    public Map<String, Object> getConfig(UUID id) {
        var rows = govRepo.findConfigById(id);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "CONFIG_NOT_FOUND");
        return formatConfigRow(rows.getFirst());
    }

    // ── Cohort Snapshots & Projection Sync ───────────────────────────────────────

    @Transactional
    public Map<String, Object> syncProjectionsAndCohorts(UUID actor) {
        Map<String, Object> cohortRes = recomputeCohortSnapshot(actor, 30, 5);
        UUID syncJobId = UUID.randomUUID();
        bgExecutor.registerAndSubmit(syncJobId, () -> {
            try {
                snapshotRebuild.run(actor);
                recomputeCohortSnapshot(actor, 30, 5);
                data.invalidateCaches();
            } catch (Exception ignored) {
                // Background projection sync failure is non-fatal to online serving
            }
        });
        return Map.of(
                "status", "QUEUED",
                "job_id", syncJobId,
                "cohort_snapshot", cohortRes
        );
    }

    @Transactional
    public Map<String, Object> recomputeCohortSnapshot(UUID actor, int windowDays, int minSample) {
        projections.guardActor(actor);
        require(windowDays >= 1 && windowDays <= 365, "INVALID_WINDOW_DAYS");
        require(minSample >= 1 && minSample <= 1000, "INVALID_MIN_SAMPLE");

        List<PlaceSnapshot> places = data.loadPublishedPlaceSnapshots(windowDays);
        Instant now = Instant.now();
        String versionTag = "cohort-" + now.toEpochMilli();
        CohortStats stats = cohortCalculator.compute(versionTag, places, windowDays, minSample, now);

        Map<String, Object> serialized = new LinkedHashMap<>();
        for (var e : stats.entries().entrySet()) {
            CohortStatEntry v = e.getValue();
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("rating_prior_mu", v.ratingPriorMu());
            item.put("rating_sample_size", v.ratingSampleSize());
            item.put("popularity_p95_ref", v.popularityP95Ref());
            item.put("popularity_sample_size", v.popularitySampleSize());
            serialized.put(e.getKey(), item);
        }
        String statsJson = json(serialized);
        String checksum = hash(statsJson);
        CohortStatEntry global = stats.entries().get("global");
        UUID id = UUID.randomUUID();

        govRepo.insertCohortSnapshot(
                id, versionTag,
                global != null ? global.ratingPriorMu() : null,
                global != null ? global.ratingSampleSize() : 0,
                global != null ? global.popularityP95Ref() : null,
                global != null ? global.popularitySampleSize() : 0,
                statsJson, windowDays, minSample, checksum, now, actor
        );
        projections.audit(actor, "cohort_snapshot", id.toString(), "RECOMPUTE", Map.of("cohorts", stats.entries().size(), "checksum", checksum));
        data.invalidateCaches();
        return Map.of(
                "snapshot_id", id,
                "version_tag", versionTag,
                "cohorts_count", stats.entries().size(),
                "global_rating_prior", global != null && global.ratingPriorMu() != null ? global.ratingPriorMu() : "UNAVAILABLE",
                "global_rating_sample", global != null ? global.ratingSampleSize() : 0,
                "global_pop_p95", global != null && global.popularityP95Ref() != null ? global.popularityP95Ref() : "UNAVAILABLE",
                "checksum", checksum,
                "computed_at", now.toString()
        );
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> listCohortSnapshots() {
        return govRepo.listCohortSnapshots();
    }

    // ── Item-based CF Builder & Artifacts ────────────────────────────────────────

    @Transactional
    public Map<String, Object> enqueueCfBuild(UUID actor, JsonNode body) {
        projections.guardActor(actor);
        double lambda = body.path("lambda").asDouble(10.0);
        int topK = body.path("top_k").asInt(100);
        require(Double.isFinite(lambda) && lambda >= 0.0, "INVALID_LAMBDA");
        require(topK >= 1 && topK <= 500, "INVALID_TOP_K");
        Instant cutoff = body.hasNonNull("cutoff_at") ? time(body, "cutoff_at") : Instant.now();
        String codeRevision = body.path("code_revision").asText("cf-item-v1-local");
        boolean demoFixture = body.path("is_demo_fixture").asBoolean(false);

        UUID jobId = UUID.randomUUID();
        Map<String, Object> params = Map.of("lambda", lambda, "top_k", topK, "is_demo_fixture", demoFixture);
        govRepo.insertCfBuildJob(jobId, json(params), codeRevision, cutoff, actor);
        projections.audit(actor, "cf_build_job", jobId.toString(), "ENQUEUE", params);

        AtomicBoolean cancelled = bgExecutor.registerAndSubmit(jobId, () -> executeCfBuildJob(jobId, actor, cutoff, lambda, topK, demoFixture));
        if (cancelled == null) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "WORKER_BUSY");
        return getCfJob(jobId);
    }

    private void executeCfBuildJob(UUID jobId, UUID actor, Instant cutoff, double lambda, int topK, boolean demoFixture) {
        try {
            int claimed = govRepo.claimCfBuildJob(jobId);
            if (claimed == 0) return;

            if (bgExecutor.isCancelled(jobId)) {
                markCfCancelled(jobId);
                return;
            }

            // Read ONLY consented positive/removal interactions up to cutoff
            List<InteractionRecord> records = govRepo.loadConsentedInteractionsUntil(cutoff);

            govRepo.updateCfJobProgress(jobId, 50);
            if (bgExecutor.isCancelled(jobId)) {
                markCfCancelled(jobId);
                return;
            }

            UUID artifactId = UUID.randomUUID();
            String versionTag = "cf-item-" + Instant.now().toEpochMilli();
            var buildRes = cfBuilder.build(artifactId, versionTag, records, cutoff, lambda, topK);

            String datasetChecksum = hash(json(records.stream().map(r -> r.userId() + ":" + r.placeId() + ":" + r.eventType() + ":" + r.occurredAt()).toList()));

            Map<String, Object> serializedNeighbors = new LinkedHashMap<>();
            for (var e : buildRes.artifact().neighborsByItem().entrySet()) {
                serializedNeighbors.put(e.getKey().toString(), e.getValue().stream().map(n -> Map.of(
                        "neighbor_place_id", n.neighborPlaceId().toString(),
                        "adjusted_similarity", n.adjustedSimilarity(),
                        "raw_cosine", n.rawCosine(),
                        "common_users", n.commonUsers()
                )).toList());
            }
            Map<String, Object> artifactDoc = new LinkedHashMap<>();
            artifactDoc.put("schema_version", 1);
            artifactDoc.put("algorithm", "cf_item_v1");
            artifactDoc.put("version_tag", versionTag);
            artifactDoc.put("cutoff_at", cutoff.toString());
            artifactDoc.put("lambda", lambda);
            artifactDoc.put("top_k", topK);
            artifactDoc.put("dataset_checksum", datasetChecksum);
            artifactDoc.put("supported_items", buildRes.artifact().supportedItems().stream().map(UUID::toString).sorted().toList());
            artifactDoc.put("neighbors", serializedNeighbors);

            String artifactJson = json(artifactDoc);
            String artifactKey = artifacts.write(artifactJson);
            String artifactChecksum = hash(artifactJson);

            String logsKey = artifacts.write(json(Map.of(
                    "job_id", jobId, "artifact_id", artifactId,
                    "users", buildRes.userCount(), "items", buildRes.itemCount(),
                    "edges", buildRes.edgeCount(), "excluded_inactive", buildRes.excludedInactive(),
                    "excluded_after_cutoff", buildRes.excludedAfterCutoff(),
                    "completed_at", Instant.now().toString()
            )));

            govRepo.insertCfArtifact(
                    artifactId, jobId, versionTag, artifactKey, artifactChecksum, datasetChecksum,
                    json(Map.of("lambda", lambda, "top_k", topK)), cutoff,
                    buildRes.userCount(), buildRes.itemCount(), buildRes.edgeCount(),
                    demoFixture, actor
            );
            govRepo.markCfJobSucceeded(jobId, datasetChecksum, artifactId, logsKey);
        } catch (Exception ex) {
            govRepo.markCfJobFailed(jobId, ex.getMessage());
        }
    }

    private void markCfCancelled(UUID jobId) {
        govRepo.markCfJobCancelled(jobId);
    }

    @Transactional
    public Map<String, Object> cancelCfJob(UUID actor, UUID jobId) {
        projections.guardActor(actor);
        bgExecutor.requestCancel(jobId);
        markCfCancelled(jobId);
        projections.audit(actor, "cf_build_job", jobId.toString(), "CANCEL", Map.of());
        return getCfJob(jobId);
    }

    public Map<String, Object> getCfJob(UUID jobId) {
        var rows = govRepo.findCfJobById(jobId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "CF_JOB_NOT_FOUND");
        return rows.getFirst();
    }

    public List<Map<String, Object>> listCfJobs() {
        return govRepo.listCfJobs();
    }

    public List<Map<String, Object>> listCfArtifacts() {
        return govRepo.listCfArtifacts();
    }

    @Transactional
    public Map<String, Object> validateCfArtifact(UUID actor, UUID artifactId, JsonNode body) {
        projections.guardActor(actor);
        var rows = govRepo.findCfArtifactForUpdate(artifactId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "CF_ARTIFACT_NOT_FOUND");
        var row = rows.getFirst();
        require(!"REVOKED".equals(row.get("lifecycle_status")), "ARTIFACT_REVOKED");

        // Verify checksum integrity against object storage before marking VALIDATED
        artifacts.read(String.valueOf(row.get("artifact_object_key")), String.valueOf(row.get("checksum")));
        int items = ((Number) row.get("item_count")).intValue();
        int edges = ((Number) row.get("edge_count")).intValue();
        require(items >= 2 && edges >= 1, "INSUFFICIENT_CF_SUPPORT");

        String quality = Boolean.TRUE.equals(row.get("is_demo_fixture")) ? "QUALITY_PENDING"
                : (body != null && body.hasNonNull("quality_status") ? body.path("quality_status").asText("QUALITY_PENDING") : "QUALITY_PENDING");

        govRepo.updateCfArtifactValidated(artifactId, quality);
        projections.audit(actor, "cf_artifact", artifactId.toString(), "VALIDATE", Map.of("items", items, "edges", edges, "quality_status", quality));
        return govRepo.findCfArtifactById(artifactId).getFirst();
    }

    // ── Deployments: Transaction-Safe Activate & Rollback ────────────────────────

    public List<Map<String, Object>> listDeployments() {
        return govRepo.listDeployments();
    }

    @Transactional
    public Map<String, Object> activateDeployment(UUID actor, JsonNode body) {
        projections.guardActor(actor);
        UUID configId = uuid(body, "config_version_id");
        String reason = body.path("reason").asText("").trim();
        require(!reason.isBlank() && reason.length() <= 1024, "REASON_REQUIRED");
        boolean allowDemo = body.path("allow_demo_activation").asBoolean(false);

        // Transaction-level advisory lock guarantees single active deployment per use_case under concurrency
        govRepo.acquireDeploymentLock();

        var cfgRows = govRepo.findConfigForUpdate(configId);
        if (cfgRows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "CONFIG_NOT_FOUND");
        var cfgRow = cfgRows.getFirst();
        String lifecycle = String.valueOf(cfgRow.get("lifecycle_status"));
        String quality = String.valueOf(cfgRow.get("quality_status"));

        require(Set.of("VALIDATED", "ACTIVE", "INACTIVE").contains(lifecycle), "CONFIG_NOT_VALIDATED");
        if (!"PASSED".equals(quality)) {
            require(allowDemo, "QUALITY_GATE_NOT_PASSED");
        }

        UUID cohortId = body.hasNonNull("cohort_snapshot_id") && !body.path("cohort_snapshot_id").asText().isBlank()
                ? uuid(body, "cohort_snapshot_id")
                : govRepo.findLatestCohortSnapshotId();

        UUID cfId = body.hasNonNull("cf_artifact_id") && !body.path("cf_artifact_id").asText().isBlank()
                ? uuid(body, "cf_artifact_id") : null;
        if (cfId != null) {
            var cfRows = govRepo.findCfArtifactById(cfId);
            require(!cfRows.isEmpty(), "CF_ARTIFACT_NOT_FOUND");
            var cfRow = cfRows.getFirst();
            require(Set.of("VALIDATED", "ACTIVE").contains(String.valueOf(cfRow.get("lifecycle_status"))), "CF_ARTIFACT_NOT_VALIDATED");
            // Verify checksum integrity before activation
            artifacts.read(String.valueOf(cfRow.get("artifact_object_key")), String.valueOf(cfRow.get("checksum")));
        }

        UUID evalRunId = body.hasNonNull("evaluation_run_id") && !body.path("evaluation_run_id").asText().isBlank()
                ? uuid(body, "evaluation_run_id") : null;

        // Deactivate previous active deployment
        govRepo.deactivateActiveDeployments(configId);

        UUID deploymentId = UUID.randomUUID();
        govRepo.insertDeployment(
                deploymentId, configId, cohortId, cfId,
                cfgRow.get("scorer_versions").toString(), evalRunId,
                quality, allowDemo && !"PASSED".equals(quality), actor, reason
        );
        govRepo.markConfigActive(configId);
        if (cfId != null) {
            govRepo.markCfArtifactActive(cfId);
        }

        projections.publish("intelligence.model.deployed.v1", "ranking_deployment", deploymentId.toString(), 1,
                Map.of("use_case", "PLACE_RECOMMENDATION", "model_version_id", configId, "deployment_id", deploymentId, "reason", reason), null);
        projections.audit(actor, "ranking_deployment", deploymentId.toString(), "ACTIVATE",
                Map.of("config_version_id", configId, "cf_artifact_id", Objects.toString(cfId, "none"), "quality_status", quality, "demo", allowDemo, "reason", reason));
        data.invalidateCaches();

        return Map.of("deployment_id", deploymentId, "config_version_id", configId, "status", "ACTIVE", "quality_status", quality, "is_demo_activation", allowDemo && !"PASSED".equals(quality));
    }

    @Transactional
    public Map<String, Object> rollbackToDeployment(UUID actor, UUID targetDeploymentId, JsonNode body) {
        projections.guardActor(actor);
        String reason = body.path("reason").asText("").trim();
        require(!reason.isBlank() && reason.length() <= 1024, "REASON_REQUIRED");

        govRepo.acquireDeploymentLock();
        var targetRows = govRepo.findDeploymentById(targetDeploymentId);
        if (targetRows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "DEPLOYMENT_NOT_FOUND");
        var target = targetRows.getFirst();

        UUID configId = (UUID) target.get("config_version_id");
        UUID cohortId = (UUID) target.get("cohort_snapshot_id");
        UUID cfId = (UUID) target.get("cf_artifact_id");
        if (cfId != null) {
            var cfRows = govRepo.findCfArtifactSummary(cfId);
            require(!cfRows.isEmpty() && !"REVOKED".equals(cfRows.getFirst().get("lifecycle_status")), "TARGET_CF_ARTIFACT_REVOKED");
            artifacts.read(String.valueOf(cfRows.getFirst().get("artifact_object_key")), String.valueOf(cfRows.getFirst().get("checksum")));
        }

        govRepo.deactivateActiveDeployments(configId);

        UUID newDepId = UUID.randomUUID();
        govRepo.insertDeployment(
                newDepId, configId, cohortId, cfId,
                target.get("scorer_versions").toString(), target.get("evaluation_run_id"),
                target.get("quality_status"), target.get("is_demo_activation"),
                actor, "ROLLBACK to " + targetDeploymentId + ": " + reason
        );
        govRepo.markConfigActive(configId);
        data.invalidateCaches();
        projections.audit(actor, "ranking_deployment", newDepId.toString(), "ROLLBACK", Map.of("target_deployment_id", targetDeploymentId, "reason", reason));
        return Map.of("deployment_id", newDepId, "rolled_back_from", targetDeploymentId, "config_version_id", configId, "status", "ACTIVE");
    }

    // ── Operational Analytics (strictly excludes is_admin_test = true) ───────────

    @Transactional(readOnly = true)
    public Map<String, Object> operationalAnalytics(int windowHours) {
        int hours = Math.max(1, Math.min(windowHours, 720));

        var reqSummary = govRepo.loadRequestSummary(hours);
        var fallbackByReason = govRepo.loadFallbackByReason(hours);
        var emptyByReason = govRepo.loadEmptyByReason(hours);
        var scorerStats = govRepo.loadScorerStats(hours);

        // Real impression & feedback CTR (deduplicated by idempotency_key, excluding admin tests)
        long impCount = govRepo.countVerifiedImpressions(hours);
        var feedbackCounts = govRepo.loadFeedbackCounts(hours);
        Map<String, Long> fbMap = new LinkedHashMap<>();
        for (var r : feedbackCounts) fbMap.put(String.valueOf(r.get("action_type")), ((Number) r.get("count")).longValue());

        long clicks = fbMap.getOrDefault("CLICK", 0L);
        long accepts = fbMap.getOrDefault("ACCEPT", 0L);
        long skips = fbMap.getOrDefault("SKIP", 0L);
        long addToTripServer = govRepo.countAddToTripAttributed(hours);

        // Catalog coverage & exposure of new/unrated items
        long publishedCount = govRepo.countPublishedPlaces();
        long uniqueRecommended = govRepo.countUniqueRecommendedPlaces(hours);
        long unratedExposed = govRepo.countUnratedExposedPlaces(hours);

        // Projection freshness & CF freshness
        Timestamp latestProj = govRepo.findLatestProjectionAsOf();
        long projAgeSec = latestProj != null ? Math.max(0, java.time.Duration.between(latestProj.toInstant(), Instant.now()).getSeconds()) : -1;

        var activeDep = data.loadActiveDeployment();
        Long cfAgeSec = activeDep.cfArtifact() != null
                ? Math.max(0, java.time.Duration.between(activeDep.cfArtifact().cutoffAt(), Instant.now()).getSeconds())
                : null;

        long totalReq = ((Number) reqSummary.get("total_requests")).longValue();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("window_hours", hours);
        out.put("excludes_admin_playground", true);

        Map<String, Object> reqMap = new LinkedHashMap<>();
        reqMap.put("total", totalReq);
        reqMap.put("empty_count", reqSummary.get("empty_requests"));
        reqMap.put("empty_rate", totalReq > 0 ? round4(((Number) reqSummary.get("empty_requests")).doubleValue() / totalReq) : 0.0);
        reqMap.put("degraded_count", reqSummary.get("degraded_requests"));
        reqMap.put("degraded_rate", totalReq > 0 ? round4(((Number) reqSummary.get("degraded_requests")).doubleValue() / totalReq) : 0.0);
        reqMap.put("fallback_count", reqSummary.get("fallback_requests"));
        reqMap.put("fallback_rate", totalReq > 0 ? round4(((Number) reqSummary.get("fallback_requests")).doubleValue() / totalReq) : 0.0);
        reqMap.put("avg_candidates", round2(((Number) reqSummary.get("avg_candidates")).doubleValue()));
        reqMap.put("avg_returned", round2(((Number) reqSummary.get("avg_returned")).doubleValue()));
        reqMap.put("latency_ms_p50", round2(((Number) reqSummary.get("p50_ms")).doubleValue()));
        reqMap.put("latency_ms_p95", round2(((Number) reqSummary.get("p95_ms")).doubleValue()));
        reqMap.put("latency_ms_p99", round2(((Number) reqSummary.get("p99_ms")).doubleValue()));
        out.put("requests", reqMap);

        out.put("fallback_by_reason", fallbackByReason);
        out.put("empty_by_reason", emptyByReason);
        out.put("scorer_availability", Map.of(
                "basic", round4(((Number) scorerStats.get("basic_avail")).doubleValue()),
                "content", round4(((Number) scorerStats.get("content_avail")).doubleValue()),
                "collaborative", round4(((Number) scorerStats.get("cf_avail")).doubleValue()),
                "context", round4(((Number) scorerStats.get("context_avail")).doubleValue())
        ));
        out.put("effective_weights_avg", Map.of(
                "basic", round4(((Number) scorerStats.get("eff_w_basic")).doubleValue()),
                "content", round4(((Number) scorerStats.get("eff_w_content")).doubleValue()),
                "collaborative", round4(((Number) scorerStats.get("eff_w_cf")).doubleValue()),
                "context", round4(((Number) scorerStats.get("eff_w_context")).doubleValue())
        ));
        out.put("freshness", Map.of(
                "projection_as_of", latestProj != null ? latestProj.toInstant().toString() : "UNAVAILABLE",
                "projection_age_seconds", projAgeSec,
                "cf_artifact_version", activeDep.cfArtifact() != null ? activeDep.cfArtifact().versionTag() : "NONE",
                "cf_artifact_age_seconds", cfAgeSec != null ? cfAgeSec : -1,
                "cohort_snapshot_version", activeDep.cohortStats().snapshotVersion()
        ));
        out.put("coverage_and_exposure", Map.of(
                "published_places", publishedCount,
                "unique_places_recommended", uniqueRecommended,
                "catalog_coverage", publishedCount > 0 ? round4((double) uniqueRecommended / publishedCount) : 0.0,
                "unrated_new_items_exposed", unratedExposed
        ));

        Map<String, Object> engMap = new LinkedHashMap<>();
        engMap.put("impressions_verified", impCount);
        engMap.put("clicks", clicks);
        engMap.put("ctr", impCount > 0 ? round4((double) clicks / impCount) : null);
        engMap.put("accepts", accepts);
        engMap.put("skips", skips);
        engMap.put("add_to_trip_confirmed_server", addToTripServer);
        engMap.put("add_to_trip_rate", impCount > 0 ? round4((double) addToTripServer / impCount) : null);
        engMap.put("attribution_definition", "CTR = verified CLICK feedback / verified viewport IMPRESSIONS within window (" + hours + "h), deduplicated by idempotency_key, excluding admin playground traffic. Add-to-trip counted strictly from Trip server events with recommendation_request_id.");
        out.put("online_engagement", engMap);
        out.put("background_worker", bgExecutor.poolStatus());
        return out;
    }

    private Map<String, Object> formatConfigRow(Map<String, Object> row) {
        Map<String, Object> m = new LinkedHashMap<>(row);
        m.put("weights", read(row.get("weights")));
        m.put("sub_params", read(row.get("sub_params")));
        m.put("scorer_versions", read(row.get("scorer_versions")));
        return m;
    }

    private static Map<String, Object> normalizeWeightsMap(double wB, double wC, double wF, double wX, boolean normalize) {
        require(Double.isFinite(wB) && wB >= 0 && Double.isFinite(wC) && wC >= 0
                && Double.isFinite(wF) && wF >= 0 && Double.isFinite(wX) && wX >= 0, "INVALID_WEIGHTS");
        double sum = wB + wC + wF + wX;
        require(Double.isFinite(sum) && sum > 0.0, "WEIGHTS_SUM_MUST_BE_POSITIVE");
        if (normalize) {
            wB = round4(wB / sum);
            wC = round4(wC / sum);
            wF = round4(wF / sum);
            wX = round4(wX / sum);
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("basic", wB);
        m.put("content", wC);
        m.put("collaborative", wF);
        m.put("context", wX);
        return m;
    }

    private static Map<String, Object> mergeSubParams(JsonNode s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rating_m", s.path("rating_m").asDouble(10.0));
        m.put("rating_weight", s.path("rating_weight").asDouble(0.60));
        m.put("popularity_weight", s.path("popularity_weight").asDouble(0.40));
        m.put("popularity_window_days", s.path("popularity_window_days").asInt(30));
        m.put("min_observation_days", s.path("min_observation_days").asInt(7));
        m.put("cohort_min_sample", s.path("cohort_min_sample").asInt(5));
        m.put("distance_scale_km", s.path("distance_scale_km").asDouble(5.0));
        m.put("distance_weight", s.path("distance_weight").asDouble(0.70));
        m.put("weather_weight", s.path("weather_weight").asDouble(0.30));
        m.put("use_max_distance_as_scale", s.path("use_max_distance_as_scale").asBoolean(false));
        m.put("cf_lambda", s.path("cf_lambda").asDouble(10.0));
        m.put("cf_top_k", s.path("cf_top_k").asInt(100));
        m.put("cf_history_limit", s.path("cf_history_limit").asInt(50));
        m.put("cf_favorite_weight", s.path("cf_favorite_weight").asDouble(3.0));
        m.put("cf_trip_weight", s.path("cf_trip_weight").asDouble(5.0));
        m.put("candidate_cap", s.path("candidate_cap").asInt(1000));
        m.put("top_n_default", s.path("top_n_default").asInt(10));
        m.put("top_n_max", s.path("top_n_max").asInt(50));
        m.put("diversity_enabled", s.path("diversity_enabled").asBoolean(false));
        m.put("unknown_price_policy", s.path("unknown_price_policy").asText("EXCLUDE").toUpperCase(Locale.ROOT));
        return m;
    }

    private void validateConfigInvariants(UUID id, String tag, Map<String, Object> w, Map<String, Object> s, Map<String, String> sv) {
        Map<String, Object> fakeRow = Map.of(
                "config_version_id", id,
                "version_tag", tag,
                "weights", json(w),
                "sub_params", json(s),
                "scorer_versions", json(sv),
                "quality_status", "UNVALIDATED"
        );
        try {
            data.mapConfig(fakeRow);
        } catch (IllegalArgumentException ex) {
            throw bad("INVALID_CONFIG_" + ex.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> readAsMap(Object val) {
        return JSON.convertValue(read(val), LinkedHashMap.class);
    }

    private static double round4(double v) { return Math.round(v * 10000.0) / 10000.0; }
    private static double round2(double v) { return Math.round(v * 100.0) / 100.0; }
}
