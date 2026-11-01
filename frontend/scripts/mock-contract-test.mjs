import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const directory = mkdtempSync(resolve(tmpdir(), 'smarttravel-api-tests-'));
after(() => rmSync(directory, { recursive: true, force: true }));
writeFileSync(resolve(directory, 'package.json'), '{"type":"module"}');
for (const name of ['auth', 'client', 'types', 'identity', 'travel']) {
  const input = readFileSync(resolve(root, `src/api/${name}.ts`), 'utf8');
  const output = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  writeFileSync(resolve(directory, `${name}.js`), output.replace(/from '(.\/\w+)'/g, "from '$1.js'"));
}
const { ApiClient } = await import(pathToFileURL(resolve(directory, 'client.js')));
const { IdentityClient } = await import(pathToFileURL(resolve(directory, 'identity.js')));
const { TravelClient } = await import(pathToFileURL(resolve(directory, 'travel.js')));
const { memoryTokenStore } = await import(pathToFileURL(resolve(directory, 'auth.js')));
const pair = (suffix = 'old') => ({ access_token: `access-${suffix}`, refresh_token: `refresh-${suffix}`, token_type: 'Bearer', expires_in: 600 });
const response = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('multipart media upload preserves bearer and lets fetch set the boundary', async () => {
  let sent;
  const tokens = memoryTokenStore(); tokens.set(pair());
  const api = new ApiClient({ tokenStore: tokens, fetchImpl: async (url, options) => { sent = { url, options }; return response({ media_id: 'fixture', moderation_status: 'PENDING' }); } });
  const form = new FormData(); form.set('file', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'photo.png');
  const result = await api.request('catalog', '/api/v1/media', { multipart: form, idempotencyKey: 'media-upload' });
  assert.equal(sent.url, '/api/catalog/api/v1/media'); assert.equal(sent.options.method, 'POST');
  assert.equal(sent.options.body, form); assert.equal(sent.options.headers.Authorization, 'Bearer access-old');
  assert.equal(sent.options.headers['Content-Type'], undefined); assert.equal(sent.options.headers['Idempotency-Key'], 'media-upload');
  assert.equal(result.moderation_status, 'PENDING');
  await assert.rejects(api.request('catalog', '/api/v1/media', { multipart: form, body: {} }), /either JSON body or multipart/);
});

test('catalog search preserves Unicode, category and opaque cursor across pages', async () => {
  let sent;
  const api = new ApiClient({ correlationId: () => 'search-fixture', fetchImpl: async url => { sent = url; return response({ items: [], next_cursor: null }); } });
  const travel = new TravelClient(api);
  await travel.places(' Hội An & biển ', { cursor: 'opaque+/= cursor', categoryId: 'category-fixture', limit: 12 });
  const url = new URL(sent, 'https://example.invalid');
  assert.equal(url.pathname, '/api/catalog/api/v1/places');
  assert.equal(url.searchParams.get('q'), 'Hội An & biển');
  assert.equal(url.searchParams.get('cursor'), 'opaque+/= cursor');
  assert.equal(url.searchParams.get('categoryId'), 'category-fixture');
  assert.equal(url.searchParams.get('limit'), '12');
  await travel.places('   ');
  assert.equal(sent, '/api/catalog/api/v1/places');
});

test('reads six frozen partner fixture sets using native filesystem paths', () => {
  for (const service of ['identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence']) {
    const value = JSON.parse(readFileSync(resolve(root, `../backend/contracts/fixtures/${service}.http.json`), 'utf8'));
    assert.ok(Object.keys(value).length > 0);
  }
});

test('requests preserve bearer, version, idempotency, trace and JSON fields', async () => {
  const tokens = memoryTokenStore(pair()); let sent;
  const api = new ApiClient({ tokenStore: tokens, correlationId: () => 'trace-fixture', fetchImpl: async (url, options) => { sent = { url, ...options }; return response({ version: 2 }); } });
  assert.deepEqual(await api.request('trip', '/api/v1/me/trips', { method: 'PATCH', body: { title: 'Hà Nội' }, ifMatch: 1, idempotencyKey: 'stable-key' }), { version: 2 });
  assert.equal(sent.url, '/api/trip/api/v1/me/trips'); assert.equal(sent.headers.Authorization, 'Bearer access-old');
  assert.equal(sent.headers['If-Match'], '"1"'); assert.equal(sent.headers['Idempotency-Key'], 'stable-key');
  assert.equal(sent.headers['X-Correlation-Id'], 'trace-fixture'); assert.equal(JSON.parse(sent.body).title, 'Hà Nội');
});

test('204 and domain errors preserve status and trace; malformed JSON is explicit', async () => {
  const options = { correlationId: () => 'fixture' };
  const empty = new ApiClient({ ...options, fetchImpl: async () => new Response(null, { status: 204 }) });
  assert.equal(await empty.request('trip', '/api/v1/trips/1', { method: 'DELETE' }), undefined);
  const denied = new ApiClient({ ...options, fetchImpl: async () => new Response(JSON.stringify({ code: 'VERSION_CONFLICT', message: 'Stale version', traceId: 'provider-trace', fieldErrors: [] }), { status: 409 }) });
  await assert.rejects(denied.request('trip', '/api/v1/trips/1'), e => e.status === 409 && e.body.traceId === 'provider-trace');
  const invalid = new ApiClient({ ...options, fetchImpl: async () => new Response('<html>', { status: 502 }) });
  await assert.rejects(invalid.request('catalog', '/api/v1/places'), e => e.status === 502 && e.body.code === 'INVALID_PROVIDER_RESPONSE');
});

test('concurrent refresh sends one single-use token and omits expired bearer', async () => {
  const tokens = memoryTokenStore(pair()); const gate = deferred(); let calls = 0;
  const api = new ApiClient({ tokenStore: tokens, correlationId: () => 'fixture', fetchImpl: async (url, options) => {
    calls++; assert.ok(url.endsWith('/auth/refresh')); assert.equal(options.headers.Authorization, undefined);
    assert.equal(JSON.parse(options.body).refresh_token, 'refresh-old'); await gate.promise; return response(pair('new'));
  } });
  const identity = new IdentityClient(api, tokens); const first = identity.refresh(); const second = identity.refresh();
  assert.equal(first, second); gate.resolve(); await Promise.all([first, second]);
  assert.equal(calls, 1); assert.equal(tokens.get().refresh_token, 'refresh-new');
});

test('late refresh cannot overwrite newer login; failed refresh clears its session', async () => {
  const tokens = memoryTokenStore(pair()); const gate = deferred();
  const api = new ApiClient({ tokenStore: tokens, correlationId: () => 'fixture', fetchImpl: async url => {
    if (url.endsWith('/refresh')) { await gate.promise; return response(pair('late')); }
    return response(pair('login'));
  } });
  const identity = new IdentityClient(api, tokens); const refreshing = identity.refresh();
  await identity.login('fixture@example.invalid', 'synthetic-password'); gate.resolve(); await refreshing;
  assert.equal(tokens.get().access_token, 'access-login');
  const failed = new IdentityClient(new ApiClient({ tokenStore: tokens, correlationId: () => 'fixture', fetchImpl: async () => new Response('{}', { status: 401 }) }), tokens);
  await assert.rejects(failed.refresh()); assert.equal(tokens.get(), null);
});

test('logout waits for rotation and revokes the resulting token once', async () => {
  const tokens = memoryTokenStore(pair()); const gate = deferred(); let logoutBody;
  const api = new ApiClient({ tokenStore: tokens, correlationId: () => 'fixture', fetchImpl: async (url, options) => {
    if (url.endsWith('/refresh')) { await gate.promise; return response(pair('rotated')); }
    logoutBody = JSON.parse(options.body); return new Response(null, { status: 204 });
  } });
  const identity = new IdentityClient(api, tokens); const refreshing = identity.refresh(); const leaving = identity.logout();
  gate.resolve(); await Promise.all([refreshing, leaving]);
  assert.equal(logoutBody.refresh_token, 'refresh-rotated'); assert.equal(tokens.get(), null);
});

test('logout of a pending old refresh preserves a later login and revokes only its old session', async () => {
  const tokens = memoryTokenStore(pair()); const gate = deferred(); let logoutBody; let logoutBearer;
  const api = new ApiClient({ tokenStore: tokens, correlationId: () => 'fixture', fetchImpl: async (url, options) => {
    if (url.endsWith('/refresh')) { await gate.promise; return response(pair('old-rotated')); }
    if (url.endsWith('/login')) return response(pair('new-login'));
    logoutBody = JSON.parse(options.body); logoutBearer = options.headers.Authorization;
    return new Response(null, { status: 204 });
  } });
  const identity = new IdentityClient(api, tokens);
  const refreshing = identity.refresh(); const leaving = identity.logout();
  await identity.login('new@example.invalid', 'synthetic-password'); gate.resolve();
  await Promise.all([refreshing, leaving]);
  assert.equal(logoutBody.refresh_token, 'refresh-old-rotated');
  assert.equal(logoutBearer, 'Bearer access-old-rotated');
  assert.equal(tokens.get().refresh_token, 'refresh-new-login');
});

test('concurrent domain 401 responses rotate once and retry with stable write headers', async () => {
  const tokens = memoryTokenStore(pair()); const gate = deferred(); let refreshes = 0;
  const requests = [];
  const api = new ApiClient({ tokenStore: tokens, correlationId: () => 'stable-trace',
    refreshSession: async () => { refreshes++; await gate.promise; tokens.set(pair('rotated')); },
    fetchImpl: async (url, options) => {
      requests.push({ url, headers: { ...options.headers }, body: options.body });
      return options.headers.Authorization === 'Bearer access-old'
        ? new Response('{}', { status: 401 }) : response({ version: 2 });
    }
  });
  const options = { method: 'PATCH', body: { name: 'Hội An' }, ifMatch: 1, idempotencyKey: 'stable-write' };
  const first = api.request('trip', '/api/v1/trips/one', options);
  const second = api.request('trip', '/api/v1/trips/two', options);
  await new Promise(resolve => setImmediate(resolve)); gate.resolve();
  await Promise.all([first, second]);
  assert.equal(refreshes, 1); assert.equal(requests.length, 4);
  for (const request of requests) {
    assert.equal(request.headers['If-Match'], '"1"');
    assert.equal(request.headers['Idempotency-Key'], 'stable-write');
    assert.equal(request.headers['X-Correlation-Id'], 'stable-trace');
    assert.deepEqual(JSON.parse(request.body), options.body);
  }
  assert.equal(requests.filter(request => request.headers.Authorization === 'Bearer access-rotated').length, 2);
});

test('401 retries stop after one refresh and unauthenticated refresh never recurses', async () => {
  const tokens = memoryTokenStore(pair()); let refreshes = 0; let calls = 0;
  const api = new ApiClient({ tokenStore: tokens,
    refreshSession: async () => { refreshes++; tokens.set(pair('rotated')); },
    fetchImpl: async () => { calls++; return new Response('{}', { status: 401 }); }
  });
  await assert.rejects(api.request('trip', '/api/v1/me/trips'), error => error.status === 401);
  assert.equal(refreshes, 1); assert.equal(calls, 2);
  await assert.rejects(api.request('identity', '/api/v1/auth/refresh', { authenticated: false, body: { refresh_token: 'synthetic' } }), error => error.status === 401);
  assert.equal(refreshes, 1); assert.equal(calls, 3);
});

test('a pending refresh never replays an old write using a newer login', async () => {
  const tokens = memoryTokenStore(pair()); const gate = deferred(); let calls = 0;
  const api = new ApiClient({ tokenStore: tokens,
    refreshSession: async () => { await gate.promise; return pair('old-rotated'); },
    fetchImpl: async () => { calls++; return new Response('{}', { status: 401 }); }
  });
  const writing = api.request('trip', '/api/v1/trips/one', { method: 'PATCH', body: { name: 'Old user trip' } });
  await new Promise(resolve => setImmediate(resolve));
  tokens.set(pair('new-login')); gate.resolve();
  await assert.rejects(writing, error => error.status === 401);
  assert.equal(calls, 1); assert.equal(tokens.get().access_token, 'access-new-login');
});

test('readAll follows opaque cursors with existing filters and rejects cursor cycles', async () => {
  const urls = [];
  const travel = new TravelClient(new ApiClient({ fetchImpl: async url => {
    urls.push(url); return response(urls.length === 1 ? { items: [{ id: 'one' }], next_cursor: 'opaque+/=' } : { items: [{ id: 'two' }], next_cursor: null });
  } }));
  assert.deepEqual((await travel.readAll('trip', '/me/trips?state=DRAFT')).items.map(x => x.id), ['one', 'two']);
  const second = new URL(urls[1], 'https://example.invalid');
  assert.equal(second.searchParams.get('state'), 'DRAFT'); assert.equal(second.searchParams.get('limit'), '100');
  assert.equal(second.searchParams.get('cursor'), 'opaque+/=');
  const cycling = new TravelClient(new ApiClient({ fetchImpl: async () => response({ items: [], next_cursor: 'repeated' }) }));
  await assert.rejects(cycling.readAll('community', '/me/collections'), /repeated pagination cursor/);
});

test('a late old-session 401 cannot join another login refresh flight', async () => {
  const tokens = memoryTokenStore(pair('A')); const oldResponse = deferred(); const rotatingB = deferred();
  const sent = []; let refreshes = 0;
  const api = new ApiClient({ tokenStore: tokens,
    refreshSession: async () => { refreshes++; await rotatingB.promise; tokens.set(pair('B-rotated')); return pair('B-rotated'); },
    fetchImpl: async (url, options) => {
      sent.push({ url, auth: options.headers.Authorization });
      if (url.endsWith('/A')) { await oldResponse.promise; return new Response('{}', { status: 401 }); }
      return options.headers.Authorization === 'Bearer access-B-rotated' ? response({ ok: true }) : new Response('{}', { status: 401 });
    }
  });
  const oldWrite = api.request('trip', '/api/v1/trips/A', { method: 'PATCH', body: { name: 'A' } });
  tokens.set(pair('B'));
  const newRead = api.request('trip', '/api/v1/trips/B');
  await new Promise(resolve => setImmediate(resolve));
  oldResponse.resolve();
  await assert.rejects(oldWrite, error => error.status === 401);
  rotatingB.resolve(); await newRead;
  assert.equal(refreshes, 1);
  assert.deepEqual(sent.filter(r => r.url.endsWith('/A')).map(r => r.auth), ['Bearer access-A']);
});

test('a newer login rotates independently of an older pending identity refresh', async () => {
  const tokens = memoryTokenStore(pair('A')); const old = deferred(); const rotating = [];
  const api = new ApiClient({ tokenStore: tokens, fetchImpl: async (url, options) => {
    if (url.endsWith('/login')) return response(pair('B'));
    const refresh = JSON.parse(options.body).refresh_token; rotating.push(refresh);
    if (refresh === 'refresh-A') { await old.promise; return response(pair('A-late')); }
    return response(pair('B-rotated'));
  } });
  const identity = new IdentityClient(api, tokens); const first = identity.refresh();
  await identity.login('synthetic@example.invalid', 'synthetic-password');
  const second = identity.refresh(); assert.notEqual(first, second); await second;
  old.resolve(); await first;
  assert.deepEqual(rotating, ['refresh-A', 'refresh-B']); assert.equal(tokens.get().access_token, 'access-B-rotated');
});
