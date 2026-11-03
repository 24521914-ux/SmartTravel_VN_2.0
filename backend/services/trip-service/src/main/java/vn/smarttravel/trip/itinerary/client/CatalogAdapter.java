package vn.smarttravel.trip.itinerary.client;
import vn.smarttravel.trip.itinerary.repository.TripStore;
import vn.smarttravel.trip.itinerary.client.*;
import vn.smarttravel.trip.itinerary.service.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.*;
import static vn.smarttravel.trip.itinerary.repository.SqlStatements.*;
import static vn.smarttravel.trip.shared.web.ApiValues.*;

@Component
public class CatalogAdapter {
    private final String base;
    private final java.util.function.Supplier<String> token;
    private final ObjectMapper json;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    public CatalogAdapter(ObjectMapper json,@Value("${trip.catalog.base-url:http://127.0.0.1:8302}") String base,@Value("${trip.catalog.token:}") String token,vn.smarttravel.trip.shared.http.WorkloadTokens workloads) {this.json=json;this.base=base;this.token=()->workloads.token(token,"catalog","catalog:places:read");}
    @SuppressWarnings("unchecked") public Map<String,Object> place(UUID id) {
        try {
            var req=HttpRequest.newBuilder(URI.create(base+"/internal/v1/places/batch")).timeout(Duration.ofSeconds(3)).header("Content-Type","application/json").header("Authorization","Bearer "+token.get()).POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(Map.of("ids",List.of(id))))).build();
            var res=http.send(req,new vn.smarttravel.trip.shared.http.LimitedBodyHandler(262144)); require(res.statusCode()==200,503,"CATALOG_UNAVAILABLE");
            require(res.body().length<=262144,503,"CATALOG_INVALID_RESPONSE");
            var b=json.readValue(res.body(),Map.class); var rows=(List<Map<String,Object>>)b.get("items");
            require(rows!=null && rows.size()==1,422,"PLACE_UNAVAILABLE"); var p=rows.getFirst();
            require(id.toString().equals(p.get("place_id")) && "PUBLISHED".equals(p.get("status")),422,"PLACE_UNAVAILABLE");
            require(number(p.get("source_version"))>0 && "VND".equals(p.get("currency")),422,"PLACE_CURRENCY_INVALID");
            require(p.get("name") instanceof String && !p.get("name").toString().isBlank(),503,"CATALOG_INVALID_RESPONSE");
            double lat=Double.parseDouble(p.get("latitude").toString()),lon=Double.parseDouble(p.get("longitude").toString());
            require(Double.isFinite(lat)&&Double.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180,503,"CATALOG_INVALID_RESPONSE"); return p;
        }catch(org.springframework.web.server.ResponseStatusException e){throw e;}catch(Exception e){if(e instanceof InterruptedException)Thread.currentThread().interrupt();throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"CATALOG_UNAVAILABLE");}
    }
    @SuppressWarnings("unchecked") public Map<String,Object> destination(UUID id) {
        try {
            String cursor=null;var seen=new HashSet<String>();
            do {
                String path="/api/v1/destinations?limit=100"+(cursor==null?"":"&cursor="+java.net.URLEncoder.encode(cursor,java.nio.charset.StandardCharsets.UTF_8));
                var req=HttpRequest.newBuilder(URI.create(base+path)).timeout(Duration.ofSeconds(3)).header("Authorization","Bearer "+token.get()).GET().build();
                var res=http.send(req,new vn.smarttravel.trip.shared.http.LimitedBodyHandler(262144));require(res.statusCode()==200,503,"CATALOG_UNAVAILABLE");
                var page=json.readValue(res.body(),Map.class);require(page.get("items") instanceof List<?>,503,"CATALOG_INVALID_RESPONSE");
                for(Object item:(List<?>)page.get("items")) {
                    require(item instanceof Map<?,?>,503,"CATALOG_INVALID_RESPONSE");var destination=(Map<String,Object>)item;
                    if(id.toString().equals(destination.get("destination_id"))) {
                        require("ACTIVE".equals(destination.get("status")),422,"DESTINATION_UNAVAILABLE");
                        require(destination.get("name") instanceof String&&!destination.get("name").toString().isBlank()&&number(destination.get("version"))>0,503,"CATALOG_INVALID_RESPONSE");
                        return destination;
                    }
                }
                Object next=page.get("next_cursor");require(next==null||next instanceof String,503,"CATALOG_INVALID_RESPONSE");
                cursor=(String)next;
                require(cursor==null||(!cursor.isBlank()&&cursor.length()<=1024&&seen.add(cursor)),503,"CATALOG_INVALID_RESPONSE");
            } while(cursor!=null);
            throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.UNPROCESSABLE_ENTITY,"DESTINATION_UNAVAILABLE");
        }catch(org.springframework.web.server.ResponseStatusException e){throw e;}catch(Exception e){if(e instanceof InterruptedException)Thread.currentThread().interrupt();throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,"CATALOG_UNAVAILABLE");}
    }
}
