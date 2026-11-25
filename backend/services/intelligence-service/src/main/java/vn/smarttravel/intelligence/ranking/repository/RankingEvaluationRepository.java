package vn.smarttravel.intelligence.ranking.repository;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.json;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * JDBC persistence layer for evaluation datasets, human judgments, evaluation runs, and weight tuning jobs.
 */
@Repository
public class RankingEvaluationRepository {

    private final JdbcTemplate db;

    public RankingEvaluationRepository(JdbcTemplate db) {
        this.db = db;
    }

    public List<Map<String, Object>> listDatasets() {
        return db.queryForList("""
                SELECT eval_dataset_id, name, dataset_kind, provenance_tier, status,
                       feature_snapshot_ref, cutoff_at, description, query_count, row_count,
                       labeled_count, unlabeled_count, insufficient_info_count,
                       split_counts, checksum, created_at, frozen_at
                FROM intelligence.eval_datasets
                ORDER BY created_at DESC
                LIMIT 50
                """);
    }

    public void insertDataset(
            UUID id,
            String name,
            String kind,
            String tier,
            String snapRef,
            Instant cutoff,
            String desc,
            UUID actor
    ) {
        db.update("""
                INSERT INTO intelligence.eval_datasets(
                  eval_dataset_id, name, dataset_kind, provenance_tier, status,
                  feature_snapshot_ref, cutoff_at, description, created_by
                ) VALUES (?,?,?,?,'DRAFT',?,?,?,?)
                """,
                id, name, kind, tier, snapRef, Timestamp.from(cutoff), desc, actor
        );
    }

    public List<Map<String, Object>> findDatasetById(UUID id) {
        return db.queryForList("SELECT * FROM intelligence.eval_datasets WHERE eval_dataset_id = ?", id);
    }

    public List<Map<String, Object>> findDatasetStatus(UUID datasetId) {
        return db.queryForList("SELECT status FROM intelligence.eval_datasets WHERE eval_dataset_id = ?", datasetId);
    }

    public List<Map<String, Object>> listDatasetJudgmentsWithPlaceFeatures(UUID datasetId) {
        return db.queryForList("""
                SELECT j.judgment_id, j.query_id, j.scenario_group, j.request_payload, j.place_id,
                       j.relevance_grade, j.judgment_status, j.annotator, j.provenance, j.split,
                       j.feature_snapshot_ref, j.judged_at, j.notes,
                       pf.features AS place_features
                FROM intelligence.eval_judgments j
                LEFT JOIN intelligence.place_features pf ON pf.place_id = j.place_id
                WHERE j.eval_dataset_id = ?
                ORDER BY j.split, j.query_id,
                         CASE j.judgment_status WHEN 'UNLABELED' THEN 0 WHEN 'LABELED' THEN 1 ELSE 2 END,
                         j.place_id
                LIMIT 600
                """, datasetId);
    }

    public List<Map<String, Object>> findExistingQueryPayload(UUID datasetId, String queryId) {
        return db.queryForList(
                "SELECT request_payload, notes FROM intelligence.eval_judgments WHERE eval_dataset_id = ? AND query_id = ? LIMIT 1",
                datasetId, queryId
        );
    }

    public void upsertJudgment(
            UUID datasetId,
            String queryId,
            String scenarioGroup,
            String reqPayloadJson,
            UUID placeId,
            Integer grade,
            String status,
            String annotator,
            String provenance,
            String split,
            String notes
    ) {
        db.update("""
                INSERT INTO intelligence.eval_judgments(
                  judgment_id, eval_dataset_id, query_id, scenario_group, request_payload,
                  place_id, relevance_grade, judgment_status, annotator, provenance, split, notes
                ) VALUES (?,?,?,?,?::jsonb,?,?,?,?,?,?,?)
                ON CONFLICT (eval_dataset_id, query_id, place_id) DO UPDATE SET
                  scenario_group = excluded.scenario_group,
                  request_payload = excluded.request_payload,
                  relevance_grade = excluded.relevance_grade,
                  judgment_status = excluded.judgment_status,
                  annotator = excluded.annotator,
                  provenance = excluded.provenance,
                  split = excluded.split,
                  notes = excluded.notes,
                  judged_at = now()
                """,
                UUID.randomUUID(), datasetId, queryId, scenarioGroup, reqPayloadJson,
                placeId, grade, status, annotator, provenance, split, notes
        );
    }

    public void upsertImportedJudgment(
            UUID datasetId,
            String queryId,
            String scenarioGroup,
            String reqPayloadJson,
            UUID placeId,
            int grade,
            String annotator,
            String provenance,
            String split,
            String notes
    ) {
        db.update("""
                INSERT INTO intelligence.eval_judgments(
                  judgment_id, eval_dataset_id, query_id, scenario_group, request_payload,
                  place_id, relevance_grade, annotator, provenance, split, notes
                ) VALUES (?,?,?,?,?::jsonb,?,?,?,?,?,?)
                ON CONFLICT (eval_dataset_id, query_id, place_id) DO UPDATE SET
                  relevance_grade = excluded.relevance_grade,
                  request_payload = excluded.request_payload,
                  split = excluded.split,
                  annotator = excluded.annotator,
                  provenance = excluded.provenance,
                  judged_at = now()
                """,
                UUID.randomUUID(), datasetId, queryId, scenarioGroup, reqPayloadJson,
                placeId, grade, annotator, provenance, split, notes
        );
    }

    public void insertUnlabeledJudgmentIfAbsent(
            UUID datasetId,
            String queryId,
            String scenarioGroup,
            String reqPayloadJson,
            UUID placeId,
            String split,
            String intentNote
    ) {
        db.update("""
                INSERT INTO intelligence.eval_judgments(
                  judgment_id, eval_dataset_id, query_id, scenario_group, request_payload,
                  place_id, relevance_grade, judgment_status, annotator, provenance, split, notes
                ) VALUES (?,?,?,?,?::jsonb,?,NULL,'UNLABELED','pending-human','HUMAN_REVIEW_PENDING',?,?)
                ON CONFLICT (eval_dataset_id, query_id, place_id) DO NOTHING
                """,
                UUID.randomUUID(), datasetId, queryId, scenarioGroup, reqPayloadJson,
                placeId, split, intentNote
        );
    }

    public void insertSyntheticJudgmentIfAbsent(
            UUID datasetId,
            String queryId,
            String scenarioGroup,
            String reqPayloadJson,
            UUID placeId,
            int grade,
            String split
    ) {
        db.update("""
                INSERT INTO intelligence.eval_judgments(
                  judgment_id, eval_dataset_id, query_id, scenario_group, request_payload,
                  place_id, relevance_grade, annotator, provenance, split, notes
                ) VALUES (?,?,?,?,?::jsonb,?,?,?,?,?,?)
                ON CONFLICT (eval_dataset_id, query_id, place_id) DO NOTHING
                """,
                UUID.randomUUID(), datasetId, queryId, scenarioGroup, reqPayloadJson,
                placeId, grade, "synthetic-seeder", "SYNTHETIC_FIXTURE", split,
                "Functional fixture row (not human judgment)"
        );
    }

    public List<Map<String, Object>> listJudgmentsForExport(UUID datasetId) {
        return db.queryForList("""
                SELECT query_id, scenario_group, place_id, relevance_grade, judgment_status, split, annotator, provenance, request_payload, notes
                FROM intelligence.eval_judgments
                WHERE eval_dataset_id = ?
                ORDER BY split, query_id, place_id
                """, datasetId);
    }

    public int countLabeledJudgments(UUID datasetId) {
        return Optional.ofNullable(db.queryForObject(
                "SELECT COUNT(*) FROM intelligence.eval_judgments WHERE eval_dataset_id = ? AND judgment_status = 'LABELED'",
                Integer.class, datasetId
        )).orElse(0);
    }

    public void freezeDataset(UUID datasetId, String checksum, String artifactKey) {
        db.update("""
                UPDATE intelligence.eval_datasets
                SET status = 'FROZEN', checksum = ?, artifact_object_key = ?, frozen_at = now(), mutation_version = mutation_version + 1
                WHERE eval_dataset_id = ?
                """, checksum, artifactKey, datasetId);
    }

    public List<Map<String, Object>> listDistinctSplitsForScenarioGroup(UUID datasetId, String scenarioGroup) {
        return db.queryForList(
                "SELECT DISTINCT split FROM intelligence.eval_judgments WHERE eval_dataset_id = ? AND scenario_group = ?",
                datasetId, scenarioGroup
        );
    }

    public void refreshDatasetCounts(UUID datasetId) {
        var counts = db.queryForMap("""
                SELECT
                  COUNT(*) AS total_rows,
                  COUNT(DISTINCT query_id) AS total_queries,
                  COALESCE(SUM(CASE WHEN judgment_status = 'LABELED' THEN 1 ELSE 0 END), 0) AS labeled_cnt,
                  COALESCE(SUM(CASE WHEN judgment_status = 'UNLABELED' THEN 1 ELSE 0 END), 0) AS unlabeled_cnt,
                  COALESCE(SUM(CASE WHEN judgment_status = 'INSUFFICIENT_INFO' THEN 1 ELSE 0 END), 0) AS insuff_cnt
                FROM intelligence.eval_judgments
                WHERE eval_dataset_id = ?
                """, datasetId);
        var splits = db.queryForList(
                "SELECT split, COUNT(DISTINCT query_id) AS qcnt FROM intelligence.eval_judgments WHERE eval_dataset_id = ? GROUP BY split",
                datasetId
        );
        Map<String, Integer> splitMap = new LinkedHashMap<>();
        for (var s : splits) splitMap.put(String.valueOf(s.get("split")), ((Number) s.get("qcnt")).intValue());
        db.update("""
                UPDATE intelligence.eval_datasets
                SET query_count = ?, row_count = ?, labeled_count = ?, unlabeled_count = ?,
                    insufficient_info_count = ?, split_counts = ?::jsonb
                WHERE eval_dataset_id = ?
                """,
                ((Number) counts.get("total_queries")).intValue(),
                ((Number) counts.get("total_rows")).intValue(),
                ((Number) counts.get("labeled_cnt")).intValue(),
                ((Number) counts.get("unlabeled_cnt")).intValue(),
                ((Number) counts.get("insuff_cnt")).intValue(),
                json(splitMap),
                datasetId
        );
    }

    public List<Map<String, Object>> listEvaluationRuns() {
        return db.queryForList("""
                SELECT r.eval_run_id, r.eval_dataset_id, d.name AS dataset_name,
                       r.config_version_id, c.version_tag AS config_version_tag,
                       r.cf_artifact_id, r.baseline_mode, r.split, r.status,
                       r.provenance_tier, r.code_revision, r.dataset_checksum,
                       r.metrics, r.slice_metrics, r.methodology,
                       r.query_evaluated, r.query_excluded, r.judged_coverage,
                       r.error_message, r.started_at, r.ended_at, r.created_at
                FROM intelligence.evaluation_runs r
                JOIN intelligence.eval_datasets d ON d.eval_dataset_id = r.eval_dataset_id
                LEFT JOIN intelligence.ranking_config_versions c ON c.config_version_id = r.config_version_id
                ORDER BY r.created_at DESC
                LIMIT 50
                """);
    }

    public void insertEvaluationRun(
            UUID runId,
            UUID datasetId,
            UUID configId,
            UUID cfId,
            UUID cohortSnapshotId,
            String baselineMode,
            String split,
            Object provenanceTier,
            String codeRevision,
            Object datasetChecksum,
            UUID actor
    ) {
        db.update("""
                INSERT INTO intelligence.evaluation_runs(
                  eval_run_id, eval_dataset_id, config_version_id, cf_artifact_id, cohort_snapshot_id,
                  baseline_mode, split, status, provenance_tier, code_revision, dataset_checksum, created_by
                ) VALUES (?,?,?,?,?,?,?,'QUEUED',?,?,?,?)
                """,
                runId, datasetId, configId, cfId, cohortSnapshotId,
                baselineMode, split, provenanceTier, codeRevision, datasetChecksum, actor
        );
    }

    public int markEvaluationRunRunning(UUID runId) {
        return db.update("UPDATE intelligence.evaluation_runs SET status='RUNNING', started_at=now() WHERE eval_run_id=? AND status='QUEUED'", runId);
    }

    public void markEvaluationRunCancelled(UUID runId) {
        db.update("UPDATE intelligence.evaluation_runs SET status='CANCELLED', ended_at=now() WHERE eval_run_id=?", runId);
    }

    public void markEvaluationRunCancelledIfActive(UUID runId) {
        db.update("UPDATE intelligence.evaluation_runs SET status='CANCELLED', ended_at=now() WHERE eval_run_id=? AND status IN ('QUEUED','RUNNING')", runId);
    }

    public void markEvaluationRunSucceeded(
            UUID runId,
            String metricsJson,
            String slicesJson,
            String methodologyJson,
            int queriesEvaluated,
            int queriesExcluded,
            double judgedCoverage
    ) {
        db.update("""
                UPDATE intelligence.evaluation_runs
                SET status='SUCCEEDED', metrics=?::jsonb, slice_metrics=?::jsonb, methodology=?::jsonb,
                    query_evaluated=?, query_excluded=?, judged_coverage=?, ended_at=now()
                WHERE eval_run_id=? AND status='RUNNING'
                """,
                metricsJson, slicesJson, methodologyJson,
                queriesEvaluated, queriesExcluded, judgedCoverage, runId
        );
    }

    public void markEvaluationRunFailed(UUID runId, String errorMessage) {
        db.update("UPDATE intelligence.evaluation_runs SET status='FAILED', error_message=?, ended_at=now() WHERE eval_run_id=?",
                errorMessage, runId);
    }

    public List<Map<String, Object>> findEvaluationRunById(UUID runId) {
        return db.queryForList("SELECT * FROM intelligence.evaluation_runs WHERE eval_run_id = ?", runId);
    }

    public List<Map<String, Object>> listTuningJobs() {
        return db.queryForList("""
                SELECT t.*, d.name AS dataset_name, d.provenance_tier,
                       c.version_tag AS base_config_tag
                FROM intelligence.tuning_jobs t
                JOIN intelligence.eval_datasets d ON d.eval_dataset_id = t.eval_dataset_id
                JOIN intelligence.ranking_config_versions c ON c.config_version_id = t.base_config_version_id
                ORDER BY t.created_at DESC
                LIMIT 30
                """);
    }

    public List<Map<String, Object>> listTuningTrials(UUID jobId) {
        return db.queryForList("""
                SELECT trial_id, trial_no, candidate_weights, candidate_sub_params,
                       ndcg_at_10, precision_at_10, hard_violations, catalog_coverage,
                       p95_latency_ms, guardrails_passed, metrics, created_at
                FROM intelligence.tuning_trials
                WHERE tuning_job_id = ?
                ORDER BY trial_no ASC
                """, jobId);
    }

    public int countValidationLabeledQueries(UUID datasetId) {
        return Optional.ofNullable(db.queryForObject(
                "SELECT COUNT(DISTINCT query_id) FROM intelligence.eval_judgments WHERE eval_dataset_id = ? AND split = 'VALIDATION' AND judgment_status = 'LABELED'",
                Integer.class, datasetId
        )).orElse(0);
    }

    public void insertTuningJob(
            UUID jobId,
            UUID datasetId,
            UUID baseConfigId,
            String strategy,
            long seed,
            int maxTrials,
            String searchSpaceJson,
            String guardrailsJson,
            boolean isDemo,
            Object datasetChecksum,
            String codeRevision,
            UUID actor
    ) {
        db.update("""
                INSERT INTO intelligence.tuning_jobs(
                  tuning_job_id, eval_dataset_id, base_config_version_id, split, strategy,
                  seed, max_trials, status, search_space, guardrails, is_demo_run,
                  dataset_checksum, code_revision, created_by
                ) VALUES (?,?,?,'VALIDATION',?,?,?,'QUEUED',?::jsonb,?::jsonb,?,?,?,?)
                """,
                jobId, datasetId, baseConfigId, strategy, seed, maxTrials,
                searchSpaceJson, guardrailsJson, isDemo, datasetChecksum, codeRevision, actor
        );
    }

    public int markTuningJobRunning(UUID jobId) {
        return db.update("UPDATE intelligence.tuning_jobs SET status='RUNNING', started_at=now() WHERE tuning_job_id=? AND status='QUEUED'", jobId);
    }

    public void insertTuningTrial(
            UUID trialId,
            UUID jobId,
            int trialNo,
            String weightsJson,
            String subParamsJson,
            double ndcgAt10,
            double precisionAt10,
            int hardViolations,
            double catalogCoverage,
            double p95LatencyMs,
            boolean guardrailsPassed,
            String metricsJson
    ) {
        db.update("""
                INSERT INTO intelligence.tuning_trials(
                  trial_id, tuning_job_id, trial_no, candidate_weights, candidate_sub_params,
                  ndcg_at_10, precision_at_10, hard_violations, catalog_coverage,
                  p95_latency_ms, guardrails_passed, metrics
                ) VALUES (?,?,?,?::jsonb,?::jsonb,?,?,?,?,?,?,?::jsonb)
                """,
                trialId, jobId, trialNo, weightsJson, subParamsJson,
                ndcgAt10, precisionAt10, hardViolations, catalogCoverage,
                p95LatencyMs, guardrailsPassed, metricsJson
        );
    }

    public void updateTuningJobProgress(UUID jobId, int completedTrials) {
        db.update("UPDATE intelligence.tuning_jobs SET completed_trials = ? WHERE tuning_job_id = ?", completedTrials, jobId);
    }

    public void markTuningJobCancelled(UUID jobId) {
        db.update("UPDATE intelligence.tuning_jobs SET status='CANCELLED', ended_at=now() WHERE tuning_job_id=?", jobId);
    }

    public void markTuningJobCancelledIfActive(UUID jobId) {
        db.update("UPDATE intelligence.tuning_jobs SET status='CANCELLED', ended_at=now() WHERE tuning_job_id=? AND status IN ('QUEUED','RUNNING')", jobId);
    }

    public void insertTunedDraftConfig(
            UUID draftConfigId,
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
                ) VALUES (?,?,?,?,?::jsonb,?::jsonb,?::jsonb,'DRAFT','QUALITY_PENDING',?,?)
                """,
                draftConfigId, versionTag, name, description,
                weightsJson, subParamsJson, scorerVersionsJson, checksum, actor
        );
    }

    public void markTuningJobSucceeded(UUID jobId, UUID bestTrialId, UUID draftConfigId) {
        db.update("""
                UPDATE intelligence.tuning_jobs
                SET status='SUCCEEDED', best_trial_id=?, best_config_version_id=?, ended_at=now()
                WHERE tuning_job_id=?
                """, bestTrialId, draftConfigId, jobId);
    }

    public void markTuningJobFailed(UUID jobId, String errorMessage) {
        db.update("UPDATE intelligence.tuning_jobs SET status='FAILED', error_message=?, ended_at=now() WHERE tuning_job_id=?",
                errorMessage, jobId);
    }

    public List<Map<String, Object>> findTuningJobById(UUID jobId) {
        return db.queryForList("SELECT * FROM intelligence.tuning_jobs WHERE tuning_job_id = ?", jobId);
    }

    public List<Map<String, Object>> listLabeledJudgments(UUID datasetId, String split) {
        if ("ALL".equals(split)) {
            return db.queryForList(
                    "SELECT query_id, scenario_group, split, request_payload, place_id, relevance_grade FROM intelligence.eval_judgments WHERE eval_dataset_id = ? AND judgment_status = 'LABELED' AND relevance_grade IS NOT NULL ORDER BY query_id, place_id",
                    datasetId
            );
        }
        return db.queryForList(
                "SELECT query_id, scenario_group, split, request_payload, place_id, relevance_grade FROM intelligence.eval_judgments WHERE eval_dataset_id = ? AND split = ? AND judgment_status = 'LABELED' AND relevance_grade IS NOT NULL ORDER BY query_id, place_id",
                datasetId, split
        );
    }
}
