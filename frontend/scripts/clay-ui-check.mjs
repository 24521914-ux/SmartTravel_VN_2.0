import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.env.CLAY_TEST_URL ?? 'http://127.0.0.1:5175';
const output = new URL('../../backend/infra/.local/clay-ui/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const checks = [];
let empty = false;
let failure = false;
const place = { id: 'place-demo', name: 'Phố cổ Hội An', description: 'Dạo phố cổ và khám phá những hương vị địa phương.', address: 'Hội An, Quảng Nam', latitude: 15.88, longitude: 108.33, status: 'ACTIVE', version: 1 };
const trip = { id: 'trip-demo', trip_id: 'trip-demo', name: 'Cuối tuần ở Hội An', start_date: '2026-12-01', end_date: '2026-12-03', version: 1, status: 'DRAFT' };
const business = { id: 'business-demo', name: 'Trải nghiệm Hội An', status: 'ACTIVE', version: 1 };
const collection = { id: 'collection-demo', name: 'Những nơi muốn ghé', visibility: 'PRIVATE' };
page.on('pageerror', e => errors.push(e.message));
await page.route(url => url.pathname.startsWith('/api/'), async route => {
  const path = new URL(route.request().url()).pathname;
  if (failure) return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Dịch vụ tạm thời chưa khả dụng', traceId: 'synthetic-ui', fieldErrors: [] } });
  let body = { items: [], next_cursor: null };
  if (path.endsWith('/me')) body = { id: 'synthetic-user', display_name: 'Người khám phá', email: 'traveler@example.invalid' };
  else if (path.endsWith('/me/preferences')) body = { interests: [], budget_level: 'MEDIUM' };
  else if (empty) body = { items: [], next_cursor: null };
  else if (path.endsWith('/places/place-demo')) body = place;
  else if (path.endsWith('/places')) body = { items: [place], next_cursor: null };
  else if (path.endsWith('/me/trips')) body = { items: [trip] };
  else if (path.endsWith('/trips/trip-demo')) body = trip;
  else if (path.endsWith('/days')) body = { items: [{ id: 'day-demo', date: '2026-12-01' }] };
  else if (path.endsWith('/me/collections')) body = { items: [collection] };
  else if (path.endsWith('/me/collections/collection-demo')) body = collection;
  else if (path.endsWith('/me/notifications')) body = { items: [{ id: 'notification-demo', title: 'Lịch trình đã được cập nhật', body: 'Bạn có thể xem lại chuyến đi của mình.' }] };
  else if (path.endsWith('/businesses/business-demo')) body = business;
  else if (path.endsWith('/admin/reviews')) body = { items: [{ id: 'review-demo', title: 'Một trải nghiệm đáng nhớ', status: 'PENDING', version: 1 }] };
  else if (path.endsWith('/businesses')) body = { items: [{ id: 'business-demo', name: 'Trải nghiệm Hội An', status: 'ACTIVE', version: 1 }] };
  else if (path.endsWith('/admin/data-sources')) body = { items: [{ id: 'source-demo', name: 'Nguồn dữ liệu địa điểm', status: 'ACTIVE' }] };
  return route.fulfill({ status: 200, json: body });
});
const idle = () => page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
async function navigate(section) {
  const nav = page.getByRole('navigation', { name: 'Điều hướng ứng dụng' });
  const button = nav.getByRole('button', { name: section, exact: true });
  if (!await button.isVisible()) {
    const mobile = page.getByRole('button', { name: 'Mở menu', exact: true });
    if (await mobile.isVisible()) await mobile.click();
    else await nav.locator('.more-toggle').click();
  }
  await button.click();
  await page.getByRole('heading', { name: section, exact: true, level: 1 }).waitFor();
  await idle();
}
async function capture(name) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), name + ': horizontal overflow');
  await page.screenshot({ path: fileURLToPath(new URL(name + '.png', output)), fullPage: true, animations: 'disabled' });
  checks.push(name);
  console.log('PASS ' + name);
}
try {
  await page.goto(base);
  await idle();
  await capture('guest-home-desktop');
  await navigate('Tài khoản');
  await page.getByLabel('Email', { exact: true }).first().fill('traveler@example.invalid');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('synthetic-password');
  await capture('guest-account-desktop');
  await page.setViewportSize({ width: 375, height: 812 });
  await navigate('Khám phá');
  await capture('guest-home-mobile');
  await page.getByRole('button', { name: 'Lưu Phố cổ Hội An', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Bỏ lưu Phố cổ Hội An' }).getAttribute('aria-pressed'), 'true');
  await page.evaluate(() => localStorage.setItem('smarttravel.auth', JSON.stringify({ access_token: 'synthetic-ui-token', refresh_token: 'synthetic-ui-refresh', expires_in: 3600, token_type: 'Bearer' })));
  await page.reload();
  await idle();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const section of ['Khám phá', 'Bản đồ', 'Bộ sưu tập', 'Chuyến đi', 'Thông báo', 'Tài khoản', 'Doanh nghiệp', 'Kiểm duyệt', 'Quản trị']) {
      await navigate(section);
      await capture(width + '-' + section);
    }
  }
  await navigate('Chuyến đi');
  await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
  await page.getByRole('heading', { name: 'Lịch trình theo ngày & Chặng di chuyển' }).waitFor();
  await idle();
  await capture('trip-editor-desktop');
  for (const width of [375, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await navigate('Khám phá');
    await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).first().click();
    await page.getByRole('heading', { name: 'Đánh giá', exact: true }).waitFor();
    await idle(); await capture(width + '-place-detail');
    await navigate('Bộ sưu tập');
    await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
    await idle(); await capture(width + '-collection-detail');
    await navigate('Chuyến đi');
    await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
    await page.getByRole('tab', { name: '2026-12-01' }).click();
    await idle(); await capture(width + '-trip-day');
    await navigate('Bản đồ');
    await page.getByRole('button', { name: 'Xem vị trí', exact: true }).click();
    await idle(); await capture(width + '-map-detail');
    await navigate('Doanh nghiệp');
    await page.getByRole('button', { name: 'Quản lý doanh nghiệp', exact: true }).click();
    await idle();
    for (const tab of ['Hồ sơ', 'Thành viên (0)', 'Xác minh KYC', 'Yêu cầu địa điểm']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await capture(width + '-business-' + tab.replace(/[^a-zA-Z0-9]/g, '_'));
    }
  }
  await navigate('Quản trị');
  await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
  await page.getByRole('heading', { name: 'Kích hoạt nhập dữ liệu: Nguồn dữ liệu địa điểm' }).waitFor();
  await capture('admin-import-desktop');
  empty = true;
  await navigate('Thông báo');
  await page.getByRole('heading', { name: 'Bạn đã xem hết cập nhật' }).waitFor();
  await capture('notifications-empty');
  failure = true;
  await navigate('Chuyến đi');
  await page.getByRole('heading', { name: 'Chưa tải được dữ liệu' }).waitFor();
  await capture('trip-error');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
  checks.push('reduced-motion');
  assert.deepEqual(errors, []);
  checks.push('zero-browser-errors');
  writeFileSync(new URL('report.json', output), JSON.stringify({ checks, count: checks.length, dependency: 'synthetic API routes', errors }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, failed: 0, skipped: 0, output: output.href }));
} finally { await browser.close(); }
