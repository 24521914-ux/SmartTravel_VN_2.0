package vn.smarttravel.identity.preferences.dto;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.*;
import vn.smarttravel.identity.shared.exception.IdentityException;

/** Contract PUT is a partial update (minProperties=1); absent and explicit null are distinct. */
public final class PreferencePatch {
    private static final Set<String> FIELDS=Set.of("category_ids","travel_style_ids","food_preference_ids","budget_level","budget_min","budget_max","currency","personalization_enabled","consent_version");
    private PreferencePatch() {}
    public static Map<String,Object> parse(JsonNode body) {
        if(body==null || !body.isObject() || body.isEmpty()) throw invalid();
        var result=new TreeMap<String,Object>();
        body.fields().forEachRemaining(entry -> {
            String key=entry.getKey(); var value=entry.getValue();
            if(!FIELDS.contains(key)) throw invalid();
            if(key.endsWith("_ids")) {
                if(!value.isArray() || value.size()>100) throw invalid();
                var ids=new TreeSet<UUID>();
                for(var item:value) {
                    if(!item.isTextual() || !item.asText().matches("[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}")) throw invalid();
                    if(!ids.add(UUID.fromString(item.asText()))) throw invalid();
                }
                result.put(key,new ArrayList<>(ids));
            } else if(key.equals("budget_min") || key.equals("budget_max")) {
                if(!value.isNull() && !value.isNumber()) throw invalid();
                BigDecimal amount=value.isNull()?null:value.decimalValue();
                if(amount!=null && (amount.signum()<0 || amount.compareTo(new BigDecimal("999999999999.99"))>0 || amount.stripTrailingZeros().scale()>2)) throw invalid();
                result.put(key,amount);
            } else if(key.equals("personalization_enabled")) {
                if(!value.isBoolean()) throw invalid(); result.put(key,value.booleanValue());
            } else if(key.equals("consent_version")) {
                if(!value.isIntegralNumber() || !value.canConvertToLong() || value.longValue()<1) throw invalid();
                result.put(key,value.longValue());
            } else {
                if(!value.isTextual()) throw invalid();
                if(key.equals("budget_level") && !Set.of("LOW","MID","HIGH","CUSTOM").contains(value.asText())) throw invalid();
                if(key.equals("currency") && !value.asText().equals("VND")) throw invalid();
                result.put(key,value.asText());
            }
        });
        return result;
    }
    public static void validateBudget(Map<String,Object> snapshot) {
        BigDecimal min=(BigDecimal)snapshot.get("budget_min"), max=(BigDecimal)snapshot.get("budget_max");
        if("CUSTOM".equals(snapshot.get("budget_level")) && (min==null || max==null)) throw invalid();
        if(min!=null && max!=null && min.compareTo(max)>0) throw invalid();
    }
    private static IdentityException invalid() { return new IdentityException(400,"INVALID_PREFERENCES"); }
}
