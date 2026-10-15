package vn.smarttravel.catalog.shared.http;

import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class BoundedJsonClientTests {
    @Test void preservesMethodTokenAndBodyAndRejectsProviderErrors() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var status=new java.util.concurrent.atomic.AtomicInteger(200);
        server.createContext("/lookup", exchange -> {
            assertThat(exchange.getRequestMethod()).isEqualTo("POST");
            assertThat(exchange.getRequestHeaders().getFirst("Authorization")).isEqualTo("Bearer fixture");
            assertThat(new String(exchange.getRequestBody().readAllBytes(),StandardCharsets.UTF_8)).contains("\"ids\"");
            byte[] body="{\"items\":[]}".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status.get(),body.length); exchange.getResponseBody().write(body); exchange.close();
        }); server.start();
        try {
            var client=new BoundedJsonClient("http://127.0.0.1:"+server.getAddress().getPort(),"fixture");
            assertThat(client.request("POST","/lookup",Map.of("ids",List.of("id")))).containsKey("items");
            status.set(503);
            assertThatThrownBy(() -> client.request("POST","/lookup",Map.of("ids",List.of("id"))))
                    .isInstanceOf(org.springframework.web.server.ResponseStatusException.class).hasMessageContaining("503");
        } finally { server.stop(0); }
    }
    @Test void oversizedChunkedBodyFailsClosed() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/lookup", exchange -> {
            try {
                exchange.sendResponseHeaders(200,0);
                byte[] bytes=new byte[65536]; Arrays.fill(bytes,(byte)' ');
                for(int i=0;i<20;i++) exchange.getResponseBody().write(bytes);
            } catch(java.io.IOException ignored) { /* Client cancels oversized stream. */ }
            finally { exchange.close(); }
        }); server.start();
        try {
            var client=new BoundedJsonClient("http://127.0.0.1:"+server.getAddress().getPort(),"fixture");
            assertThatThrownBy(() -> client.request("GET","/lookup",null))
                    .isInstanceOf(org.springframework.web.server.ResponseStatusException.class).hasMessageContaining("503");
        } finally { server.stop(0); }
    }
    @Test void deadlineIncludesStreamingBodyAfterHeaders() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            server.setExecutor(executor);
            server.createContext("/lookup", exchange -> {
                try {
                    exchange.sendResponseHeaders(200,0);
                    exchange.getResponseBody().write('{'); exchange.getResponseBody().flush();
                    Thread.sleep(4000); exchange.getResponseBody().write('}');
                } catch(java.io.IOException ignored) { /* Deadline cancels stream. */ }
                catch(InterruptedException error) { Thread.currentThread().interrupt(); }
                finally { exchange.close(); }
            }); server.start();
            try {
                var client=new BoundedJsonClient("http://127.0.0.1:"+server.getAddress().getPort(),"fixture");
                long start=System.nanoTime();
                assertThatThrownBy(() -> client.request("GET","/lookup",null))
                        .isInstanceOf(org.springframework.web.server.ResponseStatusException.class).hasMessageContaining("503");
                assertThat(java.time.Duration.ofNanos(System.nanoTime()-start).toMillis()).isLessThan(3500);
            } finally { server.stop(0); }
        }
    }
}
