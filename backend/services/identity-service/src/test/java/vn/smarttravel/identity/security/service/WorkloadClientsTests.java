package vn.smarttravel.identity.security.service;

import com.nimbusds.jwt.SignedJWT;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import vn.smarttravel.identity.shared.exception.IdentityException;
import static org.assertj.core.api.Assertions.*;

class WorkloadClientsTests {
    private static final String SECRET = "unit-test-only-workload-secret-0123456789";

    private static WorkloadClients clients() {
        var env = new MockEnvironment();
        env.setProperty("identity.workload.secrets.intelligence", SECRET);
        env.setProperty("identity.workload.secrets.trip", "too-short");
        return new WorkloadClients(env);
    }

    private static String code(Runnable call) {
        try { call.run(); } catch (IdentityException e) { return e.status() + " " + e.code(); }
        return "issued";
    }

    @Test void grantsOnlyConfiguredScopesForTheRequestedDestination() {
        var clients = clients();
        assertThat(clients.authorize("intelligence", SECRET, "catalog", null)).containsExactly("catalog:places:read");
        assertThat(clients.authorize("intelligence", SECRET, "trip", "trip:internal")).containsExactly("trip:internal");
        assertThat(code(() -> clients.authorize("intelligence", SECRET, "catalog", "catalog:places:read catalog:admin")))
                .isEqualTo("403 INVALID_SCOPE");
        assertThat(code(() -> clients.authorize("intelligence", SECRET, "intelligence", null))).isEqualTo("403 INVALID_AUDIENCE");
        assertThat(code(() -> clients.authorize("intelligence", SECRET, "unknown", null))).isEqualTo("403 INVALID_AUDIENCE");
    }

    @Test void rejectsWrongSecretUnknownClientAndClientsWithoutAStrongSecret() {
        var clients = clients();
        assertThat(code(() -> clients.authorize("intelligence", SECRET + "x", "catalog", null))).isEqualTo("401 INVALID_CLIENT");
        assertThat(code(() -> clients.authorize("intelligence", "", "catalog", null))).isEqualTo("401 INVALID_CLIENT");
        assertThat(code(() -> clients.authorize("gateway", SECRET, "catalog", null))).isEqualTo("401 INVALID_CLIENT");
        assertThat(code(() -> clients.authorize("trip", "too-short", "catalog", null))).isEqualTo("401 INVALID_CLIENT");
        assertThat(code(() -> clients.authorize("catalog", "", "ingestion", null))).isEqualTo("401 INVALID_CLIENT");
    }

    @Test void grantsNeverIncludeHumanOrAdminPrivileges() {
        WorkloadClients.GRANTS.forEach((client, audiences) -> audiences.forEach((audience, scopes) -> {
            assertThat(audience).isNotEqualTo(client);
            assertThat(scopes).allSatisfy(scope -> assertThat(scope).startsWith(audience + ":")
                    .doesNotEndWith(":admin").doesNotEndWith(":write"));
        }));
    }

    @Test void issuedWorkloadTokenHasNoSessionAndKeepsTheProvisioningSubject() throws Exception {
        var env = new MockEnvironment(); env.setActiveProfiles("test");
        var issuer = new IssuerKeys(env, "", "", "http://identity:8101", "identity,catalog");
        var token = issuer.workload("intelligence", "catalog", List.of("catalog:places:read"));
        assertThat(token.length()).isLessThanOrEqualTo(1024);
        var signed = SignedJWT.parse(token);
        assertThat(signed.verify(new com.nimbusds.jose.crypto.RSASSAVerifier(issuer.verificationKey()))).isTrue();
        var claims = signed.getJWTClaimsSet();
        assertThat(claims.getAudience()).containsExactly("catalog");
        assertThat(claims.getClaim("sid")).isNull();
        assertThat(claims.getStringClaim("client_id")).isEqualTo("intelligence");
        assertThat(claims.getStringListClaim("roles")).containsExactly("SERVICE");
        assertThat(claims.getStringClaim("scope")).isEqualTo("catalog:places:read");
        // Same subject as uuid.uuid5(uuid.NAMESPACE_URL, "smarttravel-workload:intelligence") in Python.
        assertThat(claims.getSubject()).isEqualTo("73889b2f-9050-52c3-9204-ac16b180a248");
        assertThat(claims.getExpirationTime().getTime() - claims.getIssueTime().getTime()).isEqualTo(600000);
        assertThatThrownBy(() -> issuer.workload("intelligence", "catalog", List.of("trip:internal")))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
