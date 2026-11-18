package vn.smarttravel.identity.security.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import vn.smarttravel.identity.auth.repository.AuthRepository;
import vn.smarttravel.identity.shared.exception.IdentityException;

@Service
public class CurrentUser {
    public record VerifiedSession(UUID user, List<String> roles) {}

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

    /** Read-only verification: shared locks allow parallel reads while synchronizing with FOR UPDATE mutators. */
    public VerifiedSession requireActiveSession(Jwt jwt) {
        try {
            if (jwt.hasClaim("client_id")) throw IdentityException.unauthorized();
            UUID user = UUID.fromString(jwt.getSubject());
            UUID session = UUID.fromString(jwt.getClaimAsString("sid"));
            var row = repository.verifyActiveSession(user, session);
            if (!active(row) || !live(row)) throw IdentityException.unauthorized();
            String csv = (String) row.get("roles_csv");
            List<String> roles = (csv == null || csv.isBlank()) ? List.of() : Arrays.asList(csv.split(","));
            return new VerifiedSession(user, roles);
        } catch (IllegalArgumentException | NullPointerException e) { throw IdentityException.unauthorized(); }
    }
}
