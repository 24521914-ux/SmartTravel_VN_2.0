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
public class RoutingAdapter {
    private final TripStore s;
    private final String url;
    private final HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(1)).build();
    public RoutingAdapter(TripStore s,@Value("${trip.routing.url:http://127.0.0.1:8304/route}")String url) {this.s=s;this.url=url;}
    public Map<String,Object> estimate(Map<String,Object>from,Map<String,Object>to,String mode) {
        var input=map("from_latitude",from.get("latitude"),"from_longitude",from.get("longitude"),"to_latitude",to.get("latitude"),"to_longitude",to.get("longitude"),"mode",mode);String key=TripService.hash(s.encode(input));
        var rows=s.queryForList(SELECT_ROUTE_ESTIMATES_1,key);if(!rows.isEmpty())return s.decode(rows.getFirst().get("route_payload"));
        try {var request=HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(2)).header("Content-Type","application/json").POST(HttpRequest.BodyPublishers.ofString(s.encode(input))).build();var response=http.send(request,new vn.smarttravel.trip.shared.http.LimitedBodyHandler(262144));require(response.statusCode()==200&&response.body().length<262144,503,"ROUTING_UNAVAILABLE");var result=s.decode(new String(response.body(),java.nio.charset.StandardCharsets.UTF_8));require(number(result.get("distance_m"))>=0&&number(result.get("duration_seconds"))>=0,503,"ROUTING_INVALID_RESPONSE");result.put("fallback",false);result.put("provider","HTTP");s.update(INSERT_ROUTE_ESTIMATES_2,key,mode,result.get("distance_m"),result.get("duration_seconds"),s.encode(result));return result;
        }catch(Exception e){if(e instanceof InterruptedException)Thread.currentThread().interrupt();double a=Math.toRadians(Double.parseDouble(from.get("latitude").toString())),b=Math.toRadians(Double.parseDouble(to.get("latitude").toString())),lat=b-a,lon=Math.toRadians(Double.parseDouble(to.get("longitude").toString())-Double.parseDouble(from.get("longitude").toString()));double h=Math.pow(Math.sin(lat/2),2)+Math.cos(a)*Math.cos(b)*Math.pow(Math.sin(lon/2),2);return map("distance_m",Math.round(6371000*2*Math.asin(Math.sqrt(Math.min(1,h)))),"duration_seconds",null,"fallback",true,"provider","STRAIGHT_LINE","warning","ROUTING_UNAVAILABLE");}
    }
}
