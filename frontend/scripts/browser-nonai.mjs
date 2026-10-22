import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = resolve(root, '..');
const output = resolve(repo, 'backend/infra/.local/p03/frontend-browser');
mkdirSync(output, { recursive: true });
const secrets = JSON.parse(readFileSync(process.env.P02_SECRETS_FILE ?? resolve(repo, 'backend/infra/.local/p02/secrets.json'), 'utf8'));
const snapshot = () => {
  const result = spawnSync('python', ['-c', "import sys,json;sys.path.insert(0,'backend/infra');from p03_candidate import candidate_manifest;print(json.dumps(candidate_manifest()))"], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 0, 'Candidate manifest unavailable');
  return JSON.parse(result.stdout);
};
const before = snapshot();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [], aiCalls = [], checks = [], responsive = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/intelligence')) aiCalls.push(request.method()); });
const mark = (id, details) => checks.push({ id, status: 'PASS', evidence: ['browser-nonai.mjs:' + id], details });
const idle = async () => {
  await page.waitForFunction(() => !document.querySelector('[aria-busy=true]') && !document.querySelector('.travel-status')?.textContent?.includes('Đang xử lý'), { timeout: 30000 });
  const alert = page.locator('[role=alert]');
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
  await page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
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
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).waitFor();
  await idle();
  await navigate('Khám phá');
}
async function logout() {
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).waitFor();
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
  const address = (process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173') + '/app';
  for (let attempt = 0; attempt < 30; attempt++) {
    try { if ((await fetch(address)).status === 200) break; } catch { /* Dev server may still be starting. */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  await page.goto(address);
  await idle();
  assert.equal(await page.getByRole('navigation').getByRole('button', { name: 'Gợi ý', exact: true }).count(), 0);
  await login('u1');
  await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).first().click(); await idle();
  await page.getByRole('heading', { name: 'Đánh giá', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Lưu yêu thích', exact: true }).click(); await idle();
  await navigate('Bộ sưu tập');
  const name = 'P03 browser ' + Date.now();
  await page.getByLabel('Tên bộ sưu tập', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Tạo bộ sưu tập', exact: true }).click(); await idle();
  await createdArticle(name);
  await navigate('Chuyến đi');
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill(name);
  await page.getByLabel('Ngày bắt đầu', { exact: true }).fill('2026-12-01');
  await page.getByLabel('Ngày kết thúc', { exact: true }).fill('2026-12-02');
  await page.getByLabel('Ngân sách (VND)', { exact: true }).fill('2000000');
  await page.getByRole('button', { name: 'Tạo chuyến đi', exact: true }).click(); await idle();
  await (await createdArticle(name)).getByRole('button', { name: 'Xem chi tiết' }).click(); await idle();
  await page.getByLabel('Ngày tham quan', { exact: true }).fill('2026-12-01');
  await page.getByRole('button', { name: 'Thêm ngày', exact: true }).click(); await idle();
  await page.getByRole('button', { name: '2026-12-01', exact: true }).click(); await idle();
  await page.getByRole('heading', { name: 'Địa điểm ngày 2026-12-01', exact: true }).waitFor();
  const place = page.locator('select[name=place]');
  await place.selectOption({ index: 1 });
  await page.getByLabel('Ghi chú', { exact: true }).fill('Synthetic non-AI browser visit');
  assert.equal(await page.locator('input[name=recommendation]').count(), 0);
  await page.getByRole('button', { name: 'Thêm địa điểm vào ngày', exact: true }).click(); await idle();
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
  await page.getByLabel('Tìm địa điểm', { exact: true }).fill('p03-no-such-place-' + Date.now());
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click(); await idle();
  assert.equal(await page.locator('article').count(), 0);
  await page.getByLabel('Tìm địa điểm', { exact: true }).fill('');
  const pattern = '**/api/catalog/api/v1/places*';
  await page.route(pattern, async route => { await new Promise(r => setTimeout(r, 400)); await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Synthetic outage', fieldErrors: [], traceId: '00000000-0000-4000-8000-000000000003' }) }); });
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
  await page.getByRole('main').getAttribute('aria-busy').then(value => assert.equal(value, 'true'));
  await page.locator('[role=alert]').waitFor();
  assert.match(await page.locator('[role=alert]').textContent(), /DEPENDENCY_UNAVAILABLE/);
  await page.unroute(pattern);
  await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click(); await idle();
  mark('loading_error_empty', 'Empty query result, visible busy state, 503 error, successful recovery');
  await responsiveCheck('user', 'Bản đồ');
  await page.getByRole('button', { name: 'Xem vị trí', exact: true }).first().click(); await idle();
  assert.match(await page.getByRole('link', { name: 'Mở vị trí trên OpenStreetMap' }).getAttribute('href'), /^https:\/\/www.openstreetmap.org\//);
  await page.getByRole('button', { name: 'Xem bản đồ trực tuyến', exact: true }).click();
  await page.locator('iframe').waitFor();
  mark('map', 'Location coordinates, OSM link and opt-in map iframe');
  await logout(); await login('business');
  await responsiveCheck('business', 'Khám phá');
  await responsiveCheck('business', 'Tài khoản');
  await responsiveCheck('business', 'Doanh nghiệp');
  await page.getByLabel('Tên doanh nghiệp', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Tạo doanh nghiệp', exact: true }).click(); await idle();
  await (await createdArticle(name)).getByRole('button', { name: 'Quản lý doanh nghiệp' }).click(); await idle();
  await page.getByLabel('Minh chứng xác minh (mỗi dòng một mã)', { exact: true }).fill('private/p03-synthetic-evidence');
  await page.getByRole('button', { name: 'Gửi hồ sơ xác minh', exact: true }).click(); await idle();
  assert.match(await page.getByRole('status').allTextContents().then(values => values.join(' ')), /chờ|PENDING/i);
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
    checks, gaps, ai_http_requests: aiCalls.length, page_errors: errors.length }, null, 2));
  if (!unchanged) process.exitCode = 1;
  await browser.close();
}
if (!process.exitCode) console.log('PASS non-AI browser: ' + checks.length + ' cases; no AI HTTP requests');
