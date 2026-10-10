package vn.smarttravel.identity.auth.service;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.auth.repository.AuthRepository;
import vn.smarttravel.identity.infrastructure.persistence.service.IdentityMutations;
import vn.smarttravel.identity.security.service.CurrentUser;
import vn.smarttravel.identity.shared.exception.IdentityException;

@Service
public class SessionService {
    private final AuthRepository repository;
    private final TransactionTemplate tx;
    private final CurrentUser currentUser;
    private final IdentityMutations mutations;

    public SessionService(AuthRepository repository, TransactionTemplate tx, CurrentUser currentUser, IdentityMutations mutations) {
        this.repository = repository; this.tx = tx; this.currentUser = currentUser; this.mutations = mutations;
    }

    public Map<String, Object> sessions(Jwt jwt, String cursor, int limit) {
        if (limit < 1 || limit > 100) throw new IdentityException(400, "INVALID_INPUT");
        Instant after = Instant.EPOCH;
        UUID afterId = new UUID(0, 0);
        if (cursor != null) {
            try {
                if (cursor.length()>1024) throw new IllegalArgumentException();
                String[] parts = new String(java.util.Base64.getUrlDecoder().decode(cursor), java.nio.charset.StandardCharsets.UTF_8).split("\\|", -1);
                if (parts.length != 2) throw new IllegalArgumentException();
                after = Instant.parse(parts[0]); afterId = UUID.fromString(parts[1]);
            } catch (RuntimeException e) { throw new IdentityException(400, "INVALID_CURSOR"); }
        }
        final Instant start = after; final UUID startId = afterId;
        return tx.execute(status -> {
            var items = repository.sessions(currentUser.requireUser(jwt), start, startId, limit+1);
            String next = null;
            if (items.size()>limit) {
                items.removeLast(); var last = items.getLast();
                String position = ((Timestamp) last.get("created_at")).toInstant()+"|"+last.get("session_id");
                next = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(position.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
            var page = new java.util.LinkedHashMap<String, Object>();
            page.put("items", items); page.put("next_cursor", next); page.put("as_of", Instant.now().toString()); page.put("watermark", 1);
            return page;
        });
    }

    public void deleteSession(Jwt jwt, UUID session) {
        tx.executeWithoutResult(status -> {
            UUID user = currentUser.requireUser(jwt);
            if (!repository.ownsSession(user, session)) throw new IdentityException(404, "NOT_FOUND");
            repository.revokeSession(session); mutations.audit(user, user, "SESSION_REVOKED");
        });
    }
}
