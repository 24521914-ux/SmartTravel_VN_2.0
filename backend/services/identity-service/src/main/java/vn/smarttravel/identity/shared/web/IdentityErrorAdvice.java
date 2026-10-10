package vn.smarttravel.identity.shared.web;

import java.util.List;
import java.util.Map;
import org.slf4j.MDC;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import vn.smarttravel.identity.shared.exception.IdentityException;

@RestControllerAdvice
public class IdentityErrorAdvice {
    @ExceptionHandler(IdentityException.class)
    ResponseEntity<?> domain(IdentityException e) { return error(e.status(), e.code()); }

    @ExceptionHandler({org.springframework.web.bind.MethodArgumentNotValidException.class,
            org.springframework.http.converter.HttpMessageNotReadableException.class,
            org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    ResponseEntity<?> invalid(Exception e) { return error(400, "INVALID_INPUT"); }

    private ResponseEntity<?> error(int status, String code) {
        var response = ResponseEntity.status(status);
        if (status == 401) response.header("WWW-Authenticate", "Bearer");
        if (status == 429) response.header("Retry-After", "60");
        return response.body(Map.of("code", code, "message", "Request could not be completed",
                "traceId", MDC.get("traceId") == null ? "unavailable" : MDC.get("traceId"), "fieldErrors", List.of()));
    }
}
