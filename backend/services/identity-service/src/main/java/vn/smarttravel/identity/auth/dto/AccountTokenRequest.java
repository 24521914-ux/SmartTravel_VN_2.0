package vn.smarttravel.identity.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record AccountTokenRequest(@NotBlank @Size(max=1024) String token) {}
