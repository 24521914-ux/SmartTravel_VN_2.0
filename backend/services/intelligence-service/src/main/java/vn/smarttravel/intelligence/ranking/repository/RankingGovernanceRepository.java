package vn.smarttravel.intelligence.ranking.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import vn.smarttravel.intelligence.ranking.domain.ItemBasedCfBuilder.InteractionRecord;

/**
 * JDBC persistence layer for ranking config versions, cohort snapshots, CF jobs/artifacts,
 * deployments, rollbacks, and operational analytics queries.
 */
@Repository
public class RankingGovernanceRepository {

    private final JdbcTemplate db;

    public RankingGovernanceRepository(JdbcTemplate db) {
        this.db = db;
    }

    // ── Config Versions ──────────────────────────────────────────────────────────

    public List<Map<String, Object>> listConfigs() {
        return db.queryForList("""
                SELECT config_version_id, version_tag, name, description, weights, sub_params,
                       scorer_versions, lifecycle_status, quality_status, config_checksum,
                       mutation_version, created_at, updated_at
                FROM intelligence.ranking_config_versions
                ORDER BY created_at DESC
                """);
    }

    public void insertConfig(
            UUID id,
            String versionTag,
            String name,
            String description,
            String weightsJson,
            String subParamsJson,
            String scorerVersionsJson,
            String checksum,
            UUID actor
    ) {
        db.update("""
                INSERT INTO intelligence.ranking_config_versions(
                  config_version_id, version_tag, name, description, weights, sub_params,
                  scorer_versions, lifecycle_status, quality_status, config_checksum, created_by
                ) VALUES (?,?,?,?,?::jsonb,?::jsonb,?::jsonb,'DRAFT','UNVALIDATED',?,?)
                """,
                id, versionTag, name, description, weightsJson, subParamsJson, scorerVersionsJson, checksum, actor
        );
    }

    public List<Map<String, Object>> findConfigForUpdate(UUID id) {
        return db.queryForList("SELECT * FROM intelligence.ranking_config_versions WHERE config_version_id = ? FOR UPDATE", id);
    }

    public List<Map<String, Object>> findConfigById(UUID id) {
        return db.queryForList("SELECT * FROM intelligence.ranking_config_versions WHERE config_version_id = ?", id);
    }

    public void updateDraftConfig(
            UUID id,
            String name,
            String description,
            String weightsJson,
            String subParamsJson,
            String checksum
    ) {
        db.update("""
                UPDATE intelligence.ranking_config_versions
                SET name = ?, description = ?, weights = ?::jsonb, sub_params = ?::jsonb,
                    config_checksum = ?, quality_status = 'UNVALIDATED',
                    mutation_version = mutation_version + 1, updated_at = now()
                WHERE config_version_id = ?
                """,
                name, description, weightsJson, subParamsJson, checksum, id
        );
    }

    public List<Map<String, Object>> findEvaluationRunForValidation(UUID evalRunId) {
        return db.queryForList(
                "SELECT status, split, provenance_tier, query_evaluated, judged_coverage, metrics FROM intelligence.evaluation_runs WHERE eval_run_id = ?",
                evalRunId
        );
    }

    public void updateConfigValidation(UUID id, String nextLifecycle, String qualityStatus) {
        db.update("""
                UPDATE intelligence.ranking_config_versions
                SET lifecycle_status = ?, quality_status = ?, mutation_version = mutation_version + 1, updated_at = now()
                WHERE config_version_id = ?
                """,
                nextLifecycle, qualityStatus, id
        );
    }

    // ── Cohort Snapshots ─────────────────────────────────────────────────────────

    public void insertCohortSnapshot(
            UUID id,
            String versionTag,
            Double globalRatingPrior,
            int globalRatingSample,
            Double globalPopP95,
            int globalPopSample,
            String statsJson,
            int windowDays,
            int minSample,
            String checksum,
            Instant computedAt,
            UUID actor
    ) {
        db.update("""
                INSERT INTO intelligence.cohort_stat_snapshots(
                  snapshot_id, version_tag, global_rating_prior, global_rating_sample,
                  global_pop_p95, global_pop_sample, cohort_stats, window_days, min_sample, checksum, computed_at, created_by
                ) VALUES (?,?,?,?,?,?,?::jsonb,?,?,?,?,?)
                """,
                id, versionTag, globalRatingPrior, globalRatingSample,
                globalPopP95, globalPopSample, statsJson, windowDays, minSample, checksum, Timestamp.from(computedAt), actor
        );
    }

    public List<Map<String, Object>> listCohortSnapshots() {
        return db.queryForList("""
                SELECT snapshot_id, version_tag, global_rating_prior, global_rating_sample,
                       global_pop_p95, global_pop_sample, window_days, min_sample, checksum, computed_at
                FROM intelligence.cohort_stat_snapshots
                ORDER BY computed_at DESC
                LIMIT 20
                """);
    }

    public UUID findLatestCohortSnapshotId() {
        return db.query(
                "SELECT snapshot_id FROM intelligence.cohort_stat_snapshots ORDER BY computed_at DESC LIMIT 1",
                (rs, i) -> rs.getObject(1, UUID.class)
        ).stream().findFirst().orElse(null);
    }

    // ── CF Jobs & Artifacts ──────────────────────────────────────────────────────

    public void insertCfBuildJob(UUID jobId, String paramsJson, String codeRevision, Instant cutoff, UUID actor) {
        db.update("""
                INSERT INTO intelligence.cf_build_jobs(
                  job_id, status, params, code_revision, cutoff_at, created_by
                ) VALUES (?,'QUEUED',?::jsonb,?,?,?)
                """,
                jobId, paramsJson, codeRevision, Timestamp.from(cutoff), actor
        );
    }

    public int claimCfBuildJob(UUID jobId) {
        return db.update("UPDATE intelligence.cf_build_jobs SET status='RUNNING', started_at=now(), progress_pct=10 WHERE job_id=? AND status='QUEUED'", jobId);
    }

    public List<InteractionRecord> loadConsentedInteractionsUntil(Instant cutoff) {
        List<InteractionRecord> records = new ArrayList<>();
        db.query("""
                SELECT i.user_id, i.place_id, i.event_type, i.occurred_at
                FROM intelligence.interactions i
                JOIN intelligence.user_feature_profiles u ON u.user_id = i.user_id
                WHERE u.personalization_enabled = true
                  AND i.user_id IS NOT NULL
                  AND i.place_id IS NOT NULL
                  AND i.event_type IN ('FAVORITE_ADDED','FAVORITE_REMOVED','TRIP_ITEM_ADDED')
                  AND i.occurred_at <= ?
                ORDER BY i.occurred_at ASC, i.interaction_id ASC
                """, rs -> {
            records.add(new InteractionRecord(
                    rs.getObject(1, UUID.class),
                    rs.getObject(2, UUID.class),
                    rs.getString(3),
                    rs.getTimestamp(4).toInstant()
            ));
        }, Timestamp.from(cutoff));
        return records;
    }

    public void updateCfJobProgress(UUID jobId, int progressPct) {
        db.update("UPDATE intelligence.cf_build_jobs SET progress_pct=? WHERE job_id=? AND status='RUNNING'", progressPct, jobId);
    }

    public void insertCfArtifact(
            UUID artifactId,
            UUID jobId,
            String versionTag,
            String artifactKey,
            String artifactChecksum,
            String datasetChecksum,
            String paramsJson,
            Instant cutoff,
            int userCount,
            int itemCount,
            int edgeCount,
            boolean demoFixture,
            UUID actor
    ) {
        db.update("""
                INSERT INTO intelligence.cf_artifacts(
                  artifact_id, job_id, version_tag, artifact_object_key, checksum, dataset_checksum,
                  params, cutoff_at, user_count, item_count, edge_count,
                  lifecycle_status, quality_status, is_demo_fixture, created_by
                ) VALUES (?,?,?,?,?,?,?::jsonb,?,?,?,?,'DRAFT','UNVALIDATED',?,?)
                """,
                artifactId, jobId, versionTag, artifactKey, artifactChecksum, datasetChecksum,
                paramsJson, Timestamp.from(cutoff), userCount, itemCount, edgeCount, demoFixture, actor
        );
    }

    public void markCfJobSucceeded(UUID jobId, String datasetChecksum, UUID artifactId, String logsKey) {
        db.update("""
                UPDATE intelligence.cf_build_jobs
                SET status='SUCCEEDED', progress_pct=100, dataset_checksum=?, artifact_id=?,
                    logs_object_key=?, ended_at=now(), mutation_version=mutation_version+1
                WHERE job_id=? AND status='RUNNING'
                """,
                datasetChecksum, artifactId, logsKey, jobId
        );
    }

    public void markCfJobFailed(UUID jobId, String errorMessage) {
        db.update("""
                UPDATE intelligence.cf_build_jobs
                SET status='FAILED', error_code='CF_BUILD_FAILED', error_message=?,
                    ended_at=now(), mutation_version=mutation_version+1
                WHERE job_id=? AND status IN ('QUEUED','RUNNING')
                """,
                errorMessage, jobId
        );
    }

    public void markCfJobCancelled(UUID jobId) {
        db.update("UPDATE intelligence.cf_build_jobs SET status='CANCELLED', ended_at=now(), mutation_version=mutation_version+1 WHERE job_id=? AND status IN ('QUEUED','RUNNING')", jobId);
    }

    public List<Map<String, Object>> findCfJobById(UUID jobId) {
        return db.queryForList("SELECT * FROM intelligence.cf_build_jobs WHERE job_id = ?", jobId);
    }

    public List<Map<String, Object>> listCfJobs() {
        return db.queryForList("SELECT * FROM intelligence.cf_build_jobs ORDER BY created_at DESC LIMIT 30");
    }

    public List<Map<String, Object>> listCfArtifacts() {
        return db.queryForList("SELECT * FROM intelligence.cf_artifacts ORDER BY created_at DESC LIMIT 30");
    }

    public List<Map<String, Object>> findCfArtifactForUpdate(UUID artifactId) {
        return db.queryForList("SELECT * FROM intelligence.cf_artifacts WHERE artifact_id = ? FOR UPDATE", artifactId);
    }

    public List<Map<String, Object>> findCfArtifactById(UUID artifactId) {
        return db.queryForList("SELECT * FROM intelligence.cf_artifacts WHERE artifact_id = ?", artifactId);
    }

    public List<Map<String, Object>> findCfArtifactSummary(UUID cfId) {
        return db.queryForList("SELECT lifecycle_status, artifact_object_key, checksum FROM intelligence.cf_artifacts WHERE artifact_id = ?", cfId);
    }

    public void updateCfArtifactValidated(UUID artifactId, String quality) {
        db.update("UPDATE intelligence.cf_artifacts SET lifecycle_status='VALIDATED', quality_status=?, mutation_version=mutation_version+1 WHERE artifact_id=?", quality, artifactId);
    }

    // ── Deployments ──────────────────────────────────────────────────────────────

    public List<Map<String, Object>> listDeployments() {
        return db.queryForList("""
                SELECT d.deployment_id, d.use_case, d.config_version_id, c.version_tag AS config_version_tag,
                       c.name AS config_name, d.cohort_snapshot_id, d.cf_artifact_id,
                       d.scorer_versions, d.feature_schema_version, d.evaluation_run_id,
                       d.quality_status, d.is_demo_activation, d.activated_by, d.activated_at,
                       d.deactivated_at, d.reason
                FROM intelligence.ranking_deployments d
                JOIN intelligence.ranking_config_versions c ON c.config_version_id = d.config_version_id
                ORDER BY d.activated_at DESC
                LIMIT 50
                """);
    }

    public void acquireDeploymentLock() {
        db.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended('deploy:place_ranking', 0))", Object.class);
    }

    public void deactivateActiveDeployments(UUID excludingConfigId) {
        db.update("""
                UPDATE intelligence.ranking_config_versions
                SET lifecycle_status = 'INACTIVE', updated_at = now()
                WHERE config_version_id IN (
                  SELECT config_version_id FROM intelligence.ranking_deployments
                  WHERE use_case = 'place_ranking' AND deactivated_at IS NULL
                ) AND config_version_id <> ?
                """, excludingConfigId);
        db.update("UPDATE intelligence.ranking_deployments SET deactivated_at = GREATEST(clock_timestamp(), activated_at) WHERE use_case = 'place_ranking' AND deactivated_at IS NULL");
    }

    public void insertDeployment(
            UUID deploymentId,
            UUID configId,
            UUID cohortId,
            UUID cfId,
            String scorerVersionsJson,
            Object evalRunId,
            Object qualityStatus,
            Object isDemoActivation,
            UUID actor,
            String reason
    ) {
        db.update("""
                INSERT INTO intelligence.ranking_deployments(
                  deployment_id, use_case, config_version_id, cohort_snapshot_id, cf_artifact_id,
                  scorer_versions, feature_schema_version, evaluation_run_id,
                  quality_status, is_demo_activation, activated_by, activated_at, reason
                ) VALUES (?,'place_ranking',?,?,?,?::jsonb,1,?,?,?,?,clock_timestamp(),?)
                """,
                deploymentId, configId, cohortId, cfId,
                scorerVersionsJson, evalRunId, qualityStatus, isDemoActivation, actor, reason
        );
    }

    public void markConfigActive(UUID configId) {
        db.update("UPDATE intelligence.ranking_config_versions SET lifecycle_status='ACTIVE', updated_at=now() WHERE config_version_id=?", configId);
    }

    public void markCfArtifactActive(UUID cfId) {
        db.update("UPDATE intelligence.cf_artifacts SET lifecycle_status='ACTIVE' WHERE artifact_id=?", cfId);
    }

    public List<Map<String, Object>> findDeploymentById(UUID targetDeploymentId) {
        return db.queryForList("SELECT * FROM intelligence.ranking_deployments WHERE deployment_id = ?", targetDeploymentId);
    }

    // ── Operational Analytics ────────────────────────────────────────────────────

    public Map<String, Object> loadRequestSummary(int hours) {
        return db.queryForMap("""
                SELECT
                  COUNT(*) AS total_requests,
                  COALESCE(SUM(CASE WHEN returned_count = 0 THEN 1 ELSE 0 END), 0) AS empty_requests,
                  COALESCE(SUM(CASE WHEN degraded THEN 1 ELSE 0 END), 0) AS degraded_requests,
                  COALESCE(SUM(CASE WHEN fallback_reason IS NOT NULL THEN 1 ELSE 0 END), 0) AS fallback_requests,
                  COALESCE(AVG(candidate_count), 0) AS avg_candidates,
                  COALESCE(AVG(returned_count), 0) AS avg_returned,
                  COALESCE(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY latency_ms), 0) AS p50_ms,
                  COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms), 0) AS p95_ms,
                  COALESCE(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY latency_ms), 0) AS p99_ms
                FROM intelligence.recommendation_requests
                WHERE NOT is_admin_test
                  AND created_at >= now() - (? || ' hours')::interval
                """, hours);
    }

    public List<Map<String, Object>> loadFallbackByReason(int hours) {
        return db.queryForList("""
                SELECT COALESCE(fallback_reason, 'NONE') AS reason, COUNT(*) AS count
                FROM intelligence.recommendation_requests
                WHERE NOT is_admin_test AND fallback_reason IS NOT NULL
                  AND created_at >= now() - (? || ' hours')::interval
                GROUP BY fallback_reason
                ORDER BY count DESC
                """, hours);
    }

    public List<Map<String, Object>> loadEmptyByReason(int hours) {
        return db.queryForList("""
                SELECT COALESCE(empty_reason, 'UNKNOWN') AS reason, COUNT(*) AS count
                FROM intelligence.recommendation_requests
                WHERE NOT is_admin_test AND returned_count = 0
                  AND created_at >= now() - (? || ' hours')::interval
                GROUP BY empty_reason
                ORDER BY count DESC
                """, hours);
    }

    public Map<String, Object> loadScorerStats(int hours) {
        return db.queryForMap("""
                SELECT
                  COALESCE(AVG((scorer_availability->>'basic')::double precision), 0) AS basic_avail,
                  COALESCE(AVG((scorer_availability->>'content')::double precision), 0) AS content_avail,
                  COALESCE(AVG((scorer_availability->>'collaborative')::double precision), 0) AS cf_avail,
                  COALESCE(AVG((scorer_availability->>'context')::double precision), 0) AS context_avail,
                  COALESCE(AVG((effective_weights_summary->>'basic')::double precision), 0) AS eff_w_basic,
                  COALESCE(AVG((effective_weights_summary->>'content')::double precision), 0) AS eff_w_content,
                  COALESCE(AVG((effective_weights_summary->>'collaborative')::double precision), 0) AS eff_w_cf,
                  COALESCE(AVG((effective_weights_summary->>'context')::double precision), 0) AS eff_w_context
                FROM intelligence.recommendation_requests
                WHERE NOT is_admin_test AND returned_count > 0
                  AND created_at >= now() - (? || ' hours')::interval
                """, hours);
    }

    public long countVerifiedImpressions(int hours) {
        return Optional.ofNullable(db.queryForObject("""
                SELECT COUNT(*) FROM intelligence.recommendation_impressions
                WHERE NOT is_admin_test AND received_at >= now() - (? || ' hours')::interval
                """, Long.class, hours)).orElse(0L);
    }

    public List<Map<String, Object>> loadFeedbackCounts(int hours) {
        return db.queryForList("""
                SELECT action_type, COUNT(*) AS count
                FROM intelligence.recommendation_feedback
                WHERE NOT is_admin_test AND received_at >= now() - (? || ' hours')::interval
                GROUP BY action_type
                """, hours);
    }

    public long countAddToTripAttributed(int hours) {
        return Optional.ofNullable(db.queryForObject("""
                SELECT COUNT(*) FROM intelligence.interactions
                WHERE event_type = 'TRIP_ITEM_ADDED'
                  AND context->>'recommendation_request_id' IS NOT NULL
                  AND occurred_at >= now() - (? || ' hours')::interval
                """, Long.class, hours)).orElse(0L);
    }

    public long countPublishedPlaces() {
        return Optional.ofNullable(db.queryForObject(
                "SELECT COUNT(*) FROM intelligence.place_features WHERE status = 'PUBLISHED'",
                Long.class
        )).orElse(0L);
    }

    public long countUniqueRecommendedPlaces(int hours) {
        return Optional.ofNullable(db.queryForObject("""
                SELECT COUNT(DISTINCT rr.place_id)
                FROM intelligence.recommendation_results rr
                JOIN intelligence.recommendation_requests rq ON rq.request_id = rr.request_id
                WHERE NOT rq.is_admin_test AND rq.created_at >= now() - (? || ' hours')::interval
                """, Long.class, hours)).orElse(0L);
    }

    public long countUnratedExposedPlaces(int hours) {
        return Optional.ofNullable(db.queryForObject("""
                SELECT COUNT(DISTINCT rr.place_id)
                FROM intelligence.recommendation_results rr
                JOIN intelligence.recommendation_requests rq ON rq.request_id = rr.request_id
                JOIN intelligence.place_features pf ON pf.place_id = rr.place_id
                WHERE NOT rq.is_admin_test
                  AND rq.created_at >= now() - (? || ' hours')::interval
                  AND COALESCE((pf.features->>'rating_count')::bigint, 0) = 0
                """, Long.class, hours)).orElse(0L);
    }

    public Timestamp findLatestProjectionAsOf() {
        return db.queryForObject("SELECT MAX(as_of) FROM intelligence.place_features WHERE status='PUBLISHED'", Timestamp.class);
    }
}
