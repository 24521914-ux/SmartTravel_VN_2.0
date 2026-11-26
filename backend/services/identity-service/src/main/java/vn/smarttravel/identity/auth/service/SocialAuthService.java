package vn.smarttravel.identity.auth.service;

import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.auth.repository.AuthRepository;
import vn.smarttravel.identity.infrastructure.persistence.service.IdentityMutations;
import vn.smarttravel.identity.security.support.Tokens;
import vn.smarttravel.identity.shared.exception.IdentityException;

/** Verifies Google/Facebook tokens and creates or links SmartTravel accounts before issuing sessions. */
@Service
public class SocialAuthService {
    private final AuthRepository repository;
    private final AuthService authService;
    private final SocialTokenVerifier verifier;
    private final TransactionTemplate tx;
    private final PasswordEncoder passwords;
    private final IdentityMutations mutations;

    public SocialAuthService(
            AuthRepository repository,
            AuthService authService,
            SocialTokenVerifier verifier,
            TransactionTemplate tx,
            PasswordEncoder passwords,
            IdentityMutations mutations) {
        this.repository = repository;
        this.authService = authService;
        this.verifier = verifier;
        this.tx = tx;
        this.passwords = passwords;
        this.mutations = mutations;
    }

    public Map<String, Object> login(String rawProvider, String token) {
        if (rawProvider == null || rawProvider.isBlank() || token == null || token.isBlank()) {
            throw new IdentityException(400, "INVALID_INPUT");
        }
        String provider = normalizeProvider(rawProvider);
        SocialTokenVerifier.VerifiedSocialProfile profile = switch (provider) {
            case "GOOGLE" -> verifier.verifyGoogle(token.trim());
            case "FACEBOOK" -> verifier.verifyFacebook(token.trim());
            default -> throw new IdentityException(400, "UNSUPPORTED_SOCIAL_PROVIDER");
        };
        if (profile == null || profile.providerUserId() == null || profile.providerUserId().isBlank()) {
            throw IdentityException.unauthorized();
        }
        if (profile.email() == null || profile.email().isBlank()) {
            throw new IdentityException(400, "SOCIAL_EMAIL_REQUIRED");
        }
        if (!profile.emailVerified()) {
            throw new IdentityException(400, "SOCIAL_EMAIL_NOT_VERIFIED");
        }

        String canonicalEmail = AuthService.canonical(profile.email());
        String displayName = sanitizeDisplayName(profile.displayName(), canonicalEmail);
        // Pre-hash a 256-bit random password (43 chars, within BCrypt's 72-byte limit) outside the DB transaction.
        String randomPasswordHash = passwords.encode(Tokens.random());

        return tx.execute(status -> {
            repository.lockRegistration(Tokens.hash(canonicalEmail));

            var existingLink = repository.findSocialAccount(provider, profile.providerUserId());
            if (existingLink != null) {
                UUID userId = (UUID) existingLink.get("user_id");
                var user = repository.lockUser(userId);
                ensureSignInAllowedAndActivateIfPending(user, userId);
                repository.touchSocialAccountLogin((UUID) existingLink.get("social_account_id"), canonicalEmail);
                return authService.issueSessionTokens(userId, "SOCIAL_LOGIN_" + provider);
            }

            var existingUser = repository.lockUserByEmail(canonicalEmail);
            if (existingUser != null) {
                UUID userId = (UUID) existingUser.get("user_id");
                ensureSignInAllowedAndActivateIfPending(existingUser, userId);
                var existingSameProvider = repository.findSocialAccountByUser(userId, provider);
                if (existingSameProvider != null
                        && !profile.providerUserId().equals(existingSameProvider.get("provider_user_id"))) {
                    throw new IdentityException(409, "SOCIAL_ACCOUNT_CONFLICT");
                }
                if (existingSameProvider == null) {
                    repository.linkSocialAccount(userId, provider, profile.providerUserId(), canonicalEmail);
                    mutations.audit(userId, userId, "SOCIAL_LINK_" + provider);
                } else {
                    repository.touchSocialAccountLogin((UUID) existingSameProvider.get("social_account_id"), canonicalEmail);
                }
                return authService.issueSessionTokens(userId, "SOCIAL_LOGIN_" + provider);
            }

            UUID userId = UUID.randomUUID();
            repository.createUser(userId, canonicalEmail, randomPasswordHash, displayName);
            repository.verifyEmail(userId);
            repository.linkSocialAccount(userId, provider, profile.providerUserId(), canonicalEmail);
            mutations.event(userId, 1, "identity.user.registered.v1",
                    Map.of("user_id", userId, "display_name", displayName));
            mutations.audit(userId, userId, "SOCIAL_REGISTER_" + provider);
            return authService.issueSessionTokens(userId, "SOCIAL_LOGIN_" + provider);
        });
    }

    private void ensureSignInAllowedAndActivateIfPending(Map<String, Object> user, UUID userId) {
        if (user == null) {
            throw IdentityException.unauthorized();
        }
        String status = (String) user.get("status");
        if ("PENDING".equals(status)) {
            repository.verifyEmail(userId);
            long version = ((Number) user.get("version")).longValue() + 1;
            mutations.event(userId, version, "identity.user.status-changed.v1",
                    Map.of("user_id", userId, "status", "ACTIVE", "version", version));
            return;
        }
        if (!"ACTIVE".equals(status)) {
            throw IdentityException.unauthorized();
        }
    }

    static String normalizeProvider(String raw) {
        String normalized = raw.trim().toUpperCase(Locale.ROOT);
        if (!"GOOGLE".equals(normalized) && !"FACEBOOK".equals(normalized)) {
            throw new IdentityException(400, "UNSUPPORTED_SOCIAL_PROVIDER");
        }
        return normalized;
    }

    private static String sanitizeDisplayName(String candidate, String canonicalEmail) {
        String trimmed = candidate == null ? "" : candidate.trim();
        if (trimmed.isEmpty()) {
            int at = canonicalEmail.indexOf('@');
            trimmed = at > 0 ? canonicalEmail.substring(0, at) : "SmartTravel User";
        }
        return trimmed.length() > 120 ? trimmed.substring(0, 120) : trimmed;
    }
}
