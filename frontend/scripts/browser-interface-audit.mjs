// Read-only visual regression checks against the real local Gateway.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const base = 'http://127.0.0.1:5173';
const credentials = JSON.parse(readFileSync(new URL('../../backend/infra/.local/p02/demo-accounts.json', import.meta.url), 'utf8'));
const output = new URL('../../backend/infra/.local/p02/interface-audit/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
const errors = [];
let count = 0;
async function inspect(page, name) {
  await page.waitForLoadState('networkidle');
  const problems = await page.evaluate(() => {
    const issues = [];
    const visible = el => el.getBoundingClientRect().width && el.getBoundingClientRect().height;
    if (document.documentElement.scrollWidth > innerWidth + 1) issues.push('document horizontal overflow');
    for (const el of document.querySelectorAll('main input, main select, main textarea, main button')) {
      if (!visible(el) || el.closest('.account-auth-container')) continue;
      const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
      if (rect.left < -1 || rect.right > innerWidth + 1) issues.push(`control overflow: ${el.getAttribute('name') || el.textContent.slice(0, 45)}`);
      if (el.matches('input:not([type]), input[type=text], input[type=number], select, textarea')) {
        if (style.backgroundColor === 'rgb(255, 255, 255)' && style.color !== 'rgb(15, 23, 42)') issues.push('white control on dark surface');
        if (style.backgroundColor === style.color) issues.push('invisible control text');
      }
      if (el.matches('button:not([class])') && style.borderRadius === '0px') issues.push('unstyled native button');
    }
    const bar = document.querySelector('.liquid-glass-container').getBoundingClientRect();
    for (const selector of ['.brand-badge', '.header-account', '.header-logout']) {
      const el = document.querySelector(selector);
      if (!el || !visible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.left < bar.left - 1 || rect.right > bar.right + 1 || rect.top < bar.top - 1 || rect.bottom > bar.bottom + 1) issues.push(`header overflow: ${selector}`);
    }
    return issues;
  });
  if (problems.length) await page.screenshot({ path: fileURLToPath(new URL(`failure-${count}.png`, output)), fullPage: true });
  assert.deepEqual(problems, [], `${name}: ${problems.join('; ')}`);
  count++;
}
try {
  for (const [alias, routes] of [
    ['lan', ['kham-pha', 'ban-do', 'bo-suu-tap', 'chuyen-di', 'thong-bao', 'tai-khoan', 'dong-gop']],
    ['business', ['doanh-nghiep']], ['manager', ['kiem-duyet', 'quan-tri']],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1536, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/tai-khoan`);
    const account = credentials.accounts.find(a => a.alias === alias);
    await page.getByLabel('Email', { exact: true }).fill(account.email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(credentials.password);
    await page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('button', { name: 'Đăng xuất khỏi hệ thống', exact: true }).waitFor();
    for (const route of routes) {
      await page.goto(`${base}/${route}`);
      await page.waitForLoadState('networkidle');
      for (const width of [390, 768, 1064, 1536]) {
        await page.setViewportSize({ width, height: 1000 });
        await inspect(page, `${alias}/${route}/${width}`);
      }
      if (route === 'tai-khoan') {
        for (const tab of ['Hồ sơ cá nhân', 'Bảo mật tài khoản', 'Sở thích & Quyền riêng tư']) {
          await page.getByRole('tab', { name: tab, exact: true }).click();
          for (const width of [390, 1536]) {
            await page.setViewportSize({ width, height: 1000 });
            await inspect(page, `${tab}/${width}`);
          }
        }
      }
      if (route === 'bo-suu-tap') {
        const card = page.locator('article').filter({ has: page.getByRole('heading', { name: 'Cuối tuần khám phá di sản', exact: true }) });
        await card.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
        await page.locator('.collection-item h4').filter({ hasText: 'Văn Miếu Quốc Tử Giám' }).waitFor();
        assert.equal(await page.locator('.collection-item h4').filter({ hasText: /^[0-9a-f]{8}-/ }).count(), 0);
        for (const width of [390, 768, 1536]) {
          await page.setViewportSize({ width, height: 1000 });
          await inspect(page, `collection detail/${width}`);
        }
      }
      await page.screenshot({ path: fileURLToPath(new URL(`${alias}-${route}.png`, output)), fullPage: true });
      console.log(`PASS interface ${alias}/${route}`);
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${count} interface layouts; 10 screens, 3 roles, 4 widths; zero page errors`);
} finally { await browser.close(); }
