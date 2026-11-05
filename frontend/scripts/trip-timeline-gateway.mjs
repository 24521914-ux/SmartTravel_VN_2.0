import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { loadP02Secrets } from './p02-secrets.mjs';

// Real Gateway regression. Deletes only the uniquely named trip created here.
const base = process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173';
let token, tripId, version;
let passed = 0;
async function request(service, path, method = 'GET', body, expected = 200, extra = {}) {
  if (tripId && service === 'trip' && method !== 'GET' && !extra['If-Match']) await request('trip', `/trips/${tripId}`);
  const response = await fetch(`${base}/api/${service}/api/v1${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(version ? { 'If-Match': `"${version}"` } : {}), ...extra }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json();
  assert.equal(response.status, expected, `${method} ${path.replace(/[a-f0-9-]{36}/g, '{id}')}: ${data?.code ?? response.status}`);
  if (data?.version && expected < 300) version = data.version;
  return data;
}
const check = label => { passed++; console.log(`PASS ${label}`); };
const trip = suffix => `/trips/${tripId}${suffix}`;
async function legs(day) { return (await request('trip', trip(`/days/${day}/travel-legs`))).items; }
async function settledLegs(day) {
  const deadline = Date.now() + 25000;
  let result;
  do {
    result = await legs(day);
    if (result.every(row => row.status !== 'PENDING')) return result;
    await new Promise(resolve => setTimeout(resolve, 300));
  } while (Date.now() < deadline);
  assert.fail('Durable route worker did not settle pending legs within 25 seconds');
}
try {
  token = (await request('identity', '/auth/login', 'POST', { email: 'fixture-u1@example.invalid', password: loadP02Secrets().IDENTITY_FIXTURE_PASSWORD })).access_token;
  const places = (await request('catalog', '/places?limit=20')).items;
  assert.ok(places.length >= 4, 'Four canonical Catalog fixtures required');
  const created = await request('trip', '/me/trips', 'POST', { name: `timeline-gateway-${randomUUID()}`, start_date: '2026-12-01', end_date: '2026-12-04', budget: 2000000, currency: 'VND', timezone: 'Asia/Ho_Chi_Minh' }, 201);
  tripId = created.trip_id;
  await request('trip', trip(''), 'PATCH', { name: `${created.name}-edited`, budget: 1800000 });
  const day = (await request('trip', trip('/days'), 'POST', { date: '2026-12-01' }, 201)).day_id;
  const secondDay = (await request('trip', trip('/days'), 'POST', { date: '2026-12-02' }, 201)).day_id;
  await request('trip', trip(`/days/${secondDay}`), 'PATCH', { date: '2026-12-03' });
  await request('trip', trip(`/days/${secondDay}`), 'DELETE', undefined, 204);
  check('trip create/edit and independent day CRUD');
  const itemsPath = trip(`/days/${day}/items`), items = [], addRequests = [];
  for (const place of places.slice(0, 4)) {
    const body = { place_id: place.place_id ?? place.id, duration_minutes: 120, note: 'Synthetic itinerary visit', locked: false, recommendation_request_id: null };
    const key = randomUUID(); addRequests.push({ body, key });
    items.push(await request('trip', itemsPath, 'POST', body, 201, { 'Idempotency-Key': key }));
  }
  const replay = await request('trip', itemsPath, 'POST', addRequests[0].body, 201, { 'Idempotency-Key': addRequests[0].key });
  assert.equal(replay.item_id, items[0].item_id);
  assert.equal((await request('trip', itemsPath)).items.length, 4, 'Retry must not duplicate a saved place');
  let routes = await settledLegs(day);
  assert.equal(routes.length, 3);
  assert.deepEqual(routes.map(r => [r.from_item_id, r.to_item_id]), items.slice(0, -1).map((item, index) => [item.item_id, items[index + 1].item_id]));
  for (const route of routes) {
    if (route.status === 'FALLBACK') { assert.equal(route.duration_seconds, null); assert.equal(route.fallback, true); }
    if (route.status === 'READY') assert.ok(route.distance_m >= 0 && route.duration_seconds >= 0);
  }
  check('four canonical places produce exactly three ordered adjacency legs; route/fallback data truthful');
  const destinations = (await request('catalog', '/destinations?limit=20')).items;
  assert.ok(destinations.length >= 2, 'Two actual Catalog destinations required for UC14 regression');
  for (let index = 0; index < 2; index++) {
    await request('trip', trip('/destinations'), 'POST', { destination_id: destinations[index].destination_id ?? destinations[index].id,
      start_date: `2026-12-0${index + 1}`, end_date: `2026-12-0${index + 1}` }, 201);
  }
  const onwardDay = (await request('trip', trip('/days'), 'POST', { date: '2026-12-02' }, 201)).day_id;
  const onwardItem = await request('trip', trip(`/days/${onwardDay}/items`), 'POST', addRequests[0].body, 201, { 'Idempotency-Key': randomUUID() });
  assert.equal((await legs(onwardDay)).length, 0, 'One-place day has no automatic travel leg');
  const legacy = await request('trip', trip('/transfers'), 'POST', { from_item_id: items[3].item_id, to_item_id: onwardItem.item_id, mode: 'DRIVE' }, 201);
  const preserved = routes[0];
  await request('trip', trip(`/days/${day}/travel-legs/${preserved.leg_id}`), 'PATCH', { mode: 'WALK' });
  await request('trip', `${itemsPath}/order`, 'PUT', { item_ids: [items[0].item_id, items[1].item_id, items[3].item_id, items[2].item_id] });
  routes = await legs(day);
  assert.equal(routes.find(r => r.leg_id === preserved.leg_id)?.mode, 'WALK');
  assert.equal(routes.length, 3);
  assert.ok(!routes.some(r => r.from_item_id === items[1].item_id && r.to_item_id === items[2].item_id));
  const retainedIntercity = await request('trip', trip(`/transfers/${legacy.transfer_id}`));
  for (const field of ['transfer_id', 'mode', 'from_item_id', 'to_item_id']) assert.equal(retainedIntercity[field], legacy[field]);
  assert.equal((await request('trip', trip('/destinations'))).items.length, 2);
  check('reorder removes obsolete adjacency, retains unchanged leg identity/mode and separate cross-day UC14 transfer/destinations');
  const self = routes[1];
  const selfManaged = await request('trip', trip(`/days/${day}/travel-legs/${self.leg_id}`), 'PATCH', { mode: 'SELF_MANAGED' });
  assert.equal(selfManaged.status, 'SELF_MANAGED'); assert.equal(selfManaged.duration_seconds, null);
  const snapshot = items[0].snapshot;
  const edited = await request('trip', `${itemsPath}/${items[0].item_id}`, 'PATCH', { duration_minutes: 75, note: 'Persisted note' });
  assert.equal(edited.duration_minutes, 75); assert.equal(edited.note, 'Persisted note'); assert.deepEqual(edited.snapshot, snapshot);
  await request('trip', `${itemsPath}/${items[0].item_id}`, 'PATCH', { locked: true });
  await request('trip', `${itemsPath}/${items[0].item_id}`, 'DELETE', undefined, 422);
  await request('trip', `${itemsPath}/order`, 'PUT', { item_ids: [items[1].item_id, items[0].item_id, items[3].item_id, items[2].item_id] }, 422);
  await request('trip', `${itemsPath}/${items[0].item_id}`, 'PATCH', { locked: false });
  const stale = version;
  await request('trip', `${itemsPath}/${items[0].item_id}`, 'PATCH', { note: 'Fresh revision' });
  await request('trip', `${itemsPath}/${items[0].item_id}`, 'PATCH', { note: 'Must never overwrite' }, 409, { 'If-Match': `"${stale}"` });
  assert.equal((await request('trip', `${itemsPath}/${items[0].item_id}`)).note, 'Fresh revision');
  check('self-managed, notes/duration, immutable snapshot, lock protection and real optimistic conflict');
  await request('trip', trip(`/transfers/${legacy.transfer_id}`), 'DELETE', undefined, 204);
  await request('trip', trip(`/days/${onwardDay}`), 'DELETE', undefined, 204);
  await request('trip', `${itemsPath}/${items[3].item_id}`, 'DELETE', undefined, 204);
  routes = await legs(day); assert.equal(routes.length, 2);
  assert.deepEqual(routes.map(r => [r.from_item_id, r.to_item_id]), [[items[0].item_id, items[1].item_id], [items[1].item_id, items[2].item_id]]);
  await request('trip', trip(`/days/${day}`), 'DELETE', undefined, 204);
  assert.equal((await request('trip', trip('/days'))).items.length, 0);
  check('item deletion reconnects neighbors; deleting day leaves no orphan day state');
} finally {
  if (tripId) { await request('trip', trip('')); await request('trip', trip(''), 'DELETE', undefined, 204); }
}
console.log(`Trip timeline Gateway: ${passed} checks passed, 0 failures; real Gateway/Catalog/PostgreSQL, synthetic fixture cleanup complete`);
