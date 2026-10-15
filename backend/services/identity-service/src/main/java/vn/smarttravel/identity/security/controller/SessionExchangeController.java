package vn.smarttravel.identity.security.controller;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.*;
import vn.smarttravel.identity.security.service.CurrentUser;
import vn.smarttravel.identity.security.service.IssuerKeys;
import vn.smarttravel.identity.shared.exception.IdentityException;

/** Infrastructure-only endpoints; the Gateway never exposes /internal routes. */
@RestController
public class SessionExchangeController {
    private final CurrentUser users;
    private final IssuerKeys keys;
    private final TransactionTemplate tx;
    private final byte[] gatewaySecret;
    public SessionExchangeController(CurrentUser users, IssuerKeys keys, TransactionTemplate tx,
            @Value("${identity.gateway-exchange-secret:}") String secret) {
        this.users=users; this.keys=keys; this.tx=tx; this.gatewaySecret=secret.getBytes(StandardCharsets.UTF_8);
    }
    @PostMapping("/internal/v1/security/session")
    public Map<String,Object> session(@AuthenticationPrincipal Jwt jwt) {
        return tx.execute(status -> {
            UUID user=users.requireUser(jwt);
            List<String> roles=jwt.getClaimAsStringList("roles");
            if (roles==null || !users.roles(user).containsAll(roles)) throw IdentityException.unauthorized();
            return Map.of("active",true,"user_id",user);
        });
    }
    @PostMapping("/internal/v1/security/exchange")
    public Map<String,Object> exchange(@AuthenticationPrincipal Jwt jwt,
            @RequestHeader(value="X-Gateway-Credential", defaultValue="") String credential,
            @RequestBody Map<String,String> request) {
        if (gatewaySecret.length < 32 || !MessageDigest.isEqual(gatewaySecret, credential.getBytes(StandardCharsets.UTF_8)))
            throw new IdentityException(403,"GATEWAY_IDENTITY_REQUIRED");
        String destination=request.get("audience");
        if (!java.util.Set.of("identity","catalog","community","trip","ingestion","intelligence").contains(destination==null?"":destination)
                || !jwt.getAudience().contains(destination)) throw new IdentityException(403,"INVALID_AUDIENCE");
        return tx.execute(status -> {
            var user=users.requireUser(jwt);
            // Current role assignment is read under the same user lock as status/session.
            List<String> roles=users.roles(user);
            if (roles==null || roles.contains("SERVICE")) throw IdentityException.unauthorized();
            return Map.of("access_token",keys.exchange(user,UUID.fromString(jwt.getClaimAsString("sid")),roles,destination,jwt.getExpiresAt()),
                    "token_type","Bearer","expires_in",60);
        });
    }
}
