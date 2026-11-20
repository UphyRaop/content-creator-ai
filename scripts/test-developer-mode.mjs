import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { registerHooks } from 'node:module';

const directory = mkdtempSync(join(tmpdir(), 'ccai-devmode-test-'));
process.env.CCAI_DATABASE_PATH = join(directory, 'auth.sqlite');
process.env.CCAI_BOOTSTRAP_TOKEN = 'developer-mode-test-bootstrap';
process.env.NODE_ENV = 'test';
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') return nextResolve('next/server.js', context);
  if (specifier.startsWith('@/lib/')) return nextResolve(resolve('src/lib', `${specifier.slice('@/lib/'.length)}.ts`), context);
  if (context.parentURL?.includes('/src/') && (specifier.startsWith('./') || specifier.startsWith('../')) && !/\.[cm]?[jt]sx?$/.test(specifier)) { try { return nextResolve(`${specifier}.ts`, context); } catch {} }
  return nextResolve(specifier, context);
} });

try {
  const auth = await import('../src/lib/auth-store.ts');
  const owner = auth.bootstrapOwner(process.env.CCAI_BOOTSTRAP_TOKEN, 'devmode@example.test', 'developer-mode-test-password');
  const session = auth.createSession(owner.id);
  const cookie = `ccai_session=${session.token}`;
  const route = await import('../src/app/api/developer-mode/route.ts');
  const origin = 'https://app.example.test';
  const request = (method, headers = {}) => new Request(`${origin}/api/developer-mode`, { method, headers });

  assert.equal((await route.GET(request('GET'))).status, 401, 'status requires an authenticated owner');
  assert.equal((await route.POST(request('POST', { cookie }))).status, 403, 'mutations require same-origin');
  const status = await route.GET(request('GET', { cookie }));
  assert.equal(status.status, 503, 'developer mode stays disabled without reauthentication support');
  assert.equal((await status.json()).enabled, false);
  const activation = await route.POST(request('POST', { cookie, origin }));
  assert.equal(activation.status, 503, 'a valid session alone cannot activate developer mode');
  assert.equal((await activation.json()).available, false);
  assert.equal((await route.POST(new Request(`${origin}/api/developer-mode`, { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify({ enabled: true }) }))).status, 403, 'caller flags cannot activate developer mode');

  const expired = auth.createSession(owner.id, new Date('2026-11-01T00:00:00.000Z'));
  const expiredStatus = await route.GET(request('GET', { cookie: `ccai_session=${expired.token}` }));
  assert.equal(expiredStatus.status, 401, 'expired sessions cannot inspect or activate developer mode');
  console.log('PASS developer-mode endpoint is owner-authenticated, same-origin, session-expiring, and disabled without reauthentication');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
