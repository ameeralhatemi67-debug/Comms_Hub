// The help system: a first-visit guide per page, a tip the first time someone clicks
// into a part of a page, guide mode (the first click on anything explains it, the second
// lets it act), and the page guide. One engine on the document, reading the registry
// (src/lib/help) and the page's own markup; progress is kept per person by the host.
// After the reference (pass 5, «النموذج المرجعي للمركز»).
import { PAGES, PAGE_HREF, ROLE_GROUP, SHELL_PARTS } from '../help/registry.ts';
import { CARDS, ROLE_GUIDE } from '../help/roles.ts';
import { roles, type Role } from '../domain.ts';
import type { HelpPage, HelpPart, HelpStep, RoleGroup } from '../help/types.ts';
import { holdTip } from './hold.ts';
import { askFor, askableCap, isLocked, needWhy } from './need.ts';
import { esc, layer, layerEl, layerRemove, reducedMotion } from './layer.ts';
import { place, overlap, type Box } from './place.ts';

export type GuideHost = {
  /** The application frame: guide mode and tips work inside it. */
  root: () => HTMLElement | null;
  /** The help page of the current route, or null where none is written yet. */
  page: () => string | null;
  role: () => RoleGroup;
  /** The exact role being viewed: the first-visit guide and the page guide are written for it (Help_Content_Matrix.md). */
  exactRole: () => Role;
  progress: {
    ready: () => boolean;
    seen: (key: string) => boolean;
    mark: (key: string) => void;
    unmarkPage: (page: string) => void;
    auto: () => boolean;
  };
  go: (href: string) => void;
  say: (text: string) => void;
};

export type GuideApi = {
  destroy: () => void;
  /** The route or the page's content changed. */
  refresh: () => void;
  isOn: () => boolean;
  passing: (t: Element) => boolean;
};

type Explain = { el: Element; t: string; b: string; w?: string; g?: string[]; inner?: string };
type Tour = { page: string; steps: HelpStep[]; i: number; /** Shown to someone who saw the guide before: only what was added. */ news?: boolean };

const OPEN_LAYERS = 'dialog[open], [role="menu"], [role="listbox"], .mx-menu, .mx-tray, .cx-info, .cx-pop';
/** The verb for pressing: a finger touches, a pointer clicks. */
const coarse = () => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
const tapWord = () => (coarse() ? 'المس' : 'انقر');
const icon = (d: string) => `<svg class="gd-i" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
const X = icon('M18 6 6 18M6 6l12 12');

export function installGuide(host: GuideHost): GuideApi {
  const G = {
    on: false,
    help: null as string | null,
    tour: null as Tour | null,
    coach: null as { page: string; part: HelpPart; at: number } | null,
    explain: null as Explain | null,
    pass: null as Element | null,
    qTimer: 0 as number | ReturnType<typeof setTimeout>,
    lastPage: undefined as string | null | undefined,
    autoTimer: 0 as number | ReturnType<typeof setTimeout>,
    autoTries: 0,
  };
  const P = { el: null as HTMLElement | null, anchor: null as Element | null, sel: null as string | null, last: null as Box | null, kind: '' };

  const H = (): HelpPage | null => {
    const p = host.page();
    return p ? PAGES[p] ?? null : null;
  };
  const pageName = (p: string | null) => (p && PAGES[p]?.name) || 'هذه الصفحة';
  // The frame, and any open dialog: a dialog may be drawn outside the frame.
  const inRoot = (t: EventTarget | null) => {
    const r = host.root();
    if (!(t instanceof Element)) return false;
    return (!!r && r.contains(t)) || !!t.closest('dialog[open]');
  };

  // ---------- geometry ----------
  const box = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom };
  };
  const openLayers = () =>
    (Array.from(document.querySelectorAll(OPEN_LAYERS)) as Element[])
      .filter((x) => !x.closest('.gdl'))
      .map(box)
      .filter((b) => b.r - b.l > 0 && b.b - b.t > 0);
  function placePop(pop: HTMLElement, target: Box | null, keepIfClear: boolean) {
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    pop.style.maxHeight = `${vh - 20}px`;
    const layers = openLayers();
    if (keepIfClear && pop.style.left) {
      const x0 = parseFloat(pop.style.left);
      const y0 = parseFloat(pop.style.top);
      const R0 = { l: x0, t: y0, r: x0 + pop.offsetWidth, b: y0 + pop.offsetHeight };
      if (layers.every((a) => !overlap(R0, a)) && (!target || !overlap(R0, target)) && x0 >= 0 && y0 >= 0 && R0.r <= vw && R0.b <= vh) return;
    }
    pop.style.width = '';
    const p = place({ w: pop.offsetWidth, h: pop.offsetHeight }, { w: vw, h: vh }, target, layers);
    if (p.width) pop.style.width = `${p.width}px`;
    pop.style.left = `${p.x}px`;
    pop.style.top = `${p.y}px`;
  }
  const visibleEl = (sel: string): Element | null => {
    const r = host.root() ?? document.body;
    let list: NodeListOf<Element>;
    try {
      list = r.querySelectorAll(sel);
    } catch {
      return null;
    }
    for (const el of Array.from(list)) {
      const b = el.getBoundingClientRect();
      if (b.width > 0 && b.height > 0) return el;
    }
    return null;
  };
  const inView = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.top >= 60 && r.bottom <= window.innerHeight - 20;
  };
  function bringIntoView(el: Element, then: () => void) {
    if (inView(el)) return then();
    el.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
    setTimeout(then, reducedMotion() ? 30 : 380);
  }

  // ---------- one window at a time: a tour step, a tip, or an explanation ----------
  function showPop(html: string, anchor: Element | null, kind: string, sel: string | null, focus: boolean) {
    const p = layerEl('gd-pop');
    p.className = `gd-pop${kind === 'coach' ? ' coach' : ''}`;
    p.setAttribute('role', kind === 'tour' ? 'dialog' : 'status');
    p.setAttribute('aria-label', kind === 'tour' ? 'إرشاد الصفحة' : kind === 'coach' ? 'نصيحة' : 'شرح');
    p.innerHTML = html;
    p.style.left = '';
    p.style.top = '';
    Object.assign(P, { el: p, anchor, sel, kind, last: anchor ? box(anchor) : null });
    placePop(p, P.last, false);
    if (focus) ((p.querySelector('.gb.pri') ?? p.querySelector('.gb')) as HTMLElement | null)?.focus({ preventScroll: true });
  }
  function hidePop() {
    layerRemove('gd-pop');
    layerRemove('gd-spot');
    Object.assign(P, { el: null, anchor: null, sel: null, kind: '' });
  }
  function spotOn(el: Element) {
    const s = layerEl('gd-spot');
    const r = el.getBoundingClientRect();
    Object.assign(s.style, { left: `${r.left - 6}px`, top: `${r.top - 6}px`, width: `${r.width + 12}px`, height: `${r.height + 12}px` });
  }
  function hlOn(el: Element, label: string, pin: boolean) {
    const h = layerEl('gd-hl');
    const r = el.getBoundingClientRect();
    h.className = `gd-hl${pin ? ' pin' : ''}`;
    Object.assign(h.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    h.innerHTML = label ? `<b>${esc(label)}</b>` : '';
  }
  const hlOff = () => layerRemove('gd-hl');

  /** After a render, a scroll, or something opening: follow the anchor, and step away from anything new it would cover. */
  function reflow() {
    if (G.on) bar();
    if (!P.el) return;
    layer();
    let a = P.anchor;
    if ((!a || !a.isConnected) && P.sel) {
      a = visibleEl(P.sel);
      P.anchor = a;
    }
    if (a?.isConnected) {
      const r = a.getBoundingClientRect();
      if (r.width || r.height) {
        P.last = box(a);
        if (P.kind === 'tour') spotOn(a);
      }
    }
    placePop(P.el, P.last, true);
    if (G.on && G.explain?.el.isConnected) {
      const er = G.explain.el.getBoundingClientRect();
      const top = document.elementFromPoint(er.left + er.width / 2, er.top + er.height / 2);
      if (top && (G.explain.el === top || G.explain.el.contains(top) || top.closest('.gdl'))) hlOn(G.explain.el, G.explain.t, true);
      else hlOff();
    }
  }
  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      reflow();
    });
  };

  // ---------- guide mode ----------
  function bar() {
    const b = layerEl('gd-bar');
    b.innerHTML =
      `<span><b>وضع الإرشاد</b> · ${tapWord()} أي عنصر في «${esc(pageName(host.page()))}» لتعرف ما يفعله ولمن، و${tapWord()}ه مرة ثانية لتجربته.</span>` +
      (host.page() && PAGES[host.page()!] ? '<button class="gb" data-gda="doc">دليل الصفحة</button>' : '') +
      '<button class="gb" data-gda="exit">إنهاء وضع الإرشاد</button>';
  }
  const parts = (): HelpPart[] => [...(H()?.parts ?? []), ...SHELL_PARTS];
  const tryable = (el: Element) =>
    /^(BUTTON|A|INPUT|SELECT|TEXTAREA|LABEL|SUMMARY)$/.test(el.tagName) || el.getAttribute('role') === 'button' || el.getAttribute('role') === 'checkbox' || el.getAttribute('role') === 'menuitem';
  function labelOf(el: Element) {
    const b = el.querySelector(':scope > b, :scope > span > b');
    const t = (el.getAttribute('aria-label') || b?.textContent || el.getAttribute('placeholder') || el.textContent || '').replace(/\s+/g, ' ').trim();
    return t.length > 60 ? `${t.slice(0, 58)}…` : t;
  }
  function explainEl(el: Element): Explain | null {
    for (const a of H()?.acts ?? []) {
      try {
        if (el.matches(a.sel)) return { el, t: a.t, b: a.b, w: a.w, g: a.g };
      } catch {}
    }
    if (el.hasAttribute('data-hold') && tryable(el)) {
      return { el, t: labelOf(el) || 'إجراء مهم', b: `${el.getAttribute('data-hold')} يحتاج ضغطاً مطولاً نحو ثانية.` };
    }
    for (const p of parts()) {
      try {
        if (el.matches(p.sel)) return { el, t: p.t, b: p.b, w: p.w, g: p.g };
      } catch {}
    }
    return null;
  }
  function explainAt(t: Element): Explain | null {
    let first: Element | null = null;
    for (let el: Element | null = t; el && el !== host.root()?.parentElement; el = el.parentElement) {
      if (!first && tryable(el)) first = el;
      const x = explainEl(el);
      if (x) {
        if (first && first !== el) {
          x.inner = labelOf(first);
          x.el = first;
        }
        return x;
      }
    }
    if (first) return { el: first, t: labelOf(first) || 'عنصر', b: `عنصر في «${pageName(host.page())}». انقره مرة ثانية لتجربته.` };
    return null;
  }
  function explainHtml(x: Explain) {
    const lockedEl = x.el.closest('[data-need]');
    const locked = isLocked(lockedEl);
    const dis = (x.el as HTMLButtonElement).disabled || locked;
    const links = (x.g ?? []).filter((p) => PAGE_HREF[p]);
    // A locked control gets a fourth kind of answer: why you cannot, and what to do.
    if (locked && lockedEl) {
      const cap = lockedEl.getAttribute('data-need') ?? '';
      return (
        `<div class="gd-k"><span>وضع الإرشاد · «${esc(pageName(host.page()))}»</span><button class="gb q" data-gda="xclose" aria-label="إغلاق الشرح">${X}</button></div>` +
        `<p class="gd-t">${esc(x.t)}</p><p class="gd-w off">لماذا لا تستطيع: ${esc(needWhy(lockedEl))}</p>` +
        (askableCap(cap)
          ? '<p>ما تفعله: اطلب الصلاحية ممن يدير رتبتك. يصله طلبك ويقرر المدة، ويصلك إشعار بالقرار.</p>'
          : '<p>هذه مقفلة بقواعد المركز ولا تُطلب.</p>') +
        `<div class="gd-a">${askableCap(cap) ? `<button class="gb pri" data-gda="need" data-cap="${esc(cap)}">اطلب هذه الصلاحية</button>` : ''}` +
        `${H() ? '<button class="gb" data-gda="doc">في دليل الصفحة</button>' : ''}<span class="sp"></span><button class="gb q" data-gda="exit">إنهاء</button></div>`
      );
    }
    return (
      `<div class="gd-k"><span>وضع الإرشاد · «${esc(pageName(host.page()))}»</span><button class="gb q" data-gda="xclose" aria-label="إغلاق الشرح">${X}</button></div>` +
      `<p class="gd-t">${esc(x.t)}</p>` +
      (x.inner && x.inner !== x.t ? `<small>«${esc(x.inner)}» جزء من هذا القسم.</small>` : '') +
      `<p>${esc(x.b)}</p>` +
      (dis ? `<p class="gd-w off">معطّل الآن: ليس لدورك، أو لا يناسب حالة العنصر الآن.${x.w ? ` لمن: ${esc(x.w)}.` : ''}</p>` : x.w ? `<p class="gd-w">لمن: ${esc(x.w)}</p>` : '') +
      (links.length ? `<div class="gd-l"><span>يرتبط بـ</span>${links.map((p) => `<button data-gda="go" data-p="${p}">${esc(PAGES[p]?.name ?? p)}</button>`).join('')}</div>` : '') +
      `<div class="gd-a">${tryable(x.el) && !dis ? `<button class="gb pri" data-gda="try">${x.el.hasAttribute('data-hold') ? 'كيف أجرّبه' : 'جرّبه'}</button>` : ''}` +
      `${H() ? '<button class="gb" data-gda="doc">في دليل الصفحة</button>' : ''}<span class="sp"></span><button class="gb q" data-gda="exit">إنهاء</button></div>` +
      `<small>${tapWord()} العنصر نفسه مرة ثانية لتجربته، أو أي عنصر آخر لشرحه.${coarse() ? '' : ' Esc يغلق.'}</small>`
    );
  }
  function showExplain(x: Explain) {
    if (!G.on || !x.el.isConnected) return;
    G.explain = x;
    G.pass = x.el;
    hlOn(x.el, x.t, true);
    showPop(explainHtml(x), x.el, 'explain', null, false);
  }
  function closeExplain() {
    G.explain = null;
    G.pass = null;
    hlOff();
    if (P.kind === 'explain') hidePop();
  }
  function setOn(on: boolean) {
    if (on === G.on) return;
    G.on = on;
    endTour(false);
    hideCoach();
    closeExplain();
    host.root()?.classList.toggle('guide-on', on);
    if (!on) {
      layerRemove('gd-bar');
      return;
    }
    bar();
    const q = document.querySelector('.help-q');
    if (q)
      showPop(
        `<div class="gd-k"><span>وضع الإرشاد</span><button class="gb q" data-gda="xclose" aria-label="إغلاق">${X}</button></div>` +
          `<p class="gd-t">${tapWord()} أي عنصر لتعرف ما يفعله</p><p>تظهر نافذة بجانب العنصر تشرحه ولمن هو ومع أي صفحة يرتبط. اللمسة الثانية على العنصر نفسه تجربه، والنافذة تبتعد عن أي نافذة أو قائمة يفتحها.</p>` +
          '<small>«دليل الصفحة» في الشريط يفتح الدليل كاملاً.</small>',
        q,
        'explain',
        null,
        false,
      );
  }
  const passing = (t: Element) => !!G.pass && G.pass.isConnected && (G.pass === t || G.pass.contains(t));

  // ---------- the first-visit guide ----------
  function tourHtml() {
    const T = G.tour!;
    const st = T.steps[T.i];
    const n = T.steps.length;
    const h = PAGES[T.page];
    const me = host.role();
    const mine = roleEntry(T.page);
    const roleLine =
      T.i === 0 && h && !T.news
        ? mine
          ? `<small class="gd-me">بصفتك «${esc(roles[host.exactRole()].name)}»: ${esc(mine.intro)}</small>`
          : `<small class="gd-me">بصفتك «${esc(ROLE_GROUP[me])}»: ${esc(h.roles[me])}</small>`
        : '';
    return (
      `<div class="gd-k"><span>${T.news ? 'جديد في' : 'إرشاد'} «${esc(pageName(T.page))}» · ${T.i + 1} من ${n}</span><span class="gd-dots" aria-hidden="true">${T.steps.map((_, k) => `<i class="${k === T.i ? 'on' : ''}"></i>`).join('')}</span></div>` +
      `<p class="gd-t">${esc(st.t)}</p><p>${esc(st.b)}</p>` +
      roleLine +
      (T.i === 0 && !T.news ? `<small>أول دخول لك إلى هذه الصفحة. نعرض استخدامها الأساسي فقط، وحين ${tapWord()} قسماً لأول مرة تظهر نصيحته.</small>` : '') +
      (T.i === 0 && T.news ? '<small>أضفنا إلى هذه الصفحة ما يلي منذ زيارتك السابقة. الإرشاد الكامل في «دليل الصفحة».</small>' : '') +
      `<div class="gd-a">${T.i > 0 ? '<button class="gb" data-gda="tprev">السابق</button>' : ''}<button class="gb pri" data-gda="tnext">${T.i === n - 1 ? 'ابدأ' : 'التالي'}</button><span class="sp"></span><button class="gb q" data-gda="tskip">تخطَّ الإرشاد</button></div>` +
      (T.i === n - 1 ? '<small>زر المساعدة في الشريط العلوي يشرح أي عنصر. «دليل الصفحة» يفتح الدليل كاملاً من وضع الإرشاد أو بالنقر عليه مرتين.</small>' : '')
    );
  }
  /** What Help_Content_Matrix.md says to this exact role on this page: an introduction and its cards, in order. */
  const roleEntry = (page: string) => ROLE_GUIDE[page]?.[host.exactRole()] ?? null;
  /**
   * The steps this person is shown, in order. A page with a role guide shows the cards written for the
   * exact role; a page without one (and the news of a changed page) shows the common steps, then the
   * role group's own.
   */
  const stepsFor = (h: HelpPage, news: boolean, page: string): HelpStep[] => {
    const mine = news ? null : roleEntry(page);
    if (mine) return mine.cards.map((id) => CARDS[id]).filter(Boolean);
    const me = host.role();
    const all = news ? h.news ?? [] : [...h.onb, ...(h.onbRole?.[me] ?? [])];
    return all.filter((s) => !s.g || s.g.includes(me));
  };
  /** The key under which the page's current version of the guide is seen (page:v2). */
  const newsKey = (page: string, h: HelpPage) => (h.v && h.v > 1 ? `${page}:v${h.v}` : null);
  /**
   * Starts the page's guide. `news`: only the steps added in the page's current version. When some
   * steps are not on screen (an empty page, a part the role does not have), a closing card says so
   * and points at the page guide instead of the tour silently being shorter. False when nothing of
   * it is on screen yet, unless `force` (the page has been given time to draw and still shows none).
   */
  function startTour(page: string, force = false, news = false): boolean {
    const h = PAGES[page];
    if (!h) return false;
    const wanted = stepsFor(h, news, page);
    // A card with no selector (the restricted-state cards) has nothing to wait for.
    const steps = wanted.filter((s) => !s.sel || !!visibleEl(s.sel));
    if (!steps.length && !force) return false;
    if (!steps.length && news) return false;
    closeExplain();
    hideCoach();
    const missing = wanted.length - steps.length;
    if (!news && (missing > 0 || !steps.length)) {
      steps.push({
        sel: '',
        t: steps.length ? 'ما لا يظهر بعد' : `ما تفعله في «${h.name}»`,
        b: `${steps.length ? `بعض أجزاء «${h.name}» تظهر حين يوجد محتوى أو حين تسمح بها صلاحيتك. ` : ''}${h.empty ?? h.purpose} «دليل الصفحة» يشرح كل أجزائها.`,
      });
    }
    G.tour = { page, steps, i: 0, news };
    tourStep();
    return true;
  }
  function tourStep() {
    const T = G.tour;
    if (!T) return;
    const st = T.steps[T.i];
    if (!st.sel) {
      // A card with nothing to point at (the closing card of an empty page).
      layerRemove('gd-spot');
      showPop(tourHtml(), null, 'tour', null, true);
      return;
    }
    const el = visibleEl(st.sel);
    if (!el) {
      if (T.i < T.steps.length - 1) {
        T.i++;
        return tourStep();
      }
      return endTour(true);
    }
    bringIntoView(el, () => {
      if (G.tour !== T) return;
      const el2 = visibleEl(st.sel) ?? el;
      spotOn(el2);
      showPop(tourHtml(), el2, 'tour', st.sel, true);
    });
  }
  function endTour(mark: boolean) {
    const T = G.tour;
    if (!T) return;
    G.tour = null;
    if (mark) {
      host.progress.mark(T.page);
      // Seen now, so its steps are not shown again as news.
      const h = PAGES[T.page];
      const k = h ? newsKey(T.page, h) : null;
      if (k) host.progress.mark(k);
    }
    if (P.kind === 'tour') hidePop();
    layerRemove('gd-spot');
  }

  // ---------- section tips ----------
  function hideCoach() {
    G.coach = null;
    if (P.kind === 'coach') hidePop();
  }
  function coachHtml(page: string, part: HelpPart, show: boolean) {
    return (
      `<div class="gd-k"><span>${show ? 'في هذه الصفحة' : 'نصيحة · أول مرة هنا'} · «${esc(pageName(page))}»</span><button class="gb q" data-gda="cclose" aria-label="إغلاق">${X}</button></div>` +
      `<p class="gd-t">${esc(part.t)}</p><p>${esc(part.b)}</p>` +
      `<div class="gd-a"><button class="gb pri" data-gda="cclose">فهمت</button><button class="gb" data-gda="doc">دليل الصفحة</button>${show ? '' : '<span class="sp"></span><button class="gb q" data-gda="cquiet">لا نصائح في هذه الصفحة</button>'}</div>`
    );
  }
  function showCoach(page: string, part: HelpPart, show: boolean): boolean {
    const el = visibleEl(part.sel);
    if (!el || host.page() !== page) return false;
    if (!show) host.progress.mark(`${page}:${part.k}`);
    G.coach = { page, part, at: Date.now() };
    const go = () => {
      const el2 = visibleEl(part.sel) ?? el;
      if (show) spotOn(el2);
      showPop(coachHtml(page, part, show), el2, 'coach', part.sel, show);
      if (!show) layerRemove('gd-spot');
    };
    if (show) bringIntoView(el, go);
    else go();
    return true;
  }

  // ---------- the page guide ----------
  function viewEl() {
    return document.getElementById('guide-view');
  }
  function helpHtml(page: string, present: Set<string>) {
    const h = PAGES[page];
    const me = host.role();
    const mine = roleEntry(page);
    const toc: [string, string][] = [['hv-purpose', 'الغرض'], ...(mine ? ([['hv-mine', 'ما يخصك']] as [string, string][]) : []), ['hv-roles', 'ماذا يرى كل دور'], ['hv-parts', 'أجزاء الصفحة'], ['hv-rules', 'القواعد'], ['hv-links', 'الارتباط بالصفحات الأخرى'], ['hv-faq', 'أسئلة شائعة']];
    return (
      `<section class="hv-head"><span class="eyebrow">دليل الصفحة</span><h2>«${esc(h.name)}»</h2><p>${esc(h.tip)}</p>` +
      '<div class="hv-acts"><button class="secondary" data-gda="hclose">العودة إلى الصفحة</button><button class="primary" data-gda="replay">إعادة الإرشاد لهذه الصفحة</button><button class="secondary" data-gda="hguide">وضع الإرشاد</button></div></section>' +
      `<div class="hv-grid"><nav class="hv-toc" aria-label="محتوى الدليل"><b>في هذا الدليل</b>${toc.map(([id, t]) => `<button data-gda="toc" data-id="${id}">${t}</button>`).join('')}</nav><div class="hv-body">` +
      `<section class="hv-sec" id="hv-purpose"><h3>الغرض</h3><p>${esc(h.purpose)}</p></section>` +
      (mine
        ? `<section class="hv-sec" id="hv-mine"><h3>ما يخصك بصفتك «${esc(roles[host.exactRole()].name)}»</h3><p>${esc(mine.intro)}</p><div class="hv-parts">${mine.cards
            .map((id) => CARDS[id])
            .filter(Boolean)
            .map((c) => `<div class="hv-part mine"><b>${esc(c.t)}</b><p>${esc(c.b)}</p></div>`)
            .join('')}</div></section>`
        : '') +
      `<section class="hv-sec" id="hv-roles"><h3>ماذا يرى كل دور</h3><div class="hv-roles">${(['lead', 'maker', 'publisher', 'member'] as RoleGroup[])
        .map((k) => `<div class="hv-role${k === me ? ' me' : ''}"><b>${ROLE_GROUP[k]}${k === me ? ' · أنت' : ''}</b><span>${esc(h.roles[k])}</span></div>`)
        .join('')}</div></section>` +
      `<section class="hv-sec" id="hv-parts"><h3>أجزاء الصفحة</h3><p>لكل جزء ما يفعله. «أرني» يعيدك إلى الصفحة ويشير إليه.</p><div class="hv-parts">${h.parts
        .map((p) => {
          const ok = present.has(p.k);
          return `<div class="hv-part${ok ? '' : ' gone'}"><b>${esc(p.t)}</b><p>${esc(p.b)}${ok ? '' : ' <small>(لا يظهر الآن لدورك أو في هذه الحالة.)</small>'}</p><button class="secondary" data-gda="show" data-k="${p.k}"${ok ? '' : ' disabled'}>أرني</button></div>`;
        })
        .join('')}</div></section>` +
      `<section class="hv-sec" id="hv-rules"><h3>القواعد</h3><ul class="hv-list">${h.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ul></section>` +
      `<section class="hv-sec" id="hv-links"><h3>الارتباط بالصفحات الأخرى</h3><div class="hv-links">${h.links
        .map(([p, t]) => `<button class="hv-link" data-gda="go" data-p="${p}"><b>«${esc(PAGES[p]?.name ?? p)}»</b><span>${esc(t)}</span></button>`)
        .join('')}</div></section>` +
      `<section class="hv-sec hv-faq" id="hv-faq"><h3>أسئلة شائعة</h3>${h.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</section>` +
      '<div class="hv-foot"><span>تريد أن ترى الإرشاد الأول من جديد؟ يبدأ من الخطوة الأولى، لهذه الصفحة وحدها.</span><button class="primary" data-gda="replay">إعادة الإرشاد لهذه الصفحة</button></div>' +
      '</div></div>'
    );
  }
  function openHelp() {
    const page = host.page();
    const v = viewEl();
    if (!page || !PAGES[page] || !v) {
      host.say('دليل هذه الصفحة يُكتب مع بنائها. زر المساعدة يشرح عناصرها في وضع الإرشاد.');
      return;
    }
    // Which parts this person has on screen now, before the page is set aside.
    const present = new Set(PAGES[page].parts.filter((p) => !!visibleEl(p.sel)).map((p) => p.k));
    endTour(false);
    hideCoach();
    closeExplain();
    hidePop();
    setOn(false);
    G.help = page;
    v.innerHTML = helpHtml(page, present);
    v.hidden = false;
    v.closest('main')?.classList.add('guide-view-open');
    window.scrollTo({ top: 0 });
    const h = v.querySelector('h2') as HTMLElement | null;
    h?.setAttribute('tabindex', '-1');
    h?.focus({ preventScroll: true });
  }
  function closeHelp() {
    G.help = null;
    const v = viewEl();
    if (v) {
      v.hidden = true;
      v.innerHTML = '';
      v.closest('main')?.classList.remove('guide-view-open');
    }
  }

  // ---------- events ----------
  const onGuideClick = (e: MouseEvent) => {
    if (!G.on) return;
    const t = e.target as Element;
    if (!inRoot(t) || t.closest('.help-q, .gdl, [data-gda]')) return;
    if (passing(t)) {
      setTimeout(schedule, 30);
      return;
    }
    const x = explainAt(t);
    if (!x) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showExplain(x);
  };
  const onMouseDown = (e: MouseEvent) => {
    if (G.on && inRoot(e.target) && (e.target as Element).closest('select') && !passing(e.target as Element)) e.preventDefault();
  };
  const onDragStart = (e: DragEvent) => {
    if (G.on && inRoot(e.target) && !passing(e.target as Element)) e.preventDefault();
  };
  let mraf = 0;
  const onMove = (e: MouseEvent) => {
    if (!G.on || G.explain) return;
    const t = e.target as Element;
    if (!inRoot(t) || t.closest('.help-q')) return hlOff();
    if (mraf) return;
    mraf = requestAnimationFrame(() => {
      mraf = 0;
      const x = explainAt(t);
      if (x) hlOn(x.el, x.t, false);
      else hlOff();
    });
  };
  const onCoachClick = (e: MouseEvent) => {
    const t = e.target as Element;
    if (!inRoot(t)) return;
    if (G.coach && P.kind === 'coach' && !t.closest('.gdl') && Date.now() - G.coach.at > 600) hideCoach();
    if (G.on || G.tour || G.help || !host.progress.ready() || !host.progress.auto()) return;
    const page = host.page();
    const h = H();
    if (!page || !h || !host.progress.seen(page)) return;
    const hit = h.parts.find((p) => {
      if (!p.first || host.progress.seen(`${page}:${p.k}`)) return false;
      try {
        return !!t.closest(p.sel);
      } catch {
        return false;
      }
    });
    if (hit) setTimeout(() => !G.on && !G.tour && !G.help && showCoach(page, hit, false), 280);
  };
  const onGda = (e: MouseEvent) => {
    const b = (e.target as Element).closest?.('[data-gda]') as HTMLElement | null;
    if (!b) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const a = b.dataset.gda;
    const T = G.tour;
    if (a === 'tnext' && T) {
      if (T.i >= T.steps.length - 1) return endTour(true);
      T.i++;
      return tourStep();
    }
    if (a === 'tprev' && T && T.i) {
      T.i--;
      return tourStep();
    }
    if (a === 'tskip') return endTour(true);
    if (a === 'cclose') return (hideCoach(), hidePop());
    if (a === 'cquiet') {
      const page = host.page();
      if (page) PAGES[page]?.parts.forEach((p) => host.progress.mark(`${page}:${p.k}`));
      return (hideCoach(), hidePop());
    }
    if (a === 'xclose') return (closeExplain(), hidePop());
    if (a === 'exit') return (setOn(false), hidePop());
    if (a === 'try') {
      const x = G.explain;
      if (!x?.el.isConnected) return;
      if (x.el.hasAttribute('data-hold')) return holdTip(x.el);
      G.pass = x.el;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(x.el.tagName)) (x.el as HTMLElement).focus();
      else (x.el as HTMLElement).click();
      setTimeout(schedule, 40);
      return;
    }
    if (a === 'need') {
      setOn(false);
      hidePop();
      return askFor(b.dataset.cap ?? '');
    }
    if (a === 'doc') return openHelp();
    if (a === 'go') {
      const href = PAGE_HREF[b.dataset.p ?? ''];
      closeHelp();
      setOn(false);
      hidePop();
      if (href) host.go(href);
      return;
    }
    if (a === 'hclose') return closeHelp();
    if (a === 'hguide') return (closeHelp(), setOn(true));
    if (a === 'replay') {
      const page = G.help ?? host.page();
      closeHelp();
      if (!page) return;
      host.progress.unmarkPage(page);
      setTimeout(() => startTour(page), 60);
      return;
    }
    if (a === 'toc') return document.getElementById(b.dataset.id ?? '')?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });
    if (a === 'show') {
      const page = G.help ?? host.page();
      const part = page ? PAGES[page]?.parts.find((p) => p.k === b.dataset.k) : undefined;
      closeHelp();
      setTimeout(() => {
        if (!page || !part || !showCoach(page, part, true)) host.say('هذا الجزء لا يظهر الآن لدورك أو في هذه الحالة.');
      }, 60);
    }
  };
  // The help button: hover says what the page is for; one click is guide mode; a double click the page guide.
  const onHelpClick = (e: MouseEvent) => {
    const q = (e.target as Element).closest?.('.help-q');
    if (!q) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    layerRemove('gd-tip');
    if (G.qTimer) {
      clearTimeout(G.qTimer);
      G.qTimer = 0;
      return;
    }
    G.qTimer = setTimeout(() => {
      G.qTimer = 0;
      if (G.help) return closeHelp();
      setOn(!G.on);
    }, 280);
  };
  const onHelpDbl = (e: MouseEvent) => {
    if (!(e.target as Element).closest?.('.help-q')) return;
    e.preventDefault();
    if (G.qTimer) {
      clearTimeout(G.qTimer);
      G.qTimer = 0;
    }
    if (G.help) closeHelp();
    else openHelp();
  };
  function helpTip(q: Element) {
    if (G.on) return;
    const tip = layerEl('gd-tip');
    const h = H();
    tip.innerHTML = h
      ? `<b>«${esc(h.name)}»</b>${esc(h.tip)}<small>انقر: وضع الإرشاد · انقر مرتين: دليل الصفحة</small>`
      : '<b>المساعدة</b>انقر لوضع الإرشاد: يشرح أي عنصر تنقره.<small>دليل هذه الصفحة يُكتب مع بنائها.</small>';
    const r = q.getBoundingClientRect();
    tip.style.left = '0px';
    tip.style.top = '0px';
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, document.documentElement.clientWidth - tw - 8))}px`;
    tip.style.top = `${r.bottom + 10}px`;
  }
  const onOver = (e: MouseEvent) => {
    const q = (e.target as Element).closest?.('.help-q');
    if (q) helpTip(q);
  };
  const onOut = (e: MouseEvent) => {
    const q = (e.target as Element).closest?.('.help-q');
    if (q && !(e.relatedTarget instanceof Node && q.contains(e.relatedTarget))) layerRemove('gd-tip');
  };
  const onFocusIn = (e: FocusEvent) => {
    if ((e.target as Element).classList?.contains('help-q')) helpTip(e.target as Element);
  };
  const onFocusOut = (e: FocusEvent) => {
    if ((e.target as Element).classList?.contains('help-q')) layerRemove('gd-tip');
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    const dialogOpen = !!document.querySelector('dialog[open], [role="menu"]');
    if (G.tour) return (e.stopImmediatePropagation(), endTour(true));
    if (P.kind === 'coach') return (e.stopImmediatePropagation(), hideCoach(), hidePop());
    if (G.on && G.explain && !dialogOpen) return (e.stopImmediatePropagation(), closeExplain(), hidePop());
    if (G.on && !dialogOpen) return (e.stopImmediatePropagation(), setOn(false), hidePop());
    if (G.help && !dialogOpen) return (e.stopImmediatePropagation(), closeHelp());
  };

  // After a route change: what belonged to the old page ends; then the first-visit guide,
  // once its page has drawn, if this person has not seen it.
  function maybeAuto() {
    clearTimeout(G.autoTimer);
    G.autoTimer = setTimeout(() => {
      const page = host.page();
      if (!page || !PAGES[page] || G.on || G.help || G.tour || !host.progress.ready() || !host.progress.auto()) return;
      if (document.querySelector('dialog[open]')) return;
      const h = PAGES[page];
      const k = newsKey(page, h);
      // Seen before: only what was added since, once.
      if (host.progress.seen(page)) {
        if (k && !host.progress.seen(k)) {
          if (!startTour(page, false, true)) {
            if (G.autoTries++ < 8) maybeAuto();
            else host.progress.mark(k);
          }
        }
        return;
      }
      if (!startTour(page) && G.autoTries++ < 8) maybeAuto();
      else if (G.autoTries >= 8 && !G.tour) startTour(page, true);
    }, G.autoTries ? 600 : 500);
  }
  function refresh() {
    const page = host.page();
    if (G.lastPage !== page) {
      if (G.tour && G.tour.page !== page) endTour(true);
      hideCoach();
      if (G.on) closeExplain();
      if (G.help) closeHelp();
      G.lastPage = page;
      G.autoTries = 0;
    }
    maybeAuto();
    schedule();
  }

  const listeners: [string, EventListener, boolean | AddEventListenerOptions][] = [
    ['click', onHelpClick as EventListener, true],
    ['click', onGda as EventListener, true],
    ['click', onGuideClick as EventListener, true],
    ['click', onCoachClick as EventListener, true],
    ['dblclick', onHelpDbl as EventListener, true],
    ['mousedown', onMouseDown as EventListener, true],
    ['dragstart', onDragStart as EventListener, true],
    ['mousemove', onMove as EventListener, { passive: true }],
    ['mouseover', onOver as EventListener, false],
    ['mouseout', onOut as EventListener, false],
    ['focusin', onFocusIn as EventListener, false],
    ['focusout', onFocusOut as EventListener, false],
    ['keydown', onKey as EventListener, true],
  ];
  listeners.forEach(([t, f, o]) => document.addEventListener(t, f, o));
  window.addEventListener('scroll', schedule, true);
  window.addEventListener('resize', schedule);
  const mo = new MutationObserver(schedule);
  const r = host.root();
  if (r) mo.observe(r, { childList: true, subtree: true });
  mo.observe(document.body, { childList: true });

  return {
    destroy() {
      listeners.forEach(([t, f, o]) => document.removeEventListener(t, f, o));
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      mo.disconnect();
      clearTimeout(G.autoTimer);
      hidePop();
      hlOff();
      layerRemove('gd-bar');
      layerRemove('gd-tip');
    },
    refresh,
    isOn: () => G.on,
    passing,
  };
}
