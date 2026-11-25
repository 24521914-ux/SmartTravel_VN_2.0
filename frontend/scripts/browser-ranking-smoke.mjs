import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { loadP02Secrets } from './p02-secrets.mjs';

const baseUrl = (process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const secrets = loadP02Secrets();

for (let attempt = 0; attempt < 30; attempt++) {
  try {
    if ((await fetch(`${baseUrl}/kham-pha`)).status === 200) break;
  } catch {
    // Dev server may still be starting.
  }
  await new Promise(resolve => setTimeout(resolve, 1000));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(20000);
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

try {
  // 1. Default Vite run (no VITE_AI_ENABLED override) must invoke real /recommendations/rank and never show deferred state
  const rankPromise = page.waitForResponse(
    res => new URL(res.url()).pathname.endsWith('/api/intelligence/api/v1/recommendations/rank'),
    { timeout: 20000 },
  );
  await page.goto(`${baseUrl}/goi-y`, { waitUntil: 'domcontentloaded' });
  await page.locator('#rec-hero-heading').waitFor({ state: 'visible' });
  const rankRes = await rankPromise;
  const rankBody = await rankRes.json();
  assert.equal(rankRes.status(), 200, `Expected 200 from /recommendations/rank, got ${rankRes.status()}`);
  assert.ok(rankBody?.recommendation_request_id, 'Ranking response must include recommendation_request_id');
  assert.ok(rankBody?.ranking_config_version, 'Ranking response must include ranking_config_version');
  assert.equal(await page.getByText('Dịch vụ gợi ý đang tạm tắt', { exact: true }).count(), 0);
  console.log(`PASS AI smoke /goi-y: status=200, config=${rankBody.ranking_config_version}, returned=${rankBody.total_returned}`);

  // 2. Admin /quan-tri mounts AdminRankingDashboard by default
  await page.goto(`${baseUrl}/tai-khoan`, { waitUntil: 'domcontentloaded' });
  await page.locator('.account-panel-container').waitFor();
  await page.getByLabel('Email', { exact: true }).first().fill('fixture-admin@example.invalid');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(secrets.IDENTITY_FIXTURE_PASSWORD);
  await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống', exact: true }).waitFor();

  await page.goto(`${baseUrl}/quan-tri`, { waitUntil: 'domcontentloaded' });
  await page.locator('#ark-heading').waitFor({ state: 'visible', timeout: 20000 });
  console.log('PASS AI smoke /quan-tri: AdminRankingDashboard mounted');

  assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join('; ')}`);
  console.log('PASS AI ranking browser smoke: 0 page errors');
} finally {
  await browser.close();
}
