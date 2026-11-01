import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

// Read-only browser checks against Vite and the real local Gateway.
const origin = process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const routes = [
  ['/kham-pha', 'Khám phá'],
  ['/ban-do', 'Bản đồ'],
  ['/bo-suu-tap', 'Bộ sưu tập'],
  ['/chuyen-di', 'Chuyến đi'],
  ['/thong-bao', 'Thông báo'],
  ['/tai-khoan', 'Tài khoản'],
  ['/doanh-nghiep', 'Doanh nghiệp'],
  ['/kiem-duyet', 'Kiểm duyệt'],
  ['/quan-tri', 'Quản trị'],
  ['/dong-gop', 'Đóng góp'],
];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
const failures = [];
let passed = 0;
page.on('pageerror', error => pageErrors.push(error.message));

async function check(name, test) {
  try {
    await test();
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push({ name, message: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function screen(path, label) {
  await expect(page).toHaveURL(url => url.pathname === path);
  if (label === 'Khám phá') {
    await expect(page.locator('main #journey-title')).toBeVisible();
  } else {
    await expect(page.locator('main').getByRole('heading', { name: label, exact: true, level: 1 })).toBeVisible();
  }
}

async function goto(path) {
  const response = await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
  assert.equal(response?.status(), 200, 'Server must return the SPA entry point for a deep link');
}

async function select(label) {
  await page.locator('.liquid-nav-primary').getByRole('button', { name: label, exact: true }).click();
}

try {
  for (const [path, label] of routes) {
    await check(`direct load ${path}`, async () => {
      await goto(path);
      await screen(path, label);
    });
    await check(`reload ${path}`, async () => {
      await goto(path);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await screen(path, label);
    });
  }

  for (const alias of ['/', '/app']) {
    await check(`legacy entry ${alias}`, async () => {
      await goto(alias);
      await screen('/kham-pha', 'Khám phá');
      assert.equal(new URL(page.url()).hash, '');
    });
    await check(`query survives ${alias} redirect`, async () => {
      await goto(`${alias}?source=route-test`);
      await screen('/kham-pha', 'Khám phá');
      assert.equal(new URL(page.url()).search, '?source=route-test');
    });
  }

  for (const [path, label] of routes) {
    await check(`legacy hash ${label}`, async () => {
      await goto(`/app#/${encodeURIComponent(label)}`);
      await screen(path, label);
      assert.equal(new URL(page.url()).hash, '');
    });
  }

  await check('bare legacy hash remains compatible', async () => {
    await goto(`/app#${encodeURIComponent('Bản đồ')}`);
    await screen('/ban-do', 'Bản đồ');
    assert.equal(new URL(page.url()).hash, '');
  });

  await check('trailing slash canonicalization preserves query and anchor', async () => {
    await goto('/ban-do/?source=route-test#main-content');
    await screen('/ban-do', 'Bản đồ');
    assert.equal(new URL(page.url()).search, '?source=route-test');
    assert.equal(new URL(page.url()).hash, '#main-content');
  });

  await check('legacy redirect replaces rather than adds history', async () => {
    await goto('/kham-pha');
    await screen('/kham-pha', 'Khám phá');
    const before = await page.evaluate(() => history.length);
    await goto(`/app#/${encodeURIComponent('Bản đồ')}`);
    await screen('/ban-do', 'Bản đồ');
    assert.equal(await page.evaluate(() => history.length), before + 1);
    await page.goBack();
    await screen('/kham-pha', 'Khám phá');
  });

  await check('query survives legacy hash redirect', async () => {
    await goto(`/app?source=route-test#/${encodeURIComponent('Bản đồ')}`);
    await screen('/ban-do', 'Bản đồ');
    assert.equal(new URL(page.url()).search, '?source=route-test');
    assert.equal(new URL(page.url()).hash, '');
  });

  await check('menu navigation and browser Back/Forward', async () => {
    await goto('/kham-pha');
    await screen('/kham-pha', 'Khám phá');
    await select('Bản đồ');
    await screen('/ban-do', 'Bản đồ');
    await select('Chuyến đi');
    await screen('/chuyen-di', 'Chuyến đi');
    await page.goBack();
    await screen('/ban-do', 'Bản đồ');
    await page.goBack();
    await screen('/kham-pha', 'Khám phá');
    await page.goForward();
    await screen('/ban-do', 'Bản đồ');
    await page.goForward();
    await screen('/chuyen-di', 'Chuyến đi');
  });

  await check('reselecting a screen does not add history', async () => {
    await goto('/kham-pha');
    await screen('/kham-pha', 'Khám phá');
    await select('Bản đồ');
    await screen('/ban-do', 'Bản đồ');
    const before = await page.evaluate(() => history.length);
    await select('Bản đồ');
    await screen('/ban-do', 'Bản đồ');
    assert.equal(await page.evaluate(() => history.length), before);
    await page.goBack();
    await screen('/kham-pha', 'Khám phá');
  });

  await check('normal navigation removes previous query and fragment', async () => {
    await goto('/kham-pha?source=route-test#main-content');
    await screen('/kham-pha', 'Khám phá');
    await select('Bản đồ');
    await screen('/ban-do', 'Bản đồ');
    assert.equal(new URL(page.url()).search, '');
    assert.equal(new URL(page.url()).hash, '');
  });

  await check('skip link preserves route and targets main content', async () => {
    await goto('/ban-do');
    await screen('/ban-do', 'Bản đồ');
    await page.locator('.skip-link').focus();
    await page.keyboard.press('Enter');
    await screen('/ban-do', 'Bản đồ');
    assert.equal(new URL(page.url()).hash, '#main-content');
    await expect(page.locator('#main-content')).toBeFocused();
  });

  await check('unknown path shows 404 and can recover', async () => {
    await goto('/khong-co-trang-nay');
    await expect(page.getByRole('heading', { name: 'Không tìm thấy trang', exact: true, level: 1 })).toBeVisible();
    assert.equal(new URL(page.url()).pathname, '/khong-co-trang-nay');
    await page.getByRole('button', { name: 'Về trang khám phá', exact: true }).click();
    await screen('/kham-pha', 'Khám phá');
  });

  await check('malformed legacy escape does not crash', async () => {
    await goto('/app#/%E0%A4%A');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('main h1')).toBeVisible();
  });

  await check('zero uncaught browser errors', async () => {
    assert.deepEqual(pageErrors, []);
  });

  console.log(JSON.stringify({
    suite: 'browser-routing',
    passed,
    failed: failures.length,
    errors: pageErrors.length,
    skipped: 0,
    browser: await browser.version(),
    node: process.version,
    environment: 'local Vite, real Gateway; anonymous, read-only, no mocks',
  }));
  assert.equal(failures.length, 0, 'Routing browser suite failed');
} finally {
  await browser.close();
}
