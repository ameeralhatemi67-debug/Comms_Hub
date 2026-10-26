// The pages' Content-Security-Policy (Desktop_App_Plan.md 3, 6 and 9: required before the desktop application
// lets a page read files on the laptop, phase D4). Its purpose is that a script slipped into a page does not
// run: scripts need the request's nonce, which Next.js puts on its own (node_modules/next/dist/docs/01-app/
// 02-guides/content-security-policy.md), and 'strict-dynamic' lets them load the rest. The one inline script
// of the site's own, the theme restored before the first paint, is allowed by its SHA-256. The other
// directives stay broad, so nothing the site does today is refused: files go straight to Google Drive,
// OneDrive or an S3 endpoint the administrator chose, and the database speaks over https and wss. The
// desktop application's own addresses (commshub-file:) are allowed for media and reads; a browser never
// has any. Every page is rendered per request already, so each gets a fresh nonce. Pure, except the hash,
// which uses Web Crypto.

import { THEME_KEY } from './identity.ts';

/**
 * Applies a saved theme choice before the first paint, so a reload never flashes the other theme. Light is
 * the default; the device's colour preference is not read. layout.tsx puts it in the page; the policy
 * allows exactly this text by its hash.
 */
export const RESTORE_THEME = `(function(){var r=document.documentElement,t="light";try{if(localStorage.getItem(${JSON.stringify(THEME_KEY)})==="dark")t="dark"}catch(e){}r.setAttribute("data-theme",t)})()`;

const hashes = new Map<string, Promise<string>>();

/** 'sha256-…' of an inline script's exact text. */
export function scriptHash(text: string): Promise<string> {
  let h = hashes.get(text);
  if (!h) {
    h = crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)).then((d) => `'sha256-${btoa(String.fromCharCode(...new Uint8Array(d)))}'`);
    hashes.set(text, h);
  }
  return h;
}

/** A fresh nonce: 16 random bytes in base64. */
export function newNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b));
}

export function buildCsp(o: { nonce: string; hashes: string[]; dev: boolean }): string {
  const directives: [string, string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", `'nonce-${o.nonce}'`, ...o.hashes, "'strict-dynamic'", "'wasm-unsafe-eval'", ...(o.dev ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', 'https:', 'commshub-file:']],
    ['media-src', ["'self'", 'data:', 'blob:', 'https:', 'commshub-file:']],
    ['connect-src', ["'self'", 'https:', 'wss:', 'commshub-file:', ...(o.dev ? ['ws:'] : [])]],
    ['font-src', ["'self'", 'data:']],
    ['worker-src', ["'self'", 'blob:']],
    ['frame-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['frame-ancestors', ["'none'"]],
  ];
  return directives.map(([name, values]) => `${name} ${values.join(' ')}`).join('; ');
}

/** Pages get the policy; the API's routes answer with their own headers (the file routes set theirs). */
export const wantsPolicy = (pathname: string) => !pathname.startsWith('/api/');
