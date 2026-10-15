package vn.smarttravel.platform.gateway.config;

import java.net.URI;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.NotNull;

@Validated
@ConfigurationProperties("smarttravel.gateway")
public record GatewayRouteProperties(
        Map<String, ServiceRoute> services,
        Cors cors,
        RequestLimits limits,
        Duration responseTimeout) {
    public GatewayRouteProperties {
        services = services == null ? new LinkedHashMap<>() : Map.copyOf(services);
        cors = cors == null ? new Cors(java.util.List.of("http://localhost:5173")) : cors;
        limits = limits == null ? new RequestLimits(1_048_576L) : limits;
        responseTimeout = responseTimeout == null ? Duration.ofSeconds(2) : responseTimeout;
        if(responseTimeout.isZero() || responseTimeout.isNegative() || responseTimeout.compareTo(Duration.ofSeconds(30))>0
                || limits.maxBodyBytes()<1 || limits.maxBodyBytes()>16_777_216)
            throw new IllegalArgumentException("Invalid bounded gateway request or timeout limit");
    }

    public record ServiceRoute(@NotNull URI uri, String pathPrefix, String audience, java.util.List<String> requiredScopes) {
        public ServiceRoute {
            pathPrefix = pathPrefix == null ? "/api/" + audience : pathPrefix;
            requiredScopes = requiredScopes == null ? java.util.List.of() : java.util.List.copyOf(requiredScopes);
            if(uri==null || uri.getHost()==null || uri.getUserInfo()!=null || uri.getQuery()!=null || uri.getFragment()!=null
                    || !("http".equals(uri.getScheme()) || "https".equals(uri.getScheme())))
                throw new IllegalArgumentException("Gateway service must be a plain HTTP(S) origin");
            if(!pathPrefix.matches("/api/(identity|catalog|community|trip|ingestion|intelligence)"))
                throw new IllegalArgumentException("Invalid gateway service prefix");
        }
    }
    public record Cors(java.util.List<String> allowedOrigins) {
        public Cors {
            allowedOrigins = allowedOrigins == null ? java.util.List.of() : java.util.List.copyOf(allowedOrigins);
            if(allowedOrigins.stream().anyMatch(origin -> origin.contains("*") || !origin.matches("https?://[^/]+")))
                throw new IllegalArgumentException("CORS requires explicit HTTP(S) origins");
        }
    }
    public record RequestLimits(long maxBodyBytes) {}
}
