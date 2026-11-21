import type { Resource, TravelClient } from '../../shared/api';

export interface RankingExplanation {
  reason_codes: string[];
  reasons_vi: string[];
  reasons_en: string[];
  summary_vi: string;
  summary_en: string;
}

export interface RankingItemFacts {
  name: string;
  name_en?: string | null;
  address?: string | null;
  category_ids: string[];
  geographic_unit_id?: string | null;
  destination_ids: string[];
  price_min?: number | null;
  price_max?: number | null;
  currency: string;
  price_basis?: 'PER_PERSON' | 'PER_VISIT' | 'OFFERING';
  rating_avg?: number | null;
  rating_count: number;
  distance_km?: number | null;
  distance_note?: string | null;
  opening_status: 'OPEN' | 'CLOSED' | 'UNKNOWN';
  space_type: 'INDOOR' | 'OUTDOOR' | 'BOTH' | 'UNKNOWN';
}

export interface RankingResultItem {
  place_id: string;
  rank: number;
  explanation: RankingExplanation;
  facts: RankingItemFacts;
}

export interface RankingResponse {
  recommendation_request_id: string;
  request_id: string;
  algorithm_version: string;
  ranking_config_version: string;
  scorer_versions: Record<string, string>;
  model_versions: Record<string, string>;
  quality_status: string;
  data_as_of: string;
  fallback: boolean;
  fallback_reason: string | null;
  degraded: boolean;
  degraded_reasons: string[];
  partial: boolean;
  empty_reason: string | null;
  personalized: boolean;
  analytics_allowed: boolean;
  candidate_count: number;
  total_returned: number;
  results: RankingResultItem[];
}

export interface RankingStats {
  published_places_count: number;
  destinations_count: number;
  geographic_units_count: number;
  categories_count: number;
  data_as_of: string | null;
  active_config_version: string;
  quality_status: string;
  cf_active: boolean;
}

export interface RankingRequestPayload {
  topN: number;
  currency: 'VND';
  budget_basis?: 'PER_PERSON' | 'PER_VISIT' | 'OFFERING';
  destination_id?: string;
  geographic_unit_id?: string;
  expanded_geo_unit_ids?: string[];
  category_ids?: string[];
  hard_tags?: string[];
  soft_preferences?: Record<string, number>;
  min_budget?: number;
  max_budget?: number;
  min_rating?: number;
  space_type?: 'INDOOR' | 'OUTDOOR';
  origin?: { latitude: number; longitude: number };
  max_distance_km?: number;
  visit_time?: 'MORNING' | 'NOON' | 'AFTERNOON' | 'EVENING';
  timezone?: string;
  exclude_closed?: boolean;
  include_unknown_price?: boolean;
  personalization?: 'AUTO' | 'OFF';
  session_id?: string;
}

export function fetchRanking(
  travel: TravelClient,
  payload: RankingRequestPayload,
): Promise<RankingResponse> {
  return travel.mutate<RankingResponse>('intelligence', '/recommendations/rank', payload, 'POST');
}

export function fetchRankingStats(travel: TravelClient): Promise<RankingStats> {
  return travel.read<RankingStats>('intelligence', '/recommendations/stats');
}

export function sendImpressions(
  travel: TravelClient,
  sessionId: string,
  items: Array<{
    idempotency_key: string;
    recommendation_request_id: string;
    place_id: string;
    viewed_at: string;
  }>,
): Promise<Resource> {
  return travel.mutate<Resource>('intelligence', '/recommendations/impressions', {
    session_id: sessionId,
    items,
  }, 'POST');
}

export function sendRankingFeedback(
  travel: TravelClient,
  payload: {
    idempotency_key: string;
    recommendation_request_id: string;
    place_id: string;
    action_type: 'CLICK' | 'ACCEPT' | 'SKIP' | 'ADD_TO_TRIP_CLICK' | 'FAVORITE_CLICK';
    occurred_at: string;
    session_id?: string;
  },
): Promise<Resource> {
  return travel.mutate<Resource>('intelligence', '/recommendations/feedback', payload, 'POST');
}

// ── Admin Ranking APIs ────────────────────────────────────────────────────────

export const adminRankingApi = {
  runPlayground: (travel: TravelClient, body: Record<string, unknown>) =>
    travel.mutate<Resource>('intelligence', '/admin/ranking/playground', body, 'POST'),

  syncProjections: (travel: TravelClient) =>
    travel.mutate<Resource>('intelligence', '/admin/ranking/projections/sync', {}, 'POST'),

  recomputeCohorts: (travel: TravelClient, windowDays = 30, minSample = 5) =>
    travel.mutate<Resource>('intelligence', `/admin/ranking/cohort-snapshots/recompute?windowDays=${windowDays}&minSample=${minSample}`, {}, 'POST'),

  listCohortSnapshots: (travel: TravelClient) =>
    travel.read<{ items: Resource[] }>('intelligence', '/admin/ranking/cohort-snapshots'),

  listConfigs: (travel: TravelClient) =>
    travel.read<{ items: Resource[] }>('intelligence', '/admin/ranking/configs'),

  createConfig: (travel: TravelClient, body: Record<string, unknown>) =>
    travel.mutate<Resource>('intelligence', '/admin/ranking/configs', body, 'POST'),

  updateDraftConfig: (travel: TravelClient, id: string, body: Record<string, unknown>) =>
    travel.mutate<Resource>('intelligence', `/admin/ranking/configs/${encodeURIComponent(id)}`, body, 'PATCH'),

  validateConfig: (travel: TravelClient, id: string, body: Record<string, unknown> = {}) =>
    travel.mutate<Resource>('intelligence', `/admin/ranking/configs/${encodeURIComponent(id)}/validate`, body, 'POST'),

  listDeployments: (travel: TravelClient) =>
    travel.read<{ items: Resource[] }>('intelligence', '/admin/ranking/deployments'),

  activateDeployment: (travel: TravelClient, body: Record<string, unknown>) =>
    travel.mutate<Resource>('intelligence', '/admin/ranking/deployments/activate', body, 'POST'),

  rollbackDeployment: (travel: TravelClient, deploymentId: string, reason: string) =>
    travel.mutate<Resource>('intelligence', `/admin/ranking/deployments/${encodeURIComponent(deploymentId)}/rollback`, { reason }, 'POST'),

  listCfJobs: (travel: TravelClient) =>
    travel.read<{ items: Resource[] }>('intelligence', '/admin/ranking/cf/jobs'),

  enqueueCfBuild: (travel: TravelClient, body: Record<string, unknown>) =>
    travel.mutate<Resource>('intelligence', '/admin/ranking/cf/jobs', body, 'POST'),

  cancelCfJob: (travel: TravelClient, jobId: string) =>
    travel.mutate<Resource>('intelligence', `/admin/ranking/cf/jobs/${encodeURIComponent(jobId)}/cancel`, {}, 'POST'),

  listCfArtifacts: (travel: TravelClient) =>
    travel.read<{ items: Resource[] }>('intelligence', '/admin/ranking/cf/artifacts'),

  validateCfArtifact: (travel: TravelClient, artifactId: string, body: Record<string, unknown> = {}) =>
    travel.mutate<Resource>('intelligence', `/admin/ranking/cf/artifacts/${encodeURIComponent(artifactId)}/validate`, body, 'POST'),

  listDatasets: (travel: TravelClient) =>
    travel.read<{ items: Resource[] }>('intelligence', '/admin/ranking/datasets'),

  createDataset: (travel: TravelClient, body: Record<string, unknown>) =>
    travel.mutate<Resource>('intelligence', '/admin/ranking/datasets', body, 'POST'),

  getDataset: (travel: TravelClient, id: string) =>
    travel.read<Resource>('intelligence', `/admin/ranking/datasets/${encodeURIComponent(id)}`),

  upsertJudgment: (travel: TravelClient, datasetId: string, body: Record<string, unknown>) =>
    travel.mutate<Resource>('intelligence', `/admin/ranking/datasets/${encodeURIComponent(datasetId)}/judgments`, body, 'POST'),

  importJudgments: (travel: TravelClient, datasetId: string, format: 'CSV' | 'JSONL', content: string) =>
    travel.mutate<Resource>('intelligence', `/admin/ranking/datasets/${encodeURIComponent(datasetId)}/import`, { format, content }, 'POST'),

  exportDataset: (travel: TravelClient, datasetId: string, format: 'CSV' | 'JSONL') =>
    travel.read<{ format: string; row_count: number; content: string }>('intelligence', `/admin/ranking/datasets/${encodeURIComponent(datasetId)}/export?format=${format}`),

  freezeDataset: (travel: TravelClient, datasetId: string) =>
    travel.mutate<Resource>('intelligence', `/admin/ranking/datasets/${encodeURIComponent(datasetId)}/freeze`, {}, 'POST'),

  seedFixtureDataset: (travel: TravelClient) =>
    travel.mutate<Resource>('intelligence', '/admin/ranking/datasets/seed-fixture', {}, 'POST'),

  createLabelingPool: (travel: TravelClient, body: Record<string, unknown> = {}) =>
    travel.mutate<Resource>('intelligence', '/admin/ranking/datasets/create-labeling-pool', body, 'POST'),

  listEvaluations: (travel: TravelClient) =>
    travel.read<{ items: Resource[] }>('intelligence', '/admin/ranking/evaluations'),

  startEvaluation: (travel: TravelClient, body: Record<string, unknown>) =>
    travel.mutate<Resource>('intelligence', '/admin/ranking/evaluations', body, 'POST'),

  cancelEvaluation: (travel: TravelClient, runId: string) =>
    travel.mutate<Resource>('intelligence', `/admin/ranking/evaluations/${encodeURIComponent(runId)}/cancel`, {}, 'POST'),

  listTuningJobs: (travel: TravelClient) =>
    travel.read<{ items: Resource[] }>('intelligence', '/admin/ranking/tuning'),

  startTuning: (travel: TravelClient, body: Record<string, unknown>) =>
    travel.mutate<Resource>('intelligence', '/admin/ranking/tuning', body, 'POST'),

  cancelTuning: (travel: TravelClient, jobId: string) =>
    travel.mutate<Resource>('intelligence', `/admin/ranking/tuning/${encodeURIComponent(jobId)}/cancel`, {}, 'POST'),

  listTuningTrials: (travel: TravelClient, jobId: string) =>
    travel.read<{ items: Resource[] }>('intelligence', `/admin/ranking/tuning/${encodeURIComponent(jobId)}/trials`),

  getAnalytics: (travel: TravelClient, windowHours = 168) =>
    travel.read<Resource>('intelligence', `/admin/ranking/analytics?windowHours=${windowHours}`),
};
