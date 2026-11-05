'use client';
// The browser's half of thumbnails (MVP_draft.md section 77): at upload, while the file is still in memory, a small picture is
// drawn (a picture made smaller, or a video's frame a tenth of the way in) and saved through thumb_save. It never holds up an
// upload: anything that fails leaves no thumbnail, and the server asks Drive for its own when the picture is first wanted.
import { supabase } from '@/lib/supabase/client';
import { FRAME_WAIT_MS, THUMB_EDGE, THUMB_QUALITIES, drawable, fitSize, frameTime, thumbFits, type ThumbOf, type ThumbType } from './thumbs';

type Source = { draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; w: number; h: number; done: () => void };

async function pictureOf(file: Blob): Promise<Source | null> {
  try {
    const bmp = await createImageBitmap(file);
    return { draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h), w: bmp.width, h: bmp.height, done: () => bmp.close() };
  } catch {
    return null;
  }
}

function frameOf(file: Blob): Promise<Source | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    let settled = false;
    const finish = (s: Source | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!s) {
        v.removeAttribute('src');
        v.load();
        URL.revokeObjectURL(url);
      }
      resolve(s);
    };
    const timer = setTimeout(() => finish(null), FRAME_WAIT_MS);
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.onerror = () => finish(null);
    v.onloadedmetadata = () => {
      const at = frameTime(v.duration);
      if (at === 0) v.onloadeddata = () => v.onseeked?.(new Event('seeked'));
      else v.currentTime = at;
    };
    v.onseeked = () => {
      if (!v.videoWidth || !v.videoHeight) return finish(null);
      finish({
        draw: (ctx, w, h) => ctx.drawImage(v, 0, 0, w, h),
        w: v.videoWidth,
        h: v.videoHeight,
        done: () => {
          v.removeAttribute('src');
          v.load();
          URL.revokeObjectURL(url);
        },
      });
    };
    v.src = url;
  });
}

function encode(canvas: HTMLCanvasElement, type: ThumbType, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/** A thumbnail of a file, as the database takes it (base64 and its type), or null when the browser cannot draw one. */
export async function makeThumb(file: Blob): Promise<{ data: string; mime: ThumbType } | null> {
  const type = file.type.toLowerCase();
  if (!drawable(type)) return null;
  const src = type.startsWith('video/') ? await frameOf(file) : await pictureOf(file);
  if (!src) return null;
  try {
    for (const edge of [THUMB_EDGE, 240, 160]) {
      const size = fitSize(src.w, src.h, edge);
      if (!size) return null;
      const canvas = document.createElement('canvas');
      canvas.width = size.w;
      canvas.height = size.h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // A picture with transparency sits on white, as a JPEG would show it.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, size.w, size.h);
      ctx.imageSmoothingQuality = 'high';
      src.draw(ctx, size.w, size.h);
      for (const quality of THUMB_QUALITIES) {
        // WebP where the browser writes it; a browser that does not falls back to PNG, so JPEG is asked next.
        for (const want of ['image/webp', 'image/jpeg'] as const) {
          const blob = await encode(canvas, want, quality);
          if (!blob || blob.type !== want) continue;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          if (thumbFits(bytes, want)) return { data: base64(bytes), mime: want };
        }
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    src.done();
  }
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export type MadeThumb = Promise<{ data: string; mime: ThumbType } | null>;

/**
 * Saves a thumbnail drawn while the file was uploading (the upload starts `makeThumb` first, so the picture is ready by the
 * time the file is registered). Never throws: a thumbnail is a convenience.
 */
export async function keepThumb(of: ThumbOf, made: MadeThumb): Promise<boolean> {
  try {
    const t = await made;
    if (!t) return false;
    const { error } = await supabase().rpc('thumb_save', {
      p_asset: 'asset' in of ? of.asset : null,
      p_version: 'asset' in of ? of.version : null,
      p_mail_file: 'mailFile' in of ? of.mailFile : null,
      p_data: t.data,
      p_mime: t.mime,
    });
    return !error;
  } catch {
    return false;
  }
}

/** Draws and saves the thumbnail of a file already registered. */
export const saveThumb = (of: ThumbOf, file: Blob) => keepThumb(of, makeThumb(file));
