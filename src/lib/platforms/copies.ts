// Which text and which files a platform would receive from a work, and the check of that copy
// against the platform's limits. Pure: the pages hand it what they loaded.
//
// A platform copy is the latest non-blank variant written for that platform; with none, the
// platform receives the work's main text as it is (the same rule the work page states: «يُنشر
// النص الأساسي كما هو»). The files are the work's linked library files.
import { checkCopy, limitsOf, type Check, type Limits } from './limits.ts';

export type CopySource = {
  type: string;
  texts: { n: number; body: string }[];
  variants: { platform: string; n: number; body: string }[];
  assets: { file: { kind: string; id?: string; name?: string } | null }[];
};

export type CopyFile = { id?: string; name?: string; kind: string };

export type Copy = {
  platform: string;
  text: string;
  /** The platform has a copy of its own (otherwise it gets the main text). */
  own: boolean;
  images: number;
  videos: number;
  /** Linked files this person cannot see: not counted. */
  hidden: number;
  /** The files this person can see, for a publishing pack. */
  files: CopyFile[];
  typeVideo: boolean;
};

export function mediaCounts(assets: CopySource['assets']) {
  let images = 0;
  let videos = 0;
  let hidden = 0;
  for (const a of assets) {
    if (!a.file) hidden += 1;
    else if (a.file.kind === 'video') videos += 1;
    else if (a.file.kind === 'image') images += 1;
  }
  return { images, videos, hidden };
}

export function copyFor(src: CopySource, platform: string): Copy {
  const v = src.variants.filter((x) => x.platform === platform).sort((a, b) => b.n - a.n)[0];
  const main = [...src.texts].sort((a, b) => b.n - a.n)[0];
  const own = !!v && v.body.trim().length > 0;
  return {
    platform,
    text: own ? v!.body : (main?.body ?? ''),
    own,
    ...mediaCounts(src.assets),
    files: src.assets.flatMap((a) => (a.file ? [a.file] : [])),
    typeVideo: src.type === 'video',
  };
}

export function checkFor(accepts: Record<string, unknown> | null | undefined, c: Copy): Check & { limits: Limits } {
  const limits = limitsOf(accepts);
  return { ...checkCopy(limits, { text: c.text, images: c.images, videos: c.videos, typeVideo: c.typeVideo }), limits };
}
