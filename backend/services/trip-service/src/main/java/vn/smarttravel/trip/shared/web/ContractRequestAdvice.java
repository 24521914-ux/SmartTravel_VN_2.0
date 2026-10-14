package vn.smarttravel.trip.shared.web;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.RequestBodyAdviceAdapter;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.context.request.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Type;
import java.util.*;
@RestControllerAdvice
public class ContractRequestAdvice extends RequestBodyAdviceAdapter {
 private final List<Map<String,Object>> contracts;
 @SuppressWarnings("unchecked")public ContractRequestAdvice(ObjectMapper json)throws Exception{try(var stream=getClass().getResourceAsStream("/request-contracts.json")){contracts=json.readValue(stream,List.class);}}
 public boolean supports(MethodParameter p,Type t,Class<? extends HttpMessageConverter<?>>c){return true;}
 public Object afterBodyRead(Object body,HttpInputMessage input,MethodParameter p,Type t,Class<? extends HttpMessageConverter<?>>c){var request=((ServletRequestAttributes)RequestContextHolder.currentRequestAttributes()).getRequest();for(var rule:contracts)if(rule.get("method").equals(request.getMethod())&&request.getRequestURI().matches(rule.get("path").toString().replaceAll("\\{[^}]+}","[^/]+"))){validate(body,(Map<?,?>)rule.get("schema"));break;}return body;}
 public static void validate(Object value,Map<?,?>schema){Object type=schema.get("type");List<?>types=type==null?List.of():type instanceof List<?>l?l:List.of(type);if(value==null){check(types.isEmpty()||types.contains("null"));if(schema.containsKey("const"))check(schema.get("const")==null);return;}check(types.isEmpty()||types.stream().anyMatch(t->switch(t.toString()){case "object"->value instanceof Map<?,?>;case "array"->value instanceof List<?>;case "string"->value instanceof String;case "integer"->value instanceof Number n&&n.doubleValue()==n.longValue();case "number"->value instanceof Number n&&Double.isFinite(n.doubleValue());case "boolean"->value instanceof Boolean;default->false;}));
 if(schema.get("enum") instanceof List<?>l)check(l.contains(value));if(schema.containsKey("const"))check(Objects.equals(schema.get("const"),value));
 if(value instanceof Map<?,?>map){Map<?,?>props=(Map<?,?>)schema.get("properties");if(schema.get("required") instanceof List<?>required)for(Object key:required)check(map.containsKey(key));if(Boolean.FALSE.equals(schema.get("additionalProperties")))check(props.keySet().containsAll(map.keySet()));if(schema.get("minProperties") instanceof Number n)check(map.size()>=n.intValue());for(var entry:map.entrySet())if(props.containsKey(entry.getKey()))validate(entry.getValue(),(Map<?,?>)props.get(entry.getKey()));}
 if(value instanceof List<?>list){if(schema.get("maxItems") instanceof Number n)check(list.size()<=n.intValue());if(schema.get("minItems") instanceof Number n)check(list.size()>=n.intValue());if(Boolean.TRUE.equals(schema.get("uniqueItems")))check(new HashSet<>(list).size()==list.size());for(Object element:list)validate(element,(Map<?,?>)schema.get("items"));}
 if(value instanceof Number n){if(schema.get("minimum") instanceof Number min)check(n.doubleValue()>=min.doubleValue());if(schema.get("maximum") instanceof Number max)check(n.doubleValue()<=max.doubleValue());}
 if(value instanceof String text){if(schema.get("minLength") instanceof Number n)check(text.length()>=n.intValue());if(schema.get("maxLength") instanceof Number n)check(text.length()<=n.intValue());if(schema.get("pattern")!=null)check(text.matches(schema.get("pattern").toString()));try{String format=Objects.toString(schema.get("format"),"");switch(format){case "uuid"->check(UUID.fromString(text).toString().equals(text.toLowerCase(Locale.ROOT)));case "date"->java.time.LocalDate.parse(text);case "date-time"->java.time.OffsetDateTime.parse(text);case "uri"->check(java.net.URI.create(text).isAbsolute());default->{}}}catch(Exception e){check(false);}}
 }
 private static void check(boolean valid){if(!valid)throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST,"CONTRACT_VALIDATION_FAILED");}
}
