package vn.smarttravel.intelligence.shared.util;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public final class IntelligenceSupport {
    public static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules().configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS,true);
    private IntelligenceSupport() {}
    public static String json(Object value) {
        try { return JSON.writeValueAsString(value); } catch(Exception e) { throw new IllegalArgumentException("Invalid JSON",e); }
    }
    public static JsonNode read(Object value) {
        try { return JSON.readTree(value.toString()); } catch(Exception e) { throw new IllegalArgumentException("Invalid JSON",e); }
    }
    public static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch(Exception e) { throw new IllegalStateException(e); }
    }
    public static UUID uuid(JsonNode n,String field) {
        try { return UUID.fromString(n.path(field).asText()); } catch(Exception e) { throw bad("INVALID_"+field.toUpperCase()); }
    }
    public static Instant time(JsonNode n,String field) {
        try { return Instant.parse(n.path(field).asText()); } catch(Exception e) { throw bad("INVALID_"+field.toUpperCase()); }
    }
    public static ResponseStatusException bad(String code) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,code); }
    public static ResponseStatusException conflict(String code) { return new ResponseStatusException(HttpStatus.CONFLICT,code); }
    public static void require(boolean condition,String code) { if(!condition) throw bad(code); }
    public static ObjectNode allow(JsonNode node,Set<String> keys) {
        ObjectNode result=JSON.createObjectNode();
        node.fields().forEachRemaining(e->{if(keys.contains(e.getKey())) result.set(e.getKey(),e.getValue());});
        return result;
    }
    public static void fields(JsonNode node,Set<String> keys) {
        require(node.isObject(),"OBJECT_REQUIRED");
        node.fieldNames().forEachRemaining(k->{if(!keys.contains(k)) throw bad("UNKNOWN_FIELD_"+k);});
    }
}
