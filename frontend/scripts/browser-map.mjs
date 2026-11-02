import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, expect as baseExpect } from '@playwright/test';

const base = process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const expect = baseExpect.configure({ timeout: 20000 });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
let checks = 0, createdId;
const pass = name => { checks++; console.log(`PASS ${name}`); };
const output = new URL('../../backend/infra/.local/p03/frontend-map-browser/', import.meta.url);
mkdirSync(output, { recursive: true });
const feature = { type: 'Feature', geometry: { type: 'Point', coordinates: [108.2278968, 16.0611682] }, properties: { osm_type: 'W', osm_id: 123, name: 'Cầu Rồng', street: 'Đường Võ Văn Kiệt', city: 'Đà Nẵng', country: 'Việt Nam', countrycode: 'VN' } };
async function api(method, path, body, version) {
  return page.evaluate(async ({ method, path, body, version }) => {
    const { travelClient } = await import('/src/api/session.ts');
    return method === 'GET' ? travelClient.read('catalog', path) : travelClient.mutate('catalog', path, body, method, version);
  }, { method, path, body, version });
}
try {
  let lookupRequests = 0, mode = 'normal';
  await page.route('https://photon.komoot.io/**', async route => {
    lookupRequests++;
    if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 700));
    if (mode === 'failure') return route.fulfill({ status: 429, json: {} });
    return route.fulfill({ json: { features: mode === 'empty' ? [] : [feature, { ...feature, properties: { ...feature.properties, countrycode: 'US' } }, { ...feature, geometry: { coordinates: [999, 999] } }] } });
  });
  await page.goto(`${base}/ban-do`);
  await expect(page.locator('.map-place').first()).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
  assert.equal(await page.locator('iframe').count(), 0);
  assert.equal(lookupRequests, 0);
  pass('real Gateway records render markers without iframe or automatic geocoding');
  await expect.poll(() => page.locator('.leaflet-tile-loaded').count(), { timeout: 30000 }).toBeGreaterThan(0);
  pass('real map provider tiles load in the browser');
  const second = page.locator('.map-place').nth(1);
  const secondName = await second.locator('h3').innerText();
  await second.getByRole('button', { name: 'Xem vị trí' }).click();
  await expect(page.locator('.map-preview h2')).toHaveText(`Vị trí: ${secondName}`);
  await expect(page.locator('.leaflet-popup-content strong')).toHaveText(secondName);
  pass('list selection moves the map and opens the matching marker popup');
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('.map-preview').scrollIntoViewIfNeeded();
    await page.screenshot({ path: fileURLToPath(new URL(`map-${width}.png`, output)), fullPage: true });
  }
  pass('map layout fits mobile tablet and desktop');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const query = page.getByRole('searchbox', { name: 'Tìm tên địa điểm hoặc địa chỉ' });
  const lookup = page.getByRole('button', { name: 'Tra địa chỉ trên bản đồ', exact: true });
  await query.fill('Cầu Rồng, Đà Nẵng'); await lookup.click();
  const results = page.getByRole('region', { name: 'Kết quả tra cứu địa chỉ' });
  await expect(results.locator('.location-candidates button')).toHaveCount(1);
  await results.locator('button').click();
  await expect(page.locator('.map-preview h2')).toHaveText('Vị trí: Cầu Rồng');
  await expect(page.locator('.map-preview-header')).toContainText('Đường Võ Văn Kiệt, Đà Nẵng, Việt Nam');
  const before = lookupRequests;
  await lookup.click(); await expect(results.locator('button')).toHaveCount(1);
  assert.equal(lookupRequests, before);
  pass('explicit lookup rejects invalid/non-Vietnam coordinates and caches repeated searches');
  mode = 'failure'; await query.fill('Địa chỉ dịch vụ bận'); await lookup.click();
  await expect(page.getByRole('status').filter({ hasText: 'Dịch vụ tra địa chỉ đang bận' })).toBeVisible();
  mode = 'empty'; await query.fill('Địa chỉ chưa có dữ liệu'); await lookup.click();
  await expect(page.getByRole('status').filter({ hasText: 'Không tìm thấy địa chỉ tại Việt Nam' })).toBeVisible();
  mode = 'slow'; await query.fill('Truy vấn sẽ bị thay đổi'); await lookup.click();
  await query.fill('Truy vấn mới'); await page.waitForTimeout(1800);
  await expect(results).toHaveCount(0);
  pass('provider errors empty results and stale lookup responses are handled');
  mode = 'normal';

  const credentials = JSON.parse(readFileSync(new URL('../../backend/infra/.local/p02/secrets.json', import.meta.url), 'utf8'));
  await page.goto(`${base}/tai-khoan`);
  await page.getByLabel('Email', { exact: true }).fill('fixture-admin@example.invalid');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(credentials.IDENTITY_FIXTURE_PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống', exact: true }).waitFor();
  const units = await api('GET', '/geographic-units?limit=100');
  const geo = units.items.find(row => row.name === 'Đà Nẵng') ?? units.items[0];
  assert.ok(geo);
  const name = `P03 map address ${Date.now()}`;
  const created = await api('POST', '/admin/places', { name, address: 'Địa chỉ cần xác định', latitude: 16.06, longitude: 108.22, geographic_unit_id: geo.id ?? geo.geographic_unit_id, category_ids: [], tag_ids: [], amenity_ids: [], media_keys: [] });
  createdId = created.place_id ?? created.id;
  await page.goto(`${base}/quan-tri`);
  const catalog = page.getByRole('region', { name: 'Quản lý danh mục du lịch', exact: true });
  await catalog.getByLabel('Nhóm dữ liệu').selectOption('places');
  await expect(catalog.getByRole('button', { name: 'Tải lại danh mục', exact: true })).toBeEnabled();
  const editButton = catalog.getByRole('button', { name: `Chi tiết / sửa ${name}`, exact: true });
  for (let i = 0; i < 100 && !await editButton.count(); i++) {
    await catalog.getByRole('button', { name: 'Xem thêm danh mục', exact: true }).click();
    await expect(catalog.getByRole('button', { name: 'Tải lại danh mục', exact: true })).toBeEnabled();
  }
  await editButton.click();
  await catalog.getByLabel('Tên hoặc địa chỉ cần tra cứu', { exact: true }).fill('Cầu Rồng Đà Nẵng quản trị');
  await catalog.getByRole('button', { name: 'Tra địa chỉ', exact: true }).click();
  await catalog.locator('.location-candidates button').click();
  await expect(catalog.getByLabel('Địa chỉ đầy đủ', { exact: true })).toHaveValue('Cầu Rồng, Đường Võ Văn Kiệt, Đà Nẵng, Việt Nam');
  const map = catalog.locator('.interactive-map');
  await map.click({ position: { x: 100, y: 100 } });
  const expectedLatitude = Number(await catalog.getByLabel('Vĩ độ', { exact: true }).inputValue());
  const expectedLongitude = Number(await catalog.getByLabel('Kinh độ', { exact: true }).inputValue());
  assert.notEqual(expectedLatitude, feature.geometry.coordinates[1]);
  await catalog.getByRole('button', { name: 'Lưu danh mục', exact: true }).click();
  await expect(catalog.getByText('Đã lưu dữ liệu.', { exact: true })).toBeVisible();
  let saved = await api('GET', `/admin/places/${createdId}`);
  assert.equal(saved.address, 'Cầu Rồng, Đường Võ Văn Kiệt, Đà Nẵng, Việt Nam');
  assert.equal(saved.latitude, expectedLatitude); assert.equal(saved.longitude, expectedLongitude);
  pass('admin lookup and manual pin adjustment persist through the real Gateway');
  await api('PUT', `/admin/places/${createdId}/status`, { status: 'PUBLISHED' }, saved.version);
  await page.goto(`${base}/ban-do`);
  await page.getByRole('searchbox').fill('duong vo van kiet');
  await page.getByRole('button', { name: 'Tìm', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.locator('.map-place').filter({ has: page.getByRole('heading', { name, exact: true }) }).getByRole('button', { name: 'Xem vị trí' }).click();
  await expect(page.locator('.map-preview-header')).toContainText('Đường Võ Văn Kiệt');
  pass('address search without accents finds the saved place and its exact map position');
  assert.deepEqual(errors, []);
  console.log(`Map browser PASS: ${checks} checks, 0 page errors; real Gateway/DB/tiles, controlled geocoder`);
} finally {
  if (createdId) {
    const current = await api('GET', `/admin/places/${createdId}`);
    await api('DELETE', `/admin/places/${createdId}`, {}, current.version);
  }
  await browser.close();
}
