// The media jobs FFmpeg runs for the studio (Desktop_App_Plan.md D5, decision D-9): a fixed list, never a
// command line. `probe` reads what a file is; `proxy` makes a light copy for the preview (720p or 1080p);
// `convert` makes an editable copy of a file the browser cannot decode. Only the operating system's own
// encoders are named (Media Foundation: h264_mf, aac_mf); the LGPL build carries others too, which no job
// names. Frames keep their timestamps (passthrough), and a copy keeps the original's own times when the
// browser can read the original's container (a camera's MTS starts at 1.4 s, say), since cuts may already be
// placed on them: a cut lands on the same frame in a copy and in the original. Each copy is named by its source, its recipe and FFmpeg's version, so a new version of any
// of the three makes a new copy (Studio_Feasibility_and_App_Path.md 10.4). Pure: native-media.ts runs the
// jobs in the utility process (media-worker.ts).
import { CACHE_NAME } from './files.ts';

export const PROXY_HEIGHTS = Object.freeze([720, 1080]);
/** The recipe's version, part of every copy's name: changed whenever an argument below changes. */
export const RECIPE = 'r1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A source's id in a copy's name: a device file's fingerprint, or a library file and version. */
export function sourceId(source: { fingerprint: string } | { asset: string; version: number }): string | null {
  if ('fingerprint' in source) return /^[0-9a-f]{64}$/.test(source.fingerprint) ? `f${source.fingerprint.slice(0, 40)}` : null;
  return UUID.test(source.asset) && Number.isSafeInteger(source.version) && source.version >= 1 ? `${source.asset}-v${source.version}` : null;
}

/** The name of a light or converted copy in the cache folder, or null when it would not be a valid name. */
export function outputName(kind: 'proxy' | 'convert', id: string, tag: string, height?: number): string | null {
  if (kind === 'proxy' && !PROXY_HEIGHTS.includes(height as number)) return null;
  if (!/^[a-z0-9]{1,16}$/.test(tag)) return null;
  const name = kind === 'proxy' ? `proxy-${id}-${height}-${RECIPE}-${tag}.mp4` : `convert-${id}-${RECIPE}-${tag}.mp4`;
  return CACHE_NAME.test(name) ? name : null;
}

export function probeArgs(input: string): string[] {
  return ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', input];
}

const AUDIO = ['-c:a', 'aac_mf', '-b:a', '160k', '-ar', '48000', '-ac', '2'];
// the container is named: the copy is written under a .part name first, which says nothing of it
const TAIL = ['-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-f', 'mp4'];
const HEAD = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error'];

/** Video bits per second of each copy. */
export function videoRate(kind: 'proxy' | 'convert', height: number): number {
  if (kind === 'proxy') return height >= 1080 ? 8e6 : 4e6;
  return height > 1440 ? 80e6 : height > 720 ? 40e6 : 16e6;
}

/**
 * The containers the browser's reader (Mediabunny) opens, by ffprobe's name for them. Their times may be in
 * a project already, so a copy keeps them; a copy of anything else starts at zero, as the studio then first
 * meets it through the copy.
 */
const READABLE = ['mov', 'mp4', 'matroska', 'webm', 'mpegts', 'ogg', 'wav', 'mp3', 'aac', 'flac'];
export function keepsTimes(container: string): boolean {
  return container.split(',').some((c) => READABLE.includes(c.trim()));
}
const TIMES = (keep: boolean) => (keep ? ['-copyts'] : []);

/** A light copy: the picture scaled to `height`, every frame at its own time, the first sound track kept. */
export function proxyArgs(input: string, output: string, height: number, keepTimes = true): string[] {
  if (!PROXY_HEIGHTS.includes(height)) throw new Error('not an offered height');
  return [...HEAD, ...TIMES(keepTimes), '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-vf', `scale=-2:${height}:flags=bicubic,format=nv12`, '-fps_mode', 'passthrough', '-c:v', 'h264_mf', '-rate_control', 'u_vbr', '-b:v', String(videoRate('proxy', height)), '-scenario', 'archive', '-g', '15', ...AUDIO, ...TAIL, output];
}

/** An editable copy at full size: H.264 and AAC the browser decodes, every frame at its own time. */
export function convertArgs(input: string, output: string, height: number, keepTimes = true): string[] {
  return [...HEAD, ...TIMES(keepTimes), '-i', input, '-map', '0:v:0', '-map', '0:a:0?', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=nv12', '-fps_mode', 'passthrough', '-c:v', 'h264_mf', '-rate_control', 'u_vbr', '-b:v', String(videoRate('convert', height)), '-scenario', 'archive', '-g', '30', ...AUDIO, ...TAIL, output];
}

/** The time FFmpeg has written so far, from its -progress lines; `end` once it said so. */
export function readProgress(text: string): { seconds: number | null; end: boolean } {
  let seconds: number | null = null;
  for (const m of text.matchAll(/out_time_us=(\d+)/g)) seconds = Number(m[1]) / 1e6;
  return { seconds, end: /progress=end/.test(text) };
}

/** Why a job failed, in a word the page can say, from FFmpeg's error lines (which never leave the application). */
export function failureOf(stderr: string): 'space' | 'decode' | 'encode' | 'failed' {
  if (/no space left|disk full|ENOSPC/i.test(stderr)) return 'space';
  if (/error while opening encoder|could not open encoder|MFT|h264_mf|aac_mf|encoder.*not found/i.test(stderr)) return 'encode';
  if (/invalid data found|decoder.*not found|could not find codec|error while decoding|moov atom not found|unknown format/i.test(stderr)) return 'decode';
  return 'failed';
}

export type Probe = {
  duration: number | null;
  size: number | null;
  bitRate: number | null;
  container: string;
  video: { codec: string; profile: string | null; width: number; height: number; pixFmt: string; fps: number | null; bitDepth: number } | null;
  audio: { codec: string; rate: number; channels: number } | null;
};

const num = (v: unknown) => (v === undefined || v === null || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const rate = (r: unknown) => {
  const m = /^(\d+)\/(\d+)$/.exec(String(r ?? ''));
  return m && Number(m[1]) && Number(m[2]) ? Math.round((Number(m[1]) / Number(m[2])) * 1000) / 1000 : null;
};
const depthOf = (pix: string) => (/p12|12le|12be/.test(pix) ? 12 : /p10|10le|10be/.test(pix) ? 10 : 8);

/** What ffprobe said, only the fields the studio needs (no file name, no tags). */
export function summarize(json: unknown): Probe | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as { format?: Record<string, unknown>; streams?: Record<string, unknown>[] };
  if (!j.format || typeof j.format !== 'object') return null;
  const streams = Array.isArray(j.streams) ? j.streams : [];
  const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition as Record<string, number> | undefined)?.attached_pic);
  const a = streams.find((s) => s.codec_type === 'audio');
  const pix = String(v?.pix_fmt ?? '');
  return {
    duration: num(j.format.duration),
    size: num(j.format.size),
    bitRate: num(j.format.bit_rate),
    container: String(j.format.format_name ?? '').slice(0, 60),
    video: v ? { codec: String(v.codec_name).slice(0, 30), profile: v.profile ? String(v.profile).slice(0, 40) : null, width: Number(v.width) || 0, height: Number(v.height) || 0, pixFmt: pix.slice(0, 30), fps: rate(v.avg_frame_rate) ?? rate(v.r_frame_rate), bitDepth: depthOf(pix) } : null,
    audio: a ? { codec: String(a.codec_name).slice(0, 30), rate: Number(a.sample_rate) || 0, channels: Number(a.channels) || 0 } : null,
  };
}

/** A source heavy enough for a light copy to be offered first: above 1080p, above 50 Mbit/s, or an intermediate codec. */
export function heavy(p: Probe | null): boolean {
  if (!p?.video) return false;
  return p.video.height > 1080 || (p.bitRate ?? 0) > 50e6 || ['prores', 'dnxhd', 'cfhd'].includes(p.video.codec);
}

const INTERMEDIATE = ['prores', 'dnxhd', 'cfhd'];
/** Room the preview needs on a machine: this many tracks of a source at once (D10's gate plays three 4K tracks). */
export const TRACKS = 3;

/**
 * Whether a source needs a light copy on this machine (D12, Desktop_Power_Ideas.md P-08). With the device profile's
 * 4K H.264 decoding rate, an 8-bit H.264 source needs one when three of it at once would decode slower than that, so
 * a strong machine makes fewer copies and a weak one more; an intermediate codec always does; anything the profile
 * did not measure, and every source without a profile, follows heavy(), today's rule. A copy feeds the preview only.
 */
export function heavyOn(p: Probe | null, decode4k: number | null): boolean {
  if (!p?.video) return false;
  if (!decode4k || !(decode4k > 0)) return heavy(p);
  if (INTERMEDIATE.includes(p.video.codec)) return true;
  if (p.video.codec !== 'h264' || p.video.bitDepth > 8) return heavy(p);
  const pixelsPerSecond = p.video.width * p.video.height * (p.video.fps ?? 30);
  return pixelsPerSecond * TRACKS > 3840 * 2160 * decode4k;
}

// a still picture read as a one-frame video, never something to copy
const STILLS = /^(image2|\w+_pipe|gif|apng)$/;
/** A probe of a moving picture: a video stream that lasts, in a container other than a still picture's. */
export function isMovie(p: Probe | null): boolean {
  return !!p?.video && (p.duration ?? 0) > 0 && !p.container.split(',').some((c) => STILLS.test(c.trim()));
}

/** About how many bytes a copy will take, with room to spare, so a job never starts on a disk that cannot hold it. */
export function estimateBytes(kind: 'proxy' | 'convert', height: number, p: Probe): number {
  const seconds = p.duration ?? 0;
  const out = kind === 'proxy' ? height : (p.video?.height ?? height);
  return Math.ceil(((seconds * (videoRate(kind, out) + 160e3)) / 8) * 1.25) + 64e6;
}
