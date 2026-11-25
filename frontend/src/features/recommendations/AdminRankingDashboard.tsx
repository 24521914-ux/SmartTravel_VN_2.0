import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Resource, TravelClient } from '../../shared/api';
import { Button, Icon } from '../../shared/ui';
import { useToast } from '../../app/providers/ToastProvider';
import { adminRankingApi } from './ranking-api';
import './admin-ranking.css';

type AdminTab = 'playground' | 'datasets' | 'eval' | 'registry' | 'analytics';

export interface AdminRankingDashboardProps {
  travel: TravelClient;
}

const fmt = (v: unknown, digits = 4) => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
};

const fmtPct = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—';
};

const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatOpeningSummary = (raw: unknown): string => {
  if (!Array.isArray(raw) || raw.length === 0) return '';
  const first = raw[0] as Record<string, unknown>;
  const open = String(first.open ?? first.open_time ?? '').slice(0, 5);
  const close = String(first.close ?? first.close_time ?? '').slice(0, 5);
  if (!open || !close) return '';
  return raw.length > 1 ? `${open}–${close} (+${raw.length - 1} ca)` : `${open}–${close}`;
};

export function AdminRankingDashboard({ travel }: AdminRankingDashboardProps) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<AdminTab>('playground');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Shared registry state
  const [configs, setConfigs] = useState<Resource[]>([]);
  const [deployments, setDeployments] = useState<Resource[]>([]);
  const [cohorts, setCohorts] = useState<Resource[]>([]);
  const [cfJobs, setCfJobs] = useState<Resource[]>([]);
  const [cfArtifacts, setCfArtifacts] = useState<Resource[]>([]);
  const [datasets, setDatasets] = useState<Resource[]>([]);
  const [evaluations, setEvaluations] = useState<Resource[]>([]);
  const [tuningJobs, setTuningJobs] = useState<Resource[]>([]);
  const [analytics, setAnalytics] = useState<Resource | null>(null);
  const [catalogPlaces, setCatalogPlaces] = useState<Resource[]>([]);
  const [categories, setCategories] = useState<Resource[]>([]);
  const [destinations, setDestinations] = useState<Resource[]>([]);
  const [geoUnits, setGeoUnits] = useState<Resource[]>([]);

  // Tab A: Playground state
  const [pgConfigA, setPgConfigA] = useState('');
  const [pgConfigB, setPgConfigB] = useState('');
  const [pgDestId, setPgDestId] = useState('');
  const [pgCatId, setPgCatId] = useState('');
  const [pgSoftTags, setPgSoftTags] = useState('quiet, heritage');
  const [pgMaxBudget, setPgMaxBudget] = useState('');
  const [pgOriginLat, setPgOriginLat] = useState('');
  const [pgOriginLon, setPgOriginLon] = useState('');
  const [pgMaxDist, setPgMaxDist] = useState('');
  const [pgTopN, setPgTopN] = useState('10');
  const [pgResult, setPgResult] = useState<Resource | null>(null);

  // Tab B: Datasets & Labeling state
  const [selectedDatasetId, setSelectedDatasetId] = useState('');
  const [selectedDatasetDetail, setSelectedDatasetDetail] = useState<Resource | null>(null);
  const [dsName, setDsName] = useState('');
  const [dsTier, setDsTier] = useState<'HUMAN_LABELED' | 'SYNTHETIC_FIXTURE' | 'REAL_BEHAVIORAL'>('HUMAN_LABELED');
  const [importFormat, setImportFormat] = useState<'JSONL' | 'CSV'>('CSV');
  const [importContent, setImportContent] = useState('');
  const [importErrors, setImportErrors] = useState<Resource[]>([]);
  const [exportOutput, setExportOutput] = useState('');
  const [labelQueryId, setLabelQueryId] = useState('q-manual-1');
  const [labelSplit, setLabelSplit] = useState<'TRAIN' | 'VALIDATION' | 'TEST'>('VALIDATION');
  const [labelPlaceId, setLabelPlaceId] = useState('');
  const [labelGrade, setLabelGrade] = useState('2');
  const [queueSplitFilter, setQueueSplitFilter] = useState<'ALL' | 'VALIDATION' | 'TEST' | 'TRAIN'>('ALL');
  const [queueStatusFilter, setQueueStatusFilter] = useState<'ALL' | 'UNLABELED' | 'LABELED' | 'INSUFFICIENT_INFO'>('ALL');
  const [queueQueryFilter, setQueueQueryFilter] = useState('ALL');
  const [savingJudgmentKey, setSavingJudgmentKey] = useState('');

  // Tab C: Eval & Tuning state
  const [evalDatasetId, setEvalDatasetId] = useState('');
  const [evalConfigId, setEvalConfigId] = useState('');
  const [evalBaselineMode, setEvalBaselineMode] = useState('HYBRID_V1');
  const [evalSplit, setEvalSplit] = useState('VALIDATION');
  const [tuneStrategy, setTuneStrategy] = useState<'RANDOM' | 'GRID'>('RANDOM');
  const [tuneSeed, setTuneSeed] = useState('42');
  const [tuneTrials, setTuneTrials] = useState('12');
  const [tuneAllowDemo, setTuneAllowDemo] = useState(false);
  const [selectedTrials, setSelectedTrials] = useState<Resource[]>([]);

  // Tab D: Config creation & Activation state
  const [cfgName, setCfgName] = useState('');
  const [cfgTag, setCfgTag] = useState('');
  const [wBasic, setWBasic] = useState('0.20');
  const [wContent, setWContent] = useState('0.45');
  const [wCf, setWCf] = useState('0.10');
  const [wContext, setWContext] = useState('0.25');
  const [activateReason, setActivateReason] = useState('');
  const [activateAllowDemo, setActivateAllowDemo] = useState(false);
  const [analyticsHours, setAnalyticsHours] = useState(168);

  const runAction = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Thao tác thất bại.');
    } finally {
      setBusy(false);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [
        cfgs, deps, cohs, jobs, arts, dss, evals, tunes, an, placesRes, catsRes, destsRes, geoRes,
      ] = await Promise.all([
        adminRankingApi.listConfigs(travel).catch(() => ({ items: [] })),
        adminRankingApi.listDeployments(travel).catch(() => ({ items: [] })),
        adminRankingApi.listCohortSnapshots(travel).catch(() => ({ items: [] })),
        adminRankingApi.listCfJobs(travel).catch(() => ({ items: [] })),
        adminRankingApi.listCfArtifacts(travel).catch(() => ({ items: [] })),
        adminRankingApi.listDatasets(travel).catch(() => ({ items: [] })),
        adminRankingApi.listEvaluations(travel).catch(() => ({ items: [] })),
        adminRankingApi.listTuningJobs(travel).catch(() => ({ items: [] })),
        adminRankingApi.getAnalytics(travel, analyticsHours).catch(() => null),
        travel.readAll('catalog', '/places').catch(() => ({ items: [] })),
        travel.readAll('catalog', '/categories').catch(() => ({ items: [] })),
        travel.readAll('catalog', '/destinations').catch(() => ({ items: [] })),
        travel.readAll('catalog', '/geographic-units').catch(() => ({ items: [] })),
      ]);
      setConfigs(cfgs.items ?? []);
      setDeployments(deps.items ?? []);
      setCohorts(cohs.items ?? []);
      setCfJobs(jobs.items ?? []);
      setCfArtifacts(arts.items ?? []);
      setDatasets(dss.items ?? []);
      setEvaluations(evals.items ?? []);
      setTuningJobs(tunes.items ?? []);
      setAnalytics(an);
      setCatalogPlaces(placesRes.items ?? []);
      setCategories(catsRes.items ?? []);
      setDestinations(destsRes.items ?? []);
      setGeoUnits(geoRes.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được dữ liệu Recommendation Admin.');
    } finally {
      setBusy(false);
    }
  }, [travel, analyticsHours]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const loadDatasetDetail = async (id: string) => {
    setSelectedDatasetId(id);
    if (!id) {
      setSelectedDatasetDetail(null);
      return;
    }
    await runAction(async () => {
      const detail = await adminRankingApi.getDataset(travel, id);
      setSelectedDatasetDetail(detail);
    });
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleRunPlayground = async (e: FormEvent) => {
    e.preventDefault();
    const softPrefs: Record<string, number> = {};
    for (const raw of pgSoftTags.split(',')) {
      const k = raw.trim().toLowerCase();
      if (k) softPrefs[k] = 1.0;
    }
    const req: Record<string, unknown> = {
      topN: Math.max(1, Math.min(50, Number(pgTopN) || 10)),
      currency: 'VND',
      soft_preferences: softPrefs,
    };
    if (pgDestId) req.destination_id = pgDestId;
    if (pgCatId) req.category_ids = [pgCatId];
    if (pgMaxBudget.trim()) req.max_budget = Number(pgMaxBudget);
    if (pgOriginLat.trim() && pgOriginLon.trim()) {
      req.origin = { latitude: Number(pgOriginLat), longitude: Number(pgOriginLon) };
      if (pgMaxDist.trim()) req.max_distance_km = Number(pgMaxDist);
    }
    const body: Record<string, unknown> = { request: req };
    if (pgConfigA) body.config_version_id = pgConfigA;
    if (pgConfigB) body.compare_config_version_id = pgConfigB;

    await runAction(async () => {
      const res = await adminRankingApi.runPlayground(travel, body);
      setPgResult(res);
    });
  };

  const handleCreateDataset = async (e: FormEvent) => {
    e.preventDefault();
    if (!dsName.trim()) return;
    await runAction(async () => {
      const created = await adminRankingApi.createDataset(travel, {
        name: dsName.trim(),
        dataset_kind: 'JUDGMENT',
        provenance_tier: dsTier,
      });
      setDsName('');
      await refreshAll();
      await loadDatasetDetail(String(created.eval_dataset_id));
      showToast('Đã tạo phiên bản dataset đánh giá.', 'success');
    });
  };

  const handleUpsertJudgment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedDatasetId || !labelPlaceId) return;
    await runAction(async () => {
      const updated = await adminRankingApi.upsertJudgment(travel, selectedDatasetId, {
        query_id: labelQueryId.trim(),
        scenario_group: labelQueryId.trim(),
        place_id: labelPlaceId,
        relevance_grade: Number(labelGrade),
        split: labelSplit,
        request_payload: { topN: 10, currency: 'VND' },
      });
      setSelectedDatasetDetail(updated);
      await refreshAll();
      showToast('Đã lưu nhãn relevance (0..3).', 'success');
    });
  };

  const handleImportJudgments = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedDatasetId || !importContent.trim()) return;
    await runAction(async () => {
      const res = await adminRankingApi.importJudgments(travel, selectedDatasetId, importFormat, importContent);
      setImportErrors((res.validation_errors as Resource[]) ?? []);
      setSelectedDatasetDetail((res.dataset as Resource) ?? null);
      await refreshAll();
      showToast(`Đã import ${String(res.imported ?? 0)} dòng judgment.`, 'success');
    });
  };

  const handleQuickLabel = async (
    j: Resource,
    judgmentStatus: 'LABELED' | 'INSUFFICIENT_INFO' | 'UNLABELED',
    relevanceGrade: number | null,
  ) => {
    if (!selectedDatasetId) return;
    const key = `${String(j.query_id)}:${String(j.place_id)}`;
    setSavingJudgmentKey(key);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        query_id: String(j.query_id),
        scenario_group: String(j.scenario_group),
        place_id: String(j.place_id),
        split: String(j.split),
        judgment_status: judgmentStatus,
        provenance: judgmentStatus === 'UNLABELED' ? 'HUMAN_REVIEW_PENDING' : 'HUMAN_UI',
      };
      if (judgmentStatus === 'LABELED' && relevanceGrade !== null) {
        payload.relevance_grade = relevanceGrade;
      }
      const updated = await adminRankingApi.upsertJudgment(travel, selectedDatasetId, payload);
      setSelectedDatasetDetail(updated);
      setDatasets(prev =>
        prev.map(ds =>
          String(ds.eval_dataset_id) === selectedDatasetId
            ? {
                ...ds,
                row_count: updated.row_count,
                query_count: updated.query_count,
                labeled_count: updated.labeled_count,
                unlabeled_count: updated.unlabeled_count,
                insufficient_info_count: updated.insufficient_info_count,
              }
            : ds,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không lưu được nhãn đánh giá.');
    } finally {
      setSavingJudgmentKey('');
    }
  };

  const handleCreateConfig = async (e: FormEvent) => {
    e.preventDefault();
    await runAction(async () => {
      await adminRankingApi.createConfig(travel, {
        name: cfgName.trim() || `Hybrid Draft ${Date.now()}`,
        version_tag: cfgTag.trim() || undefined,
        weights: {
          basic: Number(wBasic),
          content: Number(wContent),
          collaborative: Number(wCf),
          context: Number(wContext),
        },
        normalize_weights: true,
      });
      setCfgName('');
      setCfgTag('');
      await refreshAll();
      showToast('Đã tạo cấu hình DRAFT mới.', 'success');
    });
  };

  const activeDeployment = deployments.find(d => !d.deactivated_at) ?? null;

  return (
    <section className="ark-root" aria-labelledby="ark-heading">
      <div className="ark-header">
        <div>
          <h2 id="ark-heading" className="ark-title">
            Quản trị Recommendation Ranking (Hybrid B/C/F/X)
          </h2>
          <p className="ark-subtitle">
            Playground không làm ô nhiễm analytics · Dataset &amp; Labeling · Evaluation &amp; Tuning · Config/CF Registry &amp; Rollback · Operational Analytics.
          </p>
        </div>
        <div className="ark-header-actions">
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void runAction(async () => {
              await adminRankingApi.syncProjections(travel);
              await refreshAll();
              showToast('Đã đồng bộ projection từ Catalog/Community/Identity/Trip và tính lại cohort snapshot.', 'success');
            })}
          >
            <Icon name="refresh" size={15} /> Đồng bộ Projection &amp; Cohort
          </Button>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => void refreshAll()}>
            Làm mới
          </Button>
        </div>
      </div>

      {activeDeployment && (
        <div className="ark-banner" role="status">
          <strong>Active Deployment:</strong>{' '}
          <code>{String(activeDeployment.config_version_tag)}</code> ·{' '}
          Trạng thái chất lượng:{' '}
          <span className={`ark-pill ${activeDeployment.quality_status === 'PASSED' ? 'is-ok' : 'is-warn'}`}>
            {String(activeDeployment.quality_status)}
          </span>
          {Boolean(activeDeployment.is_demo_activation) && (
            <span className="ark-pill is-warn" style={{ marginLeft: 6 }}>DEMO ACTIVATION</span>
          )}
          {' · '}Lý do: {String(activeDeployment.reason ?? '—')}
        </div>
      )}

      {error && <div className="ark-alert" role="alert">{error}</div>}

      <nav className="ark-tabs" role="tablist" aria-label="Phân hệ quản trị Recommendation">
        {([
          ['playground', 'A. Ranking Playground'],
          ['datasets', 'B. Dataset & Labeling'],
          ['eval', 'C. Evaluation & Tuning'],
          ['registry', 'D. Config, CF & Deployment'],
          ['analytics', 'E. Operational Analytics'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`ark-tab ${tab === id ? 'is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* ── TAB A: RANKING PLAYGROUND ── */}
      {tab === 'playground' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <form className="ark-card" onSubmit={e => void handleRunPlayground(e)}>
            <h3>A. Ranking Playground &amp; So sánh cấu hình (is_admin_test = true)</h3>
            <div className="ark-form-grid">
              <label className="ark-field">
                <span>Config chính (A)</span>
                <select value={pgConfigA} onChange={e => setPgConfigA(e.target.value)}>
                  <option value="">Active deployment hiện tại</option>
                  {configs.map(c => (
                    <option key={String(c.config_version_id)} value={String(c.config_version_id)}>
                      {String(c.version_tag)} ({String(c.lifecycle_status)} / {String(c.quality_status)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="ark-field">
                <span>So sánh với Config (B)</span>
                <select value={pgConfigB} onChange={e => setPgConfigB(e.target.value)}>
                  <option value="">Không so sánh</option>
                  {configs.map(c => (
                    <option key={String(c.config_version_id)} value={String(c.config_version_id)}>
                      {String(c.version_tag)} ({String(c.lifecycle_status)})
                    </option>
                  ))}
                </select>
              </label>
              <label className="ark-field">
                <span>Destination scope</span>
                <select value={pgDestId} onChange={e => setPgDestId(e.target.value)}>
                  <option value="">Toàn quốc</option>
                  {destinations.map(d => (
                    <option key={String(d.destination_id ?? d.id)} value={String(d.destination_id ?? d.id)}>
                      {String(d.name ?? d.name_vi)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ark-field">
                <span>Category (hard filter)</span>
                <select value={pgCatId} onChange={e => setPgCatId(e.target.value)}>
                  <option value="">Tất cả danh mục</option>
                  {categories.map(c => (
                    <option key={String(c.category_id ?? c.id)} value={String(c.category_id ?? c.id)}>
                      {String(c.name ?? c.name_vi)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ark-field">
                <span>Soft preference tags (cách nhau dấu phẩy)</span>
                <input value={pgSoftTags} onChange={e => setPgSoftTags(e.target.value)} placeholder="quiet, sea_view, heritage" />
              </label>
              <label className="ark-field">
                <span>Hard max budget (VND/người)</span>
                <input type="number" min={0} value={pgMaxBudget} onChange={e => setPgMaxBudget(e.target.value)} placeholder="Trống = không giới hạn" />
              </label>
              <label className="ark-field">
                <span>Origin Lat</span>
                <input type="number" step="any" value={pgOriginLat} onChange={e => setPgOriginLat(e.target.value)} placeholder="vd: 16.0544" />
              </label>
              <label className="ark-field">
                <span>Origin Lon</span>
                <input type="number" step="any" value={pgOriginLon} onChange={e => setPgOriginLon(e.target.value)} placeholder="vd: 108.2022" />
              </label>
              <label className="ark-field">
                <span>Hard max distance (km)</span>
                <input type="number" step="any" min={0.1} value={pgMaxDist} onChange={e => setPgMaxDist(e.target.value)} placeholder="vd: 5" />
              </label>
              <label className="ark-field">
                <span>Top N (1..50)</span>
                <input type="number" min={1} max={50} value={pgTopN} onChange={e => setPgTopN(e.target.value)} />
              </label>
            </div>
            <div>
              <Button type="submit" disabled={busy}>Chạy Playground Debug</Button>
            </div>
          </form>

          {pgResult && (() => {
            const primary = (pgResult.primary ?? {}) as Resource;
            const manifest = (primary.deployment_manifest ?? {}) as Resource;
            const items = (primary.items as Resource[]) ?? [];
            const exCounts = (primary.exclusion_counts as Record<string, number>) ?? {};
            const diff = (pgResult.rank_diff as Resource[]) ?? [];
            return (
              <div className="ark-card">
                <h4>
                  Kết quả Debug · Scanned: {String(primary.total_scanned ?? 0)} → Passed Hard Filter: {String(primary.passed_hard_filters ?? 0)} → Returned: {String(primary.returned_count ?? 0)} · Latency: {String(primary.latency_ms ?? 0)} ms
                </h4>
                <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                  Config: <code>{String(manifest.config_version_tag ?? '—')}</code> · Quality: <strong>{String(manifest.quality_status ?? '—')}</strong> · Cohort snapshot: <code>{String(manifest.cohort_snapshot_version ?? '—')}</code> · CF: <code>{String(manifest.cf_artifact_version ?? 'UNAVAILABLE')}</code> · Fallback: <strong>{String(primary.fallback_used)}</strong> ({String(primary.fallback_reason ?? 'NONE')})
                </p>

                {Object.keys(exCounts).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <strong style={{ fontSize: '0.8rem' }}>Hard Filter Exclusions:</strong>
                    {Object.entries(exCounts).map(([code, cnt]) => (
                      <span key={code} className="ark-pill is-warn">{code}: {cnt}</span>
                    ))}
                  </div>
                )}

                <div className="ark-table-wrap">
                  <table className="ark-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Địa điểm</th>
                        <th>Final</th>
                        <th>Basic (B)</th>
                        <th>Content (C)</th>
                        <th>CF (F)</th>
                        <th>Context (X)</th>
                        <th>Eff. Weights (B/C/F/X)</th>
                        <th>Explanation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(it => {
                        const sc = (it.scorers ?? {}) as Record<string, Resource>;
                        const ew = (it.effective_weights ?? {}) as Record<string, number>;
                        const fmtSc = (s?: Resource) => s?.available
                          ? fmt(s.score, 3)
                          : `N/A (${String(s?.unavailable_reason ?? 'NONE')})`;
                        return (
                          <tr key={String(it.place_id)}>
                            <td>{String(it.rank)}</td>
                            <td><strong>{String(it.name || it.place_id)}</strong></td>
                            <td><strong>{fmt(it.final_score, 4)}</strong></td>
                            <td>{fmtSc(sc.basic)}</td>
                            <td>{fmtSc(sc.content)}</td>
                            <td>{fmtSc(sc.collaborative)}</td>
                            <td>{fmtSc(sc.context)}</td>
                            <td>{`${fmt(ew.basic, 2)} / ${fmt(ew.content, 2)} / ${fmt(ew.collaborative, 2)} / ${fmt(ew.context, 2)}`}</td>
                            <td>{String(it.summary_vi ?? '—')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {diff.length > 0 && (
                  <div>
                    <h4>So sánh thứ hạng Config A vs Config B</h4>
                    <div className="ark-table-wrap">
                      <table className="ark-table">
                        <thead><tr><th>Địa điểm</th><th>Rank A</th><th>Rank B</th><th>Delta</th><th>Score A</th><th>Score B</th></tr></thead>
                        <tbody>
                          {diff.map(d => (
                            <tr key={String(d.place_id)}>
                              <td>{String(d.name)}</td>
                              <td>#{String(d.rank_a)}</td>
                              <td>{d.rank_b ? `#${String(d.rank_b)}` : 'Ngoài Top-N'}</td>
                              <td>{d.rank_delta == null ? '—' : Number(d.rank_delta) === 0 ? '0' : Number(d.rank_delta) > 0 ? `+${String(d.rank_delta)}` : String(d.rank_delta)}</td>
                              <td>{fmt(d.score_a, 4)}</td>
                              <td>{d.score_b == null ? '—' : fmt(d.score_b, 4)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── TAB B: DATASET & LABELING ── */}
      {tab === 'datasets' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Hướng dẫn chấm nhãn Relevance 0..3 & Không đủ thông tin */}
          <details className="ark-card" open>
            <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem' }}>
              Hướng dẫn chấm nhãn Relevance (0–3 &amp; Không đủ thông tin) · Đọc trước khi chấm
            </summary>
            <div className="ark-guide-grid">
              <div className="ark-guide-item">
                <span className="ark-pill is-ok">3 — Rất phù hợp</span>
                <p>Khớp xuất sắc cả điều kiện cứng lẫn sở thích/ngữ cảnh truy vấn; xứng đáng nằm trong Top 1–3.</p>
              </div>
              <div className="ark-guide-item">
                <span className="ark-pill is-ok">2 — Phù hợp (Relevant)</span>
                <p>Đúng yêu cầu chính, hợp lý trong Top 5–10 (ngưỡng dương cho Precision@K / Recall@K).</p>
              </div>
              <div className="ark-guide-item">
                <span className="ark-pill is-warn">1 — Tạm được</span>
                <p>Đúng lọc cứng nhưng mức liên quan hoặc sức hấp dẫn yếu; chỉ nên xuất hiện cuối danh sách.</p>
              </div>
              <div className="ark-guide-item">
                <span className="ark-pill is-bad">0 — Không phù hợp</span>
                <p>Lạc ý định người dùng, sai ngữ cảnh/phạm vi hoặc không đáng gợi ý cho truy vấn này.</p>
              </div>
              <div className="ark-guide-item">
                <span className="ark-pill">? — Không đủ thông tin</span>
                <p>Thiếu tên rõ ràng/địa chỉ/mô tả/giá khiến không thể chấm công bằng. Không bị ép thành 0 và tách riêng khỏi mẫu đánh giá.</p>
              </div>
            </div>
            <p className="ark-subtitle" style={{ marginTop: 4 }}>
              Nguyên tắc chống rò rỉ: <strong>VALIDATION</strong> chỉ dùng để tuning trọng số; <strong>TEST</strong> (Holdout) chỉ dùng để đánh giá độc lập. Nhóm <code>scenario_group</code> tách rời hoàn toàn giữa hai tập. Có nhãn người chấm không tự chuyển trạng thái thành <code>QUALITY_VALIDATED</code> nếu chưa qua đánh giá TEST độc lập &amp; xác nhận reviewer.
            </p>
          </details>

          <div className="ark-grid-2">
            <form className="ark-card" onSubmit={e => void handleCreateDataset(e)}>
              <h3>Tạo phiên bản Evaluation Dataset</h3>
              <label className="ark-field">
                <span>Tên dataset</span>
                <input value={dsName} onChange={e => setDsName(e.target.value)} required placeholder="vd: SmartTravel-Human-Benchmark-v1" />
              </label>
              <label className="ark-field">
                <span>Phân loại nguồn gốc (Provenance Tier)</span>
                <select value={dsTier} onChange={e => setDsTier(e.target.value as typeof dsTier)}>
                  <option value="HUMAN_LABELED">HUMAN_LABELED (Người chấm thực tế — hợp lệ cho đánh giá chất lượng)</option>
                  <option value="REAL_BEHAVIORAL">REAL_BEHAVIORAL (Hành vi thực tế theo thời gian)</option>
                  <option value="SYNTHETIC_FIXTURE">SYNTHETIC_FIXTURE (Chỉ kiểm chức năng — KHÔNG là bằng chứng chất lượng)</option>
                </select>
              </label>
              <div className="ark-row-actions">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(async () => {
                    const created = await adminRankingApi.createLabelingPool(travel, {
                      name: dsName.trim() || undefined,
                      candidates_per_query: 8,
                    });
                    setDsName('');
                    setQueueSplitFilter('ALL');
                    setQueueStatusFilter('UNLABELED');
                    setQueueQueryFilter('ALL');
                    await refreshAll();
                    await loadDatasetDetail(String(created.eval_dataset_id));
                    showToast('Đã tạo bộ đánh giá con người từ DB thật (nhãn để trống, tách VALIDATION/TEST, không dùng điểm Hybrid).', 'success');
                  })}
                >
                  Tạo bộ chấm nhãn con người từ DB thật (nhãn trống)
                </Button>
                <Button type="submit" variant="secondary" disabled={busy}>Tạo Dataset rỗng (DRAFT)</Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void runAction(async () => {
                    const seeded = await adminRankingApi.seedFixtureDataset(travel);
                    await refreshAll();
                    await loadDatasetDetail(String(seeded.eval_dataset_id));
                    showToast('Đã tạo SYNTHETIC_FIXTURE để kiểm chức năng pipeline (không dùng cho quality gate).', 'success');
                  })}
                >
                  Tạo Fixture chức năng (Synthetic)
                </Button>
              </div>
            </form>

            <div className="ark-card">
              <h3>Danh sách Dataset Versions ({datasets.length})</h3>
              {datasets.length === 0 ? (
                <p className="ark-banner" style={{ margin: 0 }}>
                  NO_DATA · Chưa có dataset đánh giá nào. Bấm "Tạo bộ chấm nhãn con người từ DB thật" để bắt đầu chấm.
                </p>
              ) : (
                <div className="ark-table-wrap">
                  <table className="ark-table">
                    <thead>
                      <tr>
                        <th>Tên</th>
                        <th>Provenance</th>
                        <th>Trạng thái</th>
                        <th>Tiến độ chấm</th>
                        <th>Hành động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {datasets.map(d => {
                        const id = String(d.eval_dataset_id);
                        const labeled = Number(d.labeled_count ?? 0);
                        const insuff = Number(d.insufficient_info_count ?? 0);
                        const total = Number(d.row_count ?? 0);
                        return (
                          <tr key={id}>
                            <td>
                              <strong>{String(d.name)}</strong>
                              <br />
                              <small style={{ color: 'var(--color-text-secondary)' }}>{String(d.query_count)} truy vấn</small>
                            </td>
                            <td>
                              <span className={`ark-pill ${d.provenance_tier === 'SYNTHETIC_FIXTURE' ? 'is-warn' : 'is-ok'}`}>
                                {String(d.provenance_tier)}
                              </span>
                            </td>
                            <td><span className="ark-pill">{String(d.status)}</span></td>
                            <td>
                              <strong>{labeled}</strong>/{total} đã chấm
                              {insuff > 0 && <><br /><small>? Thiếu TT: {insuff}</small></>}
                            </td>
                            <td className="ark-row-actions">
                              <Button
                                type="button"
                                variant={selectedDatasetId === id ? 'primary' : 'secondary'}
                                onClick={() => {
                                  setQueueQueryFilter('ALL');
                                  void loadDatasetDetail(id);
                                }}
                              >
                                {selectedDatasetId === id ? 'Đang mở' : 'Chấm / Xem'}
                              </Button>
                              {d.status === 'DRAFT' && (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  disabled={busy || labeled === 0}
                                  title={labeled === 0 ? 'Cần chấm ít nhất 1 địa điểm trước khi Freeze' : 'Đóng băng phiên bản dataset'}
                                  onClick={() => void runAction(async () => {
                                    await adminRankingApi.freezeDataset(travel, id);
                                    await refreshAll();
                                    await loadDatasetDetail(id);
                                    showToast('Đã đóng băng (FREEZE) dataset kèm SHA-256 checksum.', 'success');
                                  })}
                                >Freeze</Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {selectedDatasetDetail && (() => {
            const allJudgments = (selectedDatasetDetail.judgments as Resource[]) ?? [];
            const totalRows = Number(selectedDatasetDetail.row_count ?? allJudgments.length);
            const labeledCnt = Number(selectedDatasetDetail.labeled_count ?? 0);
            const insuffCnt = Number(selectedDatasetDetail.insufficient_info_count ?? 0);
            const unlabeledCnt = Number(selectedDatasetDetail.unlabeled_count ?? Math.max(0, totalRows - labeledCnt - insuffCnt));
            const donePct = totalRows > 0 ? Math.round(((labeledCnt + insuffCnt) / totalRows) * 100) : 0;
            const isDraft = selectedDatasetDetail.status === 'DRAFT';

            const uniqueQueries = Array.from(new Set(allJudgments.map(j => String(j.query_id))));
            const filteredJudgments = allJudgments.filter(j => {
              const jStatus = String(j.judgment_status ?? (j.relevance_grade != null ? 'LABELED' : 'UNLABELED'));
              if (queueSplitFilter !== 'ALL' && String(j.split) !== queueSplitFilter) return false;
              if (queueStatusFilter !== 'ALL' && jStatus !== queueStatusFilter) return false;
              if (queueQueryFilter !== 'ALL' && String(j.query_id) !== queueQueryFilter) return false;
              return true;
            });

            // Group filtered judgments by query_id for clean human review
            const grouped = new Map<string, Resource[]>();
            for (const j of filteredJudgments) {
              const qid = String(j.query_id);
              const list = grouped.get(qid) ?? [];
              list.push(j);
              grouped.set(qid, list);
            }

            const catNameById = new Map(categories.map(c => [String(c.category_id ?? c.id), String(c.name ?? c.name_vi ?? '')]));
            const destNameById = new Map(destinations.map(d => [String(d.destination_id ?? d.id), String(d.name ?? d.name_vi ?? '')]));
            const geoNameById = new Map(geoUnits.map(g => [String(g.geographic_unit_id ?? g.id), String(g.name ?? g.name_vi ?? '')]));
            const catalogById = new Map(catalogPlaces.map(p => [String(p.place_id ?? p.id), p]));

            return (
              <div className="ark-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  <div>
                    <h3 style={{ marginBottom: 4 }}>
                      Dataset: {String(selectedDatasetDetail.name)} ·{' '}
                      <span className="ark-pill">{String(selectedDatasetDetail.status)}</span>{' '}
                      <span className={`ark-pill ${selectedDatasetDetail.provenance_tier === 'SYNTHETIC_FIXTURE' ? 'is-warn' : 'is-ok'}`}>
                        {String(selectedDatasetDetail.provenance_tier)}
                      </span>
                    </h3>
                    <small style={{ color: 'var(--color-text-secondary)' }}>
                      Đã chấm (0–3): <strong>{labeledCnt}</strong> · Không đủ thông tin: <strong>{insuffCnt}</strong> · Chưa chấm: <strong>{unlabeledCnt}</strong> · Tổng: <strong>{totalRows}</strong> ({donePct}%)
                    </small>
                  </div>
                  <div className="ark-row-actions">
                    {isDraft && (
                      <Button
                        type="button"
                        disabled={busy || labeledCnt === 0}
                        onClick={() => void runAction(async () => {
                          await adminRankingApi.freezeDataset(travel, selectedDatasetId);
                          await refreshAll();
                          await loadDatasetDetail(selectedDatasetId);
                          showToast('Đã Freeze dataset! Chuyển sang Tab C để Tuning trên VALIDATION và đánh giá độc lập trên TEST.', 'success');
                        })}
                      >
                        Freeze Dataset ({labeledCnt}/{totalRows})
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void runAction(async () => {
                        const ex = await adminRankingApi.exportDataset(travel, selectedDatasetId, 'CSV');
                        setExportOutput(ex.content);
                      })}
                    >Export CSV</Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void runAction(async () => {
                        const ex = await adminRankingApi.exportDataset(travel, selectedDatasetId, 'JSONL');
                        setExportOutput(ex.content);
                      })}
                    >Export JSONL</Button>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="ark-progress-track" aria-label={`Tiến độ chấm nhãn ${donePct}%`}>
                  <div className="ark-progress-fill" style={{ width: `${donePct}%` }} />
                </div>

                {/* Filter bar for Labeling Workbench */}
                <div className="ark-form-grid">
                  <label className="ark-field">
                    <span>Lọc tập (Split)</span>
                    <select value={queueSplitFilter} onChange={e => setQueueSplitFilter(e.target.value as typeof queueSplitFilter)}>
                      <option value="ALL">Tất cả Split</option>
                      <option value="VALIDATION">VALIDATION (dùng để tuning)</option>
                      <option value="TEST">TEST (Holdout đánh giá độc lập)</option>
                      <option value="TRAIN">TRAIN</option>
                    </select>
                  </label>
                  <label className="ark-field">
                    <span>Trạng thái chấm</span>
                    <select value={queueStatusFilter} onChange={e => setQueueStatusFilter(e.target.value as typeof queueStatusFilter)}>
                      <option value="ALL">Tất cả ({totalRows})</option>
                      <option value="UNLABELED">Chưa chấm ({unlabeledCnt})</option>
                      <option value="LABELED">Đã chấm 0–3 ({labeledCnt})</option>
                      <option value="INSUFFICIENT_INFO">Không đủ thông tin ({insuffCnt})</option>
                    </select>
                  </label>
                  <label className="ark-field">
                    <span>Chọn truy vấn (Query)</span>
                    <select value={queueQueryFilter} onChange={e => setQueueQueryFilter(e.target.value)}>
                      <option value="ALL">Tất cả {uniqueQueries.length} truy vấn</option>
                      {uniqueQueries.map(q => (
                        <option key={q} value={q}>{q}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {/* Interactive Human Labeling Queue */}
                {grouped.size === 0 ? (
                  <p className="ark-banner" style={{ margin: 0 }}>
                    Không có mục nào khớp bộ lọc hiện tại. Hãy đổi bộ lọc trạng thái sang "Tất cả" để xem lại các nhãn đã chấm.
                  </p>
                ) : (
                  <div className="ark-labeling-list">
                    {Array.from(grouped.entries()).map(([qid, items]) => {
                      const sample = items[0];
                      const req = (sample.request_payload as Resource) ?? {};
                      const reqCats = Array.isArray(req.category_ids)
                        ? (req.category_ids as string[]).map(cid => catNameById.get(cid) || cid)
                        : [];
                      const reqDest = req.destination_id ? (destNameById.get(String(req.destination_id)) || String(req.destination_id)) : '';
                      const softPrefs = req.soft_preferences && typeof req.soft_preferences === 'object'
                        ? Object.keys(req.soft_preferences as Record<string, unknown>)
                        : [];
                      const originObj = req.origin && typeof req.origin === 'object' ? (req.origin as Record<string, unknown>) : null;
                      return (
                        <div key={qid} className="ark-query-group">
                          <div className="ark-query-head">
                            <div>
                              <span className={`ark-pill ${String(sample.split) === 'TEST' ? 'is-warn' : 'is-ok'}`}>
                                {String(sample.split)}
                              </span>{' '}
                              <strong>{qid}</strong>{' '}
                              <small style={{ color: 'var(--color-text-secondary)' }}>
                                (nhóm: <code>{String(sample.scenario_group)}</code>)
                              </small>
                              {Boolean(sample.notes) && (
                                <p style={{ margin: '6px 0 0', fontSize: '0.86rem' }}>{String(sample.notes)}</p>
                              )}
                            </div>
                            <div className="ark-criteria-chips">
                              {reqDest && <span className="ark-pill">Điểm đến: {reqDest}</span>}
                              {reqCats.length > 0 && <span className="ark-pill">Danh mục: {reqCats.join(', ')}</span>}
                              {req.max_budget != null && (
                                <span className="ark-pill">Ngân sách ≤ {Number(req.max_budget).toLocaleString('vi-VN')} đ</span>
                              )}
                              {originObj && (
                                <span className="ark-pill">
                                  Tâm ({Number(originObj.latitude).toFixed(3)}, {Number(originObj.longitude).toFixed(3)})
                                  {req.max_distance_km != null ? ` · ≤ ${String(req.max_distance_km)} km` : ''}
                                </span>
                              )}
                              {softPrefs.length > 0 && <span className="ark-pill">Ưu tiên mềm: {softPrefs.join(', ')}</span>}
                            </div>
                          </div>

                          <div className="ark-candidate-grid">
                            {items.map(j => {
                              const pid = String(j.place_id);
                              const rawInfo = (j.place_info as Resource) ?? {};
                              const catRec = catalogById.get(pid);
                              // Merge authoritative Catalog fields so 203/203 addresses, descriptions, coords & opening hours display immediately
                              const placeName = String(rawInfo.name || catRec?.name || catRec?.name_vi || pid);
                              const placeAddress = String(rawInfo.address || catRec?.address || '').trim();
                              const placeDesc = String(rawInfo.description || catRec?.description || '').trim();
                              const placeLat = rawInfo.latitude != null ? Number(rawInfo.latitude) : (catRec?.latitude != null ? Number(catRec.latitude) : null);
                              const placeLon = rawInfo.longitude != null ? Number(rawInfo.longitude) : (catRec?.longitude != null ? Number(catRec.longitude) : null);
                              const geoAreaName = catRec?.geographic_unit_id ? (geoNameById.get(String(catRec.geographic_unit_id)) ?? '') : '';
                              const openingSummary = formatOpeningSummary(catRec?.opening_hours);
                              const distFromOriginKm =
                                originObj && placeLat != null && placeLon != null && Number.isFinite(placeLat) && Number.isFinite(placeLon)
                                  ? haversineKm(Number(originObj.latitude), Number(originObj.longitude), placeLat, placeLon)
                                  : null;

                              const jStatus = String(j.judgment_status ?? (j.relevance_grade != null ? 'LABELED' : 'UNLABELED'));
                              const currentGrade = j.relevance_grade == null ? null : Number(j.relevance_grade);
                              const rowKey = `${String(j.query_id)}:${pid}`;
                              const isSaving = savingJudgmentKey === rowKey;
                              const priceMinRaw = rawInfo.price_min ?? catRec?.price_min ?? catRec?.price;
                              const priceMaxRaw = rawInfo.price_max ?? catRec?.price_max;
                              const priceMin = priceMinRaw != null ? Number(priceMinRaw) : null;
                              const priceMax = priceMaxRaw != null ? Number(priceMaxRaw) : null;
                              const priceLabel = priceMin == null
                                ? 'Chưa có thông tin giá'
                                : priceMin === 0 && (priceMax == null || priceMax === 0)
                                  ? 'Miễn phí'
                                  : priceMax != null && priceMax !== priceMin
                                    ? `${priceMin.toLocaleString('vi-VN')} – ${priceMax.toLocaleString('vi-VN')} đ`
                                    : `${priceMin.toLocaleString('vi-VN')} đ`;
                              const ratingAvgRaw = rawInfo.rating_avg ?? catRec?.rating_avg;
                              const ratingCntRaw = rawInfo.rating_count ?? catRec?.review_count ?? 0;
                              const rawCats = Array.isArray(rawInfo.category_ids) && rawInfo.category_ids.length > 0
                                ? (rawInfo.category_ids as string[])
                                : (Array.isArray(catRec?.category_ids) ? (catRec.category_ids as string[]) : []);
                              const pCats = rawCats.map(cid => catNameById.get(cid)).filter(Boolean);
                              const pTags = Array.isArray(rawInfo.tags) ? (rawInfo.tags as string[]).slice(0, 5) : [];

                              return (
                                <div key={String(j.judgment_id)} className={`ark-cand-row status-${jStatus.toLowerCase()}`}>
                                  <div className="ark-cand-info">
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                      <strong>{placeName}</strong>
                                      {pCats.map(cn => <span key={cn} className="ark-pill">{cn}</span>)}
                                      {geoAreaName && <span className="ark-pill">{geoAreaName}</span>}
                                      {distFromOriginKm != null && (
                                        <span className="ark-pill is-ok ark-dist-badge">
                                          Cách tâm {distFromOriginKm < 1 ? `${Math.round(distFromOriginKm * 1000)} m` : `${distFromOriginKm.toFixed(2)} km`}
                                        </span>
                                      )}
                                      {Boolean(rawInfo.space_type) && rawInfo.space_type !== 'UNKNOWN' && (
                                        <span className="ark-pill">{String(rawInfo.space_type)}</span>
                                      )}
                                    </div>
                                    <div className="ark-cand-meta">
                                      <span>{placeAddress || 'Chưa có địa chỉ'}</span>
                                      <span>· {priceLabel}</span>
                                      <span>
                                        · Đánh giá: {ratingAvgRaw != null ? `${Number(ratingAvgRaw).toFixed(1)}★ (${String(ratingCntRaw)})` : 'Chưa có đánh giá'}
                                      </span>
                                      {openingSummary && <span>· Giờ mở: {openingSummary}</span>}
                                      {placeLat != null && placeLon != null && (
                                        <span className="ark-map-links">
                                          ·{' '}
                                          <a
                                            className="ark-map-link"
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeAddress ? `${placeName}, ${placeAddress}` : `${placeName} ${placeLat},${placeLon}`)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            Google Maps ↗
                                          </a>
                                          {' · '}
                                          <a
                                            className="ark-map-link"
                                            href={`https://www.openstreetmap.org/?mlat=${placeLat}&mlon=${placeLon}#map=16/${placeLat}/${placeLon}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                          >
                                            OSM ↗
                                          </a>
                                        </span>
                                      )}
                                    </div>
                                    {Boolean(placeDesc) && (
                                      <p className="ark-cand-desc">{placeDesc.slice(0, 240)}</p>
                                    )}
                                    {pTags.length > 0 && (
                                      <div className="ark-cand-tags">Tags: {pTags.join(', ')}</div>
                                    )}
                                  </div>

                                  <div className="ark-grade-bar" role="group" aria-label={`Chấm điểm cho ${placeName}`}>
                                    {[
                                      { grade: 0, label: '0 · Không phù hợp' },
                                      { grade: 1, label: '1 · Tạm được' },
                                      { grade: 2, label: '2 · Phù hợp' },
                                      { grade: 3, label: '3 · Rất phù hợp' },
                                    ].map(opt => (
                                      <button
                                        key={opt.grade}
                                        type="button"
                                        disabled={!isDraft || isSaving}
                                        className={`ark-grade-btn ${jStatus === 'LABELED' && currentGrade === opt.grade ? `is-selected grade-${opt.grade}` : ''}`}
                                        onClick={() => void handleQuickLabel(j, 'LABELED', opt.grade)}
                                      >
                                        {opt.label}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      disabled={!isDraft || isSaving}
                                      className={`ark-grade-btn is-insuff ${jStatus === 'INSUFFICIENT_INFO' ? 'is-selected' : ''}`}
                                      onClick={() => void handleQuickLabel(j, 'INSUFFICIENT_INFO', null)}
                                    >
                                      ? Không đủ thông tin
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {exportOutput && (
                  <div>
                    <h4>Dữ liệu Export</h4>
                    <pre className="ark-code">{exportOutput}</pre>
                  </div>
                )}

                {isDraft && (
                  <details className="ark-card">
                    <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
                      Công cụ nâng cao: Thêm thủ công từng dòng hoặc Import CSV / JSONL
                    </summary>
                    <div className="ark-grid-2" style={{ marginTop: 12 }}>
                      <form className="ark-card" onSubmit={e => void handleUpsertJudgment(e)}>
                        <h4>Thêm / sửa thủ công 1 dòng Judgment</h4>
                        <div className="ark-form-grid">
                          <label className="ark-field">
                            <span>Query ID / Scenario</span>
                            <input value={labelQueryId} onChange={e => setLabelQueryId(e.target.value)} required />
                          </label>
                          <label className="ark-field">
                            <span>Split (theo nhóm scenario)</span>
                            <select value={labelSplit} onChange={e => setLabelSplit(e.target.value as typeof labelSplit)}>
                              <option value="TRAIN">TRAIN</option>
                              <option value="VALIDATION">VALIDATION</option>
                              <option value="TEST">TEST (Holdout)</option>
                            </select>
                          </label>
                          <label className="ark-field">
                            <span>Địa điểm (canonical place_id)</span>
                            <select value={labelPlaceId} onChange={e => setLabelPlaceId(e.target.value)} required>
                              <option value="">Chọn địa điểm...</option>
                              {catalogPlaces.slice(0, 120).map(p => (
                                <option key={String(p.place_id ?? p.id)} value={String(p.place_id ?? p.id)}>
                                  {String(p.name)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="ark-field">
                            <span>Mức phù hợp (0–3)</span>
                            <select value={labelGrade} onChange={e => setLabelGrade(e.target.value)}>
                              <option value="0">0 — Không phù hợp</option>
                              <option value="1">1 — Tạm được</option>
                              <option value="2">2 — Phù hợp (Relevant)</option>
                              <option value="3">3 — Rất phù hợp</option>
                            </select>
                          </label>
                        </div>
                        <Button type="submit" disabled={busy}>Lưu nhãn</Button>
                      </form>

                      <form className="ark-card" onSubmit={e => void handleImportJudgments(e)}>
                        <h4>Import CSV / JSONL</h4>
                        <label className="ark-field">
                          <span>Định dạng</span>
                          <select value={importFormat} onChange={e => setImportFormat(e.target.value as 'CSV' | 'JSONL')}>
                            <option value="CSV">CSV (query_id,scenario_group,place_id,relevance_grade,split,...)</option>
                            <option value="JSONL">JSONL</option>
                          </select>
                        </label>
                        <label className="ark-field">
                          <span>Nội dung</span>
                          <textarea rows={4} value={importContent} onChange={e => setImportContent(e.target.value)} placeholder="q1,g1,<place-uuid>,3,VALIDATION,admin1,HUMAN" />
                        </label>
                        <Button type="submit" disabled={busy}>Import &amp; Kiểm tra Schema</Button>
                        {importErrors.length > 0 && (
                          <pre className="ark-code">{JSON.stringify(importErrors, null, 2)}</pre>
                        )}
                      </form>
                    </div>
                  </details>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* ── TAB C: EVALUATION & WEIGHT TUNING ── */}
      {tab === 'eval' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {datasets.filter(d => d.provenance_tier !== 'SYNTHETIC_FIXTURE').length === 0 && (
            <div className="ark-banner" role="status">
              <strong>QUALITY_PENDING / NO_DATA:</strong> Chưa có bộ benchmark do người chấm (HUMAN_LABELED) hoặc hành vi thực (REAL_BEHAVIORAL). Các lượt chạy trên SYNTHETIC_FIXTURE chỉ xác minh cơ chế kỹ thuật, không chứng minh chất lượng gợi ý production.
            </div>
          )}

          <div className="ark-grid-2">
            <form
              className="ark-card"
              onSubmit={e => {
                e.preventDefault();
                if (!evalDatasetId) return;
                void runAction(async () => {
                  await adminRankingApi.startEvaluation(travel, {
                    eval_dataset_id: evalDatasetId,
                    config_version_id: evalConfigId || undefined,
                    baseline_mode: evalBaselineMode,
                    split: evalSplit,
                  });
                  await refreshAll();
                  showToast('Đã khởi chạy job Evaluation nền.', 'success');
                });
              }}
            >
              <h3>Chạy Offline Evaluation</h3>
              <div className="ark-form-grid">
                <label className="ark-field">
                  <span>Dataset</span>
                  <select value={evalDatasetId} onChange={e => setEvalDatasetId(e.target.value)} required>
                    <option value="">Chọn dataset...</option>
                    {datasets.map(d => (
                      <option key={String(d.eval_dataset_id)} value={String(d.eval_dataset_id)}>
                        {String(d.name)} [{String(d.provenance_tier)}]
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ark-field">
                  <span>Cấu hình</span>
                  <select value={evalConfigId} onChange={e => setEvalConfigId(e.target.value)}>
                    <option value="">Active deployment</option>
                    {configs.map(c => (
                      <option key={String(c.config_version_id)} value={String(c.config_version_id)}>
                        {String(c.version_tag)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ark-field">
                  <span>Chế độ Baseline / Challenger</span>
                  <select value={evalBaselineMode} onChange={e => setEvalBaselineMode(e.target.value)}>
                    <option value="HYBRID_V1">HYBRID_V1</option>
                    <option value="BASIC_ONLY">BASIC_ONLY</option>
                    <option value="FALLBACK_ONLY">FALLBACK_ONLY</option>
                    <option value="CONTENT_CONTEXT">CONTENT_CONTEXT</option>
                    <option value="CHALLENGER">CHALLENGER</option>
                  </select>
                </label>
                <label className="ark-field">
                  <span>Split</span>
                  <select value={evalSplit} onChange={e => setEvalSplit(e.target.value)}>
                    <option value="VALIDATION">VALIDATION</option>
                    <option value="TEST">TEST (Holdout)</option>
                    <option value="ALL">ALL</option>
                  </select>
                </label>
              </div>
              <Button type="submit" disabled={busy || !evalDatasetId}>Chạy Evaluation</Button>
            </form>

            <form
              className="ark-card"
              onSubmit={e => {
                e.preventDefault();
                if (!evalDatasetId) return;
                void runAction(async () => {
                  await adminRankingApi.startTuning(travel, {
                    eval_dataset_id: evalDatasetId,
                    base_config_version_id: evalConfigId || undefined,
                    strategy: tuneStrategy,
                    seed: Number(tuneSeed) || 42,
                    max_trials: Number(tuneTrials) || 12,
                    allow_demo_tuning: tuneAllowDemo,
                  });
                  await refreshAll();
                  showToast('Đã khởi chạy Weight Tuning trên tập VALIDATION (không auto-activate).', 'success');
                });
              }}
            >
              <h3>Tìm trọng số (Weight Tuning — Validation Split Only)</h3>
              <div className="ark-form-grid">
                <label className="ark-field">
                  <span>Chiến lược</span>
                  <select value={tuneStrategy} onChange={e => setTuneStrategy(e.target.value as 'RANDOM' | 'GRID')}>
                    <option value="RANDOM">RANDOM (Seeded)</option>
                    <option value="GRID">GRID (Bounded)</option>
                  </select>
                </label>
                <label className="ark-field">
                  <span>Seed</span>
                  <input type="number" value={tuneSeed} onChange={e => setTuneSeed(e.target.value)} />
                </label>
                <label className="ark-field">
                  <span>Max Trials (1..200)</span>
                  <input type="number" min={1} max={200} value={tuneTrials} onChange={e => setTuneTrials(e.target.value)} />
                </label>
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.82rem' }}>
                <input type="checkbox" checked={tuneAllowDemo} onChange={e => setTuneAllowDemo(e.target.checked)} />
                Cho phép chạy Demo chức năng trên SYNTHETIC_FIXTURE (gắn nhãn DEMO, không đạt Quality Gate)
              </label>
              <Button type="submit" disabled={busy || !evalDatasetId}>Khởi chạy Tuning Job</Button>
            </form>
          </div>

          <div className="ark-card">
            <h3>Lịch sử Evaluation Runs ({evaluations.length})</h3>
            <div className="ark-table-wrap">
              <table className="ark-table">
                <thead>
                  <tr>
                    <th>Dataset</th><th>Mode / Split</th><th>Provenance</th><th>Trạng thái</th>
                    <th>NDCG@10</th><th>P@10</th><th>Recall@10</th><th>Hit@10</th>
                    <th>Coverage</th><th>Judged</th><th>Hard Viol.</th><th>p95 ms</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluations.map(ev => {
                    const m = (ev.metrics ?? {}) as Resource;
                    return (
                      <tr key={String(ev.eval_run_id)}>
                        <td>{String(ev.dataset_name)}</td>
                        <td>{String(ev.baseline_mode)} / {String(ev.split)}</td>
                        <td>
                          <span className={`ark-pill ${ev.provenance_tier === 'SYNTHETIC_FIXTURE' ? 'is-warn' : 'is-ok'}`}>
                            {String(ev.provenance_tier)}
                          </span>
                        </td>
                        <td><span className="ark-pill">{String(ev.status)}</span></td>
                        <td><strong>{fmt(m.ndcg_at_10, 4)}</strong></td>
                        <td>{fmt(m.precision_at_10, 4)}</td>
                        <td>{m.recall_at_10 == null ? '—' : fmt(m.recall_at_10, 4)}</td>
                        <td>{fmt(m.hit_rate_at_10, 4)}</td>
                        <td>{fmtPct(m.catalog_coverage)}</td>
                        <td>{fmtPct(ev.judged_coverage)}</td>
                        <td><span className={`ark-pill ${Number(m.hard_constraint_violations ?? 0) === 0 ? 'is-ok' : 'is-bad'}`}>{String(m.hard_constraint_violations ?? '—')}</span></td>
                        <td>{fmt(m.latency_ms_p95, 1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ark-card">
            <h3>Lịch sử Tuning Jobs ({tuningJobs.length})</h3>
            <div className="ark-table-wrap">
              <table className="ark-table">
                <thead><tr><th>Dataset</th><th>Strategy / Seed</th><th>Progress</th><th>Status</th><th>Demo?</th><th>Draft Config</th><th>Trials</th></tr></thead>
                <tbody>
                  {tuningJobs.map(tj => (
                    <tr key={String(tj.tuning_job_id)}>
                      <td>{String(tj.dataset_name)}</td>
                      <td>{String(tj.strategy)} · seed={String(tj.seed)}</td>
                      <td>{String(tj.completed_trials)} / {String(tj.max_trials)}</td>
                      <td><span className="ark-pill">{String(tj.status)}</span></td>
                      <td>{tj.is_demo_run ? <span className="ark-pill is-warn">DEMO</span> : '—'}</td>
                      <td>{tj.best_config_version_id ? <code>{String(tj.best_config_version_id).slice(0, 8)}</code> : '—'}</td>
                      <td>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void runAction(async () => {
                            const res = await adminRankingApi.listTuningTrials(travel, String(tj.tuning_job_id));
                            setSelectedTrials(res.items ?? []);
                          })}
                        >Xem trials</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedTrials.length > 0 && (
              <div className="ark-table-wrap">
                <table className="ark-table">
                  <thead><tr><th>Trial</th><th>Weights (B/C/F/X)</th><th>Sub-params</th><th>NDCG@10</th><th>P@10</th><th>Hard Viol.</th><th>Guardrails</th></tr></thead>
                  <tbody>
                    {selectedTrials.map(tr => {
                      const w = (tr.candidate_weights ?? {}) as Resource;
                      const sp = (tr.candidate_sub_params ?? {}) as Resource;
                      return (
                        <tr key={String(tr.trial_id)}>
                          <td>#{String(tr.trial_no)}</td>
                          <td>{`${fmt(w.basic, 3)} / ${fmt(w.content, 3)} / ${fmt(w.collaborative, 3)} / ${fmt(w.context, 3)}`}</td>
                          <td>m={String(sp.rating_m)}, d={String(sp.distance_scale_km)}km</td>
                          <td><strong>{fmt(tr.ndcg_at_10, 4)}</strong></td>
                          <td>{fmt(tr.precision_at_10, 4)}</td>
                          <td>{String(tr.hard_violations)}</td>
                          <td><span className={`ark-pill ${tr.guardrails_passed ? 'is-ok' : 'is-bad'}`}>{tr.guardrails_passed ? 'PASS' : 'FAIL'}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB D: CONFIG, CF & DEPLOYMENT REGISTRY ── */}
      {tab === 'registry' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ark-grid-2">
            <form className="ark-card" onSubmit={e => void handleCreateConfig(e)}>
              <h3>Tạo Ranking Config Version (DRAFT)</h3>
              <div className="ark-form-grid">
                <label className="ark-field"><span>Tên cấu hình</span><input value={cfgName} onChange={e => setCfgName(e.target.value)} required placeholder="Hybrid Challenger v2" /></label>
                <label className="ark-field"><span>Version tag</span><input value={cfgTag} onChange={e => setCfgTag(e.target.value)} placeholder="hybrid-v2-cand" /></label>
                <label className="ark-field"><span>Weight Basic (B)</span><input type="number" step="0.01" min="0" value={wBasic} onChange={e => setWBasic(e.target.value)} /></label>
                <label className="ark-field"><span>Weight Content (C)</span><input type="number" step="0.01" min="0" value={wContent} onChange={e => setWContent(e.target.value)} /></label>
                <label className="ark-field"><span>Weight CF (F)</span><input type="number" step="0.01" min="0" value={wCf} onChange={e => setWCf(e.target.value)} /></label>
                <label className="ark-field"><span>Weight Context (X)</span><input type="number" step="0.01" min="0" value={wContext} onChange={e => setWContext(e.target.value)} /></label>
              </div>
              <Button type="submit" disabled={busy}>Tạo Config DRAFT</Button>
            </form>

            <div className="ark-card">
              <h3>Item-based Collaborative Filtering Builder</h3>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--color-text-secondary)' }}>
                Build ma trận tương đồng cosine có shrinkage (lambda=10, topK=100) từ hành vi được phép đến cutoff hiện tại. Khi thiếu dữ liệu, CF tự động giữ chế độ unavailable.
              </p>
              <div className="ark-row-actions">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void runAction(async () => {
                    await adminRankingApi.enqueueCfBuild(travel, { lambda: 10.0, top_k: 100 });
                    await refreshAll();
                    showToast('Đã đưa CF Build Job vào hàng đợi nền.', 'success');
                  })}
                >Chạy CF Build Job</Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void runAction(async () => {
                    await adminRankingApi.recomputeCohorts(travel, 30, 5);
                    await refreshAll();
                    showToast('Đã tính lại Cohort Prior & Popularity p95 snapshot.', 'success');
                  })}
                >Tính lại Cohort Snapshot ({cohorts.length})</Button>
              </div>
              {cfJobs.length > 0 && (
                <div className="ark-table-wrap">
                  <table className="ark-table">
                    <thead><tr><th>Job</th><th>Status</th><th>Progress</th><th>Created</th></tr></thead>
                    <tbody>
                      {cfJobs.slice(0, 5).map(j => (
                        <tr key={String(j.job_id)}>
                          <td><code>{String(j.job_id).slice(0, 8)}</code></td>
                          <td><span className="ark-pill">{String(j.status)}</span></td>
                          <td>{String(j.progress_pct)}%</td>
                          <td>{String(j.created_at ?? '').slice(0, 19)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {cfArtifacts.length > 0 && (
                <div className="ark-table-wrap">
                  <table className="ark-table">
                    <thead><tr><th>Artifact</th><th>Users/Items/Edges</th><th>Lifecycle / Quality</th><th>Action</th></tr></thead>
                    <tbody>
                      {cfArtifacts.slice(0, 5).map(a => (
                        <tr key={String(a.artifact_id)}>
                          <td><code>{String(a.version_tag)}</code></td>
                          <td>{String(a.user_count)} / {String(a.item_count)} / {String(a.edge_count)}</td>
                          <td>{String(a.lifecycle_status)} / {String(a.quality_status)}</td>
                          <td>
                            {a.lifecycle_status === 'DRAFT' && (
                              <Button type="button" variant="secondary" disabled={busy} onClick={() => void runAction(async () => {
                                await adminRankingApi.validateCfArtifact(travel, String(a.artifact_id));
                                await refreshAll();
                                showToast('Đã kiểm tra checksum và validate CF artifact.', 'success');
                              })}>Validate</Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="ark-card">
            <h3>Ranking Config Versions ({configs.length})</h3>
            <div className="ark-form-grid" style={{ marginBottom: 8 }}>
              <label className="ark-field">
                <span>Lý do Activate / Rollback (bắt buộc cho Audit Log)</span>
                <input value={activateReason} onChange={e => setActivateReason(e.target.value)} placeholder="vd: Activate challenger sau khi kiểm tra validation" />
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.82rem', alignSelf: 'end', paddingBottom: 8 }}>
                <input type="checkbox" checked={activateAllowDemo} onChange={e => setActivateAllowDemo(e.target.checked)} />
                Cho phép Activate ở chế độ DEMO (khi chưa qua Human Quality Gate)
              </label>
            </div>
            <div className="ark-table-wrap">
              <table className="ark-table">
                <thead><tr><th>Tag / Tên</th><th>Weights (B/C/F/X)</th><th>Lifecycle</th><th>Quality</th><th>Hành động</th></tr></thead>
                <tbody>
                  {configs.map(c => {
                    const id = String(c.config_version_id);
                    const w = (c.weights ?? {}) as Resource;
                    return (
                      <tr key={id}>
                        <td><strong>{String(c.version_tag)}</strong><br /><small>{String(c.name)}</small></td>
                        <td>{`${fmt(w.basic, 2)} / ${fmt(w.content, 2)} / ${fmt(w.collaborative, 2)} / ${fmt(w.context, 2)}`}</td>
                        <td><span className={`ark-pill ${c.lifecycle_status === 'ACTIVE' ? 'is-ok' : ''}`}>{String(c.lifecycle_status)}</span></td>
                        <td><span className={`ark-pill ${c.quality_status === 'PASSED' ? 'is-ok' : 'is-warn'}`}>{String(c.quality_status)}</span></td>
                        <td className="ark-row-actions">
                          {c.lifecycle_status === 'DRAFT' && (
                            <Button type="button" variant="secondary" disabled={busy} onClick={() => void runAction(async () => {
                              await adminRankingApi.validateConfig(travel, id);
                              await refreshAll();
                              showToast('Đã validate cấu hình.', 'success');
                            })}>Validate</Button>
                          )}
                          {c.lifecycle_status !== 'DRAFT' && c.lifecycle_status !== 'ACTIVE' && (
                            <Button type="button" disabled={busy} onClick={() => {
                              const reason = activateReason.trim();
                              if (!reason) { setError('Vui lòng nhập lý do Activate.'); return; }
                              if (!window.confirm(`Xác nhận kích hoạt cấu hình ${String(c.version_tag)}?`)) return;
                              void runAction(async () => {
                                await adminRankingApi.activateDeployment(travel, {
                                  config_version_id: id,
                                  reason,
                                  allow_demo_activation: activateAllowDemo,
                                });
                                await refreshAll();
                                showToast('Đã kích hoạt cấu hình mới (transaction-safe).', 'success');
                              });
                            }}>Activate</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="ark-card">
            <h3>Lịch sử Deployment &amp; Rollback ({deployments.length})</h3>
            <div className="ark-table-wrap">
              <table className="ark-table">
                <thead><tr><th>Deployment</th><th>Config</th><th>Quality / Demo</th><th>Activated At</th><th>Reason</th><th>Rollback</th></tr></thead>
                <tbody>
                  {deployments.map(d => {
                    const depId = String(d.deployment_id);
                    const isActive = !d.deactivated_at;
                    return (
                      <tr key={depId}>
                        <td><code>{depId.slice(0, 8)}</code> {isActive && <span className="ark-pill is-ok">ACTIVE</span>}</td>
                        <td>{String(d.config_version_tag)}</td>
                        <td>{String(d.quality_status)} {Boolean(d.is_demo_activation) ? '· DEMO' : ''}</td>
                        <td>{String(d.activated_at ?? '').slice(0, 19)}</td>
                        <td>{String(d.reason ?? '')}</td>
                        <td>
                          {!isActive && (
                            <Button type="button" variant="secondary" disabled={busy} onClick={() => {
                              const reason = activateReason.trim() || 'Rollback from Admin Registry';
                              if (!window.confirm(`Xác nhận rollback về deployment ${depId.slice(0, 8)} (${String(d.config_version_tag)})?`)) return;
                              void runAction(async () => {
                                await adminRankingApi.rollbackDeployment(travel, depId, reason);
                                await refreshAll();
                                showToast('Đã rollback deployment thành công.', 'success');
                              });
                            }}>Rollback</Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB E: OPERATIONAL ANALYTICS ── */}
      {tab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)' }}>
              Chỉ tính traffic người dùng thực (loại bỏ toàn bộ Admin Playground).
            </span>
            <select value={analyticsHours} onChange={e => setAnalyticsHours(Number(e.target.value))}>
              <option value={24}>24 giờ qua</option>
              <option value={168}>7 ngày qua</option>
              <option value={720}>30 ngày qua</option>
            </select>
          </div>

          {analytics && (() => {
            const req = (analytics.requests ?? {}) as Resource;
            const avail = (analytics.scorer_availability ?? {}) as Resource;
            const effW = (analytics.effective_weights_avg ?? {}) as Resource;
            const fresh = (analytics.freshness ?? {}) as Resource;
            const cov = (analytics.coverage_and_exposure ?? {}) as Resource;
            const eng = (analytics.online_engagement ?? {}) as Resource;
            return (
              <>
                <div className="ark-grid-4">
                  <div className="ark-kpi"><span>Tổng Requests</span><strong>{String(req.total ?? 0)}</strong><small>Avg candidates: {String(req.avg_candidates ?? 0)}</small></div>
                  <div className="ark-kpi"><span>Latency p50 / p95 / p99</span><strong>{String(req.latency_ms_p95 ?? 0)} ms</strong><small>p50={String(req.latency_ms_p50 ?? 0)} · p99={String(req.latency_ms_p99 ?? 0)} ms</small></div>
                  <div className="ark-kpi"><span>Empty / Fallback / Degraded</span><strong>{fmtPct(req.fallback_rate)}</strong><small>Empty: {fmtPct(req.empty_rate)} · Degraded: {fmtPct(req.degraded_rate)}</small></div>
                  <div className="ark-kpi"><span>Verified Impressions / CTR</span><strong>{eng.ctr == null ? 'NO_DATA' : fmtPct(eng.ctr)}</strong><small>Impr: {String(eng.impressions_verified ?? 0)} · Clicks: {String(eng.clicks ?? 0)} · Trip: {String(eng.add_to_trip_confirmed_server ?? 0)}</small></div>
                </div>

                <div className="ark-grid-2">
                  <div className="ark-card">
                    <h4>Scorer Availability &amp; Effective Weights</h4>
                    <table className="ark-table">
                      <thead><tr><th>Scorer</th><th>Availability</th><th>Avg Effective Weight</th></tr></thead>
                      <tbody>
                        <tr><td>Basic (B)</td><td>{fmtPct(avail.basic)}</td><td>{fmt(effW.basic, 3)}</td></tr>
                        <tr><td>Content (C)</td><td>{fmtPct(avail.content)}</td><td>{fmt(effW.content, 3)}</td></tr>
                        <tr><td>Collaborative (F)</td><td>{fmtPct(avail.collaborative)}</td><td>{fmt(effW.collaborative, 3)}</td></tr>
                        <tr><td>Context (X)</td><td>{fmtPct(avail.context)}</td><td>{fmt(effW.context, 3)}</td></tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="ark-card">
                    <h4>Freshness, Coverage &amp; New-Item Exposure</h4>
                    <table className="ark-table">
                      <tbody>
                        <tr><td>Projection Freshness</td><td>{String(fresh.projection_as_of ?? '—')} ({String(fresh.projection_age_seconds ?? -1)}s)</td></tr>
                        <tr><td>Cohort Snapshot</td><td><code>{String(fresh.cohort_snapshot_version ?? '—')}</code></td></tr>
                        <tr><td>CF Artifact</td><td><code>{String(fresh.cf_artifact_version ?? 'NONE')}</code></td></tr>
                        <tr><td>Catalog Coverage</td><td>{fmtPct(cov.catalog_coverage)} ({String(cov.unique_places_recommended ?? 0)} / {String(cov.published_places ?? 0)})</td></tr>
                        <tr><td>Unrated / New Items Exposed</td><td>{String(cov.unrated_new_items_exposed ?? 0)}</td></tr>
                        <tr><td>Accepts / Skips</td><td>{String(eng.accepts ?? 0)} / {String(eng.skips ?? 0)}</td></tr>
                      </tbody>
                    </table>
                    <small style={{ color: 'var(--color-text-secondary)' }}>{String(eng.attribution_definition ?? '')}</small>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}
    </section>
  );
}
