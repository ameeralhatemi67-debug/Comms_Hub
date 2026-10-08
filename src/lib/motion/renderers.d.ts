import type { Graphic, Params } from './types';
/* The source designs are plain data; the catalog adds labels and controls. */
type Source = any;
export const GRAPHICS: Source[];
export const REPINE: Source[];
export const FRAMES: Source[];
export const kit: Record<string, any>;
export function loadAssets(): Promise<void>;
export function renderFrame(g: Graphic | Source, p: Params, t: number, ctx: CanvasRenderingContext2D, scale: number, bg?: string | null): void;
export function timingOf(g: Graphic | Source, p: Params): { total: number };
export function drawLogo(ctx: CanvasRenderingContext2D, key: string, color: string, x: number, y: number, width: number, alpha?: number): void;
