package vn.smarttravel.intelligence.ranking.controller;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.intelligence.ranking.service.*;

/**
 * Admin-only Recommendation Ranking Governance, Playground, Dataset/Labeling,
 * Evaluation/Tuning, CF Builder, Deployment, and Operational Analytics endpoints.
 * Protected by SCOPE_intelligence:admin in SecurityConfiguration.
 */
@RestController
@RequestMapping("/api/v1/admin/ranking")
public class AdminRankingController {

    private final RankingServingService serving;
    private final RankingGovernanceService governance;
    private final RankingEvaluationService evaluation;

    public AdminRankingController(
            RankingServingService serving,
            RankingGovernanceService governance,
            RankingEvaluationService evaluation
    ) {
        this.serving = serving;
        this.governance = governance;
        this.evaluation = evaluation;
    }

    private static UUID actor(Authentication auth) {
        return UUID.fromString(auth.getName());
    }

    // ── A. Playground & Request Debug ────────────────────────────────────────────

    @PostMapping("/playground")
    public Map<String, Object> playground(Authentication auth, @RequestBody JsonNode body) {
        return serving.runAdminPlayground(actor(auth), body);
    }

    @GetMapping("/requests/{requestId}/debug")
    public Map<String, Object> requestDebug(Authentication auth, @PathVariable UUID requestId) {
        return serving.getRequestDebug(actor(auth), requestId);
    }

    // ── Projections & Cohort Snapshots ───────────────────────────────────────────

    @PostMapping("/projections/sync")
    public Map<String, Object> syncProjections(Authentication auth) {
        return governance.syncProjectionsAndCohorts(actor(auth));
    }

    @GetMapping("/cohort-snapshots")
    public Map<String, Object> listCohortSnapshots() {
        return Map.of("items", governance.listCohortSnapshots());
    }

    @PostMapping("/cohort-snapshots/recompute")
    public Map<String, Object> recomputeCohorts(
            Authentication auth,
            @RequestParam(defaultValue = "30") int windowDays,
            @RequestParam(defaultValue = "5") int minSample
    ) {
        return governance.recomputeCohortSnapshot(actor(auth), windowDays, minSample);
    }

    // ── D. Config & Deployment Registry ──────────────────────────────────────────

    @GetMapping("/configs")
    public Map<String, Object> listConfigs() {
        return Map.of("items", governance.listConfigs());
    }

    @PostMapping("/configs")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createConfig(Authentication auth, @RequestBody JsonNode body) {
        return governance.createConfig(actor(auth), body);
    }

    @PatchMapping("/configs/{id}")
    public Map<String, Object> updateDraftConfig(Authentication auth, @PathVariable UUID id, @RequestBody JsonNode body) {
        return governance.updateDraftConfig(actor(auth), id, body);
    }

    @PostMapping("/configs/{id}/validate")
    public Map<String, Object> validateConfig(Authentication auth, @PathVariable UUID id, @RequestBody(required = false) JsonNode body) {
        return governance.validateConfig(actor(auth), id, body);
    }

    @GetMapping("/deployments")
    public Map<String, Object> listDeployments() {
        return Map.of("items", governance.listDeployments());
    }

    @PostMapping("/deployments/activate")
    public Map<String, Object> activateDeployment(Authentication auth, @RequestBody JsonNode body) {
        return governance.activateDeployment(actor(auth), body);
    }

    @PostMapping("/deployments/{deploymentId}/rollback")
    public Map<String, Object> rollbackDeployment(Authentication auth, @PathVariable UUID deploymentId, @RequestBody JsonNode body) {
        return governance.rollbackToDeployment(actor(auth), deploymentId, body);
    }

    // ── Item-based CF Builder & Artifacts ────────────────────────────────────────

    @GetMapping("/cf/jobs")
    public Map<String, Object> listCfJobs() {
        return Map.of("items", governance.listCfJobs());
    }

    @PostMapping("/cf/jobs")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, Object> enqueueCfBuild(Authentication auth, @RequestBody JsonNode body) {
        return governance.enqueueCfBuild(actor(auth), body);
    }

    @PostMapping("/cf/jobs/{jobId}/cancel")
    public Map<String, Object> cancelCfJob(Authentication auth, @PathVariable UUID jobId) {
        return governance.cancelCfJob(actor(auth), jobId);
    }

    @GetMapping("/cf/artifacts")
    public Map<String, Object> listCfArtifacts() {
        return Map.of("items", governance.listCfArtifacts());
    }

    @PostMapping("/cf/artifacts/{artifactId}/validate")
    public Map<String, Object> validateCfArtifact(Authentication auth, @PathVariable UUID artifactId, @RequestBody(required = false) JsonNode body) {
        return governance.validateCfArtifact(actor(auth), artifactId, body);
    }

    // ── B. Datasets & Labeling ───────────────────────────────────────────────────

    @GetMapping("/datasets")
    public Map<String, Object> listDatasets() {
        return Map.of("items", evaluation.listDatasets());
    }

    @PostMapping("/datasets")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createDataset(Authentication auth, @RequestBody JsonNode body) {
        return evaluation.createDataset(actor(auth), body);
    }

    @GetMapping("/datasets/{datasetId}")
    public Map<String, Object> getDataset(@PathVariable UUID datasetId) {
        return evaluation.getDatasetDetail(datasetId);
    }

    @PostMapping("/datasets/{datasetId}/judgments")
    public Map<String, Object> upsertJudgment(Authentication auth, @PathVariable UUID datasetId, @RequestBody JsonNode body) {
        return evaluation.upsertJudgment(actor(auth), datasetId, body);
    }

    @PostMapping("/datasets/{datasetId}/import")
    public Map<String, Object> importJudgments(Authentication auth, @PathVariable UUID datasetId, @RequestBody JsonNode body) {
        return evaluation.importJudgments(actor(auth), datasetId, body);
    }

    @GetMapping("/datasets/{datasetId}/export")
    public Map<String, Object> exportDataset(@PathVariable UUID datasetId, @RequestParam(defaultValue = "JSONL") String format) {
        return evaluation.exportDataset(datasetId, format);
    }

    @PostMapping("/datasets/{datasetId}/freeze")
    public Map<String, Object> freezeDataset(Authentication auth, @PathVariable UUID datasetId) {
        return evaluation.freezeDataset(actor(auth), datasetId);
    }

    @PostMapping("/datasets/seed-fixture")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> seedFixture(Authentication auth) {
        return evaluation.seedSyntheticFixtureDataset(actor(auth));
    }

    @PostMapping("/datasets/create-labeling-pool")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createLabelingPool(Authentication auth, @RequestBody(required = false) JsonNode body) {
        return evaluation.createHumanLabelingPool(actor(auth), body);
    }

    // ── C. Evaluations & Weight Tuning ───────────────────────────────────────────

    @GetMapping("/evaluations")
    public Map<String, Object> listEvaluations() {
        return Map.of("items", evaluation.listEvaluationRuns());
    }

    @PostMapping("/evaluations")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, Object> startEvaluation(Authentication auth, @RequestBody JsonNode body) {
        return evaluation.startEvaluation(actor(auth), body);
    }

    @PostMapping("/evaluations/{runId}/cancel")
    public Map<String, Object> cancelEvaluation(Authentication auth, @PathVariable UUID runId) {
        return evaluation.cancelEvaluation(actor(auth), runId);
    }

    @GetMapping("/tuning")
    public Map<String, Object> listTuningJobs() {
        return Map.of("items", evaluation.listTuningJobs());
    }

    @PostMapping("/tuning")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public Map<String, Object> startTuning(Authentication auth, @RequestBody JsonNode body) {
        return evaluation.startTuning(actor(auth), body);
    }

    @PostMapping("/tuning/{jobId}/cancel")
    public Map<String, Object> cancelTuning(Authentication auth, @PathVariable UUID jobId) {
        return evaluation.cancelTuning(actor(auth), jobId);
    }

    @GetMapping("/tuning/{jobId}/trials")
    public Map<String, Object> listTuningTrials(@PathVariable UUID jobId) {
        return Map.of("items", evaluation.listTuningTrials(jobId));
    }

    // ── E. Operational Analytics ─────────────────────────────────────────────────

    @GetMapping("/analytics")
    public Map<String, Object> analytics(@RequestParam(defaultValue = "168") int windowHours) {
        return governance.operationalAnalytics(windowHours);
    }
}
