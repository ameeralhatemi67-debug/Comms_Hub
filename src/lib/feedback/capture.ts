// Reads the page for a note's marks (MVP_draft.md section 69): rectangles and names, never a picture. The value of a field
// and the text of an editor are never read, and a name comes only from a control's own label. The rules are in marks.ts.

import { ELEMENT_WORDS, KIND, elementName, isPrivatePage, packOutline, type Box, type Outline, type OutlineItem, type View } from './marks.ts';

/** Everything that says something about the shape of a screen. */
const WATCHED =
  'dialog,aside,nav,header,footer,main,section,article,table,.panel,.card,button,[role=button],[role=tab],a[href],input,select,textarea,[contenteditable=true],img,video,canvas,h1,h2,h3,h4,p,label,li,th,td';
/** A page can be enormous; this bounds the time a click takes. */
const MAX_SCANNED = 3000;

function kindOf(el: Element): number {
  if (el.matches('button,[role=button],[role=tab],a[href]')) return KIND.control;
  if (el.matches('input,select,textarea,[contenteditable=true]')) return KIND.field;
  if (el.matches('img,video,canvas')) return KIND.media;
  if (el.matches('h1,h2,h3,h4,p,label,th,td,li')) return KIND.text;
  return KIND.area;
}

/** The window on top, if any. The page behind it is inert, so it is what can be marked. */
export function topDialog(doc: Document): HTMLDialogElement | null {
  const open = doc.querySelectorAll<HTMLDialogElement>('dialog[open]:not([data-no-note])');
  return open[open.length - 1] ?? null;
}

export type Target = OutlineItem & { el: Element };
export type Capture = { outline: Outline; targets: Target[] };

/** The screen as it stands: the rectangles for the outline, and what a mark can land on. */
export function capturePage(doc: Document, view: View): Capture {
  const scope: Element = topDialog(doc) ?? doc.body;
  const found = [scope, ...scope.querySelectorAll(WATCHED)].slice(0, MAX_SCANNED);
  const targets: Target[] = [];
  for (const el of found) {
    if (el.closest('[data-fb-own]') || !(el.checkVisibility?.({ visibilityProperty: true }) ?? true)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.right < 0 || r.top > view.h || r.left > view.w) continue;
    targets.push({ x: r.left, y: r.top, w: r.width, h: r.height, kind: kindOf(el), el });
  }
  return { outline: packOutline(targets, view), targets };
}

/** A node's own words, leaving out what sits inside it, such as the field a label wraps. */
function ownWords(el: Element): string {
  return [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join(' ');
}

function labelOf(el: Element): string {
  const named = el.getAttribute('aria-label') || el.getAttribute('title');
  if (named) return named;
  if (el.matches('button,[role=button],[role=tab],a[href],th')) return el.textContent ?? '';
  if (el.matches('input,select,textarea')) {
    const label = (el as HTMLInputElement).labels?.[0];
    return label ? ownWords(label) : el.getAttribute('placeholder') ?? '';
  }
  return el.matches('label') ? ownWords(el) : '';
}

const isPrivateSpot = (el: Element, page: string) => isPrivatePage(page) || Boolean(el.closest('[data-fb-private]'));

/** The name of an element, in the note's words. */
export function nameOf(el: Element, page: string): string {
  const word = ELEMENT_WORDS.find(([sel]) => el.matches(sel))?.[1] ?? 'منطقة';
  return elementName(word, labelOf(el), isPrivateSpot(el, page));
}

/** A short path of tags and class names, for whoever goes looking in the code. It holds no words of the page. */
export function pathOf(el: Element): string {
  const steps: string[] = [];
  for (let at: Element | null = el; at && at.tagName !== 'BODY' && steps.length < 4; at = at.parentElement) {
    const classes = [...at.classList].filter((c) => /^[a-z][a-z0-9_-]{1,30}$/i.test(c)).slice(0, 2);
    steps.unshift([at.tagName.toLowerCase(), ...classes].join('.'));
  }
  return steps.join(' > ').slice(0, 200);
}

/** The title of the window on top, unless what is in it is private. */
export function dialogTitle(doc: Document, page: string): string {
  const top = topDialog(doc);
  if (!top || isPrivateSpot(top, page) || top.querySelector('[data-fb-private]')) return '';
  return (top.getAttribute('aria-label') ?? top.querySelector('h2')?.textContent ?? '').slice(0, 80);
}

export const screenSize = (win: Window): View => ({ w: win.innerWidth, h: win.innerHeight });

export type { Box };
