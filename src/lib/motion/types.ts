export type Category = 'numbers' | 'repine' | 'frames';
export type Params = {
  value: number; decimals: number; label: string; prefix: string; suffix: string;
  title: string; subtitle: string; reciter: string; support: string; phone: string; handle: string; web: string;
  color: string; text: string; main: string; accent: string; c1: string; c2: string; c3: string; c4: string;
  speed: number; hold: number; tIn: number; tHold: number; tOut: number;
  mIn: number; mOut: number; mIdle: number; ratio: string;
  glow: boolean; showVerse: boolean; showLogo: boolean; showContact: boolean;
  showSocial: boolean; showWave: boolean; particles: boolean; bgIn: boolean;
};
export type Graphic = {
  id: string; name: string; blurb: string; category: Category; isNew?: boolean;
  defaults: Params; raw?: boolean;
  draw: (ctx: CanvasRenderingContext2D, params: Params, time: number) => void;
  timing?: (params: Params) => { total: number };
  dims?: (params: Params) => { w: number; h: number };
  value?: { boxMax: number };
  toggles?: string[];
  colors?: string[] | string[][];
};
