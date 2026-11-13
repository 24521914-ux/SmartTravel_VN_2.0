package vn.smarttravel.identity.auth.service;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.auth.repository.AuthRepository;
import vn.smarttravel.identity.infrastructure.mail.service.AccountMail;
import vn.smarttravel.identity.infrastructure.persistence.service.IdentityMutations;
import vn.smarttravel.identity.security.service.CurrentUser;
import vn.smarttravel.identity.security.service.IssuerKeys;
import vn.smarttravel.identity.security.support.Tokens;
import vn.smarttravel.identity.shared.exception.IdentityException;
import vn.smarttravel.identity.shared.web.ApiResponses;
import static vn.smarttravel.identity.security.service.CurrentUser.active;
import static vn.smarttravel.identity.security.service.CurrentUser.live;

@Service
public class AuthService {
    private final AuthRepository repository;
    private final TransactionTemplate tx;
    private final PasswordEncoder passwords;
    private final IssuerKeys issuer;
    private final AccountMail mail;
    private final IdentityMutations mutations;
    private final CurrentUser currentUser;
    private final String dummyHash;
    @org.springframework.beans.factory.annotation.Value("${identity.email-verification.required:false}")
    private boolean emailVerificationRequired;

    public AuthService(AuthRepository repository, TransactionTemplate tx, PasswordEncoder passwords, IssuerKeys issuer,
                       AccountMail mail, IdentityMutations mutations, CurrentUser currentUser) {
        this.repository = repository; this.tx = tx; this.passwords = passwords; this.issuer = issuer;
        this.mail = mail; this.mutations = mutations; this.currentUser = currentUser;
        dummyHash = passwords.encode(Tokens.random());
    }

    public static String canonical(String email) { return email.trim().toLowerCase(Locale.ROOT); }
    private UUID id(Map<String, Object> row, String column) { return (UUID) row.get(column); }

    public Map<String, Object> register(String email, String password, String displayName, String key) {
        String canonicalEmail = canonical(email);
        String actor = Tokens.hash(canonicalEmail);
        String bodyHash = mail.digest(mutations.encode(new java.util.TreeMap<>(Map.of("email", canonicalEmail, "password", password, "display_name", displayName))));
        // Equal password hashing work on the new and duplicate paths.
        String passwordHash = passwords.encode(password);
        return tx.execute(status -> {
            repository.lockRegistration(actor);
            var replay = mutations.idempotent("register", actor, key, bodyHash);
            if (replay != null) return replay;
            if (repository.findUserByEmail(canonicalEmail) == null) {
                UUID user = UUID.randomUUID();
                repository.createUser(user, canonicalEmail, passwordHash, displayName);
                if (emailVerificationRequired) accountToken(user, "VERIFY_EMAIL", Duration.ofHours(24));
                else repository.activateWithoutVerification(user);
                mutations.event(user, 1, "identity.user.registered.v1", Map.of("user_id", user, "display_name", displayName));
                mutations.audit(user, user, "REGISTER");
            }
            var response = ApiResponses.accepted();
            mutations.remember("register", actor, key, bodyHash, response);
            return response;
        });
    }

    private void accountToken(UUID user, String purpose, Duration ttl) {
        // Supersede all older tokens for this purpose under the user lock.
        repository.consumeAccountTokens(user, purpose);
        String token = Tokens.random();
        repository.createAccountToken(user, purpose, Tokens.hash(token), Instant.now().plus(ttl));
        mail.enqueue(user, purpose, token);
    }

    public Map<String, Object> login(String email, String password) {
        return tx.execute(status -> {
            var user = repository.lockUserByEmail(canonical(email));
            boolean matches = passwords.matches(password, user == null ? dummyHash : (String) user.get("password_hash"));
            if (!matches) throw IdentityException.unauthorized();
            if (user != null && "PENDING".equals(user.get("status")))
                throw new IdentityException(403, "EMAIL_NOT_VERIFIED");
            if (!active(user)) throw IdentityException.unauthorized();
            UUID userId = id(user, "user_id"), session = UUID.randomUUID();
            Instant absoluteExpiry = Instant.now().plus(Duration.ofDays(30));
            repository.createSession(session, userId, absoluteExpiry);
            mutations.audit(userId, userId, "LOGIN");
            return tokenPair(userId, session, null, absoluteExpiry);
        });
    }

    private Map<String, Object> tokenPair(UUID user, UUID session, UUID parent, Instant absoluteExpiry) {
        String refresh = Tokens.random();
        Instant expiry = Instant.now().plus(Duration.ofDays(7));
        if (absoluteExpiry.isBefore(expiry)) expiry = absoluteExpiry;
        repository.createRefreshToken(session, Tokens.hash(refresh), parent, expiry);
        return Map.of("access_token", issuer.issue(user, session, roles(user)), "refresh_token", refresh,
                "token_type", "Bearer", "expires_in", IssuerKeys.ACCESS_TTL_SECONDS);
    }

    public Map<String, Object> refresh(String token) {
        var result = tx.execute(status -> {
            var lookup = repository.findRefreshOwner(Tokens.hash(token));
            if (lookup == null) return null;
            UUID userId = id(lookup, "user_id"), sessionId = id(lookup, "session_id");
            var user = currentUser.lockUser(userId);
            var session = repository.lockSession(sessionId);
            var row = repository.lockRefreshToken(Tokens.hash(token));
            if (row.get("consumed_at") != null) {
                repository.revokeSession(sessionId);
                mutations.audit(userId, userId, "REFRESH_REUSE");
                return null; // Commit revocation BEFORE 401; never roll it back with an exception.
            }
            if (!active(user) || !live(session) || !live(row)) return null;
            repository.consumeRefreshToken(id(row, "token_id"));
            return tokenPair(userId, sessionId, id(row, "token_id"), ((Timestamp) session.get("expires_at")).toInstant());
        });
        if (result == null) throw IdentityException.unauthorized();
        return result;
    }

    public void logout(Jwt jwt, String token) {
        tx.executeWithoutResult(status -> {
            UUID user = currentUser.requireUser(jwt);
            var row = repository.findOwnedRefreshSession(Tokens.hash(token), user);
            if (row == null || !row.get("session_id").toString().equals(jwt.getClaimAsString("sid"))) throw IdentityException.unauthorized();
            repository.revokeSession(id(row, "session_id")); mutations.audit(user, user, "LOGOUT");
        });
    }

    public void resendVerification(String email) {
        tx.executeWithoutResult(status -> {
            var user = repository.lockUserByEmail(canonical(email));
            if (user == null || !"PENDING".equals(user.get("status"))) return;
            UUID userId = id(user, "user_id");
            // Serialize on the account lock and keep a short cooldown to prevent mail flooding.
            if (!repository.recentVerification(userId))
                accountToken(userId, "VERIFY_EMAIL", Duration.ofHours(24));
        });
    }

    public void forgot(String email) {
        tx.executeWithoutResult(status -> {
            var user = repository.lockUserByEmail(canonical(email));
            if (active(user)) accountToken(id(user, "user_id"), "RESET_PASSWORD", Duration.ofMinutes(30));
        });
    }

    public Map<String, Object> consumeAccountToken(String raw, String purpose, String password) {
        String passwordHash = password == null ? null : passwords.encode(password);
        return tx.execute(status -> {
            var lookup = repository.findAccountToken(Tokens.hash(raw), purpose);
            if (lookup == null) throw IdentityException.unauthorized();
            UUID user = id(lookup, "user_id");
            var account = currentUser.lockUser(user);
            var token = repository.lockAccountToken(Tokens.hash(raw), purpose);
            if (token.get("consumed_at") != null || !((Timestamp) token.get("expires_at")).toInstant().isAfter(Instant.now())) throw IdentityException.unauthorized();
            if (purpose.equals("VERIFY_EMAIL")) {
                if (!"PENDING".equals(account.get("status"))) throw IdentityException.unauthorized();
                repository.verifyEmail(user);
                long version = ((Number) account.get("version")).longValue()+1;
                mutations.event(user, version, "identity.user.status-changed.v1", Map.of("user_id", user, "status", "ACTIVE", "version", version));
            } else {
                if (!active(account)) throw IdentityException.unauthorized();
                repository.updatePassword(user, passwordHash);
                repository.revokeAllSessions(user);
            }
            repository.consumeAccountTokens(user, purpose);
            mutations.audit(user, user, purpose);
            return ApiResponses.accepted();
        });
    }

    public void changePassword(Jwt jwt, String current, String replacement) {
        String hash = passwords.encode(replacement);
        tx.executeWithoutResult(status -> {
            UUID user = currentUser.requireUser(jwt);
            var account = currentUser.lockUser(user);
            if (!passwords.matches(current, (String) account.get("password_hash"))) throw IdentityException.unauthorized();
            repository.updatePassword(user, hash);
            repository.consumeAccountTokens(user, "RESET_PASSWORD");
            repository.revokeAllSessions(user); mutations.audit(user, user, "PASSWORD_CHANGED");
        });
    }

    public List<String> roles(UUID user) { return repository.roles(user); }
}
