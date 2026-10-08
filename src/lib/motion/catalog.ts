import { GRAPHICS, REPINE, FRAMES } from './renderers.js';
import { EXTRA_NUMBERS, EXTRA_REPINE, EXTRA_FRAMES } from './designs.js';
import type { Graphic, Params, Category, TextField, ColorField, ToggleField, ColorKey, ToggleKey } from './types';

/* One shared set of defaults. Each design overrides what it needs. Contact details start empty and hidden:
   the sample numbers inside the source designs belong to another organization. */
const common = { value: 82, decimals: 0, label: 'أثر الحملة', prefix: '', suffix: '%',
  title: 'أثر يمتد', subtitle: 'مركز الاتصال المؤسسي', kicker: '', reciter: 'رسالة اليوم',
  support: 'تواصل معنا', phone: '', handle: '', web: '', color: '#80c6a3', text: '#ffffff',
  main: '#17634b', accent: '#c9ac70', c1: '#183e33', c2: '#c9ac70', c3: '#f4f6f2', c4: '#ffffff',
  speed: 1, hold: 1.5, tIn: 2.6, tHold: 4, tOut: 1.2, mIn: 60, mOut: 50, mIdle: 60,
  ratio: '9:16', glow: true, showVerse: true, showLogo: true, showContact: false,
  showSocial: false, showWave: true, particles: true, bgIn: false } satisfies Params;

type Meta = { name: string; blurb: string; badge?: 'new' | 'updated'; colors?: string[]; label?: string; reciter?: string };
const meta: Record<string, Meta> = {
  'count-up': { name: 'العد التصاعدي', label: 'مستفيد من الحملة', blurb: 'رقم كبير يتصاعد حتى القيمة النهائية، ثم يخرج نبضة حلقية عند الوصول.' },
  'odometer': { name: 'العداد الدوار', label: 'إجمالي المشاهدات', blurb: 'خانات تدور مثل عداد ميكانيكي وتستقر على الرقم بالتتابع.' },
  'ring': { name: 'حلقة الإنجاز', label: 'نسبة الإنجاز', blurb: 'حلقة مضيئة تمتلئ حتى النسبة المطلوبة مع علامات وقراءة في المنتصف.' },
  'progress-bar': { name: 'شريط التقدم', label: 'اكتمال الحملة', blurb: 'شريط مخطط يمتلئ وتركب فقاعة النسبة على طرفه المتقدم.' },
  'growth-bars': { name: 'أعمدة النمو', label: 'نمو التفاعل', blurb: 'سبعة أعمدة ترتفع بالتتابع ويستقر الأخير على نسبة النمو.' },
  'line-rise': { name: 'خط النمو', label: 'نمو الجمهور', blurb: 'مخطط خطي يرسم نفسه صعوداً ويتبع الرقم الكبير رأس الخط.' },
  'arc-gauge': { name: 'مقياس الأثر', badge: 'updated', label: 'نسبة الإنجاز',
    blurb: 'قرص نصفي مدرّج: العلامات تضيء مع القوس، والمؤشر يتجاوز القيمة قليلاً ثم يستقر، والرقم يهبط في المنتصف بنبضة.' },
  'milestone-count': { name: 'محطات الإنجاز', badge: 'updated', label: 'مستفيد من الحملة',
    blurb: 'رقم كبير يتصاعد فوق مسار بخمس محطات، تضيء كل محطة بحلقة وعلامة صح عند مرور التعبئة بها.' },
  'rp-gold': { name: 'الشريط الذهبي', blurb: 'كرة ذهبية تنبثق وتنقلب إلى ميدالية الشعار، ثم يتفتح شريط العنوان وشريط النص الفرعي.',
    colors: ['لون الشريط الذهبي', 'لون الشعار'] },
  'rp-teal': { name: 'البلاطة المتحولة', blurb: 'نقطة تكبر إلى بلاطة تدور، ثم تنكمش إلى خط وتمتد شريطاً بينما ترتفع لوحة الشعار.',
    colors: ['لون الشريط', 'لون لوحة الشعار'] },
  'rp-glass': { name: 'تفتح الزهرة', blurb: 'شعار يتفتح بتلة بتلة ويخرج خط ضوء تنفتح على امتداده لوحة زجاجية.',
    colors: ['لون اللوحة الزجاجية', 'لون الإبراز الذهبي'] },
  'rp-slats': { name: 'الشرائح الهندسية', blurb: 'ميدالية تنبثق ويمتد خط ذهبي، ثم تنقلب الشرائح العاجية في موجة تبتعد عن النقطة.',
    colors: ['لون الشرائح', 'لون الإبراز الذهبي'] },
  'rp-editorial': { name: 'الشريط التحريري', badge: 'updated', colors: ['لون الشريط', 'لون التزيين الذهبي'],
    blurb: 'شريط مائل بأسلوب نشرات الأخبار: خط ذهبي يمتد وكتلة شعار تنبثق، ثم ينكشف العنوان وشريط النص الفرعي، ويتحول الخط إلى مؤشر تقدم.' },
  'rp-orbit': { name: 'مدار الهوية', badge: 'updated', colors: ['لون الكبسولة', 'لون المدار الذهبي'],
    blurb: 'ميدالية يدور حولها مداران ذهبيان، ثم يتمدد المدار إلى كبسولة تحمل العنوان وشارة ذهبية للنص الفرعي.' },
  'rp-scroll': { name: 'المخطوطة', badge: 'new', colors: ['لون الرق', 'لون الحبر الذهبي'],
    blurb: 'مخطوطة تنفتح من أسطوانتها، يُكتب عليها العنوان بالحبر ويُختم طرفها بختم الشعار.' },
  'rp-crescent': { name: 'الهلال المضيء', badge: 'new', colors: ['لون اللافتة الليلية', 'لون الهلال'],
    blurb: 'هلال يرسم نفسه وتشتعل نجمة في جوفه، وتنفتح منه لافتة ليلية بالعنوان. مناسب لرمضان والأعياد.' },
  'fr-lattice': { name: 'القوس المشربي', blurb: 'زخرفة علوية مشبّكة تهبط من الأعلى ولوحة سفلية ممزقة الحواف ترتفع، والفيديو يملأ ما بينهما.',
    colors: ['الزخرفة', 'اللوحة', 'الذهبي', 'النص'] },
  'fr-watercolor': { name: 'الورق المائي', blurb: 'ورق محبب وإطار مرسوم بالفرشاة مع غرز وأغصان، ومصحف على حامله وبطاقة اسم مرسومة.',
    colors: ['الورق', 'الإطار', 'لون التمييز', 'الحبر'] },
  'fr-mihrab': { name: 'المحراب الذهبي', blurb: 'ستائر ذهبية تنفرج وقوس عاجي يرسم نفسه، فتنفتح نافذة المحراب وتطفو جزيئات ذهبية.',
    colors: ['الخلفية', 'الذهبي', 'العاجي', 'الستائر'] },
  'fr-girih': { name: 'النجمة الهندسية', blurb: 'شبكة نجمية ثمانية تنتشر على الكحلي، وتنفتح النافذة وتدور ميداليات ذهبية في زواياها.',
    colors: ['الكحلي', 'الذهبي', 'العاجي'] },
  'fr-arch': { name: 'القوس الرملي', blurb: 'تصميم هادئ وحديث: قوس ينبثق من الرمل وخط ذهبي يتتبعه وشمس طينية تنزلق خلفه.',
    colors: ['الرمل', 'المريمية', 'الشمس', 'الخط الذهبي'] },
  'fr-night': { name: 'فوانيس الليل', blurb: 'ليل مرصّع بالنجوم، فوانيس تهبط على سلاسلها وتتأرجح، ونافذة قبّة مضيئة فوق أفق المساجد.',
    colors: ['سماء الليل', 'ذهب الفوانيس', 'النص', 'الأفق'] },
  'fr-portal': { name: 'بوابة الأثر', badge: 'updated', colors: ['العمق', 'الذهبي', 'النص', 'التوهج'],
    blurb: 'موجات أثر تنتشر من النافذة، وثلاثة إطارات ذهبية ترسم نفسها حولها، وأشعة ضوء تدور بهدوء خلفها.' },
  'fr-broadcast': { name: 'إطار التغطية', badge: 'updated', reciter: 'فريق الاتصال', colors: ['الورق', 'الأخضر', 'الحبر', 'الذهبي'],
    blurb: 'إطار تغطية نظيف: زوايا ترسم نفسها، وسم مباشر وعدّاد وقت، وشريط عنوان سفلي، وخط تقدم يتبع المقطع.' },
  'fr-doors': { name: 'أبواب المشربية', badge: 'new', colors: ['الخشب', 'الذهبي', 'النص', 'النقش'],
    blurb: 'جدار خشبي منقوش وبابان من المشربية ينفتحان على مهل ليكشفا نافذة الفيديو.' },
  'fr-spectrum': { name: 'طيف التلاوة', badge: 'new', reciter: 'اسم القارئ', colors: ['المسرح', 'الذهبي', 'النص', 'توهج الصوت'],
    blurb: 'مسرح داكن تتوهج نافذته مع الصوت، وطيف متناظر يرتفع تحتها، واسم القارئ في المقدمة.' },
};

const toggleLabels: Record<ToggleKey, string> = { showVerse: 'الآية', showLogo: 'الشعار', showContact: 'معلومات التواصل', showSocial: 'روابط التواصل',
  showWave: 'الموجة الصوتية', particles: 'الجزيئات', bgIn: 'ظهور الخلفية تدريجياً', glow: 'التوهج' };

const numberTexts = (): TextField[] => [
  { key: 'label', label: 'وصف الرقم', max: 38, group: 'main' },
  { key: 'prefix', label: 'قبل الرقم', max: 4, compact: true, placeholder: '+' },
  { key: 'suffix', label: 'بعد الرقم', max: 4, compact: true, placeholder: '%' },
];
const repineTexts = (id: string): TextField[] => [
  { key: 'title', label: 'العنوان', max: 60, group: 'main' },
  { key: 'subtitle', label: 'النص الفرعي', max: 90, group: 'main' },
  ...(id === 'rp-editorial' ? [{ key: 'kicker', label: 'الوسم فوق الشريط', max: 24, group: 'main' } as TextField] : []),
];
const frameTexts = (id: string): TextField[] => [
  ...(id === 'fr-broadcast' ? [
    { key: 'kicker', label: 'وسم البث', max: 20, group: 'main' } as TextField,
    { key: 'title', label: 'العنوان', max: 48, group: 'main' } as TextField,
    { key: 'subtitle', label: 'النص الفرعي', max: 60, group: 'main' } as TextField,
  ] : []),
  { key: 'reciter', label: id === 'fr-broadcast' ? 'الاسم على الشريط' : 'الاسم أو عنوان التغطية', max: 50, group: 'main', hint: 'اتركه فارغاً لإخفائه' },
  { key: 'support', label: 'عبارة التواصل', max: 60, group: 'contact' },
  { key: 'phone', label: 'رقم التواصل', max: 18, ltr: true, group: 'contact', placeholder: '05XXXXXXXX' },
  { key: 'handle', label: 'اسم الحساب', max: 30, ltr: true, group: 'social', placeholder: 'account_name' },
  { key: 'web', label: 'الموقع الإلكتروني', max: 40, ltr: true, group: 'social', placeholder: 'www.example.org' },
];

function build(source: any, category: Category): Graphic {
  const m = meta[source.id];
  const colors: ColorField[] = category === 'numbers'
    ? [{ key: 'color', label: 'لون الحركة' }, { key: 'text', label: 'لون الرقم' }]
    : category === 'repine'
      ? [{ key: 'main', label: m.colors![0] }, { key: 'accent', label: m.colors![1] }]
      : (source.colors as [string, string][]).map(([key], i) => ({ key: key as ColorKey, label: m.colors![i] }));
  const sourceToggles: ToggleKey[] = category === 'frames' ? (source.toggles as ToggleKey[]) : ['glow'];
  const toggles: ToggleField[] = category === 'repine' ? [] : sourceToggles.map(key => ({ key, label: source.id === 'fr-spectrum' && key === 'showWave' ? 'الطيف الصوتي' : toggleLabels[key] }));
  const defaults: Params = { ...common, ...source.defaults };
  if (category === 'numbers') Object.assign(defaults, { label: m.label ?? common.label, decimals: 0 });
  if (category === 'repine') Object.assign(defaults, { title: common.title, subtitle: common.subtitle, kicker: source.defaults.kicker ?? '' });
  if (category === 'frames') Object.assign(defaults, { support: common.support, phone: '', handle: '', web: '', showContact: false, showSocial: false, reciter: m.reciter ?? common.reciter, kicker: source.defaults.kicker ?? '' });
  return {
    id: source.id, name: m.name, blurb: m.blurb, category, badge: m.badge, defaults, raw: source.raw, draw: source.draw, timing: source.timing, dims: source.dims, winBox: source.winBox,
    value: source.value ? { ...source.value, label: 'القيمة' } : undefined,
    texts: category === 'numbers' ? numberTexts() : category === 'repine' ? repineTexts(source.id) : frameTexts(source.id),
    colors, toggles,
  };
}

export const catalog: Graphic[] = [
  ...[...GRAPHICS, ...EXTRA_NUMBERS].map(g => build(g, 'numbers')),
  ...[...REPINE, ...EXTRA_REPINE].map(g => build(g, 'repine')),
  ...[...FRAMES.filter((g: any) => !['fr-portal', 'fr-broadcast'].includes(g.id)), ...EXTRA_FRAMES].map(g => build(g, 'frames')),
];
