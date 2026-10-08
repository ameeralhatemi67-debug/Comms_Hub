export function paintSample(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, label?: boolean): void;
export function drawFootage(ctx: CanvasRenderingContext2D, o: { width: number; height: number; scale: number; win: { x: number; y: number; w: number; h: number }; mode: string; video?: HTMLVideoElement | null; key: string; time: number }): void;
export function drawBackdrop(ctx: CanvasRenderingContext2D, o: { width: number; height: number; mode: string; time: number }): void;
export function drawSafeZones(ctx: CanvasRenderingContext2D, o: { width: number; ratio: string }): void;
