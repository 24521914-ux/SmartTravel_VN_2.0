// Cloudflare Pages Function: same-origin reverse proxy for /api/* -> Azure API Gateway.
// Keeps the frontend SPA and API on the exact same origin (FE-P04-01) and hides the backend URL.
interface Env {
  GATEWAY_ORIGIN?: string;
}

const FORWARD_HEADERS = [
  'accept',
  'accept-language',
  'authorization',
  'content-type',
  'idempotency-key',
  'if-match',
  'if-none-match',
  'x-correlation-id',
  'traceparent',
];

export const onRequest = async (context: { request: Request; env: Env }): Promise<Response> => {
  const gatewayOrigin = (context.env.GATEWAY_ORIGIN || '').trim().replace(/\/+$/, '');
  if (!gatewayOrigin) {
    return new Response(
      JSON.stringify({
        code: 'GATEWAY_NOT_CONFIGURED',
        message: 'GATEWAY_ORIGIN environment variable is not configured on Cloudflare Pages',
        traceId: 'cf-pages-proxy',
        fieldErrors: [],
      }),
      { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } }
    );
  }

  const incomingUrl = new URL(context.request.url);
  const targetUrl = `${gatewayOrigin}${incomingUrl.pathname}${incomingUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const val = context.request.headers.get(name);
    if (val !== null) headers.set(name, val);
  }

  const method = context.request.method.toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD';

  const upstream = await fetch(targetUrl, {
    method,
    headers,
    body: hasBody ? context.request.body : undefined,
    redirect: 'manual',
  });

  const respHeaders = new Headers(upstream.headers);
  respHeaders.delete('set-cookie');
  respHeaders.set('cache-control', 'no-store');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
};
