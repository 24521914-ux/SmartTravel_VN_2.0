import { useEffect, useState, type FormEvent } from 'react';
import { TravelClient, type Page, type Resource } from './api/travel';
import { aiEnabled } from './features';

interface Props { travel: TravelClient; trip: Resource; recommendationId?: string; suggestedPlace?: string; run: (action: () => Promise<void>) => Promise<void>; busy: boolean }
const resourceId = (row: Resource) => String(row.id ?? row.day_id ?? row.item_id ?? '');
export default function TripEditor({ travel, trip, recommendationId, suggestedPlace, run, busy }: Props) {
  const tripId = String(trip.id ?? trip.trip_id);
  const [days, setDays] = useState<Resource[]>([]);
  const [day, setDay] = useState<Resource | null>(null);
  const [items, setItems] = useState<Resource[]>([]);
  const [places, setPlaces] = useState<Resource[]>([]);
  const [version, setVersion] = useState(Number(trip.version));
  async function loadDays() { setDays((await travel.read<Page>('trip', `/trips/${tripId}/days`)).items); setVersion(Number((await travel.read('trip', `/trips/${tripId}`)).version)); }
  async function loadItems(selected: Resource) { setDay(selected); setItems((await travel.read<Page>('trip', `/trips/${tripId}/days/${resourceId(selected)}/items`)).items); setVersion(Number((await travel.read('trip', `/trips/${tripId}`)).version)); }
  useEffect(() => { void run(async () => { await loadDays(); setPlaces((await travel.places()).items); }); }, [tripId]);
  function submit(e: FormEvent<HTMLFormElement>, action: (d: FormData) => Promise<void>) { e.preventDefault(); const d = new FormData(e.currentTarget); void run(() => action(d)); }
  return <div><h3>Ngày và địa điểm trong lịch trình</h3><form onSubmit={e => submit(e, async d => { await travel.mutate('trip', `/trips/${tripId}/days`, { date: d.get('date') }, 'POST', version); await loadDays(); })}><label>Ngày tham quan<input name="date" type="date" min={String(trip.start_date)} max={String(trip.end_date)} required /></label><button disabled={busy}>Thêm ngày</button></form>
    <div>{days.map(d => <button key={resourceId(d)} disabled={busy} aria-pressed={day && resourceId(day) === resourceId(d) || false} onClick={() => void run(() => loadItems(d))}>{String(d.date)}</button>)}</div>
    {day && <><h4>Địa điểm ngày {String(day.date)}</h4>{items.map(item => <article key={resourceId(item)} className="travel-panel"><strong>{String(item.place_name ?? (item.snapshot as Resource | undefined)?.name ?? item.place_id)}</strong><p>{String(item.note)} · {String(item.duration_minutes)} phút · {item.locked ? 'Đã khóa' : 'Có thể sắp xếp'}</p><button disabled={busy} onClick={() => void run(async () => { await travel.mutate('trip', `/trips/${tripId}/days/${resourceId(day)}/items/${resourceId(item)}`, { locked: !item.locked }, 'PATCH', Number(item.version)); await loadItems(day); })}>{item.locked ? 'Mở khóa địa điểm' : 'Khóa địa điểm'}</button></article>)}<form onSubmit={e => submit(e, async d => { await travel.mutate('trip', `/trips/${tripId}/days/${resourceId(day)}/items`, { place_id: d.get('place'), note: d.get('note'), duration_minutes: Number(d.get('duration')), locked: d.get('locked') === 'on', recommendation_request_id: d.get('recommendation') || null }, 'POST', version); await loadItems(day); })}><label>Mã địa điểm<select name="place" defaultValue={suggestedPlace ?? ""} required><option value="">Chọn địa điểm</option>{places.map(p => <option key={String(p.place_id ?? p.id)} value={String(p.place_id ?? p.id)}>{String(p.name)}</option>)}</select></label><label>Ghi chú<input name="note" required maxLength={1024} /></label><label>Thời gian (phút)<input name="duration" type="number" min="0" defaultValue="60" required /></label>{aiEnabled && <label>Mã lần gợi ý (nếu chọn từ gợi ý)<input name="recommendation" defaultValue={recommendationId ?? ''} /></label>}<label><input name="locked" type="checkbox" /> Khóa địa điểm trong lịch trình</label><button disabled={busy}>Thêm địa điểm vào ngày</button></form></>}
  </div>;
}
