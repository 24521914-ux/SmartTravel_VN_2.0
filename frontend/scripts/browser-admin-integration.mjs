import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadP02Secrets } from './p02-secrets.mjs';

// Uses actual UI requests through Vite's Gateway proxy, with real service databases.
const secrets = loadP02Secrets();
const origin = process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(20000);
const failures = [], requests = [], checks = [];
const output = fileURLToPath(new URL('../../backend/infra/.local/p03/frontend-admin-browser/', import.meta.url));
mkdirSync(output, { recursive: true });
page.on('pageerror', e => failures.push(e.message));
page.on('response', response => {
  const path = new URL(response.url()).pathname;
  if (path.startsWith('/api/')) requests.push({ path: path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}'), method: response.request().method(), status: response.status() });
});
page.on('dialog', dialog => dialog.accept());
async function login(alias) {
  await page.goto(`${origin}/tai-khoan`);
  await page.getByLabel('Email', { exact: true }).fill(`fixture-${alias}@example.invalid`);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(secrets.IDENTITY_FIXTURE_PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).waitFor();
}
async function complete(section) {
  await page.waitForTimeout(150);
  await section.getByRole('status').filter({ hasText: /Đang xử lý/ }).waitFor({ state: 'hidden' });
  assert.equal(await section.getByRole('alert').count(), 0, await section.getByRole('alert').allTextContents().then(x => x.join(' ')));
}
async function findRecord(section, name) {
  const heading = section.getByRole('heading', { name, exact: true });
  for (let i = 0; i < 100 && !await heading.count(); i++) {
    const more = section.getByRole('button', { name: 'Xem thêm danh mục', exact: true });
    assert.equal(await more.count(), 1, 'Created catalog record missing');
    await more.click(); await complete(section);
  }
  await heading.waitFor();
}
try {
  await login('admin');
  await page.goto(`${origin}/quan-tri`);
  const users = page.getByRole('region', { name: 'Quản lý người dùng', exact: true });
  await users.waitFor(); await complete(users);
  const userRow = users.locator('article').filter({ has: page.getByRole('heading', { name: 'Synthetic u2', exact: true }) });
  for (let i = 0; i < 100 && !await userRow.count(); i++) {
    const more = users.getByRole('button', { name: 'Xem thêm người dùng', exact: true });
    assert.equal(await more.count(), 1, 'Synthetic u2 not found'); await more.click(); await complete(users);
  }
  const businessRole = userRow.getByLabel('BUSINESS', { exact: true });
  const originalRole = await businessRole.isChecked();
  await businessRole.setChecked(!originalRole);
  await userRow.getByRole('button', { name: 'Lưu vai trò', exact: true }).click(); await complete(users);
  await businessRole.setChecked(originalRole);
  await userRow.getByRole('button', { name: 'Lưu vai trò', exact: true }).click(); await complete(users); checks.push('admin roles update/restore');
  await userRow.getByRole('button', { name: 'Khóa tài khoản', exact: true }).click(); await complete(users);
  await userRow.getByText('DISABLED', { exact: true }).waitFor();
  await userRow.getByRole('button', { name: 'Mở khóa tài khoản', exact: true }).click(); await complete(users);
  await userRow.getByText('ACTIVE', { exact: true }).waitFor(); checks.push('admin user disable/enable');
  const ingestion = page.locator('.admin-ingestion-console');
  await ingestion.locator('summary').filter({ hasText: 'Tạo nguồn dữ liệu' }).click();
  const sourceName = `Integration source ${Date.now()}`;
  await ingestion.getByLabel('Tên nguồn', { exact: true }).fill(sourceName);
  await ingestion.getByLabel('Địa chỉ nguồn', { exact: true }).fill(`http://source-sandbox:8080/records?run=${Date.now()}`);
  await ingestion.getByLabel(/^Tham chiếu bí mật/).fill('none');
  await ingestion.getByLabel('Phiên bản giấy phép', { exact: true }).fill('synthetic-v1');
  await ingestion.getByLabel('Cho phép lưu trữ', { exact: true }).check();
  await ingestion.getByRole('button', { name: 'Lưu nguồn dữ liệu', exact: true }).click(); await complete(ingestion);
  await ingestion.getByRole('heading', { name: sourceName, exact: true }).waitFor(); checks.push('source create/read');
  await ingestion.getByLabel('Tên nguồn', { exact: true }).fill(sourceName + ' updated');
  await ingestion.getByRole('button', { name: 'Lưu nguồn dữ liệu', exact: true }).click(); await complete(ingestion); checks.push('source update');
  await ingestion.getByRole('button', { name: 'Thu hồi quyền sử dụng nguồn', exact: true }).click(); await complete(ingestion);
  await ingestion.getByRole('button', { name: 'Cho phép sử dụng nguồn', exact: true }).click(); await complete(ingestion); checks.push('source revoke/permit');
  await ingestion.getByLabel('Chế độ nhập dữ liệu', { exact: true }).selectOption('FULL');
  await ingestion.getByRole('button', { name: 'Bắt đầu nhập dữ liệu', exact: true }).click(); await complete(ingestion);
  await ingestion.getByRole('button', { name: 'Cập nhật trạng thái job', exact: true }).click(); await complete(ingestion);
  for (let attempt = 0; attempt < 60 && !await ingestion.getByText('SUCCEEDED', { exact: true }).count(); attempt++) {
    assert.equal(await ingestion.getByText('FAILED', { exact: true }).count(), 0, 'Import job failed');
    const itemsResponse = page.waitForResponse(r => r.request().method() === 'GET' && /\/admin\/import-jobs\/[^/]+\/items$/.test(new URL(r.url()).pathname));
    await ingestion.getByLabel('Chi tiết job', { exact: false }).selectOption('items');
    await ingestion.getByRole('button', { name: 'Tải chi tiết job', exact: true }).click();
    const itemPage = await (await itemsResponse).json(); await complete(ingestion);
    for (const item of itemPage.items.filter(row => row.status === 'NEEDS_REVIEW')) {
      // A source near existing places correctly waits for a human decision.
      // This fixture has a distinct run-specific name, so explicitly create it.
      const decision = ingestion.locator('details').filter({ hasText: 'Quyết định ghép bản ghi nhập liệu' });
      if (await decision.getAttribute('open') === null) await decision.locator('summary').click();
      await decision.locator('input[name=item_id]').fill(item.item_id);
      await decision.locator('input[name=version]').fill(String(item.version));
      await decision.locator('select[name=action]').selectOption('CREATE');
      await decision.locator('input[name=reason]').fill('Distinct synthetic run-specific place; operator approves creation');
      await decision.getByRole('button', { name: 'Lưu quyết định ghép', exact: true }).click(); await complete(ingestion);
    }
    await page.waitForTimeout(500);
    await ingestion.getByRole('button', { name: 'Cập nhật trạng thái job', exact: true }).click(); await complete(ingestion);
  }
  await ingestion.getByText('SUCCEEDED', { exact: true }).waitFor();
  await ingestion.getByRole('button', { name: 'Tải chi tiết job', exact: true }).click(); await complete(ingestion); checks.push('import job create/read/items');
  // Removing a source with a running job is intentionally not attempted.
  const catalog = page.getByRole('region', { name: 'Quản lý danh mục du lịch' });
  await catalog.waitFor(); await complete(catalog);
  const suffix = Date.now();
  const resources = [
    ['categories', 'danh mục', 'Tên danh mục'], ['tags', 'nhãn', 'Tên nhãn'], ['amenities', 'tiện ích', 'Tên tiện ích'],
    ['geographic-units', 'địa lý', 'Tên đơn vị'], ['destinations', 'điểm đến', 'Tên điểm đến'],
    ['places', 'địa điểm', 'Tên địa điểm'], ['offerings', 'dịch vụ', 'Tên dịch vụ']
  ];
  const created = [];
  for (const [kind, label, field] of resources) {
    await catalog.getByLabel('Nhóm dữ liệu').selectOption(kind); await complete(catalog);
    await catalog.getByRole('button', { name: `Thêm ${label}`, exact: true }).click();
    await catalog.getByLabel(field, { exact: true }).fill(`Integration ${kind} ${suffix}`);
    if (kind === 'geographic-units') await catalog.getByLabel(/^Cấp/).selectOption('PROVINCE');
    if (kind === 'destinations') await catalog.getByLabel(/^Đơn vị hành chính/).selectOption({ label: `Integration geographic-units ${suffix}` });
    if (kind === 'places') {
      await catalog.getByLabel('Vĩ độ', { exact: true }).fill('10.7769');
      await catalog.getByLabel('Kinh độ', { exact: true }).fill('106.7009');
      await catalog.getByLabel(/^Danh mục/).selectOption({ label: `Integration categories ${suffix}` });
      await catalog.getByLabel(/^Đơn vị hành chính/).selectOption({ label: `Integration geographic-units ${suffix}` });
    }
    if (kind === 'offerings') {
      await catalog.getByLabel(/^Địa điểm/).selectOption({ label: `Integration places ${suffix}` });
      await catalog.getByLabel(/^Loại dịch vụ/).selectOption('SERVICE');
      await catalog.getByLabel('Giá (VND)', { exact: true }).fill('0');
    }
    await catalog.getByRole('button', { name: 'Lưu danh mục', exact: true }).click(); await complete(catalog);
    const original = `Integration ${kind} ${suffix}`, updated = `${original} updated`;
    await findRecord(catalog, original);
    await catalog.getByRole('button', { name: `Chi tiết / sửa ${original}`, exact: true }).click();
    await catalog.getByLabel(field, { exact: true }).fill(updated);
    await catalog.getByRole('button', { name: 'Lưu danh mục', exact: true }).click(); await complete(catalog);
    await findRecord(catalog, updated);
    // Keep display names stable while subsequent reference selectors use them.
    await catalog.getByRole('button', { name: `Chi tiết / sửa ${updated}`, exact: true }).click();
    await catalog.getByLabel(field, { exact: true }).fill(original);
    await catalog.getByRole('button', { name: 'Lưu danh mục', exact: true }).click(); await complete(catalog);
    created.push([kind, original]); checks.push(`${kind}: create/read/update`);
  }
  for (const [kind, name] of created.reverse()) {
    await catalog.getByLabel('Nhóm dữ liệu').selectOption(kind); await complete(catalog);
    await findRecord(catalog, name);
    const beforeDeleting = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname.includes(`/admin/${kind}/`));
    const removing = page.waitForResponse(r => r.request().method() === 'DELETE' && new URL(r.url()).pathname.includes(`/admin/${kind}/`));
    await catalog.getByRole('button', { name: `Xóa ${name}`, exact: true }).click();
    const previous = await (await beforeDeleting).json();
    const deleted = await removing; assert.equal(deleted.status(), 204); await complete(catalog);
    const detailPath = new URL(deleted.url()).pathname;
    await findRecord(catalog, name);
    const reloading = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === detailPath);
    await catalog.getByRole('button', { name: `Chi tiết / sửa ${name}`, exact: true }).click();
    const archived = await (await reloading).json();
    assert.ok(archived.version > previous.version, `${kind} version must advance after soft-delete`);
    if (['categories', 'tags', 'amenities'].includes(kind)) assert.equal(archived.active, false, `${kind} must be inactive`);
    else if (kind === 'destinations') assert.equal(archived.status, 'INACTIVE', 'Archived destination must be represented as inactive');
    else if (kind === 'places') assert.equal(archived.status, 'ARCHIVED', 'Place must be archived');
    else {
      const id = detailPath.split('/').at(-1);
      const publiclyVisible = await page.evaluate(async ({ kind, id }) => {
        let cursor;
        do {
          const response = await fetch(`/api/catalog/api/v1/${kind}?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
          if (!response.ok) throw new Error(`Public taxonomy HTTP ${response.status}`);
          const data = await response.json();
          if (data.items.some(row => (row.id ?? row.geographic_unit_id ?? row.offering_id) === id)) return true;
          cursor = data.next_cursor;
        } while (cursor);
        return false;
      }, { kind, id });
      assert.equal(publiclyVisible, false, `${kind} must not be public after soft-delete`);
    }
    await catalog.getByRole('button', { name: 'Hủy chỉnh sửa', exact: true }).click();
    checks.push(`${kind}: soft-delete read-back`);
  }
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).click(); await login('u1');
  await page.goto(`${origin}/dong-gop`);
  const contribution = page.getByRole('region', { name: 'Đóng góp dữ liệu', exact: true });
  await contribution.waitFor(); await complete(contribution);
  const name = `Integration contribution ${suffix}`;
  await contribution.getByLabel('Tên địa điểm đề xuất').fill(name);
  await contribution.getByLabel('Vĩ độ', { exact: true }).fill('10.7769');
  await contribution.getByLabel('Kinh độ', { exact: true }).fill('106.7009');
  await contribution.getByRole('button', { name: 'Gửi đóng góp', exact: true }).click(); await complete(contribution);
  const row = contribution.locator('article').filter({ has: page.getByRole('heading', { name, exact: true }) });
  await row.getByText('Trạng thái: PENDING', { exact: true }).waitFor();
  await row.getByRole('button', { name: 'Sửa đóng góp', exact: true }).click();
  await contribution.getByLabel('Vĩ độ', { exact: true }).fill('10.777');
  await contribution.getByRole('button', { name: 'Lưu đóng góp', exact: true }).click(); await complete(contribution); checks.push('contribution edit pending');
  await row.getByRole('button', { name: 'Rút đóng góp', exact: true }).click(); await complete(contribution);
  await row.getByText('Trạng thái: WITHDRAWN', { exact: true }).waitFor(); checks.push('contribution ADD pending/withdraw');
  const appliedName = `P03 integration applied ${suffix}`;
  await contribution.getByLabel('Tên địa điểm đề xuất').fill(appliedName);
  // P02 provisions an actual geographic boundary around Da Nang only.
  await contribution.getByLabel('Vĩ độ', { exact: true }).fill('16.047079');
  await contribution.getByLabel('Kinh độ', { exact: true }).fill('108.20623');
  await contribution.getByLabel(/^Danh mục/).selectOption({ index: 1 });
  await contribution.getByRole('button', { name: 'Gửi đóng góp', exact: true }).click(); await complete(contribution);
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).click(); await login('admin');
  await page.goto(`${origin}/kiem-duyet`);
  const moderation = page.locator('.moderation-console-layout'); await moderation.waitFor();
  await moderation.getByLabel(/^Nội dung kiểm duyệt/).selectOption('contributions');
  await moderation.locator('#moderation-reason').fill('Synthetic integration contribution is valid');
  const pending = moderation.locator('article').filter({ has: page.getByRole('heading', { name: appliedName, exact: true }) });
  await pending.getByRole('button', { name: 'Duyệt', exact: true }).click(); await complete(moderation);
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).click(); await login('u1');
  await page.goto(`${origin}/dong-gop`);
  const applied = contribution.locator('article').filter({ has: page.getByRole('heading', { name: appliedName, exact: true }) });
  for (let attempt = 0; attempt < 60 && !await applied.getByText('Trạng thái: APPLIED', { exact: true }).count(); attempt++) {
    assert.equal(await applied.getByText('Trạng thái: APPLY_FAILED', { exact: true }).count(), 0, 'Catalog rejected the contribution');
    await page.waitForTimeout(500); await contribution.getByRole('button', { name: 'Cập nhật trạng thái đóng góp', exact: true }).click(); await complete(contribution);
  }
  await applied.getByText('Trạng thái: APPLIED', { exact: true }).waitFor(); checks.push('admin contribution approve/async APPLIED');
  assert.deepEqual(failures, []);
  assert.deepEqual(requests.filter(r => r.status >= 400), [], 'Gateway API errors');
  console.log(`PASS admin/contribution browser: ${checks.length} checks; ${requests.length} real Gateway requests; 0 API errors; 0 page errors`);
} catch (error) {
  await page.screenshot({ path: output + '/failure.png', fullPage: true });
  console.error(`FAIL admin/contribution browser: ${error.message}`); process.exitCode = 1;
} finally {
  writeFileSync(output + '/report.json', JSON.stringify({ timestamp: new Date().toISOString(), checks, failures, api_request_count: requests.length, api_results: [...new Map(requests.map(r => [JSON.stringify(r), r])).values()], passed: !process.exitCode }, null, 2));
  await browser.close();
}
