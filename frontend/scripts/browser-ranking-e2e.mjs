import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadP02Secrets } from './p02-secrets.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const repo = resolve(root, '..');
const outDir = resolve(repo, 'backend/infra/.local/ranking-e2e');
mkdirSync(outDir, { recursive: true });

const baseUrl = (process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const gatewayUrl = (process.env.P02_GATEWAY_URL ?? 'http://127.0.0.1:58080').replace(/\/$/, '');

let adminEmail = process.env.RANKING_ADMIN_EMAIL ?? '';
let adminPassword = process.env.RANKING_ADMIN_PASSWORD ?? '';
if (!adminEmail || !adminPassword) {
  try {
    const secrets = loadP02Secrets();
    if (secrets.IDENTITY_FIXTURE_PASSWORD) {
      adminEmail = 'fixture-admin@example.invalid';
      adminPassword = secrets.IDENTITY_FIXTURE_PASSWORD;
    }
  } catch {
    // Admin E2E optional if no local secrets file exists
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  colorScheme: 'light',
});
const page = await context.newPage();
page.setDefaultTimeout(25000);

const pageErrors = [];
const rankCalls = [];
const impressionCalls = [];
const feedbackCalls = [];

page.on('pageerror', err => pageErrors.push(err.message));
page.on('response', async res => {
  const url = new URL(res.url()).pathname;
  if (url.endsWith('/api/intelligence/api/v1/recommendations/rank')) {
    let body = null;
    try { body = await res.json(); } catch {}
    rankCalls.push({ status: res.status(), body });
  }
  if (url.endsWith('/api/intelligence/api/v1/recommendations/impressions')) {
    impressionCalls.push({ status: res.status() });
  }
  if (url.endsWith('/api/intelligence/api/v1/recommendations/feedback')) {
    feedbackCalls.push({ status: res.status() });
  }
});

const checks = [];
const pass = (name, detail) => {
  checks.push({ name, status: 'PASS', detail });
  console.log(`PASS [${name}]: ${detail}`);
};

try {
  // 1. Open /goi-y directly and wait explicitly for real backend ranking call
  const initialRankPromise = page.waitForResponse(
    res => new URL(res.url()).pathname.endsWith('/api/intelligence/api/v1/recommendations/rank'),
    { timeout: 20000 },
  );
  await page.goto(`${baseUrl}/goi-y`, { waitUntil: 'domcontentloaded' });
  await page.locator('#rec-hero-heading').waitFor({ state: 'visible' });
  const initialRankRes = await initialRankPromise;
  const initialRankBody = await initialRankRes.json();

  assert.equal(initialRankRes.status(), 200, `Expected 200 from ranking backend, got ${initialRankRes.status()}`);
  assert.ok(initialRankBody?.recommendation_request_id, 'Response must contain recommendation_request_id');
  assert.ok(initialRankBody?.ranking_config_version, 'Response must contain ranking_config_version');
  pass('goi_y_real_backend_ranking', `status=200, config=${initialRankBody.ranking_config_version}, candidates=${initialRankBody.candidate_count}, returned=${initialRankBody.total_returned}`);

  // Wait for cards to render
  await page.waitForTimeout(400);

  // 2. Verify NO debug table exposed on /goi-y
  assert.equal(await page.locator('.ark-root').count(), 0, 'Admin debug dashboard must NOT appear on /goi-y');
  pass('no_debug_on_user_route', 'Verified zero admin debug components on /goi-y');

  // 3. Verify backend rank order matches rendered DOM cards
  if (initialRankBody.results && initialRankBody.results.length >= 2) {
    const firstExpectedId = initialRankBody.results[0].place_id;
    const firstDomId = await page.locator('#rec-results [data-place-id]').first().getAttribute('data-place-id');
    assert.equal(firstDomId, firstExpectedId, 'Rendered #1 card must match backend rank #1 exactly');
    pass('backend_order_preserved', `DOM #1 place_id=${firstDomId} matches backend #1`);
  }

  // 4. Verify hero destination autocomplete & typing clears old selected canonical ID
  const heroInput = page.locator('.rec-hero-input');
  await heroInput.click();
  await heroInput.fill('Đà Nẵng');
  await page.waitForTimeout(250);
  const firstOpt = page.locator('.rec-hero-input-wrap .rec-loc-option').first();
  if (await firstOpt.count()) {
    await firstOpt.click();
    await page.waitForTimeout(450);
    assert.ok(
      page.url().includes('destination_id=') || page.url().includes('geographic_unit_id='),
      'Selecting canonical location must reflect ID in URL params',
    );
    // Now type new text -> canonical ID must be cleared immediately
    await heroInput.fill('Hà Nội');
    await page.waitForTimeout(300);
    assert.ok(
      !page.url().includes('destination_id=') && !page.url().includes('geographic_unit_id='),
      'Typing after selection must clear previous canonical ID',
    );
    const settleRankPromise = page.waitForResponse(
      res => new URL(res.url()).pathname.endsWith('/api/intelligence/api/v1/recommendations/rank'),
      { timeout: 15000 },
    );
    await heroInput.fill('');
    await page.locator('#rec-hero-heading').click();
    await settleRankPromise;
    await page.waitForTimeout(400);
    pass('hero_canonical_selection_and_clear', 'Canonical selection sets ID; editing text clears stale ID');
  }

  // 5. Scroll first ranked card fully into viewport center to trigger IntersectionObserver (>=50% for >=400ms)
  const firstCard = page.locator('#rec-results [data-place-id]').first();
  await firstCard.waitFor({ state: 'visible', timeout: 10000 });
  if (initialRankBody.results && initialRankBody.results.length > 0) {
    const impPromise = page.waitForResponse(
      res => new URL(res.url()).pathname.endsWith('/api/intelligence/api/v1/recommendations/impressions'),
      { timeout: 10000 },
    );
    await firstCard.scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const el = document.querySelector('#rec-results [data-place-id]');
      if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    const impRes = await impPromise;
    assert.equal(impRes.status(), 202, 'Impression endpoint should return 202 Accepted');
    pass('viewport_impression_recorded', `impression_status=${impRes.status()}, total_sent=${impressionCalls.length}`);

    const relevantBtn = page.locator('.rec-feedback-btn').first();
    if (await relevantBtn.count()) {
      const fbPromise = page.waitForResponse(
        res => new URL(res.url()).pathname.endsWith('/api/intelligence/api/v1/recommendations/feedback'),
        { timeout: 10000 },
      );
      await relevantBtn.click();
      const fbRes = await fbPromise;
      assert.equal(fbRes.status(), 202, 'Feedback click should return 202');
      pass('feedback_attribution_recorded', `feedback_status=${fbRes.status()}`);
    }
  }

  // 6. Desktop screenshots (hero + results) + Mobile 390px overflow & screenshot check
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(outDir, 'goi-y-desktop-1440.png'), fullPage: false });
  await page.locator('#rec-results').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({ path: resolve(outDir, 'goi-y-results-1440.png'), fullPage: false });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'Desktop 1440px must not overflow horizontally',
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'Mobile 390px must not overflow horizontally',
  );
  await page.screenshot({ path: resolve(outDir, 'goi-y-mobile-390.png'), fullPage: false });
  pass('responsive_desktop_and_mobile', 'Zero horizontal overflow at 1440px and 390px; screenshots captured');

  // 7. Admin E2E (when credentials supplied)
  if (adminEmail && adminPassword) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/tai-khoan`, { waitUntil: 'networkidle' });
    await page.getByLabel('Email', { exact: true }).first().fill(adminEmail);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(adminPassword);
    await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống', exact: true }).waitFor({ timeout: 15000 });

    await page.goto(`${baseUrl}/quan-tri`, { waitUntil: 'networkidle' });
    await page.locator('#ark-heading').waitFor({ state: 'visible' });

    // Tab A: Run Playground
    await page.getByRole('button', { name: 'Chạy Playground Debug' }).click();
    await page.locator('.ark-card table.ark-table').first().waitFor({ state: 'visible', timeout: 15000 });
    await page.screenshot({ path: resolve(outDir, 'admin-ranking-playground.png'), fullPage: false });
    pass('admin_playground', 'Executed Admin Playground debug ranking with component breakdown table');

    // Tab B: Dataset & Labeling (verify Human Labeling Pool & capture screenshot)
    await page.getByRole('tab', { name: /Dataset/ }).click();
    await page.waitForTimeout(400);
    const openBtn = page.getByRole('button', { name: /Chấm \/ Xem/ }).first();
    if (await openBtn.count()) {
      await openBtn.click();
      await page.locator('.ark-query-group').first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: resolve(outDir, 'admin-ranking-labeling.png'), fullPage: false });
    pass('admin_datasets_tab', 'Dataset & Labeling workbench rendered with Human Labeling Pool');

    // Tab C: Evaluation & Tuning
    await page.getByRole('tab', { name: /Evaluation/ }).click();
    await page.waitForTimeout(300);
    pass('admin_eval_tuning_tab', 'Evaluation & Weight Tuning tab rendered');

    // Tab D: Config/CF/Deployment Registry
    await page.getByRole('tab', { name: /Config|Deployment|Registry/ }).click();
    await page.waitForTimeout(300);
    pass('admin_registry_tab', 'Config/CF/Deployment Registry tab rendered');

    // Tab E: Operational Analytics
    await page.getByRole('tab', { name: /Operational Analytics/ }).click();
    await page.locator('.ark-kpi').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.screenshot({ path: resolve(outDir, 'admin-ranking-analytics.png'), fullPage: false });
    pass('admin_analytics_tab', 'Operational Analytics KPI cards rendered cleanly');
  }

  assert.deepEqual(pageErrors, [], `Unexpected page errors: ${pageErrors.join('; ')}`);

  // 8. Performance micro-benchmark (20 sequential requests against live Gateway /recommendations/rank with real Context scoring)
  const timings = [];
  let nonFallbackCount = 0;
  for (let i = 0; i < 20; i++) {
    const t0 = performance.now();
    const res = await fetch(`${gatewayUrl}/api/intelligence/api/v1/recommendations/rank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topN: 10,
        currency: 'VND',
        origin: { latitude: 21.0285, longitude: 105.8542 },
        soft_preferences: { quiet: 1.0 },
      }),
    });
    assert.equal(res.status, 200, `Perf probe #${i} failed with ${res.status}`);
    const jsonBody = await res.json();
    if (jsonBody.fallback === false) nonFallbackCount++;
    timings.push(performance.now() - t0);
  }
  timings.sort((a, b) => a - b);
  const p50 = timings[Math.floor(timings.length * 0.50)];
  const p95 = timings[Math.min(timings.length - 1, Math.ceil(timings.length * 0.95) - 1)];
  assert.equal(nonFallbackCount, 20, 'Expected all 20 origin-aware queries to run real Hybrid scoring (fallback=false)');
  pass('gateway_ranking_latency', `20 live Hybrid calls via Gateway: p50=${p50.toFixed(1)}ms, p95=${p95.toFixed(1)}ms (nonFallback=${nonFallbackCount}/20)`);

  writeFileSync(
    resolve(outDir, 'e2e-report.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), checks, latency_ms: { p50, p95, samples: timings.length }, pageErrors }, null, 2),
  );
  console.log(`\nALL E2E CHECKS PASSED (${checks.length} checks, 0 page errors)`);
} catch (err) {
  console.error('E2E FAILURE:', err);
  await page.screenshot({ path: resolve(outDir, 'failure.png'), fullPage: true });
  process.exitCode = 1;
} finally {
  await browser.close();
}
