package vn.smarttravel.intelligence.ranking.domain;

import java.util.*;
import vn.smarttravel.intelligence.ranking.domain.RankingModels.*;

/**
 * Content_v1 scorer using structured attributes ONLY (no vector/embedding/LLM).
 * - Request soft preferences take priority; consented profile preferences supplement non-conflicting items.
 * - Does not double-score attributes already enforced as identical hard filters.
 * - Unknown metadata does not earn points AND remains in the denominator so incomplete items are not rewarded.
 * - Unknown is stored separately from confirmed mismatch (false).
 */
public final class ContentScorer {
    public static final String VERSION = "content_v1";

    private final SemanticScorerExtension semanticExtension;

    public ContentScorer() {
        this(null);
    }

    public ContentScorer(SemanticScorerExtension semanticExtension) {
        this.semanticExtension = semanticExtension;
    }

    public ScorerResult score(PlaceSnapshot place, UserContext user, RankingRequest request, RankingConfig config) {
        String version = config.scorerVersions().getOrDefault("content", VERSION);
        String snapshotVer = "place-v" + place.catalogVersion();
        Map<String, Object> breakdown = new LinkedHashMap<>();

        // 1. Merge soft preferences: request takes priority; profile supplements if consent granted.
        Map<String, Double> activePrefs = new LinkedHashMap<>();
        Set<String> hardTags = request.hardTags() != null ? request.hardTags() : Set.of();

        if (request.softPreferences() != null) {
            for (var entry : request.softPreferences().entrySet()) {
                String key = normalizeKey(entry.getKey());
                double w = entry.getValue() == null ? 1.0 : entry.getValue();
                if (!key.isBlank() && Double.isFinite(w) && w > 0.0 && !hardTags.contains(key)) {
                    activePrefs.put(key, w);
                }
            }
        }

        // Supplement with profile preferences only when user explicitly consented
        boolean profileUsed = false;
        if (user != null && user.personalizationConsent()) {
            // Profile categories supplement only when request did NOT already hard-filter by category
            boolean hasHardCategory = request.categoryIds() != null && !request.categoryIds().isEmpty();
            if (!hasHardCategory && user.profileCategoryIds() != null) {
                for (UUID catId : user.profileCategoryIds()) {
                    String prefKey = "category:" + catId;
                    if (!activePrefs.containsKey(prefKey)) {
                        activePrefs.put(prefKey, 1.0);
                        profileUsed = true;
                    }
                }
            }
            if (user.profilePreferenceTags() != null) {
                for (String raw : user.profilePreferenceTags()) {
                    String key = normalizeKey(raw);
                    if (!key.isBlank() && !hardTags.contains(key) && !activePrefs.containsKey(key)) {
                        activePrefs.put(key, 1.0);
                        profileUsed = true;
                    }
                }
            }
        }

        breakdown.put("profile_preferences_used", profileUsed);
        breakdown.put("preference_count", activePrefs.size());
        breakdown.put("semantic_extension_present", semanticExtension != null);

        if (activePrefs.isEmpty()) {
            return ScorerResult.unavailable(UnavailableReason.NO_SOFT_PREFERENCES, version, snapshotVer, place.asOf(), breakdown);
        }

        // 2. Evaluate each preference against verified structured attributes
        double matchedWeight = 0.0;
        double totalWeight = 0.0;
        int verifiedCount = 0;
        List<String> matchedFields = new ArrayList<>();
        List<String> mismatchedFields = new ArrayList<>();
        List<String> unknownFields = new ArrayList<>();
        List<String> reasonCodes = new ArrayList<>();

        Set<String> placeTags = place.structuredTags() != null ? place.structuredTags() : Set.of();
        Set<String> absentTags = place.confirmedAbsentTags() != null ? place.confirmedAbsentTags() : Set.of();
        boolean placeHasStructuredTaxonomy = !placeTags.isEmpty() || !absentTags.isEmpty();

        for (var entry : activePrefs.entrySet()) {
            String pref = entry.getKey();
            double weight = entry.getValue();
            totalWeight += weight;

            if (pref.startsWith("category:")) {
                UUID targetCat = parseUuidOrNull(pref.substring("category:".length()));
                if (place.categoryIds() == null || place.categoryIds().isEmpty()) {
                    unknownFields.add(pref);
                } else {
                    verifiedCount++;
                    if (targetCat != null && place.categoryIds().contains(targetCat)) {
                        matchedWeight += weight;
                        matchedFields.add(pref);
                        reasonCodes.add("CONTENT_MATCH_PROFILE_CATEGORY");
                    } else {
                        mismatchedFields.add(pref);
                    }
                }
                continue;
            }

            if (pref.equals("space:indoor") || pref.equals("space:outdoor")) {
                SpaceType wanted = pref.equals("space:indoor") ? SpaceType.INDOOR : SpaceType.OUTDOOR;
                if (place.spaceType() == null || place.spaceType() == SpaceType.UNKNOWN) {
                    unknownFields.add(pref);
                } else {
                    verifiedCount++;
                    if (place.spaceType() == wanted || place.spaceType() == SpaceType.BOTH) {
                        matchedWeight += weight;
                        matchedFields.add(pref);
                        reasonCodes.add(wanted == SpaceType.INDOOR ? "CONTENT_MATCH_INDOOR" : "CONTENT_MATCH_OUTDOOR");
                    } else {
                        mismatchedFields.add(pref);
                    }
                }
                continue;
            }

            if (pref.equals("price:low") || pref.equals("price:free")) {
                Double effectivePrice = place.effectivePrice();
                if (effectivePrice == null) {
                    unknownFields.add(pref);
                } else {
                    verifiedCount++;
                    boolean matches = pref.equals("price:free") ? effectivePrice == 0.0 : effectivePrice <= 150_000.0;
                    if (matches) {
                        matchedWeight += weight;
                        matchedFields.add(pref);
                        reasonCodes.add(pref.equals("price:free") ? "CONTENT_MATCH_FREE" : "CONTENT_MATCH_LOW_PRICE");
                    } else {
                        mismatchedFields.add(pref);
                    }
                }
                continue;
            }

            // General structured tag / attribute preference
            if (placeTags.contains(pref)) {
                verifiedCount++;
                matchedWeight += weight;
                matchedFields.add(pref);
                reasonCodes.add("CONTENT_MATCH_TAG:" + pref);
            } else if (absentTags.contains(pref)) {
                verifiedCount++;
                mismatchedFields.add(pref);
            } else if (placeHasStructuredTaxonomy) {
                // Place has verified structured taxonomy tags, but not this tag -> known false (distinct from completely untagged item)
                verifiedCount++;
                mismatchedFields.add(pref);
            } else {
                // Item has NO structured tag metadata at all -> explicitly UNKNOWN (not false, stays in denominator)
                unknownFields.add(pref);
            }
        }

        double knownCoverage = (double) verifiedCount / activePrefs.size();
        breakdown.put("known_feature_coverage", knownCoverage);
        breakdown.put("matched_fields", matchedFields);
        breakdown.put("mismatched_fields", mismatchedFields);
        breakdown.put("unknown_fields", unknownFields);

        if (verifiedCount == 0) {
            return ScorerResult.unavailable(UnavailableReason.NO_VERIFIED_ATTRIBUTES, version, snapshotVer, place.asOf(), breakdown);
        }

        double score = totalWeight > 0.0 ? Math.max(0.0, Math.min(1.0, matchedWeight / totalWeight)) : 0.0;
        breakdown.put("content_score", score);
        return ScorerResult.available(score, version, snapshotVer, place.asOf(), reasonCodes, breakdown);
    }

    public static String normalizeKey(String raw) {
        if (raw == null) return "";
        return raw.trim().toLowerCase(Locale.ROOT);
    }

    private static UUID parseUuidOrNull(String raw) {
        try {
            return UUID.fromString(raw);
        } catch (Exception e) {
            return null;
        }
    }
}
