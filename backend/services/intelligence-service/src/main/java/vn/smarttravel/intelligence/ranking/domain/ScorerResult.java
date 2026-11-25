package vn.smarttravel.intelligence.ranking.domain;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Standard result contract for every independent recommendation scorer (B, C, F, X).
 * Never substitutes 0.0 for missing/unavailable data.
 */
public record ScorerResult(
        Double score,
        boolean available,
        UnavailableReason unavailableReason,
        String scorerVersion,
        String featureSnapshotVersion,
        Instant dataAsOf,
        List<String> reasonCodes,
        Map<String, Object> breakdown
) {
    public ScorerResult {
        if (available) {
            if (score == null || !Double.isFinite(score) || score < 0.0 || score > 1.0) {
                throw new IllegalArgumentException("Available ScorerResult requires finite score in [0,1], got: " + score);
            }
            if (unavailableReason != null) {
                throw new IllegalArgumentException("Available ScorerResult must not carry unavailableReason");
            }
        } else {
            if (score != null) {
                throw new IllegalArgumentException("Unavailable ScorerResult must have null score (never 0)");
            }
            Objects.requireNonNull(unavailableReason, "Unavailable ScorerResult requires explicit unavailableReason");
        }
        Objects.requireNonNull(scorerVersion, "scorerVersion is required");
        reasonCodes = reasonCodes == null ? List.of() : List.copyOf(reasonCodes);
        breakdown = breakdown == null ? Map.of() : Map.copyOf(breakdown);
    }

    public static ScorerResult available(
            double score,
            String scorerVersion,
            String featureSnapshotVersion,
            Instant dataAsOf,
            List<String> reasonCodes,
            Map<String, Object> breakdown
    ) {
        double clamped = Math.max(0.0, Math.min(1.0, score));
        if (!Double.isFinite(score)) {
            throw new IllegalArgumentException("Non-finite score: " + score);
        }
        return new ScorerResult(clamped, true, null, scorerVersion, featureSnapshotVersion, dataAsOf, reasonCodes, breakdown);
    }

    public static ScorerResult unavailable(
            UnavailableReason reason,
            String scorerVersion,
            String featureSnapshotVersion,
            Instant dataAsOf,
            Map<String, Object> breakdown
    ) {
        return new ScorerResult(null, false, reason, scorerVersion, featureSnapshotVersion, dataAsOf, List.of(), breakdown);
    }
}
