package vn.smarttravel.identity.auth.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.auth.repository.AuthRepository;
import vn.smarttravel.identity.infrastructure.persistence.service.IdentityMutations;
import vn.smarttravel.identity.shared.exception.IdentityException;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SocialAuthServiceTests {
    private AuthRepository repository;
    private AuthService authService;
    private SocialTokenVerifier verifier;
    private IdentityMutations mutations;
    private SocialAuthService service;

    @BeforeEach
    void setUp() {
        repository = mock(AuthRepository.class);
        authService = mock(AuthService.class);
        verifier = mock(SocialTokenVerifier.class);
        mutations = mock(IdentityMutations.class);
        TransactionTemplate tx = new TransactionTemplate() {
            @Override
            public <T> T execute(TransactionCallback<T> action) {
                return action.doInTransaction(mock(TransactionStatus.class));
            }
        };
        service = new SocialAuthService(
                repository,
                authService,
                verifier,
                tx,
                new BCryptPasswordEncoder(4),
                mutations);
    }

    @Test
    void googleLoginCreatesAndLinksNewUser() {
        var profile = new SocialTokenVerifier.VerifiedSocialProfile(
                "GOOGLE", "google-sub-123", "Traveler@Example.com", true, "Minh Anh", null);
        when(verifier.verifyGoogle("valid-google-id-token")).thenReturn(profile);
        when(repository.findSocialAccount("GOOGLE", "google-sub-123")).thenReturn(null);
        when(repository.lockUserByEmail("traveler@example.com")).thenReturn(null);
        Map<String, Object> expectedTokens = Map.of(
                "access_token", "jwt-access", "refresh_token", "refresh-1", "token_type", "Bearer", "expires_in", 600);
        when(authService.issueSessionTokens(any(UUID.class), eq("SOCIAL_LOGIN_GOOGLE"))).thenReturn(expectedTokens);

        Map<String, Object> result = service.login("google", "valid-google-id-token");

        assertThat(result).isEqualTo(expectedTokens);
        verify(repository).createUser(any(UUID.class), eq("traveler@example.com"), anyString(), eq("Minh Anh"));
        verify(repository).verifyEmail(any(UUID.class));
        verify(repository).linkSocialAccount(any(UUID.class), eq("GOOGLE"), eq("google-sub-123"), eq("traveler@example.com"));
        verify(mutations).event(any(UUID.class), eq(1L), eq("identity.user.registered.v1"), anyMap());
        verify(mutations).audit(any(UUID.class), any(UUID.class), eq("SOCIAL_REGISTER_GOOGLE"));
    }

    @Test
    void facebookLoginLinksExistingActiveUserByEmail() {
        UUID existingUserId = UUID.randomUUID();
        var profile = new SocialTokenVerifier.VerifiedSocialProfile(
                "FACEBOOK", "fb-user-999", "existing@example.com", true, "Existing User", null);
        when(verifier.verifyFacebook("valid-fb-token")).thenReturn(profile);
        when(repository.findSocialAccount("FACEBOOK", "fb-user-999")).thenReturn(null);
        when(repository.lockUserByEmail("existing@example.com")).thenReturn(new HashMap<>(Map.of(
                "user_id", existingUserId, "status", "ACTIVE", "version", 2L)));
        when(repository.findSocialAccountByUser(existingUserId, "FACEBOOK")).thenReturn(null);
        Map<String, Object> expectedTokens = Map.of("access_token", "jwt-fb", "refresh_token", "refresh-fb");
        when(authService.issueSessionTokens(existingUserId, "SOCIAL_LOGIN_FACEBOOK")).thenReturn(expectedTokens);

        Map<String, Object> result = service.login("facebook", "valid-fb-token");

        assertThat(result).isEqualTo(expectedTokens);
        verify(repository, never()).createUser(any(), anyString(), anyString(), anyString());
        verify(repository).linkSocialAccount(existingUserId, "FACEBOOK", "fb-user-999", "existing@example.com");
        verify(mutations).audit(existingUserId, existingUserId, "SOCIAL_LINK_FACEBOOK");
    }

    @Test
    void socialLoginActivatesPendingAccountWhenLinking() {
        UUID pendingUserId = UUID.randomUUID();
        var profile = new SocialTokenVerifier.VerifiedSocialProfile(
                "GOOGLE", "google-sub-pending", "pending@example.com", true, "Pending User", null);
        when(verifier.verifyGoogle("pending-token")).thenReturn(profile);
        when(repository.findSocialAccount("GOOGLE", "google-sub-pending")).thenReturn(null);
        when(repository.lockUserByEmail("pending@example.com")).thenReturn(new HashMap<>(Map.of(
                "user_id", pendingUserId, "status", "PENDING", "version", 1L)));
        when(repository.findSocialAccountByUser(pendingUserId, "GOOGLE")).thenReturn(null);
        when(authService.issueSessionTokens(pendingUserId, "SOCIAL_LOGIN_GOOGLE")).thenReturn(Map.of("access_token", "jwt-ok"));

        service.login("google", "pending-token");

        verify(repository).verifyEmail(pendingUserId);
        verify(mutations).event(eq(pendingUserId), eq(2L), eq("identity.user.status-changed.v1"), anyMap());
        verify(repository).linkSocialAccount(pendingUserId, "GOOGLE", "google-sub-pending", "pending@example.com");
    }

    @Test
    void returningLinkedUserTouchesLoginWithoutRelinking() {
        UUID userId = UUID.randomUUID();
        UUID socialId = UUID.randomUUID();
        var profile = new SocialTokenVerifier.VerifiedSocialProfile(
                "GOOGLE", "google-sub-returning", "returning@example.com", true, "Returning", null);
        when(verifier.verifyGoogle("returning-token")).thenReturn(profile);
        when(repository.findSocialAccount("GOOGLE", "google-sub-returning")).thenReturn(Map.of(
                "social_account_id", socialId, "user_id", userId));
        when(repository.lockUser(userId)).thenReturn(Map.of("user_id", userId, "status", "ACTIVE", "version", 1L));
        when(authService.issueSessionTokens(userId, "SOCIAL_LOGIN_GOOGLE")).thenReturn(Map.of("access_token", "jwt-ret"));

        Map<String, Object> result = service.login("GOOGLE", "returning-token");

        assertThat(result).containsEntry("access_token", "jwt-ret");
        verify(repository).touchSocialAccountLogin(socialId, "returning@example.com");
        verify(repository, never()).linkSocialAccount(any(), anyString(), anyString(), anyString());
    }

    @Test
    void rejectsSuspendedUserConflictingProviderAndUnverifiedEmail() {
        UUID userId = UUID.randomUUID();
        when(verifier.verifyGoogle("unverified")).thenReturn(new SocialTokenVerifier.VerifiedSocialProfile(
                "GOOGLE", "sub-1", "u@example.com", false, "U", null));
        assertThatThrownBy(() -> service.login("google", "unverified"))
                .isInstanceOf(IdentityException.class)
                .extracting("code").isEqualTo("SOCIAL_EMAIL_NOT_VERIFIED");

        when(verifier.verifyFacebook("no-email")).thenReturn(new SocialTokenVerifier.VerifiedSocialProfile(
                "FACEBOOK", "fb-1", "", false, "No Email", null));
        assertThatThrownBy(() -> service.login("facebook", "no-email"))
                .isInstanceOf(IdentityException.class)
                .extracting("code").isEqualTo("SOCIAL_EMAIL_REQUIRED");

        assertThatThrownBy(() -> service.login("twitter", "tok"))
                .isInstanceOf(IdentityException.class)
                .extracting("code").isEqualTo("UNSUPPORTED_SOCIAL_PROVIDER");

        when(verifier.verifyGoogle("suspended-token")).thenReturn(new SocialTokenVerifier.VerifiedSocialProfile(
                "GOOGLE", "sub-sus", "sus@example.com", true, "Suspended", null));
        when(repository.findSocialAccount("GOOGLE", "sub-sus")).thenReturn(null);
        when(repository.lockUserByEmail("sus@example.com")).thenReturn(Map.of("user_id", userId, "status", "SUSPENDED", "version", 2L));
        assertThatThrownBy(() -> service.login("google", "suspended-token"))
                .isInstanceOf(IdentityException.class)
                .extracting("status").isEqualTo(401);

        when(verifier.verifyGoogle("conflict-token")).thenReturn(new SocialTokenVerifier.VerifiedSocialProfile(
                "GOOGLE", "sub-new", "linked@example.com", true, "Linked", null));
        when(repository.findSocialAccount("GOOGLE", "sub-new")).thenReturn(null);
        when(repository.lockUserByEmail("linked@example.com")).thenReturn(Map.of("user_id", userId, "status", "ACTIVE", "version", 2L));
        when(repository.findSocialAccountByUser(userId, "GOOGLE")).thenReturn(Map.of(
                "social_account_id", UUID.randomUUID(), "provider_user_id", "sub-other"));
        assertThatThrownBy(() -> service.login("google", "conflict-token"))
                .isInstanceOf(IdentityException.class)
                .extracting("status").isEqualTo(409);
        verify(mutations, never()).event(any(), anyLong(), anyString(), anyMap());
    }

    @Test
    void defaultVerifierRejectsMissingConfigAndMalformedGoogleTokens() {
        var unconfigured = new DefaultSocialTokenVerifier("", "", "", new ObjectMapper());
        assertThatThrownBy(() -> unconfigured.verifyGoogle("any"))
                .isInstanceOf(IdentityException.class)
                .extracting("status", "code").containsExactly(503, "SOCIAL_PROVIDER_NOT_CONFIGURED");
        assertThatThrownBy(() -> unconfigured.verifyFacebook("any"))
                .isInstanceOf(IdentityException.class)
                .extracting("status", "code").containsExactly(503, "SOCIAL_PROVIDER_NOT_CONFIGURED");

        var configuredGoogle = new DefaultSocialTokenVerifier("test-client.apps.googleusercontent.com", "", "", new ObjectMapper());
        assertThatThrownBy(() -> configuredGoogle.verifyGoogle("not-a-valid-jwt"))
                .isInstanceOf(IdentityException.class)
                .extracting("status").isEqualTo(401);
    }
}
