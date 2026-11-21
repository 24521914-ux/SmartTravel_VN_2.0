package vn.smarttravel.intelligence.ranking.eval;

import java.util.*;
import vn.smarttravel.intelligence.ranking.domain.*;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;

/**
 * Offline Ranking Evaluator with strict metric definitions, slice reporting,
 * unjudged-vs-irrelevant separation, baseline modes, and hard-constraint violation checks.
 */
public final class RankingEvaluator {

    public enum BaselineMode {
        BASIC_ONLY,
        FALLBACK_ONLY,
        CONTENT_CONTEXT,
        HYBRID_V1,
        CHALLENGER
    }

    public record JudgmentQuery(
            String queryId,
            String scenarioGroup,
            String split,
            RankingRequest request,
            UserContext user,
            Map<UUID, Integer> gradesByPlaceId
    ) {}

    public record EvaluationReport(
            Map<String, Object> metrics,
            Map<String, Map<String, Object>> slices,
            Map<String, Object> methodology,
            int queriesEvaluated,
            int queriesExcluded,
            double judgedCoverage,
            int hardConstraintViolations,
            double ndcgAt10,
            double precisionAt10,
            double catalogCoverage,
            double p95LatencyMs
    ) {}

    private final HybridRankingEngine engine;
    private final HardConstraintFilter hardFilter;

    public RankingEvaluator() {
        this(new HybridRankingEngine(), new HardConstraintFilter());
    }

    public RankingEvaluator(HybridRankingEngine engine, HardConstraintFilter hardFilter) {
        this.engine = engine;
        this.hardFilter = hardFilter;
    }

    public EvaluationReport evaluate(
            List<JudgmentQuery> queries,
            List<PlaceSnapshot> catalogSnapshot,
            RankingConfig baseConfig,
            CohortStats cohorts,
            CfArtifactData cfArtifact,
            BaselineMode mode,
            Set<UUID> inactiveCategories
    ) {
        RankingConfig effectiveConfig = applyBaselineMode(baseConfig, mode);
        CfArtifactData effectiveCf = (mode == BaselineMode.BASIC_ONLY || mode == BaselineMode.FALLBACK_ONLY || mode == BaselineMode.CONTENT_CONTEXT)
                ? null : cfArtifact;

        double sumNdcg5 = 0.0, sumNdcg10 = 0.0;
        double sumPrec5 = 0.0, sumPrec10 = 0.0;
        double sumRec5 = 0.0, sumRec10 = 0.0;
        double sumHit5 = 0.0, sumHit10 = 0.0;
        double sumDiversity10 = 0.0;
        double sumCandidateRecall = 0.0;
        int recallDenom = 0;
        int queriesEvaluated = 0;
        int queriesExcluded = 0;
        List<Map<String, String>> excludedReasons = new ArrayList<>();

        int totalTop10Slots = 0;
        int judgedTop10Slots = 0;
        int hardViolations = 0;
        Set<UUID> uniqueRecommendedTop10 = new HashSet<>();
        List<Double> latenciesMs = new ArrayList<>();

        // Slice accumulators
        Map<String, List<Double>> sliceNdcg10 = new LinkedHashMap<>();
        Map<String, List<Double>> slicePrec10 = new LinkedHashMap<>();

        long eligibleCatalogSize = catalogSnapshot.stream()
                .filter(p -> "PUBLISHED".equals(p.status()))
                .count();

        for (JudgmentQuery q : queries) {
            if (q.gradesByPlaceId() == null || q.gradesByPlaceId().isEmpty()) {
                queriesExcluded++;
                excludedReasons.add(Map.of("query_id", q.queryId(), "reason", "NO_JUDGMENTS"));
                continue;
            }
            boolean hasAnyPositiveGrade = q.gradesByPlaceId().values().stream().anyMatch(g -> g != null && g > 0);
            if (!hasAnyPositiveGrade) {
                queriesExcluded++;
                excludedReasons.add(Map.of("query_id", q.queryId(), "reason", "NO_POSITIVE_GRADE_FOR_NDCG"));
                continue;
            }

            long t0 = System.nanoTime();
            RankingOutput output;
            if (mode == BaselineMode.FALLBACK_ONLY) {
                // Force public discovery fallback by passing zeroed/empty cohorts & no soft prefs & no CF
                output = engine.rank(
                        catalogSnapshot,
                        UserContext.guest(),
                        new RankingRequest(
                                q.request().topN(), q.request().currency(), q.request().budgetBasis(),
                                q.request().destinationId(), q.request().geographicUnitId(), q.request().expandedGeoUnitIds(),
                                q.request().categoryIds(), q.request().hardTags(), Map.of(),
                                q.request().minBudget(), q.request().maxBudget(), q.request().minRating(),
                                q.request().requiredSpace(), null, null, null,
                                q.request().visitTimeSlot(), q.request().visitDayOfWeek(),
                                q.request().visitStartMinute(), q.request().visitEndMinute(),
                                q.request().timezone(), q.request().excludeClosed(), q.request().includeUnknownPrice(),
                                null, q.request().now()
                        ),
                        effectiveConfig,
                        CohortStats.empty(),
                        null,
                        inactiveCategories
                );
            } else {
                output = engine.rank(catalogSnapshot, q.user(), q.request(), effectiveConfig, cohorts, effectiveCf, inactiveCategories);
            }
            double elapsedMs = (System.nanoTime() - t0) / 1_000_000.0;
            latenciesMs.add(elapsedMs);

            List<RankedCandidate> ranked = output.ranked();
            List<RankedCandidate> top5 = ranked.subList(0, Math.min(5, ranked.size()));
            List<RankedCandidate> top10 = ranked.subList(0, Math.min(10, ranked.size()));

            // Verify zero hard constraint violations in returned results
            Set<UUID> validPassedIds = new HashSet<>();
            for (var fc : hardFilter.filter(catalogSnapshot, q.request(), effectiveConfig, inactiveCategories).passed()) {
                validPassedIds.add(fc.place().placeId());
            }
            for (RankedCandidate rc : top10) {
                uniqueRecommendedTop10.add(rc.place().placeId());
                if (!validPassedIds.contains(rc.place().placeId())) {
                    hardViolations++;
                }
                totalTop10Slots++;
                if (q.gradesByPlaceId().containsKey(rc.place().placeId())) {
                    judgedTop10Slots++;
                }
            }

            double ndcg5 = ndcgAtK(top5, q.gradesByPlaceId(), 5);
            double ndcg10 = ndcgAtK(top10, q.gradesByPlaceId(), 10);
            double prec5 = precisionAtK(top5, q.gradesByPlaceId(), 5);
            double prec10 = precisionAtK(top10, q.gradesByPlaceId(), 10);
            double hit5 = hitRateAtK(top5, q.gradesByPlaceId());
            double hit10 = hitRateAtK(top10, q.gradesByPlaceId());
            double div10 = intraListCategoryDiversity(top10);

            sumNdcg5 += ndcg5;
            sumNdcg10 += ndcg10;
            sumPrec5 += prec5;
            sumPrec10 += prec10;
            sumHit5 += hit5;
            sumHit10 += hit10;
            sumDiversity10 += div10;
            queriesEvaluated++;

            Set<UUID> relevantIds = new HashSet<>();
            for (var e : q.gradesByPlaceId().entrySet()) {
                if (e.getValue() != null && e.getValue() >= 2) {
                    relevantIds.add(e.getKey());
                }
            }
            if (!relevantIds.isEmpty()) {
                recallDenom++;
                long relIn5 = top5.stream().filter(r -> relevantIds.contains(r.place().placeId())).count();
                long relIn10 = top10.stream().filter(r -> relevantIds.contains(r.place().placeId())).count();
                long relInCandidates = ranked.stream().filter(r -> relevantIds.contains(r.place().placeId())).count();
                sumRec5 += (double) relIn5 / relevantIds.size();
                sumRec10 += (double) relIn10 / relevantIds.size();
                sumCandidateRecall += (double) relInCandidates / relevantIds.size();
            }

            // Record slice membership
            List<String> querySlices = classifySlices(q, output);
            for (String s : querySlices) {
                sliceNdcg10.computeIfAbsent(s, k -> new ArrayList<>()).add(ndcg10);
                slicePrec10.computeIfAbsent(s, k -> new ArrayList<>()).add(prec10);
            }
        }

        double avgNdcg5 = queriesEvaluated > 0 ? sumNdcg5 / queriesEvaluated : 0.0;
        double avgNdcg10 = queriesEvaluated > 0 ? sumNdcg10 / queriesEvaluated : 0.0;
        double avgPrec5 = queriesEvaluated > 0 ? sumPrec5 / queriesEvaluated : 0.0;
        double avgPrec10 = queriesEvaluated > 0 ? sumPrec10 / queriesEvaluated : 0.0;
        Double avgRec5 = recallDenom > 0 ? sumRec5 / recallDenom : null;
        Double avgRec10 = recallDenom > 0 ? sumRec10 / recallDenom : null;
        double avgHit5 = queriesEvaluated > 0 ? sumHit5 / queriesEvaluated : 0.0;
        double avgHit10 = queriesEvaluated > 0 ? sumHit10 / queriesEvaluated : 0.0;
        double avgDiversity10 = queriesEvaluated > 0 ? sumDiversity10 / queriesEvaluated : 0.0;
        Double avgCandidateRecall = recallDenom > 0 ? sumCandidateRecall / recallDenom : null;
        double catalogCoverage = eligibleCatalogSize > 0 ? (double) uniqueRecommendedTop10.size() / eligibleCatalogSize : 0.0;
        double judgedCoverage = totalTop10Slots > 0 ? (double) judgedTop10Slots / totalTop10Slots : 0.0;

        double p50 = percentile(latenciesMs, 0.50);
        double p95 = percentile(latenciesMs, 0.95);
        double p99 = percentile(latenciesMs, 0.99);

        Map<String, Object> metrics = new LinkedHashMap<>();
        metrics.put("ndcg_at_5", round4(avgNdcg5));
        metrics.put("ndcg_at_10", round4(avgNdcg10));
        metrics.put("precision_at_5", round4(avgPrec5));
        metrics.put("precision_at_10", round4(avgPrec10));
        metrics.put("recall_at_5", avgRec5 == null ? null : round4(avgRec5));
        metrics.put("recall_at_10", avgRec10 == null ? null : round4(avgRec10));
        metrics.put("hit_rate_at_5", round4(avgHit5));
        metrics.put("hit_rate_at_10", round4(avgHit10));
        metrics.put("catalog_coverage", round4(catalogCoverage));
        metrics.put("intra_list_category_diversity_at_10", round4(avgDiversity10));
        metrics.put("hard_constraint_violations", hardViolations);
        metrics.put("candidate_recall", avgCandidateRecall == null ? null : round4(avgCandidateRecall));
        metrics.put("judged_coverage_at_10", round4(judgedCoverage));
        metrics.put("latency_ms_p50", round2(p50));
        metrics.put("latency_ms_p95", round2(p95));
        metrics.put("latency_ms_p99", round2(p99));
        metrics.put("queries_evaluated", queriesEvaluated);
        metrics.put("queries_excluded", queriesExcluded);
        metrics.put("recall_eligible_queries", recallDenom);

        Map<String, Map<String, Object>> slices = new LinkedHashMap<>();
        for (var e : sliceNdcg10.entrySet()) {
            List<Double> ndcgs = e.getValue();
            List<Double> precs = slicePrec10.getOrDefault(e.getKey(), List.of());
            Map<String, Object> sMap = new LinkedHashMap<>();
            sMap.put("sample_size", ndcgs.size());
            sMap.put("ndcg_at_10", round4(mean(ndcgs)));
            sMap.put("precision_at_10", round4(mean(precs)));
            slices.put(e.getKey(), sMap);
        }

        Map<String, Object> methodology = new LinkedHashMap<>();
        methodology.put("ndcg_gain_formula", "2^grade - 1 (grades 0..3); discount = log2(rank + 1)");
        methodology.put("precision_relevance_threshold", "grade >= 2");
        methodology.put("precision_denominator", "K (when returned < K, empty slots contribute 0 relevant; exact denominator K)");
        methodology.put("unjudged_policy", "Unjudged items are NOT labeled irrelevant in storage; treated as gain=0 in conservative NDCG/Precision and reported explicitly via judged_coverage_at_10");
        methodology.put("recall_exclusion_rule", "Queries with zero grade>=2 items excluded from Recall@K and CandidateRecall");
        methodology.put("diversity_definition", "1 - average pairwise same-primary-category ratio across pairs in Top-10 (0 if <2 items)");
        methodology.put("baseline_mode", mode.name());
        methodology.put("excluded_queries", excludedReasons.subList(0, Math.min(20, excludedReasons.size())));

        return new EvaluationReport(
                metrics, slices, methodology,
                queriesEvaluated, queriesExcluded, judgedCoverage, hardViolations,
                avgNdcg10, avgPrec10, catalogCoverage, p95
        );
    }

    public static double ndcgAtK(List<RankedCandidate> ranked, Map<UUID, Integer> grades, int k) {
        double dcg = 0.0;
        int limit = Math.min(k, ranked.size());
        for (int i = 0; i < limit; i++) {
            Integer grade = grades.get(ranked.get(i).place().placeId());
            if (grade != null && grade > 0) {
                dcg += (Math.pow(2.0, grade) - 1.0) / log2(i + 2.0);
            }
        }
        List<Integer> idealGrades = grades.values().stream()
                .filter(g -> g != null && g > 0)
                .sorted(Comparator.reverseOrder())
                .limit(k)
                .toList();
        double idcg = 0.0;
        for (int i = 0; i < idealGrades.size(); i++) {
            idcg += (Math.pow(2.0, idealGrades.get(i)) - 1.0) / log2(i + 2.0);
        }
        return idcg <= 0.0 ? 0.0 : Math.min(1.0, dcg / idcg);
    }

    public static double precisionAtK(List<RankedCandidate> ranked, Map<UUID, Integer> grades, int k) {
        if (k <= 0) return 0.0;
        int rel = 0;
        int limit = Math.min(k, ranked.size());
        for (int i = 0; i < limit; i++) {
            Integer g = grades.get(ranked.get(i).place().placeId());
            if (g != null && g >= 2) rel++;
        }
        return (double) rel / k;
    }

    public static double hitRateAtK(List<RankedCandidate> ranked, Map<UUID, Integer> grades) {
        for (RankedCandidate rc : ranked) {
            Integer g = grades.get(rc.place().placeId());
            if (g != null && g >= 2) return 1.0;
        }
        return 0.0;
    }

    public static double intraListCategoryDiversity(List<RankedCandidate> ranked) {
        int n = ranked.size();
        if (n < 2) return 0.0;
        int pairs = 0;
        int diffPairs = 0;
        for (int i = 0; i < n; i++) {
            String catI = ranked.get(i).place().primaryCategoryKey();
            for (int j = i + 1; j < n; j++) {
                String catJ = ranked.get(j).place().primaryCategoryKey();
                pairs++;
                if (catI.isBlank() || catJ.isBlank() || !catI.equals(catJ)) {
                    diffPairs++;
                }
            }
        }
        return pairs == 0 ? 0.0 : (double) diffPairs / pairs;
    }

    private static RankingConfig applyBaselineMode(RankingConfig base, BaselineMode mode) {
        return switch (mode) {
            case BASIC_ONLY -> new RankingConfig(
                    base.configVersionId(), base.versionTag() + "-basic-only",
                    1.0, 0.0, 0.0, 0.0,
                    base.ratingM(), base.ratingWeight(), base.popularityWeight(), base.popularityWindowDays(),
                    base.minObservationDays(), base.cohortMinSample(), base.distanceScaleKm(), base.distanceWeight(),
                    base.weatherWeight(), base.useMaxDistanceAsScale(), base.cfLambda(), base.cfTopK(),
                    base.cfHistoryLimit(), base.cfFavoriteWeight(), base.cfTripWeight(), base.candidateCap(),
                    base.topNDefault(), base.topNMax(), base.diversityEnabled(), base.unknownPricePolicy(),
                    base.scorerVersions(), base.qualityStatus()
            );
            case CONTENT_CONTEXT -> new RankingConfig(
                    base.configVersionId(), base.versionTag() + "-content-context",
                    0.0, 0.65, 0.0, 0.35,
                    base.ratingM(), base.ratingWeight(), base.popularityWeight(), base.popularityWindowDays(),
                    base.minObservationDays(), base.cohortMinSample(), base.distanceScaleKm(), base.distanceWeight(),
                    base.weatherWeight(), base.useMaxDistanceAsScale(), base.cfLambda(), base.cfTopK(),
                    base.cfHistoryLimit(), base.cfFavoriteWeight(), base.cfTripWeight(), base.candidateCap(),
                    base.topNDefault(), base.topNMax(), base.diversityEnabled(), base.unknownPricePolicy(),
                    base.scorerVersions(), base.qualityStatus()
            );
            case FALLBACK_ONLY, HYBRID_V1, CHALLENGER -> base;
        };
    }

    private static List<String> classifySlices(JudgmentQuery q, RankingOutput output) {
        List<String> slices = new ArrayList<>();
        UserContext u = q.user();
        if (u == null || !u.authenticated() || u.positiveHistory() == null || u.positiveHistory().isEmpty()) {
            slices.add("new_user");
        } else if (u.positiveHistory().size() < 3) {
            slices.add("sparse_history");
        } else {
            slices.add("dense_history");
        }
        if (u == null || !u.personalizationConsent()) {
            slices.add("no_consent");
        }
        boolean anyCfAvailable = output.ranked().stream().anyMatch(r -> r.breakdown().collaborative().available());
        slices.add(anyCfAvailable ? "cf_available" : "cf_unavailable");

        boolean hasMissingRating = output.ranked().stream().limit(10).anyMatch(r -> r.place().approvedRatingCount() == 0);
        if (hasMissingRating) slices.add("missing_rating_in_top10");

        boolean hasMissingMetadata = output.ranked().stream().limit(10).anyMatch(r -> r.place().structuredTags().isEmpty());
        if (hasMissingMetadata) slices.add("missing_metadata_in_top10");

        if (q.request().destinationId() != null) {
            slices.add("destination:" + q.request().destinationId());
        }
        if (q.request().categoryIds() != null && q.request().categoryIds().size() == 1) {
            slices.add("category:" + q.request().categoryIds().iterator().next());
        }
        return slices;
    }

    private static double log2(double v) {
        return Math.log(v) / Math.log(2.0);
    }

    private static double mean(List<Double> values) {
        if (values == null || values.isEmpty()) return 0.0;
        double s = 0.0;
        for (double v : values) s += v;
        return s / values.size();
    }

    private static double percentile(List<Double> values, double p) {
        if (values.isEmpty()) return 0.0;
        List<Double> sorted = new ArrayList<>(values);
        Collections.sort(sorted);
        int idx = (int) Math.min(sorted.size() - 1, Math.max(0, Math.ceil(p * sorted.size()) - 1));
        return sorted.get(idx);
    }

    private static double round4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
