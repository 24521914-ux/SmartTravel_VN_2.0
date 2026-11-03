import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadP02Secrets } from './p02-secrets.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const secrets = loadP02Secrets();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const browserErrors = [];
page.on('pageerror', e => browserErrors.push(e.message));
page.on('requestfailed', request => console.error('Browser request failed:', new URL(request.url()).pathname, request.failure()?.errorText));
page.on('response', response => { if(response.status()>=400)console.error('Browser HTTP:',response.status(),new URL(response.url()).pathname); });
const waitIdle = async () => {
  await page.waitForFunction(() => !document.querySelector('.travel-status')?.textContent?.includes('Đang xử lý'), { timeout: 30_000 });
  const alert = page.locator('[role=alert]');
  const error = await alert.count() ? await alert.textContent() : '';
  assert.equal(error, '', error);
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
  await waitIdle();
}
try {
  await page.goto(`${process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173'}/kham-pha`);
  await waitIdle();
  await navigate('Tài khoản');
  await page.getByLabel('Email', { exact: true }).first().fill(process.env.P02_USER_EMAIL ?? 'fixture-u1@example.invalid');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.P02_USER_PASSWORD ?? secrets.IDENTITY_FIXTURE_PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).waitFor();
  await waitIdle();
  await navigate('Khám phá');
  await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).first().click();
  await waitIdle();
  await page.getByRole('heading', { name: 'Đánh giá', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Lưu yêu thích', exact: true }).click(); await waitIdle();
  await navigate('Gợi ý');
  await page.getByRole('button', { name: 'Xem chi tiết', exact: true }).first().click(); await waitIdle();
  await page.getByRole('button', { name: 'Dùng gợi ý trong lịch trình', exact: true }).click(); await waitIdle();
  await navigate('Bộ sưu tập');
  const suffix = Date.now();
  await page.getByLabel('Tên bộ sưu tập', { exact: true }).fill(`Browser smoke ${suffix}`);
  await page.getByRole('button', { name: 'Tạo bộ sưu tập', exact: true }).click(); await waitIdle();
  await page.getByRole('heading', { name: `Browser smoke ${suffix}`, exact: true }).waitFor();
  await navigate('Chuyến đi');
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill(`Browser journey ${suffix}`);
  await page.getByLabel('Ngày bắt đầu', { exact: true }).fill('2026-12-01');
  await page.getByLabel('Ngày kết thúc', { exact: true }).fill('2026-12-02');
  await page.getByLabel('Ngân sách (VND)', { exact: true }).fill('2000000');
  await page.getByRole('button', { name: 'Tạo chuyến đi', exact: true }).click(); await waitIdle();
  const card = page.locator('article').filter({ has: page.getByRole('heading', { name: `Browser journey ${suffix}`, exact: true }) });
  await card.getByRole('button', { name: 'Xem chi tiết' }).click(); await waitIdle();
  await page.getByLabel('Ngày tham quan', { exact: true }).fill('2026-12-01');
  await page.getByRole('button', { name: 'Thêm ngày', exact: true }).click(); await waitIdle();
  await page.getByRole('button', { name: '2026-12-01', exact: true }).click(); await waitIdle();
  await page.getByRole('heading', { name: 'Địa điểm ngày 2026-12-01', exact: true }).waitFor();
  await page.getByLabel('Ghi chú', { exact: true }).fill('Recommended browser visit');
  await page.getByRole('button', { name: 'Thêm địa điểm vào ngày', exact: true }).click(); await waitIdle();
  await page.getByRole('button', { name: 'Khóa địa điểm', exact: true }).click(); await waitIdle();
  await page.getByRole('button', { name: 'Mở khóa địa điểm', exact: true }).click(); await waitIdle();
  await navigate('Thông báo'); await navigate('Tài khoản');
  await page.getByLabel('Tên hiển thị mới', { exact: true }).fill('Integration browser traveler');
  await page.getByRole('button', { name: 'Lưu hồ sơ', exact: true }).click(); await waitIdle();
  await page.getByRole('button', { name: 'Lưu quyền riêng tư', exact: true }).click(); await waitIdle();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Mobile viewport must not overflow');
  const output = resolve(root, '../backend/infra/.local/p02/frontend-browser'); mkdirSync(output, { recursive: true });
  await page.screenshot({ path: resolve(output, 'mobile-account.png'), fullPage: true });
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).waitFor();
  assert.deepEqual(browserErrors, []);
  console.log('PASS real browser: login, catalog detail/favorite, recommendation attribution, collection/trip/day/item creation, item lock/unlock, notifications, profile/consent, mobile overflow, logout');
} catch (e) { console.error(`FAIL browser smoke: ${e.message}`); process.exitCode = 1; }
finally { await browser.close(); }
