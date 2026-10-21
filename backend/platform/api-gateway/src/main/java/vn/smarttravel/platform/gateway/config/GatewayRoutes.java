//quy định API nào được chuyển tới service nào
package vn.smarttravel.platform.gateway.config;

import java.util.Map;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;

@Configuration
public class GatewayRoutes {
    @Bean
    RouteLocator smartTravelRoutes(RouteLocatorBuilder builder, GatewayRouteProperties properties) {
        var routes = builder.routes();
        for (Map.Entry<String, GatewayRouteProperties.ServiceRoute> entry : properties.services().entrySet()) {
            String service = entry.getKey();
            var route = entry.getValue();
            routes.route(service, predicate -> predicate
                    .path(route.pathPrefix() + "/**")
                    .filters(filters -> filters
                            .stripPrefix(countSegments(route.pathPrefix()))
                            .removeRequestHeader(HttpHeaders.COOKIE)
                            .removeRequestHeader("X-Forwarded-User")
                            .removeRequestHeader("X-SmartTravel-Gateway")
                            .addRequestHeader("X-SmartTravel-Gateway", "p01")
                            .retry(retry -> retry.setRetries(2).setMethods(HttpMethod.GET, HttpMethod.HEAD, HttpMethod.OPTIONS)
                                    .setStatuses(org.springframework.http.HttpStatus.BAD_GATEWAY, org.springframework.http.HttpStatus.GATEWAY_TIMEOUT,
                                            org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE)))
                    .metadata("response-timeout", properties.responseTimeout().toMillis())
                    .uri(route.uri()));
        }
        return routes.build();
    }

    private static int countSegments(String prefix) {
        return (int) java.util.Arrays.stream(prefix.split("/")).filter(s -> !s.isBlank()).count();
    }
}
