import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadP02Secrets } from './p02-secrets.mjs';

const secrets = loadP02Secrets();
const output = fileURLToPath(new URL('../../backend/infra/.local/p03/frontend-media-browser/', import.meta.url)); mkdirSync(output, { recursive: true });
const origin = process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch(); const page = await browser.newPage(); page.setDefaultTimeout(20000);
const api = [], errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { const path = new URL(r.url()).pathname; if (path.startsWith('/api/')) api.push({ method: r.request().method(), path: path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}'), status: r.status() }); });
async function call(path, method, status, action) {
  const pending = page.waitForResponse(r => new URL(r.url()).pathname.endsWith(path) && r.request().method() === method);
  await action(); const response = await pending; assert.equal(response.status(), status, `${method} ${path}`);
  return response.status() === 204 ? null : response.json();
}
try {
  await page.goto(`${origin}/tai-khoan`);
  await page.getByLabel('Email', { exact: true }).fill('fixture-admin@example.invalid');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(secrets.IDENTITY_FIXTURE_PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).waitFor();
  await page.goto(`${origin}/quan-tri`);
  const media = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Ảnh địa điểm', exact: true }) });
  await media.getByLabel('Ảnh cần tải lên').setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await call('/admin/media', 'POST', 400, () => media.getByRole('button', { name: 'Tải ảnh lên', exact: true }).click()); checks.push('invalid image rejected');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  await media.getByLabel('Ảnh cần tải lên').setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: png });
  const uploaded = await call('/admin/media', 'POST', 201, () => media.getByRole('button', { name: 'Tải ảnh lên', exact: true }).click());
  assert.equal(uploaded.moderation_status, 'PENDING'); checks.push('valid upload quarantined');
  const id = uploaded.media_id;
  const publicImage = await page.request.get(`${origin}/api/catalog/api/v1/media/${id}`); assert.equal(publicImage.status(), 404); checks.push('quarantine public image hidden');
  api.push({ method: 'GET', path: '/api/catalog/api/v1/media/{id}', status: publicImage.status() });
  await media.getByLabel('Mã ảnh', { exact: true }).fill(id); await media.getByLabel('Lý do xử lý ảnh').fill('Synthetic media integration');
  await call(`/admin/media/${id}/review`, 'POST', 503, () => media.getByRole('button', { name: 'Lưu quyết định ảnh', exact: true }).click());
  await media.getByRole('alert').waitFor(); checks.push('approval fails closed without scanner');
  await media.getByLabel('Quyết định ảnh').selectOption('REJECT');
  await call(`/admin/media/${id}/review`, 'POST', 202, () => media.getByRole('button', { name: 'Lưu quyết định ảnh', exact: true }).click());
  await media.getByText(/REJECTED/).waitFor(); checks.push('admin rejects quarantined media');
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).click();
  await page.goto(`${origin}/tai-khoan`);
  await page.getByLabel('Email', { exact: true }).fill('fixture-u1@example.invalid');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(secrets.IDENTITY_FIXTURE_PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).waitFor();
  await page.goto(`${origin}/kham-pha`);
  await page.locator('#diem-den article').first().waitFor({ state: 'attached' });
  const fixtures = page.locator('.journey-data-note');
  if (await fixtures.count()) await fixtures.locator('summary').click();
  await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).first().click();
  await page.getByRole('button', { name: 'Viết đánh giá', exact: true }).click();
  const userMedia = await call('/api/v1/media', 'POST', 201, () => page.locator('#review-image').setInputFiles({ name: 'synthetic-review.png', mimeType: 'image/png', buffer: png }));
  assert.equal(userMedia.moderation_status, 'PENDING');
  await page.getByText(`Ảnh ${userMedia.media_id}`, { exact: false }).waitFor();
  checks.push('user review image uploaded to quarantine through real form');
  const anonymous = await page.request.post(`${origin}/api/catalog/api/v1/media`, { multipart: { file: { name: 'anonymous.png', mimeType: 'image/png', buffer: png } } });
  assert.equal(anonymous.status(), 401); api.push({ method: 'POST', path: '/api/catalog/api/v1/media', status: 401 });
  checks.push('anonymous upload denied');
  assert.deepEqual(errors, []);
  const unexpected = api.filter(r => r.status >= 400 && !(r.status === 400 && r.path.endsWith('/admin/media')) && !(r.status === 503 && r.path.endsWith('/review')) && !(r.status === 404 && r.path === '/api/catalog/api/v1/media/{id}') && !(r.status === 401 && r.method === 'POST' && r.path === '/api/catalog/api/v1/media'));
  assert.deepEqual(unexpected, []);
  console.log(`PASS media browser: ${checks.length} checks; ${api.length} real Gateway requests; 0 unexpected API/page errors; scanner unavailable expected`);
} catch (error) { console.error('FAIL media browser: ' + error.message); await page.screenshot({ path: output + 'failure.png', fullPage: true }); process.exitCode = 1; }
finally { writeFileSync(output + 'report.json', JSON.stringify({ timestamp: new Date().toISOString(), checks, errors, api_request_count: api.length, api_results: [...new Map(api.map(r => [JSON.stringify(r), r])).values()], passed: !process.exitCode }, null, 2)); await browser.close(); }
