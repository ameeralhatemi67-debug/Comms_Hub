// «استيراد من بطاقة الكاميرا» (src/card.ts, src/card-copy.ts; D12, Desktop_Power_Ideas.md P-20): what a card holds, a
// split recording joined in order, free names, the page's choice checked, a card walked without following a link out of
// it, and a copy that takes its name only once it reads back the same; a cut leaves nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cardItems, cardView, chosenKeys, freeName, SPLIT_AT, visibleName } from '../src/card.ts';
import { copyVerified, listCard, onCard } from '../src/card-copy.ts';

const f = (rel, size, mtimeMs = 1_700_000_000_000) => ({ rel, size, mtimeMs });

test('a card\'s recordings: the studio\'s kinds only, in the card\'s order; a split AVCHD recording is one item, its parts in order', () => {
  const big = SPLIT_AT + 1;
  const items = cardItems([
    f('PRIVATE/AVCHD/BDMV/STREAM/00002.MTS', 500),
    f('PRIVATE/AVCHD/BDMV/STREAM/00000.MTS', big),
    f('PRIVATE/AVCHD/BDMV/STREAM/00001.MTS', big),
    f('PRIVATE/AVCHD/BDMV/STREAM/00003.MTS', 900),
    f('PRIVATE/AVCHD/BDMV/CLIPINF/00000.CPI', 300),
    f('DCIM/100CANON/MVI_0002.MP4', 4000),
    f('DCIM/100CANON/MVI_0001.MP4', big),
    f('DCIM/100CANON/MVI_0001.THM', 20),
    f('DCIM/100CANON/IMG_0003.JPG', 70),
    f('DCIM/100CANON/empty.mp4', 0),
  ]);
  assert.deepEqual(items.map((i) => [i.name, i.parts.length, i.size]), [
    ['IMG_0003.JPG', 1, 70],
    ['MVI_0001.MP4', 1, big],
    ['MVI_0002.MP4', 1, 4000],
    ['00000.MTS', 3, big * 2 + 500],
    ['00003.MTS', 1, 900],
  ], 'an MP4 is never joined; 00000 to 00002 are one recording (each part but the last at the split size); 00003 is the next one');
  assert.deepEqual(items[3].parts, ['PRIVATE/AVCHD/BDMV/STREAM/00000.MTS', 'PRIVATE/AVCHD/BDMV/STREAM/00001.MTS', 'PRIVATE/AVCHD/BDMV/STREAM/00002.MTS']);
  assert.deepEqual(items.map((i) => i.media), ['image', 'video', 'video', 'video', 'video']);
  assert.deepEqual(items.map((i) => i.key), ['c0', 'c1', 'c2', 'c3', 'c4']);
  const view = cardView(items);
  assert.equal(JSON.stringify(view).includes('PRIVATE'), false, 'the page is told no place on the card');
  assert.deepEqual(view[3], { key: 'c3', name: '00000.MTS', size: big * 2 + 500, media: 'video', modified: 1_700_000_000_000, parts: 3 });
  // small parts are separate recordings, and a gap in the numbers ends a recording
  assert.equal(cardItems([f('S/00000.MTS', 10), f('S/00001.MTS', 10)]).length, 2);
  assert.equal(cardItems([f('S/00000.MTS', big), f('S/00002.MTS', 10)]).length, 2);
  assert.equal(cardItems([f('A/00000.MTS', big), f('B/00001.MTS', 10)]).length, 2, 'another folder is another recording');
});

test('names: nothing hidden or Windows\' own; a free name in the destination; the page\'s choice is of this import only', () => {
  for (const n of ['.Trashes', '._MVI_0001.MP4', '$RECYCLE.BIN', 'System Volume Information', '.DS_Store']) assert.equal(visibleName(n), false, n);
  for (const n of ['DCIM', 'MVI_0001.MP4', 'PRIVATE']) assert.equal(visibleName(n), true, n);
  assert.equal(freeName(new Set(), 'a.mp4'), 'a.mp4');
  assert.equal(freeName(new Set(['A.MP4', 'a (2).mp4']), 'a.mp4'), 'a (3).mp4');
  const items = cardItems([f('a.mp4', 5), f('b.mp4', 5)]);
  assert.deepEqual(chosenKeys(['c1', 'c0'], items), ['c1', 'c0']);
  for (const bad of [[], ['c2'], ['c0', 'c0'], ['C:\\a.mp4'], 'c0', null, [0], ['c0', 'c1', 'c1']]) assert.equal(chosenKeys(bad, items), null, JSON.stringify(bad));
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-card-'));
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));

test('a card is walked without following a link or a junction out of it, and a place names a file inside it only', () => {
  const card = path.join(dir, 'card');
  const outside = path.join(dir, 'outside');
  fs.mkdirSync(path.join(card, 'DCIM', '100CANON'), { recursive: true });
  fs.mkdirSync(path.join(card, '.hidden'), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(card, 'DCIM', '100CANON', 'MVI_0001.MP4'), 'x');
  fs.writeFileSync(path.join(card, '.hidden', 'secret.mp4'), 'x');
  fs.writeFileSync(path.join(outside, 'private.mp4'), 'x');
  let linked = false;
  try {
    fs.symlinkSync(outside, path.join(card, 'LINK'), 'junction');
    linked = true;
  } catch {
    linked = false;
  }
  const found = listCard(card);
  assert.deepEqual(found.map((x) => x.rel), ['DCIM/100CANON/MVI_0001.MP4'], `only the card's own media${linked ? ' (a junction out of it was there)' : ''}`);
  assert.ok(linked || process.platform !== 'win32', 'the junction was made, so it was tried');
  assert.equal(onCard(card, 'DCIM/100CANON/MVI_0001.MP4'), path.join(card, 'DCIM', '100CANON', 'MVI_0001.MP4'));
  for (const bad of ['../outside/private.mp4', 'DCIM/../../outside/private.mp4', '']) assert.equal(onCard(card, bad), null, bad);
  assert.equal(listCard(card, { files: 5000, depth: 0 }).length, 0, 'the depth is bounded');
});

test('a split recording is copied as one file, verified, and named only then; a cut leaves no part file', async () => {
  const parts = [crypto.randomBytes(5 * 1024 * 1024 + 7), crypto.randomBytes(3 * 1024 * 1024), crypto.randomBytes(1001)];
  const files = parts.map((b, i) => {
    const p = path.join(dir, `0000${i}.MTS`);
    fs.writeFileSync(p, b);
    return p;
  });
  const dest = path.join(dir, 'joined.MTS');
  const seen = [];
  const r = await copyVerified(files, dest, { onProgress: (n, phase) => seen.push([phase, n]) });
  const whole = Buffer.concat(parts);
  assert.equal(r.bytes, whole.length);
  assert.equal(r.sha256, crypto.createHash('sha256').update(whole).digest('hex'));
  assert.ok(fs.readFileSync(dest).equals(whole), 'the parts end to end, byte for byte');
  assert.equal(fs.existsSync(`${dest}.part`), false);
  assert.deepEqual(seen.at(-1), ['check', whole.length], 'read back to the end');
  // the card pulled out mid-copy: the next part goes while the first is being copied
  const gone = path.join(dir, 'gone.MTS');
  fs.writeFileSync(path.join(dir, 'x0.MTS'), parts[0]);
  fs.writeFileSync(path.join(dir, 'x1.MTS'), parts[1]);
  let pulled = false;
  const later = await copyVerified([path.join(dir, 'x0.MTS'), path.join(dir, 'x1.MTS')], gone, {
    onProgress: () => {
      if (!pulled) fs.rmSync(path.join(dir, 'x1.MTS'));
      pulled = true;
    },
  }).catch((e) => e);
  assert.ok(pulled && later instanceof Error, 'a part that went away fails the copy');
  assert.equal(fs.existsSync(`${gone}.part`), false);
  assert.equal(fs.existsSync(gone), false);
  // cancelled while it copies
  const big = path.join(dir, 'big.MTS');
  fs.writeFileSync(big, crypto.randomBytes(64 * 1024 * 1024));
  const stop = new AbortController();
  const p = copyVerified([big], path.join(dir, 'cancelled.MTS'), { signal: stop.signal, onProgress: () => stop.abort() });
  await assert.rejects(p);
  assert.equal(fs.existsSync(path.join(dir, 'cancelled.MTS.part')), false, 'nothing half-made');
  assert.equal(fs.existsSync(path.join(dir, 'cancelled.MTS')), false);
});
