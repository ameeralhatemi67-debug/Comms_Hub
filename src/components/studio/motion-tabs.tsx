'use client';

import Link from 'next/link';
import { Clapperboard, Film } from 'lucide-react';
import { studioTabVisible } from '@/lib/access';
import { useAccount } from '@/lib/account-context';
import { useHub } from '@/lib/store';
import { useCaps } from '../caps';
import './motion-tabs.css';

/**
 * The tab bar of «استوديو الحركة»: «قوالب الحركة» (MVP_draft.md 57) and «الاستوديو» (section 62).
 * Drawn only for those who may open the studio (studioTabVisible: the Admin and the director, and an
 * administrator viewing as one of them); everyone else sees the page exactly as before.
 */
export function MotionTabs({ active }: { active: 'templates' | 'studio' }) {
  const account = useAccount();
  const { state } = useHub();
  const caps = useCaps();
  if (!studioTabVisible(account, { viewAs: state.role, hasCap: caps.has })) return null;
  return <MotionTabBar active={active} />;
}

export function MotionTabBar({ active }: { active: 'templates' | 'studio' }) {
  return (
    <nav className="mt-tabs" aria-label="أقسام استوديو الحركة">
      <Link href="/motion" aria-current={active === 'templates' ? 'page' : undefined}>
        <Clapperboard aria-hidden="true" />
        قوالب الحركة
      </Link>
      <Link href="/motion/studio" aria-current={active === 'studio' ? 'page' : undefined}>
        <Film aria-hidden="true" />
        الاستوديو
      </Link>
    </nav>
  );
}
