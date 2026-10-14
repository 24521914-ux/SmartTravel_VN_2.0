-- A delayed or historical event must not recreate a cleared history.
ALTER TABLE intelligence.user_feature_profiles ADD COLUMN history_purged_before timestamptz;
