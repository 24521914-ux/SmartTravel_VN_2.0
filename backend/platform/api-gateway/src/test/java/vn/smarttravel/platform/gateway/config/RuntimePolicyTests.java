package vn.smarttravel.platform.gateway.config;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;

class RuntimePolicyTests {
    @Test void testStubCannotBeEnabledInProductionOrMixedProfiles() {
        var routes=new GatewayRouteProperties(Map.of(),null,null,null);
        var prod=new MockEnvironment(); prod.setActiveProfiles("prod");
        assertThatThrownBy(() -> new RuntimePolicy(prod,routes,"local-test","http://127.0.0.1/jwks"))
                .isInstanceOf(IllegalStateException.class);
        prod.setActiveProfiles("test","prod");
        assertThatThrownBy(() -> new RuntimePolicy(prod,routes,"https://identity.example","https://identity.example/jwks"))
                .isInstanceOf(IllegalStateException.class);
        var test=new MockEnvironment(); test.setActiveProfiles("test");
        assertThatCode(() -> new RuntimePolicy(test,routes,"local-test","http://127.0.0.1/jwks"))
                .doesNotThrowAnyException();
    }
    @Test void unsafeCorsAndUnboundedTimeoutConfigurationIsRejected() {
        assertThatThrownBy(() -> new GatewayRouteProperties.Cors(java.util.List.of("*"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new GatewayRouteProperties(Map.of(),null,null,java.time.Duration.ofHours(1)))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
