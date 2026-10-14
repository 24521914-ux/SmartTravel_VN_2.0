package vn.smarttravel.platform.gateway.security;

import java.util.Collection;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.convert.converter.Converter;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.config.annotation.method.configuration.EnableReactiveMethodSecurity;
import org.springframework.security.config.annotation.web.reactive.EnableWebFluxSecurity;
import org.springframework.security.config.web.server.ServerHttpSecurity;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusReactiveJwtDecoder;
import org.springframework.security.oauth2.jwt.ReactiveJwtDecoder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.web.server.SecurityWebFilterChain;
import reactor.core.publisher.Mono;

@Configuration
@EnableWebFluxSecurity
@EnableReactiveMethodSecurity
public class SecurityConfiguration {
    @Bean
    SecurityWebFilterChain securityWebFilterChain(ServerHttpSecurity http) {
        return http.csrf(ServerHttpSecurity.CsrfSpec::disable)
                .securityContextRepository(org.springframework.security.web.server.context.NoOpServerSecurityContextRepository.getInstance())
                .requestCache(cache -> cache.requestCache(org.springframework.security.web.server.savedrequest.NoOpServerRequestCache.getInstance()))
                .authorizeExchange(auth -> auth
                        .pathMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .pathMatchers(HttpMethod.OPTIONS, "/**").permitAll()
                        .pathMatchers("/api/identity/.well-known/jwks.json").permitAll()
                        .pathMatchers("/api/*/internal/**", "/api/*/actuator/**").denyAll()
                        .pathMatchers(HttpMethod.POST,"/api/identity/api/v1/auth/register","/api/identity/api/v1/auth/login",
                                "/api/identity/api/v1/auth/refresh","/api/identity/api/v1/auth/logout",
                                "/api/identity/api/v1/auth/verify-email","/api/identity/api/v1/auth/forgot-password",
                                "/api/identity/api/v1/auth/reset-password",
                                "/api/intelligence/api/v1/recommendations","/api/intelligence/api/v1/interactions/batch").permitAll()
                        .pathMatchers(HttpMethod.GET,"/api/identity/api/v1/preference-options",
                                "/api/catalog/api/v1/places","/api/catalog/api/v1/places/*",
                                "/api/catalog/api/v1/geographic-units","/api/catalog/api/v1/destinations",
                                "/api/catalog/api/v1/categories","/api/catalog/api/v1/tags","/api/catalog/api/v1/amenities",
                                "/api/catalog/api/v1/offerings","/api/catalog/api/v1/places/*/offerings",
                                "/api/community/api/v1/places/*/reviews","/api/community/api/v1/collections/*").permitAll()
                        .pathMatchers("/api/**").access((authentication, context) -> authentication
                                .map(principal -> {
                                    String[] segments=context.getExchange().getRequest().getPath().value().split("/");
                                    String service=segments.length>2?segments[2]:"";
                                    boolean allowed=principal.isAuthenticated() && principal instanceof JwtAuthenticationToken token
                                            && token.getToken().getAudience().contains(service);
                                    if(context.getExchange().getRequest().getPath().value().startsWith("/api/"+service+"/api/v1/admin/"))
                                        allowed=allowed && principal.getAuthorities().stream().anyMatch(a -> a.getAuthority().equals("SCOPE_"+service+":admin"));
                                    return new org.springframework.security.authorization.AuthorizationDecision(allowed);
                                }).defaultIfEmpty(new org.springframework.security.authorization.AuthorizationDecision(false)))
                        .anyExchange().denyAll())
                .oauth2ResourceServer(resource -> resource.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter())))
                .exceptionHandling(errors -> errors
                        .authenticationEntryPoint((exchange, error) -> GatewayErrors.write(exchange, 401, "UNAUTHORIZED", "Request is not authorized"))
                        .accessDeniedHandler((exchange, error) -> GatewayErrors.write(exchange, 403, "FORBIDDEN", "Access is denied")))
                .build();
    }

    @Bean
    ReactiveJwtDecoder jwtDecoder(@Value("${security.jwt.jwk-set-uri}") String jwks,
                                  @Value("${security.jwt.issuer}") String issuer,
                                  @Value("${security.jwt.audience}") String audience) {
        var decoder = NimbusReactiveJwtDecoder.withJwkSetUri(jwks).build();
        OAuth2TokenValidator<Jwt> validator = new DelegatingOAuth2TokenValidator<>(
                JwtValidators.createDefaultWithIssuer(issuer), audienceValidator(audience), requiredClaim("sub"), requiredClaim("jti"),
                requiredClaim("exp"), requiredClaim("iat"));
        decoder.setJwtValidator(validator);
        return decoder;
    }

    static Converter<Jwt, Mono<AbstractAuthenticationToken>> jwtAuthenticationConverter() {
        return jwt -> Mono.just(new JwtAuthenticationToken(jwt, authorities(jwt), jwt.getSubject()));
    }

    private static Collection<GrantedAuthority> authorities(Jwt jwt) {
        Object raw=jwt.getClaims().get("scope");
        List<String> scopes=raw instanceof String value ? java.util.Arrays.asList(value.split("\\s+"))
                : raw instanceof Collection<?> values ? values.stream().filter(String.class::isInstance).map(String.class::cast).toList() : List.of();
        var result = new java.util.ArrayList<GrantedAuthority>();
        for (String scope : scopes) if (!scope.isBlank()) result.add(new SimpleGrantedAuthority("SCOPE_" + scope));
        List<String> roles = jwt.getClaimAsStringList("roles");
        if (roles != null) for (String role : roles) result.add(new SimpleGrantedAuthority("ROLE_" + role));
        return result;
    }

    static OAuth2TokenValidator<Jwt> audienceValidator(String audience) {
        return jwt -> jwt.getAudience() != null && java.util.Arrays.stream(audience.split(",")).anyMatch(jwt.getAudience()::contains)
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Invalid audience", null));
    }

    static OAuth2TokenValidator<Jwt> requiredClaim(String claim) {
        return jwt -> jwt.getClaim(claim) != null
                ? OAuth2TokenValidatorResult.success()
                : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Missing " + claim, null));
    }
}
