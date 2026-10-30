package vn.smarttravel.trip.itinerary.client;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class CatalogAdapterTests {
    @Test void destinationUsesContractCollectionAndOpaqueCursorInsteadOfNonexistentDetailRoute() throws Exception {
        var json=new ObjectMapper();var target=UUID.randomUUID();var queries=new ArrayList<String>();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/api/v1/destinations",exchange->{
            queries.add(exchange.getRequestURI().toString());
            boolean second=exchange.getRequestURI().getRawQuery().contains("cursor=");
            var body=new LinkedHashMap<String,Object>();
            body.put("items",List.of(Map.of("destination_id",second?target.toString():UUID.randomUUID().toString(),"status","ACTIVE","name","Synthetic destination","version",1)));
            body.put("next_cursor",second?null:"opaque+/= cursor");
            byte[] bytes=json.writeValueAsBytes(body);exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
        });server.start();
        try {
            var adapter=new CatalogAdapter(json,"http://127.0.0.1:"+server.getAddress().getPort(),"fixture");
            assertThat(adapter.destination(target).get("destination_id")).isEqualTo(target.toString());
            assertThat(queries).hasSize(2);assertThat(queries.getFirst()).isEqualTo("/api/v1/destinations?limit=100");
            assertThat(queries.getLast()).contains("cursor=opaque%2B%2F%3D+cursor");
        } finally { server.stop(0); }
    }
    @Test void missingDestinationAndRepeatedCursorFailClosed() throws Exception {
        var json=new ObjectMapper();var cycle=new java.util.concurrent.atomic.AtomicBoolean();
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        server.createContext("/api/v1/destinations",exchange->{
            var body=new LinkedHashMap<String,Object>();body.put("items",List.of());body.put("next_cursor",cycle.get()?"repeat":null);
            byte[] bytes=json.writeValueAsBytes(body);exchange.sendResponseHeaders(200,bytes.length);exchange.getResponseBody().write(bytes);exchange.close();
        });server.start();
        try {
            var adapter=new CatalogAdapter(json,"http://127.0.0.1:"+server.getAddress().getPort(),"fixture");
            assertThatThrownBy(()->adapter.destination(UUID.randomUUID())).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(422));
            cycle.set(true);
            assertThatThrownBy(()->adapter.destination(UUID.randomUUID())).isInstanceOfSatisfying(ResponseStatusException.class,e->assertThat(e.getStatusCode().value()).isEqualTo(503));
        } finally { server.stop(0); }
    }
}
