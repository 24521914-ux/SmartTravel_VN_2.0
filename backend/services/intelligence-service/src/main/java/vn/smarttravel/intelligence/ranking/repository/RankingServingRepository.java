package vn.smarttravel.intelligence.ranking.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * JDBC persistence layer for online recommendation requests, results, impressions, and feedback.
 */
@Repository
public class RankingServingRepository {

    private final JdbcTemplate db;

    public RankingServingRepository(JdbcTemplate db) {
        this.db = db;
    }

    public void setRequestTimeouts() {
        db.execute("SET LOCAL lock_timeout='500ms'; SET LOCAL statement_timeout='2500ms'");
    }

    public void insertEmptyRecommendationRequest(
            UUID requestId,
            UUID userId,
            UUID sessionId,
            String mode,
            String algorithmVersion,
            String criteriaJson,
            int topN,
            int latencyMs,
            String fallbackReason,
            UUID configVersionId,
            UUID deploymentId,
            boolean degraded,
            String degradedReasonsJson,
            int candidateCount,
            String scorerAvailabilityJson,
            String effectiveWeightsJson,
            String emptyReason,
            String debugPayloadJson
    ) {
        db.update("""
                INSERT INTO intelligence.recommendation_requests(
                  request_id, user_id, session_id, mode, algorithm_version, model_version_id,
                  criteria, top_n, latency_ms, fallback_reason,
                  ranking_config_version_id, deployment_id, degraded, degraded_reasons,
                  candidate_count, returned_count, is_admin_test, scorer_availability,
                  effective_weights_summary, empty_reason, debug_payload
                ) VALUES (?,?,?,?,?,NULL,?::jsonb,?,?,?,?,?,?,?::jsonb,?,?,false,?::jsonb,?::jsonb,?,?::jsonb)
                """,
                requestId,
                userId,
                sessionId,
                mode,
                algorithmVersion,
                criteriaJson,
                topN,
                latencyMs,
                fallbackReason,
                configVersionId,
                deploymentId,
                degraded,
                degradedReasonsJson,
                candidateCount,
                0,
                scorerAvailabilityJson,
                effectiveWeightsJson,
                emptyReason,
                debugPayloadJson
        );
    }

    public void insertRecommendationRequestAndResults(
            UUID requestId,
            UUID userId,
            UUID sessionId,
            String mode,
            String algorithmVersion,
            String criteriaJson,
            int topN,
            int latencyMs,
            String fallbackReason,
            UUID configVersionId,
            UUID deploymentId,
            boolean degraded,
            String degradedReasonsJson,
            int candidateCount,
            int returnedCount,
            String scorerAvailabilityJson,
            String effectiveWeightsJson,
            String emptyReason,
            String debugPayloadJson,
            List<ResultRow> resultRows
    ) {
        StringBuilder valuesSql = new StringBuilder();
        List<Object> params = new ArrayList<>(20 + resultRows.size() * 5);
        params.add(requestId);
        params.add(userId);
        params.add(sessionId);
        params.add(mode);
        params.add(algorithmVersion);
        params.add(criteriaJson);
        params.add(topN);
        params.add(latencyMs);
        params.add(fallbackReason);
        params.add(configVersionId);
        params.add(deploymentId);
        params.add(degraded);
        params.add(degradedReasonsJson);
        params.add(candidateCount);
        params.add(returnedCount);
        params.add(scorerAvailabilityJson);
        params.add(effectiveWeightsJson);
        params.add(emptyReason);
        params.add(debugPayloadJson);

        for (int i = 0; i < resultRows.size(); i++) {
            ResultRow row = resultRows.get(i);
            if (i > 0) valuesSql.append(',');
            valuesSql.append("((SELECT request_id FROM req),?,?,?,?::jsonb,?)");
            params.add(row.placeId());
            params.add(row.rank());
            params.add(row.score());
            params.add(row.explanationJson());
            params.add(row.catalogVersion());
        }

        db.update("""
                WITH req AS (
                  INSERT INTO intelligence.recommendation_requests(
                    request_id, user_id, session_id, mode, algorithm_version, model_version_id,
                    criteria, top_n, latency_ms, fallback_reason,
                    ranking_config_version_id, deployment_id, degraded, degraded_reasons,
                    candidate_count, returned_count, is_admin_test, scorer_availability,
                    effective_weights_summary, empty_reason, debug_payload
                  ) VALUES (?,?,?,?,?,NULL,?::jsonb,?,?,?,?,?,?,?::jsonb,?,?,false,?::jsonb,?::jsonb,?,?::jsonb)
                  RETURNING request_id
                )
                INSERT INTO intelligence.recommendation_results(request_id, place_id, rank, score, explanation, catalog_version)
                VALUES """ + valuesSql,
                params.toArray()
        );
    }

    public List<Map<String, Object>> findRequestDebug(UUID requestId) {
        return db.queryForList("""
                SELECT request_id, created_at, algorithm_version, latency_ms, fallback_reason,
                       degraded, candidate_count, returned_count, debug_payload
                FROM intelligence.recommendation_requests
                WHERE request_id = ?
                """, requestId);
    }

    public List<Map<String, Object>> findResultRankAndAdminFlag(UUID requestId, UUID placeId) {
        return db.queryForList("""
                SELECT r.rank, q.is_admin_test
                FROM intelligence.recommendation_results r
                JOIN intelligence.recommendation_requests q ON q.request_id = r.request_id
                WHERE r.request_id = ? AND r.place_id = ?
                """, requestId, placeId);
    }

    public int insertImpression(
            UUID impressionId,
            String idemKey,
            UUID requestId,
            UUID placeId,
            int authoritativeRank,
            UUID persistedUserId,
            UUID sessionId,
            Long consentVersion,
            boolean isAdminTest,
            Instant viewedAt
    ) {
        return db.update("""
                INSERT INTO intelligence.recommendation_impressions(
                  impression_id, idempotency_key, request_id, place_id, rank,
                  user_id, session_id, consent_version, is_admin_test, viewed_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT (idempotency_key) DO NOTHING
                """,
                impressionId, idemKey, requestId, placeId, authoritativeRank,
                persistedUserId, sessionId, consentVersion, isAdminTest, Timestamp.from(viewedAt)
        );
    }

    public int insertFeedback(
            UUID feedbackId,
            String idemKey,
            UUID requestId,
            UUID placeId,
            int authoritativeRank,
            String action,
            UUID persistedUserId,
            UUID sessionId,
            Long consentVersion,
            boolean isAdminTest,
            Instant occurredAt
    ) {
        return db.update("""
                INSERT INTO intelligence.recommendation_feedback(
                  feedback_id, idempotency_key, request_id, place_id, rank, action_type,
                  user_id, session_id, consent_version, is_admin_test, occurred_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT (idempotency_key) DO NOTHING
                """,
                feedbackId, idemKey, requestId, placeId, authoritativeRank, action,
                persistedUserId, sessionId, consentVersion, isAdminTest, Timestamp.from(occurredAt)
        );
    }

    public record ResultRow(UUID placeId, int rank, double score, String explanationJson, long catalogVersion) {}
}
