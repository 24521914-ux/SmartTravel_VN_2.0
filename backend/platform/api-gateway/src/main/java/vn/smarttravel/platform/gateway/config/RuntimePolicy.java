package vn.smarttravel.platform.gateway.config;

import java.net.URI;
import java.util.Arrays;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

@Component
public class RuntimePolicy {
    public RuntimePolicy(Environment env, GatewayRouteProperties routes,
                         @Value("${security.jwt.issuer}") String issuer,
                         @Value("${security.jwt.jwk-set-uri}") String jwks) {
        var profiles=Arrays.asList(env.getActiveProfiles());
        boolean local=profiles.stream().anyMatch(Set.of("test","local","p01-local","p02-local")::contains);
        boolean production=profiles.stream().anyMatch(Set.of("prod","production","staging")::contains);
        if(local && production) throw new IllegalStateException("Local/test and production profiles cannot be combined");
        if(!local) {
            requireProductionOrigin(issuer); requireProductionOrigin(jwks);
            routes.services().values().forEach(route -> requireProductionOrigin(route.uri().toString()));
            routes.cors().allowedOrigins().forEach(RuntimePolicy::requireProductionOrigin);
        }
    }
    private static void requireProductionOrigin(String value) {
        URI uri=URI.create(value);
        if(!"https".equals(uri.getScheme()) || uri.getHost()==null || uri.getUserInfo()!=null
                || uri.getQuery()!=null || uri.getFragment()!=null
                || Set.of("localhost","127.0.0.1","::1","[::1]","0.0.0.0").contains(uri.getHost()))
            throw new IllegalStateException("Production Gateway requires injected HTTPS endpoints");
    }
}
