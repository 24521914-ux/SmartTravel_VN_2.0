package vn.smarttravel.identity.shared.exception;

public final class IdentityException extends RuntimeException {
    private final int status;
    private final String code;

    public IdentityException(int status, String code) {
        super(code);
        this.status = status;
        this.code = code;
    }

    public int status() { return status; }
    public String code() { return code; }
    public static IdentityException unauthorized() { return new IdentityException(401, "UNAUTHORIZED"); }
}
