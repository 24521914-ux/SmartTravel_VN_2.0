package vn.smarttravel.intelligence.security.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.junit.jupiter.api.Assertions.*;

class RuntimeGuardTests {
    private MockEnvironment deployed() {
        return new MockEnvironment().withProperty("security.jwt.jwk-set-uri", "https://identity.example/jwks")
                .withProperty("intelligence.catalog-url", "https://catalog.example")
                .withProperty("intelligence.ingestion-url", "https://ingestion.example")
                .withProperty("intelligence.workload-token", "workload-fixture")
                .withProperty("intelligence.transport.enabled", "true")
                .withProperty("spring.rabbitmq.password", "broker-fixture");
    }
    @Test void productionRejectsDefaultsInsecureEndpointsAndMissingCredentials() {
        assertThrows(IllegalStateException.class, () -> new RuntimeGuard(new MockEnvironment()).afterPropertiesSet());
        for (String origin : new String[]{"http://catalog.example", "https://127.0.0.1", "https://user:password@catalog.example", "https://catalog.example?token=fixture"})
            assertThrows(IllegalStateException.class, () -> new RuntimeGuard(deployed().withProperty("intelligence.catalog-url", origin)).afterPropertiesSet());
        assertThrows(IllegalStateException.class, () -> new RuntimeGuard(deployed().withProperty("intelligence.workload-token", "")).afterPropertiesSet());
        assertThrows(IllegalStateException.class, () -> new RuntimeGuard(deployed().withProperty("intelligence.transport.fixture-capture", "true")).afterPropertiesSet());
        assertDoesNotThrow(() -> new RuntimeGuard(deployed()).afterPropertiesSet());
    }
    @Test void localIsExplicitAndCannotBypassProductionWithMixedProfiles() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("test");
        assertDoesNotThrow(() -> new RuntimeGuard(environment).afterPropertiesSet());
        environment.setActiveProfiles("test", "production");
        assertThrows(IllegalStateException.class, () -> new RuntimeGuard(environment).afterPropertiesSet());
    }
    @Test void maintenanceExceptionRequiresIsolatedNonServingProcess() {
        MockEnvironment environment = new MockEnvironment().withProperty("intelligence.operator.enabled", "true");
        assertThrows(IllegalStateException.class, () -> new RuntimeGuard(environment).afterPropertiesSet());
        environment.withProperty("intelligence.workers-enabled", "false")
                .withProperty("intelligence.transport.enabled", "false")
                .withProperty("spring.flyway.enabled", "false")
                .withProperty("server.address", "127.0.0.1").withProperty("server.port", "0");
        assertDoesNotThrow(() -> new RuntimeGuard(environment).afterPropertiesSet());
        environment.withProperty("server.address", "0.0.0.0");
        assertThrows(IllegalStateException.class, () -> new RuntimeGuard(environment).afterPropertiesSet());
    }
}
