'use client';
// A tool drawn inside a guide's step (`tool` in src/lib/setup-guides.ts): today X's cost calculator. One place, so the setup sheet,
// the circled "!" and the one-page guide draw the same thing.
import type { GuideStep } from '@/lib/setup-guides';
import { XCostCalculator } from './settings/x-cost';

export function GuideTool({ tool }: { tool: GuideStep['tool'] }) {
  return tool === 'x-cost' ? <XCostCalculator /> : null;
}
