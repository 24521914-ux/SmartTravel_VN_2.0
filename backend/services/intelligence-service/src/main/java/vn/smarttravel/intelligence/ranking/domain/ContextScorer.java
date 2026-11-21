package vn.smarttravel.intelligence.ranking.domain;

import java.time.Instant;
import java.util.*;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;

/**
 * Context_v1 scorer:
 * - DistanceScore = max(0, 1 - distanceKm / distanceScaleKm) (straight-line km, never called travel time)
 * - WeatherSuitability: only scored when a real WeatherAdapter returns a valid, non-expired observation
 *   AND the place has verified indoor/outdoor metadata. Otherwise unavailable (never faked).
 * - Sub-weights: Distance 0.70, Weather 0.30; normalized to available sub-components.
 */
public final class ContextScorer {
    public static final String VERSION = "context_v1";
    public static final String WEATHER_MAPPING_VERSION = "weather_suitability_v1";

    private final WeatherAdapter weatherAdapter;

    public ContextScorer() {
        this(new NoOpWeatherAdapter());
    }

    public ContextScorer(WeatherAdapter weatherAdapter) {
        this.weatherAdapter = weatherAdapter == null ? new NoOpWeatherAdapter() : weatherAdapter;
    }

    public ScorerResult score(PlaceSnapshot place, Double distanceKm, RankingRequest request, RankingConfig config) {
        String version = config.scorerVersions().getOrDefault("context", VERSION);
        String snapshotVer = "place-v" + place.catalogVersion();
        Map<String, Object> breakdown = new LinkedHashMap<>();
        List<String> reasons = new ArrayList<>();

        // 1. Distance sub-component
        Double distanceScore = null;
        UnavailableReason distanceUnavailable = null;

        if (!request.hasOrigin()) {
            distanceUnavailable = UnavailableReason.NO_ORIGIN_COORDINATES;
            breakdown.put("distance_unavailable_reason", distanceUnavailable.name());
        } else if (distanceKm == null || !Double.isFinite(distanceKm) || distanceKm < 0.0) {
            distanceUnavailable = UnavailableReason.NO_PLACE_COORDINATES;
            breakdown.put("distance_unavailable_reason", distanceUnavailable.name());
        } else {
            double scaleKm = (config.useMaxDistanceAsScale() && request.maxDistanceKm() != null && request.maxDistanceKm() > 0.0)
                    ? request.maxDistanceKm()
                    : config.distanceScaleKm();
            distanceScore = Math.max(0.0, Math.min(1.0, 1.0 - (distanceKm / scaleKm)));
            breakdown.put("distance_km", distanceKm);
            breakdown.put("distance_scale_km", scaleKm);
            breakdown.put("distance_scale_policy", (config.useMaxDistanceAsScale() && request.maxDistanceKm() != null) ? "REQUEST_MAX_DISTANCE" : "CONFIG_DEFAULT");
            breakdown.put("distance_score", distanceScore);
            breakdown.put("distance_unit", "km_straight_line");
            if (distanceKm <= Math.min(2.0, scaleKm * 0.5)) {
                reasons.add("NEAR_ORIGIN");
            } else {
                reasons.add("WITHIN_DISTANCE_SCALE");
            }
        }

        // 2. Weather suitability sub-component (requires real, non-expired provider data + verified space type)
        // Weather is fetched at the request origin (or single anchor) so one city-level observation serves all candidates without N-city HTTP storms.
        Double weatherScore = null;
        UnavailableReason weatherUnavailable = null;
        Instant now = request.now() != null ? request.now() : Instant.now();

        if (!request.hasOrigin()) {
            weatherUnavailable = UnavailableReason.NO_ORIGIN_COORDINATES;
            breakdown.put("weather_unavailable_reason", weatherUnavailable.name());
        } else if (place.latitude() == null || place.longitude() == null) {
            weatherUnavailable = UnavailableReason.NO_PLACE_COORDINATES;
            breakdown.put("weather_unavailable_reason", weatherUnavailable.name());
        } else {
            Optional<WeatherAdapter.WeatherObservation> obsOpt = weatherAdapter.lookup(request.originLat(), request.originLon(), now);
            if (obsOpt.isEmpty()) {
                weatherUnavailable = UnavailableReason.WEATHER_PROVIDER_UNAVAILABLE;
                breakdown.put("weather_unavailable_reason", weatherUnavailable.name());
            } else {
                WeatherAdapter.WeatherObservation obs = obsOpt.get();
                if (obs.expiresAt() != null && now.isAfter(obs.expiresAt())) {
                    weatherUnavailable = UnavailableReason.WEATHER_DATA_STALE;
                    breakdown.put("weather_unavailable_reason", weatherUnavailable.name());
                } else if (place.spaceType() == null || place.spaceType() == SpaceType.UNKNOWN) {
                    weatherUnavailable = UnavailableReason.NO_VERIFIED_ATTRIBUTES;
                    breakdown.put("weather_unavailable_reason", weatherUnavailable.name());
                } else {
                    weatherScore = weatherSuitability(obs.condition(), place.spaceType());
                    breakdown.put("weather_condition", obs.condition());
                    breakdown.put("weather_provider", obs.provider());
                    breakdown.put("weather_observed_at", obs.observedAt().toString());
                    breakdown.put("weather_mapping_version", WEATHER_MAPPING_VERSION);
                    breakdown.put("weather_score", weatherScore);
                    if (weatherScore >= 0.85 && place.spaceType() == SpaceType.INDOOR && isWetWeather(obs.condition())) {
                        reasons.add("WEATHER_INDOOR_SUITABLE");
                    }
                }
            }
        }

        // 3. Combine available context sub-components
        double num = 0.0;
        double den = 0.0;
        if (distanceScore != null) {
            num += config.distanceWeight() * distanceScore;
            den += config.distanceWeight();
        }
        if (weatherScore != null) {
            num += config.weatherWeight() * weatherScore;
            den += config.weatherWeight();
        }

        breakdown.put("distance_available", distanceScore != null);
        breakdown.put("weather_available", weatherScore != null);

        if (den <= 0.0) {
            UnavailableReason reason = distanceUnavailable != null ? distanceUnavailable : weatherUnavailable;
            return ScorerResult.unavailable(reason != null ? reason : UnavailableReason.NO_DATA, version, snapshotVer, place.asOf(), breakdown);
        }

        breakdown.put("effective_distance_weight", distanceScore != null ? config.distanceWeight() / den : 0.0);
        breakdown.put("effective_weather_weight", weatherScore != null ? config.weatherWeight() / den : 0.0);
        double finalContext = Math.max(0.0, Math.min(1.0, num / den));
        breakdown.put("context_score", finalContext);
        return ScorerResult.available(finalContext, version, snapshotVer, place.asOf(), reasons, breakdown);
    }

    /** Versioned deterministic mapping (weather_suitability_v1). */
    public static double weatherSuitability(String condition, SpaceType spaceType) {
        if (condition == null || spaceType == null || spaceType == SpaceType.UNKNOWN) return 0.5;
        String c = condition.trim().toUpperCase(Locale.ROOT);
        return switch (c) {
            case "RAIN", "HEAVY_RAIN", "STORM", "THUNDERSTORM" -> switch (spaceType) {
                case INDOOR -> 1.0;
                case BOTH -> 0.75;
                case OUTDOOR -> 0.15;
                default -> 0.5;
            };
            case "LIGHT_RAIN", "DRIZZLE" -> switch (spaceType) {
                case INDOOR -> 0.95;
                case BOTH -> 0.80;
                case OUTDOOR -> 0.40;
                default -> 0.5;
            };
            case "EXTREME_HEAT" -> switch (spaceType) {
                case INDOOR -> 0.95;
                case BOTH -> 0.75;
                case OUTDOOR -> 0.35;
                default -> 0.5;
            };
            case "CLEAR", "SUNNY", "PARTLY_CLOUDY", "CLOUDY" -> switch (spaceType) {
                case OUTDOOR -> 1.0;
                case BOTH -> 0.95;
                case INDOOR -> 0.80;
                default -> 0.5;
            };
            default -> 0.5;
        };
    }

    private static boolean isWetWeather(String condition) {
        if (condition == null) return false;
        String c = condition.trim().toUpperCase(Locale.ROOT);
        return c.contains("RAIN") || c.contains("STORM") || c.contains("DRIZZLE");
    }
}
