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
const chooseFilterOption = async (page, label, option) => {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
};
async function check(name, test) {
  try { await test(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, message: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
async function assertTextContrast(page, selectors) {
  const results = await page.locator(selectors).evaluateAll(async elements => {
    await Promise.all(elements.flatMap(element => element.getAnimations().map(animation => animation.finished.catch(() => {}))));
    const rgba = value => value.match(/[\d.]+/g).map(Number);
    const blend = (front, back) => front.slice(0, 3).map((channel, i) => channel * (front[3] ?? 1) + back[i] * (1 - (front[3] ?? 1)));
    const luminance = rgb => rgb.map(channel => {
      const s = channel / 255;
      return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
    }).reduce((sum, channel, i) => sum + channel * [.2126, .7152, .0722][i], 0);
    return elements.map(element => {
      const ancestors = [];
      for (let node = element; node; node = node.parentElement) ancestors.unshift(node);
      const background = ancestors.reduce((color, node) => blend(rgba(getComputedStyle(node).backgroundColor), color), [255, 255, 255]);
      const foreground = blend(rgba(getComputedStyle(element).color), background);
      const a = luminance(foreground), b = luminance(background);
      return { text: element.textContent.trim().slice(0, 80), ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05) };
    });
  });
  assert.ok(results.length >= 6, 'Expected real headings, descriptions, links and branding to be checked');
  for (const result of results) assert.ok(result.ratio >= 4.5, `Unreadable text "${result.text}": ${result.ratio.toFixed(2)}:1 (minimum 4.5:1)`);
}
const place = { place_id: 'fixture-place', name: 'Một điểm đến kiểm tra giao diện', address: 'Địa chỉ kiểm tra', version: 1 };
const longName = 'Một trải nghiệm với tên rất dài '.repeat(12);
const dataset = {
  categories: [{ category_id: 'cat-one', name: 'Thiên nhiên' }, { category_id: 'cat-test', name: 'Integration category retained' }],
  destinations: [
    { destination_id: 'dest-one', name: 'Hội An', geographic_unit_ids: ['geo-hoian'] },
    { destination_id: 'dest-coast', name: 'Ven biển', geographic_unit_ids: ['geo-beach'] },
    { destination_id: 'dest-dalat', name: 'Đà Lạt', geographic_unit_ids: ['geo-dalat'] },
    { destination_id: 'dest-wide', name: 'Toàn tỉnh', geographic_unit_ids: ['geo-one'] },
    { destination_id: 'dest-spanning', name: 'Liên tỉnh', geographic_unit_ids: ['geo-hoian', 'geo-dalat'] },
    { destination_id: 'dest-unknown', name: 'Không có phạm vi', geographic_unit_ids: ['missing-geo'] },
  ],
  'geographic-units': [
    { id: 'geo-country', name: 'Việt Nam', level: 'COUNTRY', parent_id: null },
    { id: 'geo-one', name: 'Đà Nẵng', level: 'PROVINCE', parent_id: 'geo-country' },
    { id: 'geo-two', name: 'Lâm Đồng', level: 'PROVINCE', parent_id: 'geo-country' },
    { id: 'geo-three', name: 'Hà Nội', level: 'PROVINCE', parent_id: 'geo-country' },
    { id: 'geo-hoian', name: 'Hội An', level: 'DISTRICT', parent_id: 'geo-one' },
    { id: 'geo-coast', name: 'Sơn Trà', level: 'DISTRICT', parent_id: 'geo-one' },
    { id: 'geo-beach', name: 'Bờ biển', level: 'WARD', parent_id: 'geo-coast' },
    { id: 'geo-dalat', name: 'Đà Lạt', level: 'DISTRICT', parent_id: 'geo-two' },
  ],
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
        const style = getComputedStyle(finder.querySelector('.rounded-select-trigger'));
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
      assert.equal(await live.locator('.travel-catalog').count(), 0);
    });
  }
  await check('rounded selectors have a rounded popup and keyboard navigation', async () => {
    await live.goto(`${base}/kham-pha`, { waitUntil: 'domcontentloaded' });
    await live.locator('#diem-den[aria-busy="false"]').waitFor();
    const combo = live.getByRole('combobox', { name: 'Tỉnh thành', exact: true });
    await combo.press('ArrowDown');
    await expect(live.getByRole('option').first()).toBeFocused();
    const radius = await live.locator('.rounded-select-popover').evaluate(element => getComputedStyle(element).borderTopLeftRadius);
    assert.ok(parseFloat(radius) >= 12, `Expected rounded popup corners, received ${radius}`);
    await live.keyboard.press('Escape');
    await expect(combo).toHaveAttribute('aria-expanded', 'false');
    await expect(combo).toBeFocused();
  });
  await check('destinations remain on a horizontally scrollable row', async () => {
    const track = live.locator('.journey-destinations').first();
    const dimensions = await track.evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, cards: element.children.length }));
    assert.ok(dimensions.cards > 1, 'Expected multiple destination cards');
    assert.ok(dimensions.scrollWidth > dimensions.width, 'Expected horizontal overflow for the carousel');
    const before = await track.evaluate(element => element.scrollLeft);
    await live.getByRole('button', { name: 'Cuộn sang phải', exact: true }).click();
    await expect.poll(() => track.evaluate(element => element.scrollLeft)).toBeGreaterThan(before);
  });
  await check('destination spotlight bounds its images and thumbnail selection works', async () => {
    const spotlight = live.locator('.cinematic-showcase');
    await expect(spotlight).toBeVisible();
    for (const width of [375, 768, 1440, 1920]) {
      await live.setViewportSize({ width, height: 1000 });
      await spotlight.scrollIntoViewIfNeeded();
      const layout = await spotlight.evaluate(section => {
        const bounds = section.getBoundingClientRect();
        const background = section.querySelector('.showcase-images').getBoundingClientRect();
        const options = section.querySelector('.showcase-options').getBoundingClientRect();
        return {
          height: bounds.height,
          backgroundHeight: background.height,
          optionsBottom: options.bottom - bounds.top,
          overflow: document.documentElement.scrollWidth > innerWidth,
          thumbnails: [...section.querySelectorAll('.showcase-options img')].map(img => ({ width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height })),
        };
      });
      assert.ok(layout.height <= 900, `Spotlight grows beyond its intended frame at ${width}px: ${layout.height}px`);
      assert.ok(Math.abs(layout.backgroundHeight - layout.height) < 2);
      assert.ok(layout.optionsBottom <= layout.height, 'Thumbnail row escapes the spotlight');
      assert.equal(layout.overflow, false);
      assert.ok(layout.thumbnails.length > 1, 'Expected selectable destination thumbnails');
      for (const image of layout.thumbnails) assert.ok(image.width <= 80 && image.height <= 80, `Unbounded thumbnail: ${JSON.stringify(image)}`);
      if (width === 375 || width === 1440) await live.screenshot({ path: fileURLToPath(new URL(`live-spotlight-${width}.png`, output)), animations: 'disabled' });
    }
    const option = spotlight.locator('.showcase-options > button').nth(1);
    const title = (await option.locator('span').innerText()).replace(/^\d+\s*·\s*/, '');
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(spotlight.locator('.showcase-copy h2')).toHaveText(title);
    await expect(spotlight.locator('.showcase-images img.is-active')).toHaveCount(1);
  });
  await check('real Gateway applies and resets filters read-only', async () => {
    await live.locator('.finder-advanced > summary').click();
    await live.getByLabel(/^Giá tối thiểu/).fill('0');
    await chooseFilterOption(live, 'Đánh giá tối thiểu', '0 sao trở lên');
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
  await check('real Gateway narrows a province to a smaller tourism area', async () => {
    const area = live.getByRole('combobox', { name: 'Khu vực du lịch', exact: true });
    await expect(area).toBeDisabled();
    await chooseFilterOption(live, 'Tỉnh thành', 'Đà Nẵng');
    const provinceResponse = live.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/catalog/api/v1/places' && url.searchParams.has('geographicUnitId') && !url.searchParams.has('destinationId');
    });
    await live.getByRole('button', { name: 'Tìm điểm đến', exact: true }).click();
    const provinceResult = await provinceResponse;
    assert.equal(provinceResult.status(), 200);
    const provincePlaces = (await provinceResult.json()).items;
    await live.locator('#diem-den[aria-busy="false"]').waitFor();
    await chooseFilterOption(live, 'Khu vực du lịch', 'Hội An');
    const areaResponse = live.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/catalog/api/v1/places' && url.searchParams.has('geographicUnitId') && url.searchParams.has('destinationId');
    });
    await live.getByRole('button', { name: 'Tìm điểm đến', exact: true }).click();
    const areaResult = await areaResponse;
    assert.equal(areaResult.status(), 200);
    const areaPlaces = (await areaResult.json()).items;
    assert.ok(areaPlaces.length > 0 && areaPlaces.length < provincePlaces.length, 'A travel area must narrow the province result');
    assert.ok(areaPlaces.every(place => provincePlaces.some(parent => parent.place_id === place.place_id)));
    const areaId = new URL(areaResult.url()).searchParams.get('destinationId');
    assert.ok(areaPlaces.every(place => place.destination_ids.includes(areaId)));
    await live.locator('#diem-den[aria-busy="false"]').waitFor();
    await live.locator('.destination-finder').scrollIntoViewIfNeeded();
    await live.screenshot({ path: fileURLToPath(new URL('live-hierarchical-filters.png', output)), animations: 'disabled' });
    await live.getByRole('button', { name: 'Đặt lại', exact: true }).click();
    await live.locator('#diem-den[aria-busy="false"]').waitFor();
    await expect(area).toBeDisabled();
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

  await check('theme and locale toggles update the whole app shell', async () => {
    const html = page.locator('html');
    assert.equal(await html.getAttribute('data-theme'), 'dark');
    assert.equal(await html.getAttribute('lang'), 'vi');
    await page.getByRole('button', { name: 'Chuyển sang giao diện sáng', exact: true }).click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => page.locator('.journey-destinations .place-card').first().locator('.destination-detail').evaluate(button => getComputedStyle(button).backgroundColor)).toBe('rgb(243, 211, 77)');
    const cardStyle = await page.locator('.journey-destinations .place-card').first().evaluate(card => {
      const detail = card.querySelector('.destination-detail');
      const price = card.querySelector('.destination-price strong');
      const theme = getComputedStyle(document.documentElement);
      return {
        cardBackground: getComputedStyle(card).backgroundColor,
        cardRadius: getComputedStyle(card).borderTopLeftRadius,
        landingBackground: getComputedStyle(document.querySelector('.travel-landing')).backgroundColor,
        detailBackground: getComputedStyle(detail).backgroundColor,
        detailRadius: getComputedStyle(detail).borderTopLeftRadius,
        priceColor: getComputedStyle(price).color,
        actionToken: theme.getPropertyValue('--color-action').trim(),
        priceToken: theme.getPropertyValue('--color-price').trim(),
      };
    });
    assert.equal(cardStyle.cardBackground, 'rgb(255, 255, 255)');
    assert.equal(cardStyle.landingBackground, 'rgb(245, 247, 251)');
    assert.ok(parseFloat(cardStyle.cardRadius) >= 16, `Expected a rounded white place card, received ${cardStyle.cardRadius}`);
    assert.equal(cardStyle.detailBackground, 'rgb(243, 211, 77)');
    assert.ok(parseFloat(cardStyle.detailRadius) >= 10, `Expected a framed detail action, received ${cardStyle.detailRadius}`);
    assert.notEqual(cardStyle.priceColor, cardStyle.detailBackground);
    assert.equal(cardStyle.actionToken, '#f3d34d');
    assert.equal(cardStyle.priceToken, '#214fc4');
    await page.locator('.journey-destinations').first().scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator('.journey-destinations .place-card').first().evaluate(card => card.getAnimations().every(animation => animation.playState === 'finished'))).toBe(true);
    await page.screenshot({ path: fileURLToPath(new URL('light-theme-destinations.png', output)) });
    await page.getByRole('button', { name: 'Switch language to English', exact: true }).click();
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('button', { name: 'Search places', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
    await page.getByRole('button', { name: 'Chuyển ngôn ngữ sang Tiếng Việt', exact: true }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(html).toHaveAttribute('lang', 'vi');
  });

  await check('plain-surface text stays readable in light and dark themes', async () => {
    const selectors = '.brand-badge span:first-child, .journey-section-heading h2, .journey-section-heading h2 em, .journey-section-heading p, .journey-section-heading .journey-text-button, .editorial-lead-copy h3, .editorial-lead-copy p, .editorial-support-copy h3, .editorial-support-copy p, .editorial-location-label, .journey-data-note';
    await page.locator('#diem-den').scrollIntoViewIfNeeded();
    await expect(page.locator('.liquid-glass-header')).toHaveClass(/is-scrolled/);
    await assertTextContrast(page, selectors);
    await page.locator('.preference-theme').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await assertTextContrast(page, selectors);
    await page.screenshot({ path: fileURLToPath(new URL('light-theme-contrast.png', output)), animations: 'disabled' });
    await page.locator('.preference-theme').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  await check('province selection gates smaller travel areas and clears stale children', async () => {
    const province = page.getByRole('combobox', { name: 'Tỉnh thành', exact: true });
    const area = page.getByRole('combobox', { name: 'Khu vực du lịch', exact: true });
    await expect(area).toBeDisabled();
    await expect(area).toContainText('Chọn tỉnh thành trước');
    await province.click();
    await expect(page.getByRole('option', { name: 'Việt Nam', exact: true })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Hội An', exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Đà Nẵng', exact: true }).click();
    await area.click();
    await expect(page.getByRole('option', { name: 'Hội An', exact: true })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Ven biển', exact: true })).toBeVisible();
    for (const name of ['Đà Lạt', 'Toàn tỉnh', 'Liên tỉnh', 'Không có phạm vi']) await expect(page.getByRole('option', { name, exact: true })).toHaveCount(0);
    await page.getByRole('option', { name: 'Hội An', exact: true }).click();
    await chooseFilterOption(page, 'Tỉnh thành', 'Lâm Đồng');
    await expect(area).toContainText('Tất cả khu vực');
    await area.click();
    await expect(page.getByRole('option', { name: 'Hội An', exact: true })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Đà Lạt', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Tìm điểm đến', exact: true }).click(); await idle();
    assert.equal(latest().geographicUnitId, 'geo-two');
    assert.equal(latest().destinationId, undefined);
    await chooseFilterOption(page, 'Tỉnh thành', 'Hà Nội');
    await expect(area).toBeDisabled();
    await expect(area).toContainText('Chưa có khu vực');
    await chooseFilterOption(page, 'Tỉnh thành', 'Tất cả tỉnh thành');
    await expect(area).toBeDisabled();
    await page.getByRole('button', { name: 'Đặt lại', exact: true }).click(); await idle();
  });

  await check('all filter parameters reach API together', async () => {
    await page.locator('#destination-search').fill('  Hội An  ');
    await chooseFilterOption(page, 'Tỉnh thành', 'Đà Nẵng');
    await chooseFilterOption(page, 'Khu vực du lịch', 'Hội An');
    await page.locator('.finder-advanced > summary').click();
    await page.getByLabel(/^Giá tối thiểu/).fill('100');
    await page.getByLabel(/^Giá tối đa/).fill('200000');
    await chooseFilterOption(page, 'Đánh giá tối thiểu', '4,5 sao trở lên');
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
  await check('travel catalog and its test data are absent from explore UI', async () => {
    await expect(page.locator('.travel-catalog')).toHaveCount(0);
    await expect(page.getByText('Integration amenity retained', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Phù hợp gia đình', { exact: true })).toHaveCount(0);
  });  await check('empty search state', async () => {
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
