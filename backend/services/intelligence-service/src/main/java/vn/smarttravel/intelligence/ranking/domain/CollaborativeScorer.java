package vn.smarttravel.intelligence.ranking.domain;

import java.util.*;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;

/**
 * Item-based Collaborative Filtering scorer (cf_item_v1).
 * F(u,i) = Sum_j [h(u,j) * sim_adjusted(i,j)] / Sum_j h(u,j)
 * - h(u,j): favorite=3, add-to-trip=5, both=max(3,5)=5 (never double-counted).
 * - Denominator includes ALL valid selected history items, not just overlapping neighbors.
 * - Missing top-K edges approximate to 0 (explicitly flagged in breakdown).
 * - Item with support and user with history but zero overlap returns score=0.0 (available=true).
 */
public final class CollaborativeScorer {
    public static final String VERSION = "cf_item_v1";

    public ScorerResult score(
            PlaceSnapshot place,
            UserContext user,
            RankingConfig config,
            CfArtifactData artifact
    ) {
        String version = config.scorerVersions().getOrDefault("collaborative", VERSION);
        String snapshotVer = artifact != null ? artifact.versionTag() : "none";
        Map<String, Object> breakdown = new LinkedHashMap<>();

        if (user == null || !user.authenticated() || !user.personalizationConsent()) {
            breakdown.put("reason", "Consent not granted or guest user");
            return ScorerResult.unavailable(UnavailableReason.CONSENT_DENIED, version, snapshotVer, place.asOf(), breakdown);
        }
        if (artifact == null) {
            return ScorerResult.unavailable(UnavailableReason.ARTIFACT_MISSING, version, snapshotVer, place.asOf(), breakdown);
        }
        if (!artifact.activeAndValid()) {
            return ScorerResult.unavailable(UnavailableReason.ARTIFACT_NOT_ACTIVE, version, snapshotVer, place.asOf(), breakdown);
        }

        // Filter & cap user history deterministically (most recent first, excluding target item itself)
        List<UserHistoryItem> validHistory = (user.positiveHistory() == null ? List.<UserHistoryItem>of() : user.positiveHistory())
                .stream()
                .filter(h -> h.placeId() != null && (h.favorited() || h.addedToTrip()))
                .filter(h -> !h.placeId().equals(place.placeId()))
                .sorted(Comparator.comparing(UserHistoryItem::lastOccurredAt, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(h -> h.placeId().toString()))
                .limit(config.cfHistoryLimit())
                .toList();

        if (validHistory.isEmpty()) {
            breakdown.put("history_size", 0);
            return ScorerResult.unavailable(UnavailableReason.NO_USER_HISTORY, version, snapshotVer, place.asOf(), breakdown);
        }

        if (!artifact.supportedItems().contains(place.placeId())) {
            breakdown.put("history_size", validHistory.size());
            breakdown.put("item_supported", false);
            return ScorerResult.unavailable(UnavailableReason.NO_ITEM_SUPPORT, version, snapshotVer, place.asOf(), breakdown);
        }

        List<CfNeighbor> neighbors = artifact.neighborsByItem().getOrDefault(place.placeId(), List.of());
        Map<UUID, CfNeighbor> neighborLookup = new HashMap<>(neighbors.size() * 2);
        for (CfNeighbor n : neighbors) {
            neighborLookup.put(n.neighborPlaceId(), n);
        }

        double numerator = 0.0;
        double denominator = 0.0;
        int matchedNeighbors = 0;

        for (UserHistoryItem h : validHistory) {
            double weight = 0.0;
            if (h.favorited()) weight = Math.max(weight, config.cfFavoriteWeight());
            if (h.addedToTrip()) weight = Math.max(weight, config.cfTripWeight());
            if (weight <= 0.0 || !Double.isFinite(weight)) continue;

            denominator += weight;
            CfNeighbor edge = neighborLookup.get(h.placeId());
            if (edge != null && Double.isFinite(edge.adjustedSimilarity())) {
                numerator += weight * edge.adjustedSimilarity();
                matchedNeighbors++;
            }
        }

        if (denominator <= 0.0) {
            return ScorerResult.unavailable(UnavailableReason.NO_USER_HISTORY, version, snapshotVer, place.asOf(), breakdown);
        }

        double score = Math.max(0.0, Math.min(1.0, numerator / denominator));
        breakdown.put("cf_score", score);
        breakdown.put("artifact_version", artifact.versionTag());
        breakdown.put("history_items_considered", validHistory.size());
        breakdown.put("history_weight_sum", denominator);
        breakdown.put("matched_neighbors", matchedNeighbors);
        breakdown.put("top_k_approximation", true);
        breakdown.put("artifact_top_k", artifact.topK());

        List<String> reasons = (score > 0.05 && matchedNeighbors > 0)
                ? List.of("CF_CO_INTERACTED_WITH_HISTORY")
                : List.of();
        return ScorerResult.available(score, version, snapshotVer, place.asOf(), reasons, breakdown);
    }
}
