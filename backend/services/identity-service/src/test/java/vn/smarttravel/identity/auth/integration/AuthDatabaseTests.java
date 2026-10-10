package vn.smarttravel.identity.auth.integration;

import vn.smarttravel.identity.auth.service.AuthService;
import vn.smarttravel.identity.auth.service.AuthRateLimit;
import vn.smarttravel.identity.auth.service.SessionService;
import vn.smarttravel.identity.profile.service.ProfileService;
import vn.smarttravel.identity.infrastructure.mail.service.AccountMail;
import vn.smarttravel.identity.security.config.SecurityConfiguration;
import vn.smarttravel.identity.security.service.IssuerKeys;
import vn.smarttravel.identity.security.support.Tokens;
import vn.smarttravel.identity.shared.exception.IdentityException;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties={"security.jwt.issuer=identity-test", "identity.mail.poll-ms=3600000", "management.health.mail.enabled=false",
                "identity.fixtures.enabled=true", "identity.fixtures.password=synthetic-fixture-password-123"})
@ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named="IDENTITY_DB_TESTS", matches="true")
class AuthDatabaseTests {
    @TestConfiguration
    static class LocalDecoder {
        @Bean @Primary JwtDecoder testDecoder(IssuerKeys keys) throws Exception {
            var decoder = NimbusJwtDecoder.withPublicKey(keys.verificationKey().toRSAPublicKey()).build();
            decoder.setJwtValidator(new org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator<>(
                    JwtValidators.createDefaultWithIssuer("identity-test"), SecurityConfiguration.audienceValidator("identity")));
            return decoder;
        }
    }
    @Autowired AuthService auth;
    @Autowired ProfileService profiles;
    @Autowired SessionService sessions;
    @Autowired AccountMail mail;
    @Autowired AuthRateLimit limits;
    @Autowired JdbcTemplate db;
    @Autowired JwtDecoder decoder;
    @Autowired TestRestTemplate http;
    @LocalServerPort int port;
    @MockitoBean JavaMailSender sender;
    final Map<String, String> delivered = new ConcurrentHashMap<>();
    static final String PASSWORD = "valid-test-password-123";
    record Account(String email, UUID user) {}
    @BeforeEach void captureMail() {
        doAnswer(invocation -> {
            SimpleMailMessage message = invocation.getArgument(0);
            delivered.put(message.getTo()[0], message.getText()); return null;
        }).when(sender).send(any(SimpleMailMessage.class));
    }
    String email() { return "test-"+UUID.randomUUID()+"@example.invalid"; }
    Account pending(String email) {
        auth.register(email, PASSWORD, "Synthetic test", UUID.randomUUID().toString());
        UUID id = db.queryForObject("SELECT user_id FROM identity.users WHERE email=?", UUID.class, AuthService.canonical(email));
        return new Account(AuthService.canonical(email), id);
    }
    Account active() {
        var account = pending(email()); mail.deliver();
        auth.consumeAccountToken(delivered.get(account.email()).split("\n")[1], "VERIFY_EMAIL", null);
        return account;
    }
    Map<String, Object> login(Account account) { return auth.login(account.email(), PASSWORD); }
    Jwt jwt(Map<String, Object> pair) { return decoder.decode((String) pair.get("access_token")); }
    ResponseEntity<Map> api(HttpMethod method, String path, Object body, String token, String... headers) {
        var h = new HttpHeaders(); h.setContentType(MediaType.APPLICATION_JSON);
        if (token != null) h.setBearerAuth(token);
        for (int i=0;i<headers.length;i+=2) h.set(headers[i], headers[i+1]);
        return http.exchange(path, method, new HttpEntity<>(body,h), Map.class);
    }
    @Test void canonicalDuplicateRegistrationHasAtomicDefaultsAndIdempotency() {
        String email=email(), key=UUID.randomUUID().toString();
        var first = auth.register(email.toUpperCase(), PASSWORD, "Test", key);
        var repeat = auth.register(email, PASSWORD, "Test", key);
        assertThat(repeat).isEqualTo(first);
        auth.register(" "+email+" ", PASSWORD, "Test", UUID.randomUUID().toString());
        assertThat(db.queryForObject("SELECT count(*) FROM identity.users WHERE email=?", Integer.class, email)).isEqualTo(1);
        UUID id=db.queryForObject("SELECT user_id FROM identity.users WHERE email=?", UUID.class,email);
        assertThat(auth.roles(id)).containsExactly("USER");
        assertThat(db.queryForObject("SELECT personalization_enabled FROM identity.user_preferences WHERE user_id=?",Boolean.class,id)).isFalse();
        assertThat(db.queryForObject("SELECT count(*) FROM identity.outbox_events WHERE aggregate_id=?",Integer.class,id.toString())).isEqualTo(1);
        assertThatThrownBy(() -> auth.register(email,PASSWORD,"Changed",key)).isInstanceOf(IdentityException.class).hasMessage("IDEMPOTENCY_CONFLICT");
        assertThatThrownBy(() -> auth.login(email,PASSWORD)).isInstanceOf(IdentityException.class);
    }
    @Test void accountTokensAreHashedSingleUseAndExpire() {
        var account=pending(email());
        mail.deliver(); String token=delivered.get(account.email()).split("\n")[1];
        assertThat(db.queryForObject("SELECT token_hash FROM identity.account_tokens WHERE user_id=?",String.class,account.user())).isEqualTo(Tokens.hash(token)).isNotEqualTo(token);
        auth.consumeAccountToken(token,"VERIFY_EMAIL",null);
        assertThatThrownBy(() -> auth.consumeAccountToken(token,"VERIFY_EMAIL",null)).isInstanceOf(IdentityException.class);
        var expired=pending(email()); mail.deliver();
        db.update("UPDATE identity.account_tokens SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE user_id=?",expired.user());
        assertThatThrownBy(() -> auth.consumeAccountToken(delivered.get(expired.email()).split("\n")[1],"VERIFY_EMAIL",null)).isInstanceOf(IdentityException.class);
    }
    @Test void issuerHttpJwksAndAuthResponsesAreRealAndPrivateKeyNeverLeavesServer() {
        var account=active(); var pair=login(account);
        var provider=new SecurityConfiguration().jwtDecoder("http://127.0.0.1:"+port+"/.well-known/jwks.json","identity-test","identity");
        var decoded=provider.decode((String) pair.get("access_token"));
        assertThat(decoded.getSubject()).isEqualTo(account.user().toString());
        assertThat(decoded.getClaimAsString("sid")).isNotBlank();
        assertThat(api(HttpMethod.GET,"/.well-known/jwks.json",null,null).getStatusCode()).isEqualTo(HttpStatus.OK);
        var response=api(HttpMethod.GET,"/api/v1/me",null,(String) pair.get("access_token"));
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getETag()).isEqualTo("\"2\"");
        assertThat(api(HttpMethod.GET,"/api/v1/me",null,null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(api(HttpMethod.GET,"/api/v1/admin/users",null,(String)pair.get("access_token")).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(api(HttpMethod.POST,"/internal/v1/users/status/batch",Map.of("ids",java.util.List.of(account.user())),(String)pair.get("access_token")).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }
    @Test void requestValidationDoesNotAllowSelfAssignedRolesOrMissingKeys() {
        String email=email();
        assertThat(api(HttpMethod.POST,"/api/v1/auth/register",Map.of("email",email,"password",PASSWORD,"display_name","Test","roles",java.util.List.of("ADMIN")),null,"Idempotency-Key","x").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(api(HttpMethod.POST,"/api/v1/auth/register",Map.of("email",email,"password",PASSWORD,"display_name","Test"),null).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(api(HttpMethod.POST,"/api/v1/auth/login",Map.of("email",email,"password",PASSWORD),null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
    @Test void refreshRotatesAndReuseCommitsWholeFamilyRevocation() {
        var account=active(); var first=login(account);
        var second=auth.refresh((String)first.get("refresh_token"));
        assertThat(second.get("refresh_token")).isNotEqualTo(first.get("refresh_token"));
        assertThatThrownBy(() -> auth.refresh((String)first.get("refresh_token"))).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> auth.refresh((String)second.get("refresh_token"))).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> profiles.profile(jwt(second))).isInstanceOf(IdentityException.class);
        assertThat(db.queryForObject("SELECT count(*) FROM identity.audit_logs WHERE entity_id=? AND action='REFRESH_REUSE'",Integer.class,account.user().toString())).isEqualTo(1);
    }
    @Test void twoConcurrentRefreshesHaveExactlyOneWinnerAndNoRollbackOfReuseRevoke() throws Exception {
        var account=active(); var first=login(account);
        String token=(String)first.get("refresh_token");
        var ready=new CountDownLatch(2); var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Boolean> attempt=() -> {
                ready.countDown(); start.await();
                try { auth.refresh(token); return true; }
                catch(IdentityException e) { return false; }
            };
            var a=pool.submit(attempt); var b=pool.submit(attempt);
            assertThat(ready.await(5,java.util.concurrent.TimeUnit.SECONDS)).isTrue(); start.countDown();
            assertThat(java.util.List.of(a.get(10,java.util.concurrent.TimeUnit.SECONDS),b.get(10,java.util.concurrent.TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
        }
        assertThat(db.queryForObject("SELECT count(*) FROM identity.refresh_tokens WHERE session_id=?::uuid",Integer.class,jwt(first).getClaimAsString("sid"))).isEqualTo(2);
        assertThat(db.queryForObject("SELECT revoked_at IS NOT NULL FROM identity.auth_sessions WHERE session_id=?::uuid",Boolean.class,jwt(first).getClaimAsString("sid"))).isTrue();
    }
    @Test void resetAndChangePasswordRevokeSessionsAndOldAccountTokens() {
        var account=active(); var first=login(account); var second=login(account);
        auth.forgot(account.email()); mail.deliver(); String reset=delivered.get(account.email()).split("\n")[1];
        auth.consumeAccountToken(reset,"RESET_PASSWORD","replacement-password-123");
        assertThatThrownBy(() -> auth.refresh((String)first.get("refresh_token"))).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> profiles.profile(jwt(second))).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> auth.consumeAccountToken(reset,"RESET_PASSWORD",PASSWORD)).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> login(account)).isInstanceOf(IdentityException.class);
        var replacement=auth.login(account.email(),"replacement-password-123");
        auth.changePassword(jwt(replacement),"replacement-password-123",PASSWORD);
        assertThatThrownBy(() -> auth.refresh((String)replacement.get("refresh_token"))).isInstanceOf(IdentityException.class);
    }
    @Test void logoutAndSessionDeletionEnforceOwnerAndBlockSensitiveUseOfOldJwt() {
        var first=active(); var second=active(); var a=login(first); var b=login(second);
        UUID foreign=UUID.fromString(jwt(b).getClaimAsString("sid"));
        assertThatThrownBy(() -> sessions.deleteSession(jwt(a),foreign)).isInstanceOf(IdentityException.class).hasMessage("NOT_FOUND");
        auth.logout(jwt(a),(String)a.get("refresh_token"));
        assertThatThrownBy(() -> profiles.profile(jwt(a))).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> auth.refresh((String)a.get("refresh_token"))).isInstanceOf(IdentityException.class);
        assertThat(profiles.profile(jwt(b)).get("user_id")).isEqualTo(second.user());
        sessions.deleteSession(jwt(b),foreign);
        assertThatThrownBy(() -> auth.refresh((String)b.get("refresh_token"))).isInstanceOf(IdentityException.class);
    }
    @Test void profileEtagAndDatabaseRateLimitAreEnforced() {
        var account=active(); var pair=login(account); String token=(String)pair.get("access_token");
        assertThat(api(HttpMethod.PATCH,"/api/v1/me",Map.of("display_name","Changed"),token).getStatusCode()).isEqualTo(HttpStatus.PRECONDITION_REQUIRED);
        assertThat(api(HttpMethod.PATCH,"/api/v1/me",Map.of("display_name","Changed"),token,"If-Match","\"1\"").getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(api(HttpMethod.PATCH,"/api/v1/me",Map.of("display_name","Changed"),token,"If-Match","\"2\"").getHeaders().getETag()).isEqualTo("\"3\"");
        String remote=UUID.randomUUID().toString();
        for(int i=0;i<10;i++) limits.check("test",account.email(),remote);
        assertThatThrownBy(() -> limits.check("test",account.email(),remote)).isInstanceOf(IdentityException.class).hasMessage("RATE_LIMITED");
        assertThat(db.queryForObject("SELECT attempts FROM identity.auth_rate_limits WHERE bucket_hash=?",Integer.class,Tokens.hash("test:account:"+account.email()))).isEqualTo(11);
    }
    @Test void fixturesAndSessionPaginationUseRealStoredPrincipals() {
        for(int i=1;i<=4;i++) {
            String alias=java.util.List.of("u1","u2","admin","business").get(i-1);
            var pair=auth.login("fixture-"+alias+"@example.invalid","synthetic-fixture-password-123");
            assertThat(jwt(pair).getSubject()).isEqualTo("00000000-0000-4000-8000-00000000000"+i);
            assertThat(jwt(pair).getClaimAsStringList("roles")).containsExactly(java.util.List.of("USER","USER","ADMIN","BUSINESS").get(i-1));
        }
        var account=active(); var a=login(account); login(account); login(account);
        var page=sessions.sessions(jwt(a),null,2);
        assertThat((java.util.List<?>)page.get("items")).hasSize(2);
        assertThat((String)page.get("next_cursor")).isNotBlank();
        var last=sessions.sessions(jwt(a),(String)page.get("next_cursor"),2);
        assertThat((java.util.List<?>)last.get("items")).hasSize(1);
        assertThat(last.get("next_cursor")).isNull();
        assertThatThrownBy(() -> sessions.sessions(jwt(a),"not-a-cursor",20)).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> sessions.sessions(jwt(a),null,101)).isInstanceOf(IdentityException.class);
    }
    @Test void expiredIdleAndAbsoluteSessionsCannotRefresh() {
        var account=active(); var first=login(account);
        db.update("UPDATE identity.refresh_tokens SET issued_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE token_hash=?",Tokens.hash((String)first.get("refresh_token")));
        assertThatThrownBy(() -> auth.refresh((String)first.get("refresh_token"))).isInstanceOf(IdentityException.class);
        var second=login(account);
        db.update("UPDATE identity.auth_sessions SET created_at=now()-interval '31 days',expires_at=now()-interval '1 day' WHERE session_id=?::uuid",jwt(second).getClaimAsString("sid"));
        assertThatThrownBy(() -> auth.refresh((String)second.get("refresh_token"))).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> profiles.profile(jwt(second))).isInstanceOf(IdentityException.class);
    }
    @Test void mailRetriesAreBoundedAndQueueDoesNotStoreRawToken() {
        var account=pending(email());
        String encrypted=db.queryForObject("SELECT encrypted_message FROM identity.account_mail_jobs WHERE user_id=?",String.class,account.user());
        assertThat(encrypted).doesNotContain("VERIFY_EMAIL",account.email());
        doAnswer(invocation -> { throw new org.springframework.mail.MailSendException("timeout"); }).when(sender).send(any(SimpleMailMessage.class));
        mail.deliver();
        assertThat(db.queryForObject("SELECT attempts FROM identity.account_mail_jobs WHERE user_id=?",Integer.class,account.user())).isEqualTo(1);
        assertThat(db.queryForObject("SELECT available_at>now() FROM identity.account_mail_jobs WHERE user_id=?",Boolean.class,account.user())).isTrue();
        db.update("UPDATE identity.account_mail_jobs SET attempts=7,available_at=now() WHERE user_id=?",account.user());
        mail.deliver();
        assertThat(db.queryForObject("SELECT failed_at IS NOT NULL FROM identity.account_mail_jobs WHERE user_id=?",Boolean.class,account.user())).isTrue();
    }
}
