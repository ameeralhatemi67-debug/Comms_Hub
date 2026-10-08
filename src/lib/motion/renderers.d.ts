import type { Graphic, Params } from './types';
export const GRAPHICS: Graphic[];
export const REPINE: Graphic[];
export const FRAMES: Graphic[];
export function loadAssets(): Promise<void>;
export function renderFrame(g: Graphic, p: Params, t: number, ctx: CanvasRenderingContext2D, scale: number, bg?: string | null): void;
export function timingOf(g: Graphic, p: Params): { total: number };
export function drawLogo(ctx: CanvasRenderingContext2D, key: string, color: string, x: number, y: number, width: number, alpha?: number): void;
