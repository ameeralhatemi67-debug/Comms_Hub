// «معلومات الجهاز» (Desktop_App_Plan.md 2 and 6, phase D2): what this computer offers the studio. In the
// desktop application the facts come from the application (`info`); in a browser, from what the browser
// tells (cores, a rounded memory figure, the graphics chip through WebGL). The hardware video encoder is
// measured the same way in both. Where a laptop has two graphics chips, the guide says how to give the
// application the stronger one. Pure: the panel gathers the facts.
import { formatBytes } from '../studio/support.ts';

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
