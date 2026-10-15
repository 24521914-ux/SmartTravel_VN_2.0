package vn.smarttravel.intelligence.shared.web;

import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class DomainErrors {
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<?> domain(ResponseStatusException ex){return error(ex.getStatusCode(),Objects.requireNonNullElse(ex.getReason(),"REQUEST_FAILED"));}
    @ExceptionHandler({IllegalArgumentException.class,org.springframework.http.converter.HttpMessageNotReadableException.class})
    ResponseEntity<?> input(Exception ex){return error(HttpStatus.BAD_REQUEST,"INVALID_INPUT");}
    private ResponseEntity<?> error(HttpStatusCode status,String code){return ResponseEntity.status(status).body(Map.of("code",code,"message","Request cannot be completed","traceId",Objects.requireNonNullElse(org.slf4j.MDC.get("traceId"),"unavailable"),"fieldErrors",List.of()));}
}
