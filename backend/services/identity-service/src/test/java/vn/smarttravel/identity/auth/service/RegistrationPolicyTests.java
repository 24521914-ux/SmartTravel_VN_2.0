package vn.smarttravel.identity.auth.service;

import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.SimpleTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.auth.repository.AuthRepository;
import vn.smarttravel.identity.infrastructure.mail.service.AccountMail;
import vn.smarttravel.identity.infrastructure.persistence.service.IdentityMutations;
import vn.smarttravel.identity.security.service.CurrentUser;
import vn.smarttravel.identity.security.service.IssuerKeys;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.assertj.core.api.Assertions.assertThat;

class RegistrationPolicyTests {
    @Test void adminCanReactivateUnverifiedAccountOnlyWhenVerificationIsDisabled() throws Exception {
        var repository = mock(vn.smarttravel.identity.admin.repository.AdminUserRepository.class);
        var auth = mock(AuthRepository.class);
        var current = mock(CurrentUser.class);
        var tx = mock(TransactionTemplate.class);
        when(tx.execute(any())).thenAnswer(call ->
                ((org.springframework.transaction.support.TransactionCallback<?>) call.getArgument(0))
                        .doInTransaction(new SimpleTransactionStatus()));
        var service = new vn.smarttravel.identity.admin.service.AdminUserService(repository, auth, current,
                mock(IdentityMutations.class), tx, mock(vn.smarttravel.identity.shared.web.CursorPages.class));
        UUID admin = UUID.randomUUID(), user = UUID.randomUUID();
        var jwt = org.springframework.security.oauth2.jwt.Jwt.withTokenValue("test").header("alg", "RS256").subject(admin.toString()).build();
        when(current.requireUser(jwt)).thenReturn(admin);
        when(auth.roles(admin)).thenReturn(java.util.List.of("ADMIN"));
        when(repository.find(user)).thenReturn(java.util.Map.of("user_id", user, "version", 1L, "status", "SUSPENDED"));
        var body = new com.fasterxml.jackson.databind.ObjectMapper().readTree("{\"status\":\"ACTIVE\"}");
        ReflectionTestUtils.setField(service, "emailVerificationRequired", true);
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> service.status(jwt, user, body, 1))
                .hasMessage("EMAIL_NOT_VERIFIED");
        ReflectionTestUtils.setField(service, "emailVerificationRequired", false);
        service.status(jwt, user, body, 1);
        verify(repository).status(user, "ACTIVE");
        verify(auth).revokeAllSessions(user);
    }

    @Test void newAccountCanLoginWithoutVerificationMail() {
        var repository = mock(AuthRepository.class);
        var tx = mock(TransactionTemplate.class);
        var passwords = mock(PasswordEncoder.class);
        var mail = mock(AccountMail.class);
        var mutations = mock(IdentityMutations.class);
        when(mutations.idempotent(any(), any(), any(), any())).thenReturn(null);
        when(repository.findUserByEmail(any())).thenReturn(null);
        when(passwords.encode(any())).thenReturn("hash");
        when(tx.execute(any())).thenAnswer(call ->
                ((org.springframework.transaction.support.TransactionCallback<?>) call.getArgument(0))
                        .doInTransaction(new SimpleTransactionStatus()));
        var issuer = mock(IssuerKeys.class);
        when(issuer.issue(any(), any(), any())).thenReturn("synthetic-access-token");
        var service = new AuthService(repository, tx, passwords, issuer, mail, mutations, mock(CurrentUser.class));
        ReflectionTestUtils.setField(service, "emailVerificationRequired", false);
        service.register(" NEW@example.invalid ", "synthetic-password", "New user", UUID.randomUUID().toString());
        var id = org.mockito.ArgumentCaptor.forClass(UUID.class);
        verify(repository).createUser(id.capture(), eq("new@example.invalid"), eq("hash"), eq("New user"));
        verify(repository).activateWithoutVerification(id.getValue());
        verify(repository, never()).createAccountToken(any(), any(), any(), any());
        verify(mail, never()).enqueue(any(), any(), any());
        var user = java.util.Map.<String, Object>of("user_id", id.getValue(), "status", "ACTIVE", "password_hash", "hash");
        when(repository.lockUserByEmail("new@example.invalid")).thenReturn(user);
        when(passwords.matches("synthetic-password", "hash")).thenReturn(true);
        assertThat(service.login("new@example.invalid", "synthetic-password")).containsKeys("access_token", "refresh_token");
    }
}
