package vn.smarttravel.identity.internal.dto;

import jakarta.validation.constraints.*;
import java.util.*;

public record UserBatchRequest(@NotNull @Size(min=1,max=100) List<@NotNull UUID> ids) {
    @AssertTrue(message="ids must be unique")
    public boolean isUnique() { return ids==null || new HashSet<>(ids).size()==ids.size(); }
}
