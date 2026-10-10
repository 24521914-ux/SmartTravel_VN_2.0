package vn.smarttravel.identity.preferences.dto;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class PreferencePatchTests {
    private final ObjectMapper json=new ObjectMapper();
    @Test void rejectsCoercionUnknownFieldsDuplicatesAndMoneyOverflow() {
        for(String body:new String[]{"{}","[]","{\"version\":1}","{\"personalization_enabled\":1}","{\"budget_min\":\"100\"}",
                "{\"budget_max\":-1}","{\"budget_min\":1000000000000}","{\"budget_min\":1.001}","{\"currency\":\"USD\"}",
                "{\"category_ids\":null}","{\"category_ids\":[\"1-1-1-1-1\"]}","{\"consent_version\":1.1}",
                "{\"travel_style_ids\":[\"00000000-0000-0000-0000-000000000001\",\"00000000-0000-0000-0000-000000000001\"]}"}) {
            assertThatThrownBy(() -> PreferencePatch.parse(json.readTree(body))).hasMessage("INVALID_PREFERENCES");
        }
    }
    @Test void validatesMergedBudgetAndPreservesExplicitNull() throws Exception {
        var patch=PreferencePatch.parse(json.readTree("{\"budget_level\":\"CUSTOM\",\"budget_min\":100,\"budget_max\":200}"));
        PreferencePatch.validateBudget(patch);
        var nulls=PreferencePatch.parse(json.readTree("{\"budget_level\":\"MID\",\"budget_min\":null,\"budget_max\":null}"));
        assertThat(nulls).containsKey("budget_min");
        PreferencePatch.validateBudget(nulls);
        patch.put("budget_min",null);
        assertThatThrownBy(() -> PreferencePatch.validateBudget(patch)).hasMessage("INVALID_PREFERENCES");
        patch.put("budget_min",new java.math.BigDecimal(300));
        assertThatThrownBy(() -> PreferencePatch.validateBudget(patch)).hasMessage("INVALID_PREFERENCES");
    }
}
