import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadP02Secrets } from './p02-secrets.mjs';

const base = process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const output = new URL('../../backend/infra/.local/p03/trip-timeline/', import.meta.url);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(20000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let tripId, token, checks = 0;
const mark = label => { checks++; console.log(`PASS timeline browser: ${label}`); };
const button = name => page.getByRole('button', { name, exact: true });
async function api(path, method = 'GET', body, expected = 200) {
  let version;
  if (tripId && method !== 'GET') version = (await api(`/trips/${tripId}`)).version;
  const response = await context.request.fetch(`${base}/api/trip/api/v1${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, ...(version ? { 'If-Match': `"${version}"` } : {}) }, data: body,
  });
  assert.equal(response.status(), expected, `${method} ${path.replace(/[a-f0-9-]{36}/g, '{id}')}`);
  return expected === 204 ? null : response.json();
}
async function confirmed(method, path, trigger, expected = 200) {
  const response = page.waitForResponse(r => r.request().method() === method && new URL(r.url()).pathname === path);
  await trigger();
  const result = await response; assert.equal(result.status(), expected);
  return expected === 204 ? null : result.json();
}
try {
  const login = await context.request.post(`${base}/api/identity/api/v1/auth/login`, { data: {
    email: 'fixture-u1@example.invalid', password: loadP02Secrets().IDENTITY_FIXTURE_PASSWORD,
  } });
  assert.equal(login.status(), 200);
  const pair = await login.json(); token = pair.access_token;
  await context.addInitScript(pair => localStorage.setItem('smarttravel.auth', JSON.stringify(pair)), pair);
  await page.goto(`${base}/chuyen-di`);
  const name = `Timeline browser ${randomUUID()}`;
  await button('+ Chuyến đi mới').first().click();
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill(name);
  await page.getByLabel('Ngày bắt đầu', { exact: true }).fill('2026-12-01');
  await page.getByLabel('Ngày kết thúc', { exact: true }).fill('2026-12-04');
  const destinationPicker = page.getByLabel('Điểm đến ban đầu (không bắt buộc)', { exact: true });
  await expect(destinationPicker.locator('option').nth(1)).toBeAttached();
  const initialDestination = await destinationPicker.locator('option').nth(1).getAttribute('value');
  await destinationPicker.selectOption(initialDestination);
  const created = await confirmed('POST', '/api/trip/api/v1/me/trips', () => button('Tạo chuyến đi').click(), 201);
  tripId = created.trip_id;
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(page.getByTestId('trip-save-status')).toHaveText(/Đã lưu/);
  assert.equal((await api(`/trips/${tripId}/destinations`)).items[0].destination_id, initialDestination);
  assert.equal(await page.getByLabel('Tên chuyến đi', { exact: true }).count(), 0, 'Creation form must close once workspace opens');
  mark('create opens workspace and removes unrelated creation form');
  const root = `/api/trip/api/v1/trips/${tripId}`;
  await button('+ Thêm ngày').click();
  const dayInput = page.getByLabel('Ngày tham quan', { exact: true }).and(page.locator('input'));
  await dayInput.fill('2026-12-01');
  const day = await confirmed('POST', `${root}/days`, () => button('Thêm ngày').click(), 201);
  const itemsPath = `${root}/days/${day.day_id}/items`;
  await button('Cài đặt chuyến đi').click();
  const settings = page.getByRole('region', { name: 'Cài đặt chuyến đi', exact: true });
  await settings.getByLabel('Ngân sách', { exact: true }).fill('1800000');
  const revised = await confirmed('PATCH', root, () => button('Áp dụng thay đổi').click());
  assert.equal(revised.budget, 1800000);
  await button('+ Thêm ngày').click();
  await dayInput.fill('2026-12-02');
  const extraDay = await confirmed('POST', `${root}/days`, () => button('Thêm ngày').click(), 201);
  await page.getByLabel('Tùy chọn ngày', { exact: true }).click();
  await page.getByLabel('Đổi ngày tham quan', { exact: true }).fill('2026-12-03');
  await confirmed('PATCH', `${root}/days/${extraDay.day_id}`, () => button('Áp dụng ngày').click());
  page.once('dialog', dialog => dialog.accept());
  await confirmed('DELETE', `${root}/days/${extraDay.day_id}`, () => button('Xóa ngày tham quan').click(), 204);
  await page.getByRole('tab', { name: /01\/12\/2026/ }).click();
  mark('compact trip settings and day create/edit/delete UI');
  for (let index = 0; index < 3; index++) {
    await confirmed('POST', itemsPath, () => button('+ Thêm vào ngày').and(page.locator(':enabled')).first().click(), 201);
  }
  const items = page.getByTestId('trip-timeline-item');
  await expect(items).toHaveCount(3);
  await expect(page.getByTestId('travel-leg')).toHaveCount(2);
  assert.equal(await button('Ước tính tuyến').count(), 0);
  assert.equal(await button('Lưu chặng di chuyển').count(), 0);
  mark('add three real Catalog places; two automatic integrated legs without transfer forms');
  const invalidDuration = items.nth(1).getByLabel(/^Thời lượng /);
  const independentNote = items.first().getByLabel(/^Ghi chú /);
  const tripSelector = page.getByRole('navigation', { name: 'Chọn chuyến đi' }).getByRole('combobox');
  await invalidDuration.fill('1.5'); await invalidDuration.blur();
  await independentNote.fill('Independent editor save'); await independentNote.blur();
  await expect(page.locator('.tp-sync')).toHaveText(/Thay đổi đang chờ lưu/);
  await expect(tripSelector).toBeDisabled();
  await invalidDuration.fill('120'); await invalidDuration.blur();
  await expect(page.locator('.tp-sync')).toHaveText(/Đã lưu/);
  await expect(tripSelector).toBeEnabled();
  mark('invalid editor draft keeps navigation blocked while another editor saves');
  const originalOrder = await items.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-item-id')));
  await items.first().getByRole('button', { name: /^Đưa .+ xuống$/ }).focus();
  await confirmed('PUT', `${itemsPath}/order`, () => page.keyboard.press('Enter'));
  await expect(items.first()).toHaveAttribute('data-item-id', originalOrder[1]);
  await confirmed('PUT', `${itemsPath}/order`, () => items.nth(1).getByRole('button', { name: /^Đưa .+ lên$/ }).click());
  await expect(items.first()).toHaveAttribute('data-item-id', originalOrder[0]);
  await expect(page.locator('.tp-map-marker')).toHaveCount(3);
  mark('keyboard reorder persists timeline order and synchronizes numbered map markers');
  const first = items.first(), firstId = await first.getAttribute('data-item-id');
  const note = first.getByLabel(/^Ghi chú /), duration = first.getByLabel(/^Thời lượng /);
  await confirmed('PATCH', `${itemsPath}/${firstId}`, async () => { await note.fill(''); await note.pressSequentially('Persistent timeline note', { delay: 20 }); await note.blur(); });
  await confirmed('PATCH', `${itemsPath}/${firstId}`, async () => { await duration.fill('75'); await duration.blur(); });
  assert.equal((await api(`/trips/${tripId}/days/${day.day_id}/items/${firstId}`)).duration_minutes, 75);
  await first.locator('summary').click();
  await confirmed('PATCH', `${itemsPath}/${firstId}`, () => first.getByRole('button', { name: 'Khóa địa điểm', exact: true }).click());
  await expect(note).toBeDisabled();
  await expect(first.getByRole('button', { name: /^Đưa .+ xuống$/ })).toBeDisabled();
  await confirmed('PATCH', `${itemsPath}/${firstId}`, () => first.getByRole('button', { name: 'Mở khóa địa điểm', exact: true }).click());
  await confirmed('POST', `${root}/snapshots/refresh`, () => first.getByRole('button', { name: 'Cập nhật thông tin địa điểm', exact: true }).click(), 202);
  await first.locator('summary').click();
  mark('contextual lock protects editing/order; unlock and canonical snapshot refresh');
  const legs = page.getByTestId('travel-leg');
  await confirmed('PATCH', `${root}/days/${day.day_id}/travel-legs/${await legs.first().getAttribute('data-leg-id')}`, () => legs.first().getByRole('combobox').selectOption('WALK'));
  mark('duration/note autosave and inline transport mode persist through Gateway');
  let intercept = true;
  await page.route(`**${itemsPath}/${firstId}`, async route => {
    if (route.request().method() === 'PATCH' && intercept) {
      intercept = false;
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'TEST_OUTAGE', message: 'Temporary synthetic save outage', traceId: 'timeline-test', fieldErrors: [] }) });
    } else await route.continue();
  });
  await note.fill('Draft survives save outage'); await note.blur();
  await expect(button('Thử lưu lại')).toBeVisible();
  await expect(note).toHaveValue('Draft survives save outage');
  await confirmed('PATCH', `${itemsPath}/${firstId}`, () => button('Thử lưu lại').click());
  await page.unroute(`**${itemsPath}/${firstId}`);
  assert.equal((await api(`/trips/${tripId}/days/${day.day_id}/items/${firstId}`)).note, 'Draft survives save outage');
  mark('controlled save outage preserves draft; explicit retry persists original intent');
  await api(`/trips/${tripId}/days/${day.day_id}/items/${firstId}`, 'PATCH', { note: 'Newer external revision', duration_minutes: 90 });
  await note.fill('Conflicting local draft'); await note.blur();
  await expect(button('Tải phiên bản mới')).toBeVisible();
  await expect(note).toHaveValue('Conflicting local draft');
  assert.equal((await api(`/trips/${tripId}/days/${day.day_id}/items/${firstId}`)).note, 'Newer external revision');
  await button('Tải phiên bản mới').click();
  await expect(note).toHaveValue('Conflicting local draft');
  await confirmed('PATCH', `${itemsPath}/${firstId}`, () => button('Thử lưu lại').click());
  const reconciled = await api(`/trips/${tripId}/days/${day.day_id}/items/${firstId}`);
  assert.equal(reconciled.note, 'Conflicting local draft');
  assert.equal(reconciled.duration_minutes, 90, 'Retrying note must preserve remotely updated unedited duration');
  mark('real stale version conflict preserves draft, explicit retry and remotely updated unedited fields');
  await page.reload();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await expect(items).toHaveCount(3);
  await expect(items.first().getByLabel(/^Thời lượng /)).toHaveValue('90');
  mark('reload restores selected trip/day and persisted edits');
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('desktop.png', output)), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(items.first()).toBeVisible();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'Mobile must not overflow horizontally');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement !== document.body), true);
  await button('Bản đồ').last().click();
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await page.screenshot({ path: fileURLToPath(new URL('mobile.png', output)), fullPage: true });
  mark('mobile timeline, keyboard focus and interactive Leaflet map');
  assert.deepEqual(errors, []);
} catch (error) {
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: fileURLToPath(new URL('failure.png', output)), fullPage: true });
  throw error;
} finally {
  if (tripId) await api(`/trips/${tripId}`, 'DELETE', undefined, 204);
  await browser.close();
}
console.log(`Timeline browser: ${checks} groups passed, 0 failures; real Gateway writes plus one controlled save-outage response`);
