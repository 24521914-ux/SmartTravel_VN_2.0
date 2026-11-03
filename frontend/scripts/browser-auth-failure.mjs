import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadP02Secrets } from './p02-secrets.mjs';

const origin = process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173';
const secrets = loadP02Secrets();
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.route('**/api/identity/api/v1/me', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Profile outage fixture', traceId: 'fixture', fieldErrors: [] }) }));
  await page.goto(`${origin}/tai-khoan`);
  await page.getByLabel('Email', { exact: true }).fill('fixture-u1@example.invalid');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(secrets.IDENTITY_FIXTURE_PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Profile outage fixture' }).waitFor();
  assert.equal(await page.getByText('Đăng nhập thành công!', { exact: true }).count(), 0);
  assert.ok(await page.evaluate(() => localStorage.getItem('smarttravel.auth')), 'An outage must preserve the established session');
  await page.unroute('**/api/identity/api/v1/me');
  await page.reload();
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).waitFor();
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống' }).click();
  await page.getByLabel('Email', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS auth profile outage: no false success, session preserved, recovery and logout; 0 page errors');
} finally { await browser.close(); }
