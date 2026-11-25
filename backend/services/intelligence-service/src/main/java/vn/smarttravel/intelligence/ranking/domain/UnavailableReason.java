package vn.smarttravel.intelligence.ranking.domain;

/** Explicit enum distinguishing missing data, consent denial, scorer faults, and gate blocks. */
public enum UnavailableReason {
    NO_DATA,
    NO_SOFT_PREFERENCES,
    NO_VERIFIED_ATTRIBUTES,
    NO_PRIOR_SAMPLE,
    NO_POPULARITY_REF,
    NEW_ITEM_OBSERVATION_WINDOW,
    PIPELINE_INACTIVE,
    NO_USER_HISTORY,
    NO_ITEM_SUPPORT,
    ARTIFACT_MISSING,
    ARTIFACT_CORRUPT,
    ARTIFACT_NOT_ACTIVE,
    CONSENT_DENIED,
    NO_ORIGIN_COORDINATES,
    NO_PLACE_COORDINATES,
    WEATHER_PROVIDER_UNAVAILABLE,
    WEATHER_DATA_STALE,
    SCORER_ERROR,
    SCORER_TIMEOUT,
    MODEL_GATE_NOT_PASSED
}
