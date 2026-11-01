import { useEffect, useState, type FormEvent } from 'react';
import { Icon, Button, Badge } from '../../shared/ui';
import type { TravelClient, Resource, Page } from '../../shared/api';
import { useToast } from '../../app/providers/ToastProvider';

export interface BusinessPortalProps {
  travel: TravelClient;
  busy?: boolean;
}

const resourceId = (row: Resource) => String(row.id ?? row.business_id ?? '');

export function BusinessPortal({ travel, busy = false }: BusinessPortalProps) {
  const { showToast } = useToast();
  const [businesses, setBusinesses] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [members, setMembers] = useState<Resource[]>([]);
  const [activeTab, setActiveTab] = useState<'profile' | 'members' | 'verification' | 'claims'>('profile');
  const [loading, setLoading] = useState(false);

  // Create Business form
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submission, setSubmission] = useState<Resource | null>(null);

  // Claim Place state
  const [claimPlaceId, setClaimPlaceId] = useState('');
  const [claimEvidence, setClaimEvidence] = useState('');

  // Verification KYC state
  const [kycDocs, setKycDocs] = useState('');

  async function act(action: () => Promise<void>) {
    setLoading(true); setError('');
    try { await action(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Không thực hiện được yêu cầu.'); }
    finally { setLoading(false); }
  }

  async function loadBusinesses() {
    setError('');
    setLoading(true);
    try {
      const data = await travel.readAll('catalog', '/businesses');
      setBusinesses(data.items ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không tải được doanh nghiệp.');
    } finally {
      setLoading(false);
    }
  }

  async function openBusinessManagement(b: Resource) {
    setSelected(b);
    setActiveTab('profile');
    setSubmission(null);
    setMembers([]);
    setError('');
    setLoading(true);
    try {
      const bId = resourceId(b);
      setSelected(await travel.read<Resource>('catalog', `/businesses/${encodeURIComponent(bId)}`));
      const membersData = await travel.readAll('catalog', `/businesses/${encodeURIComponent(bId)}/members`);
      setMembers(membersData.items ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không tải được thành viên.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBusinesses();
  }, [travel]);

  async function handleCreateBusiness(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    setLoading(true);
    try {
      const created = await travel.mutate<Resource>('catalog', '/businesses', { name: name.trim() });
      setBusinesses(prev => [created, ...prev]);
      setName('');
      showToast('Đã tạo doanh nghiệp.', 'success');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không tạo được doanh nghiệp.');
    } finally {
      setLoading(false);
    }
  }

  async function submitEvidence(e: FormEvent, claim: boolean) {
    e.preventDefault();
    if (!selected) return;
    setError(''); setLoading(true);
    try {
      const evidence_keys = (claim ? claimEvidence : kycDocs).split(/[,\n]/).map(v => v.trim()).filter(Boolean);
      const result = await travel.mutate<Resource>('catalog', `/businesses/${encodeURIComponent(resourceId(selected))}/${claim ? 'claims' : 'verification'}`,
        claim ? { place_id: claimPlaceId.trim(), evidence_keys } : { evidence_keys });
      setSubmission(result);
      showToast('Đã gửi hồ sơ; chờ quản trị viên xét duyệt.', 'success');
    } catch (error) { setError(error instanceof Error ? error.message : 'Không gửi được hồ sơ.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="business-portal-layout" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {error && <p role="alert">{error}</p>}
      {submission && <p role="status">Mã hồ sơ: {String(submission.request_id ?? submission.verification_id ?? submission.claim_id ?? submission.id)} ? Trạng thái: {String(submission.status)}</p>}
      {/* Create Business Form */}
      <section className="travel-panel" aria-label="Đăng ký tổ chức hoặc doanh nghiệp">
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '14px' }}>
          Đăng ký tổ chức / doanh nghiệp mới
        </h2>
        <form onSubmit={handleCreateBusiness} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr)) auto', gap: '12px', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="biz-name">Tên doanh nghiệp</label>
            <input
              id="biz-name"
              type="text"
              required
              placeholder="Công ty TNHH Du lịch..."
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <Button type="submit" disabled={loading || busy} icon="building">
            Tạo doanh nghiệp
          </Button>
        </form>
      </section>

      {/* Selected Business Studio Management */}
      {selected && (
        <section className="travel-panel business-management-studio" aria-label="Quản lý chi tiết doanh nghiệp">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>
                  Doanh nghiệp: {String(selected.name)}
                </h2>
                <Badge variant="success">Hoạt động</Badge>
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
                Mã định danh: {resourceId(selected)}
              </p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
              Đóng quản lý
            </button>
          </div>

          {/* Sub Tab Bar with exact names tested by clay-ui-check.mjs */}
          <div className="sub-tab-bar" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'profile'}
              className={`sub-tab ${activeTab === 'profile' ? 'active' : ''}`}
              onClick={() => setActiveTab('profile')}
            >
              Hồ sơ
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'members'}
              className={`sub-tab ${activeTab === 'members' ? 'active' : ''}`}
              onClick={() => setActiveTab('members')}
            >
              Thành viên ({members.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'verification'}
              className={`sub-tab ${activeTab === 'verification' ? 'active' : ''}`}
              onClick={() => setActiveTab('verification')}
            >
              Xác minh KYC
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'claims'}
              className={`sub-tab ${activeTab === 'claims' ? 'active' : ''}`}
              onClick={() => setActiveTab('claims')}
            >
              Yêu cầu địa điểm
            </button>
          </div>

          {/* Tab Panes */}
          {activeTab === 'profile' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '540px' }}>
              <h3>Thông tin pháp lý</h3>
              <form className="clay-form" key={String(selected.version)} onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void act(async () => { const result = await travel.mutate<Resource>('catalog', `/businesses/${encodeURIComponent(resourceId(selected))}`, { name: String(data.get('name')).trim() }, 'PATCH', Number(selected.version)); setSelected(result); await loadBusinesses(); }); }}>
                <label>Tên doanh nghiệp mới<input name="name" required defaultValue={String(selected.name)} /></label><Button type="submit" disabled={loading || busy}>Lưu tên doanh nghiệp</Button>
              </form>
              <Button type="button" disabled={loading || busy} onClick={() => { if (window.confirm('Xóa doanh nghiệp này?')) void act(async () => { await travel.mutate('catalog', `/businesses/${encodeURIComponent(resourceId(selected))}`, undefined, 'DELETE', Number(selected.version)); setSelected(null); await loadBusinesses(); }); }}>Xóa doanh nghiệp</Button>
              <div>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Tên pháp nhân:</span>
                <p style={{ fontWeight: 600 }}>{String(selected.name)}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Trạng thái:</span>
                <p style={{ fontWeight: 600, color: 'var(--color-success)' }}>{String(selected.status ?? 'ACTIVE')}</p>
              </div>
            </div>
          )}

          {activeTab === 'members' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <h3>Danh sách thành viên quản trị</h3>
              <form className="clay-form" onSubmit={e => { e.preventDefault(); void act(async () => { await travel.mutate('catalog', `/businesses/${encodeURIComponent(resourceId(selected))}/members`, { role: 'OWNER' }); await openBusinessManagement(selected); setActiveTab('members'); }); }}><p>Xác nhận lại quyền chủ sở hữu của tài khoản đang đăng nhập.</p><Button type="submit" disabled={loading || busy}>Xác nhận quyền chủ sở hữu</Button></form>
              {members.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {members.map((m, i) => (
                    <div key={i} style={{ padding: '12px', background: 'var(--color-surface-subtle)', borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{String(m.user_id ?? m.member_id)}</span>
                      <Badge variant="primary">{String(m.role ?? 'MANAGER')}</Badge>
                      <Button type="button" disabled={loading || busy} onClick={() => void act(async () => { const member = await travel.read<Resource>('catalog', `/businesses/${encodeURIComponent(resourceId(selected))}/members/${encodeURIComponent(String(m.member_id ?? m.id))}`); setMembers(previous => previous.map(row => row === m ? member : row)); })}>Tải lại thành viên</Button>
                      <select aria-label={`Vai trò ${String(m.user_id ?? m.member_id ?? m.id)}`} value={String(m.role)} disabled={loading || busy} onChange={e => { const role = e.target.value; void act(async () => { await travel.mutate('catalog', `/businesses/${encodeURIComponent(resourceId(selected))}/members/${encodeURIComponent(String(m.member_id ?? m.id))}`, { role }, 'PATCH', Number(m.version)); await openBusinessManagement(selected); setActiveTab('members'); }); }}><option value="OWNER">OWNER</option><option value="EDITOR">EDITOR</option></select>
                      <Button type="button" disabled={loading || busy} onClick={() => { if (window.confirm('Xóa membership này?')) void act(async () => { await travel.mutate('catalog', `/businesses/${encodeURIComponent(resourceId(selected))}/members/${encodeURIComponent(String(m.member_id ?? m.id))}`, undefined, 'DELETE', Number(m.version)); await openBusinessManagement(selected); setActiveTab('members'); }); }}>Xóa membership</Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ color: 'var(--color-text-secondary)' }}>Chưa có thành viên nào khác trong tổ chức.</p>
              )}
            </div>
          )}

          {activeTab === 'verification' && (
            <div style={{ maxWidth: '540px' }}>
              <h3>Gửi hồ sơ xác minh KYC</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
                Cung cấp bản chụp giấy chứng nhận đăng ký kinh doanh và giấy phép lữ hành (nếu có).
              </p>
              <form onSubmit={e => void submitEvidence(e, false)} className="clay-form">
                <div className="form-group">
                  <label htmlFor="kyc-doc-url">Mã tài liệu đã tải lên (phân cách bằng dấu phẩy)</label>
                  <input
                    id="kyc-doc-url"
                    type="text"
                    required
                    placeholder="private/giay-phep.pdf"
                    value={kycDocs}
                    onChange={e => setKycDocs(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={loading || busy} icon="shield">
                  Gửi xác minh KYC
                </Button>
              </form>
            </div>
          )}

          {activeTab === 'claims' && (
            <div style={{ maxWidth: '540px' }}>
              <h3>Yêu cầu quyền quản lý địa điểm</h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '14px' }}>
                Nếu doanh nghiệp là đơn vị chủ quản hoặc đối tác vận hành của một địa điểm trong danh mục, gửi yêu cầu claim tại đây.
              </p>
              <form onSubmit={e => void submitEvidence(e, true)} className="clay-form">
                <div className="form-group">
                  <label htmlFor="claim-place-id">Mã địa điểm muốn quản lý</label>
                  <input
                    id="claim-place-id"
                    type="text"
                    required
                    pattern="[0-9a-fA-F-]{36}"
                    placeholder="UUID địa điểm"
                    value={claimPlaceId}
                    onChange={e => setClaimPlaceId(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="claim-evidence">Minh chứng quyền sở hữu / Hợp đồng</label>
                  <input
                    id="claim-evidence"
                    type="text"
                    required
                    placeholder="private/hop-dong.pdf"
                    value={claimEvidence}
                    onChange={e => setClaimEvidence(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={loading || busy} icon="check">
                  Gửi yêu cầu claim
                </Button>
              </form>
            </div>
          )}
        </section>
      )}

      {/* Business Cards Grid */}
      <details className="travel-panel"><summary>Đề nghị sửa địa điểm đã được claim</summary><form className="clay-form" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void act(async () => { const fields: Resource = {}; if (String(data.get('name')).trim()) fields.name = String(data.get('name')).trim(); if (String(data.get('price')).trim()) { fields.price = Number(data.get('price')); fields.currency = 'VND'; } const result = await travel.mutate<Resource>('catalog', `/claims/${encodeURIComponent(String(data.get('claim_id')))}/change-requests`, { fields, expected_version: Number(data.get('version')) }); setSubmission(result); showToast('Đã gửi đề nghị thay đổi; chờ xử lý.', 'success'); }); }}><label>Mã claim được duyệt<input name="claim_id" required pattern="[0-9a-fA-F-]{36}" /></label><label>Phiên bản địa điểm<input name="version" type="number" min="1" step="1" required /></label><label>Tên địa điểm đề nghị<input name="name" /></label><label>Giá đề nghị (VND)<input name="price" type="number" min="0" /></label><Button type="submit" disabled={loading || busy}>Gửi đề nghị sửa địa điểm</Button></form></details>
      <div className="travel-grid">
        {businesses.map(b => {
          const bId = resourceId(b);
          const bName = String(b.name ?? 'Doanh nghiệp');
          const bStatus = String(b.status ?? 'ACTIVE');
          return (
            <article key={bId} className="travel-panel business-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ width: 42, height: 42, borderRadius: 'var(--radius-button)', background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="building" size={24} />
                </span>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>{bName}</h2>
                  <span className="status-pill status-active" style={{ marginTop: '4px' }}>
                    Trạng thái: {bStatus}
                  </span>
                </div>
              </div>

              {/* Exact button text expected by clay-ui-check.mjs */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--color-border-subtle)' }}>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => void openBusinessManagement(b)}
                >
                  <Icon name="edit" size={15} /> Quản lý doanh nghiệp
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && !error && businesses.length === 0 && (
        <div className="empty-subtle">
          <Icon name="building" size={40} />
          <p>Bạn chưa có doanh nghiệp nào. Hãy tạo doanh nghiệp ở form phía trên để bắt đầu!</p>
        </div>
      )}
    </div>
  );
}
