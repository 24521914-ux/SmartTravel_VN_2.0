package vn.smarttravel.platform.gateway;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.*;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jwt.*;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.reactive.server.WebTestClient;

/** Real HTTP partner and RS256/JWKS: validates forwarding without booting a domain service. */
@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT)
@org.springframework.test.context.ActiveProfiles("test")
class GatewayRoutingTests {
    static final ObjectMapper JSON=new ObjectMapper();
    static final RSAKey KEY;
    static final HttpServer PARTNER;
    static final java.util.concurrent.ExecutorService EXECUTOR=Executors.newVirtualThreadPerTaskExecutor();
    static final AtomicInteger RETRIES=new AtomicInteger();
    static final AtomicInteger WRITES=new AtomicInteger();
    static {
        try {
            KEY=new RSAKeyGenerator(2048).keyID("gateway-fixture").generate();
            PARTNER=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
            PARTNER.setExecutor(EXECUTOR);
            PARTNER.createContext("/", request -> {
                String path=request.getRequestURI().getPath();
                int status=200; byte[] body;
                if(path.equals("/jwks")) body=new JWKSet(KEY.toPublicJWK()).toString().getBytes(StandardCharsets.UTF_8);
                else {
                    if(path.endsWith("/retry") && RETRIES.incrementAndGet()<3) status=503;
                    if(request.getRequestMethod().equals("POST") && path.equals("/api/v1/places")) { WRITES.incrementAndGet(); status=503; }
                    var headers=request.getRequestHeaders();
                    body=JSON.writeValueAsBytes(Map.of("path",path,"method",request.getRequestMethod(),
                            "authorization",Objects.toString(headers.getFirst("Authorization"),""),
                            "cookie",Objects.toString(headers.getFirst("Cookie"),""),
                            "forwarded_user",Objects.toString(headers.getFirst("X-Forwarded-User"),""),
                            "trace",Objects.toString(headers.getFirst("X-Correlation-Id"),""),
                            "body",new String(request.getRequestBody().readAllBytes(),StandardCharsets.UTF_8)));
                }
                request.getResponseHeaders().set("Content-Type","application/json");
                request.sendResponseHeaders(status,body.length); request.getResponseBody().write(body); request.close();
            });
            PARTNER.start();
        } catch(Exception error) { throw new ExceptionInInitializerError(error); }
    }

    @DynamicPropertySource static void settings(DynamicPropertyRegistry registry) {
        registry.add("smarttravel.gateway.ai-enabled", () -> "true");
        String origin="http://127.0.0.1:"+PARTNER.getAddress().getPort();
        registry.add("security.jwt.issuer",() -> "gateway-test");
        registry.add("security.jwt.jwk-set-uri",() -> origin+"/jwks");
        registry.add("smarttravel.gateway.services.catalog.uri",() -> origin);
        registry.add("smarttravel.gateway.services.trip.uri",() -> origin);
        registry.add("smarttravel.gateway.services.intelligence.uri",() -> origin);
        registry.add("smarttravel.gateway.limits.max-body-bytes",() -> "128");
    }
    @AfterAll static void stopPartner() { PARTNER.stop(0); EXECUTOR.shutdownNow(); }
    @Autowired WebTestClient client;

    String token(String audience,String scope) throws Exception {
        var now=Instant.now();
        var claims=new JWTClaimsSet.Builder().issuer("gateway-test").subject(UUID.randomUUID().toString())
                .audience(audience).jwtID(UUID.randomUUID().toString()).issueTime(Date.from(now))
                .expirationTime(Date.from(now.plusSeconds(120))).claim("scope",scope).build();
        var token=new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.RS256).keyID(KEY.getKeyID()).build(),claims);
        token.sign(new RSASSASigner(KEY)); return token.serialize();
    }
    @Test void publicContractRoutesStripOnlyGatewayPrefixAndRemoveSpoofedIdentity() {
        client.get().uri("/api/catalog/api/v1/places").header("Cookie","session=fixture")
                .header("X-Forwarded-User","spoofed-user").header("X-Correlation-Id","fixture-trace").exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.path").isEqualTo("/api/v1/places")
                .jsonPath("$.cookie").isEqualTo("").jsonPath("$.forwarded_user").isEqualTo("")
                .jsonPath("$.trace").isEqualTo("fixture-trace");
    }
    @Test void approvedMediaReadsCanReachCatalogAnonymouslyButUploadStaysProtected() {
        client.get().uri("/api/catalog/api/v1/media/"+UUID.randomUUID()).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.path").value(path -> org.assertj.core.api.Assertions.assertThat(path.toString()).startsWith("/api/v1/media/"));
        client.post().uri("/api/catalog/api/v1/admin/media").exchange().expectStatus().isUnauthorized();
    }
    @Test void signedJwtAudienceIsBoundToDestinationAndInternalRoutesAreDenied() throws Exception {
        String token=token("trip","trip:read trip:write");
        client.get().uri("/api/trip/api/v1/me/trips").headers(h -> h.setBearerAuth(token)).exchange()
                .expectStatus().isOk().expectBody().jsonPath("$.authorization").isEqualTo("Bearer "+token);
        client.get().uri("/api/catalog/api/v1/me/businesses").headers(h -> h.setBearerAuth(token)).exchange().expectStatus().isForbidden();
        client.post().uri("/api/trip/internal/v1/test").headers(h -> h.setBearerAuth(token)).exchange().expectStatus().isForbidden();
        client.get().uri("/api/trip/api/v1/admin/users").headers(h -> h.setBearerAuth(token)).exchange().expectStatus().isForbidden();
    }
    @Test void retryIsLimitedToReadsAndNeverDuplicatesPost() throws Exception {
        RETRIES.set(0); WRITES.set(0);
        client.get().uri("/api/catalog/api/v1/places/retry").exchange().expectStatus().isOk();
        org.assertj.core.api.Assertions.assertThat(RETRIES.get()).isEqualTo(3);
        client.post().uri("/api/catalog/api/v1/places").headers(h -> {
            try { h.setBearerAuth(token("catalog","catalog:write")); } catch(Exception e) { throw new IllegalStateException(e); }
        }).bodyValue("{}").exchange().expectStatus().isEqualTo(503);
        org.assertj.core.api.Assertions.assertThat(WRITES.get()).isEqualTo(1);
    }
    @Test void chunkedBodiesAreBoundedWithoutContentLength() {
        client.post().uri("/api/intelligence/api/v1/recommendations")
                .body(reactor.core.publisher.Flux.just("x".repeat(80),"y".repeat(80)),String.class)
                .exchange().expectStatus().isEqualTo(413).expectBody().jsonPath("$.code").isEqualTo("REQUEST_TOO_LARGE");
    }
}
