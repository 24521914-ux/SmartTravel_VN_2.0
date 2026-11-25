package vn.smarttravel.intelligence.ranking.domain;

import java.util.*;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;

/**
 * Deterministic hard-constraint filter. Never silently relaxes hard constraints to fill topN.
 */
public final class HardConstraintFilter {

    public record FilteredCandidate(PlaceSnapshot place, Double distanceKm, OpeningStatus openingStatus) {}
    public record FilterResult(List<FilteredCandidate> passed, List<FilterExclusion> exclusions) {}

    public FilterResult filter(List<PlaceSnapshot> places, RankingRequest request, RankingConfig config, Set<UUID> inactiveCategories) {
        List<FilteredCandidate> passed = new ArrayList<>();
        List<FilterExclusion> exclusions = new ArrayList<>();
        Set<UUID> seen = new HashSet<>();

        for (PlaceSnapshot p : places) {
            if (!seen.add(p.placeId())) {
                exclusions.add(new FilterExclusion(p.placeId(), p.name(), "DUPLICATE_CANONICAL_PLACE", "Duplicate canonical place_id"));
                continue;
            }
            if (!"PUBLISHED".equals(p.status())) {
                exclusions.add(new FilterExclusion(p.placeId(), p.name(), "NOT_PUBLISHED", "Status is " + p.status()));
                continue;
            }
            if (inactiveCategories != null && !Collections.disjoint(p.categoryIds(), inactiveCategories)) {
                exclusions.add(new FilterExclusion(p.placeId(), p.name(), "INACTIVE_CATEGORY", "Place belongs to inactive category"));
                continue;
            }
            // 1. Geographic scope (destination_id / geographic_unit_id)
            if (request.destinationId() != null && !p.destinationIds().contains(request.destinationId())) {
                exclusions.add(new FilterExclusion(p.placeId(), p.name(), "OUTSIDE_DESTINATION_SCOPE", "Place not in destination " + request.destinationId()));
                continue;
            }
            if (request.geographicUnitId() != null) {
                Set<UUID> allowedGeo = request.expandedGeoUnitIds() != null && !request.expandedGeoUnitIds().isEmpty()
                        ? request.expandedGeoUnitIds()
                        : Set.of(request.geographicUnitId());
                if (p.geographicUnitId() == null || !allowedGeo.contains(p.geographicUnitId())) {
                    exclusions.add(new FilterExclusion(p.placeId(), p.name(), "OUTSIDE_GEOGRAPHIC_SCOPE", "Place outside geographic unit " + request.geographicUnitId()));
                    continue;
                }
            }
            // 2. Hard category filter
            if (request.categoryIds() != null && !request.categoryIds().isEmpty()
                    && Collections.disjoint(request.categoryIds(), p.categoryIds())) {
                exclusions.add(new FilterExclusion(p.placeId(), p.name(), "CATEGORY_MISMATCH", "No matching category_id"));
                continue;
            }
            // 3. Hard tags (unknown != confirmed match)
            if (request.hardTags() != null && !request.hardTags().isEmpty()) {
                boolean allMatched = request.hardTags().stream().allMatch(t -> p.structuredTags().contains(t));
                if (!allMatched) {
                    exclusions.add(new FilterExclusion(p.placeId(), p.name(), "HARD_TAG_UNSATISFIED", "Missing required hard tag"));
                    continue;
                }
            }
            // 4. Hard space requirement (only if explicitly requested)
            if (request.requiredSpace() != null && request.requiredSpace() != SpaceType.UNKNOWN && request.requiredSpace() != SpaceType.BOTH) {
                if (p.spaceType() != request.requiredSpace() && p.spaceType() != SpaceType.BOTH) {
                    String reason = p.spaceType() == SpaceType.UNKNOWN ? "UNKNOWN_SPACE_EXCLUDED" : "SPACE_TYPE_MISMATCH";
                    exclusions.add(new FilterExclusion(p.placeId(), p.name(), reason, "Required " + request.requiredSpace() + ", got " + p.spaceType()));
                    continue;
                }
            }
            // 5. Hard per-place budget (unknown price != 0; currency must match)
            boolean hasBudgetConstraint = request.maxBudget() != null || request.minBudget() != null;
            if (hasBudgetConstraint) {
                Double effectivePrice = p.effectivePrice();
                if (effectivePrice == null) {
                    boolean allowUnknown = request.includeUnknownPrice() || config.unknownPricePolicy() == UnknownPricePolicy.ALLOW;
                    if (!allowUnknown) {
                        exclusions.add(new FilterExclusion(p.placeId(), p.name(), "UNKNOWN_PRICE_EXCLUDED", "Price is unknown and excluded by hard budget policy"));
                        continue;
                    }
                } else {
                    if (p.currency() == null || !p.currency().equalsIgnoreCase(request.currency())) {
                        exclusions.add(new FilterExclusion(p.placeId(), p.name(), "CURRENCY_MISMATCH", "Place currency " + p.currency() + " != " + request.currency()));
                        continue;
                    }
                    if (request.budgetBasis() != null && p.priceBasis() != null && request.budgetBasis() != p.priceBasis()) {
                        exclusions.add(new FilterExclusion(p.placeId(), p.name(), "PRICE_BASIS_MISMATCH", "Place price basis " + p.priceBasis() + " != " + request.budgetBasis()));
                        continue;
                    }
                    if (request.minBudget() != null && effectivePrice < request.minBudget()) {
                        exclusions.add(new FilterExclusion(p.placeId(), p.name(), "BELOW_MIN_BUDGET", "Price " + effectivePrice + " < " + request.minBudget()));
                        continue;
                    }
                    if (request.maxBudget() != null && effectivePrice > request.maxBudget()) {
                        exclusions.add(new FilterExclusion(p.placeId(), p.name(), "EXCEEDS_MAX_BUDGET", "Price " + effectivePrice + " > " + request.maxBudget()));
                        continue;
                    }
                }
            }
            // 6. Hard minimum rating
            if (request.minRating() != null) {
                Double avg = p.approvedRatingAvg();
                if (avg == null) {
                    exclusions.add(new FilterExclusion(p.placeId(), p.name(), "UNKNOWN_RATING_EXCLUDED", "No approved rating available"));
                    continue;
                }
                if (avg < request.minRating()) {
                    exclusions.add(new FilterExclusion(p.placeId(), p.name(), "BELOW_MIN_RATING", "Rating " + avg + " < " + request.minRating()));
                    continue;
                }
            }
            // 7. Hard distance filter (only applied when origin AND maxDistanceKm are provided)
            Double distanceKm = null;
            if (request.hasOrigin() && p.latitude() != null && p.longitude() != null
                    && Double.isFinite(p.latitude()) && Double.isFinite(p.longitude())) {
                distanceKm = haversineKm(request.originLat(), request.originLon(), p.latitude(), p.longitude());
            }
            if (request.hasOrigin() && request.maxDistanceKm() != null) {
                if (distanceKm == null) {
                    exclusions.add(new FilterExclusion(p.placeId(), p.name(), "MISSING_COORDINATES_FOR_DISTANCE", "Place lacks valid coordinates for hard distance filter"));
                    continue;
                }
                if (distanceKm > request.maxDistanceKm()) {
                    exclusions.add(new FilterExclusion(p.placeId(), p.name(), "EXCEEDS_MAX_DISTANCE", String.format(Locale.US, "Distance %.2f km > %.2f km", distanceKm, request.maxDistanceKm())));
                    continue;
                }
            }
            // 8. Opening hours / visit time check (unknown != open)
            OpeningStatus openingStatus = evaluateOpeningStatus(p, request);
            if (request.excludeClosed() && openingStatus == OpeningStatus.CLOSED) {
                exclusions.add(new FilterExclusion(p.placeId(), p.name(), "CLOSED_AT_VISIT_TIME", "Confirmed closed during requested visit window"));
                continue;
            }

            passed.add(new FilteredCandidate(p, distanceKm, openingStatus));
        }

        return new FilterResult(passed, exclusions);
    }

    public static OpeningStatus evaluateOpeningStatus(PlaceSnapshot place, RankingRequest request) {
        if (request.visitStartMinute() == null || request.visitEndMinute() == null) {
            return OpeningStatus.UNKNOWN;
        }
        if (place.openingHours() == null || place.openingHours().isEmpty()) {
            return OpeningStatus.UNKNOWN;
        }
        int start = request.visitStartMinute();
        int end = request.visitEndMinute();
        Integer weekday = request.visitDayOfWeek();
        boolean sawRelevantShift = false;
        for (OpeningShift shift : place.openingHours()) {
            if (weekday != null && shift.weekday() != weekday) {
                continue;
            }
            sawRelevantShift = true;
            int open = shift.openMinute();
            int close = (shift.overnight() || shift.closeMinute() <= shift.openMinute())
                    ? shift.closeMinute() + 1440
                    : shift.closeMinute();
            if (open < end && close > start) {
                return OpeningStatus.OPEN;
            }
        }
        return sawRelevantShift ? OpeningStatus.CLOSED : OpeningStatus.UNKNOWN;
    }

    public static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.pow(Math.sin(dLat / 2.0), 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.pow(Math.sin(dLon / 2.0), 2);
        return 6371.0 * 2.0 * Math.asin(Math.sqrt(Math.min(1.0, a)));
    }
}
