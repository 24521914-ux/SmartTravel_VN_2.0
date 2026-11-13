import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const origin = process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173';
if (existsSync(fileURLToPath(new URL('../../backend/infra/.local/p02/mail.json', import.meta.url)))) {
  throw new Error('Synthetic auth recovery tests require the Mailpit environment, not Gmail SMTP.');
}
const mailbox = process.env.P02_MAILPIT_URL ?? 'http://127.0.0.1:59025';
const output = fileURLToPath(new URL('../.local/auth-recovery/', import.meta.url));
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(20000);
const errors = [];
const checks = [];
page.on('pageerror', error => errors.push(error.message));
const email = `auth-recovery-${Date.now()}-${randomBytes(4).toString('hex')}@example.invalid`;
const password = randomBytes(24).toString('base64url');
let registrations = 0;
page.on('request', request => { if (request.url().endsWith('/auth/register')) registrations++; });
const form = page.locator('.auth-form-body');
async function submit(name, route, status = 202) {
  const returned = page.waitForResponse(response => response.url().endsWith(`/auth/${route}`));
  await form.getByRole('button', { name, exact: true }).click();
  assert.equal((await returned).status(), status, `${route} status`);
}
async function mode(name) {
  await page.getByRole('navigation', { name: 'Xác thực tài khoản' }).getByRole('button', { name, exact: true }).click();
}
async function mail(previousId) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const list = await (await fetch(`${mailbox}/api/v1/messages`)).json();
    const item = list.messages.find(item => item.ID !== previousId && item.Subject === 'SmartTravel account verification' && item.To.some(to => to.Address === email));
    if (item) {
      const content = await (await fetch(`${mailbox}/api/v1/message/${item.ID}`)).json();
      const token = content.Text.split(/\r?\n/)[1].trim();
      assert.match(token, /^[A-Za-z0-9_-]{32,}$/);
      return { id: item.ID, token };
    }
    await page.waitForTimeout(500);
  }
  throw new Error('Verification message did not arrive in the local SMTP sink');
}
try {
  await page.goto(`${origin}/tai-khoan`);
  await page.locator('.auth-mode-pill-tabs').getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await page.getByLabel('Tên hiển thị', { exact: true }).fill('Auth recovery browser');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill(`${password}-different`);
  await form.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Mật khẩu xác nhận chưa khớp' }).waitFor();
  assert.equal(registrations, 0);
  checks.push('password confirmation prevents request');
  await page.getByLabel('Xác nhận mật khẩu', { exact: true }).fill(password);
  const registeredAt = Date.now();
  await submit('Đăng ký', 'register');
  await page.getByRole('heading', { name: 'Xác minh email', exact: true }).waitFor();
  assert.equal(registrations, 1);
  checks.push('registration automatically opens verification');
  const first = await mail();
  checks.push('real SMTP verification delivery');
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `overflow at ${width}`);
  }
  await page.screenshot({ path: `${output}verification.png`, fullPage: true });
  checks.push('three responsive widths');
  await page.getByLabel('Mã xác nhận trong email').fill('invalid-verification-token');
  await submit('Xác minh email', 'verify-email', 401);
  await page.getByRole('alert').filter({ hasText: 'Mã không hợp lệ' }).waitFor();
  checks.push('invalid code stays in verification');
  await page.locator('.auth-mode-pill-tabs').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  assert.equal(await page.getByLabel('Email', { exact: true }).inputValue(), email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(`${password}-wrong`);
  await submit('Đăng nhập', 'login', 401);
  await page.getByRole('alert').filter({ hasText: 'Email hoặc mật khẩu không đúng' }).waitFor();
  checks.push('wrong password does not disclose pending status');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await submit('Đăng nhập', 'login', 403);
  await page.getByRole('heading', { name: 'Xác minh email', exact: true }).waitFor();
  await page.getByRole('status').filter({ hasText: 'Email chưa được xác minh' }).waitFor();
  checks.push('pending login guides verification');
  await mode('Gửi lại mã xác minh');
  assert.equal(await page.getByLabel('Email', { exact: true }).inputValue(), email);
  await submit('Gửi lại mã xác minh', 'resend-verification');
  await page.getByRole('heading', { name: 'Xác minh email', exact: true }).waitFor();
  const early = await (await fetch(`${mailbox}/api/v1/messages`)).json();
  assert.equal(early.messages.filter(item => item.Subject === 'SmartTravel account verification' && item.To.some(to => to.Address === email)).length, 1);
  checks.push('resend cooldown avoids duplicate mail');
  // Respect the real provider cooldown; do not alter token timestamps in the shared database.
  const remaining = 61000 - (Date.now() - registeredAt);
  if (remaining > 0) await page.waitForTimeout(remaining);
  await mode('Gửi lại mã xác minh');
  await submit('Gửi lại mã xác minh', 'resend-verification');
  await page.getByRole('heading', { name: 'Xác minh email', exact: true }).waitFor();
  const replacement = await mail(first.id);
  assert.notEqual(replacement.token, first.token);
  checks.push('resend delivers a fresh code through Gateway and SMTP');
  await page.getByLabel('Mã xác nhận trong email').fill(first.token);
  await submit('Xác minh email', 'verify-email', 401);
  await page.getByRole('alert').filter({ hasText: 'Mã không hợp lệ' }).waitFor();
  checks.push('superseded code rejected');
  await page.getByLabel('Mã xác nhận trong email').fill(replacement.token);
  await submit('Xác minh email', 'verify-email');
  await page.getByRole('heading', { name: 'Đăng nhập tài khoản', exact: true }).waitFor();
  checks.push('valid code returns to login');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await submit('Đăng nhập', 'login', 200);
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).waitFor();
  checks.push('verified account signs in');
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).click();
  await page.getByLabel('Email', { exact: true }).waitFor();
  checks.push('logout returns to login');
  assert.deepEqual(errors, []);
  console.log(`PASS auth recovery: ${checks.length} checks; real Gateway/PostgreSQL/Mailpit; 0 page errors`);
} catch (error) {
  // Avoid screenshots of token inputs and avoid printing request/response bodies.
  console.error(`FAIL auth recovery: ${error.message.replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')}`);
  process.exitCode = 1;
} finally { await browser.close(); }
