import { useEffect, useState, type FormEvent } from 'react';
import { ApiClient } from './api/client';
import { browserTokenStore } from './api/auth';
import { IdentityClient } from './api/identity';
import { ApiError, type ServiceName } from './api/types';
import { TravelClient, type Page, type Resource } from './api/travel';
import './travel.css';
import TripEditor from './TripEditor';
import { BusinessPanel, MapPanel, ModerationPanel } from './OperationalPanels';
import { aiEnabled } from './features';
import { Icon } from './Icon';

const tokens = browserTokenStore();
const client = new ApiClient({ tokenStore: tokens });
const identity = new IdentityClient(client, tokens);
const travel = new TravelClient(client);

const sections = [
  'Khám phá',
  'Bản đồ',
  'Gợi ý',
  'Bộ sưu tập',
  'Chuyến đi',
  'Thông báo',
  'Tài khoản',
  'Doanh nghiệp',
  'Kiểm duyệt',
  'Quản trị'
] as const;

const detailLabels: Record<string, string> = {
  name: 'Tên',
  description: 'Giới thiệu',
  address: 'Địa chỉ',
  type: 'Loại',
  status: 'Trạng thái',
  latitude: 'Vĩ độ',
  longitude: 'Kinh độ',
  start_date: 'Ngày bắt đầu',
  end_date: 'Ngày kết thúc',
  currency: 'Đơn vị tiền',
  budget: 'Ngân sách',
  display_name: 'Tên hiển thị',
  email: 'Email',
  title: 'Tiêu đề',
  body: 'Nội dung',
  content: 'Nội dung',
  rating: 'Số sao',
  score: 'Điểm gợi ý',
  explanation: 'Vì sao gợi ý'
};

const sectionIcons: Record<string, string> = {
  'Khám phá': 'compass',
  'Bản đồ': 'map',
  'Gợi ý': 'sparkles',
  'Bộ sưu tập': 'layers',
  'Chuyến đi': 'calendar',
  'Thông báo': 'bell',
  'Tài khoản': 'user',
  'Doanh nghiệp': 'building',
  'Kiểm duyệt': 'shield',
  'Quản trị': 'database'
};

type Section = (typeof sections)[number];

function label(row: Resource): string {
  return String(row.name ?? row.title ?? row.display_name ?? row.content ?? row.explanation ?? row.email ?? 'Chi tiết');
}

function id(row: Resource): string {
  return String(
    row.id ??
      row.place_id ??
      row.trip_id ??
      row.collection_id ??
      row.notification_id ??
      row.source_id ??
      row.model_id ??
      ''
  );
}

function Field({
  name,
  title,
  type = 'text',
  required = true,
  placeholder = ''
}: {
  name: string;
  title: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label>
      {title}
      <input name={name} type={type} required={required} maxLength={1024} placeholder={placeholder} />
    </label>
  );
}

export default function TravelApp() {
  const [section, setSection] = useState<Section>('Khám phá');
  const [session, setSession] = useState(Boolean(tokens.get()));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [reviews, setReviews] = useState<Resource[]>([]);
  const [profile, setProfile] = useState<Resource | null>(null);
  const [preferences, setPreferences] = useState<Resource | null>(null);
  const [query, setQuery] = useState('');
  const [admin, setAdmin] = useState('sources');
  const [cursor, setCursor] = useState<string | null>(null);
  const [recommendationId, setRecommendationId] = useState<string>();
  const [pickedRecommendation, setPickedRecommendation] = useState<string>();
  const [suggestedPlace, setSuggestedPlace] = useState<string>();
  const [collectionItems, setCollectionItems] = useState<Resource[]>([]);
  const [job, setJob] = useState<Resource | null>(null);
  const [modelMetrics, setModelMetrics] = useState<Resource | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      if (e instanceof ApiError && e.body.code === 'CLIENT_ERROR' && e.body.traceId === 'unavailable') {
        setError(
          `Không thể kết nối đến máy chủ Gateway (127.0.0.1:58080). Hãy đảm bảo Backend hoặc Contract Stub đã được khởi động. (${e.message} [${e.body.code}], status ${e.status})`
        );
      } else {
        setError(
          e instanceof ApiError
            ? `${e.message} (${e.body.code}). Mã hỗ trợ: ${e.body.traceId}${e.body.fieldErrors.map(f => `; ${f.field ?? ''}: ${f.message}`).join('')}`
            : (e as Error).message
        );
      }
      if (e instanceof ApiError && e.status === 401) {
        setMessage('Phiên đã hết hạn. Gia hạn phiên hoặc đăng nhập lại.');
      }
    } finally {
      setBusy(false);
      setSession(Boolean(tokens.get()));
    }
  }

  async function load(next?: string) {
    if (section === 'Bản đồ' || section === 'Doanh nghiệp' || section === 'Kiểm duyệt') return;

    if (section === 'Tài khoản') {
      const [p, prefs] = await Promise.all([travel.read('identity', '/me'), travel.read('identity', '/me/preferences')]);
      setProfile(p);
      setPreferences(prefs);
      return;
    }

    let service: ServiceName = 'catalog';
    let path = query.trim() ? `/places?q=${encodeURIComponent(query.trim())}` : '/places';

    if (section === 'Gợi ý') {
      const page = await travel.recommend();
      setRecommendationId(String((page as unknown as Resource).request_id));
      setRows(page.items);
      setCursor(null);
      return;
    }
    if (section === 'Bộ sưu tập') {
      service = 'community';
      path = '/me/collections';
    }
    if (section === 'Chuyến đi') {
      service = 'trip';
      path = '/me/trips';
    }
    if (section === 'Thông báo') {
      service = 'identity';
      path = '/me/notifications';
    }
    if (section === 'Quản trị') {
      service = admin === 'models' ? 'intelligence' : 'ingestion';
      path = admin === 'models' ? '/admin/models' : '/admin/data-sources';
    }

    if (next) {
      path += `${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(next)}`;
    }

    const page = await travel.read<Page>(service, path);
    setRows(old => (next ? [...old, ...page.items] : page.items));
    setCursor(page.next_cursor ?? null);
  }

  useEffect(() => {
    setSelected(null);
    setRows([]);
    setCursor(null);
    void run(() => load());
  }, [section, admin]);

  function form(event: FormEvent<HTMLFormElement>, action: (data: FormData) => Promise<void>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void run(() => action(data));
  }

  async function open(row: Resource) {
    if (section === 'Khám phá' || section === 'Gợi ý') {
      const placeId = String(row.place_id ?? row.id);
      const [place, page] = await Promise.all([travel.place(placeId), travel.reviews(placeId)]);
      setSelected(place);
      setReviews(page.items);
      if (section === 'Gợi ý') {
        setSuggestedPlace(placeId);
        setPickedRecommendation(recommendationId);
      }
    } else if (section === 'Chuyến đi') {
      setSelected(await travel.read('trip', `/trips/${id(row)}`));
    } else if (section === 'Bộ sưu tập') {
      setSelected(await travel.read('community', `/me/collections/${id(row)}`));
      setCollectionItems((await travel.read<Page>('community', `/collections/${id(row)}/items`)).items);
    } else {
      setSelected(row);
    }
  }

  // Active Zone determination
  const isBusinessZone = section === 'Doanh nghiệp';
  const isAdminZone = section === 'Kiểm duyệt' || section === 'Quản trị';
  const isTravelerZone = !isBusinessZone && !isAdminZone;

  return (
    <div className="travel-app">
      <a className="travel-skip" href="#travel-main">
        Đến nội dung chính
      </a>

      <header className="travel-header">
        <div className="travel-brand-group">
          <a href="/" className="travel-brand">
            <Icon name="compass" size={24} className="brand-compass-icon" />
            <span>
              SmartTravel <b>VN</b>
            </span>
          </a>
          <span className="travel-tagline">Hành trình của bạn</span>
        </div>

        {/* 4-Zone Switcher */}
        <div className="zone-switcher" role="group" aria-label="Không gian làm việc">
          <button
            type="button"
            className={`zone-btn ${isTravelerZone ? 'active' : ''}`}
            onClick={() => setSection('Khám phá')}
            aria-pressed={isTravelerZone}
          >
            <Icon name="compass" size={14} />
            <span>Du lịch</span>
          </button>
          <button
            type="button"
            className={`zone-btn ${isBusinessZone ? 'active' : ''}`}
            onClick={() => setSection('Doanh nghiệp')}
            aria-pressed={isBusinessZone}
          >
            <Icon name="building" size={14} />
            <span>Doanh nghiệp</span>
          </button>
          <button
            type="button"
            className={`zone-btn ${isAdminZone ? 'active' : ''}`}
            onClick={() => setSection('Kiểm duyệt')}
            aria-pressed={isAdminZone}
          >
            <Icon name="shield" size={14} />
            <span>Quản trị</span>
          </button>
        </div>

        <div className="travel-user-actions">
          {session ? (
            <button
              disabled={busy}
              className="btn-subtle"
              onClick={() =>
                void run(async () => {
                  await identity.logout();
                  setSection('Khám phá');
                  setAdmin('sources');
                  setProfile(null);
                  setPreferences(null);
                  setRows([]);
                  setSelected(null);
                  setPickedRecommendation(undefined);
                  setSuggestedPlace(undefined);
                })
              }
            >
              Đăng xuất
            </button>
          ) : (
            <button className="btn-primary" onClick={() => setSection('Tài khoản')}>
              Đăng nhập
            </button>
          )}
        </div>
      </header>

      <div className="travel-layout">
        <nav aria-label="Điều hướng ứng dụng">
          <span className="nav-heading-tag">Chức năng</span>
          {sections
            .filter(s => aiEnabled || s !== 'Gợi ý')
            .map(s => {
              const iconName = sectionIcons[s] || 'arrow';
              return (
                <button
                  key={s}
                  disabled={busy}
                  aria-current={section === s ? 'page' : undefined}
                  onClick={() => setSection(s)}
                  className="nav-item"
                >
                  <Icon name={iconName} size={16} />
                  <span>{s}</span>
                </button>
              );
            })}
        </nav>

        <main id="travel-main" tabIndex={-1} aria-busy={busy}>
          <div className="main-title-row">
            <h1>{section}</h1>
            <div aria-live="polite" className="travel-status">
              {busy ? (
                <>
                  <Icon name="refresh" size={15} className="spin-icon" /> Đang xử lý…
                </>
              ) : (
                message
              )}
            </div>
          </div>

          {error && (
            <p role="alert" className="travel-error">
              <Icon name="alert" size={18} /> {error}
            </p>
          )}

          {!session && (
            <section className="travel-panel auth-panel">
              <div className="auth-header">
                <h2>Đăng nhập để lưu hành trình</h2>
                <p>Khám phá trọn vẹn điểm đến, tạo lịch trình cá nhân và lưu những nơi bạn yêu thích.</p>
              </div>

              <form
                onSubmit={e =>
                  form(e, async d => {
                    await identity.login(String(d.get('email')), String(d.get('password')));
                    setMessage('Đã đăng nhập.');
                    await load();
                  })
                }
              >
                <Field name="email" title="Email" type="email" placeholder="ten@vidu.vn" />
                <Field name="password" title="Mật khẩu" type="password" placeholder="••••••••" />
                <button disabled={busy} className="btn-primary">
                  Đăng nhập
                </button>
              </form>

              <details>
                <summary>Tạo tài khoản</summary>
                <form
                  onSubmit={e =>
                    form(e, async d => {
                      await travel.mutate('identity', '/auth/register', {
                        email: d.get('email'),
                        password: d.get('password'),
                        display_name: d.get('name')
                      });
                      setMessage('Đã gửi đăng ký. Kiểm tra email để xác minh tài khoản trước khi đăng nhập.');
                    })
                  }
                >
                  <Field name="email" title="Email" type="email" placeholder="ten@vidu.vn" />
                  <Field
                    name="password"
                    title="Mật khẩu (ít nhất 12 ký tự)"
                    type="password"
                    placeholder="Tối thiểu 12 ký tự"
                  />
                  <Field name="name" title="Tên hiển thị" placeholder="Nguyễn Văn A" />
                  <button disabled={busy} className="btn-secondary">
                    Đăng ký
                  </button>
                </form>
              </details>

              <details>
                <summary>Xác minh email</summary>
                <form
                  onSubmit={e =>
                    form(e, async d => {
                      await travel.mutate('identity', '/auth/verify-email', { token: d.get('token') });
                      setMessage('Email đã được xác minh.');
                    })
                  }
                >
                  <Field name="token" title="Mã xác minh trong email" placeholder="Nhập token xác nhận..." />
                  <button disabled={busy} className="btn-secondary">
                    Xác minh
                  </button>
                </form>
              </details>
            </section>
          )}

          {session && (
            <button
              className="travel-subtle"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await identity.refresh();
                  setMessage('Đã gia hạn phiên.');
                })
              }
            >
              <Icon name="refresh" size={15} /> Gia hạn phiên đăng nhập
            </button>
          )}

          {section === 'Khám phá' && (
            <form
              className="travel-search"
              onSubmit={e => {
                e.preventDefault();
                void run(() => load());
              }}
            >
              <label>
                Tìm địa điểm
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Tên địa điểm hoặc từ khóa (ví dụ: Hội An, Cà phê, Bãi biển...)"
                />
              </label>
              <button disabled={busy} className="btn-primary">
                <Icon name="search" size={16} /> Tìm kiếm
              </button>
            </form>
          )}

          {section === 'Quản trị' && (
            <label className="admin-selector-label">
              Loại dữ liệu
              <select value={admin} onChange={e => setAdmin(e.target.value)}>
                <option value="sources">Nguồn nhập dữ liệu</option>
                {aiEnabled && <option value="models">Mô hình gợi ý</option>}
              </select>
            </label>
          )}

          {section === 'Bản đồ' && <MapPanel travel={travel} />}
          {section === 'Doanh nghiệp' && session && <BusinessPanel travel={travel} />}
          {section === 'Kiểm duyệt' && session && <ModerationPanel travel={travel} />}

          {!['Tài khoản', 'Bản đồ', 'Doanh nghiệp', 'Kiểm duyệt'].includes(section) && (
            <>
              <div className="section-action-bar">
                <button disabled={busy} className="btn-secondary" onClick={() => void run(() => load())}>
                  <Icon name="refresh" size={15} /> Tải lại
                </button>
              </div>

              <div className="travel-grid">
                {rows.map((row, i) => (
                  <article className="travel-panel place-catalog-card" key={`${id(row)}-${i}`}>
                    <div className="card-top-content">
                      <h2>{label(row)}</h2>
                      {row.description != null && <p className="card-desc">{String(row.description)}</p>}
                      {row.status != null && (
                        <p className="card-status-line">
                          <span className="status-pill">Trạng thái: {String(row.status)}</span>
                        </p>
                      )}
                      {row.explanation != null && (
                        <p className="recommendation-badge">
                          <Icon name="sparkles" size={14} /> {String(row.explanation)}
                        </p>
                      )}
                    </div>

                    <div className="card-footer-actions">
                      <button disabled={busy} className="btn-outline" onClick={() => void run(() => open(row))}>
                        Xem chi tiết
                      </button>

                      {section === 'Thông báo' && (
                        <button
                          disabled={busy}
                          className="btn-subtle"
                          onClick={() =>
                            void run(async () => {
                              await travel.mutate('identity', `/me/notifications/${id(row)}/read`, undefined, 'PATCH');
                              await load();
                            })
                          }
                        >
                          <Icon name="check" size={15} /> Đánh dấu đã đọc
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              {!busy && !rows.length && (
                <div className="empty-subtle">
                  <Icon name="compass" size={32} />
                  <p>Chưa có dữ liệu hiển thị.</p>
                </div>
              )}

              {cursor && (
                <button
                  disabled={busy}
                  className="btn-secondary load-more-btn"
                  onClick={() => void run(() => load(cursor))}
                >
                  Xem thêm
                </button>
              )}
            </>
          )}

          {section === 'Bộ sưu tập' && session && (
            <section className="travel-panel create-collection-panel">
              <h2>Tạo bộ sưu tập</h2>
              <form
                onSubmit={e =>
                  form(e, async d => {
                    await travel.mutate('community', '/me/collections', {
                      name: d.get('name'),
                      visibility: d.get('visibility')
                    });
                    await load();
                  })
                }
              >
                <Field name="name" title="Tên bộ sưu tập" placeholder="Ví dụ: Quán cà phê chill Hội An" />
                <label>
                  Quyền xem
                  <select name="visibility">
                    <option value="PRIVATE">Riêng tư</option>
                    <option value="PUBLIC">Công khai</option>
                  </select>
                </label>
                <button disabled={busy} className="btn-primary">
                  <Icon name="plus" size={16} /> Tạo bộ sưu tập
                </button>
              </form>
            </section>
          )}

          {section === 'Chuyến đi' && session && (
            <section className="travel-panel create-trip-panel">
              <h2>Tạo chuyến đi</h2>
              <form
                onSubmit={e =>
                  form(e, async d => {
                    await travel.mutate('trip', '/me/trips', {
                      name: d.get('name'),
                      start_date: d.get('start'),
                      end_date: d.get('end'),
                      timezone: 'Asia/Ho_Chi_Minh',
                      currency: 'VND',
                      budget: Number(d.get('budget'))
                    });
                    await load();
                  })
                }
              >
                <Field name="name" title="Tên chuyến đi" placeholder="Ví dụ: Kỳ nghỉ hè Đà Nẵng 3N2Đ" />
                <Field name="start" title="Ngày bắt đầu" type="date" />
                <Field name="end" title="Ngày kết thúc" type="date" />
                <Field name="budget" title="Ngân sách (VND)" type="number" placeholder="5000000" />
                <button disabled={busy} className="btn-primary">
                  <Icon name="plus" size={16} /> Tạo chuyến đi
                </button>
              </form>
            </section>
          )}

          {selected && (
            <section className="travel-panel detail-modal-panel">
              <div className="panel-header-actions">
                <h2>{label(selected)}</h2>
                <button className="travel-subtle" onClick={() => setSelected(null)}>
                  Đóng chi tiết
                </button>
              </div>

              <dl className="place-dl-grid">
                {Object.entries(selected)
                  .filter(([k, v]) => detailLabels[k] && v !== null && typeof v !== 'object')
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{detailLabels[k]}</dt>
                      <dd>{String(v)}</dd>
                    </div>
                  ))}
              </dl>

              {(section === 'Khám phá' || section === 'Gợi ý') && (
                <div className="reviews-and-actions-section">
                  <h3>Đánh giá</h3>
                  <div className="reviews-list">
                    {reviews.length ? (
                      reviews.map((r, i) => (
                        <blockquote key={i} className="review-quote">
                          <div className="stars-pill">
                            <Icon name="star" size={14} /> {String(r.rating)}/5
                          </div>
                          <p>{String(r.content)}</p>
                        </blockquote>
                      ))
                    ) : (
                      <p className="no-reviews-text">Chưa có đánh giá nào cho địa điểm này.</p>
                    )}
                  </div>

                  {session && (
                    <div className="review-forms-box">
                      <button
                        disabled={busy}
                        className="btn-outline favorite-btn"
                        onClick={() =>
                          void run(async () => {
                            await travel.mutate('community', `/me/favorites/${id(selected)}`, undefined, 'PUT');
                            setMessage('Đã lưu vào yêu thích.');
                          })
                        }
                      >
                        <Icon name="heart" size={16} /> Lưu yêu thích
                      </button>

                      <form
                        onSubmit={e =>
                          form(e, async d => {
                            await travel.review(id(selected), Number(d.get('rating')), String(d.get('content')));
                            setMessage('Đánh giá đã gửi; chờ kiểm duyệt.');
                            setReviews((await travel.reviews(id(selected))).items);
                          })
                        }
                        className="write-review-form"
                      >
                        <label>
                          Số sao
                          <select name="rating">
                            {[5, 4, 3, 2, 1].map(n => (
                              <option key={n}>{n}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Nội dung
                          <textarea
                            name="content"
                            required
                            maxLength={1024}
                            placeholder="Chia sẻ cảm nhận chân thực của bạn về địa điểm này..."
                          />
                        </label>
                        <button disabled={busy} className="btn-primary">
                          Gửi đánh giá
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {selected && section === 'Gợi ý' && (
            <button
              disabled={busy}
              className="btn-primary cta-use-recommendation"
              onClick={() => {
                setSection('Chuyến đi');
                setMessage('Chọn chuyến đi và ngày để thêm địa điểm được gợi ý.');
              }}
            >
              <Icon name="calendar" size={16} /> Dùng gợi ý trong lịch trình
            </button>
          )}

          {selected?.trip_id && section === 'Chuyến đi' ? (
            <section className="travel-panel trip-editor-container">
              <TripEditor
                travel={travel}
                trip={selected}
                recommendationId={pickedRecommendation}
                suggestedPlace={suggestedPlace}
                busy={busy}
                run={run}
              />
            </section>
          ) : null}

          {selected && section === 'Bộ sưu tập' && (
            <section className="travel-panel collection-detail-panel">
              <h3>Địa điểm trong bộ sưu tập</h3>
              <div className="collection-items-list">
                {collectionItems.length ? (
                  collectionItems.map((item, i) => (
                    <p key={i} className="collection-item-row">
                      <Icon name="pin" size={14} /> <strong>{String(item.place_name ?? item.place_id)}</strong> ·{' '}
                      <span>{String(item.note)}</span>
                    </p>
                  ))
                ) : (
                  <p>Chưa có địa điểm nào trong bộ sưu tập này.</p>
                )}
              </div>

              <form
                onSubmit={e =>
                  form(e, async d => {
                    await travel.mutate(
                      'community',
                      `/collections/${id(selected)}/items`,
                      { place_id: d.get('place'), note: d.get('note') },
                      'POST',
                      Number(selected.version)
                    );
                    setSelected(await travel.read('community', `/me/collections/${id(selected)}`));
                    setCollectionItems((await travel.read<Page>('community', `/collections/${id(selected)}/items`)).items);
                  })
                }
                className="add-to-collection-form"
              >
                <Field name="place" title="Mã địa điểm" placeholder="Nhập UUID địa điểm" />
                <Field name="note" title="Ghi chú" placeholder="Ví dụ: Nên ghé lúc hoàng hôn" />
                <button disabled={busy} className="btn-primary">
                  <Icon name="plus" size={16} /> Thêm vào bộ sưu tập
                </button>
              </form>
            </section>
          )}

          {selected && section === 'Quản trị' && admin === 'sources' && (
            <section className="travel-panel ingestion-admin-panel">
              <h3>Nhập dữ liệu từ nguồn</h3>
              <form
                onSubmit={e =>
                  form(e, async d => {
                    setJob(
                      await travel.mutate('ingestion', `/admin/data-sources/${id(selected)}/import-jobs`, {
                        mode: d.get('mode')
                      })
                    );
                    setMessage('Job nhập đã được tiếp nhận. Tải lại trạng thái để xem kết quả.');
                  })
                }
              >
                <label>
                  Chế độ
                  <select name="mode">
                    <option>FULL</option>
                    <option>INCREMENTAL</option>
                    <option>REPLAY</option>
                  </select>
                </label>
                <button disabled={busy} className="btn-primary">
                  <Icon name="refresh" size={16} /> Bắt đầu nhập dữ liệu
                </button>
              </form>

              {job && (
                <div className="job-status-box">
                  <p>
                    Job: <strong>{String(job.job_id ?? job.id)}</strong> · Trạng thái:{' '}
                    <span className="status-pill">{String(job.status)}</span>
                  </p>
                  <button
                    disabled={busy}
                    className="btn-secondary"
                    onClick={() =>
                      void run(async () =>
                        setJob(await travel.read('ingestion', `/admin/import-jobs/${String(job.job_id ?? job.id)}`))
                      )
                    }
                  >
                    Tải lại trạng thái job
                  </button>
                </div>
              )}
            </section>
          )}

          {selected && section === 'Quản trị' && admin === 'models' && (
            <section className="travel-panel model-admin-panel">
              <h3>Quản lý mô hình</h3>
              <button
                disabled={busy}
                className="btn-secondary"
                onClick={() =>
                  void run(async () =>
                    setModelMetrics(await travel.read('intelligence', `/admin/models/${id(selected)}/metrics`))
                  )
                }
              >
                Xem kết quả đánh giá
              </button>

              {modelMetrics && (
                <dl className="metrics-dl">
                  {Object.entries(modelMetrics)
                    .filter(([, v]) => typeof v !== 'object')
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{String(v)}</dd>
                      </div>
                    ))}
                </dl>
              )}

              <form
                onSubmit={e =>
                  form(e, async d => {
                    await travel.mutate(
                      'intelligence',
                      `/admin/models/${id(selected)}/${String(d.get('action'))}`,
                      { reason: d.get('reason') },
                      'POST',
                      Number(selected.version)
                    );
                    await load();
                    setSelected(null);
                    setMessage('Đã tiếp nhận thao tác mô hình.');
                  })
                }
              >
                <label>
                  Thao tác
                  <select name="action">
                    <option value="validate">Kiểm tra mô hình</option>
                    <option value="deploy">Kích hoạt mô hình</option>
                    <option value="rollback">Khôi phục mô hình</option>
                  </select>
                </label>
                <Field name="reason" title="Lý do thay đổi" placeholder="Ví dụ: Model accuracy đạt ngưỡng chuẩn" />
                <button disabled={busy} className="btn-primary">
                  Thực hiện thao tác
                </button>
              </form>
            </section>
          )}

          {section === 'Tài khoản' && profile && (
            <section className="travel-panel account-profile-panel">
              <div className="account-hero-card">
                <div className="account-avatar-circle">
                  <Icon name="user" size={32} />
                </div>
                <div>
                  <h2>{String(profile.display_name)}</h2>
                  <p className="account-email-subtext">{String(profile.email)}</p>
                </div>
              </div>

              <form
                onSubmit={e =>
                  form(e, async d => {
                    setProfile(
                      await travel.mutate(
                        'identity',
                        '/me',
                        { display_name: d.get('name') },
                        'PATCH',
                        Number(profile.version)
                      )
                    );
                    setMessage('Đã cập nhật hồ sơ.');
                  })
                }
                className="profile-update-form"
              >
                <Field name="name" title="Tên hiển thị mới" placeholder="Nhập tên hiển thị mới" />
                <button disabled={busy} className="btn-primary">
                  Lưu hồ sơ
                </button>
              </form>

              {preferences && (aiEnabled || preferences.personalization_enabled === true) && (
                <form
                  onSubmit={e =>
                    form(e, async d => {
                      setPreferences(
                        await travel.mutate(
                          'identity',
                          '/me/preferences',
                          {
                            personalization_enabled: aiEnabled && d.get('consent') === 'on',
                            consent_version: Number(preferences.consent_version)
                          },
                          'PUT',
                          Number(preferences.version)
                        )
                      );
                      setMessage('Đã cập nhật quyền cá nhân hóa.');
                    })
                  }
                  className="privacy-preferences-form"
                >
                  {aiEnabled ? (
                    <label className="checkbox-label">
                      <input
                        name="consent"
                        type="checkbox"
                        defaultChecked={Boolean(preferences.personalization_enabled)}
                        key={String(preferences.version)}
                      />
                      <span>Cho phép cá nhân hóa gợi ý</span>
                    </label>
                  ) : (
                    <p className="hint-text">Gợi ý đang tạm dừng. Bạn có thể thu hồi quyền cá nhân hóa đã cấp.</p>
                  )}
                  <button disabled={busy} className="btn-secondary">
                    Lưu quyền riêng tư
                  </button>
                </form>
              )}

              <details className="danger-zone-details">
                <summary>Yêu cầu xóa tài khoản</summary>
                <p className="danger-text">
                  Yêu cầu sẽ xóa dữ liệu cá nhân tại các dịch vụ. Phiên đăng nhập sẽ bị thu hồi.
                </p>
                <form
                  onSubmit={e =>
                    form(e, async () => {
                      await travel.mutate('identity', '/me/deletion-requests', { policy_version: 1 });
                      tokens.set(null);
                      setProfile(null);
                      setPreferences(null);
                      setMessage('Đã tiếp nhận yêu cầu xóa.');
                    })
                  }
                >
                  <label className="checkbox-label">
                    <input type="checkbox" required />
                    <span>Tôi xác nhận muốn xóa tài khoản</span>
                  </label>
                  <button disabled={busy} className="btn-destructive">
                    Gửi yêu cầu xóa
                  </button>
                </form>
              </details>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
