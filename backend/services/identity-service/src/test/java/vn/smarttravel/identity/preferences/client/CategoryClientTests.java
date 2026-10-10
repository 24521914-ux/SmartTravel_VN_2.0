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
