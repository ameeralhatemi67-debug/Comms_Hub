'use client';
// «معلومات الجهاز» (MVP_draft.md 63; Desktop_App_Plan.md 2 and 6, phase D2): the processor, memory, free
// disk, the graphics chip drawing the page and whether the video encoder runs on it. In the desktop
// application the facts come from the application; in a browser, from what the browser tells. Shown on
// the studio's home and from «مساعدة» in the editors. It reads nothing about any person.
import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { native } from '@/lib/native';
import { CHIP_GUIDE, chipFromRenderer, deviceLines, factsFromApp, needsChipGuide, type DeviceFacts } from '@/lib/native/device';
import { Modal } from '../ui';

async function hardwareEncoder(): Promise<boolean | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  try {
    const r = await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: 1920, height: 1080, bitrate: 10_000_000, framerate: 30, hardwareAcceleration: 'prefer-hardware' });
    return r.supported === true;
  } catch {
    return false;
  }
}

function webglRenderer(): string | null {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null;
  } catch {
    return null;
  }
}

export async function gatherFacts(): Promise<DeviceFacts> {
  const n = native();
  let facts = n.has('info') ? factsFromApp(await n.raw!.info!().catch(() => null)) : null;
  if (!facts) {
    const gb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    // The Android application offers no `info`: the browser's facts, named as its own.
    const android = n.platform === 'android';
    facts = { app: android ? n.version : null, appKind: android ? 'android' : undefined, cores: navigator.hardwareConcurrency || null, cpu: null, memory: gb ? gb * 1e9 : null, memoryAtLeast: !!gb && gb >= 8, freeDisk: null, gpu: chipFromRenderer(webglRenderer()), chips: [], software: false, hardwareEncoder: null };
  }
  return { ...facts, hardwareEncoder: await hardwareEncoder() };
}

export function DeviceInfo() {
  const [facts, setFacts] = useState<DeviceFacts | null>(null);
  useEffect(() => {
    let live = true;
    void gatherFacts().then((f) => live && setFacts(f));
    return () => {
      live = false;
    };
  }, []);
  if (!facts) return <p role="status">جارٍ الفحص…</p>;
  return (
    <div className="dv-info">
      <ul>
        {deviceLines(facts).map((l) => (
          <li key={l.label} className={l.ok === undefined ? undefined : l.ok ? 'ok' : 'no'}>
            {l.ok === undefined ? null : l.ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
            <span>
              <b>{l.label}:</b> <bdi>{l.value}</bdi>
            </span>
          </li>
        ))}
      </ul>
      {needsChipGuide(facts) && <p className="st-hint">{CHIP_GUIDE}</p>}
      {!facts.app && <p className="st-hint">في تطبيق سطح المكتب تظهر هنا بطاقة الرسوميات المستعملة والمساحة الحرة، ويستمر التصدير والنافذة مصغّرة.</p>}
    </div>
  );
}

/** On the studio's home, below «ما يقدر عليه هذا المتصفح»: measured only once opened. */
export function DeviceInfoPanel() {
  const [open, setOpen] = useState(false);
  return (
    <details className="panel st-support" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>معلومات الجهاز</summary>
      {open && <DeviceInfo />}
    </details>
  );
}

/** From «مساعدة» in the editors. */
export function DeviceInfoDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="معلومات الجهاز" onClose={onClose}>
      <div className="st-support">
        <DeviceInfo />
      </div>
    </Modal>
  );
}
