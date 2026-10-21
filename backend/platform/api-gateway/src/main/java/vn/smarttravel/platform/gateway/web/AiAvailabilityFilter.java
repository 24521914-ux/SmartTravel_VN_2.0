package vn.smarttravel.platform.gateway.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;
import reactor.core.publisher.Mono;
import vn.smarttravel.platform.gateway.security.GatewayErrors;

/** Stop deferred AI requests before JWT exchange and upstream dispatch. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 30)
public class AiAvailabilityFilter implements WebFilter {
    private static final PathPattern AI_ROUTE = PathPatternParser.defaultInstance.parse("/api/intelligence/**");
    private final boolean enabled;

    public AiAvailabilityFilter(@Value("${smarttravel.gateway.ai-enabled:false}") boolean enabled) {
        this.enabled = enabled;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        if (!enabled && exchange.getRequest().getMethod() != HttpMethod.OPTIONS
                && AI_ROUTE.matches(exchange.getRequest().getPath().pathWithinApplication())) {
            return GatewayErrors.write(exchange, 503, "FEATURE_DEFERRED", "AI features are deferred");
        }
        return chain.filter(exchange);
    }
}
