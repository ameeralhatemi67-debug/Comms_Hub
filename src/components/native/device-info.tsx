'use client';
// «معلومات الجهاز» (MVP_draft.md 63; Desktop_App_Plan.md 2 and 6, phase D2): the processor, memory, free
// disk, the graphics chip drawing the page and whether the video encoder runs on it. In the desktop
// application the facts come from the application; in a browser, from what the browser tells. Shown on
// the studio's home and from «مساعدة» in the editors. It reads nothing about any person.
// From D9 (MVP_draft.md 63.6, Desktop_Power_Ideas.md P-01, P-33, P-36), inside the application only:
// «بطاقة الرسوميات للاستوديو» on a laptop with two chips, «قياس قدرة الجهاز», and, folded under «التفاصيل»,
// the measured figures, «الأداء» and the plan of scale.ts. In a browser nothing of this appears.
import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';
import { native, type GpuChoice, type NativeGpuState, type ProfileEntry, type ProfileKey } from '@/lib/native';
import {
  CHIP_GUIDE,
  chipFromRenderer,
  currentEntry,
  deviceLines,
  factsFromApp,
  GPU_AUTO_HINT,
  GPU_BUSY,
  GPU_CHOICES,
  GPU_MEASURE_OTHER,
  GPU_RESTART,
  knobLines,
  MEASURE_HINT,
  needsChipGuide,
  PERFORMANCE_CHOICES,
  PLAN_NOTE,
  profileLines,
  profileSummary,
  type DeviceFacts,
  type DeviceLine,
} from '@/lib/native/device';
import { isPerformance, plan, type Performance } from '@/lib/studio/scale';
import { usePref } from '../studio/prefs';
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

function Lines({ lines }: { lines: DeviceLine[] }) {
  return (
    <ul>
      {lines.map((l) => (
        <li key={l.label} className={l.ok === undefined ? undefined : l.ok ? 'ok' : 'no'}>
          {l.ok === undefined ? null : l.ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
          <span>
            <b>{l.label}:</b> <bdi>{l.value}</bdi>
          </span>
        </li>
      ))}
    </ul>
  );
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
  const n = native();
  const tuning = n.has('gpu') && n.has('profile');
  return (
    <div className="dv-info">
      <Lines lines={deviceLines(facts)} />
      {needsChipGuide(facts) && !tuning && <p className="st-hint">{CHIP_GUIDE}</p>}
      {!facts.app && <p className="st-hint">في تطبيق سطح المكتب تظهر هنا بطاقة الرسوميات المستعملة والمساحة الحرة، ويستمر التصدير والنافذة مصغّرة.</p>}
      {tuning && <DeviceTuning facts={facts} />}
    </div>
  );
}

/** D9, inside the desktop application: the chip, the measurement, and the plan. */
function DeviceTuning({ facts }: { facts: DeviceFacts }) {
  const n = native();
  const [gpu, setGpu] = useState<NativeGpuState | null>(null);
  const [profile, setProfile] = useState<{ current: ProfileKey; entries: ProfileEntry[] } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [performance, setPerformance] = usePref<Performance>('performance', 'auto', isPerformance);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([n.raw!.gpu!.state!().catch(() => null), n.raw!.profile!.read!().catch(() => null)]).then(([g, p]) => {
      if (!live) return;
      setGpu(g);
      setProfile(p);
    });
    return () => {
      live = false;
      abort.current?.abort();
    };
  }, [n.raw]);

  const choose = async (choice: GpuChoice) => {
    setGpu(await n.raw!.gpu!.choose!(choice).catch(() => gpu));
  };
  const restart = async () => {
    const r = await n.raw!.gpu!.restart!().catch(() => 'nothing' as const);
    if (r === 'busy') setNote(GPU_BUSY);
  };
  const measure = async () => {
    setNote(null);
    setProgress(0);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      // the measurement is loaded only when asked for
      const { measureDevice } = await import('@/lib/studio/bench');
      const numbers = await measureDevice({ onProgress: setProgress, signal: ctl.signal });
      const entry = await n.raw!.profile!.save!(numbers);
      setProfile(await n.raw!.profile!.read!());
      setGpu(await n.raw!.gpu!.state!());
      setNote(profileSummary(entry));
    } catch (e) {
      setNote((e as Error)?.name === 'AbortError' ? 'أُلغي القياس.' : 'تعذّر القياس على هذا الجهاز.');
    } finally {
      abort.current = null;
      setProgress(null);
    }
  };

  const entry = currentEntry(profile);
  const knobs = plan(entry?.numbers ?? null, { cores: facts.cores, memory: facts.memory }, performance);
  return (
    <div className="dv-tune">
      {facts.chips.length >= 2 && (
        <div className="dv-row">
          <b id="dv-gpu">بطاقة الرسوميات للاستوديو</b>
          <div className="seg" role="group" aria-labelledby="dv-gpu">
            {GPU_CHOICES.map((c) => (
              <button key={c.value} type="button" aria-pressed={gpu?.choice === c.value} disabled={!gpu || gpu.given} onClick={() => void choose(c.value)}>
                {c.label}
              </button>
            ))}
          </div>
          {gpu?.given && <p className="st-hint">بطاقة الرسوميات محددة عند تشغيل التطبيق، فلا يغيّرها هذا الاختيار.</p>}
          {gpu && !gpu.given && gpu.choice === 'auto' && <p className="st-hint">{gpu.pick ? GPU_AUTO_HINT : `${GPU_AUTO_HINT} ${GPU_MEASURE_OTHER}`}</p>}
          {gpu?.restart && (
            <p className="st-hint">
              {GPU_RESTART}{' '}
              <button type="button" className="st-mini" onClick={() => void restart()}>
                إعادة التشغيل الآن
              </button>
            </p>
          )}
        </div>
      )}
      <div className="dv-row">
        <div className="actions">
          <button type="button" className="st-mini" disabled={progress !== null} onClick={() => void measure()}>
            قياس قدرة الجهاز
          </button>
          {progress !== null && (
            <>
              <span role="status">جارٍ القياس {Math.round(progress * 100)}٪…</span>
              <button type="button" className="st-mini" onClick={() => abort.current?.abort()}>
                إلغاء
              </button>
            </>
          )}
        </div>
        <p className="st-hint">{MEASURE_HINT}</p>
        {note ? <p className="st-hint" role="status">{note}</p> : entry && <p className="st-hint">{profileSummary(entry)}</p>}
      </div>
      {entry && (
        <details className="dv-details">
          <summary>التفاصيل</summary>
          <Lines lines={profileLines(entry)} />
          <div className="dv-row">
            <b id="dv-perf">الأداء</b>
            <div className="seg" role="group" aria-labelledby="dv-perf">
              {PERFORMANCE_CHOICES.map((c) => (
                <button key={c.value} type="button" aria-pressed={performance === c.value} onClick={() => setPerformance(c.value)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <p className="st-hint">{PLAN_NOTE}</p>
          <Lines lines={knobLines(knobs)} />
        </details>
      )}
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
