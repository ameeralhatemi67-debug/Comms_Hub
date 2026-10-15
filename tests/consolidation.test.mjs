// Action_Plan.md, Part B, step B1: the menu and the routes after «الإدارة» was dissolved,
// «الحساب» moved to the name badge, «الحسابات المرتبطة» renamed and «التحليلات» hidden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { canOpen } from '../src/lib/access.ts';
import { teamSummary } from '../src/lib/media/team.ts';

const read = (p) => readFileSync(p, 'utf8');
const shell = read('src/components/shell.tsx');
const navBlock = shell.slice(shell.indexOf('const nav = ['), shell.indexOf('] as const;'));

test('the menu no longer lists «الإدارة», «الحساب» or «التحليلات»', () => {
  for (const href of ['/admin', '/account', '/analytics', '/monitoring']) assert.doesNotMatch(navBlock, new RegExp(`'${href}'`), href);
  for (const href of ['/accounts', '/settings', '/channels', '/activity'])
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

// Step B2: «المراقبة» joined «سجل النشاط».
test('/monitoring sends a visitor to «سجل النشاط» and its page and guide are gone', () => {
  assert.match(read('src/app/[[...slug]]/page.tsx'), /slug\[0\] === 'monitoring'\) redirect\('\/activity'\)/);
  assert.doesNotMatch(read('src/components/supporting.tsx'), /page === 'monitoring'/);
  assert.doesNotMatch(read('src/components/hub-page.tsx'), /'monitoring'/);
  assert.doesNotMatch(read('src/lib/help/registry.ts'), /monitoring/);
});

test('the old «المراقبة» grant still opens «سجل النشاط», so nobody loses a page', () => {
  const writer = { role: 'writer', pages: ['monitoring'], caps: [] };
  assert.equal(canOpen(writer, 'activity'), true);
  assert.equal(canOpen({ role: 'writer', pages: ['work'], caps: [] }, 'activity'), false);
  assert.equal(canOpen({ role: 'writer', pages: ['activity'], caps: [] }, 'activity'), true);
});

test('the team panel counts what the rows say: last action, the week, open and late tasks', () => {
  const now = new Date('2026-10-15T12:00:00Z');
  const people = [
    { email: 'a@x', display_name: 'أ', role: 'writer' },
    { email: 'b@x', display_name: 'ب', role: 'designer' },
    { email: 'c@x', display_name: 'ج', role: 'member' },
  ];
  const rows = [
    { at: '2026-10-15T10:00:00Z', actor_email: 'a@x' },
    { at: '2026-10-12T10:00:00Z', actor_email: 'a@x' },
    { at: '2026-10-01T10:00:00Z', actor_email: 'b@x' },
  ];
  const tasks = [
    { assignee: 'a@x', status: 'open', due: '2026-10-14T00:00:00Z' },
    { assignee: 'a@x', status: 'open', due: '2026-10-20T00:00:00Z' },
    { assignee: 'a@x', status: 'done', due: '2026-10-01T00:00:00Z' },
  ];
  const t = teamSummary(people, rows, tasks, now);
  assert.deepEqual(t.map((x) => x.email), ['a@x', 'b@x', 'c@x'], 'latest first, silent people last');
  assert.deepEqual([t[0].week, t[0].open, t[0].late], [2, 2, 1]);
  assert.deepEqual([t[1].week, t[1].last], [0, '2026-10-01T10:00:00Z']);
  assert.equal(t[2].last, null);
});

test('the team panel is for those who see the whole log, and writes nothing', () => {
  const page = read('src/components/media/activity-page.tsx');
  assert.match(page, /\{all && team\.length > 0 && \(/);
  assert.match(page, /teamSummary\(m\.people, rows \?\? \[\], m\.tasks\)/);
  assert.doesNotMatch(read('src/lib/media/team.ts'), /supabase|fetch\(/);
});

// Step B3: settings is the system's page, appearance is the person's.
test('«الإعدادات» keeps only its real tabs, and the display-only ones are gone', () => {
  const sup = read('src/components/supporting.tsx');
  const list = sup.slice(sup.indexOf('const settingsSections = ['), sup.indexOf('];', sup.indexOf('const settingsSections = [')));
  const ids = [...list.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]);
  assert.deepEqual(ids, ['general', 'storage', 'backups', 'platforms', 'whatsapp', 'audit']);
  for (const gone of ['organization', 'language', 'publishing', 'ai'])
    assert.doesNotMatch(sup, new RegExp(`settingsTab === '${gone}'`), gone);
  assert.doesNotMatch(sup, /REAL_SETTINGS/);
  assert.doesNotMatch(sup, /useState\(true\)/, 'the two switches that did nothing are gone');
});

test('the appearance choices are on «الحساب» and still kept in the browser only', () => {
  assert.match(read('src/components/supporting.tsx'), /<AppearancePanel \/>/);
  const panel = read('src/components/appearance-panel.tsx');
  assert.match(panel, /toggleIdentity/);
  assert.match(panel, /setTheme/);
  assert.doesNotMatch(panel, /supabase|fetch\(/);
});
