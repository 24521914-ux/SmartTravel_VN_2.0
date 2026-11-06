package vn.smarttravel.platform.gateway.security;

import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

/** Exchange once per request; no cache can keep a revoked session alive. */
@Component
public class PrincipalExchangeFilter implements GlobalFilter, Ordered {
    private static final org.slf4j.Logger log=org.slf4j.LoggerFactory.getLogger(PrincipalExchangeFilter.class);
    private final String uri;
    private final String credential;
    private final WebClient client=WebClient.builder().build();
    public PrincipalExchangeFilter(@Value("${gateway.identity-exchange-uri:}") String uri,
            @Value("${gateway.exchange-secret:}") String credential) {
        this.uri=uri; this.credential=credential;
        if (!uri.isBlank() && credential.length()<32) throw new IllegalStateException("Gateway exchange credential is required");
    }
    public int getOrder() { return -100; }
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        if (uri.isBlank()) return chain.filter(exchange);
        String[] segments=exchange.getRequest().getPath().value().split("/");
        // This filter runs before StripPrefix and sees the public route.
        if (segments.length<3 || !segments[1].equals("api")) return chain.filter(exchange);
        String destination=segments[2];
        return exchange.getPrincipal().ofType(JwtAuthenticationToken.class)
                .flatMap(principal -> client.post().uri(uri)
                        .header(HttpHeaders.AUTHORIZATION,"Bearer "+principal.getToken().getTokenValue())
                        .header("X-Gateway-Credential",credential)
                        .bodyValue(Map.of("audience",destination)).exchangeToMono(response -> {
                            if (!response.statusCode().is2xxSuccessful()) {
                                int status=response.statusCode().value();
                                return response.releaseBody().then(Mono.error(new ExchangeFailure(status==401||status==403?status:503,"HTTP_STATUS",status)));
                            }
                            // Decode bytes locally: DEBUG codec logging must never print access_token.
                            return response.bodyToMono(byte[].class).map(bytes -> {
                                try { return new com.fasterxml.jackson.databind.ObjectMapper().readTree(bytes); }
                                catch (java.io.IOException error) { throw new ExchangeFailure(503,"INVALID_JSON",0); }
                            });
                        }).switchIfEmpty(Mono.error(new ExchangeFailure(503,"EMPTY_RESPONSE",0))).timeout(Duration.ofSeconds(3))
                        .map(body -> {
                            String token=body.path("access_token").asText();
                            if(token.isBlank()||token.length()>1024) throw new ExchangeFailure(503,"INVALID_TOKEN",0);
                            return token;
                        }).onErrorResume(error -> {
                            // Only fixed classifications/status codes: never log tokens, headers, URI or exception text.
                            String reason=error instanceof ExchangeFailure failure?failure.reason:
                                    (error.getCause()==null?error:error.getCause()).getClass().getSimpleName();
                            log.warn("identity_exchange_failed reason={} upstream_status={}",reason,
                                    error instanceof ExchangeFailure failure?failure.upstreamStatus:0);
                            return GatewayErrors.write(exchange,error instanceof ExchangeFailure failure?failure.status:503,
                                error instanceof ExchangeFailure failure && failure.status<500 ? "UNAUTHORIZED":"IDENTITY_UNAVAILABLE",
                                "Identity authorization failed").thenReturn("");
                        })
                        .flatMap(token -> {
                            if(token.isEmpty()) return Mono.just(true);
                            var request=exchange.getRequest().mutate().headers(headers -> {
                                headers.setBearerAuth(token); headers.remove("X-Gateway-Credential");
                            }).build();
                            return chain.filter(exchange.mutate().request(request).build()).thenReturn(true);
                        })).defaultIfEmpty(false)
                .flatMap(handled -> handled ? Mono.empty() : chain.filter(exchange));
    }
    private static final class ExchangeFailure extends RuntimeException {
        final int status;
        final String reason;
        final int upstreamStatus;
        ExchangeFailure(int status,String reason,int upstreamStatus) {
            this.status=status; this.reason=reason; this.upstreamStatus=upstreamStatus;
        }
    }
}
