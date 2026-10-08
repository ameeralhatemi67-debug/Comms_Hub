export type Category = 'numbers' | 'repine' | 'frames';
export type Params = {
  value: number; decimals: number; label: string; prefix: string; suffix: string;
  title: string; subtitle: string; kicker: string; reciter: string; support: string; phone: string; handle: string; web: string;
  color: string; text: string; main: string; accent: string; c1: string; c2: string; c3: string; c4: string;
  speed: number; hold: number; tIn: number; tHold: number; tOut: number;
  mIn: number; mOut: number; mIdle: number; ratio: string;
  glow: boolean; showVerse: boolean; showLogo: boolean; showContact: boolean;
  showSocial: boolean; showWave: boolean; particles: boolean; bgIn: boolean;
};
export type TextKey = 'label' | 'prefix' | 'suffix' | 'title' | 'subtitle' | 'kicker' | 'reciter' | 'support' | 'phone' | 'handle' | 'web';
export type ColorKey = 'color' | 'text' | 'main' | 'accent' | 'c1' | 'c2' | 'c3' | 'c4';
export type ToggleKey = 'showVerse' | 'showLogo' | 'showContact' | 'showSocial' | 'showWave' | 'particles' | 'bgIn' | 'glow';
export type TextField = { key: TextKey; label: string; max: number; ltr?: boolean; hint?: string; placeholder?: string; group?: 'main' | 'contact' | 'social'; compact?: boolean };
export type ColorField = { key: ColorKey; label: string };
export type ToggleField = { key: ToggleKey; label: string };
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
};
