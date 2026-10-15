// The help registry's shape: one entry per page, read by the first-visit guide, the
// section tips, the guide mode and the page guide (src/lib/kit/guide.ts).

export type RoleGroup = 'lead' | 'maker' | 'publisher' | 'member';

/** A part of a page. `sel` is a CSS selector inside the page; `first` gives it a tip the first time someone clicks inside it. */
export type HelpPart = { k: string; sel: string; t: string; b: string; first?: boolean; w?: string; g?: string[] };
/**
 * A step of the first-visit guide, pointed at an element of the page.
 * `g`: only for these role groups.
 */
export type HelpStep = { sel: string; t: string; b: string; g?: RoleGroup[] };
/** A button worth its own explanation in guide mode. */
export type HelpAct = { sel: string; t: string; b: string; w?: string; g?: string[] };

export type HelpPage = {
  name: string;
  tip: string;
  purpose: string;
  onb: HelpStep[];
  /** Steps that only one role group is shown, after the common ones. */
  onbRole?: Partial<Record<RoleGroup, HelpStep[]>>;
  /** Raised when steps are added to `news`: a person who saw the guide before is shown `news` once per version. */
  v?: number;
  /** What was added in version `v`, for people who already saw the first guide. */
  news?: HelpStep[];
  /** What an empty page is waiting for, said when the guide finds little to point at. */
  empty?: string;
  parts: HelpPart[];
  acts?: HelpAct[];
  roles: Record<RoleGroup, string>;
  rules: string[];
  links: [string, string][];
  faq: [string, string][];
};
