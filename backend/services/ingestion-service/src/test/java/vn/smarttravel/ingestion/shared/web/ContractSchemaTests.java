package vn.smarttravel.ingestion.shared.web;
import org.junit.jupiter.api.Test;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;
class ContractSchemaTests {
 @Test void constWithoutTypeValidatesFrozenEnvelopeValues(){assertThatCode(()->ContractRequestAdvice.validate("identity",Map.of("const","identity"))).doesNotThrowAnyException();assertThatThrownBy(()->ContractRequestAdvice.validate("attacker",Map.of("const","identity"))).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);assertThatCode(()->ContractRequestAdvice.validate(1,Map.of("const",1))).doesNotThrowAnyException();}
}
