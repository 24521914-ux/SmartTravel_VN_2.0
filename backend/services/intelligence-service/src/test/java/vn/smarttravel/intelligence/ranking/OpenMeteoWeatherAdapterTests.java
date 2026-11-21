package vn.smarttravel.intelligence.ranking;

import static org.assertj.core.api.Assertions.*;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import vn.smarttravel.intelligence.ranking.service.OpenMeteoWeatherAdapter;

class OpenMeteoWeatherAdapterTests {

    @Test
    void mapsWmoCodesDeterministically() {
        assertThat(OpenMeteoWeatherAdapter.mapWmoToCondition(95, 27.0, 4.0)).isEqualTo("THUNDERSTORM");
        assertThat(OpenMeteoWeatherAdapter.mapWmoToCondition(65, 26.0, 9.0)).isEqualTo("HEAVY_RAIN");
        assertThat(OpenMeteoWeatherAdapter.mapWmoToCondition(61, 26.0, 2.0)).isEqualTo("RAIN");
        assertThat(OpenMeteoWeatherAdapter.mapWmoToCondition(51, 25.0, 0.3)).isEqualTo("LIGHT_RAIN");
        assertThat(OpenMeteoWeatherAdapter.mapWmoToCondition(0, 38.0, 0.0)).isEqualTo("EXTREME_HEAT");
        assertThat(OpenMeteoWeatherAdapter.mapWmoToCondition(0, 28.0, 0.0)).isEqualTo("CLEAR");
        assertThat(OpenMeteoWeatherAdapter.mapWmoToCondition(2, 28.0, 0.0)).isEqualTo("PARTLY_CLOUDY");
        assertThat(OpenMeteoWeatherAdapter.mapWmoToCondition(3, 25.0, 0.0)).isEqualTo("CLOUDY");
    }

    @Test
    void parsesOpenMeteoJsonCachesByCoordinateBucketAndDegradesOnErrors() throws Exception {
        AtomicInteger hits = new AtomicInteger();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/forecast", ex -> {
            hits.incrementAndGet();
            byte[] body = """
                    {"current":{"weather_code":63,"temperature_2m":26.5,"precipitation":3.2}}
                    """.getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(200, body.length);
            ex.getResponseBody().write(body);
            ex.close();
        });
        server.createContext("/v1/fail", ex -> {
            ex.sendResponseHeaders(503, -1);
            ex.close();
        });
        server.start();
        try {
            String okUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/v1/forecast";
            var adapter = new OpenMeteoWeatherAdapter(true, okUrl, 900, 60, 600);
            Instant now = Instant.now();

            var obs1 = adapter.lookup(21.0285, 105.8542, now);
            var obs2 = adapter.lookup(21.0310, 105.8490, now.plusSeconds(5)); // same 0.1-deg bucket (21.0, 105.9/105.8)
            var obs3 = adapter.lookup(21.0290, 105.8510, now.plusSeconds(10)); // exact same bucket as obs1 (21.0, 105.9)

            assertThat(obs1).isPresent();
            assertThat(obs1.get().condition()).isEqualTo("RAIN");
            assertThat(obs1.get().provider()).isEqualTo("open-meteo");
            assertThat(obs3).isPresent();
            assertThat(obs3.get().condition()).isEqualTo("RAIN");
            // obs1 and obs3 hit same bucket -> only 2 HTTP calls total (not 3)
            assertThat(hits.get()).isLessThanOrEqualTo(2);

            String failUrl = "http://127.0.0.1:" + server.getAddress().getPort() + "/v1/fail";
            var failAdapter = new OpenMeteoWeatherAdapter(true, failUrl, 900, 60, 400);
            assertThat(failAdapter.lookup(16.05, 108.20, now)).isEmpty();

            var disabledAdapter = new OpenMeteoWeatherAdapter(false, okUrl, 900, 60, 400);
            assertThat(disabledAdapter.lookup(21.02, 105.85, now)).isEmpty();
        } finally {
            server.stop(0);
        }
    }
}
