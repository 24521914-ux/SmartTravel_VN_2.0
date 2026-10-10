package vn.smarttravel.identity.admin.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.admin.repository.AdminUserRepository;
import vn.smarttravel.identity.auth.repository.AuthRepository;
import vn.smarttravel.identity.infrastructure.persistence.service.IdentityMutations;
import vn.smarttravel.identity.security.service.CurrentUser;
import vn.smarttravel.identity.shared.exception.IdentityException;
import vn.smarttravel.identity.shared.web.CursorPages;

@Service
public class AdminUserService {
    private final AdminUserRepository repository;
    private final AuthRepository auth;
    private final CurrentUser current;
    private final IdentityMutations mutations;
    private final TransactionTemplate tx;
    private final CursorPages cursors;
    public AdminUserService(AdminUserRepository repository, AuthRepository auth, CurrentUser current,
                            IdentityMutations mutations, TransactionTemplate tx, CursorPages cursors) {
        this.repository=repository; this.auth=auth; this.current=current; this.mutations=mutations; this.tx=tx; this.cursors=cursors;
    }
    private UUID requireAdmin(Jwt jwt) {
        UUID actor=current.requireUser(jwt);
        if(!auth.roles(actor).contains("ADMIN")) throw new IdentityException(403,"FORBIDDEN");
        return actor;
    }
    private UUID lockAdmin(Jwt jwt, UUID user) {
        try { repository.lockPair(UUID.fromString(jwt.getSubject()),user); }
        catch(IllegalArgumentException | NullPointerException e) { throw IdentityException.unauthorized(); }
        return requireAdmin(jwt);
    }
    public Map<String,Object> page(Jwt jwt, String cursor, int limit) {
        var position=cursors.decode(cursor,"admin-users:"+jwt.getSubject(),limit);
        return tx.execute(status -> {
            requireAdmin(jwt);
            var rows=repository.page((UUID)position.get("id"),(Instant)position.get("as_of"),limit);
            var items=rows.stream().map(this::wire).toList();
            return cursors.page(items,"user_id","admin-users:"+jwt.getSubject(),limit,position);
        });
    }
    private Map<String,Object> wire(Map<String,Object> row) {
        var value=new LinkedHashMap<>(row); value.remove("email_verified_at");
        value.put("roles",auth.roles((UUID)row.get("user_id")));
        if(!Set.of("ACTIVE","DELETED").contains((String)row.get("status"))) value.put("status","DISABLED");
        return value;
    }
    private Map<String,Object> target(UUID user, long version) {
        var row=repository.find(user);
        if(row==null) throw new IdentityException(404,"USER_NOT_FOUND");
        if(((Number)row.get("version")).longValue()!=version) throw new IdentityException(409,"VERSION_CONFLICT");
        if("DELETED".equals(row.get("status")) || repository.deleting(user)) throw new IdentityException(409,"ACCOUNT_DELETION_IN_PROGRESS");
        return row;
    }
    public Map<String,Object> status(Jwt jwt, UUID user, JsonNode body, long version) {
        if(body==null || !body.isObject() || body.size()!=1 || !body.path("status").isTextual() || !Set.of("ACTIVE","DISABLED").contains(body.path("status").asText()))
            throw new IdentityException(400,"INVALID_STATUS");
        return tx.execute(state -> {
            UUID actor=lockAdmin(jwt,user); var row=target(user,version);
            if(actor.equals(user)) throw new IdentityException(409,"ADMIN_SELF_MUTATION_FORBIDDEN");
            String requested=body.path("status").asText();
            if(requested.equals("ACTIVE") && row.get("email_verified_at")==null) throw new IdentityException(409,"EMAIL_NOT_VERIFIED");
            repository.status(user,requested.equals("ACTIVE")?"ACTIVE":"SUSPENDED");
            auth.revokeAllSessions(user); // reactivation never resurrects a revoked family
            mutations.audit(actor,user,"ADMIN_STATUS_UPDATED");
            var result=wire(repository.find(user));
            mutations.event(user,((Number)result.get("version")).longValue(),"identity.user.status-changed.v1",
                    Map.of("user_id",user,"status",requested,"version",result.get("version")));
            return result;
        });
    }
    public Map<String,Object> roles(Jwt jwt, UUID user, JsonNode body, long version) {
        if(body==null || !body.isObject() || body.size()!=1 || !body.path("roles").isArray() || body.path("roles").size()>100)
            throw new IdentityException(400,"INVALID_ROLES");
        var roles=new TreeSet<String>();
        for(var role:body.path("roles")) {
            if(!role.isTextual() || !Set.of("USER","BUSINESS","ADMIN").contains(role.asText()) || !roles.add(role.asText())) throw new IdentityException(400,"INVALID_ROLES");
        }
        return tx.execute(state -> {
            UUID actor=lockAdmin(jwt,user); target(user,version);
            if(actor.equals(user)) throw new IdentityException(409,"ADMIN_SELF_MUTATION_FORBIDDEN");
            repository.roles(actor,user,new ArrayList<>(roles)); auth.revokeAllSessions(user);
            mutations.audit(actor,user,"ADMIN_ROLES_UPDATED");
            return wire(repository.find(user));
        });
    }
}
