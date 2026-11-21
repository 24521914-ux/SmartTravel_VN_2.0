package vn.smarttravel.intelligence.ranking.eval;

import static org.assertj.core.api.Assertions.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.junit.jupiter.api.Test;
import vn.smarttravel.intelligence.ranking.domain.CohortStatsCalculator;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;
import vn.smarttravel.intelligence.ranking.eval.RankingEvaluator.*;

/** Tests offline metrics (NDCG@K with 2^grade-1, Precision@K grade>=2, Recall, Coverage, Diversity, Guardrails, Weight Tuning). */
class RankingEvaluatorAndTunerTests {

    private static final Instant NOW = Instant.parse("2026-11-21T12:00:00Z");
    private static final UUID DEST = UUID.fromString("50000000-0000-0000-0000-000000000001");
    private static final UUID CAT1 = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final UUID CAT2 = UUID.fromString("10000000-0000-0000-0000-000000000002");

    @Test
    void ndcgPrecisionAndTunerRespectGuardrailsAndValidationSplit() {
        UUID p1 = UUID.fromString("00000000-0000-4000-8000-000000000011");
        UUID p2 = UUID.fromString("00000000-0000-4000-8000-000000000012");
        UUID p3 = UUID.fromString("00000000-0000-4000-8000-000000000013");
        UUID p4 = UUID.fromString("00000000-0000-4000-8000-000000000014");

        List<PlaceSnapshot> catalog = List.of(
                new PlaceSnapshot(p1, 1, 1, "PUBLISHED", "Sea Spot", null, "Addr", null, Set.of(CAT1), null, Set.of(DEST), Set.of("sea_view", "sunset"), Set.of(), 50_000.0, 50_000.0, "VND", BudgetBasis.PER_PERSON, 16.050, 108.220, 20, 96.0, 15, true, SpaceType.OUTDOOR, List.of(), NOW.minus(60, ChronoUnit.DAYS), NOW, null),
                new PlaceSnapshot(p2, 1, 1, "PUBLISHED", "Cafe Quiet", null, "Addr", null, Set.of(CAT2), null, Set.of(DEST), Set.of("quiet"), Set.of(), 40_000.0, 40_000.0, "VND", BudgetBasis.PER_PERSON, 16.055, 108.225, 15, 66.0, 8, true, SpaceType.INDOOR, List.of(), NOW.minus(60, ChronoUnit.DAYS), NOW, null),
                new PlaceSnapshot(p3, 1, 1, "PUBLISHED", "Far Spot", null, "Addr", null, Set.of(CAT1), null, Set.of(DEST), Set.of("mountain"), Set.of(), 80_000.0, 80_000.0, "VND", BudgetBasis.PER_PERSON, 16.120, 108.300, 5, 17.5, 1, true, SpaceType.OUTDOOR, List.of(), NOW.minus(60, ChronoUnit.DAYS), NOW, null),
                new PlaceSnapshot(p4, 1, 1, "PUBLISHED", "Budget Food", null, "Addr", null, Set.of(CAT2), null, Set.of(DEST), Set.of("street_food"), Set.of(), 30_000.0, 30_000.0, "VND", BudgetBasis.PER_PERSON, 16.051, 108.221, 30, 138.0, 20, true, SpaceType.INDOOR, List.of(), NOW.minus(60, ChronoUnit.DAYS), NOW, null)
        );

        CohortStats cohorts = new CohortStatsCalculator().compute("snap-eval", catalog, 30, 2, NOW);
        RankingRequest req = new RankingRequest(
                10, "VND", BudgetBasis.PER_PERSON, DEST, null, Set.of(),
                Set.of(), Set.of(), Map.of("sea_view", 1.0, "sunset", 1.0),
                null, 100_000.0, null, null, 16.050, 108.220, 15.0,
                null, null, null, null, "Asia/Ho_Chi_Minh", false, false, null, NOW
        );
        JudgmentQuery q = new JudgmentQuery("q1", "g1", "VALIDATION", req, UserContext.guest(),
                Map.of(p1, 3, p4, 2, p2, 1, p3, 0));

        RankingEvaluator eval = new RankingEvaluator();
        EvaluationReport report = eval.evaluate(List.of(q), catalog, RankingConfig.baseline(), cohorts, null, BaselineMode.HYBRID_V1, Set.of());

        assertThat(report.queriesEvaluated()).isEqualTo(1);
        assertThat(report.hardConstraintViolations()).isZero();
        assertThat(report.ndcgAt10()).isGreaterThan(0.8);
        assertThat(report.judgedCoverage()).isEqualTo(1.0);
        assertThat(report.metrics()).containsKeys("ndcg_at_5", "ndcg_at_10", "precision_at_5", "precision_at_10", "recall_at_10", "hit_rate_at_10", "catalog_coverage", "intra_list_category_diversity_at_10");

        WeightTuner tuner = new WeightTuner();
        WeightTuner.TuningResult tuned = tuner.tune(
                List.of(q), catalog, RankingConfig.baseline(), cohorts, null, Set.of(),
                WeightTuner.Strategy.RANDOM, 123L, 8, WeightTuner.Guardrails.defaults(), () -> false, null
        );
        assertThat(tuned.trials()).hasSize(8);
        assertThat(tuned.bestTrial()).isNotNull();
        assertThat(tuned.bestTrial().guardrailsPassed()).isTrue();
        assertThat(tuned.bestTrial().hardViolations()).isZero();
    }
}
