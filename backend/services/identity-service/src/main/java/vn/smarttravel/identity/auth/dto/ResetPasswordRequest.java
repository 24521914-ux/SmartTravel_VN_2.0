package vn.smarttravel.identity.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ResetPasswordRequest(@NotBlank @Size(max=1024) String token,
                                   @NotBlank @Size(min=12,max=128) String password) {}
