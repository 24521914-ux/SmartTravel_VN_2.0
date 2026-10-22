import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.env.EDITORIAL_TEST_URL ?? 'http://127.0.0.1:5173';
const output = new URL('../../backend/infra/.local/travel-editorial/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const checks = [];
const errors = [];
const check = (name, condition) => { assert.ok(condition, name); checks.push(name); console.log('PASS ' + name); };
try {
  // Read-only visual QA against the running gateway. No credentials or mutations.
  const live = await browser.newPage();
  live.on('pageerror', e => errors.push(e.message));
  for (const width of [375, 430, 768, 1366, 1920]) {
    await live.setViewportSize({ width, height: 900 });
    await live.goto(base);
    await live.locator('#diem-den[aria-busy="false"]').waitFor();
    await live.evaluate(() => document.fonts.ready);
    check(`live-${width}-no-overflow`, await live.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`live-${width}-editorial-images`, await live.locator('.journey-hero-photo').evaluate(img => img.complete && img.naturalWidth > 0));
    await live.screenshot({ path: fileURLToPath(new URL(`live-${width}.png`, output)), fullPage: true });
    if (width === 375) {
      await live.getByRole('button', { name: 'Mở menu', exact: true }).click();
      check('mobile-primary-vertical', await live.locator('.liquid-nav-primary').evaluate(el => getComputedStyle(el).flexDirection === 'column'));
      check('mobile-menu-no-overflow', await live.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await live.screenshot({ path: fileURLToPath(new URL('mobile-menu.png', output)), fullPage: false });
      await live.keyboard.press('Escape');
      check('mobile-escape-focus', await live.getByRole('button', { name: 'Mở menu', exact: true }).evaluate(el => el === document.activeElement));
    }
  }
  await live.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await live.setViewportSize({ width: 1440, height: 1000 });
  await live.screenshot({ path: fileURLToPath(new URL('live-dark.png', output)), fullPage: true });
  check('dark-tokens', await live.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() === '#0b1411'));
  check('reduced-motion', await live.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior === 'auto'));
  await live.close();

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => errors.push(e.message));
  let mode = 'normal';
  let lastSearch;
  let favoriteFails = false;
  const place = { place_id: 'synthetic-place-1', name: 'Điểm đến kiểm tra giao diện', description: 'Dữ liệu tổng hợp dùng riêng cho kiểm thử.', address: 'Địa chỉ tổng hợp', version: 1 };
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/places')) {
      lastSearch = url.searchParams;
      if (mode === 'error') return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Synthetic error' } });
      if (mode === 'slow') await new Promise(r => setTimeout(r, 700));
      const items = mode === 'empty' ? [] : url.searchParams.has('cursor') ? [{ ...place, place_id: 'synthetic-place-2', name: 'Điểm đến trang tiếp theo' }] : [place, { place_id: 'synthetic-fixture', name: 'P03 synthetic fixture' }];
      return route.fulfill({ json: { items, next_cursor: url.searchParams.has('cursor') ? null : 'synthetic-cursor' } });
    }
    if (url.pathname.endsWith('/categories')) return route.fulfill({ json: { items: [{ category_id: 'synthetic-category', name: 'Danh mục kiểm tra' }] } });
    if (url.pathname.endsWith('/me')) return route.fulfill({ json: { id: 'synthetic-user', display_name: 'Người dùng kiểm tra', roles: ['USER'] } });
    if (url.pathname.includes('/favorites/')) return route.fulfill({ status: favoriteFails ? 503 : 204 });
    return route.fulfill({ json: { items: [] } });
  });
  const open = async () => { await page.goto(base); await page.locator('#diem-den[aria-busy="false"]').waitFor(); };
  await open();
  check('guest-admin-hidden', await page.locator('nav').getByRole('button', { name: 'Quản trị', exact: true }).count() === 0);
  check('dropdown-hidden-by-default', !await page.locator('#additional-navigation').isVisible());
  check('no-invented-rating', (await page.locator('.destination-unrated').first().innerText()) === 'Chưa có điểm đánh giá');
  check('neutral-missing-image', await page.locator('.place-photo-missing').first().isVisible());
  check('fixture-not-marketed-as-destination', !await page.getByRole('heading', { name: 'P03 synthetic fixture', exact: true }).isVisible());
  await page.locator('.journey-data-note summary').click();
  check('fixture-original-name-preserved', await page.getByRole('heading', { name: 'P03 synthetic fixture', exact: true }).isVisible());
  await page.locator('.journey-data-note summary').click();
  await page.getByLabel('Chuyến đi tiếp theo của bạn?').fill('Hội An');
  await page.getByRole('button', { name: 'Tìm điểm đến', exact: true }).click();
  await page.locator('#diem-den[aria-busy="false"]').waitFor();
  check('search-sent-to-api', lastSearch.get('q') === 'Hội An');
  await page.getByRole('button', { name: 'Danh mục kiểm tra', exact: true }).click();
  await page.locator('#diem-den[aria-busy="false"]').waitFor();
  check('category-sent-to-api', lastSearch.get('categoryId') === 'synthetic-category');
  await page.getByRole('button', { name: 'Xem thêm điểm đến', exact: true }).click();
  await page.getByRole('heading', { name: 'Điểm đến trang tiếp theo', exact: true }).waitFor();
  check('cursor-appends-results', lastSearch.get('cursor') === 'synthetic-cursor' && await page.locator('#diem-den > .journey-destinations > .place-card').count() === 2);
  await page.screenshot({ path: fileURLToPath(new URL('synthetic-cards.png', output)), fullPage: true });
  await page.getByRole('button', { name: 'Lưu Điểm đến kiểm tra giao diện', exact: true }).click();
  await page.getByRole('heading', { name: 'Tài khoản', level: 1, exact: true }).waitFor();
  check('guest-favorite-opens-auth', page.url().includes(encodeURIComponent('Tài khoản')));
  await page.evaluate(() => localStorage.setItem('smarttravel.auth', JSON.stringify({ access_token: 'synthetic-token', refresh_token: 'synthetic-refresh', expires_in: 3600, token_type: 'Bearer' })));
  await page.goto(base + '#/Kh%C3%A1m%20ph%C3%A1');
  await page.reload();
  await page.getByRole('button', { name: 'Trang tài khoản cá nhân' }).waitFor();
  await page.locator('#diem-den[aria-busy="false"]').waitFor();
  favoriteFails = true;
  await page.getByRole('button', { name: 'Lưu Điểm đến kiểm tra giao diện', exact: true }).click();
  await page.getByText('Chưa lưu được thay đổi. Vui lòng thử lại.').waitFor();
  check('favorite-failure-retains-state', await page.getByRole('button', { name: 'Lưu Điểm đến kiểm tra giao diện', exact: true }).getAttribute('aria-pressed') === 'false');
  favoriteFails = false;
  await page.getByRole('button', { name: 'Lưu Điểm đến kiểm tra giao diện', exact: true }).click();
  await page.getByRole('button', { name: 'Bỏ lưu Điểm đến kiểm tra giao diện', exact: true }).waitFor();
  check('favorite-success-confirmed', true);
  for (const state of ['empty', 'error']) {
    mode = state; await open();
    await page.getByRole('heading', { name: state === 'empty' ? 'Chưa tìm thấy điểm đến' : 'Chưa tải được dữ liệu', exact: true }).waitFor();
    check(state + '-state', true);
    await page.screenshot({ path: fileURLToPath(new URL(state + '.png', output)), fullPage: true });
  }
  mode = 'normal';
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await page.locator('.place-card').first().waitFor(); check('error-retry', true);
  mode = 'slow';
  await page.goto(base); await page.locator('.journey-skeletons').waitFor(); check('loading-skeleton', true);
  await page.locator('#diem-den[aria-busy="false"]').waitFor();
  check('zero-pageerrors', errors.length === 0);
  writeFileSync(new URL('report.json', output), JSON.stringify({ passed: checks.length, failures: 0, errors, skipped: 0, checks, dependency: 'live read-only gateway screenshots + synthetic functional API' }, null, 2));
  console.log(JSON.stringify({ passed: checks.length, failed: 0, errors: errors.length, skipped: 0 }));
} finally { await browser.close(); }

