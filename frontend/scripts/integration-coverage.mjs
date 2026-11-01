import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Summarize observed Gateway responses; never infer coverage from UI source.
const root = fileURLToPath(new URL('../../', import.meta.url));
const names = ['frontend-browser', 'frontend-account-browser', 'frontend-business-ingestion', 'frontend-admin-browser', 'frontend-media-browser', 'frontend-trip-collection', 'frontend-gateway'];
const responses = [];
const suites = [];
for (const name of names) {
  const path = `${root}/backend/infra/.local/p03/${name}/report.json`;
  if (!existsSync(path)) { suites.push({ suite: name, valid: false, reason: 'missing' }); continue; }
  const report = JSON.parse(readFileSync(path, 'utf8'));
  const valid = report.passed === true || ((report.scope === 'non-ai' || report.suite === 'browser-trip-collection') && report.gaps?.length === 0 && report.page_errors === 0);
  suites.push({ suite: name, valid, timestamp: report.timestamp, checks: report.checks?.length });
  if (valid) responses.push(...(report.api_results ?? []));
}
const operations = [];
for (const service of ['identity', 'catalog', 'community', 'trip', 'ingestion', 'intelligence']) {
  const spec = JSON.parse(readFileSync(`${root}/backend/contracts/openapi/${service}.yaml`, 'utf8'));
  if (service === 'catalog') {
    // Implemented multipart/binary extension, documented separately until the
    // unfrozen candidate inventory includes these operations.
    for (const [method, path] of [['post', '/api/v1/media'], ['post', '/api/v1/admin/media'], ['get', '/api/v1/admin/media/{id}'], ['get', '/api/v1/media/{id}']]) {
      spec.paths[path] ??= {};
      spec.paths[path][method] ??= { operationId: `media-extension-${method}-${path}` };
    }
  }
  for (const [path, methods] of Object.entries(spec.paths)) {
    if (path.startsWith('/internal/')) continue;
    for (const [method, operation] of Object.entries(methods)) {
      if (!operation.operationId) continue;
      const pattern = new RegExp(`^/api/${service}${path.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{[^}]+\}/g, '[^/]+')}$`);
      const observed = responses.filter(response => response.method.toLowerCase() === method && pattern.test(response.path));
      operations.push({ service, method: method.toUpperCase(), path, statuses: [...new Set(observed.map(response => response.status))].sort(), positive: observed.some(response => response.status >= 200 && response.status < 300) });
    }
  }
}
console.log(JSON.stringify({ suites, operations, positive: operations.filter(o => o.positive).length, observed: operations.filter(o => o.statuses.length).length, total: operations.length }, null, 2));
