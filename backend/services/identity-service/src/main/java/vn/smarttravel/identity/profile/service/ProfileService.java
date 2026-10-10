package vn.smarttravel.identity.profile.service;

import java.util.Map;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.auth.repository.AuthRepository;
import vn.smarttravel.identity.infrastructure.persistence.service.IdentityMutations;
import vn.smarttravel.identity.profile.repository.ProfileRepository;
import vn.smarttravel.identity.security.service.CurrentUser;
import vn.smarttravel.identity.shared.exception.IdentityException;

@Service
public class ProfileService {
    private final ProfileRepository repository;
    private final AuthRepository auth;
    private final TransactionTemplate tx;
    private final CurrentUser currentUser;
    private final IdentityMutations mutations;

    public ProfileService(ProfileRepository repository, AuthRepository auth, TransactionTemplate tx,
                          CurrentUser currentUser, IdentityMutations mutations) {
        this.repository = repository; this.auth = auth; this.tx = tx; this.currentUser = currentUser; this.mutations = mutations;
    }

    public Map<String, Object> profile(Jwt jwt) {
        return tx.execute(status -> profile(currentUser.requireUser(jwt)));
    }

    private Map<String, Object> profile(UUID user) {
        var account = repository.findUser(user);
        return Map.of("user_id", user, "display_name", account.get("display_name"), "status", wireStatus((String) account.get("status")),
                "roles", auth.roles(user), "version", account.get("version"));
    }

    private static String wireStatus(String status) { return status.equals("ACTIVE") ? "ACTIVE" : status.equals("DELETED") ? "DELETED" : "DISABLED"; }

    public Map<String, Object> updateProfile(Jwt jwt, String name, long version) {
        return tx.execute(status -> {
            UUID user = currentUser.requireUser(jwt);
            if (!repository.updateName(user, name, version)) throw new IdentityException(409, "VERSION_CONFLICT");
            mutations.audit(user, user, "PROFILE_UPDATED");
            return profile(user);
        });
    }
}
