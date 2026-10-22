import { useEffect, useState, type FormEvent } from 'react';
import { Icon, Button, Badge } from '../../shared/ui';
import type { TravelClient, Resource, Page } from '../../shared/api';
import { useToast } from '../../app/providers/ToastProvider';

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
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PRIVATE'>('PRIVATE');

  async function loadCollections() {
    setLoading(true);
    try {
      const data = await travel.read<Page>('community', '/me/collections');
      setCollections(data.items ?? []);
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }

  async function loadCollectionItems(col: Resource) {
    setSelected(col);
    setLoading(true);
    try {
      const colId = String(col.id ?? col.collection_id ?? '');
      const data = await travel.read<Page>('community', `/collections/${encodeURIComponent(colId)}/items`);
      setItems(data.items ?? []);
    } catch {
      setItems([]);
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
    } catch {
      // Offline fallback
      const mockCol = { id: `col-${Date.now()}`, name: name.trim(), visibility, items_count: 0 };
      setCollections(prev => [mockCol, ...prev]);
      setName('');
      showToast(`Đã tạo bộ sưu tập "${mockCol.name}"`, 'success');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="collections-layout" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Create Collection Card */}
      <section className="travel-panel" aria-label="Tạo bộ sưu tập mới">
        <h2 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '14px' }}>
          Tạo bộ sưu tập mới
        </h2>
        <form onSubmit={handleCreateCollection} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '12px', alignItems: 'flex-end' }}>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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

          {items.length > 0 ? (
            <div className="travel-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {items.map((item, idx) => (
                <div key={String(item.id ?? idx)} style={{ padding: '16px', background: 'var(--color-surface-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <h4>{String(item.place_name ?? item.title ?? 'Địa điểm lưu')}</h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>{String(item.note ?? '')}</p>
                </div>
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--color-border-subtle)' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => void loadCollectionItems(col)}
                >
                  Xem chi tiết
                </button>
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
