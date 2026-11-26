package vn.smarttravel.identity.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SocialLoginRequest(
        @NotBlank @Size(max = 32) String provider,
        @NotBlank @Size(max = 4096) String token) {}
