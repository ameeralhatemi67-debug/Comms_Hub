/* The transparent MOV is ProRes 4444. The test builds a frame with a soft-edged shape on a transparent field, writes it to a MOV
   exactly as the studio does, and has ffmpeg (the reference decoder) read it back: the codec, the alpha channel and the colours
   must survive. Skipped, and said so, when ffmpeg is not installed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createProresEncoder, proresSampleEntry } from '../src/lib/motion/prores.js';
import { muxVideo } from '../src/lib/motion/containers.js';

const W = 200, H = 120, FRAMES = 3;
const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

/* A red-orange disc with a soft edge, a white bar and a fully transparent remainder. Frame i moves the disc. */
function scene(i) {
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, d = Math.hypot(x - (60 + i * 20), y - 60);
    if (d < 40) { const a = Math.max(0, Math.min(1, (40 - d) / 4)); px[o] = 230; px[o + 1] = 80; px[o + 2] = 30; px[o + 3] = Math.round(a * 255); }
    if (x > 120 && x < 190 && y > 20 && y < 40) { px[o] = px[o + 1] = px[o + 2] = 255; px[o + 3] = 255; }
  }
  return px;
}

function writeMov(dir, frames) {
  const encode = createProresEncoder(W, H);
  const samples = frames.map(f => ({ data: encode(f), key: true }));
  const blob = muxVideo({ kind: 'mov', fourcc: 'ap4h', w: W, h: H, fps: 30, depth: 32, name: 'Apple ProRes 4444', ...proresSampleEntry(), samples });
  return blob.arrayBuffer().then(buf => { const file = join(dir, 'a.mov'); writeFileSync(file, Buffer.from(buf)); return { file, samples }; });
}

test('ProRes 4444 frames decode in ffmpeg with their alpha and colours', { skip: !ffmpeg && 'ffmpeg is not installed' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prores-'));
  try {
    const frames = Array.from({ length: FRAMES }, (_, i) => scene(i)), { file } = await writeMov(dir, frames);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,codec_tag_string,width,height,nb_frames,pix_fmt', '-of', 'default=nw=1', file]).stdout.toString();
    assert.match(probe, /codec_name=prores/); assert.match(probe, /codec_tag_string=ap4h/); assert.match(probe, /width=200/); assert.match(probe, /height=120/); assert.match(probe, /nb_frames=3/);
    const raw = join(dir, 'out.rgba');
    const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', raw]);
    assert.equal(run.status, 0, run.stderr.toString());
    const out = readFileSync(raw); assert.equal(out.length, W * H * 4 * FRAMES);
    let worstAlpha = 0, worstColour = 0, opaque = 0;
    for (let f = 0; f < FRAMES; f++) for (let p = 0; p < W * H; p++) {
      const o = (f * W * H + p) * 4, a = frames[f][p * 4 + 3];
      worstAlpha = Math.max(worstAlpha, Math.abs(out[o + 3] - a));
      if (a > 250) { opaque++; for (let c = 0; c < 3; c++) worstColour = Math.max(worstColour, Math.abs(out[o + c] - frames[f][p * 4 + c])); }
    }
    assert.ok(opaque > 1000);
    assert.ok(worstAlpha <= 1, `alpha differs by ${worstAlpha}`);
    assert.ok(worstColour <= 12, `colour differs by ${worstColour}`);
    const corner = out.subarray(0, 4); assert.equal(corner[3], 0, 'transparent corner stays transparent');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a frame that cannot fit a slice at the first quantiser is coarsened, not corrupted', { skip: !ffmpeg && 'ffmpeg is not installed' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'prores-'));
  try {
    const noise = new Uint8ClampedArray(W * H * 4); let s = 1;
    for (let i = 0; i < noise.length; i++) { s = s * 1103515245 + 12345 >>> 0; noise[i] = s >>> 24; }
    const { file } = await writeMov(dir, [noise]);
    const run = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgba', join(dir, 'n.rgba')]);
    assert.equal(run.status, 0, run.stderr.toString()); assert.equal(run.stderr.toString(), '');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
