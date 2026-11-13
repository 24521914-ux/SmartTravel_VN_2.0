import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Icon, Button, Badge, ErrorState } from '../../shared/ui';
import type { TravelClient, Resource } from '../../shared/api';
import { useToast } from '../../app/providers/ToastProvider';
import '../trips/integration-layout.css';

export interface CollectionsPanelProps {
  travel: TravelClient;
  busy?: boolean;
}

export function CollectionsPanel({ travel, busy = false }: CollectionsPanelProps) {
  const { showToast } = useToast();
  const [collections, setCollections] = useState<Resource[]>([]);
  const [selected, setSelected] = useState<Resource | null>(null);
  const [items, setItems] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [places, setPlaces] = useState<Resource[]>([]);
  const [provinces, setProvinces] = useState<Resource[]>([]);
  const [provinceId, setProvinceId] = useState('');
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchRevision = useRef(0);
  const [placeId, setPlaceId] = useState('');
  const [note, setNote] = useState('');
  const [editingItem, setEditingItem] = useState<Resource | null>(null);
  const [publicCollection, setPublicCollection] = useState<Resource | null>(null);
  const [publicItems, setPublicItems] = useState<Resource[]>([]);
  const [placeNames, setPlaceNames] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE');

  useEffect(() => {
    let active = true;
    const ids = [...new Set([...items, ...publicItems].map(item => String(item.place_id)))];
    void Promise.allSettled(ids.map(async placeId => [placeId, String((await travel.place(placeId)).name)] as const))
      .then(results => {
        if (!active) return;
        const names = Object.fromEntries(results.map((result, index) => result.status === 'fulfilled'
          ? result.value : [ids[index], 'Địa điểm hiện không khả dụng']));
        setPlaceNames(previous => ({ ...previous, ...names }));
      });
    return () => { active = false; };
  }, [items, publicItems, travel]);

  useEffect(() => {
    let active = true;
    void travel.readAll('catalog', '/geographic-units').then(data => {
      if (active) setProvinces(data.items.filter(row => row.level === 'PROVINCE')
        .sort((a, b) => String(a.name_vi ?? a.name).localeCompare(String(b.name_vi ?? b.name), 'vi')));
    }).catch(() => { if (active) showToast('Không thể tải danh sách tỉnh/thành.', 'error'); });
    return () => { active = false; searchRevision.current += 1; };
  }, [travel]);

  function resetPlaceSearch() {
    searchRevision.current += 1;
    setPlaces([]); setPlaceId(''); setNote(''); setSearched(false); setSearching(false);
  }

  async function loadCollections() {
    setLoading(true);
    setError('');
    try {
      const data = await travel.readAll('community', '/me/collections');
      setCollections(data.items ?? []);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadCollectionItems(col: Resource) {
    if (!selected || id(selected) !== id(col)) { resetPlaceSearch(); setProvinceId(''); }
    setSelected(col);
    setItems([]);
    setLoading(true);
    setError('');
    try {
      const colId = String(col.id ?? col.collection_id ?? '');
      const current = await travel.read<Resource>('community', `/me/collections/${encodeURIComponent(colId)}`);
      setSelected(current);
      const data = await travel.readAll('community', `/collections/${encodeURIComponent(colId)}/items`);
      setItems(data.items ?? []);
      setCollections(previous => previous.map(row => String(row.id ?? row.collection_id) === colId ? current : row));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadCollections();
  }, [travel]);

  async function handleCreateCollection(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const newCol = await travel.mutate<Resource>('community', '/me/collections', {
        name: name.trim(),
        visibility
      });
      setCollections(prev => [newCol, ...prev]);
      setName('');
      showToast(`Đã tạo bộ sưu tập "${name.trim()}"`, 'success');
    } catch (error) {
      showToast((error as Error).message || 'Không thể tạo bộ sưu tập.', 'error');
    } finally {
      setLoading(false);
    }
  }

  const id = (row: Resource) => String(row.id ?? row.collection_id ?? row.item_id ?? '');

  async function addPlace(event: FormEvent) {
    event.preventDefault();
    if (!selected || !provinceId || !searched || searching || !places.some(place => String(place.id ?? place.place_id) === placeId)) return;
    setLoading(true);
    try {
      await travel.mutate('community', `/collections/${id(selected)}/items`, { place_id: placeId, note: note.trim() || 'Địa điểm yêu thích' }, 'POST', Number(selected.version));
      await loadCollectionItems(selected);
      setNote('');
      showToast('Đã thêm địa điểm vào bộ sưu tập.', 'success');
    } catch (error) { showToast((error as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  async function updateCollection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setLoading(true);
    try {
      const updated = await travel.mutate<Resource>('community', `/me/collections/${id(selected)}`, { name: form.get('name'), visibility: form.get('visibility') }, 'PATCH', Number(selected.version));
      setSelected(updated);
      await loadCollections();
      showToast('Đã cập nhật bộ sưu tập.', 'success');
    } catch (error) { showToast((error as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  async function deleteCollection(col: Resource) {
    setLoading(true);
    try {
      await travel.mutate('community', `/me/collections/${id(col)}`, undefined, 'DELETE', Number(col.version));
      if (selected && id(selected) === id(col)) setSelected(null);
      await loadCollections();
      showToast('Đã xóa bộ sưu tập.', 'success');
    } catch (error) { showToast((error as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  async function changeItem(item: Resource, index: number, offset?: number) {
    if (!selected) return;
    setLoading(true);
    try {
      if (offset !== undefined) {
        const reordered = [...items];
        [reordered[index], reordered[index + offset]] = [reordered[index + offset], reordered[index]];
        await travel.mutate('community', `/collections/${id(selected)}/items/order`, { item_ids: reordered.map(id) }, 'PUT', Number(selected.version));
      } else {
        await travel.mutate('community', `/collections/${id(selected)}/items/${id(item)}`, undefined, 'DELETE', Number(selected.version));
      }
      await loadCollectionItems(selected);
    } catch (error) { showToast((error as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  async function findPlaces() {
    if (!provinceId) return;
    const revision = ++searchRevision.current;
    setSearching(true); setSearched(false); setPlaces([]); setPlaceId(''); setNote('');
    try {
      const data = await travel.readAll('catalog', `/places?geographicUnitId=${encodeURIComponent(provinceId)}`);
      if (revision !== searchRevision.current) return;
      setPlaces(data.items); setSearched(true);
    } catch (error) {
      if (revision === searchRevision.current) showToast((error as Error).message, 'error');
    } finally { if (revision === searchRevision.current) setSearching(false); }
  }

  async function openItem(item: Resource) {
    if (!selected) return;
    try { setEditingItem(await travel.read('community', `/collections/${id(selected)}/items/${id(item)}`)); }
    catch (error) { showToast((error as Error).message, 'error'); }
  }

  async function editItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !editingItem) return;
    const note = new FormData(event.currentTarget).get('note');
    setLoading(true);
    try {
      await travel.mutate('community', `/collections/${id(selected)}/items/${id(editingItem)}`, { note }, 'PATCH', Number(selected.version));
      setEditingItem(null); await loadCollectionItems(selected);
    } catch (error) { showToast((error as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  async function openPublic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const collectionId = String(new FormData(event.currentTarget).get('collection_id')).trim();
    setLoading(true); setPublicCollection(null); setPublicItems([]);
    try {
      const collection = await travel.read('community', `/collections/${encodeURIComponent(collectionId)}`);
      const list = await travel.readAll('community', `/collections/${encodeURIComponent(collectionId)}/items`);
      setPublicCollection(collection); setPublicItems(list.items);
    } catch (error) { showToast((error as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="collections-layout" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {error && <ErrorState message={error} onRetry={() => selected ? void loadCollectionItems(selected) : void loadCollections()} />}
      <section className="travel-panel"><h2>Xem bộ sưu tập được chia sẻ</h2><form onSubmit={openPublic}><label>Mã bộ sưu tập<input name="collection_id" required /></label><Button type="submit" disabled={loading || busy}>Mở bộ sưu tập chia sẻ</Button></form>{publicCollection && <div><h3>{String(publicCollection.name)}</h3>{publicItems.map(item => <p key={id(item)}>{placeNames[String(item.place_id)] ?? 'Đang tải tên địa điểm…'} · {String(item.note)}</p>)}</div>}</section>
      {/* Create Collection Card */}
      <section className="travel-panel" aria-label="Tạo bộ sưu tập mới">
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '14px' }}>
          Tạo bộ sưu tập mới
        </h2>
        <form onSubmit={handleCreateCollection} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '12px', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="collection-name-input">Tên bộ sưu tập</label>
            <input
              id="collection-name-input"
              type="text"
              required
              placeholder="Ví dụ: Kỳ nghỉ hè Đà Nẵng, Quán cà phê đẹp Hà Nội..."
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="collection-visibility-select">Chế độ hiển thị</label>
            <select
              id="collection-visibility-select"
              value={visibility}
              onChange={e => setVisibility(e.target.value as 'PUBLIC' | 'PRIVATE')}
            >
              <option value="PRIVATE">Riêng tư</option>
              <option value="PUBLIC">Công khai</option>
            </select>
          </div>

          <Button type="submit" disabled={loading || busy} icon="plus">
            Tạo bộ sưu tập
          </Button>
        </form>
      </section>

      {/* Selected Collection Detail View */}
      {selected ? (
        <section className="travel-panel" aria-label="Chi tiết bộ sưu tập" style={{ animation: 'fadeIn 200ms ease' }}>
          <div className="collection-detail-header">
            <div>
              <div className="collection-title-row">
                <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>{String(selected.name)}</h2>
                <Badge variant={selected.visibility === 'PUBLIC' ? 'success' : 'neutral'}>
                  {selected.visibility === 'PUBLIC' ? 'Công khai' : 'Riêng tư'}
                </Badge>
              </div>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                {items.length} địa điểm trong bộ sưu tập
              </p>
            </div>
            <button type="button" className="btn-secondary" onClick={() => setSelected(null)}>
              Đóng chi tiết
            </button>
          </div>

          <form key={id(selected)} onSubmit={updateCollection} className="form-grid">
            <label>Tên mới<input name="name" defaultValue={String(selected.name)} required /></label>
            <label>Chế độ hiển thị<select name="visibility" defaultValue={String(selected.visibility)}><option value="PRIVATE">Riêng tư</option><option value="PUBLIC">Công khai</option></select></label>
            <Button type="submit" disabled={loading || busy}>Lưu bộ sưu tập</Button>
          </form>
          <form onSubmit={event => { event.preventDefault(); void findPlaces(); }}>
            <label>Tỉnh/thành cho bộ sưu tập
              <select value={provinceId} disabled={loading || busy || searching} onChange={event => { resetPlaceSearch(); setProvinceId(event.target.value); }} required>
                <option value="">Chọn tỉnh/thành</option>
                {provinces.map(province => <option key={String(province.geographic_unit_id ?? province.id)} value={String(province.geographic_unit_id ?? province.id)}>{String(province.name_vi ?? province.name)}</option>)}
              </select>
            </label>
            <Button type="submit" disabled={loading || busy || searching || !provinceId}>{searching ? 'Đang tìm địa điểm…' : 'Tìm địa điểm'}</Button>
          </form>
          <p role="status">{searching ? 'Đang tải địa điểm trong tỉnh/thành đã chọn…' : searched ? places.length > 0 ? `Tìm thấy ${places.length} địa điểm trong tỉnh/thành đã chọn.` : 'Chưa có địa điểm trong tỉnh/thành này. Vui lòng chọn tỉnh/thành khác.' : provinceId ? 'Bấm “Tìm địa điểm” để xem các địa điểm trong tỉnh/thành đã chọn.' : 'Vui lòng chọn tỉnh/thành trước khi chọn địa điểm.'}</p>
          <form onSubmit={addPlace} className="form-grid">
            <label>Địa điểm<select value={placeId} disabled={loading || busy || searching || !provinceId || !searched || !places.length} onChange={event => { setPlaceId(event.target.value); setNote(''); }} required><option value="">{!provinceId ? 'Chọn tỉnh/thành trước' : 'Chọn địa điểm'}</option>{places.map(place => <option key={String(place.id ?? place.place_id)} value={String(place.id ?? place.place_id)}>{String(place.name)}</option>)}</select></label>
            <label>Ghi chú<input value={note} disabled={loading || busy || searching || !placeId} onChange={event => setNote(event.target.value)} /></label>
            <Button type="submit" disabled={loading || busy || searching || !searched || !placeId}>Thêm địa điểm vào bộ sưu tập</Button>
          </form>
          {editingItem && <form key={id(editingItem)} onSubmit={editItem}><label>Sửa ghi chú địa điểm<input name="note" defaultValue={String(editingItem.note)} required /></label><Button type="submit" disabled={loading || busy}>Lưu ghi chú địa điểm</Button><button type="button" onClick={() => setEditingItem(null)}>Hủy sửa ghi chú</button></form>}
          {items.length > 0 ? (
            <div className="travel-grid collection-items">
              {items.map((item, idx) => (
                <article className="collection-item" key={id(item)}>
                  <h4>{placeNames[String(item.place_id)] ?? 'Đang tải tên địa điểm…'}</h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{String(item.note ?? '')}</p>
                  <div className="collection-item-actions">
                    <Button variant="secondary" size="sm" type="button" disabled={loading || busy} onClick={() => void openItem(item)}>Sửa ghi chú địa điểm</Button>
                    <Button variant="subtle" size="sm" type="button" disabled={loading || busy} onClick={() => void changeItem(item, idx)}>Xóa khỏi bộ sưu tập</Button>
                    <div className="collection-item-order"><Button variant="secondary" size="sm" type="button" disabled={loading || busy || idx === 0} onClick={() => void changeItem(item, idx, -1)}>Lên</Button><Button variant="secondary" size="sm" type="button" disabled={loading || busy || idx === items.length - 1} onClick={() => void changeItem(item, idx, 1)}>Xuống</Button></div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-subtle">
              <Icon name="layers" size={32} />
              <p>Chưa có địa điểm nào trong bộ sưu tập này. Hãy khám phá và thêm vào!</p>
            </div>
          )}
        </section>
      ) : null}

      {/* Collection Grid */}
      <div className="travel-grid">
        {collections.map((col, idx) => {
          const colId = String(col.id ?? idx);
          const colName = String(col.name ?? 'Bộ sưu tập');
          return (
            <article
              key={colId}
              className="travel-card collection-card"
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ width: 40, height: 40, borderRadius: 'var(--radius-button)', background: 'var(--color-primary-light)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="layers" size={22} />
                </span>
                <Badge variant={col.visibility === 'PUBLIC' ? 'success' : 'neutral'}>
                  {col.visibility === 'PUBLIC' ? 'Công khai' : 'Riêng tư'}
                </Badge>
              </div>

              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '4px 0' }}>
                  {colName}
                </h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  {String(col.description ?? 'Bộ sưu tập những địa điểm yêu thích của bạn.')}
                </p>
              </div>

              <div className="card-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void loadCollectionItems(col)}
                >
                  Xem chi tiết
                </button>
                <button type="button" disabled={loading || busy} onClick={() => void deleteCollection(col)}>Xóa bộ sưu tập</button>
              </div>
            </article>
          );
        })}
      </div>

      {!loading && collections.length === 0 && (
        <div className="empty-subtle">
          <Icon name="layers" size={40} />
          <p>Bạn chưa tạo bộ sưu tập nào. Nhập tên và bấm "Tạo bộ sưu tập" ở trên để bắt đầu!</p>
        </div>
      )}
    </div>
  );
}
