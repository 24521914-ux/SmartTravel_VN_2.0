package vn.smarttravel.intelligence.ranking.service;

import static vn.smarttravel.intelligence.shared.util.IntelligenceSupport.read;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.WeatherAdapter;

/**
 * Real Open-Meteo weather provider (free, no API key required) with coordinate grid bucketing,
 * positive + negative TTL caching, and strict timeouts so external network failures gracefully
 * degrade to WEATHER_PROVIDER_UNAVAILABLE without slowing down ranking.
 */
@Component
public class OpenMeteoWeatherAdapter implements WeatherAdapter {

    private static final String PROVIDER = "open-meteo";
    private static final int MAX_CACHE_ENTRIES = 512;

    private record CacheEntry(WeatherObservation observation, Instant cachedUntil) {
        boolean isExpired(Instant now) {
            return now.isAfter(cachedUntil);
        }
    }

    private final boolean enabled;
    private final String baseUrl;
    private final long cacheTtlSeconds;
    private final long failureCooldownSeconds;
    private final long readTimeoutMs;
    private final HttpClient httpClient;
    private final ConcurrentHashMap<String, CacheEntry> cache = new ConcurrentHashMap<>();

    public OpenMeteoWeatherAdapter(
            @Value("${intelligence.weather.enabled:true}") boolean enabled,
            @Value("${intelligence.weather.open-meteo-url:https://api.open-meteo.com/v1/forecast}") String baseUrl,
            @Value("${intelligence.weather.cache-ttl-seconds:900}") long cacheTtlSeconds,
            @Value("${intelligence.weather.failure-cooldown-seconds:60}") long failureCooldownSeconds,
            @Value("${intelligence.weather.timeout-ms:600}") long readTimeoutMs
    ) {
        this.enabled = enabled;
        this.baseUrl = baseUrl;
        this.cacheTtlSeconds = Math.max(30, cacheTtlSeconds);
        this.failureCooldownSeconds = Math.max(10, failureCooldownSeconds);
        this.readTimeoutMs = Math.max(150, readTimeoutMs);
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(Math.min(400, this.readTimeoutMs)))
                .build();
    }

    @Override
    public Optional<WeatherObservation> lookup(double latitude, double longitude, Instant targetTime) {
        if (!enabled || !Double.isFinite(latitude) || !Double.isFinite(longitude)) {
            return Optional.empty();
        }
        Instant now = targetTime != null ? targetTime : Instant.now();
        // Bucket coordinates to 0.1 degree (~11 km) so all places in one area share 1 weather observation
        double bucketLat = Math.round(latitude * 10.0) / 10.0;
        double bucketLon = Math.round(longitude * 10.0) / 10.0;
        String key = String.format(Locale.ROOT, "%.1f,%.1f", bucketLat, bucketLon);

        CacheEntry existing = cache.get(key);
        if (existing != null && !existing.isExpired(now)) {
            return Optional.ofNullable(existing.observation());
        }

        WeatherObservation fetched = fetchFromOpenMeteo(bucketLat, bucketLon, now);
        if (cache.size() >= MAX_CACHE_ENTRIES) {
            cache.clear();
        }
        if (fetched != null) {
            cache.put(key, new CacheEntry(fetched, now.plusSeconds(cacheTtlSeconds)));
            return Optional.of(fetched);
        } else {
            // Negative cache prevents 200 sequential retries on a network outage
            cache.put(key, new CacheEntry(null, now.plusSeconds(failureCooldownSeconds)));
            return Optional.empty();
        }
    }

    private WeatherObservation fetchFromOpenMeteo(double lat, double lon, Instant now) {
        try {
            String url = String.format(
                    Locale.ROOT,
                    "%s?latitude=%.2f&longitude=%.2f&current=weather_code,temperature_2m,precipitation&timezone=UTC",
                    baseUrl, lat, lon
            );
            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofMillis(readTimeoutMs))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> resp = httpClient.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (resp.statusCode() != 200 || resp.body() == null || resp.body().isBlank()) {
                return null;
            }
            JsonNode root = read(resp.body());
            JsonNode current = root.path("current");
            if (!current.isObject() || !current.hasNonNull("weather_code")) {
                return null;
            }
            int wmoCode = current.path("weather_code").asInt(-1);
            double tempC = current.path("temperature_2m").asDouble(Double.NaN);
            double precipMm = current.path("precipitation").asDouble(0.0);
            String condition = mapWmoToCondition(wmoCode, tempC, precipMm);
            return new WeatherObservation(
                    condition,
                    now,
                    now.plusSeconds(cacheTtlSeconds),
                    PROVIDER
            );
        } catch (Exception ex) {
            if (ex instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            return null;
        }
    }

    /** Deterministic WMO weather interpretation code mapping. */
    public static String mapWmoToCondition(int wmoCode, double tempC, double precipMm) {
        if (wmoCode == 95 || wmoCode == 96 || wmoCode == 99) return "THUNDERSTORM";
        if (wmoCode == 65 || wmoCode == 82 || precipMm >= 7.5) return "HEAVY_RAIN";
        if (wmoCode == 61 || wmoCode == 63 || wmoCode == 66 || wmoCode == 67 || wmoCode == 80 || wmoCode == 81 || precipMm >= 1.0) {
            return "RAIN";
        }
        if (wmoCode == 51 || wmoCode == 53 || wmoCode == 55 || wmoCode == 56 || wmoCode == 57 || precipMm > 0.0) {
            return "LIGHT_RAIN";
        }
        if (Double.isFinite(tempC) && tempC >= 36.0) return "EXTREME_HEAT";
        if (wmoCode == 0 || wmoCode == 1) return "CLEAR";
        if (wmoCode == 2) return "PARTLY_CLOUDY";
        if (wmoCode == 3 || wmoCode == 45 || wmoCode == 48) return "CLOUDY";
        return "CLOUDY";
    }

    public void clearCache() {
        cache.clear();
    }
}
