package vn.smarttravel.trip;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.web.servlet.error.ErrorController;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ApiErrorController implements ErrorController {
    @RequestMapping("/error")
    public ResponseEntity<Map<String, Object>> error(HttpServletRequest request) {
        Object value = request.getAttribute(RequestDispatcher.ERROR_STATUS_CODE);
        int status = value instanceof Integer code && code >= 400 && code <= 599 ? code : 500;
        Object trace = request.getAttribute("p00.traceId");
        return ResponseEntity.status(status).body(Map.of(
                "code", "HTTP_" + status,
                "message", status == 404 ? "Resource not found" : "Request could not be completed",
                "traceId", trace instanceof String id ? id : UUID.randomUUID().toString().replace("-", ""),
                "fieldErrors", List.of()));
    }
}
