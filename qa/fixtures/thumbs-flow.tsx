// The thumbnails of stored files (MVP_draft.md section 77) on a page of their own, for qa/thumbs-flow.cjs: the media library's
// cards (Thumb) and a large video, a mail attachment and a mail file with no picture (FileThumb), and a file chosen in a test
// panel (PickedThumb). The real components, and the real browser half (makeThumb, the upload's hook), with the database's
// client replaced by a recorder (fake-thumbs.tsx). Pictures and a short video are made in the page itself, so nothing is
// loaded from outside.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Thumb } from '../../src/components/media/parts';
import { FileThumb } from '../../src/components/file-thumb';
import { PickedThumb } from '../../src/components/work/picked-thumb';
import { makeThumb } from '../../src/lib/media/thumb-maker';
import { uploadNewAsset } from '../../src/lib/media/upload';

type W = Record<string, unknown> & { __setPicked?: (b: Blob | null) => void };
const w = window as unknown as W;

/** A large picture drawn in the page: a gradient with a mark, 2400 by 1350. */
async function bigPng(): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = 2400;
  c.height = 1350;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 2400, 1350);
  g.addColorStop(0, '#17634b');
  g.addColorStop(1, '#d9b45a');
  x.fillStyle = g;
  x.fillRect(0, 0, 2400, 1350);
  x.fillStyle = '#ffffff';
  x.fillRect(900, 450, 600, 450);
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/png'));
}

/** A short video recorded from a canvas: red, with a moving white square, about 1.5 seconds. */
async function shortVideo(): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 360;
  const x = c.getContext('2d')!;
  const rec = new MediaRecorder(c.captureStream(30), { mimeType: 'video/webm' });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => parts.push(e.data);
  const done = new Promise<Blob>((r) => (rec.onstop = () => r(new Blob(parts, { type: 'video/webm' }))));
  rec.start();
  const t0 = performance.now();
  await new Promise<void>((r) => {
    const step = () => {
      const t = performance.now() - t0;
      x.fillStyle = '#c0392b';
      x.fillRect(0, 0, 640, 360);
      x.fillStyle = '#ffffff';
      x.fillRect(40 + (t / 1500) * 400, 140, 80, 80);
      if (t < 1500) requestAnimationFrame(step);
      else r();
    };
    step();
  });
  rec.stop();
  return done;
}

w.__makeThumb = makeThumb;
w.__upload = uploadNewAsset;
w.__bigPng = bigPng;
w.__shortVideo = shortVideo;

const assets = [
  { id: 'a-img', kind: 'image' as const, name: 'غلاف الحملة.png', current_version: 2 },
  { id: 'a-vid', kind: 'video' as const, name: 'مقطع الحملة.mp4', current_version: 1 },
  { id: 'a-doc', kind: 'document' as const, name: 'التقرير.pdf', current_version: 1 },
  { id: 'a-aud', kind: 'audio' as const, name: 'تسجيل.mp3', current_version: 1 },
];

function App() {
  const [picked, setPicked] = useState<Blob | null>(null);
  w.__setPicked = setPicked;
  return (
    <main style={{ maxWidth: 1000, margin: 'auto', padding: 16, display: 'grid', gap: 18 }}>
      <section id="cards" className="mx-grid">
        {assets.map((a) => (
          <div key={a.id} className="mx-card" data-asset={a.id}>
            <div className="mx-thumb">
              <Thumb asset={a} />
            </div>
            <div style={{ padding: 8 }}>
              <b>{a.name}</b>
            </div>
          </div>
        ))}
      </section>
      <section id="large" style={{ maxWidth: 480 }}>
        <Thumb asset={assets[1]} large />
      </section>
      <section id="mail" className="ml-atts" style={{ display: 'flex', gap: 8 }}>
        <span className="ml-att" data-mail="m-pic">
          <span className="ml-ath">
            <FileThumb of={{ mailFile: 'm-pic' }} kind="image" name="مرفق.jpg" />
          </span>
          <span>مرفق.jpg</span>
        </span>
        <span className="ml-att" data-mail="m-none">
          <span className="ml-ath">
            <FileThumb of={{ mailFile: 'm-none' }} kind="document" name="محضر.pdf" />
          </span>
          <span>محضر.pdf</span>
        </span>
      </section>
      <section id="picked">
        <div className="yt-chip">
          {picked && <PickedThumb blob={picked} asset={null} mime={picked.type} name="محلي.png" />}
          <b>الملف المختار</b>
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
