package vn.smarttravel.catalog.shared.web;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.dao.DataIntegrityViolationException;
@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(ResponseStatusException.class) ResponseEntity<?> status(ResponseStatusException error){return error(error.getStatusCode().value(),error.getReason());}
    @ExceptionHandler({IllegalArgumentException.class,org.springframework.web.bind.MissingRequestHeaderException.class,org.springframework.http.converter.HttpMessageNotReadableException.class}) ResponseEntity<?> invalid(Exception error){return error(400,"Invalid request");}
    @ExceptionHandler(DataIntegrityViolationException.class) ResponseEntity<?> integrity(Exception error){return error(409,"Data constraint conflict");}
    private ResponseEntity<?> error(int status,String message){return ResponseEntity.status(status).body(Map.of("code",switch(status){case 400->"VALIDATION_ERROR";case 401->"UNAUTHORIZED";case 403->"FORBIDDEN";case 404->"NOT_FOUND";case 409->"VERSION_CONFLICT";case 428->"PRECONDITION_REQUIRED";case 503->"DEPENDENCY_UNAVAILABLE";default->"HTTP_"+status;},"message",message==null?"Request failed":message,"traceId",Optional.ofNullable(org.slf4j.MDC.get("traceId")).orElse("unavailable"),"fieldErrors",List.of()));}
}
