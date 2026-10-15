package vn.smarttravel.trip.security.config;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import static org.assertj.core.api.Assertions.*;

class LiveSessionValidatorTests {
    @Test void sessionIsCheckedEveryTimeAndRevocationOrOutageFailsClosed() throws Exception {
        var status=new AtomicInteger(200); var calls=new AtomicInteger();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/session",request -> {
            assertThat(request.getRequestHeaders().getFirst("Authorization")).isEqualTo("Bearer signed-token");
            calls.incrementAndGet(); request.sendResponseHeaders(status.get(),-1); request.close();
        }); server.start();
        try {
            var validator=new LiveSessionValidator("http://127.0.0.1:"+server.getAddress().getPort()+"/session");
            var human=token().claim("sid","session").build();
            assertThat(validator.validate(human).hasErrors()).isFalse();
            status.set(401); assertThat(validator.validate(human).hasErrors()).isTrue();
            status.set(503); assertThat(validator.validate(human).hasErrors()).isTrue();
            assertThat(calls.get()).isEqualTo(3);
            var workload=token().claim("client_id","trip-to-catalog").build();
            assertThat(validator.validate(workload).hasErrors()).isFalse(); assertThat(calls.get()).isEqualTo(3);
            assertThat(validator.validate(token().build()).hasErrors()).isTrue();
        } finally { server.stop(0); }
    }
    private static Jwt.Builder token() { return Jwt.withTokenValue("signed-token").header("alg","RS256")
            .subject("principal").issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)); }
}
