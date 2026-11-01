import { useEffect, useState, type FormEvent } from 'react';
import type { Page, Resource, TravelClient } from '../../shared/api';
import { ErrorState } from '../../shared/ui';

export function AdminUsersPanel({ travel }: { travel: TravelClient }) {
  const [users, setUsers] = useState<Resource[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Không cập nhật được người dùng.'); }
    finally { setBusy(false); }
  }
  async function load(next?: string) {
    const page = await travel.read<Page>('identity', `/admin/users${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
    setUsers(old => next ? [...old, ...page.items] : page.items); setCursor(page.next_cursor ?? null);
  }
  useEffect(() => { void run(() => load()); }, [travel]);
  function saveRoles(event: FormEvent<HTMLFormElement>, user: Resource) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    void run(async () => {
      const updated = await travel.mutate('identity', `/admin/users/${encodeURIComponent(String(user.user_id))}/roles`, { roles: data.getAll('roles') }, 'PUT', Number(user.version));
      setUsers(old => old.map(row => row.user_id === user.user_id ? updated : row)); setMessage('Đã cập nhật vai trò.');
    });
  }
  return <section className="travel-panel" aria-label="Quản lý người dùng" style={{ padding: 24, marginTop: 24 }}>
    <h2>Người dùng và quyền truy cập</h2><button className="btn-secondary" disabled={busy} onClick={() => void run(() => load())}>Tải lại người dùng</button>
    {error && <ErrorState message={error} onRetry={() => void run(() => load())} />}{message && <p role="status">{message}</p>}{busy && <p role="status">Đang xử lý người dùng...</p>}
    {users.map(user => <article className="travel-panel" style={{ padding: 16 }} key={`${user.user_id}:${user.version}`}><h3>{String(user.display_name)}</h3><p>{String(user.status)}</p>
      {user.status !== 'DELETED' && <><form onSubmit={e => saveRoles(e, user)}><fieldset><legend>Vai trò của {String(user.display_name)}</legend>{['USER', 'BUSINESS', 'ADMIN'].map(role => <label key={role}><input name="roles" type="checkbox" value={role} defaultChecked={(user.roles as string[]).includes(role)} />{role}</label>)}</fieldset><button className="btn-primary" disabled={busy}>Lưu vai trò</button></form>
      <button className="btn-secondary" disabled={busy} onClick={() => { if (window.confirm(`${user.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'} tài khoản ${String(user.display_name)}?`)) void run(async () => {
        const updated = await travel.mutate('identity', `/admin/users/${encodeURIComponent(String(user.user_id))}/status`, { status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE' }, 'PATCH', Number(user.version));
        setUsers(old => old.map(row => row.user_id === user.user_id ? updated : row)); setMessage('Đã cập nhật trạng thái tài khoản.');
      }); }}>{user.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở khóa tài khoản'}</button></>}
    </article>)}
    {cursor && <button className="btn-secondary" disabled={busy} onClick={() => void run(() => load(cursor))}>Xem thêm người dùng</button>}
  </section>;
}
