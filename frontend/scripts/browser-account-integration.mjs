import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const origin = process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173';
if (existsSync(fileURLToPath(new URL('../../backend/infra/.local/p02/mail.json', import.meta.url)))) {
  throw new Error('Synthetic account tests require the Mailpit environment, not Gmail SMTP.');
}
const output = fileURLToPath(new URL('../../backend/infra/.local/p03/frontend-account-browser/', import.meta.url));
mkdirSync(output, { recursive: true });
const browser = await chromium.launch(); const page = await browser.newPage(); page.setDefaultTimeout(20000);
const api = [], errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', response => { const path = new URL(response.url()).pathname; if (path.startsWith('/api/')) api.push({ method: response.request().method(), path: path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '{id}'), status: response.status() }); });
const email = `browser-${Date.now()}@example.invalid`;
const password = randomBytes(24).toString('base64url'); const nextPassword = randomBytes(24).toString('base64url');
async function submit(name, path) {
  const returned = page.waitForResponse(r => new URL(r.url()).pathname.endsWith(path) && r.request().method() !== 'GET');
  await page.locator('main form').getByRole('button', { name, exact: true }).click();
  const response = await returned; assert.ok(response.ok(), `${name}: HTTP ${response.status()}`);
  await page.waitForTimeout(150);
  assert.equal(await page.locator('main [role=alert]').count(), 0);
}
async function tokenFromMail(subject) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const messages = (await (await fetch('http://127.0.0.1:59025/api/v1/messages')).json()).messages ?? [];
    const message = messages.find(m => JSON.stringify(m.To).includes(email) && (!subject || new RegExp(subject, 'i').test(m.Subject)));
    if (message) {
      const content = await (await fetch(`http://127.0.0.1:59025/api/v1/message/${message.ID}`)).json();
      const tokens = content.Text.match(/[A-Za-z0-9_-]{32,}/g); assert.ok(tokens?.length, 'Missing mail token'); return tokens.at(-1);
    }
    await page.waitForTimeout(500);
  }
  throw new Error('SMTP sandbox message missing');
}
async function login(pass) {
  await page.locator('.auth-mode-pill-tabs').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Mật khẩu', { exact: true }).fill(pass);
  await submit('Đăng nhập', '/auth/login'); await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).waitFor();
  await page.getByRole('tab', { name: 'Hồ sơ cá nhân', exact: true }).click();
  await page.waitForFunction(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent === 'Lưu hồ sơ'); return button && !button.disabled; });
  await page.waitForTimeout(200);
}
try {
  await page.goto(`${origin}/tai-khoan`);
  await page.getByRole('button', { name: 'Đăng ký tài khoản', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email); await page.getByLabel('Tên hiển thị', { exact: true }).fill('Browser registration');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill(password);
  await submit('Đăng ký', '/auth/register'); checks.push('register without verification');
  await page.waitForFunction(() => !document.querySelector('[name=confirm_password]'));
  assert.equal(await page.locator('[name=email]').inputValue(), email);
  assert.equal(await page.locator('[name=password]').inputValue(), '');
  await login(password);
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Browser updated profile'); await submit('Lưu hồ sơ', '/me');
  await page.getByRole('heading', { name: 'Browser updated profile', exact: true }).waitFor(); checks.push('profile persists');
  await page.getByRole('tab', { name: 'Sở thích & Quyền riêng tư', exact: true }).click();
  await page.getByLabel('Ngân sách tối thiểu (VND)').fill('0'); await page.getByLabel('Ngân sách tối đa (VND)').fill('1000000');
  await page.getByLabel('Mức ngân sách').selectOption('MID'); await submit('Lưu sở thích', '/me/preferences'); checks.push('preferences');
  await page.getByRole('tab', { name: 'Bảo mật tài khoản', exact: true }).click();
  await page.getByRole('button', { name: 'Tải lại phiên', exact: true }).click();
  await page.getByRole('button', { name: 'Thu hồi phiên', exact: true }).first().waitFor(); checks.push('sessions real');
  await page.getByLabel('Mật khẩu hiện tại').fill(password); await page.getByLabel('Mật khẩu mới', { exact: true }).fill(nextPassword);
  await submit('Lưu mật khẩu', '/me/password'); checks.push('password change');
  if (await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).count()) await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).click();
  await page.getByRole('button', { name: 'Quên mật khẩu', exact: true }).click(); await page.getByLabel('Email', { exact: true }).fill(email);
  await submit('Quên mật khẩu', '/auth/forgot-password');
  const reset = await tokenFromMail('reset|password|mật khẩu');
  await page.getByRole('heading', { name: 'Đặt lại mật khẩu', exact: true }).waitFor();
  await page.getByLabel('Mã xác nhận trong email').fill(reset); await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await submit('Đặt lại mật khẩu', '/auth/reset-password'); await login(password); checks.push('forgot/reset/login');
  await page.getByRole('tab', { name: 'Sở thích & Quyền riêng tư', exact: true }).click();
  await page.getByText('Yêu cầu xóa dữ liệu cá nhân', { exact: true }).click();
  await page.getByLabel('Tôi xác nhận yêu cầu xóa dữ liệu của mình').check();
  await submit('Gửi yêu cầu xóa dữ liệu', '/me/deletion-requests'); checks.push('deletion pending');
  assert.deepEqual(errors, []); assert.deepEqual(api.filter(r => r.status >= 400 && !(r.status === 401 && r.path.endsWith('/auth/logout'))), []);
  console.log(`PASS account browser: ${checks.length} checks; ${api.length} real Gateway requests; 0 unexpected API/page errors (revoked-session logout 401 allowed)`);
} catch (error) { await page.screenshot({ path: output + 'failure.png', fullPage: true }); console.error('FAIL account browser: ' + error.message); process.exitCode = 1; }
finally { writeFileSync(output + 'report.json', JSON.stringify({ timestamp: new Date().toISOString(), checks, errors, passed: !process.exitCode, api_request_count: api.length, api_results: [...new Map(api.map(r => [JSON.stringify(r), r])).values()] }, null, 2)); await browser.close(); }
