package vn.smarttravel.ingestion.security.config;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import static org.assertj.core.api.Assertions.*;
class RuntimeGuardTests {
 MockEnvironment production(){var env=new MockEnvironment().withProperty("security.jwt.jwk-set-uri","https://issuer.example/jwks").withProperty("ingestion.catalog.base-url","https://catalog.example").withProperty("ingestion.catalog.token","fixture-workload-token").withProperty("ingestion.routing.url","https://routing.example/route").withProperty("ingestion.connector.allowed-hosts","source.example").withProperty("ingestion.transport.enabled","true").withProperty("spring.rabbitmq.password","fixture-broker-password");env.setActiveProfiles("prod");return env;}
 @Test void localCannotWeakenMixedProductionProfile(){var env=production();env.setActiveProfiles("prod","local");assertThatThrownBy(()->new RuntimeGuard(env).afterPropertiesSet()).hasMessageContaining("mixed");}
 @Test void productionRejectsMissingTransportCredential(){var env=production().withProperty("spring.rabbitmq.password","");assertThatThrownBy(()->new RuntimeGuard(env).afterPropertiesSet()).hasMessageContaining("Broker workload");}
 @Test void explicitOperatorModeCanDisableAutomaticListeners(){var env=production().withProperty("ingestion.operator.enabled","true").withProperty("ingestion.transport.enabled","false").withProperty("spring.rabbitmq.password","");assertThatCode(()->new RuntimeGuard(env).afterPropertiesSet()).doesNotThrowAnyException();}
}
