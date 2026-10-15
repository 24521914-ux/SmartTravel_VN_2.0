package vn.smarttravel.identity.internal.service;

import java.util.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.TransactionDefinition;
import vn.smarttravel.identity.internal.repository.UserBatchRepository;
import vn.smarttravel.identity.preferences.repository.PreferenceRepository;
import vn.smarttravel.identity.shared.exception.IdentityException;

@Service
public class UserBatchService {
    private final UserBatchRepository users;
    private final PreferenceRepository preferences;
    private final TransactionTemplate snapshot;
    public UserBatchService(UserBatchRepository users, PreferenceRepository preferences, TransactionTemplate tx) {
        this.users=users; this.preferences=preferences;
        this.snapshot=new TransactionTemplate(Objects.requireNonNull(tx.getTransactionManager()));
        snapshot.setReadOnly(true); snapshot.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }
    public Map<String,Object> batch(Jwt jwt, List<UUID> ids, boolean includePreferences) {
        // Scope alone is insufficient: reject human/session tokens at workload-only endpoints.
        if(jwt==null || jwt.hasClaim("sid") || jwt.getClaimAsString("client_id")==null || jwt.getClaimAsString("client_id").isBlank())
            throw new IdentityException(403,"WORKLOAD_IDENTITY_REQUIRED");
        if(ids==null || ids.isEmpty() || ids.size()>100 || ids.stream().anyMatch(Objects::isNull) || new HashSet<>(ids).size()!=ids.size())
            throw new IdentityException(400,"INVALID_IDS");
        return snapshot.execute(status -> {
            var items=new ArrayList<Map<String,Object>>(); var missing=new ArrayList<UUID>();
            for(UUID id:ids) {
                var user=users.find(id);
                if(user==null || (includePreferences && !"ACTIVE".equals(user.get("status")))) { missing.add(id); continue; }
                if(includePreferences) {
                    var value=new LinkedHashMap<>(preferences.snapshot(id)); value.put("user_id",id); items.add(value);
                } else {
                    var value=new LinkedHashMap<>(user);
                    if(!Set.of("ACTIVE","DELETED").contains((String)value.get("status"))) value.put("status","DISABLED");
                    items.add(value);
                }
            }
            return Map.of("items",items,"missing_ids",missing);
        });
    }

    public Map<String,Object> preferencesSnapshot(Jwt jwt, UUID after, int limit, String expectedWatermark) {
        if(jwt==null || jwt.hasClaim("sid") || jwt.getClaimAsString("client_id")==null || jwt.getClaimAsString("client_id").isBlank())
            throw new IdentityException(403,"WORKLOAD_IDENTITY_REQUIRED");
        if (limit<1 || limit>100) throw new IdentityException(400,"INVALID_LIMIT");
        return snapshot.execute(status -> {
            String watermark=users.preferencesWatermark();
            if(expectedWatermark!=null && !watermark.equals(expectedWatermark)) throw new IdentityException(409,"SNAPSHOT_CHANGED");
            var ids=users.activePage(after==null?new UUID(0,0):after,limit);
            boolean more=ids.size()>limit;
            var items=new ArrayList<Map<String,Object>>();
            for(UUID user:ids.stream().limit(limit).toList()) {
                var value=new LinkedHashMap<>(preferences.snapshot(user)); value.put("user_id",user);
                value.put("as_of",users.preferencesUpdatedAt(user).toString()); items.add(value);
            }
            var result=new LinkedHashMap<String,Object>(); result.put("items",items);
            result.put("next_cursor",more?ids.get(limit-1).toString()+":"+watermark:null);
            result.put("watermark",watermark);
            result.put("as_of",java.time.Instant.now().toString());
            return result;
        });
    }
}
