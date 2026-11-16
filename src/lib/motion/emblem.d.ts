export const EMBLEM: { r: number; half: number; stroke: number };
export const CAPSULE_LENGTH: number;
export function capsulePath(c: CanvasRenderingContext2D | Path2D, cx: number, cy: number, R: number, k: number, rot?: number): void;
export function emblemPath(c: CanvasRenderingContext2D, cx: number, cy: number, R: number, rot?: number): void;
export function emblemStroke(c: CanvasRenderingContext2D, cx: number, cy: number, R: number, o?: { draw?: number; style?: string | CanvasGradient | CanvasPattern; weight?: number; rot?: number; alpha?: number }): void;
export function emblemShine(c: CanvasRenderingContext2D, cx: number, cy: number, R: number, o?: { phase?: number; len?: number; color?: string; glow?: number; weight?: number; rot?: number; alpha?: number; blur?: number }): void;
