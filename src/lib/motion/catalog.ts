import { GRAPHICS, REPINE, FRAMES, drawLogo } from './renderers.js';
import type { Graphic, Params, Category } from './types';

const common = { value: 82, decimals: 0, label: 'نسبة إنجاز الحملة', prefix: '', suffix: '%',
  title: 'أثر يمتد', subtitle: 'مركز الاتصال المؤسسي', reciter: 'رسالة اليوم',
  support: 'تواصل معنا', phone: '', handle: '', web: '', color: '#80c6a3', text: '#ffffff',
  main: '#17634b', accent: '#c9ac70', c1: '#183e33', c2: '#c9ac70', c3: '#f4f6f2', c4: '#ffffff',
  speed: 1, hold: 1.5, tIn: 2.6, tHold: 4, tOut: 1.2, mIn: 60, mOut: 50, mIdle: 60,
  ratio: '9:16', glow: true, showVerse: true, showLogo: true, showContact: false,
  showSocial: false, showWave: true, particles: true, bgIn: false } satisfies Params;
const names = [
  ['العد التصاعدي', 'رقم يتصاعد حتى القيمة النهائية مع نبضة ختامية.'],
  ['العداد الدوار', 'خانات تدور وتتوقف بالتتابع على الرقم المطلوب.'],
  ['حلقة الإنجاز', 'حلقة مضيئة تتقدم مع النسبة.'],
  ['شريط التقدم', 'شريط يتحرك حتى يصل إلى النسبة المحددة.'],
  ['أعمدة النمو', 'أعمدة توضيحية تتصاعد بالتتابع.'],
  ['خط النمو', 'مسار توضيحي يرسم تقدّم النسبة.'],
  ['الشريط الذهبي', 'ميدالية تدور ثم تفتح شريط العنوان.'],
  ['البلاطة المتحولة', 'بلاطة تدور وتتمدد إلى شريط تعريفي.'],
  ['تفتح الزهرة', 'شعار يتفتح ثم يكشف لوحة شفافة.'],
  ['الشرائح الهندسية', 'شرائح تنفتح بالتتابع حول الميدالية.'],
  ['قوس المشربية', 'زخرفة علوية ولوحة سفلية تحيطان بمساحة الفيديو.'],
  ['الورق المائي', 'ورق محبب وحواف مرسومة بألوان مائية.'],
  ['المحراب الذهبي', 'ستائر ذهبية وقوس مضيء يكشفان الفيديو.'],
  ['النجمة الهندسية', 'شبكة نجمية وميداليات حول نافذة الفيديو.'],
  ['القوس الرملي', 'قوس هادئ مع ألوان الرمل والمريمية.'],
  ['فوانيس الليل', 'فوانيس متأرجحة وسماء ليلية حول الفيديو.'],
];

const ease = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);
function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'center', maxWidth?: number) {
  ctx.font = `600 ${size}px "Segoe UI", Tahoma, sans-serif`;
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
  ctx.fillText(value, x, y, maxWidth);
}
function reveal(p: Params, t: number) {
  return ease(t / p.tIn) * (1 - ease((t - p.tIn - p.tHold) / Math.max(.01, p.tOut)));
}
const total = (p: Params) => ({ total: p.tIn + p.tHold + p.tOut });
function newNumber(kind: 'gauge' | 'milestones'): Graphic['draw'] {
  return (ctx, p, t) => {
    const visible = reveal(p, t), progress = ease(t / p.tIn), value = Math.round(p.value * progress);
    ctx.globalAlpha = visible; ctx.lineCap = 'round';
    if (kind === 'gauge') {
      ctx.lineWidth = 25; ctx.strokeStyle = '#ffffff24';
      ctx.beginPath(); ctx.arc(640, 410, 235, Math.PI, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = p.color;
      ctx.beginPath(); ctx.arc(640, 410, 235, Math.PI, Math.PI + Math.PI * progress * p.value / 100); ctx.stroke();
      for (let i = 0; i <= 10; i++) {
        const angle = Math.PI + i / 10 * Math.PI;
        ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(640 + Math.cos(angle) * 263, 410 + Math.sin(angle) * 263);
        ctx.lineTo(640 + Math.cos(angle) * 276, 410 + Math.sin(angle) * 276); ctx.stroke();
      }
      text(ctx, `${p.prefix}${value}${p.suffix}`, 640, 360, 108, p.text);
      text(ctx, p.label, 640, 490, 32, p.text, 'center', 940);
    } else {
      text(ctx, `${p.prefix}${value}${p.suffix}`, 640, 285, 118, p.text);
      text(ctx, p.label, 640, 385, 32, p.text, 'center', 940);
      ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff30'; ctx.beginPath(); ctx.moveTo(250, 480); ctx.lineTo(1030, 480); ctx.stroke();
      ctx.strokeStyle = p.color; ctx.beginPath(); ctx.moveTo(250, 480); ctx.lineTo(250 + 780 * progress, 480); ctx.stroke();
      for (let i = 0; i < 5; i++) {
        const reached = progress >= i / 4;
        ctx.fillStyle = reached ? p.color : '#40574e'; ctx.beginPath(); ctx.arc(250 + i * 195, 480, reached ? 12 : 7, 0, Math.PI * 2); ctx.fill();
        text(ctx, `${Math.round(p.value * i / 4)}`, 250 + i * 195, 532, 23, p.text);
      }
    }
  };
}
function newRibbon(kind: 'editorial' | 'orbit'): Graphic['draw'] {
  return (ctx, p, t) => {
    const v = reveal(p, t); ctx.globalAlpha = v;
    ctx.translate((1 - v) * 70, 0);
    if (kind === 'editorial') {
      ctx.fillStyle = p.main; ctx.fillRect(150, 485, 980 * v, 130);
      ctx.fillStyle = p.accent; ctx.fillRect(1120, 475, 8, 150); ctx.fillRect(150, 615, 978, 3);
      text(ctx, p.title, 1080, 531, 38, '#ffffff', 'right', 830);
      text(ctx, p.subtitle, 1080, 580, 23, '#e0e9e3', 'right', 830);
    } else {
      ctx.fillStyle = p.main; ctx.beginPath(); ctx.roundRect(190, 481, 855 * v, 130, 65); ctx.fill();
      ctx.strokeStyle = p.accent; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(1050, 546, 87, -.5 + t * .08, Math.PI * 1.65 + t * .08); ctx.stroke();
      ctx.fillStyle = p.accent; ctx.beginPath(); ctx.arc(1050, 546, 67, 0, Math.PI * 2); ctx.fill();
      drawLogo(ctx, 'emblem', p.main, 1050, 546, 106);
      text(ctx, p.title, 935, 526, 35, '#ffffff', 'right', 690);
      text(ctx, p.subtitle, 935, 572, 22, '#e0e9e3', 'right', 690);
    }
  };
}
const dimensions = (p: Params) => ({ '9:16': { w: 1080, h: 1920 }, '4:5': { w: 1080, h: 1350 }, '1:1': { w: 1080, h: 1080 }, '16:9': { w: 1920, h: 1080 } }[p.ratio] || { w: 1080, h: 1920 });
function newFrame(kind: 'portal' | 'broadcast'): Graphic['draw'] {
  return (ctx, p, t) => {
    const { w, h } = dimensions(p), k = Math.min(w, h), v = reveal(p, t);
    const isPortal = kind === 'portal';
    const margin = k * (isPortal ? .065 : .045), top = h * (isPortal ? .16 : .23), bottom = h * (isPortal ? .76 : .80);
    const exit = 1 - ease((t - p.tIn - p.tHold) / p.tOut);
    const stage = (start: number, length = .4) => ease((t / p.tIn - start) / length) * exit;
    ctx.globalAlpha = v; ctx.fillStyle = p.c1; ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.roundRect(margin, top, w - margin * 2, bottom - top, isPortal ? k * .12 : 0); ctx.fill();
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = v;
    ctx.strokeStyle = p.c2; ctx.lineWidth = k * .003;
    if (isPortal) {
      for (let i = 0; i < 3; i++) {
        const offset = i * k * .014;
        const perimeter = 2 * (w - 2 * margin + bottom - top + 4 * offset);
        ctx.setLineDash([perimeter * stage(.08 + i * .12, .55), perimeter]);
        ctx.globalAlpha = exit * (1 - i * .25); ctx.beginPath();
        ctx.roundRect(margin - offset, top - offset, w - 2 * margin + offset * 2, bottom - top + 2 * offset, k * .12 + offset); ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = stage(.1);
      text(ctx, p.title, w / 2, h * .075, k * .054, p.c3, 'center', w * .82);
      const footer = stage(.5);
      ctx.globalAlpha = footer;
      text(ctx, p.reciter, w / 2, h * .855 + (1 - footer) * k * .025, k * .06, p.c3, 'center', w * .82);
      ctx.fillStyle = p.c2; ctx.fillRect(w / 2 - k * .035, h * .903, k * .07 * footer, k * .003);
      text(ctx, p.subtitle, w / 2, h * .945, k * .03, p.c3, 'center', w * .82);
    } else {
      const span = k * .09;
      for (const [i, [x, y, dx, dy]] of [[margin, top, 1, 1], [w - margin, top, -1, 1], [margin, bottom, 1, -1], [w - margin, bottom, -1, -1]].entries()) {
        const corner = stage(.12 + i * .12);
        ctx.globalAlpha = corner; ctx.lineWidth = k * .01;
        ctx.beginPath(); ctx.moveTo(x, y + dy * span * corner); ctx.lineTo(x, y); ctx.lineTo(x + dx * span * corner, y); ctx.stroke();
      }
      const header = stage(0, .5), footer = stage(.55);
      ctx.globalAlpha = header; ctx.fillStyle = p.c2;
      ctx.fillRect(w - margin - k * .018, h * .045, k * .018, h * .12 * header);
      text(ctx, p.title, w - margin - k * .05, h * .085, k * .066, p.c3, 'right', w - 2 * margin - k * .1);
      text(ctx, p.subtitle, w - margin - k * .05, h * .156, k * .032, p.c3, 'right', w - 2 * margin - k * .1);
      ctx.globalAlpha = footer; ctx.fillStyle = p.c2;
      ctx.fillRect(margin, h * .854, (w - 2 * margin) * footer, k * .003);
      text(ctx, p.reciter, w - margin, h * .921, k * .052, p.c3, 'right', w - margin * 2);
    }
  };
}
const original = [...GRAPHICS, ...REPINE, ...FRAMES].map((g, i): Graphic => ({
  ...g, name: names[i][0], blurb: names[i][1], category: i < 6 ? 'numbers' : i < 10 ? 'repine' : 'frames',
  defaults: { ...common, ...g.defaults, label: 'أثر الحملة', title: 'أثر يمتد', subtitle: 'مركز الاتصال المؤسسي',
    reciter: 'رسالة اليوم', support: 'تواصل معنا', phone: '', handle: '', web: '', showContact: false, showSocial: false },
}));
function addition(id: string, name: string, blurb: string, category: Category, draw: Graphic['draw'], defaults: Partial<Params> = {}): Graphic {
  return { id, name, blurb, category, isNew: true, raw: true, draw, timing: total,
    ...(category === 'frames' ? { dims: dimensions } : {}), defaults: { ...common, ...defaults } };
}
export const catalog: Graphic[] = [...original,
  addition('arc-gauge', 'مقياس الأثر', 'قوس مدرّج يرسم النسبة ويثبت الرقم في مركزه.', 'numbers', newNumber('gauge')),
  addition('milestone-count', 'محطات الإنجاز', 'عداد يصل بين خمس محطات حتى القيمة النهائية.', 'numbers', newNumber('milestones'), { value: 12500, suffix: '', label: 'مستفيد من الحملة' }),
  addition('rp-editorial', 'الشريط التحريري', 'عنوان واضح ينكشف أفقياً على شريط مع خط جانبي.', 'repine', newRibbon('editorial')),
  addition('rp-orbit', 'مدار الهوية', 'ميدالية يحيط بها مدار مفتوح متحرك مع شريط تعريفي.', 'repine', newRibbon('orbit')),
  addition('fr-portal', 'بوابة الأثر', 'ثلاثة حدود متدرجة حول نافذة واسعة بزوايا منحنية.', 'frames', newFrame('portal')),
  addition('fr-broadcast', 'إطار التغطية', 'زوايا محددة ونافذة مستقيمة لتغطيات المؤسسة.', 'frames', newFrame('broadcast'), { c1: '#edf2ed', c2: '#17634b', c3: '#203e35' }),
];
