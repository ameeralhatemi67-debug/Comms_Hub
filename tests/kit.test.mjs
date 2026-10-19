import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PAGES, SHELL_PARTS, PAGE_HREF, PAGE_SOURCES, SHARED_SOURCES, pageKeyOf, roleGroup } from '../src/lib/help/registry.ts';
import { HOLD, HOLD_MS } from '../src/lib/kit/hold-reasons.ts';
import { place, overlap } from '../src/lib/kit/place.ts';
import { undoErrorText, undoTip, undoKeyApplies } from '../src/lib/kit/undo.ts';
import { describe } from '../src/lib/media/log-text.ts';

const read = (f) => readFileSync(f, 'utf8');
const reference = read('reference/comms-hub-reference-v5.html');
const kitSql = read('supabase/migrations/20261012160000_interaction_kit.sql');
const has = (text, token) => new RegExp(`(^|[^\\w-])${token.replace(/[-]/g, '\\-')}([^\\w-]|$)`).test(text);
const classesOf = (sel) => [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);

test('every help page has its purpose, a short first-visit guide, its parts, every role, rules, links and questions', () => {
  const groups = ['lead', 'maker', 'publisher', 'member'];
  // All sixteen pages of the reference have their guide (Step 5 of Reference_Build_Plan.md),
  // and «الحسابات» and «الحساب» theirs (Permissions_Plan.md, Step P2).
  // Home's since Step P3 (the plan's list of tips); «الإعدادات» since Step P5a, for «واتساب النظام».
  assert.deepEqual(Object.keys(PAGES).sort(), ['account', 'accounts', 'activity', 'analytics', 'approvals', 'asset', 'calendar', 'channels', 'chat', 'create', 'home', 'ideas', 'item', 'library', 'mail', 'motion', 'project', 'projects', 'requests', 'review', 'settings', 'tasks', 'work'].sort());
  for (const [key, h] of Object.entries(PAGES)) {
    assert.ok(h.name && h.tip && h.purpose, key);
    assert.ok(h.onb.length >= 3 && h.onb.length <= 4, `${key}: three or four steps`);
    assert.ok(h.parts.length >= 3, key);
    assert.equal(new Set(h.parts.map((p) => p.k)).size, h.parts.length, `${key}: part keys are unique`);
    assert.ok(h.parts.some((p) => p.first), `${key}: at least one section tip`);
    for (const g of groups) assert.ok(h.roles[g], `${key}: ${g}`);
    assert.ok(h.rules.length && h.faq.length && h.links.length, key);
    for (const [p] of h.links) assert.ok(PAGES[p] && PAGE_HREF[p], `${key} links to ${p}`);
  }
});

test('every selector the guide points at exists in the components that draw the page', () => {
  const shared = SHARED_SOURCES.map(read).join('\n');
  for (const [key, h] of Object.entries(PAGES)) {
    const src = PAGE_SOURCES[key].map(read).join('\n') + shared;
    const sels = [...h.onb.map((s) => s.sel), ...h.parts.map((p) => p.sel), ...(h.acts ?? []).map((a) => a.sel)];
    for (const sel of sels) for (const c of classesOf(sel)) assert.ok(has(src, c), `${key}: ${sel} (.${c})`);
  }
  for (const p of SHELL_PARTS) for (const c of classesOf(p.sel)) assert.ok(has(read('src/components/shell.tsx') + read('src/components/kit.tsx'), c), p.sel);
});

test('every key the guide saves is one the database accepts', () => {
  const re = new RegExp(kitSql.match(/p_key !~ '([^']+)'/)[1]);
  for (const [key, h] of Object.entries(PAGES)) {
    assert.match(key, re);
    for (const p of h.parts) assert.match(`${key}:${p.k}`, re, `${key}:${p.k}`);
  }
});

test('routes map to their help page', () => {
  assert.equal(pageKeyOf('/media'), 'library');
  assert.equal(pageKeyOf('/media/5f0e2d7e-2c55-4c4c-9b9e-6f7b0d1a2c3d'), 'asset');
  assert.equal(pageKeyOf('/tasks'), 'tasks');
  assert.equal(pageKeyOf('/activity'), 'activity');
  assert.equal(pageKeyOf('/mail'), 'mail');
  assert.equal(pageKeyOf('/mail/chat'), 'chat');
  assert.equal(pageKeyOf('/work'), 'work');
  assert.equal(pageKeyOf('/work/CH-12'), 'item');
  assert.equal(pageKeyOf('/create'), 'create');
  assert.equal(pageKeyOf('/approvals'), 'approvals');
  assert.equal(pageKeyOf('/approvals/CH-12'), 'review');
  assert.equal(pageKeyOf('/channels'), 'channels');
  assert.equal(pageKeyOf('/calendar'), 'calendar');
  assert.equal(pageKeyOf('/projects'), 'projects');
  assert.equal(pageKeyOf('/projects/5f0e2d7e-2c55-4c4c-9b9e-6f7b0d1a2c3d'), 'project');
  assert.equal(pageKeyOf('/requests'), 'requests');
  assert.equal(pageKeyOf('/'), 'home');
  assert.equal(pageKeyOf('/accounts'), 'accounts');
  assert.equal(pageKeyOf('/account'), 'account');
  assert.equal(PAGE_HREF.accounts, '/accounts');
  assert.equal(PAGE_HREF.account, '/account');
  // Step 8: the pages that had no guide.
  for (const [path, key] of [['/ideas', 'ideas'], ['/analytics', 'analytics'], ['/motion', 'motion']]) {
    assert.equal(pageKeyOf(path), key, path);
    assert.equal(PAGE_HREF[key], path, key);
  }
  assert.equal(pageKeyOf('/nowhere'), null);
  assert.equal(roleGroup('admin'), 'lead');
  assert.equal(roleGroup('producer'), 'maker');
  assert.equal(roleGroup('publisher'), 'publisher');
});

test('hold to confirm: the reference\'s reasons, each used by a button, about a second', () => {
  const why = (k) => reference.match(new RegExp(`"${k}":"([^"]+)"`))[1];
  assert.equal(HOLD.approveLock, why('media:confirmapprove'));
  assert.equal(HOLD.trashOne, why('media:trashone'));
  assert.equal(HOLD.trashSelected, why('media:trashsel'));
  assert.equal(HOLD.holdSend, why('mail:holdok'));
  assert.equal(HOLD.mailCardApprove, why('mail:card:approve'));
  assert.equal(HOLD.chatApprove, why('mail:ch-appr:approve'));
  assert.equal(HOLD.chatDelete, why('mail:ch-del'));
  assert.equal(HOLD.closeWork, why('doclose'));
  assert.equal(HOLD.approveAll, why('approveall'));
  assert.equal(HOLD.rejectWork, why('doreject'));
  assert.equal(HOLD.publishNow, why('dopubnow'));
  assert.equal(HOLD.publishNow, why('q:confirmpub'));
  assert.equal(HOLD.accountDelete, why('accdeldo'));
  // Permissions_Plan.md 10, «New hold buttons», word for word.
  assert.equal(HOLD.removeMember, 'إزالة العضو تفصله عن المركز وتبقي أعماله لدى من يُسند إليه.');
  assert.equal(HOLD.endAllGrants, 'تنتهي كل الصلاحيات المضافة لهذا الشخص الآن.');
  assert.equal(HOLD.roleDefaultOff, 'التغيير يمسّ كل من يحمل هذا الدور.');
  assert.equal(HOLD.roleDown, 'ينقص هذا التغيير ما يستطيع الشخص فعله فوراً.');
  assert.equal(HOLD_MS, Number(reference.match(/var HOLD_MS = (\d+);/)[1]));
  const comps = ['src/components/media/dialogs.tsx', 'src/components/media/library.tsx', 'src/components/media/asset-page.tsx', 'src/components/mail/thread.tsx', 'src/components/chat/chat-tab.tsx', 'src/components/work/item.tsx', 'src/components/work/review.tsx', 'src/components/work/publish.tsx', 'src/components/work/channels.tsx',
    'src/components/accounts/members.tsx', 'src/components/accounts/card.tsx', 'src/components/accounts/roles.tsx', 'src/components/settings/general.tsx', 'src/components/settings/platforms.tsx', 'src/components/settings/storage-provider.tsx', 'src/components/settings/storage-move.tsx', 'src/components/settings/backups.tsx'].map(read).join('\n');
  for (const k of Object.keys(HOLD)) assert.match(comps, new RegExp(`data-hold=\\{HOLD\\.${k}\\}`), k);
});

test('an explanation window sits beside its target and away from an open dialog', () => {
  const view = { w: 1280, h: 800 };
  const size = { w: 370, h: 220 };
  const target = { l: 900, t: 300, r: 1000, b: 340 };
  const p = place(size, view, target, []);
  const R = (q, w = size.w) => ({ l: q.x, t: q.y, r: q.x + (q.width ?? w), b: q.y + size.h });
  assert.equal(overlap(R(p), target), 0, 'not over the target');
  assert.ok(p.x >= 10 && p.y >= 10 && p.x + size.w <= view.w - 10, 'inside the screen');
  const dialog = { l: 340, t: 100, r: 940, b: 700 };
  const q = place(size, view, { l: 400, t: 200, r: 500, b: 240 }, [dialog]);
  assert.equal(overlap(R(q), dialog), 0, 'not over the dialog');
  // A dialog that leaves only 250 pixels on its side: the window narrows rather than cover it.
  const wide = { l: 270, t: 50, r: 1270, b: 750 };
  const n = place(size, view, { l: 600, t: 300, r: 700, b: 340 }, [wide]);
  assert.ok(n.width && n.width <= 250, `narrowed to ${n.width}`);
  assert.equal(overlap({ l: n.x, t: n.y, r: n.x + n.width, b: n.y + 100 }, wide), 0);
});

test('undo: the reasons it is refused, the button title, and when Ctrl+Z belongs to it', () => {
  assert.match(undoErrorText('ERROR: UNDO_CHANGED'), /تغيّر شيء آخر/);
  assert.match(undoErrorText('UNDO_GONE'), /ساعة/);
  assert.match(undoErrorText('MOVE_DENIED'), /التحرير/);
  assert.match(undoErrorText('anything'), /أعد المحاولة/);
  assert.equal(undoTip([]), 'لا شيء للتراجع عنه');
  assert.equal(undoTip([{ tx: 2, label: 'نقل «أ»', n: 1, at: '', ok: true }, { tx: 1, label: 'وسوم «ب»', n: 1, at: '', ok: true }]), 'تراجع عن: نقل «أ» · و1 قبله · Ctrl+Z');
  const k = { ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, key: 'z', code: 'KeyZ' };
  assert.equal(undoKeyApplies(k, { tagName: 'DIV' }, '/media'), true);
  assert.equal(undoKeyApplies(k, { tagName: 'INPUT' }, '/media'), false, 'a text field keeps its own undo');
  assert.equal(undoKeyApplies(k, { tagName: 'DIV' }, '/mail'), false, 'the mail page keeps its own undo');
  assert.equal(undoKeyApplies(k, { tagName: 'DIV' }, '/motion/studio/p1'), false, 'the studio keeps its own history: Ctrl+Z there never undoes a library action');
  assert.equal(undoKeyApplies(k, { tagName: 'DIV' }, '/motion'), true, 'the template tab has no history of its own');
  assert.equal(undoKeyApplies({ ...k, shiftKey: true }, { tagName: 'DIV' }, '/media'), false);
  assert.equal(describe({ id: 1, at: '', actor_email: 'a@x.sa', type: 'undo', asset_id: null, folder_id: null, task_id: null, data: { label: 'نقل «أ»' } }, () => 'أمل').text, 'تراجع أمل عن: نقل «أ»');
});

test('the kit\'s database functions exist and are granted, and its files have no emoji', () => {
  for (const fn of ['guide_update', 'undo_list', 'undo_action', 'undo_cancel_last', 'undo_reapply']) {
    assert.match(kitSql, new RegExp(`create function public\\.${fn}\\(`), fn);
    assert.match(kitSql, new RegExp(`grant execute on function public\\.${fn}\\(`), fn);
  }
  assert.doesNotMatch(kitSql, /grant execute on function public\.undo_apply/, 'the internal function stays internal');
  const files = ['src/lib/kit', 'src/lib/help'].flatMap((d) => readdirSync(d).map((f) => `${d}/${f}`))
    .concat(['src/components/kit.tsx', 'src/app/kit.css', 'supabase/migrations/20261012160000_interaction_kit.sql', 'supabase/tests/kit_rules.sql']);
  for (const f of files) assert.doesNotMatch(read(f), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, f);
});
