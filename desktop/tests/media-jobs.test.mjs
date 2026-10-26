// FFmpeg's fixed jobs (src/media-jobs.ts, D5; decision D-9): names, arguments, progress, failures, the probe's
// summary; then the recipes run for real with the pinned build in vendor/ffmpeg, when it has been fetched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CACHE_NAME } from '../src/files.ts';
import { convertArgs, estimateBytes, failureOf, heavy, keepsTimes, outputName, probeArgs, PROXY_HEIGHTS, proxyArgs, readProgress, RECIPE, sourceId, summarize, videoRate } from '../src/media-jobs.ts';

const asset = '0a1b2c3d-0000-4000-8000-00000000abcd';
const print = 'ab'.repeat(32);

test('a copy is named by its source, its recipe and the FFmpeg it was made with, and is a cache name', () => {
  assert.equal(sourceId({ fingerprint: print }), `f${print.slice(0, 40)}`);
  assert.equal(sourceId({ asset, version: 3 }), `${asset}-v3`);
  for (const bad of [{ fingerprint: 'xyz' }, { fingerprint: print.toUpperCase() }, { asset: 'not-a-uuid', version: 1 }, { asset, version: 0 }, { asset, version: 1.5 }]) assert.equal(sourceId(bad), null, JSON.stringify(bad));
  const id = sourceId({ asset, version: 3 });
  assert.equal(outputName('proxy', id, 'ff902', 720), `proxy-${id}-720-${RECIPE}-ff902.mp4`);
  assert.equal(outputName('convert', id, 'ff902'), `convert-${id}-${RECIPE}-ff902.mp4`);
  assert.ok(CACHE_NAME.test(outputName('proxy', sourceId({ fingerprint: print }), 'ff902', 1080)));
  assert.equal(outputName('proxy', id, 'ff902', 480), null, 'only the offered heights');
  assert.equal(outputName('proxy', id, 'ff902'), null);
  assert.equal(outputName('proxy', id, 'FF 9', 720), null, 'a tag is plain');
  assert.notEqual(outputName('proxy', id, 'ff902', 720), outputName('proxy', id, 'ff903', 720), 'another FFmpeg, another copy');
  assert.notEqual(outputName('proxy', `${asset}-v3`, 'ff902', 720), outputName('proxy', `${asset}-v4`, 'ff902', 720), 'another version, another copy');
  assert.deepEqual([...PROXY_HEIGHTS], [720, 1080]);
});

test('the jobs name the operating system\'s encoders only, keep every frame at its time, and end with the output', () => {
  for (const [args, out] of [[proxyArgs('in.mov', 'out.part', 720), 'out.part'], [proxyArgs('in.mov', 'out.part', 1080), 'out.part'], [convertArgs('in.mxf', 'c.part', 2160), 'c.part']]) {
    const codecs = args.flatMap((a, i) => (a === '-c:v' || a === '-c:a' ? [args[i + 1]] : []));
    assert.deepEqual(codecs, ['h264_mf', 'aac_mf']);
    assert.equal(args[args.indexOf('-fps_mode') + 1], 'passthrough');
    assert.equal(args[args.indexOf('-i') + 1].startsWith('in.'), true);
    assert.equal(args.at(-1), out);
    assert.deepEqual(args.slice(-3, -1), ['-f', 'mp4'], 'the container is named, whatever the file is called');
    assert.ok(args.includes('-nostdin') && args.includes('-hide_banner'));
    assert.equal(args.some((a) => /libx26|nvenc|_amf|_qsv|libopenh264|-filter_complex|-lavfi/.test(a)), false, 'nothing else');
    assert.equal(args[args.indexOf('-map') + 1], '0:v:0');
    assert.ok(args.includes('0:a:0?'), 'the sound when there is one');
  }
  assert.ok(proxyArgs('a', 'b', 720).includes('scale=-2:720:flags=bicubic,format=nv12'));
  assert.ok(convertArgs('a', 'b', 1081).includes('scale=trunc(iw/2)*2:trunc(ih/2)*2,format=nv12'), 'even sizes for H.264');
  assert.throws(() => proxyArgs('a', 'b', 480));
  assert.equal(videoRate('proxy', 720), 4e6);
  assert.equal(videoRate('convert', 2160), 80e6);
  assert.deepEqual(probeArgs('x.mxf'), ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', 'x.mxf']);
});

test('a copy keeps the original\'s times when the browser reads its container, and starts at zero otherwise', () => {
  for (const c of ['mov,mp4,m4a,3gp,3g2,mj2', 'matroska,webm', 'mpegts']) assert.equal(keepsTimes(c), true, c);
  for (const c of ['mxf', 'avi', 'mpeg', '']) assert.equal(keepsTimes(c), false, c);
  assert.ok(proxyArgs('a', 'b', 720).indexOf('-copyts') < proxyArgs('a', 'b', 720).indexOf('-i'), 'before the input it applies to');
  assert.ok(proxyArgs('a', 'b', 720, true).includes('-copyts'));
  assert.equal(proxyArgs('a', 'b', 720, false).includes('-copyts'), false);
  assert.ok(convertArgs('a', 'b', 1080, true).includes('-copyts'));
  assert.equal(convertArgs('a', 'b', 1080, false).includes('-copyts'), false);
});

test('progress from FFmpeg\'s lines, and failures as one word', () => {
  assert.deepEqual(readProgress('frame=10\nout_time_us=400000\nprogress=continue\nout_time_us=1500000\n'), { seconds: 1.5, end: false });
  assert.deepEqual(readProgress('progress=end\n'), { seconds: null, end: true });
  assert.equal(failureOf('av_interleaved_write_frame(): No space left on device'), 'space');
  assert.equal(failureOf('[h264_mf @ 0x1] could not set output type (80004005)\nError while opening encoder'), 'encode');
  assert.equal(failureOf('D:\\x.mov: Invalid data found when processing input'), 'decode');
  assert.equal(failureOf('something else'), 'failed');
});

test('the probe keeps only what the studio needs, and a heavy source is told apart', () => {
  const p = summarize({
    format: { duration: '12.5', size: '400000000', bit_rate: '256000000', format_name: 'mov,mp4,m4a,3gp,3g2,mj2', filename: 'D:\\secret\\a.mov', tags: { encoder: 'x' } },
    streams: [
      { codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 }, width: 100, height: 100 },
      { codec_type: 'video', codec_name: 'prores', profile: 'Standard', width: 3840, height: 2160, pix_fmt: 'yuv422p10le', avg_frame_rate: '25/1', disposition: {} },
      { codec_type: 'audio', codec_name: 'pcm_s16le', sample_rate: '48000', channels: 2 },
    ],
  });
  assert.deepEqual(p.video, { codec: 'prores', profile: 'Standard', width: 3840, height: 2160, pixFmt: 'yuv422p10le', fps: 25, bitDepth: 10 });
  assert.deepEqual(p.audio, { codec: 'pcm_s16le', rate: 48000, channels: 2 });
  assert.equal(p.duration, 12.5);
  assert.equal(JSON.stringify(p).includes('secret'), false, 'never the file\'s path or tags');
  assert.equal(heavy(p), true);
  const light = summarize({ format: { duration: '5', bit_rate: '8000000' }, streams: [{ codec_type: 'video', codec_name: 'h264', width: 1920, height: 1080, pix_fmt: 'yuv420p', avg_frame_rate: '30000/1001' }] });
  assert.equal(light.video.fps, 29.97);
  assert.equal(light.video.bitDepth, 8);
  assert.equal(heavy(light), false);
  assert.equal(heavy({ ...light, bitRate: 60e6 }), true, 'above 50 Mbit/s');
  assert.equal(summarize(null), null);
  assert.equal(summarize({ streams: [] }), null);
  assert.ok(estimateBytes('convert', 0, p) > (12.5 * 80e6) / 8, 'room for the copy');
});

// The recipes for real, with the build the application ships (skipped until scripts/fetch-ffmpeg.mjs has run).
const vendor = new URL('../vendor/ffmpeg/', import.meta.url);
const ffmpeg = path.join(vendor.pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'ffmpeg.exe');
const ffprobe = path.join(path.dirname(ffmpeg), 'ffprobe.exe');
const shipped = process.platform === 'win32' && fs.existsSync(ffmpeg);

test('the pinned build is LGPL v3 with no GPL or nonfree part, and has the encoders the jobs name', { skip: !shipped && 'vendor/ffmpeg not fetched' }, () => {
  const v = spawnSync(ffmpeg, ['-hide_banner', '-version'], { encoding: 'utf8' }).stdout;
  assert.match(v, /--enable-version3/);
  assert.equal(/--enable-gpl|--enable-nonfree/.test(v), false);
  const enc = spawnSync(ffmpeg, ['-hide_banner', '-encoders'], { encoding: 'utf8' }).stdout;
  assert.match(enc, / h264_mf /);
  assert.match(enc, / aac_mf /);
  const pinned = JSON.parse(fs.readFileSync(path.join(path.dirname(ffmpeg), 'PINNED.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(new URL('../ffmpeg.lock.json', import.meta.url), 'utf8'));
  assert.equal(pinned.sha256, lock.sha256);
  assert.match(lock.file, /-lgpl-shared-/);
});

test('a light copy and an editable copy, made by the recipes from a ProRes source, keep every frame at its time', { skip: !shipped && 'vendor/ffmpeg not fetched' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'comms-hub-media-'));
  try {
    const src = path.join(dir, 'src.mov');
    const make = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=1919x1080:rate=25:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=2', '-c:v', 'prores_ks', '-profile:v', '2', '-c:a', 'pcm_s16le', src], { encoding: 'utf8' });
    assert.equal(make.status, 0, make.stderr);
    const probe = (f) => summarize(JSON.parse(spawnSync(ffprobe, probeArgs(f), { encoding: 'utf8' }).stdout));
    const frames = (f) => Number(JSON.parse(spawnSync(ffprobe, ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,start_time', '-of', 'json', f], { encoding: 'utf8' }).stdout).streams[0].nb_read_frames);
    const p = probe(src);
    assert.equal(p.video.codec, 'prores');
    const proxy = path.join(dir, 'p.part');
    const r1 = spawnSync(ffmpeg, proxyArgs(src, proxy, 720), { encoding: 'utf8' });
    assert.equal(r1.status, 0, r1.stderr);
    assert.match(r1.stdout, /progress=end/);
    const q = probe(proxy);
    assert.deepEqual([q.video.codec, q.video.height, q.audio.codec, q.audio.rate], ['h264', 720, 'aac', 48000]);
    assert.equal(frames(proxy), 50);
    const convert = path.join(dir, 'c.part');
    const r2 = spawnSync(ffmpeg, convertArgs(src, convert, p.video.height), { encoding: 'utf8' });
    assert.equal(r2.status, 0, r2.stderr);
    const c = probe(convert);
    assert.deepEqual([c.video.codec, c.video.width, c.video.height], ['h264', 1918, 1080], 'an odd width made even');
    assert.equal(frames(convert), 50);
    // a camera's MPEG-TS starts at about 1.4 s: its light copy starts there too
    const ts = path.join(dir, 'cam.mts');
    const r3 = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=2', '-f', 'lavfi', '-i', 'sine=duration=2', '-shortest', '-c:v', 'mpeg2video', '-c:a', 'mp2', '-f', 'mpegts', ts], { encoding: 'utf8' });
    assert.equal(r3.status, 0, r3.stderr);
    // MPEG-TS lists its streams under a program as well, so the first line only
    const start = (f) => parseFloat(spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=start_time', '-of', 'csv=p=0', f], { encoding: 'utf8' }).stdout.trim().split(/\r?\n/)[0]);
    assert.ok(start(ts) > 1, 'the source starts late');
    const tsProxy = path.join(dir, 't.part');
    const r4 = spawnSync(ffmpeg, proxyArgs(ts, tsProxy, 720, keepsTimes(probe(ts).container)), { encoding: 'utf8' });
    assert.equal(r4.status, 0, r4.stderr);
    assert.ok(Math.abs(start(tsProxy) - start(ts)) < 0.021, `the copy starts with it: ${start(tsProxy)} and ${start(ts)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
