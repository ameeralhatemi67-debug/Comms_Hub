// «معلومات الجهاز» (Desktop_App_Plan.md 2 and 6, phase D2): what this computer offers the studio. In the
// desktop application the facts come from the application (`info`); in a browser, from what the browser
// tells (cores, a rounded memory figure, the graphics chip through WebGL). The hardware video encoder is
// measured the same way in both. Where a laptop has two graphics chips, the guide says how to give the
// application the stronger one. Pure: the panel gathers the facts.
import { formatBytes } from '../studio/support.ts';
import type { GpuChoice, ProfileEntry } from './index.ts';
import type { Knobs, Performance } from '../studio/scale.ts';

export type GpuChip = { name: string; vendor: string; active: boolean };

export type DeviceFacts = {
  /** The application's version, or null in a browser. */
  app: string | null;
  /** Which application that version belongs to; the desktop's when not said. */
  appKind?: 'desktop' | 'android';
  cores: number | null;
  cpu: string | null;
  /** Bytes; a browser rounds it and stops at 8 GB. */
  memory: number | null;
  memoryAtLeast: boolean;
  freeDisk: number | null;
  /** The chip drawing the page, as the application or WebGL names it. */
  gpu: string | null;
  chips: GpuChip[];
  software: boolean;
  /** H.264 at 1080p on the graphics chip's encoder: true, false, or null when not measured. */
  hardwareEncoder: boolean | null;
};

export type DeviceLine = { label: string; value: string; ok?: boolean };

export const CHIP_GUIDE =
  'لتشغيل التطبيق على بطاقة الرسوميات الأقوى: افتح «الإعدادات» في Windows، ثم «النظام»، ثم «العرض»، ثم «الرسومات»، واختر «مركز الاتصال المؤسسي»، ثم «أداء عالٍ»، ثم أعد تشغيل التطبيق.';

/** The facts the application returned from `info`, or null when they are not its shape. */
export function factsFromApp(info: unknown): DeviceFacts | null {
  if (!info || typeof info !== 'object') return null;
  const i = info as { version?: unknown; cores?: unknown; cpu?: unknown; memory?: unknown; freeDisk?: unknown; gpu?: { active?: unknown; chips?: unknown; software?: unknown } };
  if (typeof i.version !== 'string') return null;
  const chips = Array.isArray(i.gpu?.chips)
    ? (i.gpu!.chips as unknown[]).filter((c): c is GpuChip => !!c && typeof c === 'object' && typeof (c as GpuChip).name === 'string').map((c) => ({ name: c.name, vendor: String(c.vendor ?? ''), active: c.active === true }))
    : [];
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
  return {
    app: i.version,
    cores: num(i.cores),
    cpu: typeof i.cpu === 'string' && i.cpu ? i.cpu : null,
    memory: num(i.memory),
    memoryAtLeast: false,
    freeDisk: num(i.freeDisk),
    gpu: typeof i.gpu?.active === 'string' ? i.gpu.active : null,
    chips,
    software: i.gpu?.software === true,
    hardwareEncoder: null,
  };
}

/** A browser's WebGL renderer as a chip's name: «ANGLE (NVIDIA, NVIDIA GeForce RTX 3050 Laptop GPU (0x000025A2) Direct3D11 ...)». */
export function chipFromRenderer(renderer: string | null | undefined): string | null {
  if (!renderer) return null;
  const angle = /^ANGLE \(([^,]*),\s*([^,]+?)(?:\s+\(0x[0-9a-f]+\))?(?:\s+Direct3D.*?)?(?:,|\)$)/i.exec(renderer);
  const name = (angle ? angle[2] : renderer).replace(/\s+/g, ' ').trim();
  return name ? name.slice(0, 100) : null;
}

/** The strongest chip is a separate one (NVIDIA, or AMD and Intel cards beside a processor's own). */
export function needsChipGuide(f: DeviceFacts): boolean {
  if (f.chips.length < 2) return false;
  return f.chips.some((c) => !c.active && /nvidia|geforce|rtx|quadro|radeon rx|arc a/i.test(c.name));
}

export function deviceLines(f: DeviceFacts): DeviceLine[] {
  const where = f.appKind === 'android' ? 'تطبيق الهاتف' : 'تطبيق سطح المكتب';
  const lines: DeviceLine[] = [{ label: 'يعمل في', value: f.app ? `${where}، الإصدار ${f.app}` : 'المتصفح' }];
  if (f.cpu || f.cores) lines.push({ label: 'المعالج', value: [f.cpu, f.cores ? `${f.cores} نواة` : null].filter(Boolean).join('، ') });
  if (f.memory) lines.push({ label: 'الذاكرة', value: `${f.memoryAtLeast ? 'نحو ' : ''}${formatBytes(f.memory)}${f.memoryAtLeast ? ' أو أكثر' : ''}` });
  if (f.freeDisk !== null) lines.push({ label: 'المساحة الحرة', value: `${formatBytes(f.freeDisk)} على قرص بيانات التطبيق`, ok: f.freeDisk >= 20e9 });
  if (f.software) lines.push({ label: 'الرسومات', value: 'تُرسم الصفحة بالمعالج دون بطاقة رسوميات، فيبطؤ الاستوديو.', ok: false });
  else if (f.gpu) lines.push({ label: 'بطاقة الرسوميات المستعملة', value: f.gpu });
  const others = f.chips.filter((c) => !c.active).map((c) => c.name);
  if (others.length) lines.push({ label: 'بطاقات أخرى في الجهاز', value: others.join('، ') });
  if (f.hardwareEncoder !== null) {
    lines.push({ label: 'ترميز الفيديو بالعتاد', value: f.hardwareEncoder ? 'متاح: يُرمَّز التصدير ببطاقة الرسوميات' : 'غير متاح: يُرمَّز التصدير بالمعالج، وهو أبطأ', ok: f.hardwareEncoder });
  }
  return lines;
}

// --- D9: the graphics chip's choice, «قياس قدرة الجهاز» and «الأداء» (Desktop_Power_Ideas.md P-01, P-33, P-36) ----

export const GPU_CHOICES: { value: GpuChoice; label: string }[] = [
  { value: 'auto', label: 'تلقائي' },
  { value: 'strong', label: 'الأقوى' },
  { value: 'saving', label: 'الموفّرة للطاقة' },
];
export const GPU_AUTO_HINT = 'تلقائي: بعد قياس البطاقتين يختار التطبيق الأسرع منهما في التصدير عند التوصيل بالكهرباء، ويترك اختيار Windows على البطارية.';
export const GPU_MEASURE_OTHER = 'لقياس البطاقة الأخرى: اخترها، ثم أعد تشغيل التطبيق، ثم «قياس قدرة الجهاز» مرة أخرى.';
export const GPU_RESTART = 'تُطبَّق بعد إعادة تشغيل التطبيق.';
export const GPU_BUSY = 'لا يُعاد تشغيل التطبيق أثناء التصدير. أعد تشغيله بعد انتهائه.';
export const MEASURE_HINT = 'يقيس التطبيق ما يقدر عليه هذا الجهاز في نحو نصف دقيقة. لا يُرسل شيء خارج الجهاز.';
export const PLAN_NOTE = 'هذه القيم خطة المراحل القادمة للاستوديو على هذا الجهاز، ولا تغيّر شيئاً في المعاينة أو التصدير الآن.';

export const PERFORMANCE_CHOICES: { value: Performance; label: string }[] = [
  { value: 'auto', label: 'تلقائي' },
  { value: 'light', label: 'أخف على الجهاز' },
  { value: 'max', label: 'أقصى ما يقدر عليه الجهاز' },
];

/** A rate as the panel writes it: «76.4 إطار/ث». */
export const fps = (n: number | null | undefined) => (typeof n === 'number' && n > 0 ? `${Math.round(n * 10) / 10} إطار/ث` : 'غير متاح');
const ms = (n: number) => `${Math.round(n * 10) / 10} ملّي ثانية`;
const switchName = (s: string) => (s === 'high' ? 'الأقوى' : s === 'low' ? 'الموفّرة للطاقة' : 'اختيار Windows');

/** The one line the panel shows after a measurement. */
export function profileSummary(e: ProfileEntry): string {
  return `سرعة التصدير المرجعية ${fps(e.numbers.exportFps)} (1080p) على ${e.key.chip.name}.`;
}

/** The measurement's figures, for «التفاصيل». */
export function profileLines(e: ProfileEntry): DeviceLine[] {
  const n = e.numbers;
  const missing = [
    !n.support.hevcEncode && 'ترميز HEVC',
    !n.support.tenBitEncode && 'ترميز 10 بت',
    !n.support.av1Encode && 'ترميز AV1',
    !n.support.hevcDecode && 'فك ترميز HEVC',
    !n.support.av1Decode && 'فك ترميز AV1',
  ].filter(Boolean) as string[];
  const lines: DeviceLine[] = [
    { label: 'قيس على', value: `${e.key.chip.name} (${switchName(e.key.switch)})، ${e.key.power === 'ac' ? 'موصول بالكهرباء' : 'على البطارية'}، ${new Date(e.at).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short' })}` },
    { label: 'سرعة التصدير المرجعية', value: `${fps(n.exportFps)} (مستند المؤثرات بمقاس 1080p)` },
    { label: 'ترميز H.264 بمقاس 1080p', value: `${fps(n.encode.h264_1080.hw)} بالبطاقة، ${fps(n.encode.h264_1080.sw)} بالمعالج` },
    { label: 'ترميز H.264 بمقاس 4K', value: `${fps(n.encode.h264_2160.hw)} بالبطاقة، ${fps(n.encode.h264_2160.sw)} بالمعالج` },
    { label: 'فك ترميز H.264 بمقاس 4K', value: `${fps(n.decode.h264_2160.hw)} بالبطاقة، ${fps(n.decode.h264_2160.sw)} بالمعالج` },
    { label: 'مرمّزات تعمل معاً (1080p)', value: n.lanes.map((v, i) => `${i + 1}: ${fps(v)}`).join('، ') },
    { label: 'رسم إطار 1080p', value: `بسيط ${ms(n.compose.plain)}، نصوص ${ms(n.compose.text)}، مؤثرات ${ms(n.compose.effects)}` },
    {
      label: 'ثبات القياس',
      value: `${n.runs} مرات، أكبر تفاوت ${Math.round(n.spread * 10) / 10}٪ في الأرقام التي تُبنى عليها الخطة${n.spread > 10 ? '، فأعد القياس حين لا يعمل على الجهاز شيء ثقيل' : ''}`,
      ok: n.spread <= 10,
    },
  ];
  if (missing.length) lines.push({ label: 'لا يقدر عليه هذا الجهاز', value: missing.join('، ') });
  return lines;
}

/** The plan of scale.ts, for «التفاصيل». */
export function knobLines(k: Knobs): DeviceLine[] {
  const share = (v: number) => (v >= 1 ? 'كاملة' : `1/${Math.round(1 / v)}`);
  return [
    { label: 'دقة المعاينة عند البدء', value: share(k.previewStart) },
    { label: 'ذاكرة الإطارات للتنقل', value: k.frameCacheMB ? formatBytes(k.frameCacheMB * 1e6) : 'لا شيء' },
    { label: 'مسارات التصدير معاً', value: String(k.exportLanes) },
    { label: 'النسخ الخفيفة معاً', value: String(k.copiesAtOnce) },
    { label: 'عمّال تعديل الصور', value: String(k.photoWorkers) },
  ];
}
