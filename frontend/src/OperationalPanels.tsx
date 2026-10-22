import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, type ServiceName } from './api/types';
import { TravelClient, type Page, type Resource } from './api/travel';
import { Icon } from './Icon';

type Props = { travel: TravelClient };
const resourceId = (row: Resource) => String(row.id ?? row.review_id ?? row.business_id ?? row.place_id ?? row.claim_id ?? '');
const title = (row: Resource) => String(row.name ?? row.content ?? row.display_name ?? row.title ?? 'Chi tiết');

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? `${e.message} (${e.body.code}). Mã hỗ trợ: ${e.body.traceId}`
          : 'Không thể kết nối. Vui lòng thử lại.'
      );
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    run,
    setMessage,
    feedback: (
      <>
        {message ? (
          <p role="status" aria-live="polite" className="travel-status alert-success">
            {message}
          </p>
        ) : busy ? (
          <p role="status" aria-live="polite" className="travel-status">
            Đang xử lý…
          </p>
        ) : null}
        {error && (
          <p role="alert" className="travel-error">
            {error}
          </p>
        )}
      </>
    )
  };
}

function submit(
  event: FormEvent<HTMLFormElement>,
  action: (data: FormData) => Promise<void>,
  run: (action: () => Promise<void>) => Promise<void>
) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  void run(() => action(data));
}

export function MapPanel({ travel }: Props) {
  const { busy, run, feedback } = useAction();
  const [places, setPlaces] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [query, setQuery] = useState('');

  async function load(next?: string) {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (next) params.set('cursor', next);
    const result = await travel.read<Page>('catalog', `/places?${params}`);
    setPlaces(old => (next ? [...old, ...result.items] : result.items));
    setCursor(result.next_cursor ?? null);
    if (!next) {
      setSelected(null);
      setShowMap(false);
    }
  }

  useEffect(() => {
    void run(() => load());
  }, [travel]);

  const lat = Number(selected?.latitude),
    lon = Number(selected?.longitude);
  const valid =
    selected &&
    selected.latitude != null &&
    selected.longitude != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180;
  const bbox = valid
    ? [Math.max(-180, lon - 0.025), Math.max(-90, lat - 0.025), Math.min(180, lon + 0.025), Math.min(90, lat + 0.025)].join(',')
    : '';
  const link = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;

  return (
    <section aria-label="Bản đồ địa điểm" aria-busy={busy} className="map-explorer-layout">
      {feedback}
      <div className="search-bar-wrap">
        <form onSubmit={e => submit(e, () => load(), run)} className="map-search-form">
          <label>
            Tìm trên bản đồ
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Nhập tên địa điểm hoặc thành phố..."
              maxLength={1024}
            />
          </label>
          <button disabled={busy} className="btn-primary">
            <Icon name="search" size={16} /> Tìm địa điểm trên bản đồ
          </button>
        </form>
      </div>

      <div className="travel-grid">
        {places.map(row => (
          <article className="travel-panel place-map-card" key={resourceId(row)}>
            <div className="card-header-row">
              <span className="pin-badge">
                <Icon name="pin" size={16} />
              </span>
              <h3>{title(row)}</h3>
            </div>
            {row.address != null && <p className="card-subtext">{String(row.address)}</p>}
            <button
              disabled={busy}
              className="btn-outline"
              onClick={() =>
                void run(async () => {
                  setSelected(await travel.place(resourceId(row)));
                  setShowMap(false);
                })
              }
            >
              <Icon name="map" size={15} /> Xem vị trí
            </button>
          </article>
        ))}
      </div>

      {!busy && !places.length && (
        <div className="empty-subtle">
          <Icon name="compass" size={32} />
          <p>Chưa có địa điểm phù hợp.</p>
        </div>
      )}

      {cursor && (
        <button disabled={busy} className="btn-secondary load-more-btn" onClick={() => void run(() => load(cursor))}>
          Thêm địa điểm trên bản đồ
        </button>
      )}

      {selected && (
        <section className="travel-panel map-detail-panel">
          <div className="panel-header-actions">
            <h2>Vị trí: {title(selected)}</h2>
            <button className="btn-subtle" onClick={() => setSelected(null)}>
              Đóng chi tiết vị trí
            </button>
          </div>

          {valid ? (
            <div className="map-viewer-box">
              <div className="coordinates-tag">
                <Icon name="pin" size={16} />
                <span>
                  Vĩ độ {lat} · Kinh độ {lon}
                </span>
              </div>
              <p>
                <a href={link} target="_blank" rel="noopener noreferrer" className="osm-external-link">
                  <Icon name="map" size={16} /> Mở vị trí trên OpenStreetMap ↗
                </a>
              </p>
              <p className="privacy-note">Bản đồ trực tuyến được tải từ OpenStreetMap khi bạn chọn xem.</p>

              <button className="btn-primary" onClick={() => setShowMap(value => !value)}>
                {showMap ? 'Ẩn bản đồ trực tuyến' : 'Xem bản đồ trực tuyến'}
              </button>

              {showMap && (
                <div className="osm-iframe-wrapper">
                  <iframe
                    title={`Bản đồ ${title(selected)}`}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lon}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    style={{ display: 'block', width: '100%', height: 380, border: '1px solid #EADBCC', borderRadius: 12, marginTop: 16 }}
                  />
                  <p className="osm-attribution">
                    <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">
                      © OpenStreetMap contributors
                    </a>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p>Địa điểm chưa có tọa độ để hiển thị bản đồ.</p>
          )}
        </section>
      )}
    </section>
  );
}

export function BusinessPanel({ travel }: Props) {
  const { busy, run, setMessage, feedback } = useAction();
  const [rows, setRows] = useState<Resource[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [members, setMembers] = useState<Resource[]>([]);
  const [claim, setClaim] = useState<Resource | null>(null);
  const [verification, setVerification] = useState<Resource | null>(null);
  const [activeTab, setActiveTab] = useState<'profile' | 'members' | 'verification' | 'claims' | 'offerings'>('profile');

  async function load(next?: string) {
    const result = await travel.read<Page>('catalog', `/businesses${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
    setRows(old => (next ? [...old, ...result.items] : result.items));
    setCursor(result.next_cursor ?? null);
  }

  useEffect(() => {
    void run(() => load());
  }, [travel]);

  return (
    <section aria-label="Quản lý doanh nghiệp" aria-busy={busy} className="business-portal-layout">
      {feedback}
      <div className="section-toolbar">
        <button disabled={busy} className="btn-secondary" onClick={() => void run(() => load())}>
          <Icon name="refresh" size={15} /> Tải lại doanh nghiệp
        </button>
      </div>

      <div className="travel-panel create-business-box">
        <h3>Đăng ký tổ chức / doanh nghiệp mới</h3>
        <p className="subtle-text">Tạo hồ sơ doanh nghiệp để quản lý địa điểm, dịch vụ và phân quyền nhân sự.</p>
        <form
          onSubmit={e =>
            submit(
              e,
              async data => {
                await travel.mutate('catalog', '/businesses', { name: data.get('name') });
                await load();
                setMessage('Đã tạo doanh nghiệp.');
              },
              run
            )
          }
        >
          <label>
            Tên doanh nghiệp
            <input name="name" required maxLength={1024} placeholder="Ví dụ: Công ty TNHH Du lịch & Khách sạn Phố Cổ" />
          </label>
          <button disabled={busy} className="btn-primary">
            <Icon name="building" size={16} /> Tạo doanh nghiệp
          </button>
        </form>
      </div>

      <div className="travel-grid">
        {rows.map(row => (
          <article className="travel-panel business-card" key={resourceId(row)}>
            <div className="card-top-row">
              <span className="biz-badge">
                <Icon name="building" size={18} />
              </span>
              <div>
                <h2>{title(row)}</h2>
                <span className="status-pill status-active">Trạng thái: {String(row.status)}</span>
              </div>
            </div>
            <button
              disabled={busy}
              className="btn-outline"
              onClick={() =>
                void run(async () => {
                  const business = await travel.read('catalog', `/businesses/${resourceId(row)}`);
                  const list = await travel.read<Page>('catalog', `/businesses/${resourceId(row)}/members`);
                  setSelected(business);
                  setMembers(list.items);
                  setClaim(null);
                  setVerification(null);
                  setActiveTab('profile');
                })
              }
            >
              <Icon name="edit" size={15} /> Quản lý doanh nghiệp
            </button>
          </article>
        ))}
      </div>

      {!busy && !rows.length && (
        <div className="empty-subtle">
          <Icon name="building" size={32} />
          <p>Bạn chưa có doanh nghiệp.</p>
        </div>
      )}

      {cursor && (
        <button disabled={busy} className="btn-secondary load-more-btn" onClick={() => void run(() => load(cursor))}>
          Xem thêm doanh nghiệp
        </button>
      )}

      {selected && (
        <section className="travel-panel business-management-studio">
          <div className="studio-header">
            <div>
              <h2>Doanh nghiệp: {title(selected)}</h2>
              <p className="subtle-text">Mã tổ chức: {resourceId(selected)}</p>
            </div>
            <button className="btn-subtle" onClick={() => setSelected(null)}>
              Đóng quản lý
            </button>
          </div>

          <div className="sub-tab-bar" role="tablist">
            <button
              className={`sub-tab ${activeTab === 'profile' ? 'active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'profile'}
              onClick={() => setActiveTab('profile')}
            >
              Hồ sơ
            </button>
            <button
              className={`sub-tab ${activeTab === 'members' ? 'active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'members'}
              onClick={() => setActiveTab('members')}
            >
              Thành viên ({members.length})
            </button>
            <button
              className={`sub-tab ${activeTab === 'verification' ? 'active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'verification'}
              onClick={() => setActiveTab('verification')}
            >
              Xác minh KYC
            </button>
            <button
              className={`sub-tab ${activeTab === 'claims' ? 'active' : ''}`}
              role="tab"
              aria-selected={activeTab === 'claims'}
              onClick={() => setActiveTab('claims')}
            >
              Yêu cầu địa điểm
            </button>
          </div>

          {activeTab === 'members' && (
            <div className="tab-pane">
              <h3>Thành viên</h3>
              <div className="member-list">
                {members.length ? (
                  members.map((row, index) => (
                    <div key={String(row.member_id ?? index)} className="member-row">
                      <Icon name="user" size={16} />
                      <span className="member-name">{String(row.display_name ?? row.user_id ?? 'Thành viên')}</span>
                      <span className="role-tag">{String(row.role)}</span>
                    </div>
                  ))
                ) : (
                  <p>Chưa có thành viên hiển thị.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'verification' && (
            <div className="tab-pane">
              <h3>Xác minh doanh nghiệp</h3>
              <p className="hint-text">Doanh nghiệp cần được xác minh trước khi yêu cầu quản lý địa điểm.</p>
              <form
                onSubmit={e =>
                  submit(
                    e,
                    async data => {
                      setVerification(
                        await travel.mutate('catalog', `/businesses/${resourceId(selected)}/verification`, {
                          evidence_keys: String(data.get('verificationEvidence'))
                            .split('\n')
                            .map(key => key.trim())
                            .filter(Boolean)
                        })
                      );
                      setMessage('Đã gửi hồ sơ xác minh; chờ kiểm duyệt.');
                    },
                    run
                  )
                }
              >
                <label>
                  Minh chứng xác minh (mỗi dòng một mã)
                  <textarea
                    name="verificationEvidence"
                    required
                    maxLength={1024}
                    placeholder="private/gpkd-scan-1.pdf&#10;private/hop-dong-thue.pdf"
                  />
                </label>
                <button disabled={busy} className="btn-primary">
                  <Icon name="shield" size={16} /> Gửi hồ sơ xác minh
                </button>
              </form>
              {verification && (
                <p role="status" className="status-banner">
                  Hồ sơ {String(verification.request_id ?? verification.verification_id ?? verification.id)} · Trạng thái{' '}
                  <strong>{String(verification.status)}</strong>
                </p>
              )}
            </div>
          )}

          {activeTab === 'claims' && (
            <div className="tab-pane">
              <h3>Yêu cầu quản lý địa điểm</h3>
              <p className="hint-text">Gửi minh chứng chứng minh bạn là chủ sở hữu hoặc đơn vị được ủy quyền quản lý địa điểm này.</p>
              <form
                onSubmit={e =>
                  submit(
                    e,
                    async data => {
                      const result = await travel.mutate('catalog', `/businesses/${resourceId(selected)}/claims`, {
                        place_id: data.get('place'),
                        evidence_keys: String(data.get('evidence'))
                          .split('\n')
                          .map(key => key.trim())
                          .filter(Boolean)
                      });
                      setClaim(result);
                      setMessage('Đã gửi yêu cầu; quyền quản lý chỉ có sau khi được duyệt.');
                    },
                    run
                  )
                }
              >
                <label>
                  Mã địa điểm cần quản lý
                  <input name="place" required pattern="[0-9a-fA-F-]{36}" placeholder="UUID địa điểm trên hệ thống" />
                </label>
                <label>
                  Minh chứng đã tải lên (mỗi dòng một mã)
                  <textarea name="evidence" required maxLength={1024} placeholder="private/giay-uy-quyen.pdf" />
                </label>
                <button disabled={busy} className="btn-primary">
                  <Icon name="check" size={16} /> Gửi yêu cầu quản lý
                </button>
              </form>
              {claim && (
                <p role="status" className="status-banner">
                  Yêu cầu {String(claim.claim_id)} · Trạng thái <strong>{String(claim.status)}</strong>
                </p>
              )}
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="tab-pane">
              <h3>Thông tin tổ chức</h3>
              <dl className="info-dl">
                <div>
                  <dt>Tên doanh nghiệp</dt>
                  <dd>{String(selected.name)}</dd>
                </div>
                <div>
                  <dt>Trạng thái</dt>
                  <dd>{String(selected.status)}</dd>
                </div>
                <div>
                  <dt>Phiên bản</dt>
                  <dd>{String(selected.version)}</dd>
                </div>
              </dl>
            </div>
          )}
        </section>
      )}
    </section>
  );
}

export function ModerationPanel({ travel }: Props) {
  const { busy, run, setMessage, feedback } = useAction();
  const [mode, setMode] = useState('reviews');
  const [rows, setRows] = useState<Resource[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const service: ServiceName = mode === 'reviews' ? 'community' : 'catalog';

  async function load(next?: string) {
    const result = await travel.read<Page>(service, `/admin/${mode}${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
    setRows(old => (next ? [...old, ...result.items] : result.items));
    setCursor(result.next_cursor ?? null);
  }

  useEffect(() => {
    setRows([]);
    setCursor(null);
    void run(() => load());
  }, [mode, travel]);

  return (
    <section aria-label="Kiểm duyệt nội dung" aria-busy={busy} className="moderation-console-layout">
      {feedback}
      <div className="moderation-controls-bar">
        <label>
          Nội dung kiểm duyệt
          <select value={mode} disabled={busy} onChange={e => setMode(e.target.value)}>
            <option value="reviews">Đánh giá</option>
            <option value="places">Địa điểm</option>
          </select>
        </label>
        <button disabled={busy} className="btn-secondary" onClick={() => void run(() => load())}>
          <Icon name="refresh" size={15} /> Tải lại kiểm duyệt
        </button>
      </div>

      <details className="travel-panel kyc-review-accordion">
        <summary>Xét duyệt hồ sơ xác minh doanh nghiệp</summary>
        <form
          onSubmit={e =>
            submit(
              e,
              async data => {
                const version = Number(data.get('version'));
                await travel.mutate(
                  'catalog',
                  `/admin/business-verifications/${encodeURIComponent(String(data.get('verification')))}/review`,
                  { action: data.get('action'), reason: data.get('reason') },
                  'POST',
                  version
                );
                setMessage('Đã lưu quyết định xác minh doanh nghiệp.');
              },
              run
            )
          }
        >
          <label>
            Mã hồ sơ xác minh
            <input name="verification" required pattern="[0-9a-fA-F-]{36}" />
          </label>
          <label>
            Phiên bản hồ sơ
            <input name="version" type="number" min="1" step="1" required />
          </label>
          <label>
            Quyết định xác minh
            <select name="action">
              <option value="APPROVE">Duyệt</option>
              <option value="REJECT">Từ chối</option>
              <option value="REVOKE">Thu hồi</option>
            </select>
          </label>
          <label>
            Lý do xác minh
            <input name="reason" required maxLength={1024} placeholder="Ví dụ: Giấy tờ hợp lệ, đúng địa chỉ đăng ký" />
          </label>
          <button disabled={busy} className="btn-primary">
            Lưu quyết định xác minh
          </button>
        </form>
      </details>

      <div className="travel-grid">
        {rows.map(row => (
          <article className="travel-panel moderation-card" key={resourceId(row)}>
            <div className="card-top-row">
              <span className="mod-badge">
                <Icon name={mode === 'reviews' ? 'star' : 'pin'} size={18} />
              </span>
              <div>
                <h2>{title(row)}</h2>
                <span className="status-pill">Trạng thái: {String(row.status)}</span>
              </div>
            </div>

            <form
              onSubmit={e =>
                submit(
                  e,
                  async data => {
                    const version = Number(row.version);
                    if (!Number.isSafeInteger(version) || version < 1) throw new Error('Missing version');
                    if (mode === 'reviews') {
                      await travel.mutate(
                        'community',
                        `/admin/reviews/${resourceId(row)}/moderate`,
                        { action: data.get('action'), reason: data.get('reason') },
                        'POST',
                        version
                      );
                    } else {
                      await travel.mutate('catalog', `/admin/places/${resourceId(row)}/status`, { status: data.get('action') }, 'PUT', version);
                    }
                    await load();
                    setMessage('Đã lưu quyết định. Các bản sao dữ liệu sẽ được cập nhật.');
                  },
                  run
                )
              }
            >
              <label>
                Quyết định
                <select name="action" required>
                  {(mode === 'reviews'
                    ? [
                        ['APPROVE', 'Duyệt'],
                        ['REJECT', 'Từ chối'],
                        ['HIDE', 'Ẩn'],
                        ['RESTORE', 'Khôi phục']
                      ]
                    : [
                        ['PUBLISHED', 'Công khai'],
                        ['HIDDEN', 'Ẩn'],
                        ['DRAFT', 'Bản nháp'],
                        ['ARCHIVED', 'Lưu trữ']
                      ]
                  ).map(([value, labelText]) => (
                    <option key={value} value={value}>
                      {labelText}
                    </option>
                  ))}
                </select>
              </label>

              {mode === 'reviews' && (
                <label>
                  Lý do quyết định
                  <input name="reason" required maxLength={1024} placeholder="Lý do duyệt/từ chối" />
                </label>
              )}

              <button disabled={busy} className="btn-primary">
                Lưu quyết định kiểm duyệt
              </button>
            </form>
          </article>
        ))}
      </div>

      {!busy && !rows.length && (
        <div className="empty-subtle">
          <Icon name="check" size={32} />
          <p>Chưa có nội dung cần kiểm duyệt.</p>
        </div>
      )}

      {cursor && (
        <button disabled={busy} className="btn-secondary load-more-btn" onClick={() => void run(() => load(cursor))}>
          Xem thêm nội dung kiểm duyệt
        </button>
      )}
    </section>
  );
}
