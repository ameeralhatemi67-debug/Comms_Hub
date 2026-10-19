// The fonts of the studio's text (MVP_draft.md 62.4): the three the site ships, twelve more Arabic fonts
// and ten English ones, all under the SIL Open Font License, bundled with the site from @fontsource (no
// request to a font service). Each is loaded only when a project uses it or the font list shows it. An
// English font has no Arabic letters: Arabic typed in it is drawn in the site's Arabic font. Pure.

export type FontScript = 'ar' | 'en';
export type FontDef = { family: string; label: string; script: FontScript; weights: readonly number[]; kind: string };

export const FONTS: readonly FontDef[] = [
  // the site's own
  { family: 'IBM Plex Sans Arabic', label: 'بلكس العربي', script: 'ar', weights: [400, 500, 600, 700], kind: 'حديث' },
  { family: 'Reem Kufi', label: 'ريم الكوفي', script: 'ar', weights: [500, 600], kind: 'كوفي' },
  { family: 'Aref Ruqaa', label: 'عارف رقعة', script: 'ar', weights: [700], kind: 'رقعة' },
  // Arabic, added 2026-10-20
  { family: 'Cairo', label: 'كايرو', script: 'ar', weights: [400, 700, 900], kind: 'حديث' },
  { family: 'Tajawal', label: 'تجوّل', script: 'ar', weights: [400, 700, 900], kind: 'حديث' },
  { family: 'Almarai', label: 'المراعي', script: 'ar', weights: [400, 700, 800], kind: 'حديث' },
  { family: 'Readex Pro', label: 'ريدكس برو', script: 'ar', weights: [400, 700], kind: 'حديث' },
  { family: 'Noto Kufi Arabic', label: 'نوتو كوفي', script: 'ar', weights: [400, 700], kind: 'كوفي' },
  { family: 'Changa', label: 'تشانغا', script: 'ar', weights: [400, 700], kind: 'كوفي حديث' },
  { family: 'Amiri', label: 'أميري', script: 'ar', weights: [400, 700], kind: 'نسخ تقليدي' },
  { family: 'Noto Naskh Arabic', label: 'نوتو نسخ', script: 'ar', weights: [400, 700], kind: 'نسخ' },
  { family: 'Markazi Text', label: 'مركزي', script: 'ar', weights: [400, 700], kind: 'نسخ' },
  { family: 'El Messiri', label: 'المسيري', script: 'ar', weights: [400, 700], kind: 'زخرفي' },
  { family: 'Lalezar', label: 'لاله زار', script: 'ar', weights: [400], kind: 'عناوين' },
  { family: 'Rakkas', label: 'رقّاص', script: 'ar', weights: [400], kind: 'عناوين' },
  // English, added 2026-10-20
  { family: 'Inter', label: 'Inter', script: 'en', weights: [400, 700], kind: 'بلا زوائد' },
  { family: 'Montserrat', label: 'Montserrat', script: 'en', weights: [400, 700, 900], kind: 'هندسي' },
  { family: 'Poppins', label: 'Poppins', script: 'en', weights: [400, 600, 800], kind: 'هندسي' },
  { family: 'Raleway', label: 'Raleway', script: 'en', weights: [400, 700], kind: 'أنيق' },
  { family: 'Oswald', label: 'Oswald', script: 'en', weights: [400, 700], kind: 'مضغوط' },
  { family: 'Bebas Neue', label: 'Bebas Neue', script: 'en', weights: [400], kind: 'عناوين' },
  { family: 'Anton', label: 'Anton', script: 'en', weights: [400], kind: 'عناوين' },
  { family: 'Playfair Display', label: 'Playfair Display', script: 'en', weights: [400, 700], kind: 'بزوائد' },
  { family: 'Merriweather', label: 'Merriweather', script: 'en', weights: [400, 700], kind: 'بزوائد' },
  { family: 'Dancing Script', label: 'Dancing Script', script: 'en', weights: [400, 700], kind: 'يدوي' },
];

export type FontFamily = string;

export const fontDef = (family: string): FontDef => FONTS.find((f) => f.family === family) ?? FONTS[0];
export const arabicFonts = () => FONTS.filter((f) => f.script === 'ar');
export const englishFonts = () => FONTS.filter((f) => f.script === 'en');

export const WEIGHT_LABELS: Record<number, string> = { 400: 'عادي', 500: 'متوسط', 600: 'شبه عريض', 700: 'عريض', 800: 'عريض جداً', 900: 'أسود' };

/** The nearest weight a font has to the one asked for. */
export function nearestWeight(family: string, weight: number): number {
  const ws = fontDef(family).weights;
  return ws.reduce((best, w) => (Math.abs(w - weight) < Math.abs(best - weight) ? w : best), ws[0]);
}

/** Text a font is loaded and shown with: Arabic and Latin for an Arabic font, Latin for an English one. */
export const fontSample = (f: FontDef) => (f.script === 'ar' ? 'الاتصال المؤسسي Comms 2026' : 'Corporate Comms 2026');
export const fontPreview = (f: FontDef) => (f.script === 'ar' ? 'مركز الاتصال المؤسسي' : 'Corporate Communications');
