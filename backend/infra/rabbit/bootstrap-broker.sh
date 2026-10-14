#!/usr/bin/env bash
# Local P01 broker only. Runtime cannot impersonate a partner by publishing to inbound.
set -eu
rabbitmqctl -q add_vhost smarttravel 2>/dev/null || rabbitmqctl -q list_vhosts | grep -qx smarttravel
if ! rabbitmqctl -q list_users | grep -q '^identity_runtime[[:space:]]'; then
  rabbitmqctl -q add_user identity_runtime "$IDENTITY_BROKER_PASSWORD" >/dev/null
fi
if ! rabbitmqctl -q list_users | grep -q '^p01_fixture[[:space:]]'; then
  rabbitmqctl -q add_user p01_fixture "$BROKER_FIXTURE_PASSWORD" >/dev/null
fi
rabbitmqctl -q set_permissions -p smarttravel platform_admin '.*' '.*' '.*'
rabbitmqctl -q set_permissions -p smarttravel identity_runtime '^identity\..*' '^identity\.(events|inbox|dlq|deadletters|p01\.capture)$' '^identity\..*'
rabbitmqctl -q set_topic_permissions -p smarttravel identity_runtime identity.events '^identity\..*' '^identity\..*'
rabbitmqctl -q set_topic_permissions -p smarttravel identity_runtime identity.inbound '^$' '.*'
# The test-only publisher has no database credentials or access to the runtime's outbound exchange.
rabbitmqctl -q set_permissions -p smarttravel p01_fixture '^$' '^identity\.inbound$' '^$'
rabbitmqctl -q set_topic_permissions -p smarttravel p01_fixture identity.inbound '^(catalog\.(category\.changed|business-claim\.reviewed)|community\.review\.changed|trip\.changed|domain\.user-data-deleted)\.v1$' '^$'
# Optional operator credential is never injected into the normal application.
if [ -n "${BROKER_OPERATOR_PASSWORD:-}" ]; then
  if ! rabbitmqctl -q list_users | grep -q '^identity_operator[[:space:]]'; then
    rabbitmqctl -q add_user identity_operator "$BROKER_OPERATOR_PASSWORD" >/dev/null
  fi
  rabbitmqctl -q set_permissions -p smarttravel identity_operator '^$' '^identity\.inbound$' '^identity\.dlq$'
  rabbitmqctl -q set_topic_permissions -p smarttravel identity_operator identity.inbound '^(catalog\.(category\.changed|business-claim\.reviewed)|community\.review\.changed|trip\.changed|domain\.user-data-deleted)\.v1$' '^$'
fi

# Independent P01 service transports, enabled only when their workload secret is injected.
if [ -n "${CATALOG_BROKER_PASSWORD:-}" ]; then
  if ! rabbitmqctl -q list_users | grep -q '^catalog_runtime[[:space:]]'; then
    rabbitmqctl -q add_user catalog_runtime "$CATALOG_BROKER_PASSWORD" >/dev/null
  fi
  rabbitmqctl -q set_permissions -p smarttravel catalog_runtime '^catalog\..*' '^catalog\.(events|inbox|dlq|deadletters|p01\.capture)$' '^catalog\..*'
  rabbitmqctl -q set_topic_permissions -p smarttravel catalog_runtime catalog.events '^(catalog\..*|domain\.user-data-deleted\.v1)$' '.*'
  rabbitmqctl -q set_topic_permissions -p smarttravel catalog_runtime catalog.inbound '^$' '^(identity\.user\.status\-changed\.v1|identity\.user\.deletion\-requested\.v1|community\.rating\-summary\.changed\.v1|community\.contribution\.apply\-requested\.v1|ingestion\.place\.upsert\-requested\.v1|ingestion\.source\-policy\.changed\.v1)$'
  rabbitmqctl -q set_topic_permissions -p smarttravel p01_fixture catalog.inbound '^(identity\.user\.status\-changed\.v1|identity\.user\.deletion\-requested\.v1|community\.rating\-summary\.changed\.v1|community\.contribution\.apply\-requested\.v1|ingestion\.place\.upsert\-requested\.v1|ingestion\.source\-policy\.changed\.v1)$' '^$'
fi
if [ -n "${COMMUNITY_BROKER_PASSWORD:-}" ]; then
  if ! rabbitmqctl -q list_users | grep -q '^community_runtime[[:space:]]'; then
    rabbitmqctl -q add_user community_runtime "$COMMUNITY_BROKER_PASSWORD" >/dev/null
  fi
  rabbitmqctl -q set_permissions -p smarttravel community_runtime '^community\..*' '^community\.(events|inbox|dlq|deadletters|p01\.capture)$' '^community\..*'
  rabbitmqctl -q set_topic_permissions -p smarttravel community_runtime community.events '^(community\..*|domain\.user-data-deleted\.v1)$' '.*'
  rabbitmqctl -q set_topic_permissions -p smarttravel community_runtime community.inbound '^$' '^(identity\.user\.status\-changed\.v1|identity\.user\.deletion\-requested\.v1|catalog\.place\.upserted\.v1|catalog\.place\.visibility\-changed\.v1|catalog\.contribution\.applied\.v1|catalog\.contribution\.rejected\.v1)$'
  rabbitmqctl -q set_topic_permissions -p smarttravel p01_fixture community.inbound '^(identity\.user\.status\-changed\.v1|identity\.user\.deletion\-requested\.v1|catalog\.place\.upserted\.v1|catalog\.place\.visibility\-changed\.v1|catalog\.contribution\.applied\.v1|catalog\.contribution\.rejected\.v1)$' '^$'
fi
if [ -n "${TRIP_BROKER_PASSWORD:-}" ]; then
  if ! rabbitmqctl -q list_users | grep -q '^trip_runtime[[:space:]]'; then
    rabbitmqctl -q add_user trip_runtime "$TRIP_BROKER_PASSWORD" >/dev/null
  fi
  rabbitmqctl -q set_permissions -p smarttravel trip_runtime '^trip\..*' '^trip\.(events|inbox|dlq|deadletters|p01\.capture)$' '^trip\..*'
  rabbitmqctl -q set_topic_permissions -p smarttravel trip_runtime trip.events '^(trip\..*|domain\.user-data-deleted\.v1)$' '.*'
  rabbitmqctl -q set_topic_permissions -p smarttravel trip_runtime trip.inbound '^$' '^(identity\.user\.status\-changed\.v1|identity\.user\.deletion\-requested\.v1|catalog\.place\.upserted\.v1|catalog\.place\.visibility\-changed\.v1|catalog\.destination\.changed\.v1)$'
  rabbitmqctl -q set_topic_permissions -p smarttravel p01_fixture trip.inbound '^(identity\.user\.status\-changed\.v1|identity\.user\.deletion\-requested\.v1|catalog\.place\.upserted\.v1|catalog\.place\.visibility\-changed\.v1|catalog\.destination\.changed\.v1)$' '^$'
fi
if [ -n "${INGESTION_BROKER_PASSWORD:-}" ]; then
  if ! rabbitmqctl -q list_users | grep -q '^ingestion_runtime[[:space:]]'; then
    rabbitmqctl -q add_user ingestion_runtime "$INGESTION_BROKER_PASSWORD" >/dev/null
  fi
  rabbitmqctl -q set_permissions -p smarttravel ingestion_runtime '^ingestion\..*' '^ingestion\.(events|inbox|dlq|deadletters|p01\.capture)$' '^ingestion\..*'
  rabbitmqctl -q set_topic_permissions -p smarttravel ingestion_runtime ingestion.events '^(ingestion\..*|domain\.user-data-deleted\.v1)$' '.*'
  rabbitmqctl -q set_topic_permissions -p smarttravel ingestion_runtime ingestion.inbound '^$' '^(identity\.user\.status\-changed\.v1|identity\.user\.deletion\-requested\.v1|catalog\.place\-import\.applied\.v1|catalog\.place\-import\.rejected\.v1)$'
  rabbitmqctl -q set_topic_permissions -p smarttravel p01_fixture ingestion.inbound '^(identity\.user\.status\-changed\.v1|identity\.user\.deletion\-requested\.v1|catalog\.place\-import\.applied\.v1|catalog\.place\-import\.rejected\.v1)$' '^$'
fi
if [ -n "${INTELLIGENCE_BROKER_PASSWORD:-}" ]; then
  if ! rabbitmqctl -q list_users | grep -q '^intelligence_runtime[[:space:]]'; then
    rabbitmqctl -q add_user intelligence_runtime "$INTELLIGENCE_BROKER_PASSWORD" >/dev/null
  fi
  rabbitmqctl -q set_permissions -p smarttravel intelligence_runtime '^intelligence\..*' '^intelligence\.(events|inbox|dlq|deadletters|p01\.capture)$' '^intelligence\..*'
  rabbitmqctl -q set_topic_permissions -p smarttravel intelligence_runtime intelligence.events '^(intelligence\..*|domain\.user-data-deleted\.v1)$' '.*'
  rabbitmqctl -q set_topic_permissions -p smarttravel intelligence_runtime intelligence.inbound '^$' '^(identity\.user\.status\-changed\.v1|identity\.preferences\.changed\.v1|identity\.user\.deletion\-requested\.v1|catalog\.place\.upserted\.v1|catalog\.place\.visibility\-changed\.v1|catalog\.destination\.changed\.v1|catalog\.category\.changed\.v1|community\.rating\-summary\.changed\.v1|community\.review\.changed\.v1|community\.favorite\.changed\.v1|trip\.item\.added\.v1|ingestion\.source\-policy\.changed\.v1)$'
  rabbitmqctl -q set_topic_permissions -p smarttravel p01_fixture intelligence.inbound '^(identity\.user\.status\-changed\.v1|identity\.preferences\.changed\.v1|identity\.user\.deletion\-requested\.v1|catalog\.place\.upserted\.v1|catalog\.place\.visibility\-changed\.v1|catalog\.destination\.changed\.v1|catalog\.category\.changed\.v1|community\.rating\-summary\.changed\.v1|community\.review\.changed\.v1|community\.favorite\.changed\.v1|trip\.item\.added\.v1|ingestion\.source\-policy\.changed\.v1)$' '^$'
fi
rabbitmqctl -q set_permissions -p smarttravel p01_fixture '^$' '^(identity|catalog|community|trip|ingestion|intelligence)\.inbound$' '^(identity|catalog|community|trip|ingestion|intelligence)\.(p01\.capture|dlq)$'

if [ -n "${CATALOG_BROKER_OPERATOR_PASSWORD:-}" ]; then
  if ! rabbitmqctl -q list_users | grep -q '^catalog_operator[[:space:]]'; then
    rabbitmqctl -q add_user catalog_operator "$CATALOG_BROKER_OPERATOR_PASSWORD" >/dev/null
  fi
  rabbitmqctl -q set_permissions -p smarttravel catalog_operator '^$' '^catalog\.inbound$' '^catalog\.dlq$'
  rabbitmqctl -q set_topic_permissions -p smarttravel catalog_operator catalog.inbound '^(identity\.user\.status\-changed\.v1|identity\.user\.deletion\-requested\.v1|community\.rating\-summary\.changed\.v1|community\.contribution\.apply\-requested\.v1|ingestion\.place\.upsert\-requested\.v1|ingestion\.source\-policy\.changed\.v1)$' '^$'
fi

if [ -n "${COMMUNITY_BROKER_OPERATOR_PASSWORD:-}" ]; then
  if ! rabbitmqctl -q list_users | grep -q '^community_operator[[:space:]]'; then
    rabbitmqctl -q add_user community_operator "$COMMUNITY_BROKER_OPERATOR_PASSWORD" >/dev/null
  fi
  rabbitmqctl -q set_permissions -p smarttravel community_operator '^$' '^community\.inbound$' '^community\.dlq$'
  rabbitmqctl -q set_topic_permissions -p smarttravel community_operator community.inbound '^(identity\.user\.status\-changed\.v1|identity\.user\.deletion\-requested\.v1|catalog\.place\.upserted\.v1|catalog\.place\.visibility\-changed\.v1|catalog\.contribution\.applied\.v1|catalog\.contribution\.rejected\.v1)$' '^$'
fi

if [ -n "${TRIP_BROKER_OPERATOR_PASSWORD:-}" ]; then
  if ! rabbitmqctl -q list_users | grep -q '^trip_operator[[:space:]]'; then
    rabbitmqctl -q add_user trip_operator "$TRIP_BROKER_OPERATOR_PASSWORD" >/dev/null
  fi
  rabbitmqctl -q set_permissions -p smarttravel trip_operator '^$' '^trip\.inbound$' '^trip\.dlq$'
  rabbitmqctl -q set_topic_permissions -p smarttravel trip_operator trip.inbound '^(identity\.user\.status\-changed\.v1|identity\.user\.deletion\-requested\.v1|catalog\.place\.upserted\.v1|catalog\.place\.visibility\-changed\.v1|catalog\.destination\.changed\.v1)$' '^$'
fi

if [ -n "${INGESTION_BROKER_OPERATOR_PASSWORD:-}" ]; then
  if ! rabbitmqctl -q list_users | grep -q '^ingestion_operator[[:space:]]'; then
    rabbitmqctl -q add_user ingestion_operator "$INGESTION_BROKER_OPERATOR_PASSWORD" >/dev/null
  fi
  rabbitmqctl -q set_permissions -p smarttravel ingestion_operator '^$' '^ingestion\.inbound$' '^ingestion\.dlq$'
  rabbitmqctl -q set_topic_permissions -p smarttravel ingestion_operator ingestion.inbound '^(identity\.user\.status\-changed\.v1|identity\.user\.deletion\-requested\.v1|catalog\.place\-import\.applied\.v1|catalog\.place\-import\.rejected\.v1)$' '^$'
fi

if [ -n "${INTELLIGENCE_BROKER_OPERATOR_PASSWORD:-}" ]; then
  if ! rabbitmqctl -q list_users | grep -q '^intelligence_operator[[:space:]]'; then
    rabbitmqctl -q add_user intelligence_operator "$INTELLIGENCE_BROKER_OPERATOR_PASSWORD" >/dev/null
  fi
  rabbitmqctl -q set_permissions -p smarttravel intelligence_operator '^$' '^intelligence\.inbound$' '^intelligence\.dlq$'
  rabbitmqctl -q set_topic_permissions -p smarttravel intelligence_operator intelligence.inbound '^(identity\.user\.status\-changed\.v1|identity\.preferences\.changed\.v1|identity\.user\.deletion\-requested\.v1|catalog\.place\.upserted\.v1|catalog\.place\.visibility\-changed\.v1|catalog\.destination\.changed\.v1|catalog\.category\.changed\.v1|community\.rating\-summary\.changed\.v1|community\.review\.changed\.v1|community\.favorite\.changed\.v1|trip\.item\.added\.v1|ingestion\.source\-policy\.changed\.v1)$' '^$'
fi
