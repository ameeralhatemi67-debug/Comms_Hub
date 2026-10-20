// The studio, third round, Phase 10 (MVP_draft.md 62.12): reserved places and the tasks made for them. A
// place is full frame on a video track or a box on a graphics track, is named by what it waits for, makes the
// note its task carries, is counted by the export checks, and is filled by a library file at its exact
// version. The task goes through the work cycle's own task_create; nothing writes the tasks table directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newVideoDoc, checkDoc, US } from '../src/lib/studio/schema.ts';
import { addClip, kindFor, locate } from '../src/lib/studio/timeline.ts';
import { newSlot, slotLabel, openSlots, slotNote, fillSlot, SLOT_MEDIA_LABELS } from '../src/lib/studio/slot.ts';
import { exportChecks } from '../src/lib/studio/checks.ts';
import { diffDocs } from '../src/lib/studio/diff.ts';

const read = (f) => readFileSync(f, 'utf8');
const T = { x: 540, y: 960, scale: 1, rotation: 0, opacity: 1 };

function withSlots() {
  let doc = newVideoDoc('9:16', 30);
  const full = addClip(doc, { start: 2 * US, length: 4 * US, slot: newSlot('video', false, 1080, 1920), transform: T });
  doc = full.doc;
  const box = addClip(doc, { start: 0, length: 6 * US, slot: newSlot('image', true, 1080, 1920), transform: { ...T, y: 576 } });
  return { doc: box.doc, full: full.clipId, box: box.clipId };
}

test('a place: full frame on a video track, or a box on a graphics track; named by what it waits for', () => {
  const { doc, full, box } = withSlots();
  assert.equal(locate(doc, full).track.kind, 'video');
  assert.equal(locate(doc, box).track.kind, 'graphics');
  assert.equal(kindFor(doc, { slot: newSlot('video', false, 10, 10) }), 'video');
  assert.equal(kindFor(doc, { slot: newSlot('image', true, 10, 10) }), 'graphics');
  const s = newSlot('image', true, 1080, 1920);
  assert.deepEqual([s.w, s.h, s.over, s.media], [648, 653, true, 'image']);
  assert.deepEqual([newSlot('video', false, 1080, 1920).w, newSlot('video', false, 1080, 1920).h], [1080, 1920]);
  assert.equal(slotLabel({ ...s, what: 'شعار الشريك' }), 'مكان محجوز: شعار الشريك');
  assert.equal(slotLabel({ ...s, what: '  ' }), `مكان محجوز: ${SLOT_MEDIA_LABELS.image}`);
  assert.equal(openSlots(doc).length, 2);
  assert.equal(checkDoc(doc, 'video'), null);
});

test('the task note says where the place is, how long, and the size wanted', () => {
  const { doc, full, box } = withSlots();
  const n1 = slotNote(doc, locate(doc, full).clip, 'حملة اليوم');
  assert.equal(n1, 'للمشروع «حملة اليوم» في الاستوديو: لقطة فيديو عند 0:02 لمدة 4 ث، بمقاس 1080×1920 ملء الإطار.');
  const n2 = slotNote(doc, locate(doc, box).clip, 'حملة اليوم', 'بخلفية شفافة');
  assert.match(n2, /صورة عند 0:00 لمدة 6 ث، بمقاس 648×653 فوق اللقطة\. بخلفية شفافة$/);
  assert.ok(slotNote(doc, locate(doc, box).clip, 'x', 'ا'.repeat(600)).length <= 500);
});

test('an empty place is a warning before export, never a stop', () => {
  const one = exportChecks({ kind: 'video', ratios: [9 / 16], seconds: 6, slots: 1 }, []);
  assert.deepEqual(one.map((c) => c.level), ['warn']);
  assert.match(one[0].text, /مكان محجوز لم يُملأ/);
  assert.match(exportChecks({ kind: 'video', ratios: [9 / 16], seconds: 6, slots: 3 }, [])[0].text, /3 أماكن محجوزة/);
  assert.equal(exportChecks({ kind: 'video', ratios: [9 / 16], seconds: 6 }, []).length, 0);
});

test('«وضعه مكان المحجوز»: the file at its version takes the place, its start and track, fitted to the frame or the box', () => {
  const { doc, full, box } = withSlots();
  const video = { kind: 'library', asset: '00000000-0000-4000-8000-0000000000d1', version: 3, name: 'لقطة.mp4', media: 'video', w: 1920, h: 1080, duration: 2.5 * US };
  const a = fillSlot(doc, full, video);
  const c = locate(a, full).clip;
  assert.equal(c.slot, undefined);
  assert.equal(c.start, 2 * US);
  assert.equal(c.length, 2.5 * US, 'shortened to the video');
  assert.equal(locate(a, full).track.kind, 'video');
  const src = a.sources.find((s) => s.id === c.source);
  assert.deepEqual([src.asset, src.version], [video.asset, 3]);
  assert.equal(c.transform.scale, 1);
  assert.equal(openSlots(a).length, 1);
  // a picture in the box: fitted inside 648x653 over the 1080x1920 frame
  const pic = { kind: 'library', asset: '00000000-0000-4000-8000-0000000000d2', version: 1, name: 'شعار.png', media: 'image', w: 800, h: 400 };
  const b = fillSlot(a, box, pic);
  const cb = locate(b, box).clip;
  assert.equal(cb.length, 6 * US, 'a picture keeps the length');
  assert.equal(locate(b, box).track.kind, 'graphics');
  // contained in the frame the picture is 1080 wide; the box is 648 wide and 653 high: 648/1080
  assert.ok(Math.abs(cb.transform.scale - 0.6) < 1e-9, String(cb.transform.scale));
  assert.equal(cb.transform.y, 576);
  // the same file in both places is one source
  const w2 = withSlots();
  const twice = fillSlot(fillSlot(w2.doc, w2.box, pic), w2.full, pic);
  assert.equal(twice.sources.length, 1);
  assert.equal(openSlots(twice).length, 0);
  assert.equal(fillSlot(doc, 'nothing', pic), doc);
  assert.match(diffDocs(doc, b).lines.join(" "), /مكان محجوز/);
});

test('the task goes through task_create with the work, the frame is attached as the task\'s file, nothing writes tasks directly', () => {
  const panel = read('src/components/studio/slot-panel.tsx');
  assert.match(panel, /rpc\('task_create', \{\s*p: \{ what: slot\.what\.trim\(\)\.slice\(0, 140\), kind, assignee: who, due: new Date\(due\)\.toISOString\(\), note, work: workRef \?\? '', asset: asset\?\.id \?\? '', priority: 'normal' \},/);
  assert.doesNotMatch(panel, /from\('media_tasks'\)\.(insert|update|upsert|delete)/);
  assert.match(panel, /exportStill\(doc, pool, \{ t: clip\.start/);
  assert.match(panel, /x\.added_at >= since/);
  const sql = read('supabase/migrations/20261013120000_work_cycle_planning.sql');
  const fn = sql.match(/create or replace function public\.task_create\(p jsonb\)[\s\S]*?\n\$\$;/)[0];
  for (const k of ["p->>'what'", "p->>'kind'", "p->>'assignee'", "p->>'due'", "p->>'note'", "p->>'work'", "p->>'asset'"]) assert.ok(fn.includes(k), k);
  // the slot's own drawing is the same in the preview and the export (one compositor)
  assert.match(read('src/lib/studio/compose.ts'), /if \(item\.slot\) \{[\s\S]*?drawSlot\(ctx, sl, w, h, s\)/);
});
