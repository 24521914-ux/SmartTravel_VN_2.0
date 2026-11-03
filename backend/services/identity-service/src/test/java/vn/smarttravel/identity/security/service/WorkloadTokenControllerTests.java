package vn.smarttravel.identity.security.service;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import vn.smarttravel.identity.security.controller.WorkloadTokenController;
import vn.smarttravel.identity.shared.web.IdentityErrorAdvice;

// Lives beside IssuerKeys to use its package-private constructor.
class WorkloadTokenControllerTests {
    private static final String SECRET = "unit-test-only-workload-secret-0123456789";
    private MockMvc mvc;

    @BeforeEach void setUp() {
        var env = new MockEnvironment(); env.setActiveProfiles("test");
        env.setProperty("identity.workload.secrets.trip", SECRET);
        var controller = new WorkloadTokenController(new WorkloadClients(env),
                new IssuerKeys(env, "", "", "http://identity:8101", "identity,catalog"));
        mvc = MockMvcBuilders.standaloneSetup(controller).setControllerAdvice(new IdentityErrorAdvice()).build();
    }

    private static String basic(String client, String secret) {
        return "Basic " + Base64.getEncoder().encodeToString((client + ":" + secret).getBytes(StandardCharsets.UTF_8));
    }

    @Test void issuesClientCredentialsTokenForGrantedAudience() throws Exception {
        mvc.perform(post("/internal/v1/security/workload-token").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .header("Authorization", basic("trip", SECRET))
                        .param("grant_type", "client_credentials").param("audience", "catalog"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token_type").value("Bearer"))
                .andExpect(jsonPath("$.expires_in").value(600))
                .andExpect(jsonPath("$.scope").value("catalog:places:read"))
                .andExpect(jsonPath("$.access_token").isString());
    }

    @Test void rejectsMissingOrWrongClientCredentialsAndOtherGrants() throws Exception {
        mvc.perform(post("/internal/v1/security/workload-token").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .param("grant_type", "client_credentials").param("audience", "catalog"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_CLIENT"));
        mvc.perform(post("/internal/v1/security/workload-token").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .header("Authorization", basic("trip", "wrong-secret"))
                        .param("grant_type", "client_credentials").param("audience", "catalog"))
                .andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("INVALID_CLIENT"));
        mvc.perform(post("/internal/v1/security/workload-token").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .header("Authorization", "Basic not-base64!")
                        .param("grant_type", "client_credentials").param("audience", "catalog"))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/internal/v1/security/workload-token").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .header("Authorization", basic("trip", SECRET))
                        .param("grant_type", "password").param("audience", "catalog"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("UNSUPPORTED_GRANT_TYPE"));
        mvc.perform(post("/internal/v1/security/workload-token").contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .header("Authorization", basic("trip", SECRET))
                        .param("grant_type", "client_credentials").param("audience", "identity"))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("INVALID_AUDIENCE"));
    }
}
