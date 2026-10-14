package vn.smarttravel.catalog.security.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfiguration {
    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        return http.csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/places", "/api/v1/places/**", "/api/v1/categories", "/api/v1/tags", "/api/v1/amenities", "/api/v1/destinations", "/api/v1/geographic-units", "/api/v1/offerings").permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, error) -> writeError(response, 401, "UNAUTHORIZED"))
                        .accessDeniedHandler((request, response, error) -> writeError(response, 403, "FORBIDDEN")))
                .oauth2ResourceServer(resource -> resource.jwt(Customizer.withDefaults())
                        .authenticationEntryPoint((request, response, error) -> writeError(response, 401, "UNAUTHORIZED"))
                        .accessDeniedHandler((request, response, error) -> writeError(response, 403, "FORBIDDEN")))
                .build();
    }

    // Kept for standalone decoder contract tests.
    JwtDecoder jwtDecoder(String jwks, String issuer, String audience) {
        return jwtDecoder(jwks, issuer, audience, "");
    }

    @Bean
    JwtDecoder jwtDecoder(@Value("${security.jwt.jwk-set-uri}") String jwks,
                          @Value("${security.jwt.issuer}") String issuer,
                          @Value("${security.jwt.audience}") String audience,
                          @Value("${security.identity-session-uri:}") String sessionUri) {
        var decoder = NimbusJwtDecoder.withJwkSetUri(jwks).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(issuer), audienceValidator(audience),
                new LiveSessionValidator(sessionUri),
                new org.springframework.security.oauth2.jwt.JwtClaimValidator<java.time.Instant>("exp", java.util.Objects::nonNull),
                new org.springframework.security.oauth2.jwt.JwtClaimValidator<java.time.Instant>("iat", java.util.Objects::nonNull),
                new org.springframework.security.oauth2.jwt.JwtClaimValidator<String>("sub", value -> value != null && !value.isBlank())));
        return decoder;
    }

    private static void writeError(jakarta.servlet.http.HttpServletResponse response, int status, String code)
            throws java.io.IOException {
        response.setStatus(status);
        if (status == 401) response.setHeader("WWW-Authenticate", "Bearer");
        response.setContentType("application/json");
        String trace = org.slf4j.MDC.get("traceId");
        new com.fasterxml.jackson.databind.ObjectMapper().writeValue(response.getOutputStream(), java.util.Map.of(
                "code", code, "message", "Request is not authorized", "traceId", trace == null ? "unavailable" : trace,
                "fieldErrors", java.util.List.of()));
    }

    static OAuth2TokenValidator<Jwt> audienceValidator(String audience) {
        return jwt -> jwt.getAudience() != null && jwt.getAudience().contains(audience)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid audience", null));
    }
}
