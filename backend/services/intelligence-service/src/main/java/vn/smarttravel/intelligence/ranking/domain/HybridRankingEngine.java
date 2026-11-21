package vn.smarttravel.intelligence.ranking.domain;

import java.time.Instant;
import java.util.*;
import java.util.function.Supplier;
import vn.smarttravel.intelligence.ranking.domain.HardConstraintFilter.FilteredCandidate;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;

/**
 * Two-tier Hybrid Recommendation Ranking Engine.
 * Tier 1: Independent scorers Basic (B), Content (C), Collaborative (F), Context (X).
 * Tier 2: H(u,i,q) = Sum(w_k * a_k * S_k) / Sum(w_k * a_k), stable deterministic sort,
 *         optional diversity re-ranker (disabled by default), and denominator-zero public discovery fallback.
 */
public final class HybridRankingEngine {

    private final HardConstraintFilter filter;
    private final BasicScorer basicScorer;
    private final ContentScorer contentScorer;
    private final CollaborativeScorer collaborativeScorer;
    private final ContextScorer contextScorer;
    private final ExplanationBuilder explanationBuilder;

    public HybridRankingEngine() {
        this(new HardConstraintFilter(), new BasicScorer(), new ContentScorer(),
                new CollaborativeScorer(), new ContextScorer(), new ExplanationBuilder());
    }

    public HybridRankingEngine(
            HardConstraintFilter filter,
            BasicScorer basicScorer,
            ContentScorer contentScorer,
            CollaborativeScorer collaborativeScorer,
            ContextScorer contextScorer,
            ExplanationBuilder explanationBuilder
    ) {
        this.filter = filter;
        this.basicScorer = basicScorer;
        this.contentScorer = contentScorer;
        this.collaborativeScorer = collaborativeScorer;
        this.contextScorer = contextScorer;
        this.explanationBuilder = explanationBuilder;
    }

    public RankingOutput rank(
            List<PlaceSnapshot> allPlaces,
            UserContext user,
            RankingRequest request,
            RankingConfig rawConfig,
            CohortStats cohorts,
            CfArtifactData cfArtifact,
            Set<UUID> inactiveCategories
    ) {
        RankingConfig config = rawConfig.normalizedWeights();
        int totalScanned = allPlaces.size();

        // 1. Apply hard constraints (never relaxed silently)
        var filtered = filter.filter(allPlaces, request, config, inactiveCategories);
        List<FilteredCandidate> candidates = filtered.passed();
        int passedCount = candidates.size();

        if (candidates.isEmpty()) {
            Instant asOf = allPlaces.stream().map(PlaceSnapshot::asOf).filter(Objects::nonNull)
                    .max(Instant::compareTo).orElse(request.now() != null ? request.now() : Instant.now());
            return new RankingOutput(
                    List.of(), filtered.exclusions(), totalScanned, 0, 0, "NONE",
                    false, null, false, List.of(), "NO_MATCHING_CANDIDATES", asOf, List.of(), List.of()
            );
        }

        // 2. Candidate cap policy (deterministic pre-selection only if candidates > candidateCap)
        int cappedFrom = 0;
        String capPolicy = "FULL_SCORING";
        if (candidates.size() > config.candidateCap()) {
            cappedFrom = candidates.size();
            capPolicy = "TOP_RATING_COUNT_THEN_CANONICAL_ID_CAP_" + config.candidateCap();
            candidates = candidates.stream()
                    .sorted(Comparator.comparingLong((FilteredCandidate fc) -> fc.place().approvedRatingCount()).reversed()
                            .thenComparing(fc -> fc.place().placeId().toString()))
                    .limit(config.candidateCap())
                    .toList();
        }

        // 3. Score every candidate independently through B, C, F, X and combine via Hybrid formula
        List<RankedCandidate> scored = new ArrayList<>(candidates.size());
        boolean anyFallback = false;
        String firstFallbackReason = null;
        boolean anyDegraded = false;
        Set<String> globalDegradedReasons = new LinkedHashSet<>();

        for (FilteredCandidate fc : candidates) {
            PlaceSnapshot p = fc.place();
            List<String> itemDegraded = new ArrayList<>();

            ScorerResult b = safeScore("basic", config, p, itemDegraded, () -> basicScorer.score(p, request, config, cohorts));
            ScorerResult c = safeScore("content", config, p, itemDegraded, () -> contentScorer.score(p, user, request, config));
            ScorerResult f = safeScore("collaborative", config, p, itemDegraded, () -> collaborativeScorer.score(p, user, config, cfArtifact));
            ScorerResult x = safeScore("context", config, p, itemDegraded, () -> contextScorer.score(p, fc.distanceKm(), request, config));

            if (!itemDegraded.isEmpty()) {
                anyDegraded = true;
                globalDegradedReasons.addAll(itemDegraded);
            }

            HybridBreakdown breakdown = combineHybrid(b, c, f, x, config, itemDegraded);
            if (breakdown.fallbackUsed()) {
                anyFallback = true;
                if (firstFallbackReason == null) firstFallbackReason = breakdown.fallbackReason();
            }

            var explanation = explanationBuilder.build(p, fc.distanceKm(), fc.openingStatus(), breakdown);

            scored.add(new RankedCandidate(
                    p, 0, breakdown.finalScore(), fc.distanceKm(), fc.openingStatus(),
                    breakdown,
                    explanation.reasonCodes(), explanation.reasonsVi(), explanation.reasonsEn(),
                    explanation.summaryVi(), explanation.summaryEn()
            ));
        }

        // 4. Stable deterministic sort:
        //    - Normal items: descending finalScore, then canonical place_id ascending.
        //    - All-fallback public discovery: deterministic approved rating count desc, then canonical place_id asc.
        boolean allFallback = scored.stream().allMatch(rc -> rc.breakdown().fallbackUsed());
        if (allFallback) {
            scored.sort(Comparator.comparingLong((RankedCandidate rc) -> rc.place().approvedRatingCount()).reversed()
                    .thenComparing(rc -> rc.place().placeId().toString()));
        } else {
            scored.sort(Comparator.comparingDouble(RankedCandidate::finalScore).reversed()
                    .thenComparing(rc -> rc.place().placeId().toString()));
        }

        List<UUID> preRerankOrder = scored.stream().map(rc -> rc.place().placeId()).toList();

        // 5. Optional re-ranking (diversity disabled by default in v1 unless explicitly enabled in config)
        List<RankedCandidate> finalOrdered = config.diversityEnabled()
                ? applyConservativeCategoryDiversity(scored)
                : scored;
        List<UUID> postRerankOrder = finalOrdered.stream().map(rc -> rc.place().placeId()).toList();

        // 6. Assign 1-based contiguous ranks
        List<RankedCandidate> ranked = new ArrayList<>(finalOrdered.size());
        for (int i = 0; i < finalOrdered.size(); i++) {
            RankedCandidate rc = finalOrdered.get(i);
            ranked.add(new RankedCandidate(
                    rc.place(), i + 1, rc.finalScore(), rc.distanceKm(), rc.openingStatus(),
                    rc.breakdown(), rc.reasonCodes(), rc.reasonsVi(), rc.reasonsEn(),
                    rc.summaryVi(), rc.summaryEn()
            ));
        }

        Instant dataAsOf = ranked.stream().map(rc -> rc.place().asOf()).filter(Objects::nonNull)
                .max(Instant::compareTo).orElse(request.now() != null ? request.now() : Instant.now());

        return new RankingOutput(
                List.copyOf(ranked),
                filtered.exclusions(),
                totalScanned,
                passedCount,
                cappedFrom,
                capPolicy,
                allFallback || anyFallback,
                allFallback ? "PUBLIC_DISCOVERY_FALLBACK" : firstFallbackReason,
                anyDegraded,
                List.copyOf(globalDegradedReasons),
                null,
                dataAsOf,
                preRerankOrder,
                postRerankOrder
        );
    }

    public static HybridBreakdown combineHybrid(
            ScorerResult b,
            ScorerResult c,
            ScorerResult f,
            ScorerResult x,
            RankingConfig config,
            List<String> itemDegradedReasons
    ) {
        Map<String, Double> configuredWeights = new LinkedHashMap<>();
        configuredWeights.put("basic", config.weightBasic());
        configuredWeights.put("content", config.weightContent());
        configuredWeights.put("collaborative", config.weightCollaborative());
        configuredWeights.put("context", config.weightContext());

        double num = 0.0;
        double den = 0.0;

        if (b.available() && config.weightBasic() > 0.0) {
            num += config.weightBasic() * b.score();
            den += config.weightBasic();
        }
        if (c.available() && config.weightContent() > 0.0) {
            num += config.weightContent() * c.score();
            den += config.weightContent();
        }
        if (f.available() && config.weightCollaborative() > 0.0) {
            num += config.weightCollaborative() * f.score();
            den += config.weightCollaborative();
        }
        if (x.available() && config.weightContext() > 0.0) {
            num += config.weightContext() * x.score();
            den += config.weightContext();
        }

        Map<String, Double> effectiveWeights = new LinkedHashMap<>();
        Map<String, Double> contributions = new LinkedHashMap<>();

        if (den <= 0.0 || !Double.isFinite(den)) {
            effectiveWeights.put("basic", 0.0);
            effectiveWeights.put("content", 0.0);
            effectiveWeights.put("collaborative", 0.0);
            effectiveWeights.put("context", 0.0);
            contributions.put("basic", 0.0);
            contributions.put("content", 0.0);
            contributions.put("collaborative", 0.0);
            contributions.put("context", 0.0);
            return new HybridBreakdown(
                    0.0, true, "PUBLIC_DISCOVERY_FALLBACK",
                    !itemDegradedReasons.isEmpty(), List.copyOf(itemDegradedReasons),
                    configuredWeights, effectiveWeights, contributions,
                    b, c, f, x
            );
        }

        double effB = (b.available() && config.weightBasic() > 0.0) ? config.weightBasic() / den : 0.0;
        double effC = (c.available() && config.weightContent() > 0.0) ? config.weightContent() / den : 0.0;
        double effF = (f.available() && config.weightCollaborative() > 0.0) ? config.weightCollaborative() / den : 0.0;
        double effX = (x.available() && config.weightContext() > 0.0) ? config.weightContext() / den : 0.0;

        effectiveWeights.put("basic", effB);
        effectiveWeights.put("content", effC);
        effectiveWeights.put("collaborative", effF);
        effectiveWeights.put("context", effX);

        contributions.put("basic", b.available() ? effB * b.score() : 0.0);
        contributions.put("content", c.available() ? effC * c.score() : 0.0);
        contributions.put("collaborative", f.available() ? effF * f.score() : 0.0);
        contributions.put("context", x.available() ? effX * x.score() : 0.0);

        double finalScore = Math.max(0.0, Math.min(1.0, num / den));
        return new HybridBreakdown(
                finalScore, false, null,
                !itemDegradedReasons.isEmpty(), List.copyOf(itemDegradedReasons),
                configuredWeights, effectiveWeights, contributions,
                b, c, f, x
        );
    }

    private static ScorerResult safeScore(
            String key,
            RankingConfig config,
            PlaceSnapshot place,
            List<String> degradedReasons,
            Supplier<ScorerResult> supplier
    ) {
        try {
            return supplier.get();
        } catch (Exception ex) {
            String reason = "SCORER_FAILED_" + key.toUpperCase(Locale.ROOT);
            degradedReasons.add(reason);
            return ScorerResult.unavailable(
                    UnavailableReason.SCORER_ERROR,
                    config.scorerVersions().getOrDefault(key, key + "_v1"),
                    "error",
                    place.asOf(),
                    Map.of("error_type", ex.getClass().getSimpleName())
            );
        }
    }

    /**
     * Conservative round-robin within ALREADY-ELIGIBLE candidates only.
     * Never injects excluded or out-of-category places; disabled by default until evaluated.
     */
    private static List<RankedCandidate> applyConservativeCategoryDiversity(List<RankedCandidate> sorted) {
        if (sorted.size() <= 2) return sorted;
        List<RankedCandidate> remaining = new ArrayList<>(sorted);
        List<RankedCandidate> output = new ArrayList<>(sorted.size());
        String lastCat = null;
        int consecutive = 0;

        while (!remaining.isEmpty()) {
            int pickIdx = 0;
            if (consecutive >= 2 && lastCat != null) {
                for (int i = 0; i < remaining.size(); i++) {
                    String cat = remaining.get(i).place().primaryCategoryKey();
                    if (!lastCat.equals(cat)) {
                        pickIdx = i;
                        break;
                    }
                }
            }
            RankedCandidate chosen = remaining.remove(pickIdx);
            String chosenCat = chosen.place().primaryCategoryKey();
            if (chosenCat.equals(lastCat)) {
                consecutive++;
            } else {
                lastCat = chosenCat;
                consecutive = 1;
            }
            output.add(chosen);
        }
        return output;
    }
}
