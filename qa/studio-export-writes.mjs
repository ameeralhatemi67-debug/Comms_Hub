// Where the studio's MP4 export writes its bytes, and when (Desktop_Power_Ideas.md P-25, parked 2026-11-04).
// The export is Mp4OutputFormat({ fastStart: false }) over StreamTarget(writable, { chunked: true }) (src/lib/studio/
// export.ts, target.ts); this probe makes the same output from made-up AVC and AAC packets, which the muxer does not
// decode, and records every write the writable receives: its offset, its length, and whether it came before
// finalize() was called. It answers one question: could a provider that takes bytes only forward from byte 0
// (Google Drive's resumable upload, the library's only provider) receive any of the file while it is being made?
// Node only: no port, no browser, no network.
// Usage: node qa/studio-export-writes.mjs   (writes qa/studio-export-writes.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as mb from 'mediabunny';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', 'mediabunny', 'package.json'), 'utf8')).version;
/** Drive's resumable upload: every chunk but the last is a multiple of 256 KiB, sent in order from byte 0. */
const DRIVE_STEP = 256 * 1024;
const MIB = 1024 * 1024;

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: Boolean(pass), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${pass ? '' : ` | ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};

// The probe is only worth its numbers while the export keeps these options.
const exportSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'studio', 'export.ts'), 'utf8');
const targetSrc = fs.readFileSync(path.join(root, 'src', 'lib', 'studio', 'target.ts'), 'utf8');
check('export.ts still writes Mp4OutputFormat({ fastStart: false })', exportSrc.includes('new mb.Mp4OutputFormat({ fastStart: false })'));
check('target.ts still writes StreamTarget(writable, { chunked: true })', targetSrc.includes('new mb.StreamTarget(writable, { chunked: true })'));

// avcC for High 4.0 with one short SPS and PPS, and an AAC-LC AudioSpecificConfig: copied into the file, never decoded.
const AVCC = new Uint8Array([1, 0x64, 0, 0x28, 0xff, 0xe1, 0, 4, 0x67, 0x64, 0, 0x28, 1, 0, 4, 0x68, 0xee, 0x3c, 0x80]);
const ASC = new Uint8Array([0x11, 0x90]);

/** One export's writes: `packets` video packets of `per` bytes at 30 a second, with sound alongside. */
async function run(packets, per) {
  const writes = [];
  const file = new Uint8Array(packets * per + 4 * MIB);
  let size = 0;
  let finalizing = false;
  const writable = new WritableStream({
    write(chunk) {
      writes.push({ offset: chunk.position, length: chunk.data.byteLength, afterFinalizeCalled: finalizing });
      file.set(chunk.data, chunk.position);
      size = Math.max(size, chunk.position + chunk.data.byteLength);
    },
  });
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: false }), target: new mb.StreamTarget(writable, { chunked: true }) });
  const video = new mb.EncodedVideoPacketSource('avc');
  output.addVideoTrack(video, { frameRate: 30 });
  const audio = new mb.EncodedAudioPacketSource('aac');
  output.addAudioTrack(audio);
  await output.start();
  let aT = 0;
  for (let i = 0; i < packets; i++) {
    const t = i / 30;
    const meta = i === 0 ? { decoderConfig: { codec: 'avc1.640028', codedWidth: 1920, codedHeight: 1080, description: AVCC } } : undefined;
    await video.add(new mb.EncodedPacket(new Uint8Array(per).fill(i & 0xff), i % 60 === 0 ? 'key' : 'delta', t, 1 / 30), meta);
    while (aT <= t) {
      const ameta = aT === 0 ? { decoderConfig: { codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, description: ASC } } : undefined;
      await audio.add(new mb.EncodedPacket(new Uint8Array(400).fill(7), 'key', aT, 1024 / 48000), ameta);
      aT += 1024 / 48000;
    }
  }
  finalizing = true;
  await output.finalize();

  const bytes = file.subarray(0, size);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes = [];
  for (let at = 0; at + 8 <= size; ) {
    const s = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    const boxSize = s === 1 ? Number(view.getBigUint64(at + 8)) : s;
    boxes.push({ offset: at, size: boxSize, type });
    if (boxSize < 8) break;
    at += boxSize;
  }
  // a write is out of order when it lands before the furthest byte already written
  let furthest = 0;
  const outOfOrder = [];
  writes.forEach((w, i) => {
    if (w.offset < furthest) outOfOrder.push({ index: i, offset: w.offset, length: w.length, furthestBefore: furthest });
    furthest = Math.max(furthest, w.offset + w.length);
  });
  // what a strictly forward provider could hold before finalize(): the run of bytes from 0 that no later write touches
  let settled = size;
  for (const w of writes) if (w.afterFinalizeCalled) settled = Math.min(settled, w.offset);
  const writtenBeforeFinalize = writes.filter((w) => !w.afterFinalizeCalled).reduce((n, w) => n + w.length, 0);
  return {
    packets,
    bytesPerPacket: per,
    size,
    writes,
    outOfOrder,
    boxes,
    writtenBeforeFinalize,
    forwardPrefixBeforeFinalize: settled,
    driveChunksBeforeFinalize: Math.floor(settled / DRIVE_STEP),
  };
}

const large = await run(600, 100_000);
const small = await run(60, 100_000);
const ftyp = large.boxes[0];
const mdat = large.boxes[1];

check('the layout is ftyp, mdat, moov', large.boxes.map((b) => b.type).join(',') === 'ftyp,mdat,moov' && small.boxes.map((b) => b.type).join(',') === 'ftyp,mdat,moov', { large: large.boxes, small: small.boxes });
check('large file: full 16 MiB pieces in order before finalize', large.writes.filter((w) => !w.afterFinalizeCalled).every((w, i) => w.offset === i * 16 * MIB && w.length === 16 * MIB), large.writes);
check('large file: exactly one write out of order', large.outOfOrder.length === 1, large.outOfOrder);
check('large file: that write is the mdat header, rewritten at finalize', large.outOfOrder[0]?.offset === mdat.offset && large.outOfOrder[0]?.length === 8 && large.writes[large.outOfOrder[0].index].afterFinalizeCalled, { mdat, write: large.outOfOrder[0] });
check('the mdat header starts right after ftyp, at byte 28', ftyp.size === 28 && mdat.offset === 28, { ftyp, mdat });
check('small file: one write, at finalize, the whole file', small.writes.length === 1 && small.writes[0].offset === 0 && small.writes[0].length === small.size && small.writes[0].afterFinalizeCalled, small.writes);
check('a forward-only provider can hold no 256 KiB chunk before finalize', large.driveChunksBeforeFinalize === 0 && small.driveChunksBeforeFinalize === 0, { large: large.forwardPrefixBeforeFinalize, small: small.forwardPrefixBeforeFinalize });

const result = {
  name: 'studio-export-writes',
  ranAt: new Date().toISOString(),
  node: process.version,
  mediabunny: version,
  options: { format: 'Mp4OutputFormat({ fastStart: false })', target: 'StreamTarget(writable, { chunked: true })', chunk: '16 MiB (Mediabunny default)' },
  driveStep: DRIVE_STEP,
  large,
  small,
  conclusion:
    'Before finalize the writable has received only whole 16 MiB pieces; at finalize the muxer rewrites the 8-byte mdat header at byte 28. '
    + 'A provider that takes bytes only forward from byte 0 can therefore receive nothing before the export ends, so with the file unchanged '
    + 'an upload to Google Drive cannot overlap the export. A provider that takes parts in any order (S3 multipart) could take every piece '
    + 'but the first during the export.',
  checks,
  passed: checks.filter((c) => c.pass).length,
  total: checks.length,
};
fs.writeFileSync(path.join(here, 'studio-export-writes.json'), `${JSON.stringify(result, null, 1)}\n`);
console.log(`${result.passed} of ${result.total}`);
if (result.passed !== result.total) process.exitCode = 1;
