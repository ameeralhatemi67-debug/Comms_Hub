// «ملف قدرات الجهاز» (Desktop_Power_Ideas.md P-33, phase D9): what this laptop measured itself able to do for the
// studio, as numbers per operation, kept in the profile as profile.json. The page measures
// (src/lib/studio/bench.ts) and sends the numbers only, in the fixed shape below; the main process attaches what
// they are true for (this application's version, Chromium's, the chip in use and its driver, the switch in
// effect, mains or battery), so a page can neither name nor fake that. It is never project data and never
// leaves the laptop; «مسح بيانات هذا الجهاز» removes it. Pure apart from ProfileStore, which reads and writes the
// file (tested with real files).
import fs from 'node:fs';
import type { GpuSwitch, Power } from './gpu.ts';

/** Frames a second on the graphics chip's coder and on the processor; null where that one is not offered. */
export type Rate = { hw: number | null; sw: number | null };

export type ProfileNumbers = {
  v: 1;
  /** H.264 encoded from a canvas the way the export makes frames, 1080p and 4K. */
  encode: { h264_1080: Rate; h264_2160: Rate };
  /** 4K H.264 decoded. */
  decode: { h264_2160: Rate };
  /** Frames a second of one, two, three (and four) export lanes at once, added up: each draws and encodes at 1080p. */
  lanes: number[];
  /** Milliseconds to draw one 1080p frame of the three reference documents, the chip's work included. */
  compose: { plain: number; text: number; effects: number };
  /** The reference export: the effects document drawn and encoded at 1080p as export.ts does, frames a second. */
  exportFps: number;
  /** What the coders offer at all (not speeds). */
  support: { hevcEncode: boolean; av1Encode: boolean; tenBitEncode: boolean; hevcDecode: boolean; av1Decode: boolean };
  /** How many times each figure was timed, and the largest spread of the figures decisions read (coefficient of variation, percent; bench.ts DECIDING). */
  runs: number;
  spread: number;
  seconds: number;
  /** The graphics renderer as the page saw it, for the record. */
  renderer: string;
};

export type ChipKey = { vendorId: number; deviceId: number; vendor: string; name: string; driver: string };
export type ProfileKey = { app: string; chrome: string; chip: ChipKey; switch: GpuSwitch; power: Power };
export type ProfileEntry = { at: number; key: ProfileKey; numbers: ProfileNumbers };

/** At most this many measurements are kept, the newest. */
export const MAX_ENTRIES = 12;
const MAX_RATE = 100_000;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, max = MAX_RATE): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v * 100) / 100 : undefined);
const rateOf = (v: unknown): Rate | undefined => {
  if (!isObj(v)) return undefined;
  const pick = (x: unknown) => (x === null ? null : num(x));
  const hw = pick(v.hw);
  const sw = pick(v.sw);
  return hw === undefined || sw === undefined ? undefined : { hw, sw };
};
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : undefined);

/** The numbers a page sent, in their fixed shape, or null: nothing outside the shape is kept. */
export function profileOf(raw: unknown): ProfileNumbers | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const { encode, decode, lanes, compose, support } = raw;
  if (!isObj(encode) || !isObj(decode) || !Array.isArray(lanes) || !isObj(compose) || !isObj(support)) return null;
  const e1080 = rateOf(encode.h264_1080);
  const e2160 = rateOf(encode.h264_2160);
  const d2160 = rateOf(decode.h264_2160);
  if (!e1080 || !e2160 || !d2160) return null;
  if (lanes.length < 1 || lanes.length > 4) return null;
  const laneRates = lanes.map((l) => num(l));
  if (laneRates.some((l) => l === undefined)) return null;
  const c = { plain: num(compose.plain, 10_000), text: num(compose.text, 10_000), effects: num(compose.effects, 10_000) };
  if (c.plain === undefined || c.text === undefined || c.effects === undefined) return null;
  const flags = ['hevcEncode', 'av1Encode', 'tenBitEncode', 'hevcDecode', 'av1Decode'] as const;
  if (flags.some((f) => typeof support[f] !== 'boolean')) return null;
  const exportFps = num(raw.exportFps);
  const runs = raw.runs;
  const spread = num(raw.spread, 1000);
  const seconds = num(raw.seconds, 600);
  const renderer = text(raw.renderer, 160);
  if (exportFps === undefined || spread === undefined || seconds === undefined || renderer === undefined) return null;
  if (typeof runs !== 'number' || !Number.isInteger(runs) || runs < 1 || runs > 5) return null;
  return {
    v: 1,
    encode: { h264_1080: e1080, h264_2160: e2160 },
    decode: { h264_2160: d2160 },
    lanes: laneRates as number[],
    compose: c as ProfileNumbers['compose'],
    exportFps,
    support: Object.fromEntries(flags.map((f) => [f, support[f] === true])) as ProfileNumbers['support'],
    runs,
    spread,
    seconds,
    renderer,
  };
}

const sameKey = (a: ProfileKey, b: ProfileKey) =>
  a.app === b.app && a.chrome === b.chrome && a.switch === b.switch && a.power === b.power && a.chip.vendorId === b.chip.vendorId && a.chip.deviceId === b.chip.deviceId && a.chip.driver === b.chip.driver;

const entryOf = (raw: unknown): ProfileEntry | null => {
  if (!isObj(raw) || typeof raw.at !== 'number' || !isObj(raw.key)) return null;
  const numbers = profileOf(raw.numbers);
  const k = raw.key;
  const chip = isObj(k.chip) ? k.chip : null;
  if (!numbers || !chip || typeof k.app !== 'string' || typeof k.chrome !== 'string') return null;
  if (!['high', 'low', 'none'].includes(k.switch as string) || !['ac', 'battery'].includes(k.power as string)) return null;
  if (typeof chip.vendorId !== 'number' || typeof chip.deviceId !== 'number') return null;
  return {
    at: raw.at,
    key: { app: k.app, chrome: k.chrome, switch: k.switch as GpuSwitch, power: k.power as Power, chip: { vendorId: chip.vendorId, deviceId: chip.deviceId, vendor: text(chip.vendor, 40) ?? '', name: text(chip.name, 100) ?? '', driver: text(chip.driver, 40) ?? '' } },
    numbers,
  };
};

export class ProfileStore {
  private list: ProfileEntry[] = [];
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { entries?: unknown[] };
      this.list = (Array.isArray(raw.entries) ? raw.entries : []).map(entryOf).filter((e): e is ProfileEntry => e !== null).slice(-MAX_ENTRIES);
    } catch {
      // nothing measured yet, or a damaged file: the next measurement starts it again
    }
  }

  private write() {
    try {
      fs.writeFileSync(`${this.file}.tmp`, JSON.stringify({ v: 1, entries: this.list }));
      fs.renameSync(`${this.file}.tmp`, this.file);
    } catch {
      // kept until the application quits
    }
  }

  entries(): ProfileEntry[] {
    return this.list.map((e) => structuredClone(e));
  }

  /** Keeps a measurement; one for the same key replaces the older one. */
  save(key: ProfileKey, numbers: ProfileNumbers, at = Date.now()): ProfileEntry {
    const entry: ProfileEntry = { at, key: structuredClone(key), numbers: structuredClone(numbers) };
    this.list = [...this.list.filter((e) => !sameKey(e.key, key)), entry].slice(-MAX_ENTRIES);
    this.write();
    return structuredClone(entry);
  }

  /** «مسح بيانات هذا الجهاز». */
  clear(): number {
    const n = this.list.length;
    this.list = [];
    try {
      fs.rmSync(this.file, { force: true });
    } catch {
      this.write();
    }
    return n;
  }
}
