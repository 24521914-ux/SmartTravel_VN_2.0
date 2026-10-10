package vn.smarttravel.identity.preferences.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.*;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import vn.smarttravel.identity.preferences.client.CategoryClient;
import vn.smarttravel.identity.preferences.dto.PreferencePatch;
import vn.smarttravel.identity.preferences.repository.PreferenceRepository;
import vn.smarttravel.identity.infrastructure.mail.service.AccountMail;
import vn.smarttravel.identity.infrastructure.persistence.service.IdentityMutations;
import vn.smarttravel.identity.security.service.CurrentUser;
import vn.smarttravel.identity.shared.exception.IdentityException;
import vn.smarttravel.identity.shared.web.CursorPages;

@Service
public class PreferenceService {
    private final PreferenceRepository repository;
    private final TransactionTemplate tx;
    private final CurrentUser current;
    private final IdentityMutations mutations;
    private final AccountMail secrets;
    private final CategoryClient categories;
    private final CursorPages cursors;
    public PreferenceService(PreferenceRepository repository, TransactionTemplate tx, CurrentUser current,
                             IdentityMutations mutations, AccountMail secrets, CategoryClient categories, CursorPages cursors) {
        this.repository=repository; this.tx=tx; this.current=current; this.mutations=mutations;
        this.secrets=secrets; this.categories=categories; this.cursors=cursors;
    }
    public Map<String,Object> get(Jwt jwt) {
        return tx.execute(status -> repository.snapshot(current.requireUser(jwt)));
    }
    @SuppressWarnings("unchecked")
    public Map<String,Object> update(Jwt jwt, JsonNode body, long version, String key) {
        var patch=PreferencePatch.parse(body);
        String hash=secrets.digest(mutations.encode(Map.of("version",version,"body",patch)));
        return tx.execute(status -> {
            UUID user=current.requireUser(jwt); // serializes updates and status/session changes for this owner
            var replay=mutations.idempotent("preferences",user.toString(),key,hash);
            if(replay!=null) return replay;
            var old=repository.snapshot(user);
            if(((Number)old.get("version")).longValue()!=version) throw new IdentityException(409,"VERSION_CONFLICT");
            if(patch.containsKey("consent_version") && ((Number)patch.get("consent_version")).longValue()!=((Number)old.get("consent_version")).longValue())
                throw new IdentityException(409,"CONSENT_VERSION_CONFLICT");
            var merged=new LinkedHashMap<>(old); merged.putAll(patch);
            PreferencePatch.validateBudget(merged);
            repository.validateOptions((List<UUID>)merged.get("travel_style_ids"),"TRAVEL_STYLE");
            repository.validateOptions((List<UUID>)merged.get("food_preference_ids"),"FOOD_PREFERENCE");
            // Revalidate the full category selection, not only IDs added in this request.
            categories.requireActive((List<UUID>)merged.get("category_ids"));
            boolean changed=!old.get("personalization_enabled").equals(merged.get("personalization_enabled"));
            repository.update(user,merged,changed);
            var response=repository.snapshot(user);
            var payload=new LinkedHashMap<>(response); payload.put("user_id",user);
            mutations.event("preferences",user,((Number)response.get("version")).longValue(),"identity.preferences.changed.v1",payload);
            mutations.audit(user,user,changed?"CONSENT_UPDATED":"PREFERENCES_UPDATED");
            mutations.remember("preferences",user.toString(),key,hash,response,200);
            return response;
        });
    }
    public Map<String,Object> options(String cursor, int limit) {
        var position=cursors.decode(cursor,"preference-options",limit);
        return cursors.page(repository.optionsPage((UUID)position.get("id"),limit),"option_id","preference-options",limit,position);
    }
}
