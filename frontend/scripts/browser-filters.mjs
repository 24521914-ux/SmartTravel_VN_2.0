import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const base = process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const output = new URL('../../.local/filter-qa/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const failures = [], pageErrors = [];
let passed = 0;
async function check(name, test) {
  try { await test(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, message: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
const place = { place_id: 'fixture-place', name: 'Một điểm đến kiểm tra giao diện', address: 'Địa chỉ kiểm tra', version: 1 };
const longName = 'Một trải nghiệm với tên rất dài '.repeat(12);
const dataset = {
  categories: [{ category_id: 'cat-one', name: 'Thiên nhiên' }, { category_id: 'cat-test', name: 'Integration category retained' }],
  destinations: [{ destination_id: 'dest-one', name: 'Miền Trung' }],
  'geographic-units': [{ geographic_unit_id: 'geo-one', name: 'Đà Nẵng' }],
  amenities: [{ amenity_id: 'amenity-one', name: 'Wi-Fi' }, { amenity_id: 'amenity-test', name: 'Integration amenity retained' }],
  tags: [{ tag_id: 'tag-one', name: 'Phù hợp gia đình' }],
  offerings: [
    { offering_id: 'off-one', name: 'Đi bộ khám phá', price: 0, place_id: place.place_id },
    { offering_id: 'off-two', name: 'Hành trình riêng', price: null },
    { offering_id: 'off-three', name: 'Chèo thuyền', price: 60000 },
    { offering_id: 'off-long', name: longName, price: 120000 },
    { offering_id: 'off-test', name: 'P03 local activity retained', price: 20000, place_id: place.place_id },
  ],
};

try {
  const live = await browser.newPage();
  live.on('pageerror', error => pageErrors.push(error.message));
  for (const width of [375, 768, 1440, 1920]) {
    await check(`live layout ${width}`, async () => {
      await live.setViewportSize({ width, height: 1000 });
      await live.goto(`${base}/kham-pha`, { waitUntil: 'domcontentloaded' });
      await live.locator('#diem-den[aria-busy="false"]').waitFor();
      const result = await live.evaluate(() => {
        const finder = document.querySelector('.destination-finder');
        const style = getComputedStyle(finder.querySelector('select'));
        return { overflow: document.documentElement.scrollWidth > innerWidth, width: finder.getBoundingClientRect().width, height: finder.getBoundingClientRect().height, advanced: finder.querySelector('details').open, color: style.color, background: getComputedStyle(finder.querySelector('.finder-field')).backgroundColor };
      });
      assert.equal(result.overflow, false);
      assert.ok(result.width <= 1280 && result.width < width);
      assert.ok(result.height < 410, 'Initial finder should stay compact');
      assert.equal(result.advanced, false);
      assert.notEqual(result.color, result.background);
      assert.notEqual(result.background, 'rgb(255, 255, 255)');
      await live.locator('.destination-finder').scrollIntoViewIfNeeded();
      await live.screenshot({ path: fileURLToPath(new URL(`live-finder-${width}.png`, output)) });
      await live.locator('.travel-catalog').scrollIntoViewIfNeeded();
      await live.screenshot({ path: fileURLToPath(new URL(`live-catalog-${width}.png`, output)) });
    });
  }
  await check('real Gateway applies and resets filters read-only', async () => {
    await live.locator('.finder-advanced > summary').click();
    await live.getByLabel(/^Giá tối thiểu/).fill('0');
    await live.getByLabel('Đánh giá tối thiểu', { exact: true }).selectOption('0');
    const appliedResponse = live.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/catalog/api/v1/places' && url.searchParams.get('minPrice') === '0' && url.searchParams.get('minRating') === '0';
    });
    await live.getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click();
    const applied = await appliedResponse;
    assert.equal(applied.status(), 200);
    assert.ok(Array.isArray((await applied.json()).items));
    await live.locator('#diem-den[aria-busy="false"]').waitFor();
    const resetResponse = live.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/catalog/api/v1/places' && !url.searchParams.has('minPrice') && !url.searchParams.has('minRating');
    });
    await live.getByRole('button', { name: 'Đặt lại', exact: true }).click();
    assert.equal((await resetResponse).status(), 200);
    await live.locator('#diem-den[aria-busy="false"]').waitFor();
  });
  await live.close();

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => pageErrors.push(error.message));
  let mode = 'normal', catalogEmpty = false, requests = [], detailsRead = 0;
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url());
    assert.equal(route.request().method(), 'GET', 'This suite must never write API data');
    const name = url.pathname.split('/').at(-1);
    if (url.pathname.endsWith('/places')) {
      requests.push(new URLSearchParams(url.search));
      if (mode === 'error') return route.fulfill({ status: 503, json: { code: 'UNAVAILABLE', message: 'Controlled failure' } });
      const next = url.searchParams.has('cursor');
      return route.fulfill({ json: { items: mode === 'empty' ? [] : [next ? { ...place, place_id: 'fixture-place-next', name: 'Điểm đến tiếp theo' } : place], next_cursor: mode === 'empty' || next ? null : 'cursor-next' } });
    }
    if (url.pathname.endsWith(`/places/${place.place_id}`)) { detailsRead++; return route.fulfill({ json: place }); }
    return route.fulfill({ json: { items: catalogEmpty && ['amenities', 'tags', 'offerings'].includes(name) ? [] : dataset[name] ?? [] } });
  });
  const open = async () => { await page.goto(`${base}/kham-pha`, { waitUntil: 'domcontentloaded' }); await page.locator('#diem-den[aria-busy="false"]').waitFor(); };
  const idle = async () => { await page.locator('#diem-den[aria-busy="false"]').waitFor(); };
  const apply = async () => { await page.getByRole('button', { name: 'Áp dụng bộ lọc', exact: true }).click(); await idle(); };
  const latest = () => Object.fromEntries(requests.at(-1));
  await open();

  await check('all filter parameters reach API together', async () => {
    await page.locator('#destination-search').fill('  Hội An  ');
    await page.getByLabel('Vùng điểm đến', { exact: true }).selectOption('dest-one');
    await page.getByLabel('Tỉnh thành', { exact: true }).selectOption('geo-one');
    await page.locator('.finder-advanced > summary').click();
    await page.getByLabel(/^Giá tối thiểu/).fill('100');
    await page.getByLabel(/^Giá tối đa/).fill('200000');
    await page.getByLabel('Đánh giá tối thiểu', { exact: true }).selectOption('4.5');
    await page.getByLabel('Vĩ độ', { exact: true }).fill('16.0471');
    await page.getByLabel('Kinh độ', { exact: true }).fill('108.2068');
    await page.getByLabel('Bán kính (m)', { exact: true }).fill('5000');
    await apply();
    assert.deepEqual(latest(), { limit: '12', q: 'Hội An', destinationId: 'dest-one', geographicUnitId: 'geo-one', minPrice: '100', maxPrice: '200000', minRating: '4.5', lat: '16.0471', lon: '108.2068', radiusM: '5000' });
  });
  await check('category retains applied filters', async () => {
    await page.getByRole('button', { name: 'Thiên nhiên', exact: true }).click(); await idle();
    assert.equal(latest().categoryId, 'cat-one'); assert.equal(latest().q, 'Hội An'); assert.equal(latest().minPrice, '100'); assert.equal(latest().radiusM, '5000');
  });
  await check('pagination retains applied category and filters', async () => {
    await page.getByRole('button', { name: 'Xem thêm điểm đến', exact: true }).click(); await idle();
    assert.equal(latest().cursor, 'cursor-next'); assert.equal(latest().categoryId, 'cat-one'); assert.equal(latest().geographicUnitId, 'geo-one');
    await expect(page.getByRole('heading', { name: 'Điểm đến tiếp theo', exact: true }).first()).toBeVisible();
  });
  await check('reset removes all criteria and category', async () => {
    await page.getByRole('button', { name: 'Đặt lại', exact: true }).click(); await idle();
    assert.deepEqual(latest(), { limit: '12' });
    await expect(page.locator('#destination-search')).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Tất cả', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
  await check('Enter submits search', async () => {
    await page.locator('#destination-search').fill('Đà Nẵng');
    await page.locator('#destination-search').press('Enter'); await idle();
    assert.equal(latest().q, 'Đà Nẵng');
  });
  await check('invalid price range blocks request when advanced closed', async () => {
    if (!await page.locator('.finder-advanced').getAttribute('open').then(v => v !== null)) await page.locator('.finder-advanced > summary').click();
    await page.getByLabel(/^Giá tối thiểu/).fill('200'); await page.getByLabel(/^Giá tối đa/).fill('100');
    await page.locator('.finder-advanced > summary').click();
    const before = requests.length;
    await page.getByRole('button', { name: 'Tìm điểm đến', exact: true }).click();
    assert.equal(requests.length, before);
    assert.equal(await page.getByLabel(/^Giá tối đa/).evaluate(el => el.validity.rangeUnderflow), true);
    await expect(page.getByLabel(/^Giá tối đa/)).toBeVisible();
    await expect(page.getByLabel(/^Giá tối đa/)).toBeFocused();
  });
  await check('incomplete nearby criteria block request and reveal field', async () => {
    await page.getByRole('button', { name: 'Đặt lại', exact: true }).click(); await idle();
    if (!await page.locator('.finder-advanced').getAttribute('open').then(v => v !== null)) await page.locator('.finder-advanced > summary').click();
    await page.getByLabel('Vĩ độ', { exact: true }).fill('16');
    await page.locator('.finder-advanced > summary').click();
    const before = requests.length;
    await page.getByRole('button', { name: 'Tìm điểm đến', exact: true }).click();
    assert.equal(requests.length, before);
    assert.equal(await page.getByLabel('Kinh độ', { exact: true }).evaluate(el => el.validity.valueMissing), true);
    await expect(page.getByLabel('Kinh độ', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Kinh độ', { exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'Đặt lại', exact: true }).click(); await idle();
  });
  await check('synthetic categories hidden but selectable without renaming', async () => {
    const category = page.getByRole('button', { name: 'Integration category retained', exact: true });
    await expect(category).not.toBeVisible();
    await page.locator('.explore-category-fixtures > summary').click();
    await category.click(); await idle(); assert.equal(latest().categoryId, 'cat-test');
  });
  const catalog = page.locator('.travel-catalog');
  await check('catalog amenities and original test names retained', async () => {
    await expect(catalog.getByRole('button', { name: 'Tiện ích', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(catalog.getByText('Wi-Fi', { exact: true })).toBeVisible();
    await expect(catalog.getByText('Integration amenity retained', { exact: true })).not.toBeVisible();
    await catalog.locator('details > summary').click();
    await expect(catalog.getByText('Integration amenity retained', { exact: true })).toBeVisible();
  });
  await check('catalog group switch exposes tags', async () => {
    await catalog.getByRole('button', { name: 'Thẻ địa điểm', exact: true }).click();
    await expect(catalog.getByRole('button', { name: 'Thẻ địa điểm', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(catalog.getByText('Phù hợp gia đình', { exact: true })).toBeVisible();
    assert.equal(await catalog.locator('.travel-catalog-count').nth(1).innerText(), '1');
  });
  await check('offerings distinguish zero unknown and priced values', async () => {
    await catalog.getByRole('button', { name: 'Dịch vụ và trải nghiệm', exact: true }).click();
    await expect(catalog.getByText('Miễn phí', { exact: true })).toBeVisible();
    await expect(catalog.getByText('Liên hệ để biết giá', { exact: true })).toBeVisible();
    await expect(catalog.getByText('60.000 VND', { exact: true })).toBeVisible();
    await expect(catalog.getByRole('heading', { name: 'P03 local activity retained', exact: true })).not.toBeVisible();
  });
  await check('long catalog names wrap on mobile', async () => {
    await page.setViewportSize({ width: 375, height: 900 });
    await expect(catalog.getByRole('heading', { name: longName.trim(), exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await catalog.scrollIntoViewIfNeeded();
    await page.screenshot({ path: fileURLToPath(new URL('mock-long-offerings.png', output)) });
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('offering action reads source place and shows detail', async () => {
    await catalog.locator('.travel-catalog-offering').filter({ has: page.getByRole('heading', { name: 'Đi bộ khám phá', exact: true }) }).getByRole('button').click();
    await expect(page.getByRole('heading', { name: place.name, exact: true }).first()).toBeVisible();
    assert.equal(detailsRead, 1);
    await page.getByRole('button', { name: 'Quay lại danh sách', exact: true }).click(); await idle();
  });
  await check('empty catalog groups have explicit states', async () => {
    catalogEmpty = true; await open();
    for (const [tab, text] of [['Tiện ích', 'Chưa có tiện ích để hiển thị.'], ['Thẻ địa điểm', 'Chưa có thẻ địa điểm để hiển thị.'], ['Dịch vụ và trải nghiệm', 'Chưa có dịch vụ và trải nghiệm để hiển thị.']]) {
      await catalog.getByRole('button', { name: tab, exact: true }).click(); await expect(catalog.getByText(text, { exact: true })).toBeVisible();
    }
  });
  await check('empty search state', async () => {
    mode = 'empty'; await page.locator('#destination-search').fill('Không có kết quả'); await page.locator('#destination-search').press('Enter'); await idle();
    await expect(page.getByRole('heading', { name: 'Chưa tìm thấy điểm đến', exact: true })).toBeVisible();
  });
  await check('API error and retry preserve query', async () => {
    mode = 'error'; await page.locator('#destination-search').fill('Truy vấn bị lỗi'); await page.locator('#destination-search').press('Enter'); await idle();
    await expect(page.getByRole('heading', { name: 'Chưa tải được dữ liệu', exact: true })).toBeVisible();
    mode = 'normal'; await page.getByRole('button', { name: 'Thử lại', exact: true }).click(); await idle();
    assert.equal(latest().q, 'Truy vấn bị lỗi');
    await expect(page.getByRole('heading', { name: place.name, exact: true }).first()).toBeVisible();
  });
  await check('zero uncaught browser errors', async () => assert.deepEqual(pageErrors, []));
  await page.close();
  console.log(JSON.stringify({ suite: 'browser-filters', passed, failed: failures.length, errors: pageErrors.length, skipped: 0, node: process.version, chromium: await browser.version(), environment: 'Vite; live read-only layout + controlled API fixtures for behavior' }));
  assert.equal(failures.length, 0, 'Filter/catalog regression suite failed');
} finally { await browser.close(); }
