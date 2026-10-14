package vn.smarttravel.trip.shared.web;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataIntegrityViolationException;
import java.util.*;
@RestControllerAdvice
public class ApiExceptionHandler {
 @ExceptionHandler(ResponseStatusException.class)public ResponseEntity<Object> domain(ResponseStatusException e){return error(e.getStatusCode().value(),Objects.toString(e.getReason(),"REQUEST_FAILED"));}
 @ExceptionHandler({org.springframework.http.converter.HttpMessageNotReadableException.class,org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,IllegalArgumentException.class})public ResponseEntity<Object> invalid(Exception e){return error(400,"INVALID_REQUEST");}
 @ExceptionHandler(DataIntegrityViolationException.class)public ResponseEntity<Object> conflict(Exception e){return error(409,"DATA_CONFLICT");}
 private ResponseEntity<Object>error(int status,String code){String trace=org.slf4j.MDC.get("traceId");return ResponseEntity.status(status).cacheControl(org.springframework.http.CacheControl.noStore()).body(Map.of("code",code,"message",code.replace('_',' '),"traceId",trace==null?UUID.randomUUID().toString():trace,"fieldErrors",List.of()));}
}
