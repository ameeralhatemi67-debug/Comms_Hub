import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CAPABILITIES,
  installedDefault,
  resolve,
  manageBlock,
  assignableBy,
  rankOf,
  sourceLine,
  grantPreview,
  permError,
  capLabel,
} from '../src/lib/permissions.ts';
import { canOpen } from '../src/lib/access.ts';
import { roleIds } from '../src/lib/domain.ts';
import { noticeHref } from '../src/lib/work/rules.ts';

const sql = readFileSync('supabase/migrations/20261013150000_permissions.sql', 'utf8');
// Settings and integrations add theirs (Settings_Integrations_Plan.md, Step S1).
const intSql = readFileSync('supabase/migrations/20261014120000_integrations.sql', 'utf8');

/** The catalog rows of the migration's insert, parsed. */
function seeded() {
  const block = sql.slice(sql.indexOf('insert into public.capabilities'), sql.indexOf('-- Role templates equal'))
    + intSql.slice(intSql.indexOf('insert into public.capabilities'), intSql.indexOf('insert into public.role_capabilities'));
  const rows = [];
  // A later migration removes a page from the catalogue (Action_Plan.md B6, «المراقبة» folded into «سجل النشاط»).
  const foldSql = readFileSync('supabase/migrations/20261015170000_fold_monitoring.sql', 'utf8');
  const removed = [...foldSql.matchAll(/delete from public\.capabilities where key = '([a-z0-9.]+)'/g)].map((m) => m[1]);
  const re = /\('([a-z0-9.]+)',\s*'(\w+)',\s*'([^']+)',\s*(true|false),\s*'(\w+)',\s*(\d),\s*'\{([a-z,]*)\}',\s*(null|'[^']*'),\s*(\d+)\)/g;
  for (const m of block.matchAll(re))
    rows.push({ key: m[1], grp: m[2], label: m[3], grantable: m[4] === 'true', scope: m[5], minRank: Number(m[6]), fixedRoles: m[7] ? m[7].split(',') : [], why: m[8] === 'null' ? undefined : m[8].slice(1, -1), sort: Number(m[9]) });
  return rows.filter((r) => !removed.includes(r.key));
}

test('the catalog in TypeScript is the catalog the database seeds', () => {
  const db = seeded();
  assert.equal(db.length, CAPABILITIES.length, 'same number of capabilities');
  for (const c of CAPABILITIES) {
    const d = db.find((x) => x.key === c.key);
    assert.ok(d, c.key);
    assert.deepEqual({ ...d }, { key: c.key, grp: c.grp, label: c.label, grantable: c.grantable, scope: c.scope, minRank: c.minRank, fixedRoles: c.fixedRoles, why: c.why, sort: c.sort }, c.key);
  }
});

test('approval and publishing are fixed by the reference and explain why (D-9)', () => {
  for (const k of ['work.approve', 'work.publish', 'media.approve', 'approve.own', 'urgency.3']) {
    const c = CAPABILITIES.find((x) => x.key === k);
    assert.equal(c.grantable, false, k);
    assert.ok(c.why && /[؀-ۿ]/.test(c.why), `${k} has its reason in Arabic`);
  }
  assert.deepEqual(CAPABILITIES.find((x) => x.key === 'urgency.3').fixedRoles, ['admin', 'director', 'assistant'], 'D-4');
  assert.deepEqual(CAPABILITIES.find((x) => x.key === 'approve.own').fixedRoles, [], 'nobody approves what they sent');
});

test('installed role templates equal what the migrations leave in role_capabilities', () => {
  const grantable = CAPABILITIES.filter((c) => c.grantable && c.scope !== 'page').map((c) => c.key);
  for (const k of grantable) assert.equal(installedDefault('admin', k), k !== 'whatsapp.push', `admin ${k}`);
  for (const role of ['writer', 'designer', 'producer', 'publisher', 'member'])
    assert.deepEqual(grantable.filter((k) => installedDefault(role, k)), [], role);
  // The same cases appear in the migration's seed.
  assert.match(sql, /when c\.key = 'whatsapp\.push' then false/);
  assert.match(sql, /when c\.key in \('urgency\.2','mail\.outside\.send','room\.create'\) then r in \('director','assistant'\)/);
  // Step P2 and the owner decision of 2026-10-15 add to the director's and the assistant's.
  const p2 = readFileSync('supabase/migrations/20261013160000_permissions_accounts.sql', 'utf8');
  const fromP2 = (role) => [...p2.matchAll(new RegExp(`\\('${role}','([a-z.]+)'\\)`, 'g'))].map((m) => m[1]);
  const b9 = readFileSync('supabase/migrations/20261015180000_director_connection_rights.sql', 'utf8');
  const fromB9 = [...b9.slice(b9.indexOf('with wanted'), b9.indexOf('changed as')).matchAll(/\('([a-z.]+)'\)/g)].map((m) => m[1]);
  const seed = ['urgency.2', 'mail.outside.send', 'room.create'];
  assert.deepEqual([...grantable.filter((k) => installedDefault('assistant', k))].sort(), [...seed, ...fromP2('assistant')].sort());
  assert.deepEqual([...grantable.filter((k) => installedDefault('director', k))].sort(), [...seed, ...fromP2('director'), ...fromB9].sort());
  // The Director, and nobody below, enters the platforms' apps and secrets by default.
  for (const k of ['platforms.manage', 'integrations.secrets', 'settings.view', 'settings.manage', 'storage.manage'])
    assert.equal(installedDefault('assistant', k), false, `assistant ${k}`);
  for (const k of ['storage.migrate', 'backups.run', 'backups.restore']) assert.equal(installedDefault('director', k), false, `director ${k}`);
});

const NOW = Date.parse('2026-10-13T09:00:00Z');
const later = (h) => new Date(NOW + h * 3600e3).toISOString();
const person = (role, grants = [], pages = ['work']) => ({ role, pages, templates: installedDefault, grants });

test('layers: the role, then a standing override, then temporary, then one-time; fixed rules last', () => {
  assert.deepEqual(resolve(person('director'), 'urgency.2', NOW), { ok: true, src: 'role', until: null, uses: null, id: null });
  const deny = { id: 'd', k: 'urgency.2', mode: 'standing', effect: 'deny', until: null, uses: null, scope: null };
  assert.equal(resolve(person('director', [deny]), 'urgency.2', NOW).src, 'removed', 'a deny beats the role');
  const timed = { id: 't', k: 'urgency.2', mode: 'timed', effect: 'allow', until: later(2), uses: null, scope: null };
  assert.deepEqual(resolve(person('director', [deny, timed]), 'urgency.2', NOW), { ok: true, src: 'timed', until: later(2), uses: null, id: 't' }, 'a later layer beats the deny');
  assert.equal(resolve(person('writer', [{ ...timed, until: later(-1) }]), 'urgency.2', NOW).ok, false, 'an ended grant is checked at use');
  const once = { id: 'o', k: 'whatsapp.push', mode: 'once', effect: 'allow', until: null, uses: 1, scope: { room: 'r1' } };
  assert.equal(resolve(person('member', [once]), 'whatsapp.push', NOW, { room: 'r1' }).src, 'once');
  assert.equal(resolve(person('member', [once]), 'whatsapp.push', NOW, { room: 'r2' }).ok, false, 'another room');
  assert.equal(resolve(person('member', [once]), 'whatsapp.push', NOW).ok, false, 'no target');
  assert.equal(resolve(person('member', [{ ...once, uses: 0 }]), 'whatsapp.push', NOW, { room: 'r1' }).ok, false, 'used up');
  assert.equal(resolve(person('writer', [{ id: 'x', k: 'permissions.grant', mode: 'standing', effect: 'allow', until: null, uses: null, scope: null }]), 'permissions.grant', NOW).src, 'rank', 'rank takes away');
  assert.equal(resolve(person('publisher', [], ['create']), 'page.create', NOW).ok, false, '«إنشاء» needs a creating role');
  assert.equal(resolve(person('writer', [], ['work']), 'page.work', NOW).src, 'page');
  assert.equal(resolve(person('admin'), 'page.analytics', NOW).ok, true);
  assert.equal(resolve(person('writer'), 'work.approve', NOW).src, 'fixed');
  assert.equal(resolve(person('assistant'), 'work.approve', NOW).ok, true);
});

test('who manages whom (Permissions_Plan.md 4.2)', () => {
  const me = (role, caps = ['permissions.grant']) => ({ email: `${role}@x`, role, caps });
  const them = (role, email = `${role}2@x`) => ({ email, role });
  assert.equal(manageBlock(me('admin'), them('admin')), null, 'an administrator manages another administrator');
  assert.equal(manageBlock(me('admin'), { email: 'admin@x', role: 'admin' }), 'SELF_EDIT');
  assert.equal(manageBlock(me('director'), them('assistant')), null);
  assert.equal(manageBlock(me('director'), them('director')), 'NOT_MANAGEABLE');
  assert.equal(manageBlock(me('director'), them('admin')), 'NOT_MANAGEABLE');
  assert.equal(manageBlock(me('assistant'), them('writer')), null);
  assert.equal(manageBlock(me('assistant'), them('assistant')), 'NOT_MANAGEABLE');
  assert.equal(manageBlock(me('assistant'), them('director')), 'NOT_MANAGEABLE');
  assert.equal(manageBlock(me('director', []), them('writer')), 'FORBIDDEN');
  assert.deepEqual(assignableBy('admin', roleIds), roleIds.filter((r) => r !== 'admin'));
  assert.deepEqual(assignableBy('director', roleIds), ['assistant', 'writer', 'designer', 'producer', 'publisher', 'member']);
  assert.deepEqual(assignableBy('assistant', roleIds), ['writer', 'designer', 'producer', 'publisher', 'member'], 'D-11');
  assert.equal(rankOf('admin'), 4);
  assert.equal(rankOf('member'), 1);
});

test('«الحسابات» opens with the capability, installed for administrators only', () => {
  assert.equal(canOpen({ role: 'director', pages: [] }, 'accounts'), false);
  assert.equal(canOpen({ role: 'director', pages: [], caps: ['accounts.view'] }, 'accounts'), true);
  assert.equal(canOpen({ role: 'writer', pages: [], caps: ['urgency.2'] }, 'accounts'), false);
  assert.equal(canOpen({ role: 'admin', pages: [] }, 'accounts'), true);
});

test('the person\'s card words each source; the preview says what and until when', () => {
  assert.equal(sourceLine({ src: 'role', until: null, uses: null }), 'من الدور');
  assert.equal(sourceLine({ src: 'timed', until: '2026-10-14T09:00:00Z', uses: null }), 'مؤقتة حتى 2026-10-14 12:00');
  assert.equal(sourceLine({ src: 'once', until: null, uses: 1 }), 'مرة واحدة · 1 استخدام باقٍ');
  assert.equal(grantPreview('خالد', 'urgency.2', 'timed', '2026-10-14T09:00:00Z', 1, null), 'سيملك خالد «رسائل «مهم» (المستوى 2)» حتى 2026-10-14 12:00، ثم تنتهي وحدها.');
  assert.equal(grantPreview('خالد', 'whatsapp.push', 'once', null, 1, 'فريق الحملة'), 'سيستطيع خالد «إرسال رسالة إلى واتساب زميل» في «فريق الحملة» مرة واحدة، ثم تنتهي.');
  assert.equal(capLabel('nope'), 'صلاحية');
});

test('every refusal is worded in Arabic, never as a raw key', () => {
  for (const code of ['SELF_EDIT', 'NOT_MANAGEABLE', 'NOT_HELD', 'CAP_FIXED', 'CAP_RANK', 'ROLE_ABOVE', 'ADMIN_NOT_ASSIGNABLE', 'PROTECTED_ACCOUNT', 'BAD_UNTIL', 'ONCE_NOT_FOR_PAGES', 'FORBIDDEN']) {
    const text = permError(`ERROR: ${code}`);
    assert.match(text, /[؀-ۿ]/, code);
    assert.doesNotMatch(text, /[A-Z_]{4,}/, code);
  }
  // Every code the migration raises has its wording.
  const raised = new Set([...sql.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]));
  for (const code of raised) if (code !== 'APPEND_ONLY') assert.notEqual(permError(code), 'تعذّر تنفيذ الإجراء. حاول مجدداً.', code);
});

test('the permission files carry no emoji', () => {
  for (const f of ['src/lib/permissions.ts', 'supabase/migrations/20261013150000_permissions.sql', 'supabase/tests/permissions_rules.sql'])
    assert.doesNotMatch(readFileSync(f, 'utf8'), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, f);
});

test('every notice the permission functions write leads somewhere', () => {
  const gos = new Set([...sql.matchAll(/jsonb_build_object\('page', '([a-z]+)'/g)].map((m) => m[1]));
  assert.ok(gos.size > 0);
  for (const page of gos) assert.notEqual(noticeHref({ page }), '/work', page);
  assert.equal(noticeHref({ page: 'profile' }), '/account');
  assert.equal(noticeHref({ page: 'members', tab: 'requests' }), '/accounts?tab=requests');
  assert.equal(noticeHref({ page: 'members', id: 'a@b.sa' }), '/accounts?person=a%40b.sa');
});

test('the permission log is worded in Arabic, for every kind the database writes', async () => {
  const { eventText, EVENT_KINDS, markers, nextEnd } = await import('../src/lib/permissions.ts');
  const name = (e) => ({ 'd@x': 'محمد', 'w@x': 'خالد' })[e] ?? e;
  const E = (kind, over = {}) => ({ id: 1, at: '2026-10-13T09:00:00Z', actor: 'd@x', subject: 'w@x', role: null, capability: 'urgency.2', kind, data: {}, ...over });
  assert.equal(eventText(E('grant', { data: { mode: 'timed', until: '2026-10-14T09:00:00Z' } }), name), 'محمد منح خالد «رسائل «مهم» (المستوى 2)» حتى 2026-10-14 12:00.');
  assert.equal(eventText(E('grant', { data: { mode: 'once', uses: 1 } }), name), 'محمد منح خالد «رسائل «مهم» (المستوى 2)» لمرة واحدة.');
  assert.equal(eventText(E('override', { data: { effect: 'deny' } }), name), 'محمد سحب «رسائل «مهم» (المستوى 2)» من خالد.');
  assert.equal(eventText(E('role_default', { actor: null, subject: null, role: 'director', capability: 'accounts.view', data: { allowed: true, people: 1 } }), name), 'النظام فعّل «فتح صفحة «الحسابات»» لدور «مدير الاتصال المؤسسي» (1 شخص).');
  assert.equal(eventText(E('role_assign', { capability: null, role: 'producer', data: { from: 'designer', to: 'producer' } }), name), 'محمد غيّر دور خالد من «المصمم» إلى «المنتج الإعلامي».');
  assert.equal(eventText(E('expired', { actor: null }), name), 'انتهت «رسائل «مهم» (المستوى 2)» لـخالد.');
  // Every kind the migrations allow has a label and words without a raw key.
  const kinds = sql.match(/kind text not null check \(kind in \(([^)]+)\)/)[1].match(/'([a-z_]+)'/g).map((k) => k.slice(1, -1));
  for (const k of kinds) {
    assert.ok(EVENT_KINDS[k], k);
    assert.doesNotMatch(eventText(E(k, { data: { mode: 'standing', allowed: true } }), name), /[a-z]+\.[a-z]+|_/, k);
  }
  assert.deepEqual(markers([{ mode: 'timed', effect: 'allow' }, { mode: 'once', effect: 'allow' }, { mode: 'standing', effect: 'deny' }, { mode: 'standing', effect: 'allow' }]), { timed: 1, once: 1, removed: 1 });
  const now = Date.parse('2026-10-13T09:00:00Z');
  assert.equal(nextEnd([{ until: '2026-10-13T08:00:00Z' }, { until: '2026-10-13T10:00:00Z' }, { until: null }, { until: '2026-10-13T12:00:00Z' }], now), Date.parse('2026-10-13T10:00:00Z'));
  assert.equal(nextEnd([{ until: null }], now), null);
});

test('requests: how long, what may be asked for, the locked-control helper, the notice route', async () => {
  const { howAr, askable, REQUEST_STATUS, SOURCE_DOOR } = await import('../src/lib/permissions.ts');
  const { needProps, askableCap } = await import('../src/lib/kit/need.ts');
  const req = readFileSync('supabase/migrations/20261013170000_permissions_requests.sql', 'utf8');
  // The interface words a request's length as the database does (perm_how).
  assert.equal(howAr('timed', 168, null), ' لمدة 1 أسبوع');
  assert.equal(howAr('timed', 24, null), ' لمدة 1 يوم');
  assert.equal(howAr('timed', 36, null), ' لمدة 36 ساعة');
  assert.equal(howAr('once', null, 1), ' لمرة واحدة');
  assert.equal(howAr('once', null, 3), ' لـ3 مرات');
  assert.equal(howAr('standing', null, null), ' دائمة');
  for (const phrase of [' لمدة ', ' أسبوع', ' يوم', ' ساعة', ' لمرة واحدة', ' مرات', ' دائمة']) assert.ok(req.includes(phrase), phrase);
  // A writer may ask for «مهم» but not for what does not fit the role, nor for a fixed rule.
  const evals = [{ k: 'page.work', ok: true, src: 'page' }, { k: 'urgency.2', ok: false, src: 'none' }];
  const w = askable('writer', evals).map((c) => c.key);
  assert.ok(w.includes('urgency.2') && w.includes('whatsapp.push') && w.includes('page.calendar'));
  assert.ok(!w.includes('page.work'), 'already held');
  assert.ok(!w.includes('permissions.grant') && !w.includes('urgency.3') && !w.includes('work.approve'));
  assert.ok(!askable('publisher', []).some((c) => c.key === 'page.create'), '«إنشاء» only for creating roles');
  assert.deepEqual(needProps('room.create', 'سبب'), { 'data-need': 'room.create', 'data-why': 'سبب', 'aria-disabled': true });
  assert.equal(askableCap('urgency.2'), true);
  assert.equal(askableCap('urgency.3'), false);
  assert.equal(askableCap('work.approve'), false);
  assert.equal(noticeHref({ page: 'requests', tab: 'perm' }), '/requests?tab=perm');
  assert.equal(noticeHref({ page: 'requests' }), '/requests');
  for (const s of ['pending', 'approved', 'declined', 'withdrawn']) assert.ok(REQUEST_STATUS[s], s);
  for (const s of req.match(/source in \(([^)]+)\)/)[1].match(/'([a-z]+)'/g).map((x) => x.slice(1, -1))) assert.ok(SOURCE_DOOR[s], s);
  // Every code the request functions raise is worded.
  for (const code of new Set([...req.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1])))
    assert.notEqual(permError(code), 'تعذّر تنفيذ الإجراء. حاول مجدداً.', code);
  // The guide answers a locked control, and the kit installs the helper.
  const guide = readFileSync('src/lib/kit/guide.ts', 'utf8');
  assert.match(guide, /لماذا لا تستطيع/);
  assert.match(readFileSync('src/components/kit.tsx', 'utf8'), /installNeed\(/);
});
