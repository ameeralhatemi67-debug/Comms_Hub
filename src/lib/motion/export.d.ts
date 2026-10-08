import type { Graphic, Params } from './types';
export type ExportFormat = 'png' | 'zip' | 'mov' | 'mp4';
export function exportDesign(g: Graphic, p: Params, options: { format: ExportFormat; shortSide: number; time: number; keyColor: string }, signal: AbortSignal, onProgress: (progress: number) => void): Promise<void>;
