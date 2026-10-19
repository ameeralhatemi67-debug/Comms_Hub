// The studio tab of «استوديو الحركة» (MVP_draft.md 62, Studio_Build_Plan.md Phase 1): only the Admin and
// the director open /motion/studio, the server checks it on every navigation, the template tab is
// unchanged for everyone else, and Ctrl+Z inside the studio never reaches the library's undo. The
// database side (studio_can, CAP_FIXED) is run in supabase/tests/studio_access_rules.sql.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canOpenRoute, canOpenStudio, studioTabVisible, defaultPages, STUDIO_CAP } from '../src/lib/access.ts';
import { accessMatrix, MATRIX_ROLES } from '../src/lib/access-matrix.ts';
import { resolve, installedDefault } from '../src/lib/permissions.ts';

/** An account of this role as the database would describe it: default pages, the capabilities it holds. */
const accountOf = (role, pages = defaultPages(role)) => ({
  role,
  pages,
  caps: [STUDIO_CAP].filter((k) => resolve({ role, pages, templates: installedDefault, grants: [] }, k, 0).ok),
});

test('only the Admin and the director open /motion/studio; every role keeps /motion', () => {
  for (const role of MATRIX_ROLES) {
    const a = accountOf(role);
    assert.equal(canOpenRoute(a, ['motion']), true, `${role} keeps the template tab`);
    assert.equal(canOpenRoute(a, ['motion', 'studio']), ['admin', 'director'].includes(role), `${role}: studio`);
    assert.equal(canOpenRoute(a, ['motion', 'studio', 'any-project-id']), ['admin', 'director'].includes(role), `${role}: a project address`);
  }
});

test('the studio goes with the page of «استوديو الحركة»: a director without that page has no studio', () => {
  const dir = accountOf('director', defaultPages('director').filter((p) => p !== 'motion'));
  assert.equal(canOpenStudio(dir), false);
  assert.equal(canOpenRoute(dir, ['motion', 'studio']), false);
  // the administrator opens every page, so the studio too
  assert.equal(canOpenStudio({ role: 'admin', pages: [], caps: [] }), true);
});

test('other addresses are decided as before: the first segment alone', () => {
  const w = accountOf('writer');
  assert.equal(canOpenRoute(w, ['work', 'CH-241']), true);
  assert.equal(canOpenRoute(w, ['settings']), false);
  assert.equal(canOpenRoute(w, []), true, 'Home');
  assert.equal(canOpenRoute(w, ['mail', 'chat']), true);
});

test('the tab bar shows for the Admin and the director, and follows the role an administrator views as', () => {
  for (const role of MATRIX_ROLES) assert.equal(studioTabVisible(accountOf(role)), ['admin', 'director'].includes(role), role);
  const admin = { role: 'admin', pages: [], caps: [STUDIO_CAP] };
  for (const viewAs of MATRIX_ROLES) assert.equal(studioTabVisible(admin, { viewAs }), ['admin', 'director'].includes(viewAs), `admin as ${viewAs}`);
  // the live answer wins for everyone else: a director whose capability read says no sees no tab
  assert.equal(studioTabVisible(accountOf('director'), { hasCap: () => false }), false);
  assert.equal(studioTabVisible(accountOf('writer'), { hasCap: (k) => k === STUDIO_CAP }), true, 'the live answer is the database answer');
});

test('the access table lists the studio for the Admin and the director only', () => {
  const m = accessMatrix();
  const route = m.routes.find((r) => r.id === 'motion/studio');
  assert.ok(route && route.how === 'tab');
  for (const r of m.roles) assert.equal(r.open.includes('motion/studio'), ['admin', 'director'].includes(r.role), r.role);
});

test('the server checks the whole address, and /motion/studio reaches the studio page', () => {
  const page = readFileSync('src/app/[[...slug]]/page.tsx', 'utf8');
  assert.match(page, /canOpenRoute\(session\.account, slug\)/);
  assert.doesNotMatch(page, /canOpen\(session/);
  const hub = readFileSync('src/components/hub-page.tsx', 'utf8');
  assert.match(hub, /import\('\.\/studio\/studio-page'\)/);
  assert.match(hub, /page === 'motion'\) return id === 'studio' \? <StudioPage projectId=\{route\[2\]\} \/> : <MotionStudio \/>/);
});

test('the template tab changes by one line: the tab bar in its title row', () => {
  const ms = readFileSync('src/components/motion-studio.tsx', 'utf8');
  assert.equal(ms.split('<MotionTabs ').length - 1, 1);
  assert.match(ms, /<MotionTabs active="templates" \/>/);
  const tabs = readFileSync('src/components/studio/motion-tabs.tsx', 'utf8');
  assert.match(tabs, /if \(!studioTabVisible\(account, \{ viewAs: state\.role, hasCap: caps\.has \}\)\) return null;/);
  assert.match(tabs, /href="\/motion"/);
  assert.match(tabs, /href="\/motion\/studio"/);
});

test('the sidebar keeps «استوديو الحركة» highlighted on its tabs', () => {
  const shell = readFileSync('src/components/shell.tsx', 'utf8');
  assert.match(shell, /href === '\/motion' && path\.startsWith\('\/motion\/'\)/);
});

test('the database check is the same pair, and nobody outside signed-in accounts can call it', () => {
  const sql = readFileSync('supabase/migrations/20261019120000_studio_access.sql', 'utf8');
  assert.match(sql, /\('motion\.studio',\s*'fixed',[^)]*false, 'none', 3, '\{admin,director\}'/);
  assert.match(sql, /public\.has_capability\('motion\.studio'\) and public\.has_capability\('page\.motion'\)/);
  assert.match(sql, /security definer set search_path = ''/);
  assert.match(sql, /revoke all on function public\.studio_can\(\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.studio_can\(\) to authenticated;/);
});
