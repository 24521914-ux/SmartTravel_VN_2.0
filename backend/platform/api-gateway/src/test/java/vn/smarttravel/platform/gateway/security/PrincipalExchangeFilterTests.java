package vn.smarttravel.platform.gateway.security;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import reactor.core.publisher.Mono;
import static org.assertj.core.api.Assertions.*;

class PrincipalExchangeFilterTests {
    @Test void replacesTokenForDestinationAndDropsPrivateCredential() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var calls=new AtomicInteger();
        server.createContext("/exchange",request -> {
            assertThat(request.getRequestHeaders().getFirst("Authorization")).isEqualTo("Bearer original");
            assertThat(request.getRequestHeaders().getFirst("X-Gateway-Credential")).isEqualTo("gateway-private-credential-32-bytes");
            assertThat(new String(request.getRequestBody().readAllBytes())).contains("\"audience\":\"trip\"");
            byte[] body="{\"access_token\":\"destination-token\"}".getBytes();
            request.getResponseHeaders().set("Content-Type","application/json");
            request.sendResponseHeaders(200,body.length); request.getResponseBody().write(body); request.close(); calls.incrementAndGet();
        }); server.start();
        try {
            var filter=new PrincipalExchangeFilter("http://127.0.0.1:"+server.getAddress().getPort()+"/exchange","gateway-private-credential-32-bytes");
            var exchange=authenticated();
            var forwarded=new AtomicInteger();
            filter.filter(exchange, downstream -> {
                assertThat(downstream.getRequest().getHeaders().getFirst("Authorization")).isEqualTo("Bearer destination-token");
                assertThat(downstream.getRequest().getHeaders().getFirst("X-Gateway-Credential")).isNull();
                forwarded.incrementAndGet(); return Mono.empty();
            }).block();
            assertThat(calls.get()).isEqualTo(1); assertThat(forwarded.get()).isEqualTo(1);
        } finally { server.stop(0); }
    }
    @Test void revocationAndIdentityOutageNeverForward() throws Exception {
        for(int status:new int[]{200,204,401,503}) {
            var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
            server.createContext("/exchange",request -> { request.sendResponseHeaders(status,-1); request.close(); }); server.start();
            try {
                var filter=new PrincipalExchangeFilter("http://127.0.0.1:"+server.getAddress().getPort()+"/exchange","gateway-private-credential-32-bytes");
                var exchange=authenticated(); var forwarded=new AtomicInteger();
                filter.filter(exchange,next -> { forwarded.incrementAndGet(); return Mono.empty(); }).block();
                assertThat(forwarded.get()).isZero(); assertThat(exchange.getResponse().getStatusCode()).isEqualTo(HttpStatus.valueOf(status<300?503:status));
            } finally { server.stop(0); }
        }
    }
    private static org.springframework.web.server.ServerWebExchange authenticated() {
        var jwt=Jwt.withTokenValue("original").header("alg","RS256").subject("user")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        return MockServerWebExchange.from(MockServerHttpRequest.get("/api/trip/api/v1/trips")
                .header("Authorization","Bearer original").header("X-Gateway-Credential","user-forged-value"))
                .mutate().principal(Mono.just(new JwtAuthenticationToken(jwt))).build();
    }
}
