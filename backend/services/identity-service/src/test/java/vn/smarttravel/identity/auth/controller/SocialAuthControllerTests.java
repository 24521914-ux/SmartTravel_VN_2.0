package vn.smarttravel.identity.auth.controller;

import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import vn.smarttravel.identity.auth.service.AuthRateLimit;
import vn.smarttravel.identity.auth.service.AuthService;
import vn.smarttravel.identity.auth.service.SocialAuthService;
import vn.smarttravel.identity.shared.exception.IdentityException;
import vn.smarttravel.identity.shared.web.IdentityErrorAdvice;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class SocialAuthControllerTests {
    private AuthService authService;
    private SocialAuthService socialAuthService;
    private AuthRateLimit limits;
    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        authService = mock(AuthService.class);
        socialAuthService = mock(SocialAuthService.class);
        limits = mock(AuthRateLimit.class);
        mvc = MockMvcBuilders.standaloneSetup(new AuthController(authService, socialAuthService, limits))
                .setControllerAdvice(new IdentityErrorAdvice())
                .build();
    }

    @Test
    void googleAndFacebookEndpointsReturnTokenPair() throws Exception {
        when(socialAuthService.login("google", "google-id-token")).thenReturn(Map.of(
                "access_token", "jwt-google", "refresh_token", "ref-google", "token_type", "Bearer", "expires_in", 600));
        when(socialAuthService.login("facebook", "fb-access-token")).thenReturn(Map.of(
                "access_token", "jwt-fb", "refresh_token", "ref-fb", "token_type", "Bearer", "expires_in", 600));

        mvc.perform(post("/api/v1/auth/social/google")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"google-id-token\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.access_token").value("jwt-google"))
                .andExpect(jsonPath("$.refresh_token").value("ref-google"))
                .andExpect(jsonPath("$.token_type").value("Bearer"));

        mvc.perform(post("/api/v1/auth/social/facebook")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"fb-access-token\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.access_token").value("jwt-fb"))
                .andExpect(jsonPath("$.refresh_token").value("ref-fb"));

        verify(limits, times(2)).check(eq("social-login"), anyString(), anyString());
    }

    @Test
    void genericSocialEndpointValidatesBodyAndPropagatesDomainErrors() throws Exception {
        mvc.perform(post("/api/v1/auth/social")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"provider\":\"\",\"token\":\"\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_INPUT"));

        when(socialAuthService.login("google", "bad-token")).thenThrow(IdentityException.unauthorized());
        mvc.perform(post("/api/v1/auth/social")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"provider\":\"google\",\"token\":\"bad-token\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
    }
}
