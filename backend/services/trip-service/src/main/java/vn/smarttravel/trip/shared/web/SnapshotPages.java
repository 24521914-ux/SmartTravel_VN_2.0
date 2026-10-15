package vn.smarttravel.trip.shared.web;
import java.util.*;
public final class SnapshotPages {
    private SnapshotPages(){}
    public static Map<String,Object> page(List<?> items){
        var attributes=org.springframework.web.context.request.RequestContextHolder.getRequestAttributes();int limit=20,offset=0;long epoch=System.currentTimeMillis();String cursor=null,context="domain";
        if(attributes instanceof org.springframework.web.context.request.ServletRequestAttributes servlet){var request=servlet.getRequest();context=request.getRequestURI();cursor=request.getParameter("cursor");if(request.getParameter("limit")!=null)try{limit=Integer.parseInt(request.getParameter("limit"));}catch(NumberFormatException e){throw invalidCursor(400);} }
        if(limit<1||limit>100)throw invalidCursor(400);
        String digest;try{digest=HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest((context+new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(items)).getBytes(java.nio.charset.StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalStateException(e);}
        if(cursor!=null){if(cursor.length()>1024)throw invalidCursor(400);try{var values=new String(Base64.getUrlDecoder().decode(cursor),java.nio.charset.StandardCharsets.UTF_8).split(":");if(values.length!=3)throw invalidCursor(400);offset=Integer.parseInt(values[0]);epoch=Long.parseLong(values[1]);if(!digest.equals(values[2]))throw invalidCursor(409);if(offset<0||offset>=items.size()||System.currentTimeMillis()-epoch>1800000||epoch>System.currentTimeMillis()+5000)throw invalidCursor(400);}catch(IllegalArgumentException e){throw invalidCursor(400);}}
        int end=Math.min(items.size(),offset+limit);var out=new LinkedHashMap<String,Object>();out.put("items",items.subList(offset,end));out.put("next_cursor",end<items.size()?Base64.getUrlEncoder().withoutPadding().encodeToString((end+":"+epoch+":"+digest).getBytes(java.nio.charset.StandardCharsets.UTF_8)):null);out.put("as_of",java.time.Instant.ofEpochMilli(epoch).toString());out.put("watermark",items.stream().filter(Map.class::isInstance).map(Map.class::cast).mapToLong(row->row.get("aggregate_version") instanceof Number version?version.longValue():1).max().orElse(1));return out;
    }
    private static org.springframework.web.server.ResponseStatusException invalidCursor(int status){return new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.valueOf(status),status==409?"Cursor snapshot changed":"Invalid pagination");}
}
