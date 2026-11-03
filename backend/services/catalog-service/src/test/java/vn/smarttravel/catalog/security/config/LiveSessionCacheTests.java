package vn.smarttravel.catalog.security.config;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import static org.assertj.core.api.Assertions.*;

class LiveSessionCacheTests {
    private static Jwt token(String sid, List<String> roles, long seconds) {
        return Jwt.withTokenValue("signed-token").header("alg","RS256").subject("principal").claim("sid",sid)
                .claim("roles",roles).issuedAt(Instant.now().minusSeconds(120)).expiresAt(Instant.now().plusSeconds(seconds)).build();
    }

    @Test void cachesOnlyActiveSessionsPerRoleSetAndNeverDenials() throws Exception {
        var status=new AtomicInteger(200); var calls=new AtomicInteger();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/session",request -> { calls.incrementAndGet(); request.sendResponseHeaders(status.get(),-1); request.close(); });
        server.start();
        try {
            var validator=new LiveSessionValidator("http://127.0.0.1:"+server.getAddress().getPort()+"/session",Duration.ofSeconds(15));
            assertThat(validator.validate(token("s1",List.of("USER"),60)).hasErrors()).isFalse();
            assertThat(validator.validate(token("s1",List.of("USER"),60)).hasErrors()).isFalse();
            assertThat(calls.get()).isEqualTo(1);
            // A different role set is a different answer from Identity.
            assertThat(validator.validate(token("s1",List.of("USER","ADMIN"),60)).hasErrors()).isFalse();
            assertThat(calls.get()).isEqualTo(2);
            status.set(401);
            assertThat(validator.validate(token("s2",List.of("USER"),60)).hasErrors()).isTrue();
            assertThat(validator.validate(token("s2",List.of("USER"),60)).hasErrors()).isTrue();
            assertThat(calls.get()).isEqualTo(4);
        } finally { server.stop(0); }
    }

    @Test void cacheNeverOutlivesTheTokenAndIsOffByDefault() throws Exception {
        var calls=new AtomicInteger();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/session",request -> { calls.incrementAndGet(); request.sendResponseHeaders(200,-1); request.close(); });
        server.start();
        try {
            String uri="http://127.0.0.1:"+server.getAddress().getPort()+"/session";
            var cached=new LiveSessionValidator(uri,Duration.ofSeconds(15));
            cached.validate(token("s3",List.of("USER"),0)); cached.validate(token("s3",List.of("USER"),0));
            assertThat(calls.get()).isEqualTo(2);
            var uncached=new LiveSessionValidator(uri);
            uncached.validate(token("s4",List.of("USER"),60)); uncached.validate(token("s4",List.of("USER"),60));
            assertThat(calls.get()).isEqualTo(4);
        } finally { server.stop(0); }
    }
}
