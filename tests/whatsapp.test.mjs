// WhatsApp, Permissions_Plan.md 8 (Step P5a): the site's half. The database half is
// supabase/tests/whatsapp_rules.sql. Numbers here use +999, a country code assigned to no
// country, so no real number is in the repository.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalisePhone,
  maskPhone,
  systemLine,
  deliverySummary,
  pushBlock,
  waError,
  WA_ERROR_CODES,
  contentOf,
  packageText,
  DEFAULT_MAX_CHARS,
} from '../src/lib/whatsapp/rules.ts';
import { codeFor, codeHash, signLink, verifyLink, buildItems, sameKey, newNonce } from '../src/lib/whatsapp/server.ts';
import { FakeProvider, deliver } from '../src/lib/whatsapp/provider.ts';
import { HOLD } from '../src/lib/kit/hold-reasons.ts';
import { noticeHref } from '../src/lib/work/rules.ts';

const SECRET = 'test-secret-not-real';
const SITE = 'https://hub.example';
const sql = readFileSync('supabase/migrations/20261014100000_whatsapp.sql', 'utf8');
const NOW = Date.parse('2026-10-14T09:00:00Z');
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

test('a number is taken in international form only', () => {
  assert.equal(normalisePhone('+999 0000 0001'), '+99900000001');
  assert.equal(normalisePhone('00999-000-00001'), '+99900000001');
  assert.equal(normalisePhone('(+999) 00000001'), '+99900000001');
  assert.equal(normalisePhone('0500000001'), null, 'no country code: refused, not guessed');
  assert.equal(normalisePhone('+0999000001'), null);
  assert.equal(normalisePhone('+99912'), null);
  assert.equal(normalisePhone('+9990000000000000'), null);
  // The same rule as the database.
  assert.match(sql, /phone ~ '\^\\\+\[1-9\]\[0-9\]\{7,14\}\$'/);
  assert.equal(maskPhone('+99900000001'), '+999•••••001');
});

test('the code is six digits made from the secret and a nonce, and the database compares sha256(code:nonce)', () => {
  const nonce = newNonce();
  assert.match(nonce, /^[0-9a-f]{32}$/);
  const code = codeFor(SECRET, nonce);
  assert.match(code, /^\d{6}$/);
  assert.equal(codeFor(SECRET, nonce), code, 'deterministic, so it is never stored');
  assert.notEqual(codeFor('another', nonce), code);
  assert.equal(codeHash(code, nonce), createHash('sha256').update(`${code}:${nonce}`).digest('hex'));
  assert.match(sql, /encode\(sha256\(convert_to\(coalesce\(btrim\(p_code\), ''\) \|\| ':' \|\| c\.nonce, 'UTF8'\)\), 'hex'\) <> c\.code_hash/);
  assert.equal(sameKey('abc', 'abc'), true);
  assert.equal(sameKey('abc', 'abd'), false);
  assert.equal(sameKey('abc', 'abcd'), false);
});

test('the link is signed, expires, and cannot be altered', () => {
  const p = { o: U(1), r: 'wri@x.sa', m: U(2), g: U(3), e: Math.floor(NOW / 1000) + 3600 };
  const t = signLink(SECRET, p);
  assert.deepEqual(verifyLink(SECRET, t, NOW), p);
  assert.equal(verifyLink('another', t, NOW), null, 'wrong secret');
  assert.equal(verifyLink(SECRET, t, NOW + 7200e3), null, 'expired');
  const [body, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ ...p, g: U(9) })).toString('base64url');
  assert.equal(verifyLink(SECRET, `${forged}.${sig}`, NOW), null, 'another room with the old signature');
  assert.equal(verifyLink(SECRET, `${body}.`, NOW), null);
  assert.equal(verifyLink(SECRET, 'x', NOW), null);
});

test('the package: sender, level, full content up to the cap, files named, the one-way line and the link (plan 8.5)', () => {
  const c = { id: U(10), kind: 'urgent', recipient: 'wri@x.sa', to: '+99900000001', sender_name: 'محمد', message_id: U(2), room_id: U(3), room_name: 'فريق الحملة', urgency: 3, msg_kind: 'text', body: 'الاجتماع الآن في القاعة.', data: null };
  const [it] = buildItems([c], { site: SITE, secret: SECRET, maxChars: DEFAULT_MAX_CHARS, nowMs: NOW });
  const lines = it.text.split('\n');
  assert.equal(lines[0], 'محمد في «فريق الحملة»');
  assert.equal(lines[1], '«عاجل»');
  assert.equal(lines[2], 'الاجتماع الآن في القاعة.');
  assert.ok(it.text.includes('لا تُقرأ الردود هنا'), 'one way, said plainly (D-6)');
  const link = lines.at(-1);
  assert.ok(link.startsWith(`${SITE}/w/`));
  const p = verifyLink(SECRET, link.slice(`${SITE}/w/`.length), NOW);
  assert.deepEqual({ o: p.o, r: p.r, m: p.m, g: p.g }, { o: c.id, r: 'wri@x.sa', m: U(2), g: U(3) }, 'the link opens that room at that message');
  assert.equal(it.to, c.to, 'the destination is the claimed row\'s own');
  // A pushed message without a level, in a direct conversation: no level line, no room.
  const push = buildItems([{ ...c, kind: 'push', urgency: 0, room_name: null }], { site: SITE, secret: SECRET, maxChars: 1000, nowMs: NOW })[0].text.split('\n');
  assert.equal(push[0], 'محمد');
  assert.equal(push[1], 'الاجتماع الآن في القاعة.');
  // The cap: about a thousand characters, then «…» and the link.
  const long = buildItems([{ ...c, body: 'ن'.repeat(3000) }], { site: SITE, secret: SECRET, maxChars: 1000, nowMs: NOW })[0].text.split('\n')[2];
  assert.equal(long.length, 1000);
  assert.ok(long.endsWith('…'));
  // Files are named, not attached.
  assert.equal(contentOf('file', '', { name: 'عقد.pdf' }), 'مرفق: عقد.pdf');
  assert.equal(contentOf('image', 'الملصق النهائي', { name: 'poster.png' }), 'مرفق: poster.png\nالملصق النهائي');
  assert.ok(contentOf('voice', '', { name: 'رسالة-صوتية.webm' }).startsWith('مرفق: رسالة صوتية'));
  assert.equal(contentOf('poll', '', { q: 'أي يوم؟', options: ['الأحد', 'الاثنين'] }), 'تصويت: أي يوم؟\n1. الأحد\n2. الاثنين');
  // A test send has no link and no content of anyone's.
  assert.equal(packageText({ id: U(11), kind: 'test', recipient: 'a', to: '+99900000009' }, { link: null }).includes('تجربة'), true);
});

test('the handshake against the fake provider: the code reaches only the number being proved, and it matches the stored hash', async () => {
  const nonce = newNonce();
  const stored = codeHash(codeFor(SECRET, nonce), nonce); // what /api/whatsapp/code gives wa_code_issue
  const claimed = [{ id: U(20), kind: 'code', recipient: 'wri@x.sa', to: '+99900000001', nonce }];
  const items = buildItems(claimed, { site: SITE, secret: SECRET, maxChars: 1000, nowMs: NOW });
  assert.equal(items[0].text.includes(nonce), false, 'the nonce is not sent');
  const fake = new FakeProvider();
  const reports = await deliver(items, fake);
  assert.deepEqual(reports, [{ id: U(20), ok: true }]);
  assert.equal(fake.sent.length, 1);
  assert.equal(fake.sent[0].to, '+99900000001');
  assert.equal(fake.sent[0].code, true);
  const typed = fake.sent[0].text.match(/\b(\d{6})\b/)[1];
  assert.equal(codeHash(typed, nonce), stored, 'the member types what arrived; the database finds it equal');
  assert.notEqual(codeHash('000000', nonce), stored);
});

test('routing case of plan 8.6, fake-provider run: the provider receives exactly what the rule produced, nothing more', async () => {
  // The six message rows and two codes the database claimed in whatsapp_rules.sql (check 64).
  const row = (n, kind, recipient, to, msg, room, urgency) => ({ id: U(n), kind, recipient, to, sender_name: 'Dir', message_id: msg, room_id: room, room_name: 'غرفة', urgency, msg_kind: 'text', body: `نص ${n}`, data: null });
  const claimed = [
    row(1, 'urgent', 'wri@t.test', '+99900000001', U(101), U(201), 3),
    row(2, 'urgent', 'pro@t.test', '+99900000003', U(102), U(203), 2),
    row(3, 'push', 'pro@t.test', '+99900000003', U(102), U(203), 2),
    row(4, 'urgent', 'pro@t.test', '+99900000003', U(105), U(202), 3),
    row(5, 'push', 'wri@t.test', '+99900000001', U(107), U(204), 2),
    row(6, 'push', 'wri@t.test', '+99900000001', U(108), U(201), 0),
    { id: U(7), kind: 'code', recipient: 'mem@t.test', to: '+99900000009', nonce: newNonce() },
    { id: U(8), kind: 'code', recipient: 'wri@t.test', to: '+99900000001', nonce: newNonce() },
  ];
  const items = buildItems(claimed, { site: SITE, secret: SECRET, maxChars: 1000, nowMs: NOW });
  const fake = new FakeProvider();
  fake.failFor.add('+99900000009');
  const reports = await deliver(items, fake);
  assert.equal(fake.sent.length, 7, 'every item but the refused one, and nothing else');
  assert.deepEqual(fake.sent.map((s) => s.to), claimed.filter((c) => c.to !== '+99900000009').map((c) => c.to), 'in order, each to its own claimed number');
  for (const [i, s] of fake.sent.entries()) assert.equal(s.text, items.filter((x) => x.to !== '+99900000009')[i].text);
  // Each message's link names that message, that room and that recipient.
  for (const it of items.filter((x) => x.kind !== 'code')) {
    const c = claimed.find((x) => x.id === it.id);
    const p = verifyLink(SECRET, it.text.split('\n').at(-1).slice(`${SITE}/w/`.length), NOW);
    assert.deepEqual([p.o, p.m, p.g, p.r], [c.id, c.message_id, c.room_id, c.recipient]);
  }
  assert.deepEqual(reports.filter((r) => !r.ok).map((r) => r.id), [U(7)]);
  assert.equal(reports.length, 8);
});

test('delivery words, push reasons and the connection line', () => {
  assert.equal(deliverySummary([{ state: 'sent' }, { state: 'queued' }, { state: 'sending' }, { state: 'failed' }]).text, 'واتساب: أُرسلت إلى 1 · لم تُسلَّم بعد 2 · تعذّرت 1');
  assert.equal(deliverySummary([]).text, '');
  assert.equal(pushBlock({ hasCap: true, systemOn: true, author: true, target: { push: true } }), '');
  assert.match(pushBlock({ hasCap: false, systemOn: true, author: true, target: { push: true } }), /مقفلة حتى تُمنح/);
  assert.equal(pushBlock({ hasCap: true, systemOn: true, author: true, target: { push: false } }), 'لا يستقبل هذا الزميل رسائل واتساب منك الآن.');
  assert.equal(pushBlock({ hasCap: true, systemOn: true, author: true, target: undefined }), 'لا يستقبل هذا الزميل رسائل واتساب منك الآن.', 'not linked and muted read the same: nothing about the number');
  assert.equal(systemLine({ enabled: true, online: true, heartbeat_at: null }, NOW), 'متصل');
  assert.match(systemLine({ enabled: true, online: false, heartbeat_at: '2026-10-14T08:30:00Z' }, NOW), /^غير متصل منذ 30 دقيقة/);
  assert.match(systemLine({ enabled: false, online: false, heartbeat_at: null }, NOW), /متوقف/);
});

test('every refusal the WhatsApp functions raise is worded in Arabic', () => {
  const raised = new Set([...sql.matchAll(/raise exception '([A-Z_0-9]+)'/g)].map((m) => m[1]));
  assert.ok(raised.size >= 15);
  for (const code of raised) assert.notEqual(waError(code), 'تعذّر تنفيذ الطلب. أعد المحاولة.', code);
  for (const code of WA_ERROR_CODES) assert.ok(raised.has(code), `${code} is raised by the database`);
  assert.equal(waError('ERROR: WA_DAILY_CAP'), 'بلغت حد الرسائل المدفوعة إلى واتساب اليوم.');
});

test('every notice the WhatsApp functions write leads somewhere', () => {
  const gos = new Set([...sql.matchAll(/jsonb_build_object\('page', '([a-z]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...gos].sort(), ['chat', 'profile']);
  for (const page of gos) assert.notEqual(noticeHref({ page }), '/work', page);
});

test('the unlink hold reason is the plan\'s, word for word', () => {
  assert.equal(HOLD.waUnlink, 'يقطع ربط رقم هذا العضو ولا يُعاد إلا بتحقق جديد.');
});

test('the routing is inside chat_send, and the outbox holds ids only', () => {
  assert.match(sql, /perform public\.wa_route\(mid\);/);
  const outbox = sql.slice(sql.indexOf('create table public.whatsapp_outbox'), sql.indexOf('create index whatsapp_outbox_queue_idx'));
  assert.doesNotMatch(outbox, /\b(body|text|content|phone)\b\s+text/);
  assert.match(outbox, /foreign key \(room_id, recipient\) references public\.chat_members\(room_id, email\)/);
  assert.match(outbox, /foreign key \(message_id, room_id\) references public\.chat_messages\(id, room_id\)/);
  assert.match(outbox, /unique \(message_id, recipient, kind\)/);
});

// The repository holds no phone number, token or key: only +999 numbers (assigned to no
// country) appear in tests and fixtures, and env files are ignored.
const SKIP = new Set(['node_modules', '.next', '.git', 'artifacts', 'videos', 'out']);
function* files(dir) {
  for (const f of readdirSync(dir)) {
    if (SKIP.has(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx|mjs|cjs|js|sql|json|md|bat|txt)$/.test(f)) yield p;
  }
}
test('no phone number, server key or link secret is written into the repository', () => {
  const found = [];
  for (const dir of ['src', 'supabase', 'tests', 'qa', 'bridge']) {
    let it;
    try {
      it = [...files(dir)];
    } catch {
      continue;
    }
    for (const f of it) {
      const s = readFileSync(f, 'utf8');
      for (const m of s.matchAll(/(?<![\w/.-])\+(?!999)[1-9]\d{8,14}\b/g)) found.push(`${f}: ${m[0]}`);
      if (/WHATSAPP_(SERVER_KEY|LINK_SECRET)\s*=\s*['"]?[0-9a-f]{16,}/i.test(s)) found.push(`${f}: a WhatsApp secret`);
    }
  }
  assert.deepEqual(found, []);
});

test('the WhatsApp files carry no emoji', () => {
  for (const f of ['src/lib/whatsapp/rules.ts', 'src/lib/whatsapp/server.ts', 'src/lib/whatsapp/provider.ts', 'src/components/whatsapp/member.tsx', 'src/components/whatsapp/system-panel.tsx', 'src/components/chat/whatsapp.tsx', 'supabase/migrations/20261014100000_whatsapp.sql', 'supabase/tests/whatsapp_rules.sql'])
    assert.doesNotMatch(readFileSync(f, 'utf8'), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, f);
});
