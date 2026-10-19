// Stand-ins for next/navigation and next/link in the studio's UI fixture (qa/studio-ui.cjs): the
// fixture page routes by itself, so a push or a link only tells it the new address.
import type { AnchorHTMLAttributes, ReactNode } from 'react';

type Nav = (href: string) => void;
const nav: Nav = (href) => (window as unknown as { __nav: Nav }).__nav(href);

export function useRouter() {
  return { push: nav, replace: nav, back: () => history.back(), refresh: () => undefined, prefetch: () => undefined };
}
export function usePathname() {
  return location.pathname;
}
export function useSearchParams() {
  return new URLSearchParams(location.search);
}

export default function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode; prefetch?: boolean }) {
  return (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        e.preventDefault();
        nav(href);
      }}
    >
      {children}
    </a>
  );
}
