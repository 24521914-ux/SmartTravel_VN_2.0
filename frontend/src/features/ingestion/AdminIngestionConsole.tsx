import { useEffect, useState, type FormEvent } from 'react';
import { Icon, Button, Badge } from '../../shared/ui';
import type { TravelClient, Resource, Page } from '../../shared/api';
import { useToast } from '../../app/providers/ToastProvider';

export interface AdminIngestionConsoleProps {
  travel: TravelClient;
  busy?: boolean;
}

const resourceId = (row: Resource) => String(row.id ?? row.source_id ?? '');

export function AdminIngestionConsole({ travel, busy = false }: AdminIngestionConsoleProps) {
  const { showToast } = useToast();
  const [sources, setSources] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('INCREMENTAL');
  const [error, setError] = useState('');
  const [job, setJob] = useState<Resource | null>(null);
  const [jobRows, setJobRows] = useState<Resource[]>([]);
  const [jobView, setJobView] = useState('items');

  async function act(action: () => Promise<void>) {
    setLoading(true); setError('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Không thực hiện được yêu cầu.'); }
    finally { setLoading(false); }
  }
  async function sourceSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget);
    const body = { name: String(data.get('name')), uri: String(data.get('uri')), secret_reference: String(data.get('secret_reference')), license_version: String(data.get('license_version')), allow_storage: data.has('allow_storage'), allow_training: data.has('allow_training') };
    await act(async () => {
      const result = await travel.mutate<Resource>('ingestion', `/admin/data-sources${selected ? `/${encodeURIComponent(resourceId(selected))}` : ''}`, body, selected ? 'PATCH' : 'POST', selected ? Number(selected.version) : undefined);
      setSelected(result); await loadDataSources(); showToast('Đã lưu nguồn dữ liệu.', 'success');
    });
  }

  async function loadDataSources() {
    setError('');
    setLoading(true);
    try {
      const data = await travel.readAll('ingestion', '/admin/data-sources');
      setSources(data.items ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không tải được nguồn dữ liệu.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDataSources();
  }, [travel]);

  async function handleStartImport(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError('');
    setLoading(true);
    const sourceId = resourceId(selected);
    try {
      const newJob = await travel.mutate<Resource>('ingestion', `/admin/data-sources/${encodeURIComponent(sourceId)}/import-jobs`, { mode });
      setJob(newJob);
      showToast('Đã tiếp nhận job; chờ xử lý và xác nhận từ Catalog.', 'success');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không tạo được job nhập liệu.');
    } finally {
      setLoading(false);
    }
  }

  async function refreshJob() {
    if (!job) return;
    setLoading(true); setError('');
    try { setJob(await travel.read<Resource>('ingestion', `/admin/import-jobs/${encodeURIComponent(String(job.job_id ?? job.id))}`)); }
    catch (error) { setError(error instanceof Error ? error.message : 'Không tải được trạng thái job.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="admin-ingestion-console" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {error && <p role="alert">{error}</p>}
      <details className="travel-panel"><summary>{selected ? 'Chỉnh sửa nguồn dữ liệu' : 'Tạo nguồn dữ liệu'}</summary>
        <form className="clay-form" key={String(selected?.source_id ?? selected?.id ?? 'new')} onSubmit={e => void sourceSubmit(e)}>
          <label>Tên nguồn<input name="name" required defaultValue={String(selected?.name ?? '')} /></label>
          <label>Địa chỉ nguồn<input name="uri" type="url" required defaultValue={String(selected?.uri ?? '')} /></label>
          <label>Tham chiếu bí mật<input name="secret_reference" required defaultValue={String(selected?.secret_reference ?? '')} /><small>Chỉ nhập tên tham chiếu đã cấu hình, không nhập token hoặc mật khẩu.</small></label>
          <label>Phiên bản giấy phép<input name="license_version" required defaultValue={String(selected?.license_version ?? '')} /></label>
          <label><input name="allow_storage" type="checkbox" defaultChecked={Boolean(selected?.allow_storage)} />Cho phép lưu trữ</label>
          <label><input name="allow_training" type="checkbox" defaultChecked={Boolean(selected?.allow_training)} />Giấy phép cho phép huấn luyện</label>
          <Button type="submit" disabled={loading || busy}>Lưu nguồn dữ liệu</Button>
        </form>
        <Button type="button" disabled={loading || busy} onClick={() => setSelected(null)}>Nhập nguồn mới</Button>
        {selected && <div><Button type="button" disabled={loading || busy} onClick={() => void act(async () => { await travel.mutate('ingestion', `/admin/data-sources/${encodeURIComponent(resourceId(selected))}/policy`, { status: selected.status === 'REVOKED' ? 'PERMITTED' : 'REVOKED' }, 'PATCH', Number(selected.version)); setSelected(await travel.read('ingestion', `/admin/data-sources/${encodeURIComponent(resourceId(selected))}`)); await loadDataSources(); })}>{selected.status === 'REVOKED' ? 'Cho phép sử dụng nguồn' : 'Thu hồi quyền sử dụng nguồn'}</Button>
        <Button type="button" disabled={loading || busy} onClick={() => { if (window.confirm('Xóa nguồn dữ liệu này?')) void act(async () => { await travel.mutate('ingestion', `/admin/data-sources/${encodeURIComponent(resourceId(selected))}`, undefined, 'DELETE', Number(selected.version)); setSelected(null); await loadDataSources(); }); }}>Xóa nguồn dữ liệu</Button></div>}
      </details>
      <section className="travel-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Nguồn nhập dữ liệu du lịch</h2>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>
              Quản lý các nguồn dữ liệu mở, đối tác địa phương và kích hoạt tiến trình ingestion.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void loadDataSources()}
            disabled={loading || busy}
          >
            <Icon name="refresh" size={15} /> Làm mới nguồn dữ liệu
          </button>
        </div>

        {/* Data Sources Grid */}
        <div className="travel-grid">
          {sources.map(s => {
            const sId = resourceId(s);
            const sName = String(s.name ?? 'Nguồn dữ liệu địa điểm');
            const sStatus = String(s.status ?? 'ACTIVE');
            return (
              <article key={sId} className="travel-panel admin-source" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: 40, height: 40, borderRadius: 'var(--radius-button)', background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="database" size={22} />
                  </span>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>{sName}</h3>
                    <span className="status-pill status-active" style={{ marginTop: '4px' }}>{sStatus}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--color-border-subtle)' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setSelected(s);
                      setJob(null);
                    }}
                  >
                    Xem chi tiết
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        {/* Selected Data Source Form with exact heading expected by tests */}
        {selected && (
          <form
            onSubmit={handleStartImport}
            className="clay-form"
            style={{
              marginTop: '24px',
              padding: '24px',
              background: 'var(--color-surface-subtle)',
              borderRadius: 'var(--radius-card)',
              border: '1.5px solid var(--color-primary)'
            }}
          >
            {/* Exact heading expected by clay-ui-check.mjs */}
            <h3 style={{ fontSize: '1.3rem', fontWeight: 800 }}>
              Kích hoạt nhập dữ liệu: {String(selected.name ?? 'Nguồn dữ liệu địa điểm')}
            </h3>

            <label htmlFor="import-mode">Chế độ nhập dữ liệu</label>
            <select id="import-mode" value={mode} onChange={e => setMode(e.target.value)}><option value="INCREMENTAL">INCREMENTAL</option><option value="FULL">FULL</option><option value="REPLAY">REPLAY</option></select>

            <div style={{ display: 'flex', gap: '10px' }}>
              <Button type="submit" disabled={loading || busy} icon="refresh">
                Bắt đầu nhập dữ liệu
              </Button>
              <button
                type="button"
                className="btn-subtle"
                onClick={() => setSelected(null)}
              >
                Hủy
              </button>
            </div>

            {job && (
              <div style={{ marginTop: '16px', background: '#ffffff', padding: '14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <p style={{ margin: 0, fontSize: '0.875rem' }}>
                  Mã tiến trình: <strong>{String(job.job_id ?? job.id)}</strong> · Trạng thái: <Badge>{String(job.status)}</Badge>
                </p>
                <button type="button" disabled={loading} onClick={() => void refreshJob()}>Cập nhật trạng thái job</button>
                <Button type="button" disabled={loading || busy} onClick={() => void act(async () => { setJob(await travel.mutate('ingestion', `/admin/import-jobs/${encodeURIComponent(String(job.job_id ?? job.id))}/retry`, undefined, 'POST', Number(job.version))); })}>Thử lại job lỗi</Button>
                <Button type="button" disabled={loading || busy} onClick={() => void act(async () => { setJob(await travel.mutate('ingestion', `/admin/import-jobs/${encodeURIComponent(String(job.job_id ?? job.id))}/cancel`, undefined, 'POST', Number(job.version))); })}>Hủy job</Button>
                <label>Chi tiết job<select value={jobView} onChange={e => setJobView(e.target.value)}><option value="items">Bản ghi</option><option value="errors">Lỗi xử lý</option><option value="candidates">Ứng viên ghép</option></select></label>
                <Button type="button" disabled={loading || busy} onClick={() => void act(async () => { const result = await travel.readAll('ingestion', `/admin/import-jobs/${encodeURIComponent(String(job.job_id ?? job.id))}/${jobView}`); setJobRows(result.items); })}>Tải chi tiết job</Button>
                {jobRows.map((row, index) => <p key={String(row.item_id ?? row.id ?? index)}>{Object.entries(row).filter(([key]) => !['payload', 'raw_payload'].includes(key)).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`).join(' · ')}</p>)}
              </div>
            )}
          </form>
        )}
      </section>
      <details className="travel-panel"><summary>Quyết định ghép bản ghi nhập liệu</summary><form className="clay-form" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void act(async () => { await travel.mutate('ingestion', `/admin/import-items/${encodeURIComponent(String(data.get('item_id')))}/decision`, { action: data.get('action'), place_id: String(data.get('place_id')).trim() || null, reason: data.get('reason') }, 'POST', Number(data.get('version'))); showToast('Đã lưu quyết định xử lý bản ghi.', 'success'); }); }}>
        <label>Mã bản ghi<input name="item_id" required pattern="[0-9a-fA-F-]{36}" /></label><label>Phiên bản bản ghi<input name="version" type="number" required min="1" step="1" /></label><label>Quyết định<select name="action"><option value="MATCH">Ghép địa điểm hiện có</option><option value="CREATE">Tạo địa điểm mới</option><option value="REJECT">Từ chối bản ghi</option></select></label><label>Mã địa điểm khi ghép<input name="place_id" pattern="[0-9a-fA-F-]{36}" /></label><label>Lý do<input name="reason" required /></label><Button type="submit" disabled={loading || busy}>Lưu quyết định ghép</Button>
      </form></details>
    </div>
  );
}
