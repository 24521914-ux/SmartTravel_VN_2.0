package vn.smarttravel.trip;

import java.io.IOException;
import java.util.UUID;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CorrelationFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String correlation = request.getHeader("X-Correlation-ID");
        if (correlation == null || !correlation.matches("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")) {
            correlation = UUID.randomUUID().toString();
        }
        String traceparent = request.getHeader("traceparent");
        String trace = traceparent != null && traceparent.matches("00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]")
                && !traceparent.substring(3, 35).equals("0".repeat(32))
                && !traceparent.substring(36, 52).equals("0".repeat(16))
                ? traceparent.substring(3, 35) : UUID.randomUUID().toString().replace("-", "");
        request.setAttribute("p00.traceId", trace);
        MDC.put("correlationId", correlation);
        MDC.put("traceId", trace);
        response.setHeader("X-Correlation-ID", correlation);
        try { chain.doFilter(request, response); }
        finally { MDC.remove("correlationId"); MDC.remove("traceId"); }
    }
}
