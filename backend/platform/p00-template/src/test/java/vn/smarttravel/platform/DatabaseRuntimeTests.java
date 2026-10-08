package vn.smarttravel.platform;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@EnabledIfEnvironmentVariable(named = "P00_DB_TEST", matches = "true")
class DatabaseRuntimeTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactionManager;

    @Test
    void migrationAppliedAndProbeTransactionRollsBackOnRealPostgres() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM flyway_schema_history WHERE success", Integer.class)).isEqualTo(1);
        UUID id = UUID.randomUUID();
        new TransactionTemplate(transactionManager).executeWithoutResult(tx -> {
            jdbc.update("INSERT INTO platform_probe(probe_id) VALUES (?)", id);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM platform_probe WHERE probe_id = ?", Integer.class, id)).isEqualTo(1);
            tx.setRollbackOnly();
        });
        assertThat(jdbc.queryForObject("SELECT count(*) FROM platform_probe WHERE probe_id = ?", Integer.class, id)).isZero();
    }
}
