package vn.smarttravel.identity.deletion.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.deletion.repository.DeletionRepository;
import vn.smarttravel.identity.auth.repository.AuthRepository;
import vn.smarttravel.identity.preferences.repository.PreferenceRepository;
import vn.smarttravel.identity.infrastructure.persistence.service.IdentityMutations;
import vn.smarttravel.identity.infrastructure.mail.service.AccountMail;
import vn.smarttravel.identity.security.service.CurrentUser;
import vn.smarttravel.identity.shared.exception.IdentityException;

@Service
public class DeletionService {
    private final DeletionRepository repository;
    private final AuthRepository auth;
    private final PreferenceRepository preferences;
    private final IdentityMutations mutations;
    private final AccountMail secrets;
    private final CurrentUser current;
    private final TransactionTemplate tx;
    private final long policy;
    public DeletionService(DeletionRepository repository, AuthRepository auth, PreferenceRepository preferences,
                           IdentityMutations mutations, AccountMail secrets, CurrentUser current, TransactionTemplate tx,
                           @Value("${identity.deletion.policy-version:1}") long policy) {
        this.repository=repository; this.auth=auth; this.preferences=preferences; this.mutations=mutations;
        this.secrets=secrets; this.current=current; this.tx=tx; this.policy=policy;
        if(policy<1) throw new IllegalArgumentException("Invalid deletion policy version");
    }
    public static Map<String,Object> wire(Map<String,Object> row) {
        // FAILED is intentionally not in frozen HTTP enum: remain PENDING, expose failure in operational DB/runbook.
        return Map.of("request_id",row.get("deletion_request_id"),"version",row.get("version"),
                "status","COMPLETED".equals(row.get("status"))?"COMPLETED":"PENDING");
    }
    public Map<String,Object> request(Jwt jwt, JsonNode body, String key) {
        if(body==null || !body.isObject() || body.size()!=1 || !body.path("policy_version").isIntegralNumber() ||
                !body.path("policy_version").canConvertToLong() || body.path("policy_version").asLong()!=policy)
            throw new IdentityException(400,"INVALID_DELETION_POLICY");
        return tx.execute(status -> {
            UUID user,session;
            try {
                if(jwt==null || jwt.hasClaim("client_id")) throw IdentityException.unauthorized();
                user=UUID.fromString(jwt.getSubject()); session=UUID.fromString(jwt.getClaimAsString("sid"));
            } catch(IllegalArgumentException | NullPointerException e) { throw IdentityException.unauthorized(); }
            current.lockUser(user);
            if(!auth.ownsSession(user,session)) throw IdentityException.unauthorized();
            String hash=secrets.digest("deletion:"+policy+":"+session);
            // Read-only replay is allowed for the requesting, now-revoked session. Never allow a new mutation.
            var replay=mutations.idempotent("deletion-request",user.toString(),key,hash);
            if(replay!=null) return replay;
            current.requireUser(jwt);
            UUID request=UUID.randomUUID(); repository.create(request,user,policy);
            auth.revokeAllSessions(user);
            repository.eraseLocal(user,request);
            long version=repository.tombstone(user);
            var snapshot=new LinkedHashMap<>(preferences.snapshot(user)); snapshot.put("user_id",user);
            mutations.event("preferences",user,((Number)snapshot.get("version")).longValue(),"identity.preferences.changed.v1",snapshot);
            mutations.event(user,version,"identity.user.status-changed.v1",Map.of("user_id",user,"status","DELETED","version",version));
            mutations.event("deletion",request,1,"identity.user.deletion-requested.v1",
                    Map.of("deletion_request_id",request,"user_id",user,"policy_version",policy));
            mutations.audit(user,user,"DELETION_REQUESTED");
            var response=Map.<String,Object>of("request_id",request,"status","ACCEPTED","version",1L);
            mutations.remember("deletion-request",user.toString(),key,hash,response,202);
            return response;
        });
    }
    public Map<String,Object> status(Jwt jwt, UUID request) {
        if(jwt==null || jwt.hasClaim("sid") || jwt.getClaimAsString("client_id")==null || jwt.getClaimAsString("client_id").isBlank())
            throw new IdentityException(403,"WORKLOAD_IDENTITY_REQUIRED");
        var row=repository.find(request,false);
        if(row==null) throw new IdentityException(404,"NOT_FOUND");
        return wire(row);
    }
}
