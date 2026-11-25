package vn.smarttravel.intelligence.ranking.domain;

import java.time.Duration;
import java.time.Instant;
import java.util.*;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;

/**
 * Basic_v1 scorer: weighted mean of Bayesian-smoothed RatingScore (0.60) and
 * log-scaled 30-day unique-user PopularityScore (0.40) using snapshot cohort priors.
 */
public final class BasicScorer {
    public static final String VERSION = "basic_v1";

    public ScorerResult score(PlaceSnapshot place, RankingRequest request, RankingConfig config, CohortStats cohorts) {
        String version = config.scorerVersions().getOrDefault("basic", VERSION);
        String snapshotVer = cohorts != null ? cohorts.snapshotVersion() : "none";
        Instant dataAsOf = place.asOf();
        Map<String, Object> breakdown = new LinkedHashMap<>();
        List<String> reasons = new ArrayList<>();

        String destKey = place.primaryDestinationKey();
        String catKey = place.primaryCategoryKey();

        // 1. Bayesian Rating sub-component
        Double ratingScore = null;
        UnavailableReason ratingUnavailable = null;
        long n = place.approvedRatingCount();
        Double r = place.approvedRatingAvg();
        Optional<CohortStatEntry> ratingCohort = cohorts != null
                ? cohorts.resolveRatingCohort(destKey, catKey)
                : Optional.empty();

        if (n > 0 && r != null && Double.isFinite(r)) {
            double mu;
            String cohortUsed;
            int sampleSize;
            if (ratingCohort.isPresent()) {
                mu = ratingCohort.get().ratingPriorMu();
                cohortUsed = ratingCohort.get().cohortKey();
                sampleSize = ratingCohort.get().ratingSampleSize();
            } else {
                // Without a snapshot cohort prior, compute direct normalized rating only when n >= minSample
                if (n >= config.cohortMinSample()) {
                    mu = r;
                    cohortUsed = "self-no-prior";
                    sampleSize = (int) Math.min(Integer.MAX_VALUE, n);
                } else {
                    ratingUnavailable = UnavailableReason.NO_PRIOR_SAMPLE;
                    mu = Double.NaN;
                    cohortUsed = "none";
                    sampleSize = 0;
                }
            }
            if (Double.isFinite(mu)) {
                double m = config.ratingM();
                double adjusted = (n * r + m * mu) / (n + m);
                ratingScore = clamp01((adjusted - 1.0) / 4.0);
                breakdown.put("rating_avg", r);
                breakdown.put("rating_count", n);
                breakdown.put("rating_prior_mu", mu);
                breakdown.put("rating_m", m);
                breakdown.put("rating_adjusted", adjusted);
                breakdown.put("rating_score", ratingScore);
                breakdown.put("rating_cohort", cohortUsed);
                breakdown.put("rating_cohort_sample", sampleSize);
                if (r >= 4.0 && n >= 3) {
                    reasons.add("HIGH_APPROVED_RATING");
                } else {
                    reasons.add("HAS_APPROVED_RATING");
                }
            }
        } else {
            // n == 0: use valid cohort prior if available, never fabricate a constant prior
            if (ratingCohort.isPresent()) {
                double mu = ratingCohort.get().ratingPriorMu();
                ratingScore = clamp01((mu - 1.0) / 4.0);
                breakdown.put("rating_count", 0L);
                breakdown.put("rating_prior_mu", mu);
                breakdown.put("rating_adjusted", mu);
                breakdown.put("rating_score", ratingScore);
                breakdown.put("rating_cohort", ratingCohort.get().cohortKey());
                breakdown.put("rating_cohort_sample", ratingCohort.get().ratingSampleSize());
                breakdown.put("rating_prior_only", true);
                reasons.add("RATING_PRIOR_ONLY");
            } else {
                ratingUnavailable = UnavailableReason.NO_PRIOR_SAMPLE;
                breakdown.put("rating_unavailable_reason", ratingUnavailable.name());
            }
        }

        // 2. Popularity sub-component (30-day distinct users with active favorite or add-to-trip)
        Double popScore = null;
        UnavailableReason popUnavailable = null;
        Instant now = request.now() != null ? request.now() : Instant.now();
        long p = Math.max(0L, place.uniquePopularityUsers30d());

        if (!place.popularityPipelineActive()) {
            popUnavailable = UnavailableReason.PIPELINE_INACTIVE;
            breakdown.put("popularity_unavailable_reason", popUnavailable.name());
        } else {
            boolean withinObservationWindow = place.firstObservedAt() != null
                    && Duration.between(place.firstObservedAt(), now).toDays() < config.minObservationDays();
            Optional<CohortStatEntry> popCohort = cohorts != null
                    ? cohorts.resolvePopularityCohort(destKey, catKey)
                    : Optional.empty();
            if (p == 0 && withinObservationWindow) {
                popUnavailable = UnavailableReason.NEW_ITEM_OBSERVATION_WINDOW;
                breakdown.put("popularity_unavailable_reason", popUnavailable.name());
                breakdown.put("popularity_users_30d", 0L);
                breakdown.put("new_item_observation_window", true);
            } else if (popCohort.isEmpty() || popCohort.get().popularityP95Ref() == null || popCohort.get().popularityP95Ref() <= 0.0) {
                popUnavailable = UnavailableReason.NO_POPULARITY_REF;
                breakdown.put("popularity_unavailable_reason", popUnavailable.name());
                breakdown.put("popularity_users_30d", p);
            } else {
                double pRef = popCohort.get().popularityP95Ref();
                double denom = Math.log1p(pRef);
                if (denom <= 0.0 || !Double.isFinite(denom)) {
                    popUnavailable = UnavailableReason.NO_POPULARITY_REF;
                    breakdown.put("popularity_unavailable_reason", popUnavailable.name());
                } else {
                    popScore = clamp01(Math.min(1.0, Math.log1p(p) / denom));
                    breakdown.put("popularity_users_30d", p);
                    breakdown.put("popularity_p95_ref", pRef);
                    breakdown.put("popularity_cohort", popCohort.get().cohortKey());
                    breakdown.put("popularity_cohort_sample", popCohort.get().popularitySampleSize());
                    breakdown.put("popularity_score", popScore);
                    if (p > 0 && popScore >= 0.5) {
                        reasons.add("POPULAR_RECENTLY");
                    }
                }
            }
        }

        // 3. Weighted combination over available sub-components
        double num = 0.0;
        double den = 0.0;
        if (ratingScore != null) {
            num += config.ratingWeight() * ratingScore;
            den += config.ratingWeight();
        }
        if (popScore != null) {
            num += config.popularityWeight() * popScore;
            den += config.popularityWeight();
        }

        breakdown.put("rating_available", ratingScore != null);
        breakdown.put("popularity_available", popScore != null);
        breakdown.put("cohort_snapshot_version", snapshotVer);

        if (den <= 0.0) {
            UnavailableReason reason = ratingUnavailable != null ? ratingUnavailable :
                    (popUnavailable != null ? popUnavailable : UnavailableReason.NO_DATA);
            return ScorerResult.unavailable(reason, version, snapshotVer, dataAsOf, breakdown);
        }

        double effectiveRatingW = ratingScore != null ? config.ratingWeight() / den : 0.0;
        double effectivePopW = popScore != null ? config.popularityWeight() / den : 0.0;
        breakdown.put("effective_rating_weight", effectiveRatingW);
        breakdown.put("effective_popularity_weight", effectivePopW);

        double finalBasic = clamp01(num / den);
        breakdown.put("basic_score", finalBasic);
        return ScorerResult.available(finalBasic, version, snapshotVer, dataAsOf, reasons, breakdown);
    }

    private static double clamp01(double v) {
        if (!Double.isFinite(v)) return 0.0;
        return Math.max(0.0, Math.min(1.0, v));
    }
}
