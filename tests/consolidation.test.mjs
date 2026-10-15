// Action_Plan.md, Part B, step B1: the menu and the routes after «الإدارة» was dissolved,
// «الحساب» moved to the name badge, «الحسابات المرتبطة» renamed and «التحليلات» hidden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (p) => readFileSync(p, 'utf8');
const shell = read('src/components/shell.tsx');
const navBlock = shell.slice(shell.indexOf('const nav = ['), shell.indexOf('] as const;'));

test('the menu no longer lists «الإدارة», «الحساب» or «التحليلات»', () => {
  for (const href of ['/admin', '/account', '/analytics']) assert.doesNotMatch(navBlock, new RegExp(`'${href}'`), href);
  for (const href of ['/accounts', '/settings', '/channels', '/monitoring', '/activity'])
    assert.match(navBlock, new RegExp(`'${href}'`), href);
});

test('«الحساب» is reached from the name badge, in the sidebar and in the phone menu', () => {
  assert.match(shell, /<Link\s+href="\/account"\s+className=\{`account-link/);
  assert.match(shell, /account-menu-link/);
  const css = read('src/app/globals.css');
  assert.match(css, /\.account-link\{/);
  assert.match(css, /\.collapsed \.sidebar-foot \.who\{display:none\}/, 'collapsed keeps the badge, hides the words');
});

test('«الحسابات المرتبطة» is «حسابات المنصات» everywhere a person reads it', () => {
  const walk = (d) =>
    readdirSync(d).flatMap((f) => {
      const p = join(d, f);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx|css)$/.test(p) ? [p] : [];
    });
  const left = walk('src').filter((p) => read(p).includes('الحسابات المرتبطة'));
  assert.deepEqual(left, []);
  assert.match(navBlock, /'\/channels', 'حسابات المنصات'/);
});

test('/admin sends a visitor to «الحسابات», and no page or guide is left for it', () => {
  const page = read('src/app/[[...slug]]/page.tsx');
  assert.match(page, /slug\[0\] === 'admin'\) redirect\('\/accounts'\)/);
  assert.doesNotMatch(read('src/components/hub-page.tsx'), /'admin'/);
  assert.doesNotMatch(read('src/lib/help/registry.ts'), /\/admin/);
  assert.doesNotMatch(read('src/components/supporting.tsx'), /page === 'admin'/);
});
