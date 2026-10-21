import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

// Uses real HTTP and isolated synthetic accounts. Never save browser storage or tokens.
const root = fileURLToPath(new URL('..', import.meta.url));
const secrets = JSON.parse(readFileSync(process.env.P02_SECRETS_FILE ?? resolve(root, '../backend/infra/.local/p02/secrets.json'), 'utf8'));
const base = process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const output = resolve(root, '../backend/infra/.local/p03/frontend-browser');
const sourceFiles = ['frontend/src/OperationalPanels.tsx', 'frontend/src/TravelApp.tsx', 'frontend/src/travel.css', 'frontend/scripts/p03-browser.mjs', 'backend/contracts/checksums.json'];
const sourceHashes = Object.fromEntries(sourceFiles.map(path => [path, createHash('sha256').update(readFileSync(resolve(root, '..', path))).digest('hex')]));
const timestamp = new Date().toISOString();
const report = { timestamp, measured_at: timestamp, release_id: process.env.P03_RELEASE_ID ?? null, source_hashes: sourceHashes, provider: 'real P02 Gateway / local sandbox', provider_observations: [], checks: [], gaps: [] };
const browser = await chromium.launch();
let page;
const errors = [];
let placeId;
let reviewText;
let uniquePlaceName;
let businessName;
async function api(service, path, method = 'GET', body, version) {
  return page.evaluate(async ({ service, path, method, body, version }) => {
    const tokens = JSON.parse(localStorage.getItem('smarttravel.auth'));
    const headers = { Authorization: `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() };
    if (version !== undefined) headers['If-Match'] = `"${version}"`;
    const response = await fetch(`/api/${service}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Error(`Fixture HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }, { service, path, method, body, version });
}
async function check(name, action) {
  console.log(`Checking ${name}`);
  try { await action(); report.checks.push({ name, status: 'PASS' }); }
  catch (e) { report.checks.push({ name, status: 'FAIL', reason: String(e.message).replaceAll(secrets.IDENTITY_FIXTURE_PASSWORD, '[REDACTED]') }); }
}
async function idle(allowError = false) {
  await page.waitForFunction(() => !document.querySelector('.travel-status')?.textContent?.includes('Đang xử lý'), { timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), { timeout: 30_000 });
    if (!allowError) assert.equal(await page.getByRole('alert').count(), 0, `Unexpected visible API error: ${await page.getByRole('alert').allTextContents()}`);
}
async function section(name, allowError = false) {
  await page.getByRole('navigation').getByRole('button', { name, exact: true }).click();
  await page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
  await idle(allowError);
}
async function panelResponsive(name) {
  for (const width of [320, 390, 768, 1280]) {
    await check(`${width}px ${name} expanded panel overflow`, async () => {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal panel overflow');
    });
  }
}
async function openAccount(role) {
  if (page) await page.context().close();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await context.newPage();
  page.on('pageerror', () => errors.push('Uncaught browser exception'));
  page.on('requestfailed', request => {
    if (new URL(request.url()).hostname.endsWith('openstreetmap.org')) report.provider_observations.push({ host: new URL(request.url()).hostname, failure: request.failure()?.errorText });
  });
  page.on('response', response => {
    if (new URL(response.url()).hostname === 'www.openstreetmap.org' && new URL(response.url()).pathname.endsWith('/embed.html')) report.provider_observations.push({ host: 'www.openstreetmap.org', http_status: response.status() });
  });
  await page.goto(`${base}/app`); await idle();
  await page.getByLabel('Email', { exact: true }).first().fill(`fixture-${role}@example.invalid`);
  const password = page.getByLabel('Mật khẩu', { exact: true });
  await password.fill(secrets.IDENTITY_FIXTURE_PASSWORD);
  // Submit the actual form with the keyboard, rather than synthesizing a session.
  await password.press('Enter');
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).waitFor(); await idle();
}
try {
  await check('isolated real Catalog review fixture', async () => {
    await openAccount('admin');
    uniquePlaceName = `P03 Browser Place ${Date.now()}`;
    const place = await api('catalog', '/admin/places', 'POST', { name: uniquePlaceName, latitude: 16.047079, longitude: 108.20623, category_ids: [], tag_ids: [], amenity_ids: [], geographic_unit_id: '10000000-0000-0000-0000-000000000002', destination_ids: [], price: 0, currency: 'VND', opening_hours: [], media_keys: [] });
    placeId = place.place_id;
    await api('catalog', `/admin/places/${placeId}/status`, 'PUT', { status: 'PUBLISHED' }, place.version);
  });
  await check('user keyboard login', () => openAccount('u1'));
  await check('keyboard skip-link focus', async () => {
    await page.goto(`${base}/app`); await idle();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Đến nội dung chính');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'travel-main', 'Skip link must focus the main content');
  });
  await check('all form controls have accessible labels', async () => {
    await section('Tài khoản');
    const missing = await page.evaluate(() => [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(el => !el.labels?.length && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')).length);
    assert.equal(missing, 0);
  });
  for (const width of [320, 390, 768, 1280]) {
    for (const name of ['Khám phá', 'Gợi ý', 'Bộ sưu tập', 'Chuyến đi', 'Thông báo', 'Tài khoản']) {
      await check(`${width}px ${name} overflow`, async () => {
        await page.setViewportSize({ width, height: 900 }); await section(name);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Horizontal page overflow');
      });
    }
  }
  await check('real empty search state', async () => {
    await section('Khám phá');
    await page.getByLabel('Tìm địa điểm', { exact: true }).fill(`p03-no-place-${Date.now()}`);
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click(); await idle();
    await page.getByText('Chưa có dữ liệu hiển thị.', { exact: true }).waitFor();
  });
  await check('real loading state and disabled submit', async () => {
    // Delay the genuine request only; no response is mocked or replaced.
    await page.route('**/api/catalog/**', async route => { await new Promise(resolveDelay => setTimeout(resolveDelay, 350)); await route.continue(); });
    try {
      await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click();
      await page.getByText('Đang xử lý…', { exact: true }).waitFor();
      assert.ok(await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).isDisabled());
      await idle();
    } finally { await page.unroute('**/api/catalog/**'); }
  });
  await check('user denied real admin request with visible error', async () => {
    await section('Quản trị', true);
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /FORBIDDEN|ACCESS_DENIED|403/);
  });
  await check('real map coordinates and interactive provider', async () => {
    await section('Bản đồ');
    const responsePromise = page.waitForResponse(response => /\/api\/catalog\/api\/v1\/places\/[0-9a-f-]+$/.test(new URL(response.url()).pathname) && response.ok());
    await page.getByRole('button', { name: 'Xem vị trí', exact: true }).first().click();
    const place = await (await responsePromise).json();
    await idle();
    assert.ok(Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
    const fallback = await page.getByRole('link', { name: 'Mở vị trí trên OpenStreetMap', exact: true }).getAttribute('href');
    assert.ok(fallback.includes(`mlat=${place.latitude}`) && fallback.includes(`mlon=${place.longitude}`));
    report.checks.push({ name: 'map coordinates and provider fallback link', status: 'PASS' });
    await page.getByRole('button', { name: 'Xem bản đồ trực tuyến', exact: true }).click();
    const frame = page.frameLocator('iframe[title^="Bản đồ "]');
    const zoom = frame.getByRole('button', { name: 'Zoom In', exact: true });
    await zoom.waitFor({ timeout: 20_000 });
    await zoom.click();
    await page.getByRole('link', { name: '© OpenStreetMap contributors', exact: true }).waitFor();
    await panelResponsive('Bản đồ');
  });
  await check('user submits genuine pending review', async () => {
    await section('Khám phá');
    await page.getByLabel('Tìm địa điểm', { exact: true }).fill(uniquePlaceName);
    await page.getByRole('button', { name: 'Tìm kiếm', exact: true }).click(); await idle();
    await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).first().click(); await idle();
    reviewText = `P03 kiểm duyệt ${Date.now()}`;
    await page.getByLabel('Nội dung', { exact: true }).fill(reviewText);
    await page.getByRole('button', { name: 'Gửi đánh giá', exact: true }).click(); await idle();
    await page.getByText('Đánh giá đã gửi; chờ kiểm duyệt.', { exact: true }).waitFor();
  });
  await check('business login and denied admin request', async () => {
    await openAccount('business'); await section('Quản trị', true);
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /FORBIDDEN|ACCESS_DENIED|403/);
  });
  await check('business creation, membership and pending claim', async () => {
    assert.ok(placeId, 'Real Catalog place fixture required');
    await section('Doanh nghiệp');
    const name = `P03 business ${Date.now()}`; businessName = name;
    await page.getByLabel('Tên doanh nghiệp', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Tạo doanh nghiệp', exact: true }).click(); await idle();
    await page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) }).getByRole('button', { name: 'Quản lý doanh nghiệp', exact: true }).click(); await idle();
    await page.getByRole('heading', { name: 'Thành viên', exact: true }).waitFor();
    await panelResponsive('Doanh nghiệp');
    await page.getByLabel('Minh chứng xác minh (mỗi dòng một mã)', { exact: true }).fill('private/p03-verification');
    const verificationResponse = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/verification') && response.ok());
    await page.getByRole('button', { name: 'Gửi hồ sơ xác minh', exact: true }).click();
    const verification = await (await verificationResponse).json(); await idle();
    const verificationLabel = page.getByText(`Hồ sơ ${verification.request_id} · Trạng thái PENDING`, { exact: true });
    await verificationLabel.waitFor();
    await api('catalog', '/businesses', 'POST', { name: `${businessName} selection` });
    await page.getByRole('button', { name: 'Tải lại doanh nghiệp', exact: true }).click(); await idle();
    const otherBusiness = page.locator('article').filter({ hasNot: page.getByRole('heading', { name: businessName, exact: true }) }).first();
    assert.ok(await otherBusiness.count(), 'Second isolated business required for selection regression');
    await otherBusiness.getByRole('button', { name: 'Quản lý doanh nghiệp', exact: true }).click(); await idle();
    assert.equal(await verificationLabel.count(), 0, 'Previous verification must not appear under a different business');
    report.checks.push({ name: 'business selection clears previous verification state', status: 'PASS' });
    await openAccount('admin');
    await section('Kiểm duyệt');
    await page.getByText('Xét duyệt hồ sơ xác minh doanh nghiệp', { exact: true }).click();
    await panelResponsive('Kiểm duyệt');
    await page.getByLabel('Mã hồ sơ xác minh', { exact: true }).fill(verification.request_id);
    await page.getByLabel('Phiên bản hồ sơ', { exact: true }).fill(String(verification.version));
    await page.getByLabel('Lý do xác minh', { exact: true }).fill('P03 synthetic verification exercise');
    await page.getByRole('button', { name: 'Lưu quyết định xác minh', exact: true }).click(); await idle();
    await openAccount('business'); await section('Doanh nghiệp');
    await page.locator('article').filter({ has: page.getByRole('heading', { name: businessName, exact: true }) }).getByRole('button', { name: 'Quản lý doanh nghiệp', exact: true }).click(); await idle();
    await page.getByLabel('Mã địa điểm cần quản lý', { exact: true }).fill(placeId);
    await page.getByLabel('Minh chứng đã tải lên (mỗi dòng một mã)', { exact: true }).fill('private/p03-synthetic-evidence');
    await page.getByRole('button', { name: 'Gửi yêu cầu quản lý', exact: true }).click(); await idle();
    await page.getByText(/Trạng thái PENDING/).waitFor();
    await page.getByText('Đã gửi yêu cầu; quyền quản lý chỉ có sau khi được duyệt.', { exact: true }).waitFor();
  });
  await check('admin source and model navigation', async () => {
    await openAccount('admin'); await section('Quản trị');
    await page.getByLabel(/^Loại dữ liệu/).selectOption('models'); await idle();
    await page.getByLabel(/^Loại dữ liệu/).selectOption('sources'); await idle();
  });
  await check('async import messaging preserves pending acknowledgement', async () => {
    const name = `P03 browser source ${Date.now()}`;
    await api('ingestion', '/admin/data-sources', 'POST', { name, uri: `http://source-sandbox:8080/records?run=${Date.now()}`, secret_reference: 'none', license_version: 'synthetic-p02-v1', allow_storage: true, allow_training: true });
    await page.getByRole('button', { name: 'Tải lại', exact: true }).click(); await idle();
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
    for (let attempt = 0; !await card.count() && attempt < 30; attempt++) {
      const more = page.getByRole('button', { name: 'Xem thêm', exact: true });
      if (!await more.count()) break;
      await more.click(); await idle();
    }
    assert.ok(await card.count(), 'Real source fixture required');
    await card.getByRole('button', { name: 'Xem chi tiết', exact: true }).click(); await idle();
    await page.getByRole('heading', { name: 'Nhập dữ liệu từ nguồn', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Bắt đầu nhập dữ liệu', exact: true }).click(); await idle();
    await page.getByText('Job nhập đã được tiếp nhận. Tải lại trạng thái để xem kết quả.', { exact: true }).waitFor();
    await page.getByText(/Job: .* · (QUEUED|PENDING|RUNNING|SUCCEEDED|PARTIAL|FAILED|CANCELLED)/).waitFor();
    await page.getByRole('button', { name: 'Tải lại trạng thái job', exact: true }).click(); await idle();
  });
  await check('admin real pending review moderation and place list', async () => {
    assert.ok(reviewText, 'Real submitted review required');
    await section('Kiểm duyệt');
    const card = page.locator('article').filter({ has: page.getByRole('heading', { name: reviewText, exact: true }) });
    await card.getByLabel(/^Quyết định/).selectOption('APPROVE');
    await card.getByLabel('Lý do quyết định', { exact: true }).fill('P03 synthetic browser moderation exercise');
    await card.getByRole('button', { name: 'Lưu quyết định kiểm duyệt', exact: true }).click(); await idle();
    assert.equal(await card.count(), 0, 'Approved review leaves the pending moderation queue');
    const reviews = await api('community', `/places/${placeId}/reviews`);
    assert.ok(reviews.items.some(review => review.content === reviewText && review.status === 'APPROVED'));
    await page.getByLabel(/^Nội dung kiểm duyệt/).selectOption('places'); await idle();
    assert.ok(await page.locator('article').count());
  });
  const links = await page.locator('nav').innerText();
  if (!/Bản đồ/.test(links)) report.gaps.push('No map navigation or interactive map screen');
  if (!/Doanh nghiệp/.test(links)) report.gaps.push('No business membership/claim screen');
  if (!/Kiểm duyệt/.test(links)) report.gaps.push('No review moderation/admin place screen');
  await check('no uncaught browser exceptions', async () => assert.deepEqual(errors, []));
} catch (e) {
  report.checks.push({ name: 'browser execution', status: 'FAIL', reason: String(e.message).replaceAll(secrets.IDENTITY_FIXTURE_PASSWORD, '[REDACTED]') });
} finally {
  await browser.close();
  mkdirSync(output, { recursive: true });
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
}
const failures = report.checks.filter(c => c.status === 'FAIL');
console.log(`P03 browser: ${report.checks.filter(c => c.status === 'PASS').length} passed, ${failures.length} failed, ${report.gaps.length} coverage gaps. Credential-free report saved locally.`);
if (failures.length || report.gaps.length) process.exitCode = 1;
