// «ألوان التقويم» (MVP_draft.md 75, Director_Notes_Plan.md N-1): the rules in src/lib/work/calendar-colors.ts, the
// twelve colours in src/app/work.css, and what the migration must hold. The database's own half is
// supabase/tests/calendar_prefs_rules.sql; the sheet is clicked through by qa/calendar-colors.cjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  COLOR_MODES, MODE_IDS, PALETTE, PAL_COUNT, MAX_PAIRS, KEY_PATTERNS, STATUS_ORDER, STATUS_PAL, TONE_PAL, PLATFORM_PAL, DEFAULT_PREFS,
  contrast, luminance, validKey, keyOf, defaultPal, palOf, cleanPrefs, setColor, resetMode, changedIn, entryValue, entryKey, entryPal,
  marksOf, chipClass, rowClass, labelClass, accountClass, bandClass, kindClass, valuesOf, legendOf, hashPal,
} from '../src/lib/work/calendar-colors.ts';
import { CAL_KIND, KEY_ORDER, calEntries, toneOf } from '../src/lib/work/planning.ts';
import { statusLabels, workErrorText } from '../src/lib/work/rules.ts';

const read = (f) => readFileSync(f, 'utf8');
const css = read('src/app/work.css');
const themes = read('src/app/globals.css') + '\n' + read('src/app/identity.css');
const migFile = readdirSync('supabase/migrations').find((f) => /^2026110513\d{4}_calendar_prefs\.sql$/.test(f));
const mig = migFile ? read(`supabase/migrations/${migFile}`) : '';

// Every surface the calendar sits on, in both modes, as the themes define them.
const tokens = (name) => [...themes.matchAll(new RegExp(`--${name}:(#[0-9a-fA-F]{6})\\b`, 'g'))].map((m) => m[1].toLowerCase());
const surfaces = [...new Set([...tokens('surface'), ...tokens('surface-2'), ...tokens('soft'), ...tokens('bg')])];
const lightSurfaces = surfaces.filter((h) => luminance(h) > 0.5);
const darkSurfaces = surfaces.filter((h) => luminance(h) < 0.05);

// Sample calendar entries, built by the calendar's own rules (as tests/planning.test.mjs builds them).
const T = '2026-10-12';
const NOW = '2026-10-12T06:00:00Z';
const P1 = '0b6f7c1e-1d2a-4c3b-9e8f-1234567890ab';
const P2 = '7c1e0b6f-2a1d-4c3b-8e9f-abcdef123456';
const IG = '11111111-1111-4111-8111-111111111111';
const XA = '22222222-2222-4222-8222-222222222222';
const W = (over = {}) => ({
  id: 'CH-1', no: 1, title: 'عمل', type: 'post', status: 'IN_PRODUCTION', priority: 'normal', restricted: false, source: 'plan', requester: null,
  brief: null, created_by: 'lead@x.sa', assignee: 'w@x.sa', people: [], due: '2026-10-16', event_at: null, place: null, channels: [],
  proposed_at: null, sched_at: null, pub_at: null, pub_mode: null, pending_sched: false, confirm_pending: false, move_from: null, move_by: null,
  review_cycle: null, results: {}, closed_at: null, closed_by: null, close_reason: null, created_at: '2026-10-10T06:00:00Z', updated_at: '2026-10-11T06:00:00Z', ...over,
});
const S = (pos, over = {}) => ({
  id: `s${pos}`, work_id: 'CH-1', pos, name: `مرحلة ${pos}`, role: 'writer', who: null, start_on: null, due_on: null, after_pos: pos ? [pos - 1] : [],
  days: 1, note: null, gate: false, gate_by: null, gate_at: null, started_at: null, done_at: null, done_by: null, ...over,
});
const A = (id, platform, over = {}) => ({ id, platform, label: id, handle: `@${id}`, purpose: null, authorized_until: '2026-12-01T00:00:00Z', publishers: ['pub@x.sa'], mode: 'auto', active: true, fixed: false, ...over });
const accounts = [A(IG, 'instagram'), A(XA, 'x', { authorized_until: '2026-10-13T00:00:00Z' })];
const works = [
  { w: W({ id: 'CH-1', status: 'SCHEDULED', channels: [IG, XA], sched_at: '2026-10-14T15:00:00Z', priority: 'urgent' }), stages: [], projects: [P1, P2] },
  { w: W({ id: 'CH-2', status: 'SCHEDULED', channels: [XA], sched_at: '2026-10-14T16:00:00Z', due: '2026-10-10' }), stages: [], projects: [] },
  { w: W({ id: 'CH-3', status: 'PUBLISHED', channels: [IG], pub_at: '2026-10-11T09:00:00Z', results: { [IG]: { ok: false, why: 'رفض' } } }), stages: [], projects: [P2] },
  { w: W({ id: 'CH-4', status: 'IN_REVIEW', assignee: null, channels: [IG], proposed_at: '2026-10-15T15:00:00Z' }), stages: [], projects: [] },
  { w: W({ id: 'CH-5', status: 'IN_PRODUCTION' }), stages: [S(0, { work_id: 'CH-5', who: 'd@x.sa', due_on: '2026-10-11' })], projects: [P1] },
];
const tasks = [{ id: 't1', what: 'مهمة', kind: 'other', assignee: 'w@x.sa', assigned_by: 'lead@x.sa', due: '2026-10-11T09:00:00Z', start_on: null, after_ids: [], status: 'open', note: null, project_id: P1, work_id: null, group_key: null, priority: 'normal' }];
const events = [{ id: 'e1', title: 'حدث', start_at: '2026-10-13T09:00:00Z', end_at: '2026-10-13T11:00:00Z', place: null, project_id: P2, created_by: 'lead@x.sa' }];
const reminders = [{ id: 'r1', at: '2026-10-12T10:00:00Z', body: 'تذكير' }];
const all = calEntries({ works, tasks, events, reminders, accounts, me: 'w@x.sa', today: T, nowIso: NOW });
const byId = new Map(works.map((x) => [x.w.id, x]));
const look = { projectsOf: (id) => byId.get(id)?.projects ?? [], stageWho: (id, si) => byId.get(id)?.stages[si]?.who, platformOf: (id) => accounts.find((a) => a.id === id)?.platform };
const prefsOf = (mode, colors = {}) => ({ mode, colors });

// Today's chip, as calendar.tsx wrote it before the colours.
const oldChip = (e) => {
  const res = e.k === 'done' && e.ch && e.w?.results[e.ch] ? (e.w.results[e.ch].ok ? ' ok' : ' bad') : '';
  return `${CAL_KIND[e.k][1]}${res}${e.late ? ' late' : ''}${e.risk ? ' risk' : ''}${e.near ? ' near' : ''}${e.w && e.w.priority === 'urgent' && e.k !== 'done' ? ' urg' : ''}`;
};

test('twelve colours, each readable on its own ground in light and in dark', () => {
  assert.equal(PALETTE.length, 12);
  assert.equal(PAL_COUNT, 12);
  assert.equal(new Set(PALETTE.map((p) => p.name)).size, 12, 'every colour has its own name');
  assert.ok(lightSurfaces.length >= 4 && darkSurfaces.length >= 2, `surfaces: ${lightSurfaces} / ${darkSurfaces}`);
  let minText = 99;
  let minEdge = 99;
  for (const p of PALETTE) {
    for (const mode of ['light', 'dark']) {
      const [bg, fg, edge] = p[mode];
      for (const h of [bg, fg, edge]) assert.match(h, /^#[0-9a-f]{6}$/, `${p.name} ${mode}`);
      const text = contrast(fg, bg);
      assert.ok(text >= 4.5, `${p.name} ${mode}: text ${text.toFixed(2)}`);
      minText = Math.min(minText, text);
      for (const s of mode === 'light' ? lightSurfaces : darkSurfaces) {
        const e = contrast(edge, s);
        assert.ok(e >= 3, `${p.name} ${mode}: edge on ${s} ${e.toFixed(2)}`);
        minEdge = Math.min(minEdge, e);
      }
      // The text of a chip is also readable against the page itself, where its ground is faint.
      for (const s of mode === 'light' ? lightSurfaces : darkSurfaces) assert.ok(contrast(fg, s) >= 4.5, `${p.name} ${mode}: text on ${s}`);
    }
    // Light is light and dark is dark: the two modes are not the same pair.
    assert.ok(luminance(p.light[0]) > 0.6 && luminance(p.dark[0]) < 0.08, p.name);
  }
  assert.ok(minText >= 7, `the lowest text contrast is ${minText.toFixed(2)}`);
  assert.ok(minEdge >= 3.2, `the lowest edge contrast is ${minEdge.toFixed(2)}`);
  assert.ok(Math.abs(contrast('#ffffff', '#000000') - 21) < 1e-9);
});

test('the classes pal-0 to pal-11 in work.css hold exactly the palette, for light and for dark', () => {
  for (let i = 0; i < 12; i++) {
    const [bg, fg, edge] = PALETTE[i].light;
    assert.ok(css.includes(`.wk .pal-${i}{--pb:${bg};--pf:${fg};--pe:${edge}}`), `light pal-${i}`);
    const [dbg, dfg, dedge] = PALETTE[i].dark;
    assert.ok(css.includes(`[data-theme="dark"] .wk .pal-${i}{--pb:${dbg};--pf:${dfg};--pe:${dedge}}`), `dark pal-${i}`);
  }
  assert.equal((css.match(/\.wk \.pal-\d+\{/g) ?? []).length, 24, 'no thirteenth colour');
  assert.doesNotMatch(css, /\.pal-1[2-9]\b/);
});

test('warnings win: every mark stays on a chip whatever colour it takes, and a failed publish keeps its red', () => {
  const marked = all.filter((e) => marksOf(e).length);
  assert.ok(marked.some((e) => e.late) && marked.some((e) => e.risk) && marked.some((e) => e.near) && marked.some((e) => e.w?.priority === 'urgent'), 'the sample has every kind of warning');
  let checked = 0;
  for (const mode of MODE_IDS)
    for (let pal = 0; pal < 12; pal++)
      for (const e of all) {
        const k = entryKey(e, prefsOf(mode), look);
        const prefs = prefsOf(mode, k ? { [k]: pal } : {});
        const cls = chipClass(e, prefs, look).split(' ');
        for (const m of marksOf(e)) {
          assert.ok(cls.includes(m), `${mode} ${pal} ${e.key}: ${m}`);
          if (cls.includes('pal')) assert.ok(cls.indexOf(m) > cls.indexOf(`pal-${entryPal(e, prefs, look)}`), 'the marks follow the colour');
          checked++;
        }
        if (e.k === 'done' && e.w?.results[e.ch] && !e.w.results[e.ch].ok) {
          assert.ok(cls.includes('bad') && !cls.includes('pal'), 'a failed publish takes no colour');
          assert.equal(entryPal(e, prefs, look), null);
        }
      }
  assert.ok(checked > 200, `checked ${checked}`);
});

test('warnings win in the styles too: drawn outside the chip, after the colours, in colours that stand out on every ground', () => {
  const at = (s) => {
    const i = css.indexOf(s);
    assert.ok(i >= 0, s);
    return i;
  };
  const base = at('.wk .wk-cchip.pal{');
  // The colours come after the kinds' own warnings, so the marks below them decide.
  assert.ok(base > at('.wk .wk-cchip.urg{') && base > at('.wk .wk-cchip.late{'));
  for (const [m, token] of [['late', 'st-danger-fg'], ['risk', 'st-warn-fg'], ['near', 'st-warn-fg'], ['urg', 'st-danger-fg']]) {
    const i = at(`.wk .wk-cchip.pal.${m}{`);
    assert.ok(i > base, `${m} after the colour`);
    const rule = css.slice(i, css.indexOf('}', i));
    assert.ok(rule.includes(`var(--${token})`), `${m}: ${rule}`);
    assert.doesNotMatch(rule, /inset/, `${m} is drawn outside the chip, on the calendar's own ground`);
    for (const t of tokens(token)) {
      const grounds = luminance(t) > 0.3 ? darkSurfaces : lightSurfaces;
      for (const s of grounds) assert.ok(contrast(t, s) >= 3, `${token} ${t} on ${s}`);
    }
  }
  // A late chip keeps the colour's own readable text instead of turning red on red.
  assert.match(css, /\.wk \.wk-cchip\.pal\.late\{color:var\(--pf\)/);
  // The colour classes set colours only: nothing in them can cover a mark.
  for (const m of css.matchAll(/\.wk \.pal-\d+\{([^}]*)\}/g)) assert.doesNotMatch(m[1], /outline|shadow|border/);
  // A late row keeps its red border all round.
  assert.match(css, /\.wk \.wk-crow\.pal:not\(\.late\)\{border-inline-start-color:var\(--pe\)\}/);
});

test('«نوع الموعد» with nothing chosen is today\'s calendar, class for class', () => {
  assert.deepEqual(DEFAULT_PREFS, { mode: 'kind', colors: {} });
  assert.equal(COLOR_MODES[0].id, 'kind', 'the default comes first');
  for (const e of all) {
    assert.equal(chipClass(e), oldChip(e), e.key);
    assert.equal(chipClass(e, DEFAULT_PREFS, look), oldChip(e), e.key);
    assert.equal(rowClass(e, DEFAULT_PREFS, look), `${CAL_KIND[e.k][1]}${e.late ? ' late' : ''}`);
    assert.equal(labelClass(e, DEFAULT_PREFS, look), CAL_KIND[e.k][1]);
  }
  for (const id of [P1, P2]) assert.equal(bandClass(id, DEFAULT_PREFS), `t${toneOf(id)}`, 'a project band keeps its tone');
  const key = legendOf(DEFAULT_PREFS, all, look, { projects: [], accounts: [], people: [] });
  assert.deepEqual(key.map((x) => x.label), KEY_ORDER.map((k) => CAL_KIND[k][0]));
  assert.deepEqual(key.map((x) => x.cls), KEY_ORDER.map((k) => CAL_KIND[k][1]));
  assert.equal(accountClass(IG, '', DEFAULT_PREFS), '');
});

test('a chosen colour reaches the chip, the row, the key, Home\'s label, the band and the account', () => {
  const kind = prefsOf('kind', { 'kind:pub': 3, 'kind:evt': 8 });
  const pub = all.find((e) => e.k === 'pub');
  assert.equal(chipClass(pub, kind, look).split(' ').slice(0, 3).join(' '), 'k-pub pal pal-3');
  assert.equal(rowClass(pub, kind, look).split(' ').slice(0, 3).join(' '), 'k-pub pal pal-3');
  assert.equal(labelClass(pub, kind, look), 'k-pub pal pal-3');
  const evt = all.find((e) => e.k === 'evt');
  assert.equal(labelClass(evt, kind, look), 'k-event pal pal-8', '«حدث» takes its colour');
  assert.equal(kindClass('event', kind), 'k-event pal pal-8', 'and «تغطية حدث» shares it');
  assert.equal(legendOf(kind, all, look, { projects: [], accounts: [], people: [] }).find((x) => x.key === 'kind:pub').cls, 'k-pub pal pal-3');
  assert.equal(bandClass(P1, prefsOf('kind', { [`project:${P1}`]: 6 })), 'pal pal-6', 'a project\'s colour replaces its tone in every mode');
  assert.equal(accountClass(IG, '', prefsOf('platform', { [`platform:${IG}`]: 2 }), look.platformOf), 'pal pal-2');
  assert.equal(accountClass(IG, 'risk', prefsOf('platform', { [`platform:${IG}`]: 2 }), look.platformOf), 'risk', 'a risk wins');
  assert.equal(accountClass(IG, '', prefsOf('platform'), look.platformOf), `pal pal-${PLATFORM_PAL.instagram}`);
  assert.equal(accountClass(IG, '', prefsOf('status'), look.platformOf), '', 'only in «المنصة»');
});

test('which value an entry has in each mode', () => {
  const find = (pred) => all.find(pred);
  const sched = find((e) => e.k === 'pub' && e.w.id === 'CH-1' && e.ch === IG);
  const stage = find((e) => e.k === 'stage');
  const due = find((e) => e.k === 'due' && e.w.id === 'CH-5');
  const task = find((e) => e.k === 'task');
  const evt = find((e) => e.k === 'evt');
  const rem = find((e) => e.k === 'rem');
  assert.equal(entryValue(sched, 'kind'), 'pub');
  assert.equal(entryValue(evt, 'kind'), 'evt');
  assert.equal(entryValue(sched, 'status'), 'SCHEDULED');
  assert.equal(entryValue(stage, 'status'), 'IN_PRODUCTION', 'a stage takes its work\'s status');
  assert.equal(entryValue(task, 'status'), null, 'a task is not a work');
  assert.equal(entryValue(evt, 'status'), null);
  assert.equal(entryValue(sched, 'project', look), P1, 'the first project of a work');
  assert.equal(entryValue(sched, 'project', { ...look, project: P2 }), P2, 'unless the calendar shows another of its projects');
  assert.equal(entryValue(task, 'project', look), P1);
  assert.equal(entryValue(evt, 'project', look), P2);
  assert.equal(entryValue(rem, 'project', look), null);
  assert.equal(entryValue(find((e) => e.w?.id === 'CH-2'), 'project', look), null, 'a work in no project');
  assert.equal(entryValue(sched, 'platform'), IG);
  assert.equal(entryValue(due, 'platform'), null, 'a delivery is on no account');
  assert.equal(entryValue(sched, 'person'), 'w@x.sa');
  assert.equal(entryValue(stage, 'person', look), 'd@x.sa', 'a stage is its holder\'s');
  assert.equal(entryValue(task, 'person'), 'w@x.sa');
  assert.equal(entryValue(evt, 'person'), null);
  assert.equal(entryValue(rem, 'person'), null, 'a reminder is private and has nobody responsible');
  assert.equal(entryValue(find((e) => e.w?.id === 'CH-4'), 'person'), null, 'a request with nobody responsible yet');
  // What has no value keeps its kind's own colour.
  assert.equal(chipClass(rem, prefsOf('status'), look), oldChip(rem));
  // Every key an entry produces is one the database accepts.
  for (const mode of MODE_IDS) for (const e of all) {
    const k = entryKey(e, prefsOf(mode), look);
    if (k) assert.ok(validKey(k), k);
  }
});

test('the default colours: today\'s for a kind, one per status, the band\'s tone for a project, steady for the rest', () => {
  assert.equal(defaultPal('kind:pub'), null);
  assert.deepEqual(STATUS_ORDER, Object.keys(statusLabels), 'the eleven statuses in their order');
  assert.equal(new Set(STATUS_ORDER.map((s) => STATUS_PAL[s])).size, 11, 'no two statuses start the same');
  for (const s of STATUS_ORDER) assert.equal(defaultPal(`status:${s}`), STATUS_PAL[s]);
  for (const id of [P1, P2]) assert.equal(defaultPal(`project:${id}`), TONE_PAL[toneOf(id)]);
  assert.equal(defaultPal(`platform:${IG}`, look.platformOf), PLATFORM_PAL.instagram);
  assert.equal(defaultPal(`platform:${XA}`, look.platformOf), PLATFORM_PAL.x);
  const other = '33333333-3333-4333-8333-333333333333';
  assert.equal(defaultPal(`platform:${other}`, () => 'threads'), hashPal(other), 'a platform added later starts from its id');
  assert.equal(defaultPal('person:w@x.sa'), defaultPal('person:w@x.sa'), 'steady');
  for (const p of ['a@x.sa', 'b@x.sa', 'جديد@x.sa']) assert.ok(defaultPal(`person:${p}`) >= 0 && defaultPal(`person:${p}`) < 12);
  assert.equal(new Set(Object.values(PLATFORM_PAL)).size, Object.keys(PLATFORM_PAL).length, 'the platforms start apart');
});

test('choosing, returning to the default, and the 200', () => {
  let p = prefsOf('status');
  p = setColor(p, 'status:IN_REVIEW', 4).prefs;
  assert.deepEqual(p.colors, { 'status:IN_REVIEW': 4 });
  assert.equal(palOf('status:IN_REVIEW', p), 4);
  assert.equal(setColor(p, 'status:IN_REVIEW', STATUS_PAL.IN_REVIEW).prefs.colors['status:IN_REVIEW'], undefined, 'picking the default keeps nothing');
  assert.deepEqual(setColor(p, 'status:IN_REVIEW', null).prefs.colors, {}, '«إرجاع الافتراضي» for one value');
  assert.equal(setColor(p, 'status:IN_REVIEW', 12).prefs, p, 'no thirteenth colour');
  assert.equal(setColor(p, 'status:IN_REVIEW', 1.5).prefs, p);
  assert.equal(setColor(p, 'status:مسودة', 1).prefs, p, 'only real keys');
  p = setColor(p, 'kind:pub', 2).prefs;
  p = setColor(p, `project:${P1}`, 7).prefs;
  assert.equal(changedIn(p, 'status'), 1);
  assert.equal(changedIn(p, 'kind'), 1);
  const reset = resetMode(p, 'status');
  assert.deepEqual(reset.colors, { 'kind:pub': 2, [`project:${P1}`]: 7 }, '«إرجاع الافتراضي للكل» empties one mode, the others keep theirs');
  assert.equal(reset.mode, 'status');
  // At most 200 pairs, over every mode together.
  let full = prefsOf('person');
  for (let i = 0; i < MAX_PAIRS; i++) full = setColor(full, `person:p${i}@x.sa`, (defaultPal(`person:p${i}@x.sa`) + 1) % 12).prefs;
  assert.equal(Object.keys(full.colors).length, 200);
  const more = setColor(full, 'kind:due', 3);
  assert.equal(more.full, true, 'the 201st is refused, and said');
  assert.equal(Object.keys(more.prefs.colors).length, 200);
  assert.equal(setColor(full, 'person:p1@x.sa', 0).full, false, 'changing one already kept is fine');
  assert.equal(setColor(full, 'person:p1@x.sa', null).prefs.colors['person:p1@x.sa'], undefined, 'and returning one frees a place');
  assert.equal(MAX_PAIRS, 200);
});

test('a row from the database is read with care: what does not fit is dropped', () => {
  assert.deepEqual(cleanPrefs(null), DEFAULT_PREFS);
  assert.deepEqual(cleanPrefs({ mode: 'rainbow', colors: [] }), DEFAULT_PREFS);
  assert.deepEqual(cleanPrefs({ mode: 'status', colors: { 'status:DRAFT': 3, 'status:nope': 1, 'kind:pub': 12, 'kind:due': '2', 'kind:rem': 9 } }), { mode: 'status', colors: { 'status:DRAFT': 3, 'kind:rem': 9 } });
});

test('the sheet lists every value of a mode, and the key only those on the calendar now', () => {
  const src = {
    projects: [{ id: P1, name: 'حملة الشتاء' }, { id: P2, name: 'المعرض' }],
    accounts: accounts.map((a) => ({ id: a.id, label: a.label })),
    people: [{ email: 'w@x.sa', name: 'كاتب' }, { email: 'd@x.sa', name: 'مصمم' }, { email: 'lead@x.sa', name: 'المدير' }],
  };
  assert.deepEqual(valuesOf('kind', src).map((r) => r.label), KEY_ORDER.map((k) => CAL_KIND[k][0]));
  assert.deepEqual(valuesOf('status', src).map((r) => r.label), STATUS_ORDER.map((s) => statusLabels[s]));
  assert.deepEqual(valuesOf('project', src).map((r) => r.label), ['حملة الشتاء', 'المعرض']);
  assert.equal(valuesOf('person', src).length, 3);
  for (const mode of MODE_IDS) for (const r of valuesOf(mode, src)) assert.ok(validKey(r.key), r.key);
  const status = legendOf(prefsOf('status', { 'status:SCHEDULED': 9 }), all, look, src);
  assert.deepEqual(status.map((x) => x.label), ['قيد الإنتاج', 'قيد المراجعة', 'مجدول'], 'in the sheet\'s order, only what is on screen');
  assert.equal(status.find((x) => x.label === 'مجدول').cls, 'pal pal-9');
  assert.equal(status.find((x) => x.label === 'قيد المراجعة').cls, `pal pal-${STATUS_PAL.IN_REVIEW}`);
  assert.ok(!legendOf(prefsOf('status'), all, look, src).some((x) => x.label === statusLabels.PUBLISHED), 'a failed publish is on screen in red, not as «منشور»');
  const people = legendOf(prefsOf('person'), all, look, { ...src, people: [] });
  assert.ok(people.some((x) => x.label === 'w'), 'someone not in the list still appears, by the name before @');
});

test('the database holds the same keys, modes, colours and limit', () => {
  assert.ok(migFile, 'supabase/migrations/2026110513xxxx_calendar_prefs.sql exists');
  for (const p of KEY_PATTERNS) assert.ok(mig.includes(`'${p}'`), p);
  for (const m of MODE_IDS) assert.ok(mig.includes(`'${m}'`), m);
  assert.match(mig, /<= 200/);
  assert.match(mig, /> 200/);
  assert.match(mig, /'\^\(\[0-9\]\|1\[01\]\)\$'/, 'a colour is 0 to 11');
  assert.match(mig, /create policy calendar_prefs_read on public\.calendar_prefs for select to authenticated\s+using \(email = \(select public\.current_email\(\)\)\)/);
  assert.match(mig, /revoke all on public\.calendar_prefs from public, anon, authenticated;\ngrant select on public\.calendar_prefs to authenticated;/);
  assert.match(mig, /grant execute on function public\.calendar_prefs_save\(text, jsonb\) to authenticated/);
  assert.doesNotMatch(mig, /grant (insert|update|delete)/i, 'the only write is the function');
  assert.match(mig, /create function public\.calendar_prefs_save\(p_mode text, p_colors jsonb\) returns jsonb/);
  for (const code of ['CAL_PREFS_INVALID', 'CAL_PREFS_TOO_MANY']) {
    assert.match(mig, new RegExp(`raise exception '${code}'`));
    assert.notEqual(workErrorText(code), workErrorText('nothing known'), code);
  }
  // The JavaScript and the database read the patterns alike.
  for (const [k, ok] of [['person:a.b+c@x-y.t.test', true], ['person:d ir@t.test', false], ['person:dir', false], ['kind:event', false], ['kind:evt', true], [`project:${P1}`, true], [`project:${P1.toUpperCase()}`, false], ['status:FAILED', true]])
    assert.equal(validKey(k), ok, k);
  assert.equal(keyOf('status', 'DRAFT'), 'status:DRAFT');
});

test('the words are Arabic and carry no emoji', () => {
  const words = JSON.stringify([COLOR_MODES, PALETTE.map((p) => p.name)]);
  assert.doesNotMatch(words, /\p{Extended_Pictographic}/u);
  for (const m of COLOR_MODES) assert.match(m.label + m.hint, /[؀-ۿ]/);
  assert.deepEqual(COLOR_MODES.map((m) => m.label), ['نوع الموعد', 'حالة العمل', 'المشروع', 'المنصة', 'المسؤول']);
  const sheet = read('src/components/work/calendar-colors.tsx');
  assert.doesNotMatch(sheet, /\p{Extended_Pictographic}/u);
  assert.match(sheet, /إرجاع الافتراضي/);
  assert.match(sheet, /لوّن حسب/);
  assert.doesNotMatch(sheet, /type="color"/, 'no free colour picker');
});
