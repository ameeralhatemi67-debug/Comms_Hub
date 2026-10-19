// Transitions, entry and exit movements (src/lib/studio/transitions.ts, MVP_draft.md 62.3), the keyboard
// shortcuts (shortcuts.ts, 62.2), the fonts (fonts.ts and studio-fonts.ts, 62.4) and the text reveal
// (text.ts). The drawing itself is checked in a browser by qa/studio-engine.cjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TRANSITIONS, TRANSITION_KINDS, ANIMATIONS, ANIM_KINDS, transitionFx, animFx, clipAnimFx, clipTransitionFx, animLengths, combine, NO_FX, isAnim,
} from '../src/lib/studio/transitions.ts';
import { SHORTCUTS, matchShortcut, comboOf, comboLabel, keysOf, typingTarget, GROUPS } from '../src/lib/studio/shortcuts.ts';
import { FONTS, arabicFonts, englishFonts, nearestWeight, WEIGHT_LABELS, fontDef } from '../src/lib/studio/fonts.ts';
import { revealCounts, revealText, usedFonts } from '../src/lib/studio/text.ts';
import { newVideoDoc, US } from '../src/lib/studio/schema.ts';
import { addClip, addSource, setTransition, prevAdjacent, nextAdjacent, clipAlpha, locate } from '../src/lib/studio/timeline.ts';

const W = 1080;
const H = 1920;
const arabic = (s) => /[؀-ۿ]/.test(s) && !/[a-z]{3,}/i.test(s.replace(/Reels|SRT|Ctrl|Shift|Esc/g, ''));

/** How much of the frame an effect lets the item show (0 to 1), roughly. */
function shown(fx) {
  if (fx.alpha <= 0.001) return 0;
  let area = 1;
  if (fx.clip?.kind === 'rect') area = Math.max(0, (fx.clip.w * fx.clip.h) / (W * H));
  if (fx.clip?.kind === 'circle') area = Math.min(1, (Math.PI * fx.clip.r ** 2) / (W * H));
  const off = Math.max(0, 1 - Math.abs(fx.dx) / W) * Math.max(0, 1 - Math.abs(fx.dy) / H);
  return area * off * fx.alpha;
}

test('sixteen transitions and seventeen movements, each with an Arabic name', () => {
  assert.equal(TRANSITIONS.length, TRANSITION_KINDS.length);
  assert.ok(TRANSITIONS.length >= 16);
  assert.equal(ANIMATIONS.length, ANIM_KINDS.length);
  assert.ok(ANIMATIONS.length >= 17);
  for (const x of [...TRANSITIONS, ...ANIMATIONS]) assert.ok(arabic(x.label), x.label);
});

test('every transition starts with the incoming clip hidden and ends with it shown whole and still', () => {
  for (const { kind } of TRANSITIONS) {
    const start = transitionFx(kind, 0, 'in', W, H);
    const end = transitionFx(kind, 1, 'in', W, H);
    if (kind !== 'zoom' && kind !== 'blur') assert.ok(shown(start.fx) < 0.02, `${kind}: hidden at the start (${shown(start.fx)})`);
    else assert.ok(start.fx.alpha === 0, `${kind}: transparent at the start`);
    assert.ok(shown(end.fx) > 0.98, `${kind}: whole at the end`);
    assert.equal(Math.round(end.fx.scale * 1000), 1000, `${kind}: its own size at the end`);
    assert.ok(end.fx.blur < 0.01, `${kind}: sharp at the end`);
    // the outgoing clip is untouched at the start
    const out0 = transitionFx(kind, 0, 'out', W, H);
    assert.ok(shown(out0.fx) > 0.98 && Math.abs(out0.fx.scale - 1) < 1e-9, `${kind}: outgoing whole at the start`);
  }
  // a push moves the outgoing clip out of the frame; a dip covers the frame at its middle
  assert.equal(transitionFx('push-left', 1, 'out', W, H).fx.dx, -W);
  assert.equal(transitionFx('push-up', 1, 'out', W, H).fx.dy, -H);
  const dip = transitionFx('dip-black', 0.5, 'in', W, H);
  assert.equal(dip.overlay.color, '#000000');
  assert.equal(dip.overlay.alpha, 1);
  assert.equal(transitionFx('dip-white', 0.5, 'out', W, H).fx.alpha, 0);
  assert.equal(transitionFx('unknown-kind', 0.5, 'in', W, H).fx.alpha, 0.5, 'an unknown kind is a cross-fade');
});

test('every movement ends whole and still on entry, and starts so on exit', () => {
  for (const { kind } of ANIMATIONS) {
    const done = animFx(kind, 1, 1, W, H);
    assert.ok(Math.abs(done.alpha - 1) < 1e-9 && Math.abs(done.dx) < 1e-6 && Math.abs(done.dy) < 1e-6, `${kind}: in place when shown`);
    assert.ok(Math.abs(done.scale - 1) < 1e-6 && Math.abs(done.rotate) < 1e-6 && done.blur < 1e-6, `${kind}: own size, upright and sharp`);
    if (done.local) assert.equal(done.local.f, 1);
    if (done.reveal) assert.equal(done.reveal.f, 1);
    const before = animFx(kind, 0, 1, W, H);
    const hidden = before.alpha <= 0.001 || before.local?.f === 0 || before.reveal?.f === 0 || before.scale <= 0.01;
    assert.ok(hidden, `${kind}: not seen before it enters`);
  }
  // an exit leaves the way the entry would have continued
  assert.ok(animFx('slide-left', 0.2, 1, W, H).dx > 0, 'enters from the right');
  assert.ok(animFx('slide-left', 0.2, -1, W, H).dx < 0, 'leaves to the left');
  assert.ok(animFx('rise', 0.3, -1, W, H).dy < 0, 'a rise leaves upwards');
});

test('a clip\'s entry and exit are shortened together when they do not fit, and act only at its ends', () => {
  assert.deepEqual(animLengths({ length: 2 * US, animIn: { kind: 'fade', length: 1.5 * US }, animOut: { kind: 'fade', length: 1.5 * US } }), { inLen: US, outLen: US });
  const c = { id: 'c', start: 10 * US, length: 4 * US, animIn: { kind: 'zoom-in', length: US }, animOut: { kind: 'slide-up', length: US } };
  assert.equal(clipAnimFx(c, 12 * US, W, H), NO_FX, 'nothing in the middle');
  assert.ok(clipAnimFx(c, 10.2 * US, W, H).scale < 1);
  assert.ok(clipAnimFx(c, 13.8 * US, W, H).dy < 0, 'leaves upwards');
  assert.equal(clipAnimFx({ ...c, animIn: { kind: 'nope', length: US }, animOut: null }, 10.2 * US, W, H), NO_FX, 'an unknown movement is ignored');
  assert.ok(!isAnim({ kind: 'fade', length: 0 }));
  const both = combine(animFx('fade', 0.5, 1, W, H), animFx('zoom-in', 0.5, 1, W, H));
  assert.ok(both.alpha < 0.9 && both.scale < 1);
});

test('transitions on a track: the incoming and outgoing clips, and a cross-fade stays as it was', () => {
  let d = newVideoDoc('9:16', 30);
  const s = addSource(d, { kind: 'library', asset: '00000000-0000-0000-0000-000000000001', version: 1, name: 'a.mp4', media: 'video', duration: 20 * US, w: W, h: H });
  d = s.doc;
  const a = addClip(d, { source: s.id, start: 0, length: 4 * US, in: 0 });
  const b = addClip(a.doc, { source: s.id, start: 4 * US, length: 4 * US, in: 0 }, { trackId: a.trackId });
  d = b.doc;
  assert.equal(prevAdjacent(d, b.clipId).id, a.clipId);
  assert.equal(nextAdjacent(d, a.clipId).id, b.clipId);
  d = setTransition(d, b.clipId, US, 'push-left');
  const B = locate(d, b.clipId);
  assert.deepEqual(B.clip.transition, { kind: 'push-left', length: US });
  assert.equal(B.clip.start, 3 * US, 'the clips overlap by the transition');
  assert.equal(prevAdjacent(d, b.clipId).id, a.clipId, 'still the clip before it while they overlap');
  const A = locate(d, a.clipId);
  const mid = 3.5 * US;
  assert.ok(clipTransitionFx(B.track, B.clip, mid, W, H).fx.dx > 0, 'the incoming clip comes from the right');
  assert.ok(clipTransitionFx(A.track, A.clip, mid, W, H).fx.dx < 0, 'the outgoing clip is pushed to the left');
  assert.equal(clipAlpha(B.clip, mid), 1, 'a push is not drawn by opacity');
  // changing the length keeps the kind; a cross-fade is drawn by opacity, as before
  d = setTransition(d, b.clipId, 0.5 * US);
  assert.equal(locate(d, b.clipId).clip.transition.kind, 'push-left');
  d = setTransition(d, b.clipId, US, 'fade');
  const F = locate(d, b.clipId);
  assert.equal(clipTransitionFx(F.track, F.clip, 3.5 * US, W, H).fx, NO_FX);
  assert.equal(clipAlpha(F.clip, 3.5 * US), 0.5);
});

test('shortcuts match the key\'s position, so they work with an Arabic keyboard, and differ by editor', () => {
  assert.equal(matchShortcut({ code: 'KeyC', key: 'ؤ' }, 'video'), 'tool-razor');
  assert.equal(matchShortcut({ code: 'KeyK', key: 'ن', ctrlKey: true }, 'video'), 'split');
  assert.equal(matchShortcut({ code: 'KeyZ', metaKey: true }, 'photo'), 'undo', 'Command on a Mac');
  assert.equal(matchShortcut({ code: 'KeyZ', ctrlKey: true, shiftKey: true }, 'video'), 'redo');
  assert.equal(matchShortcut({ code: 'ArrowLeft' }, 'video'), 'frame-back');
  assert.equal(matchShortcut({ code: 'ArrowLeft' }, 'photo'), 'nudge-left');
  assert.equal(matchShortcut({ code: 'Digit3', shiftKey: true }, 'photo'), 'window-3');
  assert.equal(matchShortcut({ code: 'KeyC' }, 'photo'), null, 'no razor in the photo editor');
  assert.equal(comboOf({ code: 'KeyS', ctrlKey: true, shiftKey: true, altKey: true }), 'Ctrl+Alt+Shift+KeyS');
  assert.equal(comboLabel('Shift+Slash'), '?');
  assert.equal(comboLabel('Space'), 'المسافة');
  assert.equal(keysOf('split'), 'S');
  for (const scope of ['video', 'photo']) {
    const seen = new Map();
    for (const s of SHORTCUTS.filter((x) => x.scopes.includes(scope)))
      for (const c of s.combos) {
        assert.ok(!seen.has(c), `${scope}: ${c} is both ${seen.get(c)} and ${s.id}`);
        seen.set(c, s.id);
      }
  }
  for (const s of SHORTCUTS) {
    assert.ok(arabic(s.label), s.label);
    assert.ok(GROUPS.includes(s.group));
  }
  // keys typed into a field are the field's
  assert.equal(typingTarget({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(typingTarget({ tagName: 'INPUT', type: 'range' }), true);
  assert.equal(typingTarget({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(typingTarget({ tagName: 'TEXTAREA' }), true);
  assert.equal(typingTarget({ tagName: 'BUTTON' }), false);
});

test('twelve Arabic and ten English fonts beside the site\'s three, each bundled with its weights', () => {
  assert.equal(FONTS.length, 25);
  assert.equal(arabicFonts().length, 15);
  assert.equal(englishFonts().length, 10);
  assert.equal(new Set(FONTS.map((f) => f.family)).size, 25);
  const bundle = readFileSync('src/components/studio/studio-fonts.ts', 'utf8');
  const layout = readFileSync('src/app/layout.tsx', 'utf8');
  const site = ['IBM Plex Sans Arabic', 'Reem Kufi', 'Aref Ruqaa'];
  for (const f of FONTS) {
    const pkg = f.family.toLowerCase().replace(/ /g, '-');
    for (const w of f.weights) {
      assert.ok(WEIGHT_LABELS[w], `${w} has a name`);
      if (site.includes(f.family)) assert.ok(layout.includes(`@fontsource/${pkg}/${w}.css`), `${f.family} ${w} in layout.tsx`);
      else {
        const subsets = f.script === 'ar' ? ['arabic', 'latin'] : ['latin', 'latin-ext'];
        for (const s of subsets) assert.ok(bundle.includes(`'@fontsource/${pkg}/${s}-${w}.css'`), `${f.family} ${s} ${w} is bundled`);
      }
    }
    assert.ok(f.script === 'en' || arabic(f.label), `${f.family}: an Arabic name`);
    assert.ok(arabic(f.kind), `${f.family}: an Arabic kind`);
  }
  // only these packages are imported: nothing from a font service
  assert.doesNotMatch(bundle, /https?:/);
  const notices = readFileSync('THIRD_PARTY_NOTICES.md', 'utf8');
  for (const f of FONTS) assert.ok(notices.includes(f.family), `${f.family} in THIRD_PARTY_NOTICES.md`);
  assert.equal(nearestWeight('Cairo', 600), 700);
  assert.equal(nearestWeight('Rakkas', 700), 400);
  assert.equal(fontDef('No Such Font').family, 'IBM Plex Sans Arabic');
});

test('a text revealed letter by letter or word by word, Arabic included', () => {
  const lines = [{ text: 'مرحبا بكم', width: 0, dir: 'rtl' }, { text: 'Hello you', width: 0, dir: 'ltr' }];
  assert.deepEqual(revealCounts(lines, 1, 'words'), [2, 2]);
  assert.deepEqual(revealCounts(lines, 0.5, 'words'), [2, 0]);
  assert.deepEqual(revealCounts(lines, 0, 'chars'), [0, 0]);
  assert.equal(revealText('مرحبا بكم', 1, 'words'), 'مرحبا');
  assert.equal(revealText('مرحبا بكم', 3, 'chars'), 'مرح');
  const d = addClip(newVideoDoc(), { start: 0, length: US, text: { content: 'x', font: 'Cairo', weight: 700, size: 60, color: '#fff', align: 'center', width: 0.8, lineHeight: 1.3 } }).doc;
  assert.deepEqual(usedFonts(d), [{ font: 'Cairo', weight: 700 }]);
});
