// Read-only UI checks for persisted manual-test data. No tokens/passwords are logged.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const credentials = JSON.parse(readFileSync(new URL('../../backend/infra/.local/p02/demo-accounts.json', import.meta.url), 'utf8'));
const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch();
let context;
const errors = [];
let checks = 0;
const pass = name => { checks++; console.log(`PASS ${name}`); };
async function login(alias) {
  if (context) await context.close();
  context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const account = credentials.accounts.find(a => a.alias === alias);
  await page.goto(`${base}/tai-khoan`);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(credentials.password);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống', exact: true }).waitFor();
  return page;
}
try {
  context = await browser.newContext();
  const guest = await context.newPage();
  let guestTripRequests = 0;
  guest.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/trip/')) guestTripRequests++;
  });
  await guest.goto(`${base}/chuyen-di`);
  await guest.getByRole('heading', { name: 'Vui lòng đăng nhập để xem chuyến đi', exact: true }).waitFor();
  assert.equal(await guest.getByRole('heading', { name: 'Chưa tải được dữ liệu', exact: true }).count(), 0);
  await guest.getByRole('region', { name: 'Đăng nhập để xem chuyến đi', exact: true }).getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await guest.waitForURL(`${base}/tai-khoan`);
  assert.equal(guestTripRequests, 0);
  pass('guest sees login prompt and account link without private Trip requests');
  let page = await login('lan');
  pass('demo user can log in through the real form');
  await page.goto(`${base}/kham-pha`);
  await page.getByRole('button', { name: 'Biển và đảo', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^Integration categories / }).count(), 0);
  pass('Vietnamese categories replace screenshot machine names');
  const response = await page.request.get(`${base}/api/catalog/api/v1/places?limit=100`);
  assert.equal(response.status(), 200);
  const publicPlaces = await response.json();
  assert.ok(publicPlaces.items.length >= 28);
  assert.equal(publicPlaces.items.filter(row => /^(?:P0\d[\s_-]|Integration places \d|[0-9a-f]{8}-[0-9a-f]{4}-)/i.test(row.name)).length, 0);
  assert.equal(await page.locator('.journey-data-note').count(), 0);
  pass('public Catalog and exploration exclude legacy test places');
  await page.goto(`${base}/bo-suu-tap`);
  await page.getByRole('heading', { name: 'Những miền biển em muốn đến', exact: true }).waitFor();
  pass('populated persisted collection appears');
  await page.goto(`${base}/chuyen-di`);
  await page.getByRole('heading', { name: 'Đà Nẵng – Hội An: biển xanh và phố cổ', exact: true }).waitFor();
  pass('persisted itinerary appears');
  await page.route('**/api/trip/api/v1/me/trips*', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'SERVICE_UNAVAILABLE', message: 'Trip temporarily unavailable' }),
  }));
  await page.reload();
  await page.getByRole('heading', { name: 'Chưa tải được dữ liệu', exact: true }).waitFor();
  assert.equal(await page.getByRole('heading', { name: 'Vui lòng đăng nhập để xem chuyến đi', exact: true }).count(), 0);
  await page.unroute('**/api/trip/api/v1/me/trips*');
  pass('authenticated Trip service error retains the data error state');
  await page.goto(`${base}/thong-bao`);
  await page.getByRole('heading', { name: /^Cẩm nang mẫu · / }).first().waitFor();
  pass('persisted named notifications appear');
  page = await login('business');
  await page.goto(`${base}/doanh-nghiep`);
  await page.getByRole('heading', { name: 'Du lịch Miền Trung Xanh', exact: true }).waitFor();
  pass('business owner sees the named business');
  page = await login('editor');
  await page.goto(`${base}/doanh-nghiep`);
  await page.getByRole('heading', { name: 'Du lịch Miền Trung Xanh', exact: true }).waitFor();
  pass('business editor membership persists');
  page = await login('manager');
  await page.goto(`${base}/quan-tri`);
  await page.getByRole('heading', { name: 'Cẩm nang du lịch miền Trung · Nguồn mẫu nội bộ', exact: true }).waitFor();
  pass('administrator sees the demo ingestion source');
  assert.deepEqual(errors, []);
  console.log(`PASS ${checks} UI checks; zero page errors; real Gateway and persisted databases`);
} finally {
  await browser.close();
}
