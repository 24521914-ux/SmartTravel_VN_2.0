package vn.smarttravel.intelligence.ranking.eval;

import java.util.*;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;
import vn.smarttravel.intelligence.ranking.eval.RankingEvaluator.*;

/**
 * Bounded, seeded Grid/Random weight tuner on the VALIDATION split only (never holdout TEST).
 * Optimizes primary metric NDCG@10 subject to strict guardrails (hard violations == 0, coverage, latency).
 * Produces a candidate DRAFT config — NEVER auto-activates.
 */
public final class WeightTuner {

    public enum Strategy { GRID, RANDOM }

    public record Guardrails(
            double minCatalogCoverage,
            double maxP95LatencyMs,
            int maxHardViolations
    ) {
        public static Guardrails defaults() {
            return new Guardrails(0.0, 800.0, 0);
        }
    }

    public record TrialResult(
            int trialNo,
            double wBasic,
            double wContent,
            double wCollaborative,
            double wContext,
            double ratingM,
            double distanceScaleKm,
            double ndcgAt10,
            double precisionAt10,
            int hardViolations,
            double catalogCoverage,
            double p95LatencyMs,
            boolean guardrailsPassed,
            Map<String, Object> metrics
    ) {}

    public record TuningResult(
            List<TrialResult> trials,
            TrialResult bestTrial,
            boolean cancelled
    ) {}

    private final RankingEvaluator evaluator;

    public WeightTuner() {
        this(new RankingEvaluator());
    }

    public WeightTuner(RankingEvaluator evaluator) {
        this.evaluator = evaluator;
    }

    public TuningResult tune(
            List<JudgmentQuery> validationQueries,
            List<PlaceSnapshot> catalogSnapshot,
            RankingConfig baseConfig,
            CohortStats cohorts,
            CfArtifactData cfArtifact,
            Set<UUID> inactiveCategories,
            Strategy strategy,
            long seed,
            int maxTrials,
            Guardrails guardrails,
            BooleanSupplier isCancelled,
            Consumer<TrialResult> onTrialCompleted
    ) {
        int budget = Math.max(1, Math.min(maxTrials, 200));
        Guardrails rules = guardrails == null ? Guardrails.defaults() : guardrails;
        List<double[]> candidates = generateCandidates(strategy, seed, budget, baseConfig);

        List<TrialResult> results = new ArrayList<>();
        TrialResult best = null;
        boolean cancelled = false;

        for (int i = 0; i < candidates.size(); i++) {
            if (isCancelled != null && isCancelled.getAsBoolean()) {
                cancelled = true;
                break;
            }
            double[] c = candidates.get(i);
            RankingConfig trialCfg = new RankingConfig(
                    baseConfig.configVersionId(),
                    baseConfig.versionTag() + "-trial-" + (i + 1),
                    c[0], c[1], c[2], c[3],
                    c[4], baseConfig.ratingWeight(), baseConfig.popularityWeight(), baseConfig.popularityWindowDays(),
                    baseConfig.minObservationDays(), baseConfig.cohortMinSample(),
                    c[5], baseConfig.distanceWeight(), baseConfig.weatherWeight(), baseConfig.useMaxDistanceAsScale(),
                    baseConfig.cfLambda(), baseConfig.cfTopK(), baseConfig.cfHistoryLimit(),
                    baseConfig.cfFavoriteWeight(), baseConfig.cfTripWeight(),
                    baseConfig.candidateCap(), baseConfig.topNDefault(), baseConfig.topNMax(),
                    baseConfig.diversityEnabled(), baseConfig.unknownPricePolicy(),
                    baseConfig.scorerVersions(), "QUALITY_PENDING"
            );

            EvaluationReport report = evaluator.evaluate(
                    validationQueries, catalogSnapshot, trialCfg, cohorts, cfArtifact,
                    BaselineMode.CHALLENGER, inactiveCategories
            );

            boolean passed = report.hardConstraintViolations() <= rules.maxHardViolations()
                    && report.catalogCoverage() >= rules.minCatalogCoverage()
                    && report.p95LatencyMs() <= rules.maxP95LatencyMs();

            TrialResult tr = new TrialResult(
                    i + 1, c[0], c[1], c[2], c[3], c[4], c[5],
                    report.ndcgAt10(), report.precisionAt10(),
                    report.hardConstraintViolations(), report.catalogCoverage(), report.p95LatencyMs(),
                    passed, report.metrics()
            );
            results.add(tr);
            if (onTrialCompleted != null) onTrialCompleted.accept(tr);

            if (passed && (best == null || tr.ndcgAt10() > best.ndcgAt10()
                    || (tr.ndcgAt10() == best.ndcgAt10() && tr.precisionAt10() > best.precisionAt10()))) {
                best = tr;
            }
        }

        return new TuningResult(List.copyOf(results), best, cancelled);
    }

    private List<double[]> generateCandidates(Strategy strategy, long seed, int budget, RankingConfig base) {
        List<double[]> out = new ArrayList<>();
        // Always evaluate current baseline as trial #1 for direct reference
        out.add(new double[]{
                base.weightBasic(), base.weightContent(), base.weightCollaborative(), base.weightContext(),
                base.ratingM(), base.distanceScaleKm()
        });

        if (strategy == Strategy.GRID) {
            double[] steps = {0.10, 0.20, 0.30, 0.45, 0.60};
            double[] mValues = {5.0, 10.0, 20.0};
            double[] distScales = {3.0, 5.0, 10.0};
            for (double wB : steps) {
                for (double wC : steps) {
                    for (double wF : new double[]{0.0, 0.10, 0.20}) {
                        for (double wX : new double[]{0.15, 0.25, 0.35}) {
                            double sum = wB + wC + wF + wX;
                            if (sum <= 0.0) continue;
                            if (out.size() >= budget) return out;
                            double m = mValues[out.size() % mValues.length];
                            double d = distScales[(out.size() / mValues.length) % distScales.length];
                            out.add(new double[]{
                                    round3(wB / sum), round3(wC / sum), round3(wF / sum), round3(wX / sum), m, d
                            });
                        }
                    }
                }
            }
            return out;
        }

        // Seeded Random Dirichlet-like sampling over [wB, wC, wF, wX] + discrete sub-params
        Random rng = new Random(seed);
        double[] mChoices = {5.0, 10.0, 15.0, 20.0};
        double[] distChoices = {3.0, 5.0, 8.0, 10.0};
        while (out.size() < budget) {
            double rB = -Math.log(Math.max(1e-6, rng.nextDouble()));
            double rC = -Math.log(Math.max(1e-6, rng.nextDouble()));
            double rF = -Math.log(Math.max(1e-6, rng.nextDouble())) * 0.5;
            double rX = -Math.log(Math.max(1e-6, rng.nextDouble()));
            double s = rB + rC + rF + rX;
            double m = mChoices[rng.nextInt(mChoices.length)];
            double d = distChoices[rng.nextInt(distChoices.length)];
            out.add(new double[]{round3(rB / s), round3(rC / s), round3(rF / s), round3(rX / s), m, d});
        }
        return out;
    }

    private static double round3(double v) {
        return Math.round(v * 1000.0) / 1000.0;
    }
}
