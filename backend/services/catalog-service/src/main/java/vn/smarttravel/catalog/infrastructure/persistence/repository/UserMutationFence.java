package vn.smarttravel.catalog.infrastructure.persistence.repository;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
/** Shared transaction lock closes the gap between JWT checks and deletion/status commits. */
public final class UserMutationFence {
    private UserMutationFence() {}
    public static void acquireAuthenticated(JdbcTemplate db){
        var authentication=org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if(authentication instanceof org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken token){
            try{acquire(db,UUID.fromString(token.getToken().getSubject()));}catch(IllegalArgumentException error){throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Invalid user principal");}
        }
    }
    public static void lock(JdbcTemplate db,UUID user){if(user!=null)db.queryForList("SELECT pg_advisory_xact_lock(hashtextextended(?::text,8240199))",user.toString());}
    public static void acquire(JdbcTemplate db,UUID user){if(user==null)return;lock(db,user);var rows=db.queryForList("SELECT status FROM catalog.user_status_projections WHERE user_id=?",user);if(!rows.isEmpty()&&!"ACTIVE".equals(rows.getFirst().get("status")))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"User cannot mutate Catalog data");}
}
