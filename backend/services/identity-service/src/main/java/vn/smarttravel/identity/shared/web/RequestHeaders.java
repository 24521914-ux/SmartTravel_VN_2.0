package vn.smarttravel.identity.shared.web;

import vn.smarttravel.identity.shared.exception.IdentityException;

public final class RequestHeaders {
    private RequestHeaders() {}

    public static String idempotency(String key) {
        if (key == null || key.isBlank()) throw new IdentityException(400, "IDEMPOTENCY_KEY_REQUIRED");
        if (key.length()>128) throw new IdentityException(400, "INVALID_INPUT");
        return key;
    }

    public static long version(String etag) {
        if (etag == null) throw new IdentityException(428, "PRECONDITION_REQUIRED");
        if (!etag.matches("\"[1-9][0-9]*\"")) throw new IdentityException(400, "INVALID_ETAG");
        try { return Long.parseLong(etag.substring(1, etag.length()-1)); }
        catch (NumberFormatException e) { throw new IdentityException(400, "INVALID_ETAG"); }
    }
}
