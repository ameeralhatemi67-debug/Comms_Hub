'use client';
// What a person can do to an asset, and doing it. Shared by the library cards, the
// quick-action menu and the asset page so they never disagree.
import { useCallback } from 'react';
import { quickActions, type ActionDef, type ActionId } from '@/lib/media/rules';
import type { Dialog } from './dialogs';
import { useMedia, type AssetRow } from './provider';

export function useAssetActions() {
  const m = useMedia();

  const actionsFor = useCallback(
    (a: AssetRow): ActionDef[] =>
      quickActions({
        role: m.role,
        level: m.levelOf(a.folder_id),
        folderLocked: m.lockedIn(a.folder_id),
        stage: a.stage,
        approvedVersion: a.approved_version,
        currentVersion: a.current_version,
        hasChannels: a.channels.length > 0,
        isVideo: a.kind === 'video' || a.kind === 'audio',
      }),
    [m],
  );

  /** Runs an action: stage moves happen at once, the rest open their dialog. */
  const run = useCallback(
    async (a: AssetRow, id: ActionId, open: (d: Dialog) => void) => {
      if (id === 'startprod' || id === 'submit') {
        const r = await m.patchAsset(a.id, { stage: id === 'startprod' ? 'production' : 'review' });
        m.say(r.ok ? (id === 'startprod' ? 'انتقل إلى «قيد الإنتاج»' : 'أُرسل للمراجعة، ويصل إشعار إلى المراجعين') : r.error);
        return;
      }
      if (id === 'assign') return open({ type: 'assign', ids: [a.id] });
      open({ type: id, assetId: a.id } as Dialog);
    },
    [m],
  );

  return { actionsFor, run };
}
