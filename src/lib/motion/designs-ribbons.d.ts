type Source = any;
export const RIBBONS: Source[];
export const METALS: Record<'gold' | 'silver' | 'rose' | 'bronze', string[]>;
export const PATTERNS: string[];
export function metalOf(p: { metal?: string; accent?: string }): string[];
export function metalCss(tones: string[]): string;
export function patternSwatch(canvas: HTMLCanvasElement, kind: string, ink: string, paper: string): void;
