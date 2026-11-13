import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let registrations = 0;
  let signIns = 0;
  await page.route('**/api/v1/auth/register', async route => {
    registrations++;
    assert.equal(route.request().postDataJSON().email, 'registration@example.invalid');
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ status: 'ACCEPTED', request_id: crypto.randomUUID(), version: 1 }) });
  });
  await page.route('**/api/v1/auth/login', async route => {
    signIns++;
    assert.deepEqual(route.request().postDataJSON(), { email: 'registration@example.invalid', password: 'synthetic-password-123' });
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'UNAUTHORIZED', message: 'Synthetic response' }) });
  });
  await page.goto(`${process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5179'}/tai-khoan`);
  await page.locator('.auth-mode-pill-tabs').getByRole('button').nth(1).click();
  await page.locator('[name=display_name]').fill('Registration test');
  await page.locator('[name=email]').fill('registration@example.invalid');
  await page.locator('[name=password]').fill('synthetic-password-123');
  await page.locator('[name=confirm_password]').fill('synthetic-password-123');
  await page.locator('.auth-form-body button[type=submit]').click();
  await page.waitForFunction(() => !document.querySelector('[name=confirm_password]'));
  assert.equal(await page.locator('[name=email]').inputValue(), 'registration@example.invalid');
  assert.equal(await page.locator('[name=password]').inputValue(), '');
  assert.equal(await page.locator('[name=password]').getAttribute('type'), 'password');
  assert.equal(signIns, 0, 'Registration must not log in automatically');
  await page.locator('[name=password]').fill('synthetic-password-123');
  const response = page.waitForResponse(r => r.url().endsWith('/auth/login'));
  await page.locator('.auth-form-body button[type=submit]').click();
  await response;
  assert.equal(registrations, 1);
  assert.equal(signIns, 1);
  assert.deepEqual(errors, []);
  console.log('PASS: registration switches to login, retains email, clears password, and submits only on user action (stub API).');
} finally {
  await browser.close();
}
