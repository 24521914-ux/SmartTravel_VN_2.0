package vn.smarttravel.intelligence.ranking.domain;

import java.time.Instant;
import java.util.*;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;

/**
 * Sparse Item-based Collaborative Filtering builder.
 * - Binary positive interaction matrix x[u,i] = 1 for active favorite / add-to-trip up to cutoff.
 * - Cosine similarity with shrinkage: sim_adjusted(i,j) = sim(i,j) * n_common / (n_common + lambda).
 * - Top-K neighbors per item, no self-neighbor, zero-norm safe, deterministic tie-breaking, no NaN.
 */
public final class ItemBasedCfBuilder {

    public record InteractionRecord(UUID userId, UUID placeId, String eventType, Instant occurredAt) {}

    public record BuildResult(
            CfArtifactData artifact,
            int userCount,
            int itemCount,
            int edgeCount,
            int excludedAfterCutoff,
            int excludedInactive
    ) {}

    public BuildResult build(
            UUID artifactId,
            String versionTag,
            List<InteractionRecord> rawRecords,
            Instant cutoffAt,
            double lambda,
            int topK
    ) {
        if (cutoffAt == null) throw new IllegalArgumentException("cutoffAt is required");
        if (!Double.isFinite(lambda) || lambda < 0.0) throw new IllegalArgumentException("lambda must be finite >= 0");
        if (topK < 1) throw new IllegalArgumentException("topK must be >= 1");

        // 1. Apply temporal cutoff & event state semantics (favorite removed cancels prior favorite; trip item added is positive)
        List<InteractionRecord> sorted = rawRecords.stream()
                .filter(r -> r.userId() != null && r.placeId() != null && r.occurredAt() != null)
                .sorted(Comparator.comparing(InteractionRecord::occurredAt)
                        .thenComparing(r -> r.userId().toString())
                        .thenComparing(r -> r.placeId().toString()))
                .toList();

        int excludedAfterCutoff = 0;
        Map<String, Boolean> favState = new HashMap<>();
        Map<String, Boolean> tripState = new HashMap<>();
        Map<String, UUID[]> pairLookup = new HashMap<>();

        for (InteractionRecord rec : sorted) {
            if (rec.occurredAt().isAfter(cutoffAt)) {
                excludedAfterCutoff++;
                continue;
            }
            String pairKey = rec.userId() + "|" + rec.placeId();
            pairLookup.putIfAbsent(pairKey, new UUID[]{rec.userId(), rec.placeId()});
            switch (rec.eventType()) {
                case "FAVORITE_ADDED" -> favState.put(pairKey, true);
                case "FAVORITE_REMOVED" -> favState.put(pairKey, false);
                case "TRIP_ITEM_ADDED" -> tripState.put(pairKey, true);
                case "TRIP_ITEM_REMOVED" -> tripState.put(pairKey, false);
                default -> { /* Ignore non-CF event types like SEARCH / PLACE_VIEW */ }
            }
        }

        // 2. Build deduplicated sparse user->items and item->users sets (x[u,i] = 1)
        Map<UUID, Set<UUID>> userItems = new HashMap<>();
        Map<UUID, Set<UUID>> itemUsers = new HashMap<>();
        int excludedInactive = 0;

        for (var entry : pairLookup.entrySet()) {
            String key = entry.getKey();
            boolean active = Boolean.TRUE.equals(favState.get(key)) || Boolean.TRUE.equals(tripState.get(key));
            if (!active) {
                excludedInactive++;
                continue;
            }
            UUID u = entry.getValue()[0];
            UUID i = entry.getValue()[1];
            userItems.computeIfAbsent(u, k -> new HashSet<>()).add(i);
            itemUsers.computeIfAbsent(i, k -> new HashSet<>()).add(u);
        }

        // 3. Sparse co-occurrence count n_common(i, j) for pairs sharing >= 1 user
        Map<UUID, Map<UUID, Integer>> coCounts = new HashMap<>();
        for (Set<UUID> items : userItems.values()) {
            List<UUID> list = new ArrayList<>(items);
            int size = list.size();
            for (int a = 0; a < size; a++) {
                UUID i = list.get(a);
                for (int b = a + 1; b < size; b++) {
                    UUID j = list.get(b);
                    coCounts.computeIfAbsent(i, k -> new HashMap<>()).merge(j, 1, Integer::sum);
                    coCounts.computeIfAbsent(j, k -> new HashMap<>()).merge(i, 1, Integer::sum);
                }
            }
        }

        // 4. Compute shrunk cosine similarity & keep Top-K neighbors per item
        Set<UUID> supportedItems = new TreeSet<>(Comparator.comparing(UUID::toString));
        supportedItems.addAll(itemUsers.keySet());
        Map<UUID, List<CfNeighbor>> neighborsByItem = new LinkedHashMap<>();
        int totalEdges = 0;

        for (UUID item : supportedItems) {
            int normI = itemUsers.getOrDefault(item, Set.of()).size();
            if (normI <= 0) continue;

            Map<UUID, Integer> related = coCounts.getOrDefault(item, Map.of());
            List<CfNeighbor> candidates = new ArrayList<>(related.size());
            for (var rel : related.entrySet()) {
                UUID neighbor = rel.getKey();
                if (neighbor.equals(item)) continue; // Never self-neighbor
                int common = rel.getValue();
                int normJ = itemUsers.getOrDefault(neighbor, Set.of()).size();
                if (common <= 0 || normJ <= 0) continue;

                double denom = Math.sqrt((double) normI * (double) normJ);
                if (denom <= 0.0 || !Double.isFinite(denom)) continue;

                double rawCos = Math.max(0.0, Math.min(1.0, common / denom));
                double shrink = (common + lambda) > 0.0 ? (common / (common + lambda)) : 1.0;
                double adjusted = rawCos * shrink;
                if (!Double.isFinite(adjusted) || adjusted <= 0.0) continue;

                candidates.add(new CfNeighbor(neighbor, adjusted, rawCos, common));
            }

            candidates.sort(Comparator.comparingDouble(CfNeighbor::adjustedSimilarity).reversed()
                    .thenComparing(n -> n.neighborPlaceId().toString()));

            List<CfNeighbor> truncated = candidates.size() > topK
                    ? List.copyOf(candidates.subList(0, topK))
                    : List.copyOf(candidates);
            neighborsByItem.put(item, truncated);
            totalEdges += truncated.size();
        }

        CfArtifactData artifact = new CfArtifactData(
                artifactId,
                versionTag,
                "",
                cutoffAt,
                lambda,
                topK,
                Set.copyOf(supportedItems),
                Collections.unmodifiableMap(neighborsByItem),
                true
        );

        return new BuildResult(artifact, userItems.size(), supportedItems.size(), totalEdges, excludedAfterCutoff, excludedInactive);
    }
}
