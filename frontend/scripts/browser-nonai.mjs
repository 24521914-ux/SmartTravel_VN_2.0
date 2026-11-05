import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadP02Secrets } from './p02-secrets.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = resolve(root, '..');
const output = resolve(repo, 'backend/infra/.local/p03/frontend-browser');
mkdirSync(output, { recursive: true });
const secrets = loadP02Secrets();
const snapshot = () => {
  const result = spawnSync('python', ['-c', "import sys,json;sys.path.insert(0,'backend/infra');from p03_candidate import candidate_manifest;print(json.dumps(candidate_manifest()))"], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, 'Candidate manifest unavailable');
  return JSON.parse(result.stdout);
};
const before = snapshot();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(20000);
const errors = [], aiCalls = [], checks = [], responsive = [];
const apiResults = [];
page.on('response', response => {
  const pathname = new URL(response.url()).pathname;
  if (pathname.startsWith('/api/')) apiResults.push({ method: response.request().method(), path: pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}'), status: response.status() });
});
const pendingRequests = new Set();
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => {
  const path = new URL(request.url()).pathname;
  if (path.startsWith('/api/')) pendingRequests.add(request);
  if (path.startsWith('/api/intelligence')) aiCalls.push(request.method());
});
page.on('requestfinished', request => pendingRequests.delete(request));
page.on('requestfailed', request => pendingRequests.delete(request));
const mark = (id, details) => { checks.push({ id, status: 'PASS', evidence: ['browser-nonai.mjs:' + id], details }); console.log('PASS browser group: ' + id); };
const idle = async () => {
  const deadline = Date.now() + 30000;
  do { await page.waitForTimeout(100); } while (pendingRequests.size && Date.now() < deadline);
  assert.equal(pendingRequests.size, 0, 'API requests did not complete');
  await page.waitForFunction(() => !document.querySelector('[aria-busy=true]') && !document.querySelector('.travel-status')?.textContent?.includes('Đang xử lý'), { timeout: 30000 });
  const alert = page.locator('main [role=alert]');
  assert.equal(await alert.count() ? await alert.first().textContent() : '', '');
};
async function navigate(name) {
  const button = page.getByRole('navigation').getByRole('button', { name, exact: true });
  if (!await button.isVisible()) {
    const mobile = page.getByRole('button', { name: 'Mở menu', exact: true });
    if (await mobile.isVisible()) await mobile.click();
    else await page.locator('.more-toggle').click();
  }
  await button.click();
  if (name === 'Tài khoản') await page.locator('.account-panel-container').waitFor();
  else if (name !== 'Khám phá') await page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
  await idle();
}
async function createdArticle(name) {
  const article = page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  // Existing fixture accounts can already span several pages after prior runs.
  for (let attempt = 0; attempt < 100 && !await article.count(); attempt++) {
    const more = page.getByRole('button', { name: 'Xem thêm', exact: true });
    assert.equal(await more.count(), 1, 'Created record missing from paginated listing');
    await more.click(); await idle();
  }
  await article.waitFor();
  return article;
}
async function login(alias) {
  await navigate('Tài khoản');
  await page.getByLabel('Email', { exact: true }).first().fill('fixture-' + alias + '@example.invalid');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(secrets.IDENTITY_FIXTURE_PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống', exact: true }).waitFor();
  await idle();
  await navigate('Khám phá');
}
async function logout() {
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống', exact: true }).click();
  await page.getByRole('banner').getByRole('button', { name: 'Đăng nhập', exact: true }).waitFor();
  await idle();
}
async function responsiveCheck(role, section) {
  await navigate(section);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${role}/${section}/${width} overflow`);
    responsive.push({ role, section, width, status: 'PASS' });
  }
  await page.screenshot({ path: resolve(output, role + '-' + section + '.png'), fullPage: true });
}
let failure;
try {
  const address = (process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173') + '/kham-pha';
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if ((await fetch(address)).status === 200) break; } catch { /* Dev server may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await page.goto(address);
  await idle();
  assert.equal(await page.getByRole('navigation').getByRole('button', { name: 'Gợi ý', exact: true }).count(), 0);
  await login('u1');
  await navigate('Thông báo'); await idle();
  const unread = page.getByRole('button', { name: 'Đánh dấu đã đọc', exact: true });
  await unread.first().waitFor();
  const beforeRead = await unread.count();
  assert.ok(beforeRead > 0, 'P02 unread notification fixture required');
  const readRoute = '**/api/identity/api/v1/me/notifications/*/read';
  await page.route(readRoute, route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Synthetic notification outage', traceId: 'fixture', fieldErrors: [] }) }));
  await unread.first().click(); await page.locator('.notifications-layout').getByRole('alert').waitFor();
  assert.equal(await unread.count(), beforeRead, 'Failed write must not mark notifications read');
  await page.unroute(readRoute);
  await unread.first().click(); await idle();
  assert.equal(await unread.count(), beforeRead - 1, 'Only the confirmed notification may become read');
  mark('notifications', '503 retains unread state; real PATCH marks exactly one notification read');
  await navigate('Khám phá'); await idle();
  const fixtures = page.locator('.journey-data-note');
  if (await fixtures.count()) await fixtures.locator('summary').click();
  await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).first().click(); await idle();
  await page.getByRole('heading', { name: 'Đánh giá', exact: true }).waitFor();
  await page.getByRole('button', { name: /^(Lưu yêu thích|Đã lưu yêu thích)$/ }).click(); await idle();
  await page.getByRole('button', { name: /^(Lưu yêu thích|Đã lưu yêu thích)$/ }).click(); await idle();
  await navigate('Bộ sưu tập');
  const name = 'P03 browser ' + Date.now();
  await page.getByLabel('Tên bộ sưu tập', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Tạo bộ sưu tập', exact: true }).click(); await idle();
  await createdArticle(name);
  await navigate('Chuyến đi');
  await page.getByRole('button', { name: '+ Chuyến đi mới', exact: true }).first().click();
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill(name);
  await page.getByLabel('Ngày bắt đầu', { exact: true }).fill('2026-12-01');
  await page.getByLabel('Ngày kết thúc', { exact: true }).fill('2026-12-02');
  await page.getByLabel('Ngân sách dự kiến', { exact: true }).fill('2000000');
  await page.getByRole('button', { name: 'Tạo chuyến đi', exact: true }).click(); await idle();
  await page.getByRole('heading', { name, exact: true }).waitFor();
  await page.getByLabel('Ngày tham quan', { exact: true }).and(page.locator('input')).fill('2026-12-01');
  await page.getByRole('button', { name: 'Thêm ngày', exact: true }).click(); await idle();
  await page.getByRole('tab', { name: /01\/12\/2026/ }).click(); await idle();
  await page.getByRole('heading', { name: 'Ngày 01/12/2026', exact: true }).waitFor();
  assert.equal(await page.locator('input[name=recommendation]').count(), 0);
  await page.getByRole('button', { name: '+ Thêm vào ngày', exact: true }).first().click(); await idle();
  await page.getByTestId('trip-timeline-item').first().locator('summary').click();
  await page.getByRole('button', { name: 'Khóa địa điểm', exact: true }).click(); await idle();
  await page.getByRole('button', { name: 'Mở khóa địa điểm', exact: true }).click(); await idle();
  await responsiveCheck('user', 'Chuyến đi');
  await responsiveCheck('user', 'Tài khoản');
  assert.equal(await page.locator('input[name=consent]').count(), 0, 'AI opt-in must be unavailable while AI is deferred');
  mark('user', 'login, favorite, collection, trip/day/item, lock/unlock, account');
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(() => document.activeElement !== document.body));
  mark('keyboard', 'Keyboard reaches an interactive control');
  await navigate('Khám phá');
  await page.locator('#destination-search').fill('p03-no-such-place-' + Date.now());
  await page.getByRole('button', { name: 'Tìm điểm đến', exact: true }).click(); await idle();
  assert.equal(await page.locator('#diem-den article').count(), 0);
  await page.locator('#destination-search').fill('');
  const pattern = '**/api/catalog/api/v1/places*';
  await page.route(pattern, async route => { await new Promise(r => setTimeout(r, 400)); await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Synthetic outage', fieldErrors: [], traceId: '00000000-0000-4000-8000-000000000003' }) }); });
  await page.getByRole('button', { name: 'Tìm điểm đến', exact: true }).click();
  await page.locator('#diem-den').getAttribute('aria-busy').then(value => assert.equal(value, 'true'));
  await page.locator('#diem-den').getByRole('alert').waitFor();
  assert.ok(await page.locator('#diem-den').getByRole('alert').isVisible());
  await page.unroute(pattern);
  await page.getByRole('button', { name: 'Tìm điểm đến', exact: true }).click(); await idle();
  mark('loading_error_empty', 'Empty query result, visible busy state, 503 error, successful recovery');
  await responsiveCheck('user', 'Bản đồ');
  await page.getByRole('button', { name: 'Xem vị trí', exact: true }).first().click(); await idle();
  assert.match(await page.getByRole('link', { name: /Mở OpenStreetMap/ }).getAttribute('href'), /^https:\/\/www.openstreetmap.org\//);
  await page.locator('iframe').waitFor();
  mark('map', 'Location coordinates, OSM link and opt-in map iframe');
  await logout(); await login('business');
  await responsiveCheck('business', 'Khám phá');
  await responsiveCheck('business', 'Tài khoản');
  await responsiveCheck('business', 'Doanh nghiệp');
  await page.getByLabel('Tên doanh nghiệp', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Tạo doanh nghiệp', exact: true }).click(); await idle();
  await (await createdArticle(name)).getByRole('button', { name: 'Quản lý doanh nghiệp' }).click(); await idle();
  await page.getByRole('tab', { name: /Xác minh/ }).click();
  await page.locator('#kyc-doc-url').fill('private/p03-synthetic-evidence');
  await page.getByRole('button', { name: 'Gửi xác minh KYC', exact: true }).click(); await idle();
  await page.getByText(/chờ|PENDING/i).first().waitFor();
  mark('business', 'Create business and submit verification');
  mark('async_ack', 'Verification UI displays pending review');
  await logout(); await login('admin');
  await responsiveCheck('admin', 'Kiểm duyệt');
  await responsiveCheck('admin', 'Quản trị');
  assert.equal(await page.locator('option[value=models]').count(), 0);
  await responsiveCheck('admin', 'Tài khoản');
  mark('admin', 'Moderation and source admin; model controls absent');
  mark('responsive', responsive);
  assert.deepEqual(errors, []); assert.deepEqual(aiCalls, []);
  await logout();
} catch (error) { failure = error; await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }); console.error('FAIL nonAI browser: ' + error.message); process.exitCode = 1; }
finally {
  const after = snapshot();
  const unchanged = before.sha256 === after.sha256;
  const gaps = failure ? [failure.message] : [];
  if (!unchanged) gaps.push('Candidate changed during browser exercise');
  writeFileSync(resolve(output, 'report.json'), JSON.stringify({ scope: 'non-ai', release_id: process.env.P03_RELEASE_ID,
    timestamp: new Date().toISOString(), candidate_before_sha256: before.sha256, candidate_sha256: after.sha256,
    source_hashes: { 'frontend/scripts/browser-nonai.mjs': after.files['frontend/scripts/browser-nonai.mjs'] },
    checks, gaps, api_request_count: apiResults.length, responsive_cases: responsive.length, api_results: [...new Map(apiResults.map(r => [JSON.stringify(r), r])).values()], ai_http_requests: aiCalls.length, page_errors: errors.length }, null, 2));
  if (!unchanged) process.exitCode = 1;
  await browser.close();
}
if (!process.exitCode) console.log('PASS non-AI browser: ' + checks.length + ' cases; no AI HTTP requests');
