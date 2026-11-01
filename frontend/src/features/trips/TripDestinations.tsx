import { useEffect, useState, type FormEvent } from 'react';
import type { Resource, TravelClient } from '../../shared/api';
import { useToast } from '../../app/providers/ToastProvider';

interface Props { travel: TravelClient; trip: Resource; busy: boolean; onChanged: () => Promise<unknown> }
const id = (row: Resource) => String(row.segment_id ?? row.destination_id ?? row.trip_id ?? row.id);

export function TripDestinations({ travel, trip, busy, onChanged }: Props) {
  const { showToast } = useToast();
  const [segments, setSegments] = useState<Resource[]>([]);
  const [destinations, setDestinations] = useState<Resource[]>([]);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const tripId = id(trip);

  async function load() {
    setError('');
    try {
      const [rows, available] = await Promise.all([
        travel.readAll('trip', `/trips/${tripId}/destinations`), travel.readAll('catalog', '/destinations')
      ]);
      setSegments(rows.items); setDestinations(available.items);
    } catch (error) { setError((error as Error).message); }
  }
  useEffect(() => { void load(); }, [travel, tripId, trip.version]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await travel.mutate('trip', `/trips/${tripId}/destinations${editing ? `/${id(editing)}` : ''}`, {
        destination_id: form.get('destination'), start_date: form.get('start'), end_date: form.get('end')
      }, editing ? 'PATCH' : 'POST', Number(trip.version));
      setEditing(null); await onChanged(); await load();
      showToast('Đã lưu chặng điểm đến.', 'success');
    } catch (error) { showToast((error as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  async function open(segment: Resource) {
    setSaving(true);
    try { setEditing(await travel.read('trip', `/trips/${tripId}/destinations/${id(segment)}`)); }
    catch (error) { showToast((error as Error).message, 'error'); }
    finally { setSaving(false); }
  }
  async function remove(segment: Resource) {
    setSaving(true);
    try {
      await travel.mutate('trip', `/trips/${tripId}/destinations/${id(segment)}`, undefined, 'DELETE', Number(trip.version));
      if (editing && id(editing) === id(segment)) setEditing(null);
      await onChanged(); await load();
    } catch (error) { showToast((error as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  return <section aria-label="Chặng điểm đến" className="travel-panel">
    <h3>Chặng điểm đến</h3>
    {error && <p role="alert">{error} <button type="button" onClick={() => void load()}>Thử lại</button></p>}
    <form key={editing ? id(editing) : 'new'} onSubmit={save} className="form-grid">
      <label>Điểm đến của chặng<select name="destination" defaultValue={String(editing?.destination_id ?? '')} required><option value="">Chọn điểm đến</option>{destinations.map(row => <option key={id(row)} value={id(row)}>{String(row.name)}</option>)}</select></label>
      <label>Từ ngày<input name="start" type="date" min={String(trip.start_date)} max={String(trip.end_date)} defaultValue={String(editing?.start_date ?? trip.start_date)} required /></label>
      <label>Đến ngày<input name="end" type="date" min={String(trip.start_date)} max={String(trip.end_date)} defaultValue={String(editing?.end_date ?? trip.end_date)} required /></label>
      <button type="submit" disabled={busy || saving}>{editing ? 'Lưu chặng điểm đến' : 'Thêm chặng điểm đến'}</button>
      {editing && <button type="button" onClick={() => setEditing(null)}>Hủy sửa chặng</button>}
    </form>
    {segments.map(row => <article key={id(row)}><p>{String(destinations.find(destination => id(destination) === String(row.destination_id))?.name ?? row.destination_id)} · {String(row.start_date)} — {String(row.end_date)}</p><button type="button" disabled={busy || saving} onClick={() => void open(row)}>Sửa chặng điểm đến</button><button type="button" disabled={busy || saving} onClick={() => void remove(row)}>Xóa chặng điểm đến</button></article>)}
  </section>;
}
