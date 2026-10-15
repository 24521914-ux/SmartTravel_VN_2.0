package vn.smarttravel.trip.security.config;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;
class RuntimeGuardTests {
 MockEnvironment production(){var env=new MockEnvironment().withProperty("security.jwt.jwk-set-uri","https://issuer.example/jwks").withProperty("trip.catalog.base-url","https://catalog.example").withProperty("trip.catalog.token","fixture-workload-token").withProperty("trip.routing.url","https://routing.example/route").withProperty("trip.connector.allowed-hosts","source.example").withProperty("trip.transport.enabled","true").withProperty("spring.rabbitmq.password","fixture-broker-password");env.setActiveProfiles("prod");return env;}
 @Test void localCannotWeakenMixedProductionProfile(){var env=production();env.setActiveProfiles("prod","local");assertThatThrownBy(()->new RuntimeGuard(env).afterPropertiesSet()).hasMessageContaining("mixed");}
 @Test void productionRejectsMissingTransportCredential(){var env=production().withProperty("spring.rabbitmq.password","");assertThatThrownBy(()->new RuntimeGuard(env).afterPropertiesSet()).hasMessageContaining("Broker workload");}
 @Test void explicitOperatorModeCanDisableAutomaticListeners(){var env=production().withProperty("trip.operator.enabled","true").withProperty("trip.transport.enabled","false").withProperty("spring.rabbitmq.password","");assertThatCode(()->new RuntimeGuard(env).afterPropertiesSet()).doesNotThrowAnyException();}
}
