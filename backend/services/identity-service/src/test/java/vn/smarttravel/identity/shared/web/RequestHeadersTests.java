package vn.smarttravel.identity.shared.web;

import java.util.List;
import org.junit.jupiter.api.Test;
import vn.smarttravel.identity.shared.exception.IdentityException;
import static org.assertj.core.api.Assertions.*;

class RequestHeadersTests {
    @Test void strongEtagAndIdempotencyValidation() {
        assertThat(RequestHeaders.version("\"12\"")).isEqualTo(12);
        assertThatThrownBy(() -> RequestHeaders.version(null)).isInstanceOf(IdentityException.class);
        for (String invalid : List.of("W/\"1\"", "1", "\"0\"", "*", "\"9999999999999999999999999\""))
            assertThatThrownBy(() -> RequestHeaders.version(invalid)).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> RequestHeaders.idempotency(" ")).isInstanceOf(IdentityException.class);
    }
}
