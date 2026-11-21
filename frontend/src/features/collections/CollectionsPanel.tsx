import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Icon, Button, ErrorState, RoundedSelect } from '../../shared/ui';
import type { TravelClient, Resource } from '../../shared/api';
import { useToast } from '../../app/providers/ToastProvider';
import '../trips/integration-layout.css';
import './collections.css';

export interface CollectionsPanelProps {
  travel: TravelClient;
  busy?: boolean;
}

const COVER_IMAGES = [
  '/images/editorial/da-nang.webp',
  '/images/editorial/ninh-binh.webp',
  '/images/editorial/ho-chi-minh.webp',
  '/images/editorial/da-lat.webp',
  '/images/editorial/marble-mountains.webp',
  '/images/editorial/ha-long.webp',
];

function formatIndex(index: number): string {
  const n = index + 1;
  return n < 10 ? `0${n}` : `${n}`;
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
  const [visibilityFilter, setVisibilityFilter] = useState<'ALL' | 'PUBLIC' | 'PRIVATE'>('ALL');
  const detailRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let active = true;
    const ids = [...new Set([...items, ...publicItems].map(item => String(item.place_id)))];
    if (ids.length === 0) return () => { active = false; };
    void Promise.allSettled(ids.map(async pid => [pid, String((await travel.place(pid)).name)] as const))
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
    } catch (err) {
      setError((err as Error).message);
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
      window.setTimeout(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    } catch (err) {
      setError((err as Error).message);
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
        visibility,
      });
      setCollections(prev => [newCol, ...prev]);
      setName('');
      showToast(`Đã tạo bộ sưu tập "${name.trim()}"`, 'success');
    } catch (err) {
      showToast((err as Error).message || 'Không thể tạo bộ sưu tập.', 'error');
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
    } catch (err) { showToast((err as Error).message, 'error'); }
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
    } catch (err) { showToast((err as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  async function deleteCollection(col: Resource) {
    setLoading(true);
    try {
      await travel.mutate('community', `/me/collections/${id(col)}`, undefined, 'DELETE', Number(col.version));
      if (selected && id(selected) === id(col)) setSelected(null);
      await loadCollections();
      showToast('Đã xóa bộ sưu tập.', 'success');
    } catch (err) { showToast((err as Error).message, 'error'); }
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
    } catch (err) { showToast((err as Error).message, 'error'); }
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
    } catch (err) {
      if (revision === searchRevision.current) showToast((err as Error).message, 'error');
    } finally { if (revision === searchRevision.current) setSearching(false); }
  }

  async function openItem(item: Resource) {
    if (!selected) return;
    try { setEditingItem(await travel.read('community', `/collections/${id(selected)}/items/${id(item)}`)); }
    catch (err) { showToast((err as Error).message, 'error'); }
  }

  async function editItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || !editingItem) return;
    const nextNote = new FormData(event.currentTarget).get('note');
    setLoading(true);
    try {
      await travel.mutate('community', `/collections/${id(selected)}/items/${id(editingItem)}`, { note: nextNote }, 'PATCH', Number(selected.version));
      setEditingItem(null); await loadCollectionItems(selected);
    } catch (err) { showToast((err as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  async function openPublic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const collectionId = String(new FormData(event.currentTarget).get('collection_id')).trim();
    if (!collectionId) return;
    setLoading(true); setPublicCollection(null); setPublicItems([]);
    try {
      const collection = await travel.read('community', `/collections/${encodeURIComponent(collectionId)}`);
      const list = await travel.readAll('community', `/collections/${encodeURIComponent(collectionId)}/items`);
      setPublicCollection(collection); setPublicItems(list.items);
    } catch (err) { showToast((err as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  const publicCount = useMemo(
    () => collections.filter(c => c.visibility === 'PUBLIC').length,
    [collections],
  );
  const privateCount = collections.length - publicCount;

  const displayedCollections = useMemo(() => {
    if (visibilityFilter === 'ALL') return collections;
    return collections.filter(c => c.visibility === visibilityFilter);
  }, [collections, visibilityFilter]);

  return (
    <div className="col-editorial-root collections-layout">
      {/* ── Band 1: Asymmetric Editorial Archive Hero ── */}
      <section className="col-hero" aria-labelledby="col-hero-heading">
        <div className="col-wrap col-hero-grid">
          <div className="col-hero-copy">
            <span className="col-eyebrow">LƯU TRỮ HÀNH TRÌNH · SMARTTRAVEL</span>
            <h1 id="col-hero-heading" className="col-hero-title" aria-label="Bộ sưu tập">
              Những cuốn sổ tay lưu giữ nơi bạn muốn đến.
            </h1>
            <p className="col-hero-lead">
              Gom những điểm dừng chân yêu thích thành từng bộ sưu tập riêng tư hoặc chia sẻ công khai với bạn đồng hành.
            </p>

            <dl className="col-hero-stats">
              <div className="col-stat">
                <dt>Tổng bộ sưu tập</dt>
                <dd>{collections.length}</dd>
              </div>
              <div className="col-stat">
                <dt>Công khai</dt>
                <dd>{publicCount}</dd>
              </div>
              <div className="col-stat">
                <dt>Riêng tư</dt>
                <dd>{privateCount}</dd>
              </div>
            </dl>

            {/* Integrated Create Collection Studio */}
            <section className="col-create-studio" aria-label="Tạo bộ sưu tập mới">
              <div className="col-studio-head">
                <h2>Tạo bộ sưu tập mới</h2>
                <span>Khởi tạo sổ tay mới chỉ với một dòng tên</span>
              </div>
              <form className="col-create-form" onSubmit={handleCreateCollection}>
                <div className="col-field">
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

                <div className="col-field col-field-vis">
                  <label htmlFor="collection-visibility-select">Chế độ hiển thị</label>
                  <RoundedSelect
                    id="collection-visibility-select"
                    label="Chế độ hiển thị"
                    value={visibility}
                    onChange={val => setVisibility(val as 'PUBLIC' | 'PRIVATE')}
                    options={[
                      { value: 'PRIVATE', label: 'Riêng tư' },
                      { value: 'PUBLIC', label: 'Công khai' },
                    ]}
                  />
                </div>

                <Button type="submit" disabled={loading || busy} icon="plus" className="col-create-submit">
                  Tạo bộ sưu tập
                </Button>
              </form>
            </section>
          </div>

          <div className="col-hero-visual">
            <div className="col-hero-frame">
              <img
                src="/images/editorial/hue.webp"
                alt="Cổng kiến trúc cổ cố đô Huế trong ánh sương sớm"
                width={1200}
                height={900}
                fetchPriority="high"
                loading="eager"
                decoding="async"
                className="col-hero-photo"
              />
            </div>

            {/* Integrated Shared Collection Lookup */}
            <section className="col-shared-bar" aria-label="Xem bộ sưu tập được chia sẻ">
              <div className="col-shared-head">
                <Icon name="share" size={15} />
                <h2>Xem bộ sưu tập được chia sẻ</h2>
              </div>
              <form className="col-shared-form" onSubmit={openPublic}>
                <label className="col-shared-field">
                  <span>Mã bộ sưu tập</span>
                  <input name="collection_id" required placeholder="Nhập mã bộ sưu tập công khai..." />
                </label>
                <Button type="submit" disabled={loading || busy} className="col-shared-submit">
                  Mở bộ sưu tập chia sẻ
                </Button>
              </form>

              {publicCollection && (
                <div className="col-shared-preview">
                  <div className="col-shared-preview-head">
                    <h3>{String(publicCollection.name)}</h3>
                    <span className="col-vis-tag is-public">Công khai</span>
                  </div>
                  {publicItems.length > 0 ? (
                    <ul className="col-shared-list">
                      {publicItems.map((item, idx) => (
                        <li key={id(item)}>
                          <span className="col-shared-idx">{formatIndex(idx)}</span>
                          <p>{placeNames[String(item.place_id)] ?? 'Đang tải tên địa điểm…'} · {String(item.note)}</p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="col-muted-line">Bộ sưu tập chia sẻ này hiện chưa có địa điểm nào.</p>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      </section>

      {/* ── Error Banner (if unauthorized / network error) ── */}
      {error && (
        <div className="col-wrap col-error-wrap">
          <ErrorState
            message={error}
            onRetry={() => selected ? void loadCollectionItems(selected) : void loadCollections()}
          />
        </div>
      )}

      {/* ── Band 2: Selected Collection Editorial Dossier ── */}
      {selected && (
        <section
          ref={detailRef}
          className="col-detail-band"
          aria-label="Chi tiết bộ sưu tập"
        >
          <div className="col-wrap">
            <div className="col-detail-sheet">
              <header className="col-detail-masthead">
                <div className="col-detail-heading">
                  <span className="col-eyebrow">HỒ SƠ BỘ SƯU TẬP</span>
                  <div className="col-detail-title-row">
                    <h2>{String(selected.name)}</h2>
                    <span className={`col-vis-tag ${selected.visibility === 'PUBLIC' ? 'is-public' : 'is-private'}`}>
                      {selected.visibility === 'PUBLIC' ? 'Công khai' : 'Riêng tư'}
                    </span>
                  </div>
                  <p className="col-detail-count">{items.length} địa điểm trong bộ sưu tập</p>
                </div>

                <button
                  type="button"
                  className="col-btn-secondary"
                  onClick={() => setSelected(null)}
                >
                  Đóng chi tiết
                </button>
              </header>

              <div className="col-detail-grid">
                {/* Left: Curated Place List */}
                <div className="col-detail-items-col">
                  <div className="col-subhead">
                    <h3>Danh sách điểm đến</h3>
                    <span>Sắp xếp thứ tự ưu tiên cho hành trình</span>
                  </div>

                  {editingItem && (
                    <form key={id(editingItem)} className="col-edit-note-form" onSubmit={editItem}>
                      <label className="col-field">
                        <span>Sửa ghi chú địa điểm</span>
                        <input name="note" defaultValue={String(editingItem.note)} required />
                      </label>
                      <div className="col-edit-note-actions">
                        <Button type="submit" disabled={loading || busy}>Lưu ghi chú địa điểm</Button>
                        <button
                          type="button"
                          className="col-btn-secondary"
                          onClick={() => setEditingItem(null)}
                        >
                          Hủy sửa ghi chú
                        </button>
                      </div>
                    </form>
                  )}

                  {items.length > 0 ? (
                    <div className="collection-items col-items-list">
                      {items.map((item, idx) => (
                        <article className="collection-item col-item-row" key={id(item)}>
                          <div className="col-item-num">{formatIndex(idx)}</div>
                          <div className="col-item-body">
                            <h4>{placeNames[String(item.place_id)] ?? 'Đang tải tên địa điểm…'}</h4>
                            <p className="col-item-note">{String(item.note ?? '')}</p>
                            <div className="collection-item-actions col-item-actions">
                              <Button
                                variant="secondary"
                                size="sm"
                                type="button"
                                disabled={loading || busy}
                                onClick={() => void openItem(item)}
                              >
                                Sửa ghi chú địa điểm
                              </Button>
                              <Button
                                variant="subtle"
                                size="sm"
                                type="button"
                                disabled={loading || busy}
                                onClick={() => void changeItem(item, idx)}
                              >
                                Xóa khỏi bộ sưu tập
                              </Button>
                              <div className="collection-item-order col-item-order">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  type="button"
                                  disabled={loading || busy || idx === 0}
                                  onClick={() => void changeItem(item, idx, -1)}
                                >
                                  Lên
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  type="button"
                                  disabled={loading || busy || idx === items.length - 1}
                                  onClick={() => void changeItem(item, idx, 1)}
                                >
                                  Xuống
                                </Button>
                              </div>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="col-empty-box">
                      <Icon name="layers" size={28} />
                      <p>Chưa có địa điểm nào trong bộ sưu tập này. Hãy khám phá và thêm vào!</p>
                    </div>
                  )}
                </div>

                {/* Right: Curator Workbench (Add Place + Settings) */}
                <aside className="col-detail-workbench">
                  <div className="col-workbench-block">
                    <div className="col-subhead">
                      <h3>Thêm địa điểm vào sổ tay</h3>
                      <span>Chọn tỉnh/thành trước, sau đó chọn địa điểm</span>
                    </div>

                    <form
                      className="col-workbench-form"
                      onSubmit={event => { event.preventDefault(); void findPlaces(); }}
                    >
                      <div className="col-field">
                        <label htmlFor="collection-province-select">Tỉnh/thành cho bộ sưu tập</label>
                        <RoundedSelect
                          id="collection-province-select"
                          label="Tỉnh/thành cho bộ sưu tập"
                          value={provinceId}
                          disabled={loading || busy || searching}
                          onChange={val => { resetPlaceSearch(); setProvinceId(val); }}
                          required
                          placeholder="Chọn tỉnh/thành"
                          options={[
                            { value: '', label: 'Chọn tỉnh/thành' },
                            ...provinces.map(province => ({
                              value: String(province.geographic_unit_id ?? province.id),
                              label: String(province.name_vi ?? province.name),
                            })),
                          ]}
                        />
                      </div>
                      <Button type="submit" disabled={loading || busy || searching || !provinceId}>
                        {searching ? 'Đang tìm địa điểm…' : 'Tìm địa điểm'}
                      </Button>
                    </form>

                    <p role="status" className="col-status-note">
                      {searching
                        ? 'Đang tải địa điểm trong tỉnh/thành đã chọn…'
                        : searched
                          ? places.length > 0
                            ? `Tìm thấy ${places.length} địa điểm trong tỉnh/thành đã chọn.`
                            : 'Chưa có địa điểm trong tỉnh/thành này. Vui lòng chọn tỉnh/thành khác.'
                          : provinceId
                            ? 'Bấm “Tìm địa điểm” để xem các địa điểm trong tỉnh/thành đã chọn.'
                            : 'Vui lòng chọn tỉnh/thành trước khi chọn địa điểm.'}
                    </p>

                    <form onSubmit={addPlace} className="col-workbench-form">
                      <div className="col-field">
                        <label htmlFor="collection-place-select">Địa điểm</label>
                        <RoundedSelect
                          id="collection-place-select"
                          label="Địa điểm"
                          value={placeId}
                          disabled={loading || busy || searching || !provinceId || !searched || !places.length}
                          onChange={val => { setPlaceId(val); setNote(''); }}
                          required
                          placeholder={!provinceId ? 'Chọn tỉnh/thành trước' : 'Chọn địa điểm'}
                          options={[
                            { value: '', label: !provinceId ? 'Chọn tỉnh/thành trước' : 'Chọn địa điểm' },
                            ...places.map(place => ({
                              value: String(place.id ?? place.place_id),
                              label: String(place.name),
                            })),
                          ]}
                        />
                      </div>
                      <label className="col-field">
                        <span>Ghi chú</span>
                        <input
                          value={note}
                          disabled={loading || busy || searching || !placeId}
                          onChange={event => setNote(event.target.value)}
                          placeholder="Gợi ý: ghé lúc hoàng hôn, quán quen..."
                        />
                      </label>
                      <Button type="submit" disabled={loading || busy || searching || !searched || !placeId}>
                        Thêm địa điểm vào bộ sưu tập
                      </Button>
                    </form>
                  </div>

                  <div className="col-workbench-block">
                    <div className="col-subhead">
                      <h3>Cập nhật bộ sưu tập</h3>
                      <span>Đổi tên hoặc chế độ chia sẻ</span>
                    </div>

                    <form key={id(selected)} onSubmit={updateCollection} className="col-workbench-form">
                      <label className="col-field">
                        <span>Tên mới</span>
                        <input name="name" defaultValue={String(selected.name)} required />
                      </label>
                      <div className="col-field">
                        <label htmlFor="collection-edit-visibility">Chế độ hiển thị</label>
                        <RoundedSelect
                          id="collection-edit-visibility"
                          name="visibility"
                          label="Chế độ hiển thị"
                          defaultValue={String(selected.visibility)}
                          options={[
                            { value: 'PRIVATE', label: 'Riêng tư' },
                            { value: 'PUBLIC', label: 'Công khai' },
                          ]}
                        />
                      </div>
                      <Button type="submit" disabled={loading || busy}>Lưu bộ sưu tập</Button>
                    </form>
                  </div>
                </aside>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Band 3: Editorial Lookbook Gallery ── */}
      <section className="col-gallery-band" aria-labelledby="col-gallery-heading">
        <div className="col-wrap">
          <div className="col-gallery-head">
            <div>
              <span className="col-eyebrow">THƯ VIỆN CÁ NHÂN</span>
              <h2 id="col-gallery-heading" className="col-gallery-title">
                Bộ sưu tập của bạn
              </h2>
            </div>

            {collections.length > 0 && (
              <div className="col-filter-tabs" role="group" aria-label="Lọc theo chế độ hiển thị">
                {([
                  { value: 'ALL', label: `Tất cả (${collections.length})` },
                  { value: 'PUBLIC', label: `Công khai (${publicCount})` },
                  { value: 'PRIVATE', label: `Riêng tư (${privateCount})` },
                ] as const).map(tab => (
                  <button
                    key={tab.value}
                    type="button"
                    className={`col-filter-tab ${visibilityFilter === tab.value ? 'is-active' : ''}`}
                    onClick={() => setVisibilityFilter(tab.value)}
                    aria-pressed={visibilityFilter === tab.value}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {displayedCollections.length > 0 ? (
            <div className="col-folio-grid">
              {displayedCollections.map((col, idx) => {
                const colId = String(col.id ?? col.collection_id ?? idx);
                const colName = String(col.name ?? 'Bộ sưu tập');
                const isPublic = col.visibility === 'PUBLIC';
                const isSelected = Boolean(selected && id(selected) === id(col));
                const coverSrc = COVER_IMAGES[idx % COVER_IMAGES.length];

                return (
                  <article
                    key={colId}
                    className={`collection-card col-folio-card ${idx === 0 && displayedCollections.length >= 2 ? 'is-lead' : ''} ${isSelected ? 'is-selected' : ''}`}
                  >
                    <div
                      className="col-folio-media"
                      onClick={() => void loadCollectionItems(col)}
                      role="button"
                      tabIndex={0}
                      aria-label={`Mở bộ sưu tập ${colName}`}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          void loadCollectionItems(col);
                        }
                      }}
                    >
                      <img
                        src={coverSrc}
                        alt={colName}
                        width={640}
                        height={380}
                        loading="lazy"
                        decoding="async"
                        className="col-folio-img"
                      />
                      <span className="col-folio-num">{formatIndex(idx)}</span>
                      <span className={`col-vis-tag col-vis-overlay ${isPublic ? 'is-public' : 'is-private'}`}>
                        {isPublic ? 'Công khai' : 'Riêng tư'}
                      </span>
                    </div>

                    <div className="col-folio-body">
                      <h2 className="col-folio-title">{colName}</h2>
                      <p className="col-folio-desc">
                        {String(col.description ?? 'Bộ sưu tập những địa điểm yêu thích của bạn.')}
                      </p>

                      <div className="col-folio-actions">
                        <button
                          type="button"
                          className="col-btn-primary"
                          onClick={() => void loadCollectionItems(col)}
                        >
                          <span>Xem chi tiết</span>
                          <Icon name="arrow" size={14} />
                        </button>
                        <button
                          type="button"
                          className="col-btn-danger-ghost"
                          disabled={loading || busy}
                          onClick={() => void deleteCollection(col)}
                        >
                          Xóa bộ sưu tập
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : !loading && collections.length === 0 ? (
            <div className="col-empty-box col-empty-large">
              <Icon name="layers" size={32} />
              <p>Bạn chưa tạo bộ sưu tập nào. Nhập tên và bấm "Tạo bộ sưu tập" ở trên để bắt đầu!</p>
            </div>
          ) : !loading ? (
            <div className="col-empty-box">
              <Icon name="layers" size={28} />
              <p>Không có bộ sưu tập nào thuộc chế độ hiển thị này.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
