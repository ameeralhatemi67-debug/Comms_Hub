// A platform's mark on «المنصات» and «حسابات المنصات»: one line drawing for each, so a list reads at a glance.
const PATHS: Record<string, string> = {
  instagram: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5z M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z M17.5 6.5h.01',
  facebook: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z',
  youtube: 'M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17 M10 15l5-3-5-3z',
  linkedin: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z M2 9h4v12H2z M4 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  x: 'M4 4l16 16 M20 4L4 20',
  tiktok: 'M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5 M14 3c.5 2.5 2.5 4.5 5 4.5',
  snapchat: 'M12 3c3 0 5 2.2 5 5.2V11l2 1-1.6 1 .6 2-2.6-.2L13.5 18h-3l-1.9-3.2L6 15l.6-2L5 12l2-1V8.2C7 5.2 9 3 12 3z',
  whatsapp: 'M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z',
  mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
  other: 'M12 5v14 M5 12h14',
};

export function PlatformIcon({ k }: { k: string }) {
  return (
    <svg className="pf-i" viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[k.startsWith('whatsapp') ? 'whatsapp' : k] ?? PATHS.other} />
    </svg>
  );
}

export function PlatformTile({ k }: { k: string }) {
  return (
    <span className="pf-tile">
      <PlatformIcon k={k} />
    </span>
  );
}
