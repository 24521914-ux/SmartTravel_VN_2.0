import assert from 'node:assert/strict';
import { chromium, expect } from '@playwright/test';

// Isolated component QA: synthetic HTTP responses, no account or real writes.
const browser = await chromium.launch();
const page = await browser.newPage();
let passed = 0;
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ json: { items: [], next_cursor: null } }));
  await page.goto(process.env.P02_FRONTEND_URL ?? 'http://127.0.0.1:5173');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { CollectionsPanel } = await import('/src/features/collections/CollectionsPanel.tsx');
    const { ToastProvider } = await import('/src/app/providers/ToastProvider.tsx');
    const { ApiClient } = await import('/src/api/client.ts');
    const { TravelClient } = await import('/src/api/travel.ts');
    window.collectionTest = { requests: [], writes: [], items: [] };
    const col = { id: 'collection-test', name: 'Province test', visibility: 'PRIVATE', version: 1 };
    const fetchImpl = async (input, init) => {
      const url = new URL(input, location.origin);
      const state = window.collectionTest;
      state.requests.push(url.pathname + url.search);
      let body;
      if (url.pathname.endsWith('/geographic-units')) body = { items: [
        { id: 'province-a', name: 'Tỉnh A', level: 'PROVINCE' },
        { id: 'province-empty', name: 'Tỉnh B', level: 'PROVINCE' },
        { id: 'province-error', name: 'Tỉnh C', level: 'PROVINCE' },
        { id: 'district', name: 'Huyện', level: 'DISTRICT' },
      ] };
      else if (url.pathname.endsWith('/places')) {
        const province = url.searchParams.get('geographicUnitId');
        if (province === 'province-error') return new Response(JSON.stringify({ code: 'TEST_ERROR', message: 'Synthetic search failure' }), { status: 503 });
        body = province === 'province-a' ? url.searchParams.has('cursor')
          ? { items: [{ id: 'place-2', name: 'Place two' }], next_cursor: null }
          : { items: [{ id: 'place-1', name: 'Place one' }], next_cursor: 'opaque+cursor' }
          : { items: [] };
      } else if (url.pathname.endsWith('/items')) {
        if (init.method === 'POST') { const write = JSON.parse(init.body); state.writes.push(write); state.items.push({ ...write, id: 'item-1' }); body = state.items[0]; }
        else body = { items: state.items };
      } else if (url.pathname.endsWith('/me/collections')) body = { items: [col] };
      else if (url.pathname.includes('/places/')) body = { name: 'Place one' };
      else body = col;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    document.querySelector('#root').style.display = 'none';
    const host = document.createElement('div'); host.id = 'collection-test-root'; document.body.append(host);
    ReactDOM.createRoot(host).render(React.createElement(ToastProvider, null, React.createElement(CollectionsPanel, { travel: new TravelClient(new ApiClient({ fetchImpl })) })));
  });
  const host = page.locator('#collection-test-root');
  await host.getByRole('button', { name: 'Xem chi tiết', exact: true }).click();
  const province = host.getByRole('combobox', { name: /^Tỉnh\/thành cho bộ sưu tập/ });
  const place = host.getByRole('combobox', { name: /^Địa điểm/ });
  const note = host.getByLabel('Ghi chú', { exact: true });
  const search = host.getByRole('button', { name: 'Tìm địa điểm', exact: true });
  const add = host.getByRole('button', { name: 'Thêm địa điểm vào bộ sưu tập', exact: true });
  await expect(province.locator('option')).toHaveCount(4);
  await expect(place).toBeDisabled(); await expect(note).toBeDisabled(); await expect(search).toBeDisabled(); await expect(add).toBeDisabled();
  passed++; console.log('PASS initial province-only choices and disabled fields');
  await province.selectOption('province-a'); await expect(place).toBeDisabled();
  await search.click(); await expect(place.locator('option')).toHaveCount(3);
  await expect(host.getByRole('status')).toContainText('2 địa điểm');
  assert.ok((await page.evaluate(() => window.collectionTest.requests)).some(url => url.includes('geographicUnitId=province-a') && url.includes('cursor=opaque%2Bcursor')));
  passed++; console.log('PASS province filter, full pagination and count');
  await place.selectOption('place-1'); await note.fill('Synthetic selected place note'); await add.click();
  await expect(host.locator('.collection-items')).toContainText('Synthetic selected place note');
  assert.deepEqual(await page.evaluate(() => window.collectionTest.writes), [{ place_id: 'place-1', note: 'Synthetic selected place note' }]);
  passed++; console.log('PASS selected place and note posted together');
  await province.selectOption('province-empty'); await expect(place).toBeDisabled(); await expect(note).toHaveValue('');
  await search.click(); await expect(host.getByRole('status')).toContainText('Chưa có địa điểm'); await expect(place).toBeDisabled();
  passed++; console.log('PASS province change clears selection and empty results stay disabled');
  await province.selectOption('province-error'); await search.click();
  await expect(host.getByRole('alert').filter({ hasText: 'Synthetic search failure' })).toBeVisible();
  await expect(place).toBeDisabled(); await expect(add).toBeDisabled(); await expect(search).toBeEnabled();
  assert.deepEqual(errors, []);
  passed++; console.log('PASS search error keeps dependent controls disabled and allows retry');
  console.log(`PASS collection province: ${passed} checks; synthetic HTTP; no secrets or real writes`);
} catch (error) {
  console.error(await page.locator('#collection-test-root').innerText());
  console.error(await page.evaluate(() => window.collectionTest?.requests));
  throw error;
} finally { await browser.close(); }
