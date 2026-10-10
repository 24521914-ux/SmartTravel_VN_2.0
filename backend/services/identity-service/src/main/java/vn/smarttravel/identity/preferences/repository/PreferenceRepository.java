package vn.smarttravel.identity.preferences.repository;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class PreferenceRepository {
    private final JdbcTemplate db;
    public PreferenceRepository(JdbcTemplate db) { this.db = db; }

    public Map<String,Object> snapshot(UUID user) {
        var row = new LinkedHashMap<>(db.queryForMap("""
            SELECT budget_level,budget_min,budget_max,currency,personalization_enabled,consent_version,version
            FROM identity.user_preferences WHERE user_id=?
            """, user));
        row.put("category_ids", db.queryForList("SELECT category_id FROM identity.user_category_preferences WHERE user_id=? ORDER BY category_id", UUID.class,user));
        row.put("travel_style_ids", options(user,"TRAVEL_STYLE"));
        row.put("food_preference_ids", options(user,"FOOD_PREFERENCE"));
        return row;
    }

    private List<UUID> options(UUID user, String kind) {
        return db.queryForList("""
            SELECT o.option_id FROM identity.user_preference_options p JOIN identity.preference_options o USING(option_id)
            WHERE p.user_id=? AND o.kind=? ORDER BY o.option_id
            """, UUID.class,user,kind);
    }

    public void validateOptions(List<UUID> ids, String kind) {
        // SHARE lock prevents option deactivation between validation and commit.
        for (UUID id : ids) {
            var rows = db.queryForList("SELECT option_id FROM identity.preference_options WHERE option_id=? AND kind=? AND active FOR SHARE",id,kind);
            if (rows.isEmpty()) throw new vn.smarttravel.identity.shared.exception.IdentityException(400,"INVALID_PREFERENCE_OPTION");
        }
    }

    public void update(UUID user, Map<String,Object> row, boolean consentChanged) {
        db.update("""
            UPDATE identity.user_preferences SET budget_level=?,budget_min=?,budget_max=?,currency=?,personalization_enabled=?,
            consent_version=consent_version+?,consent_updated_at=CASE WHEN ? THEN now() ELSE consent_updated_at END,
            version=version+1,updated_at=now() WHERE user_id=?
            """,row.get("budget_level"),row.get("budget_min"),row.get("budget_max"),row.get("currency"),row.get("personalization_enabled"),
            consentChanged ? 1 : 0,consentChanged,user);
        db.update("DELETE FROM identity.user_preference_options WHERE user_id=?",user);
        for (String field : List.of("travel_style_ids","food_preference_ids")) {
            for (Object id : (List<?>)row.get(field)) db.update("INSERT INTO identity.user_preference_options(user_id,option_id) VALUES (?,?)",user,id);
        }
        db.update("DELETE FROM identity.user_category_preferences WHERE user_id=?",user);
        for (Object id : (List<?>)row.get("category_ids")) db.update("INSERT INTO identity.user_category_preferences(user_id,category_id) VALUES (?,?)",user,id);
    }

    public List<Map<String,Object>> optionsPage(UUID after, int limit) {
        return db.queryForList("SELECT option_id,kind,label_vi AS name,active,version FROM identity.preference_options WHERE option_id>? ORDER BY option_id LIMIT ?",after,limit+1);
    }
}
