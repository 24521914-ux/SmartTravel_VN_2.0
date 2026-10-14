package vn.smarttravel.trip.shared.web;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.*;
import java.util.*;
public class ApiValues {
    public static Map<String,Object> map(Object... pairs) { var m=new LinkedHashMap<String,Object>(); for(int i=0;i<pairs.length;i+=2)m.put(pairs[i].toString(),pairs[i+1]); return m; }
    public static void require(boolean ok,int status,String code) { if(!ok)throw new ResponseStatusException(HttpStatus.valueOf(status),code); }
    public static UUID id(Object value) { try{return UUID.fromString(value.toString());}catch(Exception e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"INVALID_UUID");} }
    public static String text(Map<String,Object> b,String key,int max) { Object v=b.get(key); require(v instanceof String && !v.toString().isBlank() && v.toString().length()<=max,400,"INVALID_"+key); return v.toString().strip(); }
    public static long number(Object value) { try{return Long.parseLong(value.toString());}catch(Exception e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"INVALID_NUMBER");} }
    public static LocalDate date(Object value) { try{return LocalDate.parse(value.toString());}catch(Exception e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"INVALID_DATE");} }
    public static long version(String value) { require(value!=null,428,"IF_MATCH_REQUIRED"); require(value.matches("\"[1-9][0-9]*\""),400,"INVALID_IF_MATCH"); return number(value.substring(1,value.length()-1)); }
}
