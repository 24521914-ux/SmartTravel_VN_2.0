package vn.smarttravel.identity.preferences.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class CategoryClientTests {
    @Test void oversizedChunkedResponseFailsClosed() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/api/v1/categories",exchange -> {
            try {
                exchange.sendResponseHeaders(200,0);
                byte[] chunk=new byte[65536]; Arrays.fill(chunk,(byte)' ');
                for(int i=0;i<20;i++) exchange.getResponseBody().write(chunk);
            } catch(java.io.IOException ignored) { /* Client cancels oversized body. */ }
            finally { exchange.close(); }
        }); server.start();
        try {
            var client=new CategoryClient("http://127.0.0.1:"+server.getAddress().getPort(),new ObjectMapper());
            assertThatThrownBy(() -> client.requireActive(List.of(UUID.randomUUID())))
                    .hasMessage("CATEGORY_VALIDATION_UNAVAILABLE");
        } finally { server.stop(0); }
    }
    @Test void bodyDeadlineAppliesAfterSuccessfulHeaders() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        UUID id=UUID.randomUUID();
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            server.setExecutor(executor);
            server.createContext("/api/v1/categories",exchange -> {
                try {
                    exchange.sendResponseHeaders(200,0);
                    exchange.getResponseBody().write('{'); exchange.getResponseBody().flush();
                    Thread.sleep(4000);
                    exchange.getResponseBody().write(("\"items\":[{\"id\":\""+id+"\",\"active\":true}],\"next_cursor\":null}").getBytes(StandardCharsets.UTF_8));
                } catch(java.io.IOException ignored) { /* Deadline cancels streaming subscription. */ }
                catch(InterruptedException interrupted) { Thread.currentThread().interrupt(); }
                finally { exchange.close(); }
            }); server.start();
            try {
                var client=new CategoryClient("http://127.0.0.1:"+server.getAddress().getPort(),new ObjectMapper());
                long start=System.nanoTime();
                assertThatThrownBy(() -> client.requireActive(List.of(id))).hasMessage("CATEGORY_VALIDATION_UNAVAILABLE");
                assertThat(java.time.Duration.ofNanos(System.nanoTime()-start).toMillis()).isLessThan(3500);
            } finally { server.stop(0); }
        }
    }
    @Test void productionRejectsLocalStubAndCredentialBearingOrigin() {
        var prod=new org.springframework.mock.env.MockEnvironment(); prod.setActiveProfiles("prod");
        for(String origin:List.of("http://catalog-stub:8080","https://localhost","https://u:p@catalog.example","https://catalog.example?secret=test"))
            assertThatThrownBy(() -> new CategoryClient(origin,new ObjectMapper(),prod)).isInstanceOf(IllegalStateException.class);
        assertThatCode(() -> new CategoryClient("https://catalog.example",new ObjectMapper(),prod)).doesNotThrowAnyException();
        var local=new org.springframework.mock.env.MockEnvironment(); local.setActiveProfiles("p01-local");
        assertThatCode(() -> new CategoryClient("http://127.0.0.1:8080",new ObjectMapper(),local)).doesNotThrowAnyException();
    }
    @Test void followsPublicPaginationAndRejectsInactiveOrMissingCategories() throws Exception {
        UUID first=UUID.randomUUID(), second=UUID.randomUUID(), inactive=UUID.randomUUID();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/api/v1/categories",exchange -> {
            boolean next=exchange.getRequestURI().getQuery().contains("cursor=");
            String body=next?"{\"items\":[{\"id\":\""+second+"\",\"active\":true}],\"next_cursor\":null}":
                    "{\"items\":[{\"id\":\""+first+"\",\"active\":true},{\"id\":\""+inactive+"\",\"active\":false}],\"next_cursor\":\"page2\"}";
            byte[] bytes=body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200,bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        });
        server.start();
        try {
            var client=new CategoryClient("http://127.0.0.1:"+server.getAddress().getPort(),new ObjectMapper());
            client.requireActive(List.of(first,second));
            assertThatThrownBy(() -> client.requireActive(List.of(inactive))).hasMessage("INVALID_CATEGORY");
            assertThatThrownBy(() -> client.requireActive(List.of(UUID.randomUUID()))).hasMessage("INVALID_CATEGORY");
        } finally { server.stop(0); }
    }
    @Test void failsClosedForUnavailableMalformedAndRepeatedCursorResponses() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var body=new java.util.concurrent.atomic.AtomicReference<>("{\"items\":[],\"next_cursor\":\"same\"}");
        var status=new java.util.concurrent.atomic.AtomicInteger(200);
        server.createContext("/api/v1/categories",exchange -> {
            byte[] bytes=body.get().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status.get(),bytes.length); exchange.getResponseBody().write(bytes); exchange.close();
        }); server.start();
        try {
            var client=new CategoryClient("http://127.0.0.1:"+server.getAddress().getPort(),new ObjectMapper());
            assertThatThrownBy(() -> client.requireActive(List.of(UUID.randomUUID()))).hasMessage("CATEGORY_VALIDATION_UNAVAILABLE");
            body.set("{}");
            assertThatThrownBy(() -> client.requireActive(List.of(UUID.randomUUID()))).hasMessage("CATEGORY_VALIDATION_UNAVAILABLE");
            status.set(503);
            assertThatThrownBy(() -> client.requireActive(List.of(UUID.randomUUID()))).hasMessage("CATEGORY_VALIDATION_UNAVAILABLE");
            new CategoryClient("",new ObjectMapper()).requireActive(List.of());
            assertThatThrownBy(() -> new CategoryClient("",new ObjectMapper()).requireActive(List.of(UUID.randomUUID()))).hasMessage("CATEGORY_VALIDATION_UNAVAILABLE");
        } finally { server.stop(0); }
    }
    @Test void timeoutNeverApprovesUnverifiedSelection() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            server.setExecutor(executor);
            server.createContext("/api/v1/categories",exchange -> {
                try { Thread.sleep(3000); } catch(InterruptedException e) { Thread.currentThread().interrupt(); }
                exchange.close();
            }); server.start();
            try {
                var client=new CategoryClient("http://127.0.0.1:"+server.getAddress().getPort(),new ObjectMapper());
                assertThatThrownBy(() -> client.requireActive(List.of(UUID.randomUUID()))).hasMessage("CATEGORY_VALIDATION_UNAVAILABLE");
            } finally { server.stop(0); }
        }
    }
}
