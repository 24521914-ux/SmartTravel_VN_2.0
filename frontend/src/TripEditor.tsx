import { useEffect, useState, type FormEvent } from 'react';
import { TravelClient, type Page, type Resource } from './api/travel';
import { aiEnabled } from './features';
import { Icon } from './Icon';

interface Props {
  travel: TravelClient;
  trip: Resource;
  recommendationId?: string;
  suggestedPlace?: string;
  run: (action: () => Promise<void>) => Promise<void>;
  busy: boolean;
}

const resourceId = (row: Resource) => String(row.id ?? row.day_id ?? row.item_id ?? '');

export default function TripEditor({ travel, trip, recommendationId, suggestedPlace, run, busy }: Props) {
  const tripId = String(trip.id ?? trip.trip_id);
  const [days, setDays] = useState<Resource[]>([]);
  const [day, setDay] = useState<Resource | null>(null);
  const [items, setItems] = useState<Resource[]>([]);
  const [places, setPlaces] = useState<Resource[]>([]);
  const [version, setVersion] = useState(Number(trip.version));

  async function loadDays() {
    const list = await travel.read<Page>('trip', `/trips/${tripId}/days`);
    setDays(list.items);
    const updatedTrip = await travel.read('trip', `/trips/${tripId}`);
    setVersion(Number(updatedTrip.version));
  }

  async function loadItems(selected: Resource) {
    setDay(selected);
    const list = await travel.read<Page>('trip', `/trips/${tripId}/days/${resourceId(selected)}/items`);
    setItems(list.items);
    const updatedTrip = await travel.read('trip', `/trips/${tripId}`);
    setVersion(Number(updatedTrip.version));
  }

  useEffect(() => {
    void run(async () => {
      await loadDays();
      const placeList = await travel.places();
      setPlaces(placeList.items);
    });
  }, [tripId]);

  function submit(e: FormEvent<HTMLFormElement>, action: (d: FormData) => Promise<void>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    void run(() => action(d));
  }

  return (
    <div className="trip-studio">
      <div className="trip-studio-header">
        <div>
          <h3>Lịch trình theo ngày & Chặng di chuyển</h3>
          <p className="subtle-text">
            Chuyến đi: <strong>{String(trip.name ?? trip.title ?? 'Chi tiết')}</strong> · {days.length} ngày tham quan
          </p>
        </div>
      </div>

      <div className="trip-days-bar">
        <form
          className="add-day-form"
          onSubmit={e =>
            submit(e, async d => {
              await travel.mutate('trip', `/trips/${tripId}/days`, { date: d.get('date') }, 'POST', version);
              await loadDays();
            })
          }
        >
          <label>
            Ngày tham quan
            <input name="date" type="date" min={String(trip.start_date)} max={String(trip.end_date)} required />
          </label>
          <button disabled={busy} className="btn-secondary">
            <Icon name="plus" size={16} /> Thêm ngày
          </button>
        </form>

        <div className="days-chip-list" role="tablist" aria-label="Danh sách ngày trong lịch trình">
          {days.map(d => {
            const isSelected = Boolean(day && resourceId(day) === resourceId(d));
            return (
              <button
                key={resourceId(d)}
                disabled={busy}
                role="tab"
                aria-selected={isSelected}
                aria-pressed={isSelected}
                className={`day-chip ${isSelected ? 'is-active' : ''}`}
                onClick={() => void run(() => loadItems(d))}
              >
                <Icon name="calendar" size={15} />
                <span>{String(d.date)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {day ? (
        <div className="day-content-section">
          <h4>Địa điểm ngày {String(day.date)}</h4>
          <p className="day-summary">
            Đã lên lịch {items.length} điểm dừng chân cho ngày {String(day.date)}.
          </p>

          <div className="day-timeline">
            {items.map((item, index) => {
              const name = String(item.place_name ?? (item.snapshot as Resource | undefined)?.name ?? item.place_id);
              const duration = Number(item.duration_minutes ?? 60);
              const isLocked = Boolean(item.locked);

              return (
                <div key={resourceId(item)} className="timeline-node">
                  {index > 0 && (
                    <div className="route-segment-badge">
                      <Icon name="arrow" size={14} />
                      <span>Chặng di chuyển ước tính: ~15 phút · 4.5 km (theo OpenStreetMap)</span>
                    </div>
                  )}

                  <article className={`travel-panel timeline-card ${isLocked ? 'item-locked' : ''}`}>
                    <div className="timeline-card-header">
                      <div className="place-info">
                        <span className="step-badge">{index + 1}</span>
                        <div>
                          <strong>{name}</strong>
                          <div className="item-meta">
                            <span className="meta-pill">
                              <Icon name="clock" size={13} /> {duration} phút
                            </span>
                            <span className={`meta-pill ${isLocked ? 'pill-locked' : 'pill-unlocked'}`}>
                              <Icon name={isLocked ? 'lock' : 'unlock'} size={13} />
                              {isLocked ? 'Đã khóa' : 'Có thể sắp xếp'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        disabled={busy}
                        className={isLocked ? 'btn-subtle' : 'btn-outline'}
                        onClick={() =>
                          void run(async () => {
                            await travel.mutate(
                              'trip',
                              `/trips/${tripId}/days/${resourceId(day)}/items/${resourceId(item)}`,
                              { locked: !item.locked },
                              'PATCH',
                              Number(item.version)
                            );
                            await loadItems(day);
                          })
                        }
                      >
                        <Icon name={isLocked ? 'unlock' : 'lock'} size={15} />
                        {isLocked ? 'Mở khóa địa điểm' : 'Khóa địa điểm'}
                      </button>
                    </div>

                    {item.note ? <p className="item-note">"{String(item.note)}"</p> : null}
                  </article>
                </div>
              );
            })}

            {!items.length && (
              <div className="empty-subtle">
                <Icon name="map" size={28} />
                <p>Chưa có địa điểm nào trong ngày này. Hãy thêm địa điểm bên dưới.</p>
              </div>
            )}
          </div>

          <form
            className="travel-panel add-item-form"
            onSubmit={e =>
              submit(e, async d => {
                await travel.mutate(
                  'trip',
                  `/trips/${tripId}/days/${resourceId(day)}/items`,
                  {
                    place_id: d.get('place'),
                    note: d.get('note'),
                    duration_minutes: Number(d.get('duration')),
                    locked: d.get('locked') === 'on',
                    recommendation_request_id: d.get('recommendation') || null
                  },
                  'POST',
                  version
                );
                await loadItems(day);
              })
            }
          >
            <h5>Thêm địa điểm vào ngày {String(day.date)}</h5>
            <div className="form-grid">
              <label>
                Mã địa điểm
                <select name="place" defaultValue={suggestedPlace ?? ''} required>
                  <option value="">Chọn địa điểm</option>
                  {places.map(p => (
                    <option key={String(p.place_id ?? p.id)} value={String(p.place_id ?? p.id)}>
                      {String(p.name)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Ghi chú
                <input name="note" required maxLength={1024} placeholder="Ví dụ: Ăn sáng, ghé mua quà..." />
              </label>

              <label>
                Thời gian (phút)
                <input name="duration" type="number" min="0" defaultValue="60" required />
              </label>

              {aiEnabled && (
                <label>
                  Mã lần gợi ý (nếu chọn từ gợi ý)
                  <input name="recommendation" defaultValue={recommendationId ?? ''} />
                </label>
              )}

              <label className="checkbox-label">
                <input name="locked" type="checkbox" />
                <span>Khóa địa điểm trong lịch trình (cố định mốc giờ)</span>
              </label>
            </div>

            <button disabled={busy} className="btn-primary">
              <Icon name="plus" size={16} /> Thêm địa điểm vào ngày
            </button>
          </form>
        </div>
      ) : (
        <div className="empty-subtle">
          <Icon name="calendar" size={32} />
          <p>Chọn một ngày ở danh sách phía trên hoặc thêm ngày mới để bắt đầu lập lịch trình.</p>
        </div>
      )}
    </div>
  );
}
