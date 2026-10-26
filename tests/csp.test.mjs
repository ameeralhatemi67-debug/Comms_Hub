// The pages' Content-Security-Policy (src/lib/csp.ts, src/proxy.ts; Desktop_App_Plan.md 9, before phase D4).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { buildCsp, newNonce, RESTORE_THEME, scriptHash, wantsPolicy } from '../src/lib/csp.ts';

const parse = (policy) => Object.fromEntries(policy.split('; ').map((d) => {
  const [name, ...values] = d.split(' ');
  return [name, values];
}));

test('scripts need the nonce (or the theme script\'s hash); nothing inline or from another site runs', async () => {
  const hash = await scriptHash(RESTORE_THEME);
  const p = parse(buildCsp({ nonce: 'abc', hashes: [hash], dev: false }));
  assert.deepEqual(p['script-src'], ["'self'", "'nonce-abc'", hash, "'strict-dynamic'", "'wasm-unsafe-eval'"]);
  assert.equal(p['script-src'].includes("'unsafe-inline'"), false);
  assert.equal(p['script-src'].includes("'unsafe-eval'"), false, 'eval only in development');
  assert.deepEqual(p['object-src'], ["'none'"]);
  assert.deepEqual(p['base-uri'], ["'self'"]);
  assert.deepEqual(p['frame-ancestors'], ["'none'"]);
  assert.deepEqual(p['form-action'], ["'self'"]);
});

test('what the site does today stays allowed: uploads and the database over https and wss, workers and media from blobs, the application\'s own addresses', () => {
  const p = parse(buildCsp({ nonce: 'n', hashes: [], dev: false }));
  for (const v of ['https:', 'wss:', 'commshub-file:']) assert.ok(p['connect-src'].includes(v), v);
  for (const v of ['blob:', 'data:', 'commshub-file:']) assert.ok(p['media-src'].includes(v), v);
  assert.ok(p['worker-src'].includes('blob:'), 'photo.ts starts its worker from a blob');
  assert.ok(p['style-src'].includes("'unsafe-inline'"), 'style attributes');
  assert.equal(p['upgrade-insecure-requests'], undefined, 'a local next start on http keeps working');
  const dev = parse(buildCsp({ nonce: 'n', hashes: [], dev: true }));
  assert.ok(dev['script-src'].includes("'unsafe-eval'") && dev['connect-src'].includes('ws:'), 'next dev');
});

test('the theme script\'s hash is the SHA-256 of exactly the text the layout puts in the page', async () => {
  const expected = `'sha256-${crypto.createHash('sha256').update(RESTORE_THEME).digest('base64')}'`;
  assert.equal(await scriptHash(RESTORE_THEME), expected);
  const layout = fs.readFileSync('src/app/layout.tsx', 'utf8');
  assert.ok(layout.includes('<script dangerouslySetInnerHTML={{ __html: RESTORE_THEME }} />'), 'the layout uses the same text');
  assert.equal(/restoreTheme\s*=/.test(layout), false, 'no second copy of it');
});

test('a fresh nonce each time; pages get the policy, the API routes keep their own headers', () => {
  const a = newNonce();
  assert.match(a, /^[A-Za-z0-9+/]{22}==$/);
  assert.notEqual(a, newNonce());
  assert.equal(wantsPolicy('/'), true);
  assert.equal(wantsPolicy('/motion/studio/p1'), true);
  assert.equal(wantsPolicy('/api/media/x/content'), false);
  const proxy = fs.readFileSync('src/proxy.ts', 'utf8');
  assert.match(proxy, /headers\.set\('x-nonce', nonce\)/);
  assert.match(proxy, /response\.headers\.set\('Content-Security-Policy', policy\)/);
});
