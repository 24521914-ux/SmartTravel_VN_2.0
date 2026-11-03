import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadP02Secrets } from './p02-secrets.mjs';

const secrets = loadP02Secrets();
const origin = process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch(); const page = await browser.newPage(); page.setDefaultTimeout(20000);
const requests = [], checks = [], pageErrors = [];
const output = fileURLToPath(new URL('../../backend/infra/.local/p03/frontend-business-ingestion/', import.meta.url)); mkdirSync(output, { recursive: true });
page.on('pageerror', error => pageErrors.push(error.message)); page.on('dialog', dialog => dialog.accept());
page.on('response', response => { const path = new URL(response.url()).pathname; if (path.startsWith('/api/')) requests.push({ path: path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}'), method: response.request().method(), status: response.status() }); });
async function login(alias) {
  await page.goto(`${origin}/tai-khoan`);
  await page.getByLabel('Email', { exact: true }).fill(`fixture-${alias}@example.invalid`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(secrets.IDENTITY_FIXTURE_PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).waitFor();
}
async function responseFor(path, method, action, expected) {
  const pending = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(path) && response.request().method() === method);
  await action(); const response = await pending;
  if (expected) assert.equal(response.status(), expected, `${method} ${path}`);
  else assert.ok(response.ok(), `${method} ${path} status ${response.status()}`);
  return response.status() === 204 ? null : response.json();
}
try {
  const suffix = Date.now(); await login('business');
  await page.goto(`${origin}/doanh-nghiep`);
  const portal = page.locator('.business-portal-layout'); await portal.waitFor();
  const name = `Integration business ${suffix}`;
  await portal.getByLabel('Tên doanh nghiệp', { exact: true }).fill(name);
  const business = await responseFor('/api/v1/businesses', 'POST', () => portal.getByRole('button', { name: 'Tạo doanh nghiệp', exact: true }).click());
  const id = business.business_id ?? business.id;
  await portal.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) }).getByRole('button', { name: 'Quản lý doanh nghiệp' }).click();
  await portal.getByLabel('Tên doanh nghiệp mới').fill(`${name} edited`);
  await responseFor(`/businesses/${id}`, 'PATCH', () => portal.getByRole('button', { name: 'Lưu tên doanh nghiệp' }).click()); checks.push('business create/detail/update');
  await portal.getByRole('tab', { name: /Thành viên/ }).click();
  await portal.getByRole('button', { name: 'Tải lại thành viên' }).first().click(); checks.push('business member detail');
  const membership = await responseFor(`/businesses/${id}/members`, 'POST', () => portal.getByRole('button', { name: 'Xác nhận quyền chủ sở hữu', exact: true }).click());
  const memberId = membership.member_id ?? membership.id;
  await responseFor(`/businesses/${id}/members/${memberId}`, 'PATCH', () => portal.getByRole('combobox', { name: /^Vai trò / }).selectOption('OWNER'));
  await responseFor(`/businesses/${id}/members/${memberId}`, 'DELETE', () => portal.getByRole('button', { name: 'Xóa membership', exact: true }).click(), 422);
  assert.equal(await portal.getByRole('button', { name: 'Tải lại thành viên', exact: true }).count(), 1, 'Owner membership must survive rejected deletion'); checks.push('owner membership confirm/update/delete forbidden');
  await portal.getByRole('tab', { name: /Xác minh/ }).click();
  await portal.locator('#kyc-doc-url').fill('private/integration-business-evidence.png');
  const verification = await responseFor(`/businesses/${id}/verification`, 'POST', () => portal.getByRole('button', { name: 'Gửi xác minh KYC' }).click());
  assert.equal(verification.status, 'PENDING'); checks.push('business verification pending');
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).click(); await login('admin');
  await page.goto(`${origin}/kiem-duyet`);
  await page.locator('.kyc-review-accordion summary').click();
  await page.locator('#verify-id').fill(String(verification.verification_id ?? verification.request_id ?? verification.id));
  await page.locator('#verify-version').fill('1'); await page.locator('#verify-reason').fill('Integration verification review');
  await responseFor(`/business-verifications/${verification.verification_id ?? verification.request_id ?? verification.id}/review`, 'POST', () => page.getByRole('button', { name: 'Lưu quyết định xác minh' }).click()); checks.push('admin business verification review');
  const claimPlace = await page.evaluate(async suffix => {
    const { travelClient: travel } = await import('/src/api/session.ts');
    const anchor = (await travel.places()).items[0];
    const created = await travel.mutate('catalog', '/admin/places', { name: `P03 business claim ${suffix}`, latitude: anchor.latitude, longitude: anchor.longitude, geographic_unit_id: anchor.geographic_unit_id, category_ids: [], tag_ids: [], amenity_ids: [], destination_ids: [], opening_hours: [], media_keys: [] });
    return travel.mutate('catalog', `/admin/places/${created.place_id}/status`, { status: 'PUBLISHED' }, 'PUT', created.version);
  }, suffix);
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).click(); await login('business');
  await page.goto(`${origin}/doanh-nghiep`);
  await portal.locator('article').filter({ has: page.getByRole('heading', { name: `${name} edited`, exact: true }) }).getByRole('button', { name: 'Quản lý doanh nghiệp' }).click();
  await portal.getByRole('tab', { name: 'Yêu cầu địa điểm', exact: true }).click();
  await portal.locator('#claim-place-id').fill(claimPlace.place_id);
  await portal.locator('#claim-evidence').fill('private/integration-claim-evidence');
  const claim = await responseFor(`/businesses/${id}/claims`, 'POST', () => portal.getByRole('button', { name: 'Gửi yêu cầu claim', exact: true }).click());
  assert.equal(claim.status, 'PENDING'); checks.push('verified business claim submitted pending');
  async function review(kind, requestId) {
    await page.goto(`${origin}/kiem-duyet`);
    await page.locator('.kyc-review-accordion summary').click();
    await page.locator('#verify-kind').selectOption(kind); await page.locator('#verify-id').fill(requestId);
    await page.locator('#verify-version').fill('1'); await page.locator('#verify-reason').fill('Synthetic integration evidence reviewed');
    await responseFor(`/${kind}/${requestId}/review`, 'POST', () => page.getByRole('button', { name: 'Lưu quyết định xác minh', exact: true }).click());
  }
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).click(); await login('admin');
  await review('claims', claim.claim_id); checks.push('admin claim approval');
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).click(); await login('business');
  await page.goto(`${origin}/doanh-nghiep`);
  const changeForm = portal.locator('details').filter({ hasText: 'Đề nghị sửa địa điểm đã được claim' });
  await changeForm.locator('summary').click(); await changeForm.locator('input[name=claim_id]').fill(claim.claim_id);
  await changeForm.locator('input[name=version]').fill(String(claimPlace.version));
  // The administrator-provided name is protected at higher precedence. The
  // business can supply a previously unknown price without overwriting it.
  await changeForm.locator('input[name=price]').fill('12345');
  const change = await responseFor(`/claims/${claim.claim_id}/change-requests`, 'POST', () => changeForm.getByRole('button', { name: 'Gửi đề nghị sửa địa điểm', exact: true }).click());
  assert.equal(change.status, 'PENDING'); checks.push('claimed place change request pending');
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).click(); await login('admin');
  await review('change-requests', change.change_request_id);
  const persisted = await page.evaluate(async placeId => (await import('/src/api/session.ts')).travelClient.place(placeId), claimPlace.place_id);
  assert.equal(persisted.price, 12345); assert.equal(persisted.name, claimPlace.name); assert.ok(persisted.version > claimPlace.version);
  checks.push('admin change approval persisted actual Catalog fields');
  await page.goto(`${origin}/quan-tri`);
  const ingestion = page.locator('.admin-ingestion-console'); await ingestion.waitFor();
  await ingestion.locator('summary').filter({ hasText: 'Tạo nguồn dữ liệu' }).click();
  await ingestion.getByLabel('Tên nguồn', { exact: true }).fill(`Integration source ${suffix}`);
  await ingestion.getByLabel('Địa chỉ nguồn').fill('https://example.invalid/integration-fixture');
  await ingestion.getByLabel('Tham chiếu bí mật').fill('none'); await ingestion.getByLabel('Phiên bản giấy phép').fill('integration-v1'); await ingestion.getByLabel('Cho phép lưu trữ', { exact: true }).check();
  const source = await responseFor('/admin/data-sources', 'POST', () => ingestion.getByRole('button', { name: 'Lưu nguồn dữ liệu' }).click());
  const sourceId = source.source_id ?? source.id;
  await ingestion.getByLabel('Tên nguồn', { exact: true }).fill(`Integration source ${suffix} edited`);
  await responseFor(`/data-sources/${sourceId}`, 'PATCH', () => ingestion.getByRole('button', { name: 'Lưu nguồn dữ liệu' }).click()); checks.push('ingestion source create/update');
  await responseFor(`/data-sources/${sourceId}/policy`, 'PATCH', () => ingestion.getByRole('button', { name: 'Thu hồi quyền sử dụng nguồn' }).click());
  await responseFor(`/data-sources/${sourceId}/policy`, 'PATCH', () => ingestion.getByRole('button', { name: 'Cho phép sử dụng nguồn' }).click()); checks.push('ingestion policy revoke/permit');
  await responseFor(`/data-sources/${sourceId}`, 'DELETE', () => ingestion.getByRole('button', { name: 'Xóa nguồn dữ liệu', exact: true }).click()); checks.push('ingestion source delete');
  assert.deepEqual(pageErrors, []); assert.deepEqual(requests.filter(request => request.status >= 400 && !(request.status === 422 && request.method === 'DELETE' && request.path.includes('/members/'))), []);
  console.log(`PASS business/ingestion browser: ${checks.length} checks; ${requests.length} real Gateway requests; 0 page/API errors`);
} catch (error) { await page.screenshot({ path: output + '/failure.png', fullPage: true }); console.error(`FAIL business/ingestion browser: ${error.message}`); process.exitCode = 1; }
finally { writeFileSync(output + '/report.json', JSON.stringify({ timestamp: new Date().toISOString(), checks, pageErrors, api_request_count: requests.length, api_results: [...new Map(requests.map(request => [JSON.stringify(request), request])).values()], passed: !process.exitCode }, null, 2)); await browser.close(); }
