package vn.smarttravel.community.shared.web;
import java.util.*;
import org.bson.Document;
public final class Representations {
    private Representations(){}
    private static Map<String,Object> fields(Document row,String id,String... names){var out=new LinkedHashMap<String,Object>();out.put(id,row.getString("_id"));for(String name:names)out.put(name,row.get(name));return out;}
    public static Map<String,Object> review(Document row){var out=fields(row,"review_id","user_id","place_id","rating","content","status","version");if(row.get("author_name") instanceof String name&&!name.isBlank())out.put("author_name",name);out.put("media_keys",row.getOrDefault("media_keys",List.of()));return out;}
    public static Map<String,Object> collection(Document row){return fields(row,"collection_id","owner_id","name","visibility","version");}
    public static Map<String,Object> item(Document row){var out=fields(row,"item_id","place_id","note","rank");out.put("version",row.getOrDefault("version",1L));return out;}
    public static Map<String,Object> contribution(Document row){var out=fields(row,"contribution_id","user_id","target_id","expected_version","status","version");out.put("type","ADD_PLACE".equals(row.getString("type"))?"ADD":"EDIT");out.put("fields",row.get("payload"));out.put("expected_version",row.getOrDefault("expected_version",0L));return out;}
    public static Map<String,Object> rating(Document row){var out=fields(row,"place_id","count","sum","version");out.put("as_of",row.getDate("as_of").toInstant().toString());return out;}
    public static Map<String,Object> favorite(Document row){return Map.of("place_id",row.getString("place_id"),"created_at",row.getDate("created_at").toInstant().toString());}
    public static Map<String,Object> accepted(String id,long version){return Map.of("request_id",id,"status","COMPLETED","version",version);}
    public static Map<String,Object> report(Document row){
        var out=new LinkedHashMap<String,Object>(accepted(row.getString("_id"),((Number)row.get("version")).longValue()));
        out.put("review_id",row.getString("review_id"));out.put("reason",row.getString("reason"));out.put("report_status",row.getString("status"));
        for(String field:List.of("review_content","place_id"))if(row.get(field)!=null)out.put(field,row.get(field));
        return out;
    }
    public static Map<String,Object> page(List<?> items){
        var attributes=org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();int limit=20,offset=0;long epoch=System.currentTimeMillis();String cursor=null,context="domain";
        if(attributes instanceof org.springframework.web.context.request.ServletRequestAttributes servlet){var request=servlet.getRequest();context=request.getRequestURI();cursor=request.getParameter("cursor");if(request.getParameter("limit")!=null)try{limit=Integer.parseInt(request.getParameter("limit"));}catch(NumberFormatException e){throw invalidCursor(400);} }
        if(limit<1||limit>100)throw invalidCursor(400);
        String digest;try{digest=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest((context+new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(items)).getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}
        if(cursor!=null){if(cursor.length()>1024)throw invalidCursor(400);try{var values=new String(Base64.getUrlDecoder().decode(cursor),java.nio.charset.StandardCharsets.UTF_8).split(":");if(values.length!=3)throw invalidCursor(400);offset=Integer.parseInt(values[0]);epoch=Long.parseLong(values[1]);if(!digest.equals(values[2]))throw invalidCursor(409);if(offset<0||offset>=items.size()||System.currentTimeMillis()-epoch>1800000||epoch>System.currentTimeMillis()+5000)throw invalidCursor(400);}catch(IllegalArgumentException e){throw invalidCursor(400);}}
        int end=Math.min(items.size(),offset+limit);var out=new LinkedHashMap<String,Object>();out.put("items",items.subList(offset,end));out.put("next_cursor",end<items.size()?Base64.getUrlEncoder().withoutPadding().encodeToString((end+":"+epoch+":"+digest).getBytes(java.nio.charset.StandardCharsets.UTF_8)):null);out.put("as_of",java.time.Instant.ofEpochMilli(epoch).toString());out.put("watermark",items.stream().filter(Map.class::isInstance).map(Map.class::cast).mapToLong(row->row.get("version") instanceof Number version?version.longValue():1).max().orElse(1));return out;
    }
    private static org.springframework.web.server.ResponseStatusException invalidCursor(int status){return new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.valueOf(status),status==409?"Cursor snapshot changed":"Invalid pagination");}
}
