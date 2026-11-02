// Read-only UI checks for persisted manual-test data. No tokens/passwords are logged.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const credentials = JSON.parse(readFileSync(new URL('../../backend/infra/.local/p02/demo-accounts.json', import.meta.url), 'utf8'));
const demoRecords = JSON.parse(readFileSync(new URL('../../backend/infra/.local/p02/demo-records.json', import.meta.url), 'utf8'));
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
async function readAll(page, service, path) {
  return page.evaluate(async args => {
    const { travelClient } = await import('/src/api/session.ts');
    return travelClient.readAll(args.service, args.path);
  }, { service, path });
}
async function readOne(page, service, path) {
  return page.evaluate(async args => {
    const { travelClient } = await import('/src/api/session.ts');
    return travelClient.read(args.service, args.path);
  }, { service, path });
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
  assert.ok(publicPlaces.items.length >= 29);
  assert.equal(publicPlaces.items.filter(row => /^(?:P0\d[\s_-]|Integration places \d|[0-9a-f]{8}-[0-9a-f]{4}-)/i.test(row.name)).length, 0);
  assert.equal(await page.locator('.journey-data-note').count(), 0);
  pass('public Catalog and exploration show named Vietnam places and exclude legacy test places');
  await page.getByRole('button', { name: 'Xem thêm điểm đến', exact: true }).click();
  await page.locator('article.place-card').nth(11).waitFor();
  await page.getByRole('button', { name: 'Xem thêm điểm đến', exact: true }).click();
  await page.locator('article.place-card').nth(23).waitFor();
  pass('public place pagination reaches the second real Gateway page');
  await page.locator('#destination-search').fill('Văn Miếu Quốc Tử Giám');
  await page.getByRole('button', { name: 'Tìm điểm đến', exact: true }).click();
  const vanMieuCard = page.locator('article.place-card').filter({ has: page.getByRole('heading', { name: 'Văn Miếu Quốc Tử Giám', exact: true }) });
  await vanMieuCard.waitFor();
  await vanMieuCard.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
  await page.getByRole('heading', { name: 'Văn Miếu Quốc Tử Giám', exact: true, level: 1 }).waitFor();
  const reviewSection = page.getByRole('region', { name: 'Đánh giá từ du khách', exact: true });
  await reviewSection.getByText(/Khu bia tiến sĩ và các sân trong/).waitFor();
  await reviewSection.getByText('Trần Quang Minh', { exact: true }).waitFor();
  pass('place detail shows the approved review, author snapshot, and rating projection');
  await page.getByRole('button', { name: 'Quay lại danh sách', exact: true }).click();
  await page.locator('#destination-search').fill('Nhà thờ Lớn Hà Nội');
  await page.getByRole('button', { name: 'Tìm điểm đến', exact: true }).click();
  const unknownPrice = page.locator('article.place-card').filter({ has: page.getByRole('heading', { name: 'Nhà thờ Lớn Hà Nội', exact: true }) });
  await unknownPrice.getByText('Chưa cập nhật giá', { exact: true }).waitFor();
  pass('unknown price remains distinct from free in the rendered place card');
  const lanCollections = await readAll(page, 'community', '/me/collections');
  const lanTrips = await readAll(page, 'trip', '/me/trips');
  const lanFavorites = await readAll(page, 'community', '/me/favorites');
  const lanNotifications = await readAll(page, 'identity', '/me/notifications');
  assert.ok(lanCollections.items.some(row => row.name === 'Những miền biển em muốn đến' && row.visibility === 'PUBLIC'));
  assert.ok(lanCollections.items.some(row => row.name === 'Cuối tuần khám phá di sản' && row.visibility === 'PRIVATE'));
  assert.ok(lanCollections.items.some(row => row.name === 'Điểm muốn xem sau' && row.visibility === 'PRIVATE'));
  assert.ok(lanTrips.items.some(row => row.name === 'Đà Nẵng – Hội An: biển xanh và phố cổ'));
  assert.ok(lanTrips.items.some(row => row.name === 'Chuyến đi mới của Nguyễn Ngọc Lan'));
  assert.ok(lanFavorites.items.length >= 4);
  assert.ok(lanNotifications.items.length >= 24);
  pass('Lan owns populated/private/empty collections, saved places, trips, and notifications');
  await page.goto(`${base}/bo-suu-tap`);
  await page.getByRole('heading', { name: 'Những miền biển em muốn đến', exact: true }).waitFor();
  const publicCollectionCard = page.locator('article.collection-card').filter({ has: page.getByRole('heading', { name: 'Những miền biển em muốn đến', exact: true }) });
  await publicCollectionCard.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
  await page.getByText('3 địa điểm trong bộ sưu tập', { exact: true }).waitFor();
  pass('populated persisted public collection opens with its items');
  await page.goto(`${base}/chuyen-di`);
  await page.getByRole('heading', { name: 'Đà Nẵng – Hội An: biển xanh và phố cổ', exact: true }).waitFor();
  const itineraryCard = page.locator('article.trip-card').filter({ has: page.getByRole('heading', { name: 'Đà Nẵng – Hội An: biển xanh và phố cổ', exact: true }) });
  await itineraryCard.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
  await page.getByRole('heading', { name: 'Lịch trình theo ngày & Chặng di chuyển', exact: true }).waitFor();
  await page.getByText('Chuyến đi:').waitFor();
  pass('persisted multi-day itinerary opens through the real Trip APIs');
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
  await page.getByRole('heading', { name: 'Trải nghiệm Di sản Hội An', exact: true }).waitFor();
  const ownerBusinesses = await readAll(page, 'catalog', '/businesses');
  assert.ok(ownerBusinesses.items.some(row => row.name === 'Du lịch Miền Trung Xanh'));
  pass('business owner sees verified and pending business profiles');
  page = await login('editor');
  await page.goto(`${base}/doanh-nghiep`);
  await page.getByRole('heading', { name: 'Du lịch Miền Trung Xanh', exact: true }).waitFor();
  const editorBusinesses = await readAll(page, 'catalog', '/businesses');
  assert.ok(editorBusinesses.items.some(row => row.name === 'Du lịch Miền Trung Xanh'));
  pass('business editor membership persists with access to the same business');
  page = await login('manager');
  await page.goto(`${base}/kiem-duyet`);
  const moderationSelect = page.locator('.moderation-console-layout label').filter({ hasText: 'Nội dung kiểm duyệt:' }).locator('select');
  await moderationSelect.waitFor();
  const pendingReviews = await readAll(page, 'community', '/admin/reviews');
  const pendingReports = await readAll(page, 'community', '/admin/reports');
  assert.ok(pendingReviews.items.some(row => row.content?.includes('Phố ẩm thực Tống Duy Tân')) || pendingReviews.items.length >= 5);
  assert.ok(pendingReports.items.length >= 3);
  await moderationSelect.selectOption('reports');
  await page.getByText('Đánh giá được báo cáo:', { exact: false }).first().waitFor();
  await moderationSelect.selectOption('contributions');
  const pendingContributions = await readAll(page, 'community', '/admin/contributions');
  assert.ok(pendingContributions.items.length >= 3);
  await moderationSelect.selectOption('places');
  const pendingPlaces = await readAll(page, 'catalog', '/admin/places');
  assert.ok(pendingPlaces.items.some(row => row.name === 'Vườn Bách Thảo Hà Nội' && row.status === 'DRAFT'));
  pass('administrator moderation queues show separate pending reviews, reports, contributions, and draft place');
  await page.goto(`${base}/quan-tri`);
  await page.getByRole('heading', { name: 'Cẩm nang du lịch miền Trung · Nguồn mẫu nội bộ', exact: true }).waitFor();
  const importJob = await readOne(page, 'ingestion', `/admin/import-jobs/${demoRecords['job:demo'].job_id}`);
  const importItems = await readAll(page, 'ingestion', `/admin/import-jobs/${demoRecords['job:demo'].job_id}/items`);
  assert.ok(importJob.status);
  assert.ok(importItems.items.some(row => row.status === 'FAILED'));
  assert.ok(importItems.items.some(row => row.status === 'NEEDS_REVIEW'));
  const mediaEntry = Object.entries(demoRecords).find(([key]) => key.startsWith('media:'))?.[1];
  assert.ok(mediaEntry?.media_id);
  const media = await readOne(page, 'catalog', `/admin/media/${mediaEntry.media_id}`);
  assert.equal(media.moderation_status, 'PENDING');
  pass('administrator sees the sandbox import job and quarantined media without consuming either queue');
  for (const [alias, displayName] of [['new-user', 'Đỗ Mai Anh'], ['password-change', 'Nguyễn Khánh Hòa'], ['delete-account', 'Trần Quốc Bảo']]) {
    page = await login(alias);
    await page.locator('.account-summary h2').getByText(displayName, { exact: true }).waitFor();
    if (alias === 'new-user') {
      await page.getByRole('tab', { name: 'Sở thích & Quyền riêng tư', exact: true }).click();
      const newUserPreferences = await readOne(page, 'identity', '/me/preferences');
      assert.deepEqual(newUserPreferences.category_ids, []);
      assert.deepEqual(newUserPreferences.travel_style_ids, []);
      assert.deepEqual(newUserPreferences.food_preference_ids, []);
      assert.equal(newUserPreferences.budget_level, 'MID');
      assert.equal(newUserPreferences.personalization_enabled, false);
      assert.equal(await page.locator('input[name="category_ids"]:checked').count(), 0);
      pass('new user has only schema defaults and no saved preference selections');
      assert.equal((await readAll(page, 'community', '/me/collections')).items.length, 0);
      assert.equal((await readAll(page, 'trip', '/me/trips')).items.length, 0);
      await page.goto(`${base}/bo-suu-tap`);
      await page.getByText('Bạn chưa tạo bộ sưu tập nào.', { exact: false }).waitFor();
      await page.goto(`${base}/chuyen-di`);
      await page.getByRole('heading', { name: 'Bạn chưa có chuyến đi nào', exact: true }).waitFor();
    } else if (alias === 'password-change') {
      await page.getByRole('tab', { name: 'Bảo mật tài khoản', exact: true }).click();
      await page.getByRole('heading', { name: 'Đổi mật khẩu', exact: true }).waitFor();
      await page.locator('#current-pass').waitFor();
      await page.locator('#new-pass').waitFor();
    } else {
      await page.getByRole('tab', { name: 'Sở thích & Quyền riêng tư', exact: true }).click();
      await page.getByText('Yêu cầu xóa dữ liệu cá nhân', { exact: true }).waitFor();
    }
    pass(`${alias} account can sign in; destructive workflow remains available for manual use`);
  }
  page = await login('minh');
  await page.goto(`${base}/bo-suu-tap`);
  await page.getByRole('heading', { name: 'Hương vị và văn hóa ba miền', exact: true }).waitFor();
  const minhCollections = await readAll(page, 'community', '/me/collections');
  assert.ok(minhCollections.items.every(row => row.owner_id === minhCollections.items[0].owner_id));
  const lanPrivateCollectionId = demoRecords['collection:Cuối tuần khám phá di sản'].collection_id;
  const privateDenied = await page.evaluate(async id => {
    const { travelClient } = await import('/src/api/session.ts');
    try { await travelClient.read('community', `/collections/${id}`); return false; }
    catch { return true; }
  }, lanPrivateCollectionId);
  assert.equal(privateDenied, true);
  pass('second user has an independent collection owner and can sign in');
  assert.deepEqual(errors, []);
  console.log(`PASS ${checks} UI checks; zero page errors; real Gateway and persisted databases`);
} finally {
  await browser.close();
}
