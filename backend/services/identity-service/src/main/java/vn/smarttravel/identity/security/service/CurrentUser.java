package vn.smarttravel.identity.security.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import vn.smarttravel.identity.auth.repository.AuthRepository;
import vn.smarttravel.identity.shared.exception.IdentityException;

@Service
public class CurrentUser {
    private final AuthRepository repository;

    public CurrentUser(AuthRepository repository) { this.repository = repository; }

    public Map<String, Object> lockUser(UUID user) {
        var row = repository.lockUser(user);
        if (row == null) throw IdentityException.unauthorized();
        return row;
    }

    public java.util.List<String> roles(UUID user) { return repository.roles(user); }

    public static boolean active(Map<String, Object> row) { return row != null && "ACTIVE".equals(row.get("status")); }

    public static boolean live(Map<String, Object> row) {
        return row != null && row.get("revoked_at") == null && ((Timestamp) row.get("expires_at")).toInstant().isAfter(Instant.now());
    }

    /** Caller owns the transaction: preserve user → session locking against reset/disable/revoke. */
    public UUID requireUser(Jwt jwt) {
        try {
            if (jwt.hasClaim("client_id")) throw IdentityException.unauthorized();
            UUID user = UUID.fromString(jwt.getSubject());
            if (!active(lockUser(user))) throw IdentityException.unauthorized();
            UUID session = UUID.fromString(jwt.getClaimAsString("sid"));
            if (!live(repository.lockOwnedSession(session, user))) throw IdentityException.unauthorized();
            return user;
        } catch (IllegalArgumentException | NullPointerException e) { throw IdentityException.unauthorized(); }
    }
}
