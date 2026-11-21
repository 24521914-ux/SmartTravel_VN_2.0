package vn.smarttravel.intelligence.ranking.domain;

import java.time.Instant;
import java.util.*;

/** Immutable domain models for modular Hybrid recommendation ranking. */
public final class RankingModels {
    private RankingModels() {}

    public enum BudgetBasis {
        PER_PERSON, PER_VISIT, OFFERING
    }

    public enum UnknownPricePolicy {
        EXCLUDE, ALLOW
    }

    public enum SpaceType {
        INDOOR, OUTDOOR, BOTH, UNKNOWN
    }

    public enum OpeningStatus {
        OPEN, CLOSED, UNKNOWN
    }

    public record OpeningShift(int weekday, int openMinute, int closeMinute, boolean overnight) {}

    public record RankingConfig(
            UUID configVersionId,
            String versionTag,
            double weightBasic,
            double weightContent,
            double weightCollaborative,
            double weightContext,
            double ratingM,
            double ratingWeight,
            double popularityWeight,
            int popularityWindowDays,
            int minObservationDays,
            int cohortMinSample,
            double distanceScaleKm,
            double distanceWeight,
            double weatherWeight,
            boolean useMaxDistanceAsScale,
            double cfLambda,
            int cfTopK,
            int cfHistoryLimit,
            double cfFavoriteWeight,
            double cfTripWeight,
            int candidateCap,
            int topNDefault,
            int topNMax,
            boolean diversityEnabled,
            UnknownPricePolicy unknownPricePolicy,
            Map<String, String> scorerVersions,
            String qualityStatus
    ) {
        public RankingConfig {
            validateWeight("basic", weightBasic);
            validateWeight("content", weightContent);
            validateWeight("collaborative", weightCollaborative);
            validateWeight("context", weightContext);
            double sum = weightBasic + weightContent + weightCollaborative + weightContext;
            if (!Double.isFinite(sum) || sum <= 0.0) {
                throw new IllegalArgumentException("Configured hybrid weights must have positive finite sum");
            }
            if (!Double.isFinite(ratingM) || ratingM <= 0.0) throw new IllegalArgumentException("ratingM must be > 0");
            validateWeight("ratingWeight", ratingWeight);
            validateWeight("popularityWeight", popularityWeight);
            if (ratingWeight + popularityWeight <= 0.0) throw new IllegalArgumentException("Basic sub-weights must sum > 0");
            if (!Double.isFinite(distanceScaleKm) || distanceScaleKm <= 0.0) throw new IllegalArgumentException("distanceScaleKm must be > 0");
            validateWeight("distanceWeight", distanceWeight);
            validateWeight("weatherWeight", weatherWeight);
            if (distanceWeight + weatherWeight <= 0.0) throw new IllegalArgumentException("Context sub-weights must sum > 0");
            if (!Double.isFinite(cfLambda) || cfLambda < 0.0) throw new IllegalArgumentException("cfLambda must be >= 0");
            if (cfTopK < 1) throw new IllegalArgumentException("cfTopK must be >= 1");
            if (cfHistoryLimit < 1) throw new IllegalArgumentException("cfHistoryLimit must be >= 1");
            if (candidateCap < 1) throw new IllegalArgumentException("candidateCap must be >= 1");
            if (topNDefault < 1 || topNMax < topNDefault) throw new IllegalArgumentException("Invalid topN bounds");
            unknownPricePolicy = unknownPricePolicy == null ? UnknownPricePolicy.EXCLUDE : unknownPricePolicy;
            scorerVersions = scorerVersions == null ? defaultScorerVersions() : Map.copyOf(scorerVersions);
            qualityStatus = qualityStatus == null ? "UNVALIDATED" : qualityStatus;
        }

        private static void validateWeight(String name, double w) {
            if (!Double.isFinite(w) || w < 0.0) {
                throw new IllegalArgumentException("Weight " + name + " must be finite and >= 0, got: " + w);
            }
        }

        public RankingConfig normalizedWeights() {
            double sum = weightBasic + weightContent + weightCollaborative + weightContext;
            return new RankingConfig(
                    configVersionId, versionTag,
                    weightBasic / sum, weightContent / sum, weightCollaborative / sum, weightContext / sum,
                    ratingM, ratingWeight, popularityWeight, popularityWindowDays, minObservationDays, cohortMinSample,
                    distanceScaleKm, distanceWeight, weatherWeight, useMaxDistanceAsScale,
                    cfLambda, cfTopK, cfHistoryLimit, cfFavoriteWeight, cfTripWeight,
                    candidateCap, topNDefault, topNMax, diversityEnabled, unknownPricePolicy, scorerVersions, qualityStatus
            );
        }

        public static Map<String, String> defaultScorerVersions() {
            return Map.of(
                    "basic", "basic_v1",
                    "content", "content_v1",
                    "collaborative", "cf_item_v1",
                    "context", "context_v1",
                    "hybrid", "hybrid_v1"
            );
        }

        public static RankingConfig baseline() {
            return new RankingConfig(
                    UUID.fromString("00000000-0000-4000-8000-000000000101"),
                    "hybrid-baseline-v1",
                    0.20, 0.45, 0.10, 0.25,
                    10.0, 0.60, 0.40, 30, 7, 5,
                    5.0, 0.70, 0.30, false,
                    10.0, 100, 50, 3.0, 5.0,
                    1000, 10, 50, false, UnknownPricePolicy.EXCLUDE,
                    defaultScorerVersions(),
                    "UNVALIDATED"
            );
        }
    }

    public record PlaceSnapshot(
            UUID placeId,
            long catalogVersion,
            long ratingVersion,
            String status,
            String name,
            String nameEn,
            String address,
            String description,
            Set<UUID> categoryIds,
            UUID geographicUnitId,
            Set<UUID> destinationIds,
            Set<String> structuredTags,
            Set<String> confirmedAbsentTags,
            Double priceMin,
            Double priceMax,
            String currency,
            BudgetBasis priceBasis,
            Double latitude,
            Double longitude,
            long approvedRatingCount,
            double approvedRatingSum,
            long uniquePopularityUsers30d,
            boolean popularityPipelineActive,
            SpaceType spaceType,
            List<OpeningShift> openingHours,
            Instant firstObservedAt,
            Instant asOf,
            UUID sourceId
    ) {
        public Double approvedRatingAvg() {
            if (approvedRatingCount <= 0) return null;
            return approvedRatingSum / approvedRatingCount;
        }

        public Double effectivePrice() {
            if (priceMin != null) return priceMin;
            return priceMax;
        }

        public String primaryDestinationKey() {
            return destinationIds.stream().map(UUID::toString).sorted().findFirst()
                    .orElse(geographicUnitId == null ? "" : geographicUnitId.toString());
        }

        public String primaryCategoryKey() {
            return categoryIds.stream().map(UUID::toString).sorted().findFirst().orElse("");
        }
    }

    public record UserHistoryItem(UUID placeId, boolean favorited, boolean addedToTrip, Instant lastOccurredAt) {}

    public record UserContext(
            UUID userId,
            boolean authenticated,
            boolean personalizationConsent,
            Long consentVersion,
            Set<UUID> profileCategoryIds,
            Set<String> profilePreferenceTags,
            List<UserHistoryItem> positiveHistory
    ) {
        public static UserContext guest() {
            return new UserContext(null, false, false, null, Set.of(), Set.of(), List.of());
        }
    }

    public record RankingRequest(
            int topN,
            String currency,
            BudgetBasis budgetBasis,
            UUID destinationId,
            UUID geographicUnitId,
            Set<UUID> expandedGeoUnitIds,
            Set<UUID> categoryIds,
            Set<String> hardTags,
            Map<String, Double> softPreferences,
            Double minBudget,
            Double maxBudget,
            Double minRating,
            SpaceType requiredSpace,
            Double originLat,
            Double originLon,
            Double maxDistanceKm,
            String visitTimeSlot,
            Integer visitDayOfWeek,
            Integer visitStartMinute,
            Integer visitEndMinute,
            String timezone,
            boolean excludeClosed,
            boolean includeUnknownPrice,
            String weatherConditionOverride,
            Instant now
    ) {
        public boolean hasOrigin() {
            return originLat != null && originLon != null && Double.isFinite(originLat) && Double.isFinite(originLon);
        }
    }

    public record CohortStatEntry(
            String cohortKey,
            Double ratingPriorMu,
            int ratingSampleSize,
            Double popularityP95Ref,
            int popularitySampleSize
    ) {}

    public record CohortStats(
            String snapshotVersion,
            Instant computedAt,
            int windowDays,
            int minSample,
            Map<String, CohortStatEntry> entries
    ) {
        public Optional<CohortStatEntry> resolveRatingCohort(String destKey, String catKey) {
            for (String key : fallbackKeys(destKey, catKey)) {
                CohortStatEntry e = entries.get(key);
                if (e != null && e.ratingPriorMu() != null && Double.isFinite(e.ratingPriorMu()) && e.ratingSampleSize() >= minSample) {
                    return Optional.of(e);
                }
            }
            return Optional.empty();
        }

        public Optional<CohortStatEntry> resolvePopularityCohort(String destKey, String catKey) {
            for (String key : fallbackKeys(destKey, catKey)) {
                CohortStatEntry e = entries.get(key);
                if (e != null && e.popularityP95Ref() != null && Double.isFinite(e.popularityP95Ref())
                        && e.popularityP95Ref() > 0.0 && e.popularitySampleSize() >= minSample) {
                    return Optional.of(e);
                }
            }
            return Optional.empty();
        }

        private List<String> fallbackKeys(String destKey, String catKey) {
            List<String> keys = new ArrayList<>(4);
            if (destKey != null && !destKey.isBlank() && catKey != null && !catKey.isBlank()) {
                keys.add("dest:" + destKey + "|cat:" + catKey);
            }
            if (destKey != null && !destKey.isBlank()) {
                keys.add("dest:" + destKey);
            }
            if (catKey != null && !catKey.isBlank()) {
                keys.add("cat:" + catKey);
            }
            keys.add("global");
            return keys;
        }

        public static CohortStats empty() {
            return new CohortStats("empty", Instant.EPOCH, 30, 5, Map.of());
        }
    }

    public record CfNeighbor(UUID neighborPlaceId, double adjustedSimilarity, double rawCosine, int commonUsers) {}

    public record CfArtifactData(
            UUID artifactId,
            String versionTag,
            String checksum,
            Instant cutoffAt,
            double lambda,
            int topK,
            Set<UUID> supportedItems,
            Map<UUID, List<CfNeighbor>> neighborsByItem,
            boolean activeAndValid
    ) {}

    public record FilterExclusion(UUID placeId, String placeName, String reasonCode, String detail) {}

    public record HybridBreakdown(
            double finalScore,
            boolean fallbackUsed,
            String fallbackReason,
            boolean degraded,
            List<String> degradedReasons,
            Map<String, Double> configuredWeights,
            Map<String, Double> effectiveWeights,
            Map<String, Double> contributions,
            ScorerResult basic,
            ScorerResult content,
            ScorerResult collaborative,
            ScorerResult context
    ) {}

    public record RankedCandidate(
            PlaceSnapshot place,
            int rank,
            double finalScore,
            Double distanceKm,
            OpeningStatus openingStatus,
            HybridBreakdown breakdown,
            List<String> reasonCodes,
            List<String> reasonsVi,
            List<String> reasonsEn,
            String summaryVi,
            String summaryEn
    ) {}

    public record RankingOutput(
            List<RankedCandidate> ranked,
            List<FilterExclusion> exclusions,
            int totalScanned,
            int passedHardFilters,
            int candidateCappedFrom,
            String candidateCapPolicy,
            boolean fallbackUsed,
            String fallbackReason,
            boolean degraded,
            List<String> degradedReasons,
            String emptyReason,
            Instant dataAsOf,
            List<UUID> preRerankOrder,
            List<UUID> postRerankOrder
    ) {}

    /** Extension contract for a real weather provider; returns empty when unavailable. */
    public interface WeatherAdapter {
        record WeatherObservation(String condition, Instant observedAt, Instant expiresAt, String provider) {}
        Optional<WeatherObservation> lookup(double latitude, double longitude, Instant targetTime);
    }

    public static final class NoOpWeatherAdapter implements WeatherAdapter {
        @Override
        public Optional<WeatherObservation> lookup(double latitude, double longitude, Instant targetTime) {
            return Optional.empty();
        }
    }

    /** Extension contract for future semantic/vector Content scorer (not used in v1). */
    public interface SemanticScorerExtension {
        ScorerResult score(PlaceSnapshot place, UserContext user, RankingRequest request);
    }
}
