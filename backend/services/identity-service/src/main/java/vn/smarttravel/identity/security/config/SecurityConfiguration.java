package vn.smarttravel.identity.security.config;

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
                        .requestMatchers("/actuator/health", "/actuator/health/**", "/.well-known/jwks.json").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/preference-options").permitAll()
                        .requestMatchers("/api/v1/auth/register", "/api/v1/auth/login", "/api/v1/auth/refresh",
                                "/api/v1/auth/verify-email", "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password").permitAll()
                        .requestMatchers("/api/v1/admin/**").hasAuthority("SCOPE_identity:admin")
                        .requestMatchers("/internal/v1/users/status/batch").hasAuthority("SCOPE_identity:status:read")
                        .requestMatchers("/internal/v1/users/preferences/batch").hasAuthority("SCOPE_identity:preferences:read")
                        .requestMatchers("/internal/v1/users/preferences/snapshot").hasAuthority("SCOPE_identity:preferences:read")
                        .requestMatchers("/internal/v1/deletion-requests/**").hasAuthority("SCOPE_identity:deletion:read")
                        .requestMatchers("/internal/**").denyAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/me", "/api/v1/me/**", "/api/v1/preference-options")
                                .hasAuthority("SCOPE_identity:read")
                        .requestMatchers("/api/v1/me", "/api/v1/me/**", "/api/v1/auth/logout").hasAuthority("SCOPE_identity:write")
                        .anyRequest().authenticated())
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((request, response, error) -> writeError(response, 401, "UNAUTHORIZED"))
                        .accessDeniedHandler((request, response, error) -> writeError(response, 403, "FORBIDDEN")))
                .oauth2ResourceServer(resource -> resource.jwt(Customizer.withDefaults())
                        .authenticationEntryPoint((request, response, error) -> writeError(response, 401, "UNAUTHORIZED"))
                        .accessDeniedHandler((request, response, error) -> writeError(response, 403, "FORBIDDEN")))
                .build();
    }

    @Bean
    public JwtDecoder jwtDecoder(@Value("${security.jwt.jwk-set-uri}") String jwks,
                          @Value("${security.jwt.issuer}") String issuer,
                          @Value("${security.jwt.audience}") String audience) {
        var decoder = NimbusJwtDecoder.withJwkSetUri(jwks).build();
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(issuer), audienceValidator(audience),
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

    public static OAuth2TokenValidator<Jwt> audienceValidator(String audience) {
        return jwt -> jwt.getAudience() != null && jwt.getAudience().contains(audience)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid audience", null));
    }
}
