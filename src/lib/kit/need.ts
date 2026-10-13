// A locked control (Permissions_Plan.md 6, door 1). A control the person may not use for lack
// of a capability carries data-need="<capability>" and aria-disabled="true" (not disabled,
// so it can still be clicked), and its reason in data-why. A click explains why, in the same
// words, and offers «اطلب هذه الصلاحية»; a rule fixed by the reference explains itself and
// offers nothing. The request dialog opens through the NEED_EVENT the kit listens for.
// Listeners sit on the document in the capture phase, before the page's own handlers.
import { capability } from '../permissions.ts';
import { esc, layerEl, layerRemove } from './layer.ts';

export const NEED_EVENT = 'hub:need';
export type NeedDetail = { cap: string };

/** Props for a locked control: spread onto the button instead of `disabled`. */
export function needProps(cap: string, why: string) {
  return { 'data-need': cap, 'data-why': why, 'aria-disabled': true as const };
}

export const isLocked = (el: Element | null) => !!el && el.getAttribute('aria-disabled') === 'true' && el.hasAttribute('data-need');

export function needWhy(el: Element): string {
  const cap = el.getAttribute('data-need') ?? '';
  return el.getAttribute('data-why') || el.getAttribute('title') || `تحتاج صلاحية «${capability(cap)?.label ?? 'غير معروفة'}».`;
}

/** Can this capability be asked for at all? Rules fixed by the reference cannot. */
export const askableCap = (cap: string) => !!capability(cap)?.grantable;

export function needTip(el: Element) {
  const cap = el.getAttribute('data-need') ?? '';
  const tip = layerEl('gd-need');
  tip.classList.add('gd-tip');
  tip.setAttribute('role', 'status');
  const c = capability(cap);
  tip.innerHTML =
    `<b>غير متاح لك الآن</b>${esc(needWhy(el))}` +
    (askableCap(cap)
      ? `<button type="button" class="gb pri" data-need-ask="${esc(cap)}">اطلب هذه الصلاحية</button><small>«${esc(c?.label ?? '')}»: يقرر فيها من يدير رتبتك.</small>`
      : `<small>${esc(c?.why ?? 'مقفلة بقواعد المركز ولا تُطلب.')}</small>`);
  const r = el.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  tip.style.left = '0px';
  tip.style.top = '0px';
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  tip.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, vw - tw - 8))}px`;
  tip.style.top = `${r.top - th - 10 < 8 ? r.bottom + 10 : r.top - th - 10}px`;
}

export function askFor(cap: string) {
  layerRemove('gd-need');
  window.dispatchEvent(new CustomEvent<NeedDetail>(NEED_EVENT, { detail: { cap } }));
}

export function installNeed(hooks: { guideOn: () => boolean }): () => void {
  const onClick = (e: MouseEvent) => {
    const t = e.target as Element | null;
    const ask = t?.closest?.('[data-need-ask]');
    if (ask) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return askFor(ask.getAttribute('data-need-ask') ?? '');
    }
    const el = t?.closest?.('[data-need]') ?? null;
    if (!isLocked(el)) {
      if (!t?.closest?.('.gd-need')) layerRemove('gd-need');
      return;
    }
    // Guide mode explains a locked control itself (the fourth kind of answer).
    if (hooks.guideOn()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    needTip(el!);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return layerRemove('gd-need');
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = (e.target as Element | null)?.closest?.('[data-need]') ?? null;
    if (!isLocked(el) || hooks.guideOn()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    needTip(el!);
  };
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  return () => {
    layerRemove('gd-need');
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
  };
}
