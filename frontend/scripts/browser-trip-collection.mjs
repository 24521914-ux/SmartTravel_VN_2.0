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
const ownedCollections = new Set();
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
  if (method === 'POST' && path === '/api/community/api/v1/me/collections' && data?.collection_id) ownedCollections.add(data.collection_id);
  if (method === 'DELETE' && path.startsWith('/api/community/api/v1/me/collections/')) ownedCollections.delete(path.split('/').at(-1));
  await idle();
  return { data, request: response.request().postDataJSON() };
}
async function navigate(name) {
  const button = page.getByRole('navigation').getByRole('button', { name, exact: true });
  if (!await button.isVisible()) await page.locator('.more-toggle').click();
  await button.click(); await idle();
  if (name === 'Tài khoản') await page.locator('.account-panel-container').waitFor();
  else if (name !== 'Khám phá') await page.getByRole('heading', { name, exact: true, level: 1 }).waitFor();
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
  // Trip workspace regression lives in browser-trip-timeline.mjs.
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
  const provincePicker = detail.getByRole('combobox', { name: /^Tỉnh\/thành cho bộ sưu tập/ });
  const placePicker = detail.getByRole('combobox', { name: /^Địa điểm/ });
  assert.equal(await placePicker.isDisabled(), true, 'Place picker requires a province search');
  assert.equal(await detail.getByLabel('Ghi chú', { exact: true }).isDisabled(), true);
  assert.equal(await button('Tìm địa điểm', detail).isDisabled(), true);
  const provinceIds = await provincePicker.locator('option').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
  let places = [];
  for (const provinceId of provinceIds) {
    await provincePicker.selectOption(provinceId);
    assert.equal(await placePicker.isDisabled(), true, 'Province changes invalidate previous place results');
    await button('Tìm địa điểm', detail).click(); await idle();
    places = await placePicker.locator('option').evaluateAll(nodes => nodes.map(node => node.value).filter(Boolean));
    if (places.length >= 2) break;
  }
  assert.ok(places.length >= 2, 'Need a province containing two actual Catalog places');
  assert.ok((await detail.getByRole('status').innerText()).includes(String(places.length)), 'Search shows the returned place count');
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
  // Failed assertions must not leave this run's synthetic collections behind.
  if (ownedCollections.size) {
    const loginResponse = await context.request.post(`${base}/api/identity/api/v1/auth/login`, { data: { email: 'fixture-u1@example.invalid', password } });
    if (loginResponse.ok()) {
      const pair = await loginResponse.json();
      for (const id of ownedCollections) {
        const url = `${base}/api/community/api/v1/me/collections/${id}`;
        const current = await context.request.get(url, { headers: { Authorization: `Bearer ${pair.access_token}` } });
        if (current.ok()) {
          const collection = await current.json();
          const removed = await context.request.delete(url, { headers: { Authorization: `Bearer ${pair.access_token}`, 'If-Match': `"${collection.version}"` } });
          if (removed.status() !== 204) console.error('Synthetic collection cleanup could not complete');
        }
      }
    } else console.error('Synthetic collection cleanup login unavailable');
  }
  const unique = [...new Map(apiResults.map(result => [JSON.stringify(result), result])).values()];
  const timestamp = new Date().toISOString();
  const counts = { tests_run: checks.length + (failure ? 1 : 0), tests_passed: checks.length, tests_failed: failure ? 1 : 0, tests_skipped: 0 };
  writeFileSync(reportFile, JSON.stringify({ timestamp, suite: 'browser-trip-collection', revision, dirty, source_sha256: sourceHash, environment: 'P02 real Gateway, PostgreSQL, MongoDB, RabbitMQ; Playwright Chromium; synthetic fixture records', ...counts, checks, gaps: failure ? [failure.message] : [], attempts: [...previousAttempts, { timestamp, source_sha256: sourceHash, ...counts, failure: failure?.message ?? null }], api_request_count: apiResults.length, api_results: unique, page_errors: errors.length }, null, 2));
  await browser.close();
}
if (!failure) console.log(`PASS trip/collection browser: ${checks.length} groups; real Gateway ${apiResults.length} responses`);
