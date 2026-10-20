// Hold to confirm. A button whose data-hold attribute holds a reason acts only after a
// press of about a second, filling as it is pressed; a quick click explains why instead.
// Enter or Space held does the same from the keyboard. Listeners sit on the document in
// the capture phase, before the page's own handlers, so any button can opt in with one
// attribute. After the reference (pass 5, «النموذج المرجعي للمركز»).
import { HOLD_MS } from './hold-reasons.ts';
import { esc, layerEl, layerRemove } from './layer.ts';

export type HoldHooks = {
  /** Guide mode is on: the first click explains instead of acting. */
  guideOn: () => boolean;
  /** Guide mode lets this element act (its second click, or «جرّبه»). */
  passing: (t: Element) => boolean;
};

const S = { el: null as HTMLElement | null, t: 0 as number | ReturnType<typeof setTimeout>, kb: false, pass: null as HTMLElement | null, held: false, swallowUntil: 0 };
let tipTimer: ReturnType<typeof setTimeout> | undefined;

const holdOf = (t: EventTarget | null) => ((t as Element | null)?.closest?.('[data-hold]') ?? null) as HTMLButtonElement | null;

export function holdTip(el: Element, text?: string) {
  const tip = layerEl('gd-tip');
  tip.setAttribute('role', 'status');
  tip.innerHTML =
    `<b>اضغط مطولاً للتأكيد</b>${esc(text ?? el.getAttribute('data-hold') ?? '')}` +
    '<small>أبقِ الضغط نحو ثانية حتى يمتلئ الزر. وبلوحة المفاتيح: أبقِ Enter أو المسافة مضغوطاً.</small>';
  const r = el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  tip.style.left = '0px';
  tip.style.top = '0px';
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const x = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, vw - tw - 8));
  let y = r.top - th - 10;
  if (y < 8) y = r.bottom + 10;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => layerRemove('gd-tip'), 3200);
}

function cancel() {
  if (S.t) clearTimeout(S.t);
  S.t = 0;
  S.el?.classList.remove('holding');
  S.el = null;
}

function start(el: HTMLElement, kb: boolean, swallow = true) {
  cancel();
  S.el = el;
  S.kb = kb;
  el.style.setProperty('--hold-ms', `${HOLD_MS}ms`);
  el.classList.add('holding');
  layerRemove('gd-tip');
  S.t = setTimeout(() => {
    S.t = 0;
    el.classList.remove('holding');
    S.el = null;
    S.pass = el;
    S.swallowUntil = 0;
    el.click();
    S.pass = null;
    // a pointer, Enter or Space released after a hold sends one more click, which is swallowed; a letter key does not
    S.held = swallow;
    S.swallowUntil = swallow ? Date.now() + 60000 : 0;
  }, HOLD_MS);
}

/** The reason a button gives for its long press: its own, or the one its key hold carries. */
const reasonOf = (el: Element) => el.getAttribute('data-hold') ?? el.getAttribute('data-keyhold') ?? '';

/**
 * A shortcut key standing for a button (the review screen's A and Shift+A, MVP_draft.md 62.13): held down, it
 * fills the button as a long press does and presses it after the same time; let go early, it explains
 * instead. Nothing happens where the button is off. Returns whether a hold began.
 */
export function keyHoldStart(el: HTMLButtonElement | null): boolean {
  if (!el || el.disabled || S.t) return false;
  start(el, true, false);
  return true;
}

/** The key of a key hold was let go: early, the reason is said; after the hold, nothing more. */
export function keyHoldEnd(): void {
  if (S.t && S.kb) {
    const b = S.el;
    cancel();
    if (b) holdTip(b, reasonOf(b));
  }
}

/** The press that completed a hold ends here: only the click that follows this release is swallowed. */
function released() {
  if (S.held) {
    S.held = false;
    S.swallowUntil = Date.now() + 150;
  }
}

export function installHold(hooks: HoldHooks): () => void {
  const blocked = (t: Element) => hooks.guideOn() && !hooks.passing(t);
  const onDown = (e: PointerEvent) => {
    const b = holdOf(e.target);
    if (!b || b.disabled || e.button !== 0 || blocked(e.target as Element)) return;
    start(b, false);
  };
  const onUp = () => {
    if (S.t && !S.kb) {
      const b = S.el;
      cancel();
      if (b) holdTip(b);
      return;
    }
    released();
  };
  const onCancel = () => {
    if (!S.kb) cancel();
  };
  const onMenu = (e: Event) => {
    if (holdOf(e.target)) e.preventDefault();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const b = holdOf(e.target);
    if (!b || b.disabled || blocked(e.target as Element)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat && !S.t) start(b, true);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (S.t && S.kb) {
      const b = S.el;
      cancel();
      if (b) holdTip(b);
      return;
    }
    released();
  };
  // A quick click on a hold button explains instead of acting; the click a completed hold sends goes through.
  const onClick = (e: MouseEvent) => {
    if (S.swallowUntil > Date.now() && e.isTrusted) {
      S.swallowUntil = 0;
      S.held = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    const b = holdOf(e.target);
    if (!b || S.pass === b || blocked(e.target as Element)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!b.disabled) holdTip(b);
  };
  const opts = true;
  document.addEventListener('pointerdown', onDown, opts);
  document.addEventListener('pointerup', onUp, opts);
  document.addEventListener('pointercancel', onCancel, opts);
  document.addEventListener('contextmenu', onMenu, opts);
  document.addEventListener('keydown', onKeyDown, opts);
  document.addEventListener('keyup', onKeyUp, opts);
  document.addEventListener('click', onClick, opts);
  return () => {
    cancel();
    document.removeEventListener('pointerdown', onDown, opts);
    document.removeEventListener('pointerup', onUp, opts);
    document.removeEventListener('pointercancel', onCancel, opts);
    document.removeEventListener('contextmenu', onMenu, opts);
    document.removeEventListener('keydown', onKeyDown, opts);
    document.removeEventListener('keyup', onKeyUp, opts);
    document.removeEventListener('click', onClick, opts);
  };
}
