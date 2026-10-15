import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Runs the browser's actual clients against the real Gateway; no fetch replacement.
const root = fileURLToPath(new URL('..', import.meta.url));
const directory = mkdtempSync(resolve(tmpdir(), 'smarttravel-gateway-smoke-'));
try {
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
  const secretPath = process.env.P02_SECRETS_FILE ?? resolve(root, '../backend/infra/.local/p02/secrets.json');
  const password = process.env.P02_USER_PASSWORD ?? JSON.parse(readFileSync(secretPath, 'utf8')).IDENTITY_FIXTURE_PASSWORD;
  assert.ok(password, 'Missing fixture user password');
  const store = memoryTokenStore();
  const api = new ApiClient({ baseUrl: `${process.env.P02_GATEWAY_TARGET ?? 'http://127.0.0.1:58080'}/api`, tokenStore: store, timeoutMs: 30_000 });
  const identity = new IdentityClient(api, store);
  const travel = new TravelClient(api);
  await identity.login(process.env.P02_USER_EMAIL ?? 'fixture-u1@example.invalid', password);
  const profile = await travel.read('identity', '/me');
  assert.ok(profile.user_id ?? profile.id);
  const preferences = await travel.read('identity', '/me/preferences');
  assert.ok(preferences.version >= 1);
  const places = await travel.places(); assert.ok(Array.isArray(places.items));
  if (places.items.length) {
    const placeId = places.items[0].place_id ?? places.items[0].id;
    assert.ok(await travel.place(placeId));
    assert.ok(Array.isArray((await travel.reviews(placeId)).items));
  }
  for (const [service, path] of [['community','/me/collections'], ['trip','/me/trips'], ['identity','/me/notifications']]) {
    assert.ok(Array.isArray((await travel.read(service, path)).items));
  }
  assert.ok(Array.isArray((await travel.recommend()).items));
  await identity.refresh(); await identity.logout(); assert.equal(store.get(), null);
  console.log('PASS real Gateway frontend clients: login, profile, preferences, catalog, reviews, collections, trips, notifications, recommendations, refresh, logout');
} catch (error) {
  // Never print request headers, credentials, or token responses.
  console.error(`FAIL Gateway smoke: ${error.name}: ${error.message}`);
  process.exitCode = 1;
} finally { rmSync(directory, { recursive: true, force: true }); }
