package vn.smarttravel.identity.security.controller;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.identity.security.service.IssuerKeys;
import vn.smarttravel.identity.security.service.WorkloadClients;
import vn.smarttravel.identity.shared.exception.IdentityException;

/**
 * OAuth 2.0 client-credentials grant (RFC 6749 §4.4) for service-to-service calls.
 * Clients authenticate with HTTP Basic; the Gateway never exposes /internal routes.
 */
@RestController
public class WorkloadTokenController {
    private final WorkloadClients clients;
    private final IssuerKeys keys;
    public WorkloadTokenController(WorkloadClients clients, IssuerKeys keys) { this.clients=clients; this.keys=keys; }

    @PostMapping(value="/internal/v1/security/workload-token", consumes=MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public Map<String,Object> token(@RequestHeader(value="Authorization", defaultValue="") String authorization,
            @RequestParam(value="grant_type", defaultValue="") String grantType,
            @RequestParam(value="audience", defaultValue="") String audience,
            @RequestParam(value="scope", required=false) String scope) {
        if (!grantType.equals("client_credentials")) throw new IdentityException(400,"UNSUPPORTED_GRANT_TYPE");
        String[] credential=basic(authorization);
        var scopes=clients.authorize(credential[0],credential[1],audience,scope);
        return Map.of("access_token",keys.workload(credential[0],audience,scopes),"token_type","Bearer",
                "expires_in",IssuerKeys.ACCESS_TTL_SECONDS,"scope",String.join(" ",scopes));
    }

    private static String[] basic(String header) {
        if (!header.regionMatches(true,0,"Basic ",0,6)) throw new IdentityException(401,"INVALID_CLIENT");
        try {
            String decoded=new String(Base64.getDecoder().decode(header.substring(6).trim()),StandardCharsets.UTF_8);
            int colon=decoded.indexOf(':');
            if (colon<1) throw new IdentityException(401,"INVALID_CLIENT");
            // RFC 6749 §2.3.1: client_id and secret are form-urlencoded before Basic encoding.
            return new String[]{URLDecoder.decode(decoded.substring(0,colon),StandardCharsets.UTF_8),
                    URLDecoder.decode(decoded.substring(colon+1),StandardCharsets.UTF_8)};
        } catch (IllegalArgumentException e) { throw new IdentityException(401,"INVALID_CLIENT"); }
    }
}
