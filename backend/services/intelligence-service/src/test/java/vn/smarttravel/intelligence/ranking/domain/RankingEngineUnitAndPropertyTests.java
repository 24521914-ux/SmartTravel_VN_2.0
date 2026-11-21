package vn.smarttravel.intelligence.ranking.domain;

import static org.assertj.core.api.Assertions.*;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import org.junit.jupiter.api.Test;
import vn.smarttravel.intelligence.ranking.domain.ItemBasedCfBuilder.InteractionRecord;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;

/**
 * Exhaustive Unit + Hand-Calculated Formula + Property/Metamorphic tests covering
 * Sections 6, 7, 8, 9, 10, 11, and 19 of the specification.
 */
class RankingEngineUnitAndPropertyTests {

    private static final Instant NOW = Instant.parse("2026-11-21T12:00:00Z");
    private static final UUID DEST_DN = UUID.fromString("50000000-0000-0000-0000-000000000003");
    private static final UUID CAT_CAFE = UUID.fromString("10000000-0000-0000-0000-000000000010");
    private static final UUID CAT_BEACH = UUID.fromString("10000000-0000-0000-0000-000000000011");

    private PlaceSnapshot place(
            UUID id, String name, Set<UUID> cats, Set<String> tags, Double price,
            Double lat, Double lon, long n, double rAvg, long pop30d, boolean popPipe,
            SpaceType space, Instant firstObserved
    ) {
        return new PlaceSnapshot(
                id, 1L, 1L, "PUBLISHED", name, name, "Da Nang", "desc",
                cats, null, Set.of(DEST_DN), tags, Set.of(),
                price, price, "VND", BudgetBasis.PER_PERSON,
                lat, lon, n, n * rAvg, pop30d, popPipe,
                space, List.of(new OpeningShift(1, 480, 1320, false)),
                firstObserved, NOW, null
        );
    }

    private RankingRequest baseReq(Map<String, Double> softPrefs, Double lat, Double lon, Double maxDistKm, Double maxBudget) {
        return new RankingRequest(
                10, "VND", BudgetBasis.PER_PERSON, DEST_DN, null, Set.of(),
                Set.of(), Set.of(), softPrefs, null, maxBudget, null, null,
                lat, lon, maxDistKm, null, null, null, null, "Asia/Ho_Chi_Minh",
                false, false, null, NOW
        );
    }

    // ── 1. Config validation (invalid weights, NaN, Infinity, zero sum) ─────────

    @Test
    void configRejectsInvalidWeightsNaNInfinityAndZeroSum() {
        assertThatThrownBy(() -> new RankingConfig(
                UUID.randomUUID(), "bad", -0.1, 0.5, 0.3, 0.3,
                10, 0.6, 0.4, 30, 7, 5, 5, 0.7, 0.3, false, 10, 100, 50, 3, 5, 1000, 10, 50, false,
                UnknownPricePolicy.EXCLUDE, RankingConfig.defaultScorerVersions(), "UNVALIDATED"
        )).isInstanceOf(IllegalArgumentException.class);

        assertThatThrownBy(() -> new RankingConfig(
                UUID.randomUUID(), "bad-nan", Double.NaN, 0.5, 0.3, 0.2,
                10, 0.6, 0.4, 30, 7, 5, 5, 0.7, 0.3, false, 10, 100, 50, 3, 5, 1000, 10, 50, false,
                UnknownPricePolicy.EXCLUDE, RankingConfig.defaultScorerVersions(), "UNVALIDATED"
        )).isInstanceOf(IllegalArgumentException.class);

        assertThatThrownBy(() -> new RankingConfig(
                UUID.randomUUID(), "bad-inf", Double.POSITIVE_INFINITY, 0.5, 0.3, 0.2,
                10, 0.6, 0.4, 30, 7, 5, 5, 0.7, 0.3, false, 10, 100, 50, 3, 5, 1000, 10, 50, false,
                UnknownPricePolicy.EXCLUDE, RankingConfig.defaultScorerVersions(), "UNVALIDATED"
        )).isInstanceOf(IllegalArgumentException.class);

        assertThatThrownBy(() -> new RankingConfig(
                UUID.randomUUID(), "bad-zero", 0.0, 0.0, 0.0, 0.0,
                10, 0.6, 0.4, 30, 7, 5, 5, 0.7, 0.3, false, 10, 100, 50, 3, 5, 1000, 10, 50, false,
                UnknownPricePolicy.EXCLUDE, RankingConfig.defaultScorerVersions(), "UNVALIDATED"
        )).isInstanceOf(IllegalArgumentException.class);
    }

    // ── 2. BasicScorer: hand-calculated Bayesian rating + log1p popularity ──────

    @Test
    void basicScorerMatchesHandCalculatedBayesianRatingAndPopularity() {
        RankingConfig cfg = RankingConfig.baseline();
        // Hand calculation:
        // n=20, r=4.5, m=10, mu=3.9 => RatingAdjusted = (20*4.5 + 10*3.9)/30 = 129/30 = 4.3
        // RatingScore = (4.3 - 1) / 4 = 3.3 / 4 = 0.825
        // p=9, p_ref=99 => PopScore = ln(10)/ln(100) = 0.5
        // Basic = 0.60 * 0.825 + 0.40 * 0.5 = 0.495 + 0.200 = 0.695
        CohortStats cohorts = new CohortStats("snap-1", NOW, 30, 5, Map.of(
                "global", new CohortStatEntry("global", 3.9, 50, 99.0, 50)
        ));
        PlaceSnapshot p = place(UUID.randomUUID(), "Cafe A", Set.of(CAT_CAFE), Set.of("quiet"), 50_000.0,
                16.05, 108.22, 20, 4.5, 9, true, SpaceType.INDOOR, NOW.minus(30, ChronoUnit.DAYS));

        ScorerResult res = new BasicScorer().score(p, baseReq(Map.of(), null, null, null, null), cfg, cohorts);
        assertThat(res.available()).isTrue();
        assertThat(res.score()).isCloseTo(0.695, within(1e-6));
        assertThat((Double) res.breakdown().get("rating_score")).isCloseTo(0.825, within(1e-6));
        assertThat((Double) res.breakdown().get("popularity_score")).isCloseTo(0.5, within(1e-6));
    }

    @Test
    void basicScorerHandlesZeroReviewsNewItemObservationWindowAndMissingPrior() {
        RankingConfig cfg = RankingConfig.baseline();
        // Case A: n=0 with valid prior -> uses prior only, new item within 7d observation window -> popularity unavailable
        CohortStats withPrior = new CohortStats("snap-1", NOW, 30, 5, Map.of(
                "global", new CohortStatEntry("global", 4.0, 20, 10.0, 20)
        ));
        PlaceSnapshot newPlace = place(UUID.randomUUID(), "New Spot", Set.of(CAT_CAFE), Set.of(), 50_000.0,
                16.05, 108.22, 0, 0.0, 0, true, SpaceType.UNKNOWN, NOW.minus(2, ChronoUnit.DAYS));

        ScorerResult resA = new BasicScorer().score(newPlace, baseReq(Map.of(), null, null, null, null), cfg, withPrior);
        assertThat(resA.available()).isTrue();
        // Rating only: (4.0 - 1) / 4 = 0.75 (popularity excluded due to NEW_ITEM_OBSERVATION_WINDOW)
        assertThat(resA.score()).isCloseTo(0.75, within(1e-6));
        assertThat(resA.reasonCodes()).contains("RATING_PRIOR_ONLY");
        assertThat(resA.breakdown().get("popularity_unavailable_reason")).isEqualTo(UnavailableReason.NEW_ITEM_OBSERVATION_WINDOW.name());

        // Case B: n=0 with NO prior AND p_ref=0 -> Basic is completely unavailable (score MUST be null, NOT 0)
        CohortStats emptyCohort = new CohortStats("snap-empty", NOW, 30, 5, Map.of(
                "global", new CohortStatEntry("global", null, 0, 0.0, 10)
        ));
        ScorerResult resB = new BasicScorer().score(newPlace, baseReq(Map.of(), null, null, null, null), cfg, emptyCohort);
        assertThat(resB.available()).isFalse();
        assertThat(resB.score()).isNull();
        assertThat(resB.unavailableReason()).isEqualTo(UnavailableReason.NO_PRIOR_SAMPLE);
    }

    // ── 3. ContentScorer: structured match/mismatch/unknown/no-pref/no-double-score ─

    @Test
    void contentScorerDistinguishesMatchMismatchUnknownAndKeepsUnknownInDenominator() {
        RankingConfig cfg = RankingConfig.baseline();
        // Request wants 2 soft prefs: quiet (weight 1) & space:indoor (weight 1)
        Map<String, Double> soft = new LinkedHashMap<>();
        soft.put("quiet", 1.0);
        soft.put("space:indoor", 1.0);

        // Item 1: verified quiet=true, space=UNKNOWN -> match=1, unknown=1, totalWeight=2 => score = 1/2 = 0.5 (NOT 1.0!)
        PlaceSnapshot pPartial = place(UUID.randomUUID(), "Partial", Set.of(CAT_CAFE), Set.of("quiet"), 50_000.0,
                16.05, 108.22, 5, 4.0, 2, true, SpaceType.UNKNOWN, NOW.minus(30, ChronoUnit.DAYS));
        ScorerResult rPartial = new ContentScorer().score(pPartial, UserContext.guest(), baseReq(soft, null, null, null, null), cfg);
        assertThat(rPartial.available()).isTrue();
        assertThat(rPartial.score()).isCloseTo(0.5, within(1e-6));
        assertThat((Double) rPartial.breakdown().get("known_feature_coverage")).isCloseTo(0.5, within(1e-6));
        assertThat((List<?>) rPartial.breakdown().get("unknown_fields")).hasSize(1);
        assertThat(rPartial.breakdown().get("unknown_fields")).isEqualTo(List.of("space:indoor"));

        // Item 2: NO tags and space=UNKNOWN -> 0 verified attributes -> unavailable (NO_VERIFIED_ATTRIBUTES)
        PlaceSnapshot pEmpty = place(UUID.randomUUID(), "EmptyMeta", Set.of(CAT_CAFE), Set.of(), 50_000.0,
                16.05, 108.22, 5, 4.0, 2, true, SpaceType.UNKNOWN, NOW.minus(30, ChronoUnit.DAYS));
        ScorerResult rEmpty = new ContentScorer().score(pEmpty, UserContext.guest(), baseReq(soft, null, null, null, null), cfg);
        assertThat(rEmpty.available()).isFalse();
        assertThat(rEmpty.score()).isNull();
        assertThat(rEmpty.unavailableReason()).isEqualTo(UnavailableReason.NO_VERIFIED_ATTRIBUTES);

        // Item 3: No soft preferences & guest -> unavailable (NO_SOFT_PREFERENCES)
        ScorerResult rNoPref = new ContentScorer().score(pPartial, UserContext.guest(), baseReq(Map.of(), null, null, null, null), cfg);
        assertThat(rNoPref.available()).isFalse();
        assertThat(rNoPref.unavailableReason()).isEqualTo(UnavailableReason.NO_SOFT_PREFERENCES);
    }

    // ── 4. Item-based CF Builder + Scorer: hand-calculated cosine + shrinkage + max(3,5) ─

    @Test
    void cfBuilderAndScorerMatchHandCalculationsAndEdgeCases() {
        UUID u1 = UUID.randomUUID(), u2 = UUID.randomUUID(), u3 = UUID.randomUUID();
        UUID iA = UUID.randomUUID(), iB = UUID.randomUUID(), iC = UUID.randomUUID(), iNew = UUID.randomUUID();

        // u1 liked iA & iB; u2 liked iA & iB; u3 liked iB & iC; u3 added & removed iA (inactive!)
        // Also an event AFTER cutoff must be ignored!
        List<InteractionRecord> records = List.of(
                new InteractionRecord(u1, iA, "FAVORITE_ADDED", NOW.minusSeconds(300)),
                new InteractionRecord(u1, iB, "TRIP_ITEM_ADDED", NOW.minusSeconds(290)),
                new InteractionRecord(u2, iA, "FAVORITE_ADDED", NOW.minusSeconds(280)),
                new InteractionRecord(u2, iB, "FAVORITE_ADDED", NOW.minusSeconds(270)),
                new InteractionRecord(u3, iA, "FAVORITE_ADDED", NOW.minusSeconds(260)),
                new InteractionRecord(u3, iA, "FAVORITE_REMOVED", NOW.minusSeconds(250)), // cancelled!
                new InteractionRecord(u3, iB, "FAVORITE_ADDED", NOW.minusSeconds(240)),
                new InteractionRecord(u3, iC, "FAVORITE_ADDED", NOW.minusSeconds(230)),
                new InteractionRecord(u1, iC, "TRIP_ITEM_ADDED", NOW.plusSeconds(60)) // AFTER cutoff!
        );

        // With lambda = 10:
        // |U_A| = 2 (u1, u2), |U_B| = 3 (u1, u2, u3), n_common(A,B) = 2
        // raw_cos(A,B) = 2 / sqrt(6)
        // sim_adj(A,B) = (2 / sqrt(6)) * (2 / (2 + 10)) = (2 / sqrt(6)) * (2 / 12) = 1 / (3 * sqrt(6))
        var built = new ItemBasedCfBuilder().build(UUID.randomUUID(), "cf-test", records, NOW, 10.0, 100);
        assertThat(built.excludedAfterCutoff()).isEqualTo(1);
        assertThat(built.excludedInactive()).isEqualTo(1);

        CfArtifactData artifact = built.artifact();
        // No self-neighbor
        assertThat(artifact.neighborsByItem().get(iA)).noneMatch(n -> n.neighborPlaceId().equals(iA));
        double expectedSimAB = (2.0 / Math.sqrt(6.0)) * (2.0 / 12.0);
        double actualSimAB = artifact.neighborsByItem().get(iA).stream()
                .filter(n -> n.neighborPlaceId().equals(iB)).findFirst().orElseThrow().adjustedSimilarity();
        assertThat(actualSimAB).isCloseTo(expectedSimAB, within(1e-9));

        // Scoring user with BOTH favorite + add-to-trip on iB (weight = max(3,5) = 5, NOT 8!) and favorite on iC (weight = 3):
        // Denominator = 5 + 3 = 8 (includes iC even though sim(iA, iC) == 0!)
        // F(u, iA) = (5 * sim_adj(A,B) + 3 * 0) / 8
        UserContext user = new UserContext(UUID.randomUUID(), true, true, 1L, Set.of(), Set.of(), List.of(
                new UserHistoryItem(iB, true, true, NOW.minusSeconds(10)),
                new UserHistoryItem(iC, true, false, NOW.minusSeconds(20))
        ));
        RankingConfig cfg = RankingConfig.baseline();
        PlaceSnapshot pA = place(iA, "A", Set.of(CAT_CAFE), Set.of(), 50_000.0, 16.05, 108.22, 5, 4.0, 2, true, SpaceType.INDOOR, NOW.minus(30, ChronoUnit.DAYS));
        ScorerResult cfRes = new CollaborativeScorer().score(pA, user, cfg, artifact);
        assertThat(cfRes.available()).isTrue();
        assertThat(cfRes.score()).isCloseTo((5.0 * expectedSimAB) / 8.0, within(1e-9));

        // New item with NO support in artifact -> unavailable (NO_ITEM_SUPPORT)
        PlaceSnapshot pNew = place(iNew, "New", Set.of(CAT_CAFE), Set.of(), 50_000.0, 16.05, 108.22, 0, 0.0, 0, true, SpaceType.UNKNOWN, NOW);
        ScorerResult newRes = new CollaborativeScorer().score(pNew, user, cfg, artifact);
        assertThat(newRes.available()).isFalse();
        assertThat(newRes.unavailableReason()).isEqualTo(UnavailableReason.NO_ITEM_SUPPORT);

        // Supported item (iC) with user whose history only contains iA (zero overlap with iC) -> available=true, score=0.0!
        UserContext disjointUser = new UserContext(UUID.randomUUID(), true, true, 1L, Set.of(), Set.of(), List.of(
                new UserHistoryItem(iA, true, false, NOW.minusSeconds(10))
        ));
        PlaceSnapshot pC = place(iC, "C", Set.of(CAT_CAFE), Set.of(), 50_000.0, 16.05, 108.22, 5, 4.0, 2, true, SpaceType.INDOOR, NOW.minus(30, ChronoUnit.DAYS));
        ScorerResult zeroOverlap = new CollaborativeScorer().score(pC, disjointUser, cfg, artifact);
        assertThat(zeroOverlap.available()).isTrue();
        assertThat(zeroOverlap.score()).isEqualTo(0.0);

        // Consent denied -> unavailable (CONSENT_DENIED)
        UserContext noConsent = new UserContext(UUID.randomUUID(), true, false, null, Set.of(), Set.of(), user.positiveHistory());
        ScorerResult denied = new CollaborativeScorer().score(pA, noConsent, cfg, artifact);
        assertThat(denied.available()).isFalse();
        assertThat(denied.unavailableReason()).isEqualTo(UnavailableReason.CONSENT_DENIED);
    }

    // ── 5. ContextScorer: distance units, missing origin, weather unavailable ───

    @Test
    void contextScorerDistanceAndWeatherNormalization() {
        RankingConfig cfg = RankingConfig.baseline(); // distance_scale_km = 5.0, dist=0.70, weather=0.30
        PlaceSnapshot p = place(UUID.randomUUID(), "Beach", Set.of(CAT_BEACH), Set.of(), 0.0,
                16.05, 108.22, 10, 4.5, 5, true, SpaceType.OUTDOOR, NOW.minus(30, ChronoUnit.DAYS));

        // Distance 2.0 km with scale 5.0 km -> DistanceScore = 1 - 2/5 = 0.60; weather unavailable -> context = 0.60 (100% distance)
        ScorerResult res = new ContextScorer().score(p, 2.0, baseReq(Map.of(), 16.05, 108.20, 10.0, null), cfg);
        assertThat(res.available()).isTrue();
        assertThat(res.score()).isCloseTo(0.60, within(1e-6));
        assertThat((Double) res.breakdown().get("effective_distance_weight")).isCloseTo(1.0, within(1e-6));

        // Missing origin -> unavailable (NO_ORIGIN_COORDINATES)
        ScorerResult noOrigin = new ContextScorer().score(p, null, baseReq(Map.of(), null, null, null, null), cfg);
        assertThat(noOrigin.available()).isFalse();
        assertThat(noOrigin.unavailableReason()).isEqualTo(UnavailableReason.NO_ORIGIN_COORDINATES);

        // With real weather adapter returning RAIN for OUTDOOR place (suitability=0.15):
        // Context = 0.70 * 0.60 + 0.30 * 0.15 = 0.42 + 0.045 = 0.465
        WeatherAdapter rainyAdapter = (lat, lon, t) -> Optional.of(
                new WeatherAdapter.WeatherObservation("RAIN", NOW.minusSeconds(60), NOW.plusSeconds(3600), "test-weather"));
        ScorerResult withRain = new ContextScorer(rainyAdapter).score(p, 2.0, baseReq(Map.of(), 16.05, 108.20, 10.0, null), cfg);
        assertThat(withRain.available()).isTrue();
        assertThat(withRain.score()).isCloseTo(0.465, within(1e-6));
    }

    // ── 6. Property / Metamorphic Tests ─────────────────────────────────────────

    @Test
    void propertyHybridUnavailableExcludedWeightZeroIgnoredMonotonicAndPermutationInvariant() {
        RankingConfig cfg = RankingConfig.baseline();
        ScorerResult b = ScorerResult.available(0.8, "basic_v1", "s", NOW, List.of(), Map.of());
        ScorerResult c = ScorerResult.unavailable(UnavailableReason.NO_SOFT_PREFERENCES, "content_v1", "s", NOW, Map.of());
        ScorerResult f = ScorerResult.unavailable(UnavailableReason.ARTIFACT_MISSING, "cf_item_v1", "s", NOW, Map.of());
        ScorerResult x = ScorerResult.available(0.4, "context_v1", "s", NOW, List.of(), Map.of());

        // Unavailable components (C, F) contribute 0 to numerator and 0 to denominator:
        // H = (0.20*0.8 + 0.25*0.4) / (0.20 + 0.25) = (0.16 + 0.10) / 0.45 = 0.26 / 0.45
        HybridBreakdown hb = HybridRankingEngine.combineHybrid(b, c, f, x, cfg, List.of());
        assertThat(hb.fallbackUsed()).isFalse();
        assertThat(hb.finalScore()).isCloseTo(0.26 / 0.45, within(1e-9));
        assertThat(hb.effectiveWeights().get("content")).isEqualTo(0.0);
        assertThat(hb.effectiveWeights().get("collaborative")).isEqualTo(0.0);

        // Monotonicity: increasing a component score never lowers Hybrid score
        ScorerResult bHigher = ScorerResult.available(0.95, "basic_v1", "s", NOW, List.of(), Map.of());
        HybridBreakdown hbHigher = HybridRankingEngine.combineHybrid(bHigher, c, f, x, cfg, List.of());
        assertThat(hbHigher.finalScore()).isGreaterThanOrEqualTo(hb.finalScore());

        // Denominator zero triggers public discovery fallback cleanly
        ScorerResult unavail = ScorerResult.unavailable(UnavailableReason.NO_DATA, "v1", "s", NOW, Map.of());
        HybridBreakdown fb = HybridRankingEngine.combineHybrid(unavail, unavail, unavail, unavail, cfg, List.of());
        assertThat(fb.fallbackUsed()).isTrue();
        assertThat(fb.fallbackReason()).isEqualTo("PUBLIC_DISCOVERY_FALLBACK");

        // Permutation invariance + hard exclusion + deterministic tie-break
        UUID id1 = UUID.fromString("00000000-0000-4000-8000-000000000001");
        UUID id2 = UUID.fromString("00000000-0000-4000-8000-000000000002");
        UUID idExpensive = UUID.fromString("00000000-0000-4000-8000-000000000003");
        UUID idUnknownPrice = UUID.fromString("00000000-0000-4000-8000-000000000004");

        PlaceSnapshot p1 = place(id1, "Tie A", Set.of(CAT_CAFE), Set.of("quiet"), 50_000.0, 16.05, 108.22, 10, 4.5, 5, true, SpaceType.INDOOR, NOW.minus(30, ChronoUnit.DAYS));
        PlaceSnapshot p2 = place(id2, "Tie B", Set.of(CAT_CAFE), Set.of("quiet"), 50_000.0, 16.05, 108.22, 10, 4.5, 5, true, SpaceType.INDOOR, NOW.minus(30, ChronoUnit.DAYS));
        PlaceSnapshot pExp = place(idExpensive, "Too Expensive", Set.of(CAT_CAFE), Set.of("quiet"), 999_000.0, 16.05, 108.22, 100, 5.0, 99, true, SpaceType.INDOOR, NOW.minus(30, ChronoUnit.DAYS));
        PlaceSnapshot pUnk = place(idUnknownPrice, "Unknown Price", Set.of(CAT_CAFE), Set.of("quiet"), null, 16.05, 108.22, 100, 5.0, 99, true, SpaceType.INDOOR, NOW.minus(30, ChronoUnit.DAYS));

        CohortStats cohorts = new CohortStats("s1", NOW, 30, 5, Map.of("global", new CohortStatEntry("global", 4.0, 20, 50.0, 20)));
        RankingRequest req = baseReq(Map.of("quiet", 1.0), 16.05, 108.22, 5.0, 150_000.0);
        HybridRankingEngine engine = new HybridRankingEngine();

        RankingOutput out1 = engine.rank(List.of(p1, p2, pExp, pUnk), UserContext.guest(), req, cfg, cohorts, null, Set.of());
        RankingOutput out2 = engine.rank(List.of(pUnk, pExp, p2, p1), UserContext.guest(), req, cfg, cohorts, null, Set.of());

        // Hard-excluded items NEVER appear even with higher ratings/popularity
        assertThat(out1.ranked()).extracting(r -> r.place().placeId()).containsExactly(id1, id2);
        // Permutation of input yields bit-for-bit identical order
        assertThat(out2.ranked()).extracting(r -> r.place().placeId()).containsExactly(id1, id2);
        // Unknown price excluded with explicit reason
        assertThat(out1.exclusions()).anyMatch(e -> e.placeId().equals(idUnknownPrice) && e.reasonCode().equals("UNKNOWN_PRICE_EXCLUDED"));
    }
}
