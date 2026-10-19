// What this browser can do for the studio (MVP_draft.md 62), measured rather than guessed from the
// screen: encoding MP4 (H.264) or WebM (VP9), encoding AAC natively or through the AAC extension,
// and the browser's private storage (OPFS) used for the device cache and for exports. The studio's
// tools and messages follow these answers (Studio_Build_Plan.md section 4). Browser only.

export type AacPath = 'native' | 'extension' | 'none';

export type StudioSupport = {
  /** WebCodecs is present at all (VideoEncoder, AudioEncoder). */
  webcodecs: boolean;
  /** H.264 can be encoded at 1080p: MP4 export. */
  mp4: boolean;
  /** VP9 can be encoded at 1080p: the WebM fallback. */
  webm: boolean;
  /** How AAC sound is made: the browser's own encoder, the extension (WebAssembly), or not at all. */
  aac: AacPath;
  /** The browser's private storage can be opened. */
  opfs: boolean;
  /** The browser promised not to clear the studio's storage on its own (null: not asked or unknown). */
  persisted: boolean | null;
  /** Bytes the browser lets this site keep, and bytes already used (null when it does not say). */
  quota: number | null;
  usage: number | null;
};

const FULL_HD = { width: 1920, height: 1080 };

export async function probeSupport(): Promise<StudioSupport> {
  const webcodecs = typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined';
  let mp4 = false;
  let webm = false;
  let aac: AacPath = 'none';
  if (webcodecs) {
    const mb = await import('mediabunny');
    [mp4, webm] = await Promise.all([mb.canEncodeVideo('avc', FULL_HD), mb.canEncodeVideo('vp9', FULL_HD)]);
    if (await mb.canEncodeAudio('aac')) aac = 'native';
    else if (typeof WebAssembly !== 'undefined') aac = 'extension';
  }
  let opfs = false;
  try {
    opfs = typeof navigator.storage?.getDirectory === 'function' && !!(await navigator.storage.getDirectory());
  } catch {
    opfs = false;
  }
  let persisted: boolean | null = null;
  let quota: number | null = null;
  let usage: number | null = null;
  try {
    if (navigator.storage?.persisted) persisted = await navigator.storage.persisted();
    const est = await navigator.storage?.estimate?.();
    quota = est?.quota ?? null;
    usage = est?.usage ?? null;
  } catch {
    // Some private windows refuse the question itself; the answers stay unknown.
  }
  return { webcodecs, mp4, webm, aac, opfs, persisted, quota, usage };
}

/** Registers the AAC extension when the browser cannot encode AAC itself. Safe to call more than once. */
let aacRegistered = false;
export async function ensureAac(path: AacPath): Promise<boolean> {
  if (path === 'native') return true;
  if (path === 'none') return false;
  if (!aacRegistered) {
    const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
    registerAacEncoder();
    aacRegistered = true;
  }
  return true;
}

/** Bytes as the interface writes them: 1.2 ج.ب، 340 م.ب. */
export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} ج.ب`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} م.ب`;
  if (n >= 1e3) return `${Math.round(n / 1e3)} ك.ب`;
  return `${n} بايت`;
}

/** One line per ability, in Arabic, for the studio home: what works here and what does not. */
export function supportLines(s: StudioSupport): { ok: boolean; text: string }[] {
  return [
    {
      ok: s.mp4,
      text: s.mp4 ? 'تصدير الفيديو بصيغة MP4 متاح في هذا المتصفح.' : s.webm ? 'هذا المتصفح لا يصنع MP4، فيُصدَّر الفيديو بصيغة WebM.' : 'هذا المتصفح لا يصدّر الفيديو. استعمل Chrome أو Edge على حاسوب.',
    },
    {
      ok: s.aac !== 'none',
      text: s.aac === 'native' ? 'الصوت يُرمَّز بمرمّز المتصفح.' : s.aac === 'extension' ? 'الصوت يُرمَّز بمرمّز إضافي يُحمَّل عند أول تصدير.' : 'هذا المتصفح لا يرمّز الصوت، فيُصدَّر الفيديو بلا صوت.',
    },
    {
      ok: s.opfs,
      text: s.opfs
        ? `التخزين المؤقت على هذا الجهاز متاح${s.quota ? ` (المسموح ${formatBytes(s.quota)}، المستعمل ${formatBytes(s.usage ?? 0)})` : ''}.`
        : 'التخزين المؤقت غير متاح هنا (نافذة خاصة أو متصفح لا يدعمه): تُقرأ الملفات من الخادم في كل مرة، ويُبنى التصدير في الذاكرة حتى 1.6 ج.ب.',
    },
  ];
}
