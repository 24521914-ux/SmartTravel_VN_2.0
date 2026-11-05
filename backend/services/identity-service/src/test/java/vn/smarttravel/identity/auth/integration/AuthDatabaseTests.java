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
        properties={"identity.email-verification.required=true", "security.jwt.issuer=identity-test", "identity.mail.poll-ms=3600000", "management.health.mail.enabled=false",
                "identity.fixtures.enabled=true", "identity.fixtures.password=synthetic-fixture-password-123",
                "identity.notifications.email-enabled=true", "identity.notifications.poll-ms=3600000",
                "identity.gateway-exchange-secret=p02-test-gateway-credential-32-bytes"})
@ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named="IDENTITY_DB_TESTS", matches="true")
class AuthDatabaseTests {
    @Test void realSignedTokenExchangesAcrossSixServicesAndRevocationFailsClosed() throws Exception {
        var owner=active(); var pair=login(owner);
        String original=(String)pair.get("access_token");
        var headers=new HttpHeaders(); headers.setBearerAuth(original);
        headers.set("X-Gateway-Credential","p02-test-gateway-credential-32-bytes");
        for(String target:java.util.List.of("identity","catalog","community","trip","ingestion","intelligence")) {
            var response=http.exchange("/internal/v1/security/exchange",HttpMethod.POST,new HttpEntity<>(Map.of("audience",target),headers),Map.class);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
            String scoped=(String)response.getBody().get("access_token");
            assertThat(scoped.length()).isLessThanOrEqualTo(1024);
            var claims=decoder.decode(scoped);
            assertThat(claims.getSubject()).isEqualTo(owner.user().toString());
            assertThat(claims.getClaimAsString("sid")).isEqualTo(jwt(pair).getClaimAsString("sid"));
            assertThat(claims.getClaimAsString("scope")).isEqualTo(target+":read "+target+":write");
            var scopedHeaders=new HttpHeaders(); scopedHeaders.setBearerAuth(scoped);
            assertThat(http.exchange("/internal/v1/security/session",HttpMethod.POST,new HttpEntity<>(null,scopedHeaders),Map.class).getStatusCode()).isEqualTo(HttpStatus.OK);
        }
        var badHeaders=new HttpHeaders(); badHeaders.setBearerAuth(original);
        assertThat(http.exchange("/internal/v1/security/exchange",HttpMethod.POST,new HttpEntity<>(Map.of("audience","trip"),badHeaders),Map.class).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        auth.logout(jwt(pair),(String)pair.get("refresh_token"));
        assertThat(http.exchange("/internal/v1/security/session",HttpMethod.POST,new HttpEntity<>(null,headers),Map.class).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(http.exchange("/internal/v1/security/exchange",HttpMethod.POST,new HttpEntity<>(Map.of("audience","trip"),headers),Map.class).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test void snapshotCursorDetectsConcurrentChangesAndHumanCannotReadSnapshot() throws Exception {
        var owner=active(); active();
        var headers=new HttpHeaders(); headers.setBearerAuth(workloadToken());
        var page=http.exchange("/internal/v1/users/preferences/snapshot?limit=1",HttpMethod.GET,new HttpEntity<>(null,headers),Map.class);
        assertThat(page.getStatusCode()).isEqualTo(HttpStatus.OK);
        String cursor=(String)page.getBody().get("next_cursor"); assertThat(cursor).isNotBlank();
        String watermark=(String)page.getBody().get("watermark");
        var next=http.exchange("/internal/v1/users/preferences/snapshot?limit=1&cursor="+cursor,HttpMethod.GET,new HttpEntity<>(null,headers),Map.class);
        assertThat(next.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(next.getBody().get("watermark")).isEqualTo(watermark);
        db.update("UPDATE identity.user_preferences SET version=version+1 WHERE user_id=?",owner.user());
        assertThat(http.exchange("/internal/v1/users/preferences/snapshot?limit=1&cursor="+cursor,HttpMethod.GET,new HttpEntity<>(null,headers),Map.class).getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        headers.setBearerAuth((String)login(owner).get("access_token"));
        assertThat(http.exchange("/internal/v1/users/preferences/snapshot",HttpMethod.GET,new HttpEntity<>(null,headers),Map.class).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }
    @TestConfiguration
    static class LocalDecoder {
        @Bean @Primary JwtDecoder testDecoder(IssuerKeys keys) throws Exception {
            var decoder = NimbusJwtDecoder.withPublicKey(keys.verificationKey().toRSAPublicKey()).build();
            decoder.setJwtValidator(new org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator<>(
                    JwtValidators.createDefaultWithIssuer("identity-test"), SecurityConfiguration.audienceValidator("identity")));
            return decoder;
        }
    }
    @Autowired vn.smarttravel.identity.admin.service.AdminUserService admins;
    @Autowired vn.smarttravel.identity.internal.service.UserBatchService batches;
    @Autowired vn.smarttravel.identity.preferences.service.PreferenceService preferences;
    @Autowired com.fasterxml.jackson.databind.ObjectMapper json;
    @MockitoBean vn.smarttravel.identity.preferences.client.CategoryClient categories;
    @Autowired vn.smarttravel.identity.preferences.service.CategoryInvalidationConsumer categoryInvalidations;
    @Autowired vn.smarttravel.identity.notifications.service.NotificationEmailWorker notificationEmail;
    @Autowired vn.smarttravel.identity.deletion.service.DeletionService deletions;
    @Autowired vn.smarttravel.identity.deletion.service.DeletionAckConsumer deletionAcks;
    @Autowired vn.smarttravel.identity.notifications.service.NotificationConsumer notificationConsumer;
    @Autowired vn.smarttravel.identity.notifications.service.NotificationService notifications;
    @Autowired org.springframework.transaction.support.TransactionTemplate transactions;
    @Autowired IssuerKeys issuer;
    @Autowired vn.smarttravel.identity.infrastructure.persistence.service.IdentityRetentionWorker retention;
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
    void assertFrozenSchema(String file, com.fasterxml.jackson.databind.JsonNode value) throws Exception {
        java.nio.file.Path root=java.nio.file.Path.of("").toAbsolutePath();
        while(root!=null && !java.nio.file.Files.isDirectory(root.resolve("backend/contracts"))) root=root.getParent();
        assertThat(root).isNotNull();
        var schema=json.readTree(root.resolve("backend/contracts/"+file).toFile());
        var factory=com.networknt.schema.JsonSchemaFactory.getInstance(com.networknt.schema.SpecVersion.VersionFlag.V202012);
        assertThat(factory.getSchema(schema).validate(value)).isEmpty();
    }
    ResponseEntity<Map> provider(java.util.Set<String> covered, String route, HttpMethod method, String actualPath,
                                 Object body, String token, int expected, String... headers) throws Exception {
        var response=api(method,actualPath,body,token,headers);
        assertThat(response.getStatusCode().value()).as(method+" "+actualPath).isEqualTo(expected);
        var operation=json.readTree(findContract("openapi/identity.yaml").toFile()).path("paths").path(route).path(method.name().toLowerCase());
        assertThat(operation.isMissingNode()).isFalse();
        var schema=operation.path("responses").path(Integer.toString(expected)).path("content").path("application/json").path("schema");
        if(!schema.isMissingNode()) {
            var factory=com.networknt.schema.JsonSchemaFactory.getInstance(com.networknt.schema.SpecVersion.VersionFlag.V202012);
            assertThat(factory.getSchema(schema).validate(json.valueToTree(response.getBody()))).as(route).isEmpty();
        } else assertThat(response.getBody()).isNull();
        covered.add(method.name()+" "+route); return response;
    }
    String workloadToken() throws Exception {
        var key=(com.nimbusds.jose.jwk.RSAKey)org.springframework.test.util.ReflectionTestUtils.getField(issuer,"active");
        var now=java.time.Instant.now();
        var claims=new com.nimbusds.jwt.JWTClaimsSet.Builder().issuer("identity-test").subject("provider-fixture").audience("identity")
                .issueTime(java.util.Date.from(now)).expirationTime(java.util.Date.from(now.plusSeconds(120)))
                .claim("client_id","provider-fixture").claim("scope","identity:status:read identity:preferences:read identity:deletion:read").build();
        var value=new com.nimbusds.jwt.SignedJWT(new com.nimbusds.jose.JWSHeader.Builder(com.nimbusds.jose.JWSAlgorithm.RS256).keyID(key.getKeyID()).build(),claims);
        value.sign(new com.nimbusds.jose.crypto.RSASSASigner(key)); return value.serialize();
    }
    @Test void all26CandidateOperationsHaveRealHttpProviderResponses() throws Exception {
        var covered=new java.util.HashSet<String>(); String email=email();
        provider(covered,"/api/v1/auth/register",HttpMethod.POST,"/api/v1/auth/register",Map.of("email",email,"password",PASSWORD,"display_name","Provider test"),null,202,"Idempotency-Key",UUID.randomUUID().toString());
        provider(covered,"/api/v1/auth/resend-verification",HttpMethod.POST,"/api/v1/auth/resend-verification",Map.of("email",email),null,202);
        mail.deliver();
        provider(covered,"/api/v1/auth/verify-email",HttpMethod.POST,"/api/v1/auth/verify-email",Map.of("token",delivered.get(email).split("\n")[1]),null,202);
        var pair=provider(covered,"/api/v1/auth/login",HttpMethod.POST,"/api/v1/auth/login",Map.of("email",email,"password",PASSWORD),null,200).getBody();
        String token=(String)pair.get("access_token");
        provider(covered,"/.well-known/jwks.json",HttpMethod.GET,"/.well-known/jwks.json",null,null,200);
        var profile=provider(covered,"/api/v1/me",HttpMethod.GET,"/api/v1/me",null,token,200).getBody(); UUID user=UUID.fromString((String)profile.get("user_id"));
        provider(covered,"/api/v1/me",HttpMethod.PATCH,"/api/v1/me",Map.of("display_name","Updated provider"),token,200,"If-Match","\"2\"");
        String changed=PASSWORD+"-changed";
        provider(covered,"/api/v1/me/password",HttpMethod.PUT,"/api/v1/me/password",Map.of("current_password",PASSWORD,"new_password",changed),token,204);
        provider(covered,"/api/v1/auth/forgot-password",HttpMethod.POST,"/api/v1/auth/forgot-password",Map.of("email",email),null,202); mail.deliver();
        provider(covered,"/api/v1/auth/reset-password",HttpMethod.POST,"/api/v1/auth/reset-password",Map.of("token",delivered.get(email).split("\n")[1],"password",PASSWORD),null,202);
        pair=provider(covered,"/api/v1/auth/login",HttpMethod.POST,"/api/v1/auth/login",Map.of("email",email,"password",PASSWORD),null,200).getBody(); token=(String)pair.get("access_token");
        provider(covered,"/api/v1/me/sessions",HttpMethod.GET,"/api/v1/me/sessions",null,token,200);
        var spare=auth.login(email,PASSWORD); UUID session=UUID.fromString(jwt(spare).getClaimAsString("sid"));
        provider(covered,"/api/v1/me/sessions/{session_id}",HttpMethod.DELETE,"/api/v1/me/sessions/"+session,null,token,204);
        pair=provider(covered,"/api/v1/auth/refresh",HttpMethod.POST,"/api/v1/auth/refresh",Map.of("refresh_token",pair.get("refresh_token")),null,200).getBody();
        provider(covered,"/api/v1/auth/logout",HttpMethod.POST,"/api/v1/auth/logout",Map.of("refresh_token",pair.get("refresh_token")),(String)pair.get("access_token"),204);
        pair=auth.login(email,PASSWORD); token=(String)pair.get("access_token");
        provider(covered,"/api/v1/preference-options",HttpMethod.GET,"/api/v1/preference-options",null,null,200);
        provider(covered,"/api/v1/me/preferences",HttpMethod.GET,"/api/v1/me/preferences",null,token,200);
        provider(covered,"/api/v1/me/preferences",HttpMethod.PUT,"/api/v1/me/preferences",Map.of("personalization_enabled",true,"consent_version",1),token,200,"If-Match","\"1\"","Idempotency-Key","consent");
        notificationConsumer.accept(tripEvent(user,UUID.randomUUID(),1));
        provider(covered,"/api/v1/me/notifications",HttpMethod.GET,"/api/v1/me/notifications",null,token,200);
        UUID notification=db.queryForObject("SELECT notification_id FROM identity.notifications WHERE user_id=?",UUID.class,user);
        provider(covered,"/api/v1/me/notifications/{notification_id}/read",HttpMethod.PATCH,"/api/v1/me/notifications/"+notification+"/read",null,token,200,"Idempotency-Key","read");
        var admin=active(); db.update("INSERT INTO identity.user_roles(user_id,role_code) VALUES (?,'ADMIN')",admin.user()); String adminToken=(String)login(admin).get("access_token");
        var target=active();
        provider(covered,"/api/v1/admin/users",HttpMethod.GET,"/api/v1/admin/users",null,adminToken,200);
        provider(covered,"/api/v1/admin/users/{user_id}/roles",HttpMethod.PUT,"/api/v1/admin/users/"+target.user()+"/roles",Map.of("roles",java.util.List.of("USER","BUSINESS")),adminToken,200,"If-Match","\"2\"");
        provider(covered,"/api/v1/admin/users/{user_id}/status",HttpMethod.PATCH,"/api/v1/admin/users/"+target.user()+"/status",Map.of("status","DISABLED"),adminToken,200,"If-Match","\"3\"");
        String workload=workloadToken();
        provider(covered,"/internal/v1/users/status/batch",HttpMethod.POST,"/internal/v1/users/status/batch",Map.of("ids",java.util.List.of(user)),workload,200);
        provider(covered,"/internal/v1/users/preferences/batch",HttpMethod.POST,"/internal/v1/users/preferences/batch",Map.of("ids",java.util.List.of(user)),workload,200);
        var deletion=provider(covered,"/api/v1/me/deletion-requests",HttpMethod.POST,"/api/v1/me/deletion-requests",Map.of("policy_version",1),token,202,"Idempotency-Key","delete").getBody();
        provider(covered,"/internal/v1/deletion-requests/{request_id}",HttpMethod.GET,"/internal/v1/deletion-requests/"+deletion.get("request_id"),null,workload,200);
        assertThat(covered).hasSize(26);
        var expected=new java.util.HashSet<String>(); var paths=json.readTree(findContract("openapi/identity.yaml").toFile()).path("paths");
        paths.fields().forEachRemaining(entry -> entry.getValue().fields().forEachRemaining(method -> expected.add(method.getKey().toUpperCase()+" "+entry.getKey())));
        assertThat(covered).containsExactlyInAnyOrderElementsOf(expected);
    }
    @Test void retentionKeepsPendingEventsAndFailedDeliveryEvidence() {
        var owner=active(); UUID pending=UUID.randomUUID(),published=UUID.randomUUID(),inbox=UUID.randomUUID();
        for(UUID event:java.util.List.of(pending,published)) db.update("INSERT INTO identity.outbox_events(event_id,aggregate_type,aggregate_id,aggregate_version,event_type,payload,occurred_at) VALUES (?,'user',?,1,'identity.user.status-changed.v1','{}','2000-01-01')",event,owner.user().toString());
        db.update("UPDATE identity.outbox_events SET published_at='2000-01-01' WHERE event_id=?",published);
        db.update("INSERT INTO identity.inbox_events(consumer_name,event_id,processed_at) VALUES ('retention-probe',?,'2000-01-01')",inbox);
        retention.cleanup();
        assertThat(db.queryForObject("SELECT count(*) FROM identity.outbox_events WHERE event_id=?",Integer.class,pending)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM identity.outbox_events WHERE event_id=?",Integer.class,published)).isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM identity.inbox_events WHERE event_id=?",Integer.class,inbox)).isZero();
        assertThat(profiles.profile(jwt(login(owner))).get("status")).isEqualTo("ACTIVE");
        db.update("DELETE FROM identity.outbox_events WHERE event_id=?",pending);
    }
    @Test void retentionPreservesOldFailedNotificationForOperationalReview() {
        var owner=active();
        notificationConsumer.accept(tripEvent(owner.user(),UUID.randomUUID(),1));
        UUID notification=db.queryForObject("SELECT notification_id FROM identity.notifications WHERE user_id=?",UUID.class,owner.user());
        db.update("UPDATE identity.notifications SET created_at='2000-01-01' WHERE notification_id=?",notification);
        db.update("UPDATE identity.notification_deliveries SET status='FAILED' WHERE notification_id=?",notification);
        retention.cleanup();
        assertThat(db.queryForObject("SELECT count(*) FROM identity.notifications WHERE notification_id=?",Integer.class,notification)).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM identity.notification_deliveries WHERE notification_id=? AND status='FAILED'",Integer.class,notification)).isGreaterThan(0);
    }
    com.fasterxml.jackson.databind.node.ObjectNode tripEvent(UUID user, UUID trip, long version) {
        var event=json.createObjectNode();
        event.put("event_id",UUID.randomUUID().toString()); event.put("event_type","trip.changed.v1");
        event.put("schema_version",1); event.put("aggregate_type","trip"); event.put("aggregate_id",trip.toString());
        event.put("aggregate_version",version); event.put("occurred_at",java.time.Instant.now().toString());
        event.put("producer","trip"); event.put("correlation_id",UUID.randomUUID().toString()); event.putNull("causation_id");
        event.put("traceparent","00-0123456789abcdef0123456789abcdef-0123456789abcdef-01");
        event.putObject("payload").put("trip_id",trip.toString()).put("user_id",user.toString()).put("change_kind","UPDATED").put("version",version);
        return event;
    }
    com.fasterxml.jackson.databind.node.ObjectNode deletionAck(UUID request, String service, String state, long version) {
        var event=tripEvent(UUID.randomUUID(),request,version);
        event.put("event_type","domain.user-data-deleted.v1"); event.put("aggregate_type","deletion"); event.put("producer",service);
        var payload=event.putObject("payload"); payload.put("deletion_request_id",request.toString());
        payload.put("service",service); payload.put("status",state); payload.put("artifact_handling","synthetic test artifacts erased");
        return event;
    }
    @Test void deletionRevokesAndTombstonesAtomicallyButRequiresAllSixAcknowledgements() throws Exception {
        var owner=active(); var pair=login(owner); login(owner);
        notificationConsumer.accept(tripEvent(owner.user(),UUID.randomUUID(),1));
        var token=(String)pair.get("access_token"); var principal=jwt(pair); var body=Map.of("policy_version",1);
        var response=api(HttpMethod.POST,"/api/v1/me/deletion-requests",body,token,"Idempotency-Key","delete");
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        UUID request=UUID.fromString((String)response.getBody().get("request_id"));
        assertThat(response.getBody().get("status")).isEqualTo("ACCEPTED");
        assertThat(api(HttpMethod.POST,"/api/v1/me/deletion-requests",body,token,"Idempotency-Key","delete").getBody()).isEqualTo(response.getBody());
        assertThat(api(HttpMethod.POST,"/api/v1/me/deletion-requests",body,token,"Idempotency-Key","new-delete").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThatThrownBy(() -> profiles.profile(principal)).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> auth.refresh((String)pair.get("refresh_token"))).isInstanceOf(IdentityException.class);
        var account=db.queryForMap("SELECT email,password_hash,status,deleted_at FROM identity.users WHERE user_id=?",owner.user());
        assertThat(account.get("status")).isEqualTo("DELETED"); assertThat(account.get("email")).isNotEqualTo(owner.email());
        assertThat(account.get("password_hash")).isEqualTo("!"); assertThat(account.get("deleted_at")).isNotNull();
        assertThat(db.queryForObject("SELECT count(*) FROM identity.auth_sessions WHERE user_id=? AND revoked_at IS NULL",Integer.class,owner.user())).isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM identity.notifications WHERE user_id=?",Integer.class,owner.user())).isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM identity.account_mail_jobs WHERE user_id=?",Integer.class,owner.user())).isZero();
        assertThat(db.queryForObject("SELECT personalization_enabled FROM identity.user_preferences WHERE user_id=?",Boolean.class,owner.user())).isFalse();
        assertThat(db.queryForObject("SELECT count(*) FROM identity.data_deletion_acks WHERE deletion_request_id=?",Integer.class,request)).isEqualTo(6);
        var event=json.readTree(db.queryForObject("SELECT payload::text FROM identity.outbox_events WHERE aggregate_id=? AND event_type='identity.user.deletion-requested.v1'",String.class,request.toString()));
        assertFrozenSchema("events/identity.user.deletion-requested.v1.schema.json",event);
        assertFrozenSchema("events/identity.preferences.changed.v1.schema.json",json.readTree(db.queryForObject("SELECT payload::text FROM identity.outbox_events WHERE aggregate_id=? AND event_type='identity.preferences.changed.v1' ORDER BY aggregate_version DESC LIMIT 1",String.class,owner.user().toString())));
        Jwt workload=Jwt.withTokenValue("workload").header("alg","RS256").subject("fixture").claim("client_id","fixture").build();
        assertThatThrownBy(() -> deletions.status(principal,request)).isInstanceOf(IdentityException.class);
        for(String service:java.util.List.of("catalog","community","trip","ingestion")) {
            var ack=deletionAck(request,service,"COMPLETED",1); deletionAcks.accept(ack); deletionAcks.accept(ack);
        }
        assertThat(deletions.status(workload,request).get("status")).isEqualTo("PENDING");
        assertThat(db.queryForObject("SELECT completed_at FROM identity.data_deletion_requests WHERE deletion_request_id=?",java.sql.Timestamp.class,request)).isNull();
        deletionAcks.accept(deletionAck(request,"intelligence","FAILED",2));
        deletionAcks.accept(deletionAck(request,"intelligence","COMPLETED",1)); // stale success cannot overwrite a newer failure
        assertThat(db.queryForObject("SELECT status FROM identity.data_deletion_requests WHERE deletion_request_id=?",String.class,request)).isEqualTo("FAILED");
        deletionAcks.accept(deletionAck(request,"intelligence","COMPLETED",3));
        assertThat(deletions.status(workload,request).get("status")).isEqualTo("COMPLETED");
        assertThat(db.queryForObject("SELECT completed_at FROM identity.data_deletion_requests WHERE deletion_request_id=?",java.sql.Timestamp.class,request)).isNotNull();
        deletionAcks.accept(deletionAck(request,"trip","FAILED",4)); // completion is terminal
        assertThat(deletions.status(workload,request).get("status")).isEqualTo("COMPLETED");
        var schema=json.readTree(findContract("openapi/identity.yaml").toFile()).path("paths").path("/internal/v1/deletion-requests/{request_id}").path("get").path("responses").path("200").path("content").path("application/json").path("schema");
        assertThat(com.networknt.schema.JsonSchemaFactory.getInstance(com.networknt.schema.SpecVersion.VersionFlag.V202012).getSchema(schema).validate(json.valueToTree(deletions.status(workload,request)))).isEmpty();
    }
    @Test void deletionConsumerRollbackUnknownRequestAndForgedProducerDoNotSaveInbox() {
        var owner=active(); var pair=login(owner);
        var response=deletions.request(jwt(pair),json.valueToTree(Map.of("policy_version",1)),"delete");
        UUID request=(UUID)response.get("request_id"); var ack=deletionAck(request,"catalog","COMPLETED",1);
        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            deletionAcks.accept(ack); throw new IllegalStateException("simulated crash");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(db.queryForObject("SELECT status FROM identity.data_deletion_acks WHERE deletion_request_id=? AND service_name='catalog'",String.class,request)).isEqualTo("PENDING");
        UUID event=UUID.fromString(ack.get("event_id").asText());
        assertThat(db.queryForObject("SELECT count(*) FROM identity.inbox_events WHERE event_id=?",Integer.class,event)).isZero();
        ack.put("producer","trip");
        assertThatThrownBy(() -> deletionAcks.accept(ack)).isInstanceOf(IllegalArgumentException.class);
        var unknown=deletionAck(UUID.randomUUID(),"trip","COMPLETED",1);
        assertThatThrownBy(() -> deletionAcks.accept(unknown)).isInstanceOf(IllegalArgumentException.class);
        assertThat(db.queryForObject("SELECT count(*) FROM identity.inbox_events WHERE event_id=?",Integer.class,UUID.fromString(unknown.get("event_id").asText()))).isZero();
    }
    @Test void deletionInvalidPolicyOrCrashDoesNotRevokeOrEraseAccount() {
        var owner=active(); var pair=login(owner); var principal=jwt(pair);
        for(Object body:java.util.List.of(Map.of("policy_version",2),Map.of("policy_version",1.5),Map.of("policy_version",1,"roles",java.util.List.of("ADMIN"))))
            assertThatThrownBy(() -> deletions.request(principal,json.valueToTree(body),"delete")).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            deletions.request(principal,json.valueToTree(Map.of("policy_version",1)),"delete"); throw new IllegalStateException("simulated failure");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(profiles.profile(principal).get("status")).isEqualTo("ACTIVE");
        assertThat(db.queryForObject("SELECT count(*) FROM identity.data_deletion_requests WHERE user_id=?",Integer.class,owner.user())).isZero();
        assertThat(db.queryForObject("SELECT email FROM identity.users WHERE user_id=?",String.class,owner.user())).isEqualTo(owner.email());
    }
    @Test void notificationEmailDedupRetryExhaustionAndInactiveRecipientArePersisted() {
        var owner=active(); var event=tripEvent(owner.user(),UUID.randomUUID(),1);
        org.mockito.Mockito.clearInvocations(sender);
        notificationConsumer.accept(event); notificationConsumer.accept(event); notificationEmail.deliver(); notificationEmail.deliver();
        org.mockito.Mockito.verify(sender,org.mockito.Mockito.times(1)).send(org.mockito.ArgumentMatchers.argThat((SimpleMailMessage message) -> owner.email().equals(message.getTo()[0])));
        assertThat(db.queryForObject("SELECT count(*) FROM identity.notification_deliveries d JOIN identity.notifications n USING(notification_id) WHERE n.user_id=? AND channel='EMAIL' AND d.status='SENT'",Integer.class,owner.user())).isEqualTo(1);
        notificationConsumer.accept(tripEvent(owner.user(),UUID.randomUUID(),1));
        org.mockito.Mockito.doThrow(new org.springframework.mail.MailSendException("synthetic provider failure")).when(sender).send(any(SimpleMailMessage.class));
        for(int i=0;i<5;i++) {
            db.update("UPDATE identity.notification_deliveries d SET next_attempt_at=now() FROM identity.notifications n WHERE n.notification_id=d.notification_id AND n.user_id=? AND channel='EMAIL' AND d.status='PENDING'",owner.user());
            notificationEmail.deliver();
        }
        assertThat(db.queryForObject("SELECT count(*) FROM identity.notification_deliveries d JOIN identity.notifications n USING(notification_id) WHERE n.user_id=? AND channel='EMAIL' AND d.status='FAILED' AND attempts=5",Integer.class,owner.user())).isEqualTo(1);
        notificationConsumer.accept(tripEvent(owner.user(),UUID.randomUUID(),1));
        db.update("UPDATE identity.users SET status='SUSPENDED' WHERE user_id=?",owner.user());
        org.mockito.Mockito.clearInvocations(sender); notificationEmail.deliver();
        org.mockito.Mockito.verify(sender,org.mockito.Mockito.never()).send(org.mockito.ArgumentMatchers.argThat((SimpleMailMessage message) -> owner.email().equals(message.getTo()[0])));
    }
    @Test void categoryInvalidationIsAtomicVersionedAndDoesNotResurrectSelection() throws Exception {
        var owner=active(); UUID category=UUID.randomUUID(); var principal=jwt(login(owner));
        db.update("INSERT INTO identity.user_category_preferences(user_id,category_id) VALUES (?,?)",owner.user(),category);
        var event=(com.fasterxml.jackson.databind.node.ObjectNode)json.readTree(findContract("fixtures/events/catalog.category.changed.v1.json").toFile());
        event.put("event_id",UUID.randomUUID().toString()); event.put("aggregate_id",category.toString()); event.put("aggregate_version",2);
        var payload=(com.fasterxml.jackson.databind.node.ObjectNode)event.get("payload"); payload.put("category_id",category.toString()).put("version",2).put("active",false);
        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            categoryInvalidations.accept(event); throw new IllegalStateException("crash");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(preferences.get(principal).get("category_ids")).isEqualTo(java.util.List.of(category));
        categoryInvalidations.accept(event); categoryInvalidations.accept(event);
        assertThat(preferences.get(principal).get("category_ids")).isEqualTo(java.util.List.of());
        assertThat(preferences.get(principal).get("version")).isEqualTo(2L);
        assertThat(preferences.get(principal).get("consent_version")).isEqualTo(1L);
        assertThatThrownBy(() -> preferences.update(principal,json.valueToTree(Map.of("category_ids",java.util.List.of(category))),2,"reselect")).isInstanceOf(IdentityException.class);
        var stale=event.deepCopy(); stale.put("event_id",UUID.randomUUID().toString()).put("aggregate_version",1);
        stale.withObject("/payload").put("version",1).put("active",true); categoryInvalidations.accept(stale);
        assertThat(db.queryForObject("SELECT active FROM identity.category_states WHERE category_id=?",Boolean.class,category)).isFalse();
        var fresh=stale.deepCopy(); fresh.put("event_id",UUID.randomUUID().toString()).put("aggregate_version",3);
        fresh.withObject("/payload").put("version",3); categoryInvalidations.accept(fresh);
        assertThat(preferences.get(principal).get("category_ids")).isEqualTo(java.util.List.of());
        assertThat(db.queryForObject("SELECT count(*) FROM identity.outbox_events WHERE aggregate_id=? AND event_type='identity.preferences.changed.v1'",Integer.class,owner.user().toString())).isEqualTo(1);
    }
    @Test void notificationFrozenCatalogAndCommunityFixturesUseAllowlistedTemplates() throws Exception {
        var owner=active();
        for(String type:java.util.List.of("catalog.business-claim.reviewed.v1","community.review.changed.v1")) {
            var event=(com.fasterxml.jackson.databind.node.ObjectNode)json.readTree(findContract("fixtures/events/"+type+".json").toFile());
            var payload=(com.fasterxml.jackson.databind.node.ObjectNode)event.get("payload");
            event.put("event_id",UUID.randomUUID().toString());
            payload.put(type.startsWith("catalog")?"owner_user_id":"user_id",owner.user().toString());
            // Candidate Community sample uses a generic envelope ID; preserve frozen artifact, align this test instance.
            event.put("aggregate_id",payload.get(type.startsWith("catalog")?"claim_id":"review_id").asText());
            notificationConsumer.accept(event); notificationConsumer.accept(event);
        }
        assertThat(db.queryForObject("SELECT count(*) FROM identity.notifications WHERE user_id=?",Integer.class,owner.user())).isEqualTo(2);
        var payloads=db.queryForList("SELECT payload::text FROM identity.notifications WHERE user_id=?",String.class,owner.user());
        for(var value:payloads) assertThat(json.readTree(value).size()).isEqualTo(2); // title + object reference only
    }
    @Test void concurrentNotificationDeliveryAndDeletionAcknowledgementsAreSerialized() throws Exception {
        var owner=active(); var pair=login(owner);
        var event=tripEvent(owner.user(),UUID.randomUUID(),1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            var first=pool.submit(() -> notificationConsumer.accept(event));
            var second=pool.submit(() -> notificationConsumer.accept(event)); first.get(); second.get();
        }
        assertThat(db.queryForObject("SELECT count(*) FROM identity.notifications WHERE user_id=?",Integer.class,owner.user())).isEqualTo(1);
        var response=deletions.request(jwt(pair),json.valueToTree(Map.of("policy_version",1)),"delete");
        UUID request=(UUID)response.get("request_id");
        try(var pool=Executors.newFixedThreadPool(5)) {
            var futures=new java.util.ArrayList<java.util.concurrent.Future<?>>();
            for(String service:java.util.List.of("catalog","community","trip","ingestion","intelligence"))
                futures.add(pool.submit(() -> deletionAcks.accept(deletionAck(request,service,"COMPLETED",1))));
            for(var future:futures) future.get();
        }
        assertThat(db.queryForObject("SELECT status FROM identity.data_deletion_requests WHERE deletion_request_id=?",String.class,request)).isEqualTo("COMPLETED");
        assertThat(db.queryForObject("SELECT count(*) FROM identity.data_deletion_acks WHERE deletion_request_id=? AND status='COMPLETED'",Integer.class,request)).isEqualTo(6);
    }
    @Test void notificationInboxAndInAppDeliveryDedupAndRollbackAreAtomic() {
        var account=active(); UUID trip=UUID.randomUUID(); var event=tripEvent(account.user(),trip,2);
        assertThatThrownBy(() -> transactions.executeWithoutResult(status -> {
            notificationConsumer.accept(event); throw new IllegalStateException("simulated consumer crash");
        })).isInstanceOf(IllegalStateException.class);
        assertThat(db.queryForObject("SELECT count(*) FROM identity.inbox_events WHERE event_id=?",Integer.class,UUID.fromString(event.get("event_id").asText()))).isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM identity.notifications WHERE user_id=?",Integer.class,account.user())).isZero();
        notificationConsumer.accept(event); notificationConsumer.accept(event);
        notificationConsumer.accept(tripEvent(account.user(),trip,1));
        notificationConsumer.accept(tripEvent(account.user(),trip,2));
        assertThat(db.queryForObject("SELECT count(*) FROM identity.notifications WHERE user_id=?",Integer.class,account.user())).isEqualTo(1);
        assertThat(db.queryForObject("SELECT count(*) FROM identity.notification_deliveries d JOIN identity.notifications n USING(notification_id) WHERE user_id=? AND d.status='SENT' AND channel='IN_APP'",Integer.class,account.user())).isEqualTo(1);
    }
    @Test void notificationReadChecksOwnershipAndIdempotencyAndFrozenProviderSchemas() throws Exception {
        var owner=active(); var stranger=active();
        notificationConsumer.accept(tripEvent(owner.user(),UUID.randomUUID(),1));
        UUID id=db.queryForObject("SELECT notification_id FROM identity.notifications WHERE user_id=?",UUID.class,owner.user());
        String token=(String)login(owner).get("access_token");
        var missing=api(HttpMethod.PATCH,"/api/v1/me/notifications/"+id+"/read",null,token);
        assertThat(missing.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        var forbidden=api(HttpMethod.PATCH,"/api/v1/me/notifications/"+id+"/read",null,(String)login(stranger).get("access_token"),"Idempotency-Key","read");
        assertThat(forbidden.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        var first=api(HttpMethod.PATCH,"/api/v1/me/notifications/"+id+"/read",null,token,"Idempotency-Key","read");
        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.OK); assertThat(first.getHeaders().getETag()).isEqualTo("\"2\"");
        assertThat(api(HttpMethod.PATCH,"/api/v1/me/notifications/"+id+"/read",null,token,"Idempotency-Key","read").getBody()).isEqualTo(first.getBody());
        assertThat(api(HttpMethod.PATCH,"/api/v1/me/notifications/"+id+"/read",null,token,"Idempotency-Key","another").getBody()).isEqualTo(first.getBody());
        var list=api(HttpMethod.GET,"/api/v1/me/notifications",null,token);
        var openapi=json.readTree(findContract("openapi/identity.yaml").toFile());
        var factory=com.networknt.schema.JsonSchemaFactory.getInstance(com.networknt.schema.SpecVersion.VersionFlag.V202012);
        for(var entry:Map.of("/api/v1/me/notifications",Map.entry("get",list.getBody()),"/api/v1/me/notifications/{notification_id}/read",Map.entry("patch",first.getBody())).entrySet()) {
            var schema=openapi.path("paths").path(entry.getKey()).path(entry.getValue().getKey()).path("responses").path("200").path("content").path("application/json").path("schema");
            assertThat(factory.getSchema(schema).validate(json.valueToTree(entry.getValue().getValue()))).isEmpty();
        }
        assertThat(db.queryForObject("SELECT version FROM identity.notifications WHERE notification_id=?",Long.class,id)).isEqualTo(2);
    }
    @Test void notificationInvalidEventsDoNotConsumeInboxAndInactiveRecipientsAreIgnored() {
        var owner=active(); var bad=tripEvent(owner.user(),UUID.randomUUID(),1);
        bad.withObject("/payload").put("private_profile","must not leak");
        assertThatThrownBy(() -> notificationConsumer.accept(bad)).isInstanceOf(IllegalArgumentException.class);
        bad.withObject("/payload").remove("private_profile"); bad.put("aggregate_id",UUID.randomUUID().toString());
        assertThatThrownBy(() -> notificationConsumer.accept(bad)).isInstanceOf(IllegalArgumentException.class);
        assertThat(db.queryForObject("SELECT count(*) FROM identity.inbox_events WHERE event_id=?",Integer.class,UUID.fromString(bad.get("event_id").asText()))).isZero();
        notificationConsumer.accept(tripEvent(UUID.randomUUID(),UUID.randomUUID(),1));
        db.update("UPDATE identity.users SET status='SUSPENDED' WHERE user_id=?",owner.user());
        notificationConsumer.accept(tripEvent(owner.user(),UUID.randomUUID(),1));
        assertThat(db.queryForObject("SELECT count(*) FROM identity.notifications WHERE user_id=?",Integer.class,owner.user())).isZero();
    }
    @Test void notificationCursorIsBoundToOwnerAndHasStableInsertionCutoff() {
        var owner=active(); var principal=jwt(login(owner));
        for(int i=0;i<3;i++) notificationConsumer.accept(tripEvent(owner.user(),UUID.randomUUID(),1));
        var first=notifications.list(principal,null,1); String cursor=(String)first.get("next_cursor");
        assertThat(cursor).isNotNull();
        notificationConsumer.accept(tripEvent(owner.user(),UUID.randomUUID(),1));
        var second=notifications.list(principal,cursor,1);
        var third=notifications.list(principal,(String)second.get("next_cursor"),1);
        assertThat(third.get("next_cursor")).isNull();
        assertThatThrownBy(() -> notifications.list(jwt(login(active())),cursor,1)).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> notifications.list(principal,cursor,2)).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> notifications.list(principal,null,101)).isInstanceOf(IdentityException.class);
    }
    @Test void adminStatusAndRoleUpdatesRecheckPrivilegesAndRevokeAllSessionFamilies() throws Exception {
        var admin=active(); db.update("INSERT INTO identity.user_roles(user_id,role_code) VALUES (?,'ADMIN')",admin.user());
        var adminPair=login(admin); var principal=jwt(adminPair); String token=(String)adminPair.get("access_token");
        var target=active(); var pair=login(target); login(target);
        var disabled=api(HttpMethod.PATCH,"/api/v1/admin/users/"+target.user()+"/status",Map.of("status","DISABLED"),token,"If-Match","\"2\"");
        assertThat(disabled.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(disabled.getHeaders().getETag()).isEqualTo("\"3\"");
        assertThat(disabled.getBody().get("status")).isEqualTo("DISABLED");
        assertThatThrownBy(() -> profiles.profile(jwt(pair))).isInstanceOf(IdentityException.class);
        assertThatThrownBy(() -> auth.refresh((String)pair.get("refresh_token"))).isInstanceOf(IdentityException.class);
        assertThat(db.queryForObject("SELECT count(*) FROM identity.auth_sessions WHERE user_id=? AND revoked_at IS NULL",Integer.class,target.user())).isZero();
        assertFrozenSchema("events/identity.user.status-changed.v1.schema.json",json.readTree(db.queryForObject("SELECT payload::text FROM identity.outbox_events WHERE aggregate_id=? AND event_type='identity.user.status-changed.v1' AND aggregate_version=3",String.class,target.user().toString())));
        admins.status(principal,target.user(),json.readTree("{\"status\":\"ACTIVE\"}"),3);
        var reactivated=login(target);
        var roles=admins.roles(principal,target.user(),json.readTree("{\"roles\":[\"USER\",\"BUSINESS\"]}"),4);
        assertThat(roles.get("roles")).isEqualTo(java.util.List.of("BUSINESS","USER"));
        assertThatThrownBy(() -> profiles.profile(jwt(reactivated))).isInstanceOf(IdentityException.class);
        assertThat(api(HttpMethod.GET,"/api/v1/admin/users?limit=1",null,token).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThatThrownBy(() -> admins.roles(principal,admin.user(),json.readTree("{\"roles\":[\"USER\"]}"),2)).hasMessage("ADMIN_SELF_MUTATION_FORBIDDEN");
        // Simulate a role removal by another authorized administrator: stale JWT cannot keep privileges.
        db.update("DELETE FROM identity.user_roles WHERE user_id=? AND role_code='ADMIN'",admin.user());
        assertThat(api(HttpMethod.GET,"/api/v1/admin/users",null,token).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }
    @Test void adminCannotReviveUnverifiedDeletedOrDeletingAccounts() throws Exception {
        var admin=active(); db.update("INSERT INTO identity.user_roles(user_id,role_code) VALUES (?,'ADMIN')",admin.user());
        var principal=jwt(login(admin)); var unverified=pending(email());
        assertThatThrownBy(() -> admins.status(principal,unverified.user(),json.readTree("{\"status\":\"ACTIVE\"}"),1)).hasMessage("EMAIL_NOT_VERIFIED");
        var deleting=active();
        db.update("INSERT INTO identity.data_deletion_requests(deletion_request_id,user_id,policy_version,status) VALUES (?,?,'test','PROCESSING')",UUID.randomUUID(),deleting.user());
        assertThatThrownBy(() -> admins.status(principal,deleting.user(),json.readTree("{\"status\":\"ACTIVE\"}"),2)).hasMessage("ACCOUNT_DELETION_IN_PROGRESS");
        assertThatThrownBy(() -> admins.roles(jwt(login(active())),deleting.user(),json.readTree("{\"roles\":[\"ADMIN\"]}"),2)).hasMessage("FORBIDDEN");
    }
    @Test void workloadBatchesHaveExplicitMissingIdsAndRejectSessionPrincipals() throws Exception {
        var account=active(); UUID missing=UUID.randomUUID();
        var workload=Jwt.withTokenValue("test-workload").header("alg","RS256").subject("intelligence").claim("client_id","intelligence").build();
        var status=batches.batch(workload,java.util.List.of(account.user(),missing),false);
        assertThat(status.get("missing_ids")).isEqualTo(java.util.List.of(missing));
        var prefs=batches.batch(workload,java.util.List.of(account.user(),missing),true);
        assertThat((java.util.List<?>)prefs.get("items")).hasSize(1);
        assertThatThrownBy(() -> batches.batch(jwt(login(account)),java.util.List.of(account.user()),true)).hasMessage("WORKLOAD_IDENTITY_REQUIRED");
        assertThatThrownBy(() -> batches.batch(workload,java.util.List.of(account.user(),account.user()),false)).hasMessage("INVALID_IDS");
        var openapi=json.readTree(findContract("openapi/identity.yaml").toFile());
        var factory=com.networknt.schema.JsonSchemaFactory.getInstance(com.networknt.schema.SpecVersion.VersionFlag.V202012);
        for(var entry:Map.of("status",status,"preferences",prefs).entrySet()) {
            var schema=openapi.path("paths").path("/internal/v1/users/"+entry.getKey()+"/batch").path("post").path("responses").path("200").path("content").path("application/json").path("schema");
            assertThat(factory.getSchema(schema).validate(json.valueToTree(entry.getValue()))).isEmpty();
        }
    }
    java.nio.file.Path findContract(String file) {
        java.nio.file.Path root=java.nio.file.Path.of("").toAbsolutePath();
        while(root!=null && !java.nio.file.Files.isDirectory(root.resolve("backend/contracts"))) root=root.getParent();
        assertThat(root).isNotNull(); return root.resolve("backend/contracts/"+file);
    }
    @Test void preferencesAreAtomicVersionedAndConsentIsServerOwned() throws Exception {
        var account=active(); var pair=login(account); var principal=jwt(pair);
        var before=preferences.get(principal);
        assertThat(before.get("budget_level")).isEqualTo("MID");
        assertThat(before.get("personalization_enabled")).isEqualTo(false);
        UUID option=db.queryForObject("SELECT option_id FROM identity.preference_options WHERE kind='TRAVEL_STYLE' AND active LIMIT 1",UUID.class);
        UUID category=UUID.randomUUID();
        var patch=json.readTree(json.writeValueAsString(Map.of("category_ids",java.util.List.of(category),"travel_style_ids",java.util.List.of(option),
                "budget_level","CUSTOM","budget_min",100,"budget_max",200,"personalization_enabled",true,"consent_version",1)));
        var updated=preferences.update(principal,patch,1,"preferences-first");
        assertThat(updated.get("version")).isEqualTo(2L);
        assertThat(updated.get("consent_version")).isEqualTo(2L);
        assertThat(updated.get("personalization_enabled")).isEqualTo(true);
        var replay=preferences.update(principal,patch,1,"preferences-first");
        assertThat(json.readTree(json.writeValueAsString(replay))).isEqualTo(json.readTree(json.writeValueAsString(updated)));
        assertThatThrownBy(() -> preferences.update(principal,patch,1,"different-key")).hasMessage("VERSION_CONFLICT");
        assertThatThrownBy(() -> preferences.update(principal,json.readTree("{\"budget_level\":\"LOW\"}"),1,"preferences-first")).hasMessage("IDEMPOTENCY_CONFLICT");
        var payload=json.readTree(db.queryForObject("SELECT payload::text FROM identity.outbox_events WHERE aggregate_id=? AND event_type='identity.preferences.changed.v1'",String.class,account.user().toString()));
        assertFrozenSchema("events/identity.preferences.changed.v1.schema.json",payload);
        assertThat(payload.path("aggregate_type").asText()).isEqualTo("preferences");
        assertThat(payload.path("aggregate_version").asLong()).isEqualTo(2);
        assertThat(payload.path("payload").path("user_id").asText()).isEqualTo(account.user().toString());
        assertThat(db.queryForObject("SELECT response_status FROM identity.idempotency_records WHERE scope='preferences' AND actor_key=?",Integer.class,account.user().toString())).isEqualTo(200);
        var unchanged=preferences.update(principal,json.readTree("{\"budget_level\":\"LOW\"}"),2,"next");
        assertThat(unchanged.get("consent_version")).isEqualTo(2L);
        var revoked=preferences.update(principal,json.readTree("{\"personalization_enabled\":false,\"consent_version\":2}"),3,"revoke");
        assertThat(revoked.get("consent_version")).isEqualTo(3L);
        assertThatThrownBy(() -> preferences.update(principal,json.readTree("{\"consent_version\":99}"),4,"forged-consent")).hasMessage("CONSENT_VERSION_CONFLICT");
    }
    @Test void preferenceFailuresRollbackAllSelectionsAuditAndOutbox() throws Exception {
        var account=active(); var principal=jwt(login(account));
        UUID food=db.queryForObject("SELECT option_id FROM identity.preference_options WHERE kind='FOOD_PREFERENCE' AND active LIMIT 1",UUID.class);
        assertThatThrownBy(() -> preferences.update(principal,json.readTree("{\"travel_style_ids\":[\""+food+"\"]}"),1,"wrong-kind")).hasMessage("INVALID_PREFERENCE_OPTION");
        org.mockito.Mockito.doThrow(new IdentityException(503,"CATEGORY_VALIDATION_UNAVAILABLE")).when(categories).requireActive(any());
        assertThatThrownBy(() -> preferences.update(principal,json.readTree("{\"category_ids\":[\""+UUID.randomUUID()+"\"],\"personalization_enabled\":true}"),1,"timeout")).hasMessage("CATEGORY_VALIDATION_UNAVAILABLE");
        assertThat(preferences.get(principal).get("version")).isEqualTo(1L);
        assertThat(preferences.get(principal).get("personalization_enabled")).isEqualTo(false);
        assertThat(db.queryForObject("SELECT count(*) FROM identity.outbox_events WHERE aggregate_id=? AND event_type='identity.preferences.changed.v1'",Integer.class,account.user().toString())).isZero();
        assertThat(db.queryForObject("SELECT count(*) FROM identity.idempotency_records WHERE scope='preferences' AND actor_key=?",Integer.class,account.user().toString())).isZero();
    }
    @Test void preferenceHttpContractValidatesHeadersBodyPublicOptionsAndOwnership() {
        var account=active(); var pair=login(account); String token=(String)pair.get("access_token");
        var get=api(HttpMethod.GET,"/api/v1/me/preferences",null,token);
        assertThat(get.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(get.getHeaders().getETag()).isEqualTo("\"1\"");
        assertThat(api(HttpMethod.PUT,"/api/v1/me/preferences",Map.of("currency","VND"),token,"Idempotency-Key","x").getStatusCode()).isEqualTo(HttpStatus.PRECONDITION_REQUIRED);
        assertThat(api(HttpMethod.PUT,"/api/v1/me/preferences",Map.of("user_id",UUID.randomUUID()),token,"If-Match","\"1\"","Idempotency-Key","x").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(api(HttpMethod.PUT,"/api/v1/me/preferences",Map.of("personalization_enabled","true"),token,"If-Match","\"1\"","Idempotency-Key","x").getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(api(HttpMethod.GET,"/api/v1/preference-options?limit=1",null,null).getStatusCode()).isEqualTo(HttpStatus.OK);
        var page=api(HttpMethod.GET,"/api/v1/preference-options?limit=1",null,null).getBody();
        assertThat(page.get("next_cursor")).isNotNull();
        assertThat(api(HttpMethod.GET,"/api/v1/preference-options?limit=1&cursor="+page.get("next_cursor"),null,null).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(api(HttpMethod.GET,"/api/v1/preference-options?limit=2&cursor="+page.get("next_cursor"),null,null).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        auth.logout(jwt(pair),(String)pair.get("refresh_token"));
        assertThat(api(HttpMethod.GET,"/api/v1/me/preferences",null,token).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
    @Test void concurrentPreferenceUpdatesHaveOneWinner() throws Exception {
        var account=active(); var principal=jwt(login(account));
        var patch=json.readTree("{\"personalization_enabled\":true}");
        var ready=new CountDownLatch(2); var start=new CountDownLatch(1);
        try(var pool=Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<Boolean> attempt=() -> {
                ready.countDown(); start.await();
                try { preferences.update(principal,patch,1,UUID.randomUUID().toString()); return true; }
                catch(IdentityException e) { assertThat(e.getMessage()).isEqualTo("VERSION_CONFLICT"); return false; }
            };
            var a=pool.submit(attempt); var b=pool.submit(attempt); ready.await(); start.countDown();
            assertThat(java.util.List.of(a.get(),b.get())).containsExactlyInAnyOrder(true,false);
        }
        assertThat(preferences.get(principal).get("version")).isEqualTo(2L);
        assertThat(preferences.get(principal).get("consent_version")).isEqualTo(2L);
    }
    @Test void pendingLoginExplainsVerificationOnlyAfterPasswordMatches() {
        var account=pending(email());
        var correct=api(HttpMethod.POST,"/api/v1/auth/login",Map.of("email",account.email(),"password",PASSWORD),null);
        assertThat(correct.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(correct.getBody().get("code")).isEqualTo("EMAIL_NOT_VERIFIED");
        assertThat(api(HttpMethod.POST,"/api/v1/auth/login",Map.of("email",account.email(),"password",PASSWORD+"wrong"),null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(api(HttpMethod.POST,"/api/v1/auth/login",Map.of("email",email(),"password",PASSWORD),null).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(db.queryForObject("SELECT count(*) FROM identity.auth_sessions WHERE user_id=?",Integer.class,account.user())).isZero();
    }

    @Test void resendRecoversExpiredVerificationAndKeepsCooldownAndAccountPrivacy() {
        var account=pending(email()); mail.deliver();
        String old=delivered.get(account.email()).split("\n")[1];
        var body=Map.of("email",account.email().toUpperCase());
        assertThat(api(HttpMethod.POST,"/api/v1/auth/resend-verification",body,null).getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(db.queryForObject("SELECT count(*) FROM identity.account_tokens WHERE user_id=?",Integer.class,account.user())).isEqualTo(1);
        db.update("UPDATE identity.account_tokens SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE user_id=?",account.user());
        assertThat(api(HttpMethod.POST,"/api/v1/auth/resend-verification",body,null).getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        mail.deliver();
        String replacement=delivered.get(account.email()).split("\n")[1];
        assertThat(replacement).isNotEqualTo(old);
        assertThatThrownBy(() -> auth.consumeAccountToken(old,"VERIFY_EMAIL",null)).isInstanceOf(IdentityException.class);
        auth.consumeAccountToken(replacement,"VERIFY_EMAIL",null);
        assertThat(auth.login(account.email(),PASSWORD)).containsKey("access_token");
        int count=db.queryForObject("SELECT count(*) FROM identity.account_tokens WHERE user_id=?",Integer.class,account.user());
        var active=api(HttpMethod.POST,"/api/v1/auth/resend-verification",body,null);
        var unknown=api(HttpMethod.POST,"/api/v1/auth/resend-verification",Map.of("email",email()),null);
        assertThat(active.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(unknown.getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(active.getBody().keySet()).containsExactlyInAnyOrderElementsOf(unknown.getBody().keySet());
        assertThat(db.queryForObject("SELECT count(*) FROM identity.account_tokens WHERE user_id=?",Integer.class,account.user())).isEqualTo(count);
        assertThat(api(HttpMethod.POST,"/api/v1/auth/resend-verification",Map.of("email","invalid"),null).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test void resendVerificationIsRateLimitedForUnknownAccountsToo() {
        var body=Map.of("email",email());
        for(int i=0;i<10;i++) assertThat(api(HttpMethod.POST,"/api/v1/auth/resend-verification",body,null).getStatusCode()).isEqualTo(HttpStatus.ACCEPTED);
        assertThat(api(HttpMethod.POST,"/api/v1/auth/resend-verification",body,null).getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
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
        assertThat(api(HttpMethod.POST,"/api/v1/auth/register",Map.of("email",email,"password",PASSWORD,"display_name","x".repeat(121)),null,"Idempotency-Key",UUID.randomUUID().toString()).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
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
