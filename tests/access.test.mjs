import test from 'node:test';
import assert from 'node:assert/strict';
import {
  grantablePages,
  assignableRoles,
  defaultPages,
  sanitizePages,
  canOpen,
  canSwitchRole,
  pageOf,
  adminOnlyPages,
} from '../src/lib/access.ts';
import { initialState, reducer, roleIds, roles } from '../src/lib/domain.ts';

const admin = { role: 'admin', pages: [] };
const writer = (pages) => ({ role: 'writer', pages });

test('an administrator opens every page, including ones nobody can be granted', () => {
  for (const p of [...grantablePages.map((x) => x.id), ...adminOnlyPages, 'account', '', 'components', 'unknown'])
    assert.equal(canOpen(admin, p), true, p);
});

test('Home and Account are always open; other pages need an explicit grant', () => {
  const nobody = writer([]);
  assert.equal(canOpen(nobody, ''), true);
  assert.equal(canOpen(nobody, 'account'), true);
  assert.equal(canOpen(nobody, 'work'), false);
  assert.equal(canOpen(writer(['work']), 'work'), true);
  assert.equal(canOpen(writer(['work']), 'calendar'), false);
});

test('admin pages, the component gallery and unknown pages stay closed to everyone else', () => {
  const everything = writer(grantablePages.map((p) => p.id));
  for (const p of ['admin', 'accounts', 'components', 'nope']) assert.equal(canOpen(everything, p), false, p);
});

test('a page grant cannot give create to a role that lacks it', () => {
  const publisher = { role: 'publisher', pages: ['create', 'approvals'] };
  assert.equal(roles.publisher.create, false);
  assert.equal(canOpen(publisher, 'create'), false);
  assert.equal(canOpen(publisher, 'approvals'), true);
});

test('«حسابات المنصات» goes with «الموافقات والنشر», for the roles that manage or publish on the accounts', () => {
  for (const role of ['director', 'assistant', 'publisher']) {
    assert.equal(canOpen({ role, pages: ['approvals'] }, 'channels'), true, role);
    assert.equal(canOpen({ role, pages: ['work'] }, 'channels'), false, `${role} without approvals`);
  }
  for (const role of ['writer', 'designer', 'producer', 'member']) assert.equal(canOpen({ role, pages: ['approvals'] }, 'channels'), false, role);
  assert.equal(canOpen({ role: 'admin', pages: [] }, 'channels'), true);
});

test('«المشاريع» goes with «العمل» or «التقويم», and «الطلبات» with «العمل», the library or tasks, so existing accounts need no change', () => {
  for (const role of ['director', 'assistant', 'writer', 'designer', 'producer', 'publisher', 'member']) {
    assert.equal(canOpen({ role, pages: ['work'] }, 'projects'), true, `${role} projects with work`);
    assert.equal(canOpen({ role, pages: ['calendar'] }, 'projects'), true, `${role} projects with calendar`);
    assert.equal(canOpen({ role, pages: ['media'] }, 'projects'), false, `${role} projects with media only`);
    assert.equal(canOpen({ role, pages: ['work'] }, 'requests'), true, `${role} requests with work`);
    assert.equal(canOpen({ role, pages: ['media'] }, 'requests'), true, `${role} requests with media`);
    assert.equal(canOpen({ role, pages: ['tasks'] }, 'requests'), true, `${role} requests with tasks`);
    assert.equal(canOpen({ role, pages: ['mail', 'calendar'] }, 'requests'), false, `${role} requests without work, media or tasks`);
  }
  // They are not separate grants, so the accounts page cannot hand them out or take them away.
  assert.deepEqual(sanitizePages(['projects', 'requests', 'work']), ['work']);
  for (const role of ['writer', 'publisher', 'member']) {
    const pages = defaultPages(role);
    assert.equal(canOpen({ role, pages }, 'projects'), true, role);
    assert.equal(canOpen({ role, pages }, 'requests'), true, role);
  }
  assert.equal(canOpen({ role: 'admin', pages: [] }, 'projects'), true);
  assert.equal(canOpen({ role: 'admin', pages: [] }, 'requests'), true);
});

test('only an administrator may switch roles', () => {
  assert.equal(canSwitchRole({ role: 'admin' }), true);
  for (const r of roleIds.filter((x) => x !== 'admin')) assert.equal(canSwitchRole({ role: r }), false, r);
});

test('admin is never an assignable role', () => {
  assert.equal(assignableRoles.includes('admin'), false);
  assert.equal(assignableRoles.length, roleIds.length - 1);
});

test('default pages follow what the role can use', () => {
  assert.equal(defaultPages('writer').includes('create'), true);
  assert.equal(defaultPages('publisher').includes('create'), false);
  assert.equal(defaultPages('publisher').includes('approvals'), true);
});

test('sanitizePages drops unknown ids and duplicates and keeps navigation order', () => {
  assert.deepEqual(sanitizePages(['calendar', 'admin', 'work', 'work', 'zzz']), ['work', 'calendar']);
  assert.deepEqual(sanitizePages(null), []);
});

test('pageOf reads the first path segment', () => {
  assert.equal(pageOf('/'), '');
  assert.equal(pageOf('/work/CH-241'), 'work');
  assert.equal(pageOf('/accounts'), 'accounts');
});

test('a locked session cannot switch role, and reset returns to its own role', () => {
  let s = initialState('writer', true);
  assert.equal(s.role, 'writer');
  s = reducer(s, { type: 'role', role: 'director' });
  assert.equal(s.role, 'writer', 'the role must not change when locked');
  assert.match(s.message, /مسؤول النظام/);
  s = reducer(s, { type: 'reset' });
  assert.equal(s.role, 'writer');
  assert.equal(s.roleLocked, true);
});

test('an administrator session can view as another role and reset returns to admin', () => {
  let s = initialState('admin', false);
  s = reducer(s, { type: 'role', role: 'publisher' });
  assert.equal(s.role, 'publisher');
  s = reducer(s, { type: 'reset' });
  assert.equal(s.role, 'admin');
  assert.equal(s.baseRole, 'admin');
});

test('defaults keep the existing tests valid: director, unlocked', () => {
  const s = initialState();
  assert.equal(s.role, 'director');
  assert.equal(s.roleLocked, false);
});
