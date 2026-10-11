interface MiddlewareEnv {
  ASSETS: { fetch: (input: Request | URL | string) => Promise<Response> };
  BACKEND_URL?: string;
}

const open = [/^\/$/, /^\/index\.html$/, /^\/404(\.html)?$/, /^\/_astro\//, /^\/fonts\//, /^\/images\//, /^\/favicon\.svg$/, /^\/waitlist$/, /^\/\.well-known\//];
const ttlMs = 15_000;
let cached: { at: number; on: boolean } | null = null;

async function switchedOn(env: MiddlewareEnv): Promise<boolean> {
  if (cached && Date.now() - cached.at < ttlMs) return cached.on;
  let on = false;
  try {
    const response = await fetch(`${env.BACKEND_URL ?? "https://hl-api.opencash.in"}/health`, { cf: { cacheTtl: 0 } } as RequestInit);
    on = response.ok && ((await response.json()) as { killed?: boolean }).killed === true;
  } catch {
    on = false;
  }
  cached = { at: Date.now(), on };
  return on;
}

export async function onRequest(context: { request: Request; env: MiddlewareEnv; next: () => Promise<Response> }): Promise<Response> {
  const path = new URL(context.request.url).pathname;
  if (open.some((pattern) => pattern.test(path)) || !(await switchedOn(context.env))) return context.next();
  const page = await context.env.ASSETS.fetch(new URL("/404.html", context.request.url));
  return new Response(page.body, { status: 404, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
