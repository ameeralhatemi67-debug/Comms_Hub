'use client';

// The platforms an export is meant for (MVP_draft.md 62.10). The studio page is outside the work pages'
// provider, so it reads the platform registry itself (the same columns the work pages read) and the
// platforms of the linked work's accounts, then turns each into the facts the checks use (checks.ts).
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { platformInfo, platformLabels, platformList, setPlatformRegistry, type PlatformInfo } from '@/lib/work/rules';
import { limitsOf } from '@/lib/platforms/limits';
import { platformSpecs } from '@/lib/media/rules';
import type { PlatformFacts } from '@/lib/studio/checks';

/** What the checks know of one platform. */
export function factsOf(key: string): PlatformFacts {
  const info = platformInfo(key);
  const spec = platformSpecs.find((s) => s.id.toLowerCase() === key.toLowerCase());
  const max = info ? limitsOf(info.accepts).max_video_seconds : undefined;
  return {
    key,
    label: platformLabels[key] ?? key,
    videoOnly: info?.accepts.video_only === true,
    ...(max ? { maxSeconds: max } : {}),
    ...(spec ? { suggested: { ratio: spec.ratio, size: spec.size } } : {}),
  };
}

let loaded: Promise<void> | null = null;
/** The registry, once per page. */
function loadRegistry(): Promise<void> {
  return (loaded ??= (async () => {
    const { data } = await supabase()
      .from('platforms')
      .select('key,label_ar,kind,sort,accepts,publish_mode,scheduling,requires_review,token_life_days,enabled,builtin,docs_url,readiness,readiness_note,readiness_at,readiness_by')
      .order('sort');
    if (Array.isArray(data) && data.length) setPlatformRegistry(data as PlatformInfo[]);
  })());
}

/** The social platforms, and the ones the linked work publishes to (its accounts' platforms). */
export function usePlatforms(workRef: string | null) {
  const [ready, setReady] = useState(false);
  const [workKeys, setWorkKeys] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    void loadRegistry().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    if (!workRef) {
      setWorkKeys([]);
      return;
    }
    void (async () => {
      const w = await supabase().from('works').select('channels').eq('id', workRef).maybeSingle();
      const ids = ((w.data as { channels?: string[] } | null)?.channels ?? []).filter(Boolean);
      if (!ids.length) return live && setWorkKeys([]);
      const a = await supabase().from('platform_accounts').select('id,platform').in('id', ids);
      const keys = [...new Set(((a.data ?? []) as { platform: string }[]).map((x) => x.platform))];
      if (live) setWorkKeys(keys);
    })();
    return () => {
      live = false;
    };
  }, [workRef]);
  // read again once the registry has loaded (the built-in rows answer until then)
  const social = platformList().filter((p) => p.kind === 'social' && p.enabled);
  return { social, workKeys, ready };
}
