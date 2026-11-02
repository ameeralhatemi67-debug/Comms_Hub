// Action_Plan.md B4: who sees which page, by role, written down as an expectation and held against the
// rules. The expectation below is the table kept in MVP_draft.md ("Access by role"); a change to
// src/lib/access.ts, the role defaults or the capability templates that moves a page to a role the table
// does not name fails here, and is then either a mistake or a decision to record in progress.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accessMatrix, MATRIX_ROLES } from '../src/lib/access-matrix.ts';
import { menuEntries, menuFor, canOpen, defaultPages, createStarts, mayCreate } from '../src/lib/access.ts';
import { resolve, installedDefault, createsContent, givesCreate, notOnce, switchWhy } from '../src/lib/permissions.ts';
import { roles } from '../src/lib/domain.ts';

const m = accessMatrix();
const byRole = Object.fromEntries(m.roles.map((r) => [r.role, r]));
const order = menuEntries.map((e) => (e.href === '/' ? '' : e.href.slice(1)));
const inOrder = (set) => order.filter((id) => set.includes(id));

// Pages every role opens by default. «settings» is the administrator's alone (Action_Plan.md B4b):
// another person has it only with the page grant or by holding «settings.view» or «settings.manage».
const COMMON = ['', 'work', 'approvals', 'calendar', 'projects', 'requests', 'media', 'tasks', 'activity', 'analytics', 'motion', 'mail', 'ideas'];
const EXPECTED_MENU = {
  admin: [...COMMON, 'settings', 'channels', 'accounts'],
  // The director and the assistant open «الحسابات» by the capability the templates give them (P2);
  // «الإعدادات» opens for the director by settings.view (2026-10-15 decision).
  director: [...COMMON, 'settings', 'create', 'channels', 'accounts'],
  assistant: [...COMMON, 'create', 'channels', 'accounts'],
  writer: [...COMMON, 'create'],
  designer: COMMON,
  producer: [...COMMON, 'create'],
  publisher: [...COMMON, 'channels'],
  member: COMMON,
};

test('the sidebar each role starts with is exactly the written table', () => {
  assert.deepEqual(Object.keys(byRole).sort(), [...MATRIX_ROLES].sort());
  for (const role of MATRIX_ROLES) assert.deepEqual(byRole[role].menu, inOrder(EXPECTED_MENU[role]), role);
});

test('by address a role opens its menu and its own page; only the administrator opens the rest', () => {
  for (const role of MATRIX_ROLES) {
    const want = new Set([...EXPECTED_MENU[role], 'account']);
    if (role === 'admin') want.add('create'); // opens it by address, never offered it in the menu
    // «الاستوديو», the studio tab of «استوديو الحركة» (MVP_draft.md 62): the Admin's and the director's only.
    if (['admin', 'director'].includes(role)) want.add('motion/studio');
    assert.deepEqual([...byRole[role].open].sort(), [...want].sort(), role);
  }
});

test('«الحسابات» and «حسابات المنصات» are not given to the wrong roles', () => {
  for (const role of MATRIX_ROLES) {
    assert.equal(byRole[role].menu.includes('accounts'), ['admin', 'director', 'assistant'].includes(role), `${role}: accounts`);
    assert.equal(byRole[role].menu.includes('channels'), ['admin', 'director', 'assistant', 'publisher'].includes(role), `${role}: channels`);
  }
  // «حسابات المنصات» goes with «الموافقات والنشر»: without that page the entry goes.
  assert.equal(canOpen({ role: 'publisher', pages: ['work'], caps: [] }, 'channels'), false);
});

test('creating is for the roles that create, and a page grant cannot give it to the others', () => {
  for (const role of ['admin', 'publisher']) assert.equal(byRole[role].menu.includes('create'), false, role);
  assert.equal(canOpen({ role: 'publisher', pages: [...defaultPages('publisher'), 'create'], caps: [] }, 'create'), false);
});

test("an administrator viewing as a role sees that role's creating and accounts entries", () => {
  for (const [role, menu] of Object.entries(m.adminViewAs)) {
    assert.equal(menu.includes('create'), createStarts.includes(role), `${role}: create`);
    assert.equal(menu.includes('accounts'), ['admin', 'director', 'assistant'].includes(role), `${role}: accounts`);
    assert.equal(menu.includes('settings') && menu.includes('channels'), true, `${role}: the administrator still opens every page`);
  }
});

test('the whole log and the team panel are for the administrator and the director by default', () => {
  for (const role of MATRIX_ROLES) assert.equal(byRole[role].activity, ['admin', 'director'].includes(role) ? 'whole' : 'own', role);
});

test("the capabilities held by default are the administrator's, the leaders' and the publisher's, and nobody else's", () => {
  const holders = Object.fromEntries(m.capabilities.map((c) => [c.key, c.heldBy]));
  assert.deepEqual(holders['accounts.view'], ['admin', 'director', 'assistant']);
  // The Director connects the platforms, the mail and the storage from the site (owner decision of 2026-10-15).
  for (const k of ['settings.view', 'settings.manage', 'storage.manage', 'platforms.manage', 'integrations.secrets'])
    assert.deepEqual(holders[k], ['admin', 'director'], k);
  for (const k of ['storage.migrate', 'backups.run', 'backups.restore']) assert.deepEqual(holders[k], ['admin'], k);
  assert.deepEqual(holders['whatsapp.system.manage'], ['admin', 'director'], 'the Director sets up the WhatsApp bridge from the site');
  assert.deepEqual(holders['work.publish'], ['admin', 'publisher']);
  assert.deepEqual(holders['work.approve'], ['admin', 'director', 'assistant']);
  assert.deepEqual(holders['urgency.3'], ['admin', 'director', 'assistant']);
  assert.deepEqual(holders['motion.studio'], ['admin', 'director'], 'the studio, by the owner decision of 2026-10-19');
  assert.deepEqual(holders['whatsapp.push'], [], 'nobody holds the WhatsApp push by default (D-13)');
});

test('«الإعدادات» is the administrator\'s by default, and opens for others only with the page grant or a settings capability', () => {
  for (const role of MATRIX_ROLES) assert.equal(defaultPages(role).includes('settings'), role === 'admin', role);
  const writer = { role: 'writer', pages: defaultPages('writer'), caps: [] };
  assert.equal(canOpen(writer, 'settings'), false);
  assert.equal(menuFor(writer).some((e) => e.href === '/settings'), false);
  // the page grant still opens it
  assert.equal(canOpen({ ...writer, pages: [...writer.pages, 'settings'] }, 'settings'), true);
  // so does either capability, in the page guard and in the menu (read live)
  for (const cap of ['settings.view', 'settings.manage']) {
    assert.equal(canOpen({ ...writer, caps: [cap] }, 'settings'), true, cap);
    assert.equal(menuFor(writer, { hasCap: (k) => k === cap }).some((e) => e.href === '/settings'), true, cap);
  }
  // a storage capability alone does not open the page (the owner named settings.view and settings.manage)
  assert.equal(canOpen({ ...writer, caps: ['storage.manage'] }, 'settings'), false);
});

const grant = (effect) => [{ id: 'g', k: 'page.create', mode: 'standing', effect, until: null, uses: null, scope: null }];
const templates = (on) => (role, key) => (key === 'page.create' ? on.includes(role) : installedDefault(role, key));

test('«إنشاء»: the designer and the member start without it and can be given it', () => {
  assert.deepEqual([...createStarts].sort(), ['assistant', 'director', 'producer', 'writer']);
  for (const role of ['designer', 'member']) {
    assert.equal(defaultPages(role).includes('create'), false, role);
    assert.equal(resolve({ role, pages: [], templates: installedDefault, grants: [] }, 'page.create', 0).ok, false, role);
    assert.equal(byRole[role].menu.includes('create'), false, role);
    assert.equal(resolve({ role, pages: [], templates: installedDefault, grants: grant('allow') }, 'page.create', 0).src, 'added', 'one person');
    assert.equal(resolve({ role, pages: [], templates: templates([role]), grants: [] }, 'page.create', 0).src, 'role', 'the whole role');
    assert.equal(resolve({ role, pages: [], templates: templates([role]), grants: grant('deny') }, 'page.create', 0).ok, false, 'one person off while the role is on');
    assert.equal(canOpen({ role, pages: ['create'], caps: [] }, 'create'), true, 'the session adds the page when the permission is held');
    assert.equal(menuFor({ role, pages: ['create'], caps: [] }, { viewAs: role }).some((e) => e.href === '/create'), true, role);
  }
  assert.equal(resolve({ role: 'publisher', pages: [], templates: templates(['publisher']), grants: grant('allow') }, 'page.create', 0).ok, false, 'never the publisher');
});

test('«إنشاء» is not the ability to create content: uploads stay with the role', () => {
  for (const role of ['designer', 'member']) assert.equal(roles[role].create, true, role);
  assert.equal(createsContent('designer'), true);
  assert.equal(createsContent('publisher'), false);
});

test('mayCreate: a person answers for themself, an administrator viewing as a role sees that role', () => {
  const admin = { role: 'admin' };
  assert.equal(mayCreate({ role: 'designer' }, 'designer', true), true);
  assert.equal(mayCreate({ role: 'designer' }, 'designer', false), false);
  assert.equal(mayCreate({ role: 'publisher' }, 'publisher', true), false);
  assert.equal(mayCreate(admin, 'admin', true), false, 'the administrator is not offered it as themself');
  assert.equal(mayCreate(admin, 'writer', true), true);
  assert.equal(mayCreate(admin, 'designer', true), false);
  assert.equal(mayCreate(admin, 'designer', true, (r) => r === 'designer'), true, 'read live when a role is switched on');
  assert.equal(menuFor({ role: 'admin', pages: [], caps: [] }, { viewAs: 'designer', roleCreates: (r) => r === 'designer' }).some((e) => e.href === '/create'), true);
});

test('only the Admin and the Director give «إنشاء», in the interface and the database', () => {
  for (const r of ['admin', 'director']) assert.equal(givesCreate(r), true, r);
  for (const r of ['assistant', 'writer', 'designer', 'member']) assert.equal(givesCreate(r), false, r);
  const sql = readFileSync('supabase/migrations/20261102200000_create_access.sql', 'utf8');
  assert.match(sql, /is distinct from 'admin' and public\.media_my_role\(\) is distinct from 'director'/);
  for (const fn of ['grant_capability', 'set_member_override', 'revoke_capability', 'revoke_all_capabilities', 'set_role_default', 'perm_may_decide', 'request_capability', 'work_create'])
    assert.ok(sql.includes(`public.${fn}(`), fn);
  assert.match(sql, /has_capability\(''page\.create''\)/);
  assert.match(sql, /revoke all on function public\.perm_create_giver\(text\) from public, anon, authenticated/);
  assert.match(switchWhy('page.create', { src: 'none', id: null }, 'designer', false, true, 'assistant'), /مدير الاتصال/);
  assert.equal(switchWhy('page.create', { src: 'none', id: null }, 'designer', false, true, 'director'), '');
  assert.equal(notOnce({ key: 'page.create', scope: 'none' }), true);
  assert.equal(notOnce({ key: 'urgency.2', scope: 'none' }), false);
});

test('every place that offers creating asks the same rule', () => {
  for (const f of ['home', 'work/list', 'work/projects', 'work/requests', 'work/day-dialogs', 'mail/mail-page', 'work/create']) {
    const text = readFileSync(`src/components/${f}.tsx`, 'utf8');
    assert.match(text, /useCanCreate\(\)/, f);
    assert.doesNotMatch(text, f === 'work/create' ? /canCreateWork/ : /roles\[[a-z.]+\]\.create|canCreateWork/, f);
  }
  assert.match(readFileSync('src/components/ideas.tsx', 'utf8'), /canOpen\(account, 'create'\)/);
  assert.match(readFileSync('src/components/no-access.tsx', 'utf8'), /needProps\('page\.create'/);
});

test('the shell draws its menu from menuFor and has an icon for every entry', () => {
  const shell = readFileSync('src/components/shell.tsx', 'utf8');
  assert.match(shell, /menuFor\(account, \{ viewAs: state\.role, hasCap: caps\.has, roleCreates \}\)/);
  assert.doesNotMatch(shell, /canOpen\(/);
  for (const e of menuEntries) assert.ok(shell.includes(`'${e.href}':`), `icon for ${e.href}`);
  const own = { role: 'member', pages: defaultPages('member'), caps: [] };
  assert.deepEqual(menuFor(own).map((e) => e.href), menuFor(own, { viewAs: 'member' }).map((e) => e.href));
});
