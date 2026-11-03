package vn.smarttravel.community.reviews.client;

import java.util.Map;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Component
public class CatalogClient {
    private final vn.smarttravel.community.shared.http.BoundedJsonClient client;
    public CatalogClient(@Value("${catalog.base-url:http://127.0.0.1:8102}") String base,@Value("${catalog.service-token:}") String token,vn.smarttravel.community.shared.http.WorkloadTokens workloads){
        client=new vn.smarttravel.community.shared.http.BoundedJsonClient(base,()->workloads.token(token,"catalog","catalog:places:read"));
    }
    public void validate(String id){
        try{
            var result=client.request("POST","/internal/v1/places/validate",Map.of("ids",java.util.List.of(id)));
            boolean valid=result!=null&&result.get("items") instanceof java.util.List<?> items&&items.size()==1&&items.getFirst() instanceof Map<?,?> place&&id.equals(Objects.toString(place.get("place_id")))&&Boolean.TRUE.equals(place.get("public"));
            if(!valid)throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Place unavailable");
        }
        catch(org.springframework.web.client.RestClientException error){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Catalog validation unavailable");}
    }
    public java.util.Map<String,Map<?,?>> batch(java.util.List<String> ids){
        if(ids.isEmpty())return java.util.Map.of();
        try{
            var result=client.request("POST","/internal/v1/places/batch",Map.of("ids",ids));
            if(result==null||!(result.get("items") instanceof java.util.List<?> items))throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Catalog batch unavailable");
            var snapshots=new java.util.HashMap<String,Map<?,?>>();
            for(Object item:items)if(item instanceof Map<?,?> place){String id=Objects.toString(place.get("place_id"),"");if(ids.contains(id)&&"PUBLISHED".equals(place.get("status")))snapshots.put(id,place);}
            if(!snapshots.keySet().containsAll(ids))throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"Collection place unavailable");
            return snapshots;
        }catch(org.springframework.web.client.RestClientException error){throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Catalog enrichment unavailable");}
    }
}
