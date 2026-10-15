package vn.smarttravel.identity.infrastructure.transport.service;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.infrastructure.transport.repository.OutboxRepository;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class IdentityOperatorTests {
    @Test void operatorRefusesToRunAlongsideNormalWorkersOrListener() {
        for (String unsafe : new String[]{"identity.workers.enabled", "identity.transport.enabled"}) {
            var env=new MockEnvironment().withProperty("identity.workers.enabled","false")
                    .withProperty("identity.transport.enabled","false").withProperty(unsafe,"true");
            var repository=mock(OutboxRepository.class);
            var tx=mock(TransactionTemplate.class);
            var context=mock(ConfigurableApplicationContext.class);
            var operator=new IdentityOperator(env,repository,tx,context);
            assertThatThrownBy(() -> operator.run(null)).isInstanceOf(IllegalStateException.class);
            verifyNoInteractions(repository,tx,context);
        }
    }
}
