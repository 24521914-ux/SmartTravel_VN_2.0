import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { loadP02Secrets } from './p02-secrets.mjs';

// Runs the browser's actual clients against the real Gateway; no fetch replacement.
const root = fileURLToPath(new URL('..', import.meta.url));
const directory = mkdtempSync(resolve(tmpdir(), 'smarttravel-gateway-smoke-'));
const apiResults = [], checks = [];
const observedFetch = async (...args) => {
  const response = await fetch(...args);
  apiResults.push({ method: args[1]?.method ?? 'GET', path: new URL(args[0]).pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}'), status: response.status });
  return response;
};
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
  const password = process.env.P02_USER_PASSWORD ?? loadP02Secrets().IDENTITY_FIXTURE_PASSWORD;
  assert.ok(password, 'Missing fixture user password');
  const store = memoryTokenStore();
  const baseUrl = `${process.env.P02_GATEWAY_TARGET ?? 'http://127.0.0.1:58080'}/api`;
  const api = new ApiClient({ baseUrl, tokenStore: store, timeoutMs: 30_000, fetchImpl: observedFetch });
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
  if (process.env.P03_AI_ENABLED === 'true') {
    assert.ok(Array.isArray((await travel.recommend()).items));
  }
  const secondStore = memoryTokenStore();
  const secondApi = new ApiClient({ baseUrl, tokenStore: secondStore, fetchImpl: observedFetch });
  const secondIdentity = new IdentityClient(secondApi, secondStore);
  const secondPair = await secondIdentity.login('fixture-u1@example.invalid', password);
  const secondSession = JSON.parse(Buffer.from(secondPair.access_token.split('.')[1], 'base64url').toString()).sid;
  assert.ok(secondSession);
  await travel.mutate('identity', `/me/sessions/${secondSession}`, undefined, 'DELETE');
  await assert.rejects(secondApi.request('identity', '/api/v1/me'), error => error.status === 401);
  await identity.refresh(); await identity.logout(); assert.equal(store.get(), null);
  checks.push('real clients, refresh rotation, revoke another session and verify denial');
  await identity.login('fixture-business@example.invalid', password);
  const business = await travel.mutate('catalog', '/businesses', { name: `P03 deletion fixture ${Date.now()}` });
  await travel.mutate('catalog', `/businesses/${business.business_id}`, undefined, 'DELETE', business.version);
  assert.equal((await travel.read('catalog', `/businesses/${business.business_id}`)).status, 'SUSPENDED');
  checks.push('business deletion persists suspension while preserving audit record');
  await identity.logout();
  await identity.login('fixture-admin@example.invalid', password);
  const cancellationRun = `cancel-${Date.now()}`;
  // Matching requires a published candidate. Earlier resilience probes may hide
  // their places, so establish this test's own candidate instead of relying on them.
  const geographicUnits = await travel.read('catalog', '/geographic-units');
  assert.ok(geographicUnits.items.length, 'Cancellation fixture requires a geographic unit');
  const candidate = await travel.mutate('catalog', '/admin/places', {
    name: `P02 source ${cancellationRun}`,
    geographic_unit_id: geographicUnits.items[0].geographic_unit_id ?? geographicUnits.items[0].id,
    latitude: 16.047079, longitude: 108.20623,
    category_ids: ['20000000-0000-0000-0000-000000000001'],
  });
  await travel.mutate('catalog', `/admin/places/${candidate.place_id}/status`, { status: 'PUBLISHED' }, 'PUT', candidate.version);
  assert.equal((await travel.place(candidate.place_id)).status, 'PUBLISHED');
  const source = await travel.mutate('ingestion', '/admin/data-sources', { name: `P03 cancellation ${Date.now()}`, uri: `http://source-sandbox:8080/records?run=${cancellationRun}`, secret_reference: 'none', license_version: 'synthetic-v1', allow_storage: true, allow_training: false });
  const job = await travel.mutate('ingestion', `/admin/data-sources/${source.source_id}/import-jobs`, { mode: 'FULL' });
  let waiting = false;
  let observedStatuses = [];
  for (let attempt = 0; attempt < 60; attempt++) {
    const items = await travel.read('ingestion', `/admin/import-jobs/${job.job_id}/items`);
    observedStatuses = items.items.map(item => ({ status: item.status, error_code: item.error_code }));
    if (items.items.some(item => item.status === 'NEEDS_REVIEW')) { waiting = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const settledJob = await travel.read('ingestion', `/admin/import-jobs/${job.job_id}`);
  assert.ok(waiting, `Synthetic matching job must await operator decision; job=${settledJob.status}; items=${JSON.stringify(observedStatuses)}`);
  for (const view of ['errors', 'candidates']) assert.ok(Array.isArray((await travel.read('ingestion', `/admin/import-jobs/${job.job_id}/${view}`)).items));
  const currentJob = await travel.read('ingestion', `/admin/import-jobs/${job.job_id}`);
  const retried = await travel.mutate('ingestion', `/admin/import-jobs/${job.job_id}/retry`, undefined, 'POST', currentJob.version);
  assert.equal(retried.status, 'RUNNING');
  const cancelled = await travel.mutate('ingestion', `/admin/import-jobs/${job.job_id}/cancel`, undefined, 'POST', retried.version);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal((await travel.read('ingestion', `/admin/import-jobs/${job.job_id}`)).status, 'CANCELLED');
  checks.push('job candidates/errors, retry with version, cancellation persisted');
  await identity.logout();
  console.log('PASS real Gateway frontend clients: login, profile, preferences, catalog, reviews, collections, trips, notifications, refresh, logout; AI ' + (process.env.P03_AI_ENABLED === 'true' ? 'included' : 'deferred'));
} catch (error) {
  // Never print request headers, credentials, or token responses.
  console.error(`FAIL Gateway smoke: ${error.name}: ${error.message}`);
  process.exitCode = 1;
} finally {
  const output = resolve(root, '../backend/infra/.local/p03/frontend-gateway'); mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'report.json'), JSON.stringify({ timestamp: new Date().toISOString(), passed: !process.exitCode, checks, api_results: apiResults, api_request_count: apiResults.length }, null, 2));
  rmSync(directory, { recursive: true, force: true });
}
