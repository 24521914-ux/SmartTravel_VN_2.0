//Quy định FE nào được phép gọi API nào
package vn.smarttravel.platform.gateway.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.reactive.CorsWebFilter;
import org.springframework.web.cors.reactive.UrlBasedCorsConfigurationSource;

@Configuration
public class CorsConfiguration {
    @Bean
    @org.springframework.core.annotation.Order(org.springframework.core.Ordered.HIGHEST_PRECEDENCE + 10)
    CorsWebFilter corsWebFilter(GatewayRouteProperties properties) {
        var config = new org.springframework.web.cors.CorsConfiguration();
        config.setAllowedOrigins(properties.cors().allowedOrigins());
        config.setAllowedMethods(java.util.List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(java.util.List.of("Authorization", "Content-Type", "If-Match", "Idempotency-Key", "X-Correlation-Id"));
        config.setExposedHeaders(java.util.List.of("ETag", "X-Correlation-Id", "X-Request-Id"));
        config.setAllowCredentials(false);
        config.setMaxAge(3600L);
        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsWebFilter(source);
    }
}
