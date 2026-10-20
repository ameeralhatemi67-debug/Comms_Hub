// What the application tells «معلومات الجهاز» (Desktop_App_Plan.md 5.2 `info`, phase D2): its version,
// the processor, memory, free disk where its data lives, and the graphics chips with the one Chromium
// runs on. On a laptop with two chips the studio may run on the weaker one; the panel shows which, and
// the guide says how to choose the other. It names no file or folder. Pure: main.ts gathers the parts.

export type GpuChip = { name: string; vendor: string; active: boolean };
export type GpuSummary = { chips: GpuChip[]; active: string | null; software: boolean };

export type DeviceInfo = {
  version: string;
  bridge: number;
  os: string;
  osVersion: string;
  arch: string;
  cores: number;
  cpu: string;
  memory: number;
  freeDisk: number | null;
  gpu: GpuSummary;
};

/** PCI vendor numbers of the chips a Windows laptop has. */
export const VENDORS: Readonly<Record<number, string>> = Object.freeze({ 0x10de: 'NVIDIA', 0x1002: 'AMD', 0x8086: 'Intel', 0x1414: 'Microsoft', 0x5143: 'Qualcomm' });

// Windows' own software renderer, used when no chip can draw.
const isSoftware = (vendorId: number, name: string) => vendorId === 0x1414 && /basic render/i.test(name);

const tidy = (text: unknown, max = 100) => (typeof text === 'string' ? text.replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** The chips from app.getGPUInfo('complete'); Windows' software renderer is not listed as a chip. */
export function gpuSummary(info: unknown): GpuSummary {
  const devices = info && typeof info === 'object' && Array.isArray((info as { gpuDevice?: unknown }).gpuDevice) ? (info as { gpuDevice: unknown[] }).gpuDevice : [];
  const chips: GpuChip[] = [];
  let software = false;
  let active: string | null = null;
  for (const raw of devices) {
    if (!raw || typeof raw !== 'object') continue;
    const d = raw as { vendorId?: unknown; deviceId?: unknown; deviceString?: unknown; active?: unknown };
    const vendorId = typeof d.vendorId === 'number' ? d.vendorId : 0;
    const vendor = VENDORS[vendorId] ?? `0x${vendorId.toString(16).padStart(4, '0')}`;
    const name = tidy(d.deviceString) || `${vendor} 0x${(typeof d.deviceId === 'number' ? d.deviceId : 0).toString(16).padStart(4, '0')}`;
    const on = d.active === true;
    if (isSoftware(vendorId, name)) {
      if (on) software = true;
      continue;
    }
    chips.push({ name, vendor, active: on });
    if (on) active = name;
  }
  return { chips, active, software };
}

/** Free bytes from fs.statfsSync, or null when the system did not say. */
export function freeBytes(stat: { bavail?: number | bigint; bsize?: number | bigint } | null | undefined): number | null {
  if (!stat || stat.bavail === undefined || stat.bsize === undefined) return null;
  const n = Number(stat.bavail) * Number(stat.bsize);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function deviceInfo(parts: { version: string; bridge: number; os: string; osVersion: string; arch: string; cpus: { model?: string }[]; memory: number; freeDisk: number | null; gpu: unknown }): DeviceInfo {
  return {
    version: parts.version,
    bridge: parts.bridge,
    os: parts.os,
    osVersion: tidy(parts.osVersion, 40),
    arch: parts.arch,
    cores: parts.cpus.length,
    cpu: tidy(parts.cpus[0]?.model),
    memory: Math.max(0, Math.round(parts.memory)),
    freeDisk: parts.freeDisk,
    gpu: gpuSummary(parts.gpu),
  };
}
