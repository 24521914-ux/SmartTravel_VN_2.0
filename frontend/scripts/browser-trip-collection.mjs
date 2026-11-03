import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { loadP02Secrets } from './p02-secrets.mjs';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const repo = resolve(frontend, '..');
const output = resolve(repo, 'backend/infra/.local/p03/frontend-trip-collection');
mkdirSync(output, { recursive: true });
const reportFile = resolve(output, 'report.json');
const previousAttempts = existsSync(reportFile) ? JSON.parse(readFileSync(reportFile, 'utf8')).attempts ?? [] : [];
const password = loadP02Secrets().IDENTITY_FIXTURE_PASSWORD;
const base = process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
const page = await context.newPage();
page.setDefaultTimeout(25000);
const checks = [], apiResults = [], errors = [], pending = new Set();
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim();
const dirty = Boolean(spawnSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf8' }).stdout.trim());
const sourceHash = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
let failure;
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) pending.add(request); });
page.on('requestfinished', request => pending.delete(request));
page.on('requestfailed', request => pending.delete(request));
page.on('response', response => {
  const path = new URL(response.url()).pathname;
  if (path.startsWith('/api/')) apiResults.push({ method: response.request().method(), path: path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}'), status: response.status() });
});
const mark = (id, details) => { checks.push({ id, status: 'PASS', details }); console.log(`PASS trip/collection: ${id}`); };
async function idle() {
  const deadline = Date.now() + 30000;
  do { await page.waitForTimeout(100); } while (pending.size && Date.now() < deadline);
  assert.equal(pending.size, 0, 'API request did not finish');
  await page.waitForTimeout(150);
}
async function action(method, path, trigger, status = 200) {
  const responsePromise = page.waitForResponse(response => response.request().method() === method && new URL(response.url()).pathname === path);
  await trigger();
  const response = await responsePromise;
  const error = response.status() === status ? '' : await response.json().then(body => `${body.code}: ${body.message}`).catch(() => 'Invalid error response');
  assert.equal(response.status(), status, `${method} ${path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}')} unexpected HTTP status ${error}`);
  const data = status === 204 ? null : await response.json();
  await idle();
  return { data, request: response.request().postDataJSON() };
}
async function navigate(name) {
  const button = page.getByRole('navigation').getByRole('button', { name, exact: true });
  if (!await button.isVisible()) await page.locator('.more-toggle').click();
  await button.click(); await idle();
  if (name !== 'Khám phá') await page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
}
async function login(alias) {
  await navigate('Tài khoản');
  await page.getByLabel('Email', { exact: true }).first().fill(`fixture-${alias}@example.invalid`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống', exact: true }).waitFor();
  await idle();
}
async function logout() {
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống', exact: true }).click();
  await page.getByRole('banner').getByRole('button', { name: 'Đăng nhập', exact: true }).waitFor(); await idle();
}
const button = (name, scope = page) => scope.getByRole('button', { name, exact: true });
const article = name => page.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
const tripPath = id => `/api/trip/api/v1/trips/${id}`;
const communityPath = path => `/api/community/api/v1${path}`;
async function openPlace(id, name) {
  await navigate('Khám phá');
  await page.locator('#destination-search').fill(name);
  await button('Tìm điểm đến').click(); await idle();
  const fixtures = page.locator('.journey-data-note'); if (await fixtures.count()) await fixtures.locator('summary').click();
  const card = page.locator(`#diem-den article[data-place-id="${id}"]`);
  await button('Xem chi tiết', card).click(); await idle();
}

try {
  await page.goto(`${base}/kham-pha`); await idle(); await login('u1');
  const name = `P03 full browser ${Date.now()}`;
  await navigate('Chuyến đi');
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill(name);
  await page.getByLabel('Ngày bắt đầu', { exact: true }).fill('2026-12-01');
  await page.getByLabel('Ngày kết thúc', { exact: true }).fill('2026-12-04');
  await page.getByLabel('Ngân sách (VND)', { exact: true }).fill('2500000');
  const created = await action('POST', '/api/trip/api/v1/me/trips', () => button('Tạo chuyến đi').click(), 201);
  assert.equal(created.request.timezone, 'Asia/Ho_Chi_Minh'); assert.equal(created.request.currency, 'VND'); assert.equal(created.request.budget, 2500000);
  assert.equal(created.data.name, name); assert.equal(created.data.budget, 2500000);
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill(`${name} rejected`);
  await page.getByLabel('Ngày kết thúc', { exact: true }).fill('2026-11-30');
  await action('POST', '/api/trip/api/v1/me/trips', () => button('Tạo chuyến đi').click(), 422);
  assert.equal(await article(`${name} rejected`).count(), 0);
  assert.equal(await page.getByLabel('Tên chuyến đi', { exact: true }).inputValue(), `${name} rejected`);
  await page.getByLabel('Ngày kết thúc', { exact: true }).fill('2026-12-04');
  await page.getByLabel('Tên chuyến đi', { exact: true }).fill('');
  mark('trip_invalid_range_no_fake_success', 'Real backend rejects end-before-start with 422; no invented trip appears and entered name remains');
  const tripId = created.data.trip_id ?? created.data.id;
  await action('GET', tripPath(tripId), () => button('Xem chi tiết', article(name)).click());
  const studio = page.locator('.trip-studio');
  const segmentPanel = page.getByRole('region', { name: 'Chặng điểm đến', exact: true });
  const destinationOptions = await segmentPanel.locator('select[name=destination] option').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
  assert.ok(destinationOptions.length, 'Real Catalog destination required');
  await segmentPanel.locator('select[name=destination]').selectOption(destinationOptions[0]);
  const segment = await action('POST', `${tripPath(tripId)}/destinations`, () => button('Thêm chặng điểm đến', segmentPanel).click(), 201);
  const segmentId = segment.data.segment_id;
  assert.equal(segment.data.destination_id, destinationOptions[0]);
  await action('GET', `${tripPath(tripId)}/destinations/${segmentId}`, () => button('Sửa chặng điểm đến', segmentPanel).click());
  await segmentPanel.getByLabel('Đến ngày', { exact: true }).fill('2026-12-03');
  const segmentEdited = await action('PATCH', `${tripPath(tripId)}/destinations/${segmentId}`, () => button('Lưu chặng điểm đến', segmentPanel).click());
  assert.equal(segmentEdited.data.end_date, '2026-12-03');
  mark('trip_create_destination_crud', 'Trip stored exact VND budget/timezone; destination read/edit persisted within trip range');

  await page.getByLabel(/^Ngày tham quan:/).fill('2026-12-01');
  const firstDay = await action('POST', `${tripPath(tripId)}/days`, () => button('Thêm ngày').click(), 201);
  const dayId = firstDay.data.day_id;
  const itemsPath = `${tripPath(tripId)}/days/${dayId}/items`;
  await page.getByLabel(/^Ngày tham quan:/).fill('2026-12-02');
  const secondDay = await action('POST', `${tripPath(tripId)}/days`, () => button('Thêm ngày').click(), 201);
  await page.getByLabel('Đổi ngày tham quan', { exact: true }).fill('2026-12-03');
  const dayEdited = await action('PATCH', `${tripPath(tripId)}/days/${secondDay.data.day_id}`, () => button('Lưu ngày tham quan').click());
  assert.equal(dayEdited.data.date, '2026-12-03');
  await action('DELETE', `${tripPath(tripId)}/days/${secondDay.data.day_id}`, () => button('Xóa ngày tham quan').click(), 204);
  await action('GET', `${tripPath(tripId)}/days/${dayId}`, () => page.getByRole('tab', { name: '2026-12-01', exact: true }).click());
  assert.equal(await page.getByRole('tab', { name: '2026-12-03', exact: true }).count(), 0);
  mark('day_crud', 'Create two actual days; edit second date; delete it; first day persists');

  const pickerButtons = button('+ Thêm vào ngày');
  assert.ok(await pickerButtons.count() >= 2, 'Need two actual Catalog places');
  const firstItem = await action('POST', itemsPath, () => pickerButtons.nth(0).click(), 201);
  const secondItem = await action('POST', itemsPath, () => pickerButtons.nth(1).click(), 201);
  const firstItemId = firstItem.data.item_id, secondItemId = secondItem.data.item_id;
  assert.equal(firstItem.request.locked, false); assert.equal(firstItem.request.recommendation_request_id, null); assert.ok(!('start_time' in firstItem.request));
  const placeIds = [firstItem.data.place_id, secondItem.data.place_id];
  assert.notEqual(...placeIds);
  const timeline = () => page.locator('.timeline-item');
  await action('GET', `${itemsPath}/${firstItemId}`, () => button('Tải chi tiết địa điểm', timeline().nth(0)).click());
  await timeline().nth(0).getByLabel('Ghi chú địa điểm', { exact: true }).fill('Persisted browser itinerary note');
  await timeline().nth(0).getByLabel('Thời lượng (phút)', { exact: true }).fill('75');
  const itemEdited = await action('PATCH', `${itemsPath}/${firstItemId}`, () => button('Lưu địa điểm', timeline().nth(0)).click());
  assert.equal(itemEdited.data.duration_minutes, 75); assert.equal(itemEdited.data.note, 'Persisted browser itinerary note');
  await action('PATCH', `${itemsPath}/${firstItemId}`, () => button('Khóa địa điểm', timeline().nth(0)).click());
  assert.equal(await button('Xóa địa điểm', timeline().nth(0)).isDisabled(), true);
  assert.equal(await button('Xuống', timeline().nth(0)).isDisabled(), true);
  await action('PATCH', `${itemsPath}/${firstItemId}`, () => button('Mở khóa địa điểm', timeline().nth(0)).click());
  const orderResponse = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === itemsPath);
  const ordered = await action('PUT', `${itemsPath}/order`, () => button('Xuống', timeline().nth(0)).click());
  assert.deepEqual(ordered.request.item_ids, [secondItemId, firstItemId]);
  assert.deepEqual((await (await orderResponse).json()).items.map(item => item.item_id), [secondItemId, firstItemId]);
  await action('PUT', `${itemsPath}/order`, () => button('Lên', timeline().nth(1)).click());
  mark('item_crud_lock_order', 'Server ids and snapshot names; note/duration persisted; lock prevents delete/reorder; atomic order read-after-write matches');

  await page.locator('select[name=from]').selectOption(firstItemId);
  await page.locator('select[name=to]').selectOption(secondItemId);
  await page.locator('select[name=mode]').selectOption('DRIVE');
  const estimate = await action('POST', `${tripPath(tripId)}/route-estimates`, () => button('Ước tính tuyến').click());
  assert.equal(estimate.data.fallback, true); assert.equal(estimate.data.duration_seconds, null); assert.ok(estimate.data.distance_m >= 0);
  await page.getByText(/Fallback: khoảng cách đường chim bay/).waitFor();
  const transfer = await action('POST', `${tripPath(tripId)}/transfers`, () => button('Lưu chặng di chuyển').click(), 201);
  const transferId = transfer.data.transfer_id;
  await action('GET', `${tripPath(tripId)}/transfers/${transferId}`, () => button('Sửa chặng di chuyển').click());
  await page.locator('select[name=mode]').selectOption('WALK');
  const transferEdited = await action('PATCH', `${tripPath(tripId)}/transfers/${transferId}`, () => button('Lưu chặng di chuyển').click());
  assert.equal(transferEdited.data.mode, 'WALK'); assert.equal(transferEdited.data.duration_seconds, null);
  await action('DELETE', `${tripPath(tripId)}/transfers/${transferId}`, () => button('Xóa chặng di chuyển').click(), 204);
  const refreshed = await action('POST', `${tripPath(tripId)}/snapshots/refresh`, () => button('Cập nhật thông tin địa điểm').click(), 202);
  assert.equal(refreshed.data.status, 'COMPLETED'); assert.deepEqual(refreshed.request.item_ids, [firstItemId, secondItemId]);
  mark('routes_transfers_snapshot', 'Actual coordinate estimate labelled fallback with null duration; transfer create/read/update/delete and snapshot refresh acknowledged');

  const editedName = `${name} edited`;
  await page.getByLabel('Tên chuyến đi mới', { exact: true }).fill(editedName);
  await page.getByLabel('Ngân sách mới', { exact: true }).fill('1800000');
  const editedTrip = await action('PATCH', tripPath(tripId), () => button('Lưu chuyến đi').click());
  assert.equal(editedTrip.data.name, editedName); assert.equal(editedTrip.data.budget, 1800000);
  for (const state of ['PLANNED', 'COMPLETED', 'DRAFT']) {
    const changed = await action('PUT', `${tripPath(tripId)}/state`, () => page.getByLabel(/^Trạng thái chuyến đi/).selectOption(state));
    assert.equal(changed.data.state, state);
    assert.equal(await page.getByLabel(/^Trạng thái chuyến đi/).inputValue(), state);
  }
  await action('DELETE', `${itemsPath}/${secondItemId}`, () => button('Xóa địa điểm', timeline().nth(1)).click(), 204);
  assert.equal(await timeline().count(), 1);
  await action('DELETE', `${itemsPath}/${firstItemId}`, () => button('Xóa địa điểm', timeline().nth(0)).click(), 204);
  await action('DELETE', `${tripPath(tripId)}/days/${dayId}`, () => button('Xóa ngày tham quan').click(), 204);
  await action('DELETE', `${tripPath(tripId)}/destinations/${segmentId}`, () => button('Xóa chặng điểm đến', segmentPanel).click(), 204);
  await action('DELETE', tripPath(tripId), () => button('Xóa chuyến đi', article(editedName)).click(), 204);
  assert.equal(await article(editedName).count(), 0);
  mark('trip_edit_state_cleanup', 'Name/budget and all state transitions persisted; item/day/segment/trip removals confirmed by real 204 and reloaded lists');

  await navigate('Bộ sưu tập');
  const collectionName = `${name} collection`;
  await page.getByLabel('Tên bộ sưu tập', { exact: true }).fill(collectionName);
  await page.getByLabel('Chế độ hiển thị', { exact: true }).selectOption('PUBLIC');
  const collection = await action('POST', communityPath('/me/collections'), () => button('Tạo bộ sưu tập').click(), 201);
  const collectionId = collection.data.collection_id;
  await action('GET', communityPath(`/me/collections/${collectionId}`), () => button('Xem chi tiết', article(collectionName)).click());
  const detail = page.getByRole('region', { name: 'Chi tiết bộ sưu tập', exact: true });
  await detail.getByLabel('Tên mới', { exact: true }).fill(`${collectionName} edited`);
  const collectionEdited = await action('PATCH', communityPath(`/me/collections/${collectionId}`), () => button('Lưu bộ sưu tập', detail).click());
  assert.equal(collectionEdited.data.name, `${collectionName} edited`);
  await button('Tìm địa điểm', detail).click(); await idle();
  const places = await detail.getByLabel(/^Địa điểm/).locator('option').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
  assert.ok(places.length >= 2);
  const collectionItemsPath = communityPath(`/collections/${collectionId}/items`);
  const collectionItemIds = [];
  for (let index = 0; index < 2; index++) {
    await detail.getByLabel(/^Địa điểm/).selectOption(places[index]);
    await detail.getByLabel('Ghi chú', { exact: true }).fill(`Stored collection note ${index}`);
    const item = await action('POST', collectionItemsPath, () => button('Thêm địa điểm vào bộ sưu tập', detail).click(), 201);
    collectionItemIds.push(item.data.item_id); assert.equal(item.data.place_id, places[index]);
  }
  await action('GET', `${collectionItemsPath}/${collectionItemIds[0]}`, () => button('Sửa ghi chú địa điểm', detail).nth(0).click());
  await detail.getByLabel('Sửa ghi chú địa điểm', { exact: true }).fill('Edited stored collection note');
  const collectionItemEdited = await action('PATCH', `${collectionItemsPath}/${collectionItemIds[0]}`, () => button('Lưu ghi chú địa điểm', detail).click());
  assert.equal(collectionItemEdited.data.note, 'Edited stored collection note');
  const collectionOrder = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === collectionItemsPath);
  await action('PUT', `${collectionItemsPath}/order`, () => button('Xuống', detail).nth(0).click());
  assert.deepEqual((await (await collectionOrder).json()).items.map(item => item.item_id), [...collectionItemIds].reverse());
  await page.getByLabel('Mã bộ sưu tập', { exact: true }).fill(collectionId);
  const shared = await action('GET', communityPath(`/collections/${collectionId}`), () => button('Mở bộ sưu tập chia sẻ').click());
  assert.equal(shared.data.visibility, 'PUBLIC');
  mark('collection_crud_items_order_share', 'Public collection create/read/rename, actual catalog items add/read/edit/reorder, shared read returns persisted data');

  // Same browser UI with a different account proves ownership/privacy, without replacing HTTP or injecting a token.
  await logout(); await login('u2'); await navigate('Bộ sưu tập');
  await page.getByLabel('Mã bộ sưu tập', { exact: true }).fill(collectionId);
  const otherShared = await action('GET', communityPath(`/collections/${collectionId}`), () => button('Mở bộ sưu tập chia sẻ').click());
  assert.equal(otherShared.data.name, `${collectionName} edited`);
  await logout(); await login('u1'); await navigate('Bộ sưu tập');
  await button('Xem chi tiết', article(`${collectionName} edited`)).click(); await idle();
  await detail.getByLabel(/^Chế độ hiển thị/).selectOption('PRIVATE');
  await action('PATCH', communityPath(`/me/collections/${collectionId}`), () => button('Lưu bộ sưu tập', detail).click());
  await logout(); await login('u2'); await navigate('Bộ sưu tập');
  await page.getByLabel('Mã bộ sưu tập', { exact: true }).fill(collectionId);
  await action('GET', communityPath(`/collections/${collectionId}`), () => button('Mở bộ sưu tập chia sẻ').click(), 404);
  assert.equal(await page.getByRole('heading', { name: `${collectionName} edited`, exact: true }).count(), 0);
  mark('collection_private_access', 'Second authenticated user can read PUBLIC, then receives 404 after owner changes PRIVATE; no false shared content displayed');
  await logout(); await login('u1'); await navigate('Bộ sưu tập');
  await button('Xem chi tiết', article(`${collectionName} edited`)).click(); await idle();
  await action('DELETE', `${collectionItemsPath}/${collectionItemIds[1]}`, () => button('Xóa khỏi bộ sưu tập', detail).nth(0).click(), 204);
  await action('DELETE', `${collectionItemsPath}/${collectionItemIds[0]}`, () => button('Xóa khỏi bộ sưu tập', detail).nth(0).click(), 204);
  await action('DELETE', communityPath(`/me/collections/${collectionId}`), () => button('Xóa bộ sưu tập', article(`${collectionName} edited`)).click(), 204);
  assert.equal(await article(`${collectionName} edited`).count(), 0);
  mark('collection_delete', 'Delete both real items with current parent version then delete collection; lists no longer contain either');

  // One live review per user/place is a business invariant. Create an isolated
  // public place through the real administrator client instead of reusing a
  // fixture that earlier suites may already have reviewed.
  await logout(); await login('admin');
  const detailData = await page.evaluate(async () => {
    const { travelClient: travel } = await import('/src/api/session.ts');
    const anchor = (await travel.places()).items[0];
    const created = await travel.mutate('catalog', '/admin/places', { name: `P03 isolated review ${Date.now()}`, latitude: anchor.latitude, longitude: anchor.longitude, geographic_unit_id: anchor.geographic_unit_id, price: 0, currency: 'VND', category_ids: [], tag_ids: [], amenity_ids: [], destination_ids: [], opening_hours: [], media_keys: [] });
    return travel.mutate('catalog', `/admin/places/${created.place_id}/status`, { status: 'PUBLISHED' }, 'PUT', created.version);
  });
  await logout(); await login('u1');
  await openPlace(detailData.place_id, detailData.name);
  await button('Viết đánh giá').click();
  await page.getByLabel('Nội dung chia sẻ:', { exact: true }).fill('Synthetic browser pending review, not a real tourist statement.');
  const review = await action('POST', communityPath(`/places/${detailData.place_id ?? detailData.id}/reviews`), () => button('Gửi đánh giá').click(), 201);
  assert.equal(review.data.status, 'PENDING');
  const pendingReview = page.getByRole('region', { name: 'Đánh giá đang chờ kiểm duyệt', exact: true });
  const editedReviewContent = `Edited synthetic browser pending review ${name}`;
  await pendingReview.locator('textarea[name=content]').fill(editedReviewContent);
  await pendingReview.getByLabel('Số sao mới', { exact: true }).fill('4');
  const reviewId = review.data.review_id;
  const reviewEdited = await action('PATCH', communityPath(`/reviews/${reviewId}`), () => button('Lưu đánh giá', pendingReview).click());
  assert.equal(reviewEdited.data.content, editedReviewContent); assert.equal(reviewEdited.data.status, 'PENDING');
  assert.equal(await page.locator('.place-detail-container p').filter({ hasText: editedReviewContent }).count(), 0, 'Pending text must not be shown as a public approved review');
  mark('review_pending_edit', 'Pending review remains separate from approved public list; owner edits stored content/rating with optimistic version');
  await logout(); await login('admin'); await navigate('Kiểm duyệt');
  await page.getByLabel('Lý do kiểm duyệt', { exact: true }).fill(`Synthetic browser review approval ${name}`);
  await action('POST', communityPath(`/admin/reviews/${reviewId}/moderate`), () => button('Duyệt', article(editedReviewContent)).click(), 202);
  await logout(); await login('u2');
  await openPlace(detailData.place_id ?? detailData.id, detailData.name);
  const publicReview = page.locator('.place-detail-container p').filter({ hasText: editedReviewContent }).locator('..');
  await publicReview.getByLabel('Lý do báo cáo', { exact: true }).fill(`Synthetic report exercise ${name}`);
  const report = await action('POST', communityPath(`/reviews/${reviewId}/reports`), () => button('Báo cáo đánh giá', publicReview).click(), 202);
  const reportId = report.data.request_id;
  assert.ok(reportId); assert.equal(report.data.status, 'COMPLETED');
  await logout(); await login('admin'); await navigate('Kiểm duyệt');
  const reportQueueResponse = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === communityPath('/admin/reports'));
  await page.getByLabel(/^Nội dung kiểm duyệt:/).selectOption('reports'); await idle();
  const reportQueue = (await (await reportQueueResponse).json()).items;
  const reportIndex = reportQueue.findIndex(row => (row.request_id ?? row.report_id ?? row.id) === reportId);
  assert.ok(reportIndex >= 0, 'Created report must appear in real moderation queue');
  assert.equal(reportQueue[reportIndex].report_status, 'OPEN');
  assert.equal(reportQueue[reportIndex].review_id, reviewId);
  await page.getByLabel('Lý do kiểm duyệt', { exact: true }).fill(`Synthetic report resolved ${name}`);
  await action('POST', communityPath(`/admin/reports/${reportId}/moderate`), () => button('Từ chối', page.locator('.moderation-card').nth(reportIndex)).click(), 202);
  mark('review_approval_reporting_moderation', 'Admin approves synthetic review through UI; a different user reports actual approved review; admin resolves real report request_id');
  await logout(); await login('u1'); await openPlace(detailData.place_id ?? detailData.id, detailData.name);
  const ownerReview = page.locator('.place-detail-container p').filter({ hasText: editedReviewContent }).locator('..');
  await action('DELETE', communityPath(`/reviews/${reviewId}`), () => button('Xóa đánh giá', ownerReview).click(), 204);
  assert.equal(await page.getByText(editedReviewContent, { exact: true }).count(), 0);
  mark('review_delete', 'Owner deletes approved actual review using current version; server list no longer contains review content');
  assert.deepEqual(errors, []);
  await logout();
} catch (error) {
  failure = new Error(error.message.split(password).join('[REDACTED]')); process.exitCode = 1;
  console.error(`FAIL trip/collection browser: ${failure.message}`);
  await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true });
} finally {
  const unique = [...new Map(apiResults.map(result => [JSON.stringify(result), result])).values()];
  const timestamp = new Date().toISOString();
  const counts = { tests_run: checks.length + (failure ? 1 : 0), tests_passed: checks.length, tests_failed: failure ? 1 : 0, tests_skipped: 0 };
  writeFileSync(reportFile, JSON.stringify({ timestamp, suite: 'browser-trip-collection', revision, dirty, source_sha256: sourceHash, environment: 'P02 real Gateway, PostgreSQL, MongoDB, RabbitMQ; Playwright Chromium; synthetic fixture records', ...counts, checks, gaps: failure ? [failure.message] : [], attempts: [...previousAttempts, { timestamp, source_sha256: sourceHash, ...counts, failure: failure?.message ?? null }], api_request_count: apiResults.length, api_results: unique, page_errors: errors.length }, null, 2));
  await browser.close();
}
if (!failure) console.log(`PASS trip/collection browser: ${checks.length} groups; real Gateway ${apiResults.length} responses`);
