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
