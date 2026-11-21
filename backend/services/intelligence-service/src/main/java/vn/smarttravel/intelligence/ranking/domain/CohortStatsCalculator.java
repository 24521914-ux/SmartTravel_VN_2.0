package vn.smarttravel.intelligence.ranking.domain;

import java.time.Instant;
import java.util.*;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;

/**
 * Computes versioned cohort priors (mu) and 95th-percentile popularity references (p_ref)
 * across destination+category, destination, category, and global cohorts.
 * Computed offline into a snapshot — never recomputed per request.
 */
public final class CohortStatsCalculator {

    public CohortStats compute(
            String snapshotVersion,
            List<PlaceSnapshot> places,
            int windowDays,
            int minSample,
            Instant computedAt
    ) {
        Map<String, List<Double>> ratingBuckets = new LinkedHashMap<>();
        Map<String, List<Long>> popBuckets = new LinkedHashMap<>();

        for (PlaceSnapshot p : places) {
            if (!"PUBLISHED".equals(p.status())) continue;
            List<String> keys = cohortKeysForPlace(p);

            if (p.approvedRatingCount() > 0 && p.approvedRatingAvg() != null && Double.isFinite(p.approvedRatingAvg())) {
                for (String k : keys) {
                    ratingBuckets.computeIfAbsent(k, ignored -> new ArrayList<>()).add(p.approvedRatingAvg());
                }
            }
            if (p.popularityPipelineActive()) {
                long pop = Math.max(0L, p.uniquePopularityUsers30d());
                for (String k : keys) {
                    popBuckets.computeIfAbsent(k, ignored -> new ArrayList<>()).add(pop);
                }
            }
        }

        Set<String> allKeys = new TreeSet<>();
        allKeys.addAll(ratingBuckets.keySet());
        allKeys.addAll(popBuckets.keySet());

        Map<String, CohortStatEntry> entries = new LinkedHashMap<>();
        for (String key : allKeys) {
            List<Double> rList = ratingBuckets.getOrDefault(key, List.of());
            List<Long> pList = popBuckets.getOrDefault(key, List.of());

            Double mu = null;
            if (!rList.isEmpty()) {
                double sum = 0.0;
                for (double v : rList) sum += v;
                mu = sum / rList.size();
            }

            Double p95 = null;
            if (!pList.isEmpty()) {
                p95 = percentile95(pList);
            }

            entries.put(key, new CohortStatEntry(key, mu, rList.size(), p95, pList.size()));
        }

        return new CohortStats(snapshotVersion, computedAt != null ? computedAt : Instant.now(), windowDays, minSample, Collections.unmodifiableMap(entries));
    }

    private static List<String> cohortKeysForPlace(PlaceSnapshot p) {
        Set<String> keys = new LinkedHashSet<>();
        keys.add("global");
        String dest = p.primaryDestinationKey();
        String cat = p.primaryCategoryKey();
        if (!dest.isBlank()) keys.add("dest:" + dest);
        if (!cat.isBlank()) keys.add("cat:" + cat);
        if (!dest.isBlank() && !cat.isBlank()) keys.add("dest:" + dest + "|cat:" + cat);
        return new ArrayList<>(keys);
    }

    public static double percentile95(List<Long> values) {
        if (values == null || values.isEmpty()) return 0.0;
        List<Long> sorted = new ArrayList<>(values);
        Collections.sort(sorted);
        int n = sorted.size();
        if (n == 1) return sorted.getFirst();
        double rank = 0.95 * (n - 1);
        int low = (int) Math.floor(rank);
        int high = (int) Math.ceil(rank);
        double frac = rank - low;
        return sorted.get(low) + frac * (sorted.get(high) - sorted.get(low));
    }
}
