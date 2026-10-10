package vn.smarttravel.identity.infrastructure.fixture.service;

import java.util.List;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.infrastructure.fixture.repository.LocalIdentityFixtureRepository;
import vn.smarttravel.identity.security.service.IssuerKeys;

/** Opt-in synthetic P00 principals; never installs a known admin password via Flyway. */
@Component
public class LocalIdentityFixtures implements ApplicationRunner {
    private final boolean enabled;
    private final String password;
    private final LocalIdentityFixtureRepository repository;
    private final PasswordEncoder encoder;
    private final TransactionTemplate tx;

    public LocalIdentityFixtures(Environment env, LocalIdentityFixtureRepository repository, PasswordEncoder encoder, TransactionTemplate tx,
                                 @Value("${identity.fixtures.enabled:false}") boolean enabled,
                                 @Value("${identity.fixtures.password:}") String password) {
        if (enabled && (!IssuerKeys.local(env) || password.length()<12 || password.length()>128))
            throw new IllegalStateException("Fixtures require an explicit local profile and injected password");
        this.enabled=enabled; this.password=password; this.repository=repository; this.encoder=encoder; this.tx=tx;
    }

    @Override public void run(ApplicationArguments args) {
        if (!enabled) return;
        tx.executeWithoutResult(status -> {
            repository.lockFixtures();
            List<String> aliases=List.of("u1","u2","admin","business");
            List<String> roles=List.of("USER","USER","ADMIN","BUSINESS");
            for (int i=0;i<4;i++) {
                UUID id=UUID.fromString("00000000-0000-4000-8000-00000000000"+(i+1));
                String email="fixture-"+aliases.get(i)+"@example.invalid";
                var existing=repository.findUser(id);
                if (!existing.isEmpty()) {
                    if (!email.equals(existing.getFirst().get("email"))) throw new IllegalStateException("Fixture ID collision");
                    continue; // Never reset/re-enable/reassign an existing account on startup.
                }
                repository.create(id,email,encoder.encode(password),aliases.get(i),roles.get(i),i==0);
            }
        });
    }
}
