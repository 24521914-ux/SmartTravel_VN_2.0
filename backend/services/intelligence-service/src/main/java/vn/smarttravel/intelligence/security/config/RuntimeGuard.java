package vn.smarttravel.intelligence.security.config;

import java.net.URI;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/** Fail closed when standalone fixture configuration reaches a deployed environment. */
@Component
public class RuntimeGuard implements InitializingBean {
    private final Environment environment;

    public RuntimeGuard(Environment environment) { this.environment = environment; }

    @Override
    public void afterPropertiesSet() {
        Set<String> profiles = Set.of(environment.getActiveProfiles());
        boolean local = profiles.stream().anyMatch(Set.of("local", "test", "p01local", "p02-local")::contains);
        boolean deployed = profiles.stream().anyMatch(Set.of("prod", "production", "staging")::contains);
        if (local && deployed) throw new IllegalStateException("Local profiles cannot be mixed with production");
        if (local) return;
        if (environment.getProperty("intelligence.operator.enabled", Boolean.class, false)) {
            if (environment.getProperty("intelligence.workers-enabled", Boolean.class, true)
                    || environment.getProperty("intelligence.transport.enabled", Boolean.class, false)
                    || environment.getProperty("spring.flyway.enabled", Boolean.class, true)
                    || !"127.0.0.1".equals(environment.getProperty("server.address"))
                    || !"0".equals(environment.getProperty("server.port")))
                throw new IllegalStateException("Maintenance requires isolated loopback, no workers/listeners/migrations");
            return;
        }
        for (String key : List.of("security.jwt.jwk-set-uri", "intelligence.catalog-url", "intelligence.ingestion-url")) {
            URI endpoint = URI.create(environment.getProperty(key, ""));
            String host = endpoint.getHost();
            if (!"https".equals(endpoint.getScheme()) || host == null
                    || Set.of("localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]").contains(host)
                    || endpoint.getUserInfo() != null || endpoint.getQuery() != null || endpoint.getFragment() != null) {
                throw new IllegalStateException("Explicit HTTPS dependency endpoint required: " + key);
            }
        }
        if (environment.getProperty("intelligence.workload-token", "").isBlank())
            throw new IllegalStateException("Dependency workload credential required");
        if (!environment.getProperty("intelligence.transport.enabled", Boolean.class, false)
                || environment.getProperty("spring.rabbitmq.password", "").isBlank())
            throw new IllegalStateException("Authenticated transport required");
        if (environment.getProperty("intelligence.transport.fixture-capture", Boolean.class, false))
            throw new IllegalStateException("Fixture capture cannot run in production");
    }
}
