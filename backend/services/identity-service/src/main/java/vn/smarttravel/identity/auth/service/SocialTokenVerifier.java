package vn.smarttravel.identity.auth.service;

/** Verifies external social provider tokens (Google ID token, Facebook access token). */
public interface SocialTokenVerifier {
    record VerifiedSocialProfile(
            String provider,
            String providerUserId,
            String email,
            boolean emailVerified,
            String displayName,
            String avatarUrl) {}

    VerifiedSocialProfile verifyGoogle(String idToken);

    VerifiedSocialProfile verifyFacebook(String accessToken);
}
