export type Category = 'numbers' | 'repine' | 'frames';
export type Params = {
  value: number; decimals: number; label: string; prefix: string; suffix: string;
  title: string; subtitle: string; kicker: string; reciter: string; support: string; phone: string; handle: string; web: string;
  color: string; text: string; main: string; accent: string; c1: string; c2: string; c3: string; c4: string;
  speed: number; hold: number; tIn: number; tHold: number; tOut: number;
  mIn: number; mOut: number; mIdle: number; ratio: string;
  glow: boolean; showVerse: boolean; showLogo: boolean; showContact: boolean;
  showSocial: boolean; showWave: boolean; particles: boolean; bgIn: boolean;
  /* design options of the lower thirds in designs-ribbons.js; other designs ignore them */
  metal: string; shine: boolean; shineSpeed: number; pattern: string; patternAmt: number; font: string; span: string;
  side: string; size: number; lift: number; dropShadow: boolean; flow: number; plaque: string; icon: boolean;
};
export type TextKey = 'label' | 'prefix' | 'suffix' | 'title' | 'subtitle' | 'kicker' | 'reciter' | 'support' | 'phone' | 'handle' | 'web';
export type ColorKey = 'color' | 'text' | 'main' | 'accent' | 'c1' | 'c2' | 'c3' | 'c4';
export type ToggleKey = 'showVerse' | 'showLogo' | 'showContact' | 'showSocial' | 'showWave' | 'particles' | 'bgIn' | 'glow';
/** Shown only while `when` holds, for a field that matters only with another choice (a custom metal's colour, say). */
type When = { when?: (p: Params) => boolean };
export type TextField = When & { key: TextKey; label: string; max: number; ltr?: boolean; hint?: string; placeholder?: string; group?: 'main' | 'contact' | 'social'; compact?: boolean };
export type ColorField = When & { key: ColorKey; label: string };
export type ToggleField = { key: ToggleKey; label: string };
export type OptionKey = 'metal' | 'shine' | 'shineSpeed' | 'pattern' | 'patternAmt' | 'font' | 'span' | 'side' | 'size' | 'lift' | 'dropShadow' | 'flow' | 'plaque' | 'icon' | 'glow' | 'particles';
/** Where an option sits: «الألوان», or a group of «التصميم». */
export type OptionPlace = 'colors' | 'shine' | 'surface' | 'layout' | 'effects';
type OptionBase = When & { key: OptionKey; label: string; hint?: string; place: OptionPlace };
export type OptionField =
  | OptionBase & { kind: 'choice'; choices: { value: string; label: string }[]; look?: 'metal' | 'pattern'; paper?: ColorKey }
  | OptionBase & { kind: 'switch' }
  | OptionBase & { kind: 'slider'; min: number; max: number; step: number; unit?: string; decimals?: number; times?: boolean };
export type ValueSpec = { label: string; min: number; max: number; step: number; boxMin: number; boxMax: number; boxStep: number };
export type Graphic = {
  id: string; name: string; blurb: string; category: Category; badge?: 'new' | 'updated';
  defaults: Params; raw?: boolean;
  draw: (ctx: CanvasRenderingContext2D, params: Params, time: number) => void;
  timing?: (params: Params) => { total: number };
  dims?: (params: Params) => { w: number; h: number };
  winBox?: (params: Params) => { x: number; y: number; w: number; h: number };
  value?: ValueSpec;
  texts: TextField[]; colors: ColorField[]; toggles: ToggleField[];
  /** Design options beyond text, colour and timing (the metal, a pattern, the side...), when a design has them. */
  options?: OptionField[];
};

/** Whether a field shows for these parameters. */
export const shown = (f: When, p: Params) => !f.when || f.when(p);
