'use client';

// One open studio project (Studio_Build_Plan.md section 5): its document, the editing lease (renewed
// every 30 seconds while open, released on leaving), the autosaver, and a device draft offered back
// when it is newer than what the server gave. Every write is a database function (studio_*).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { openDoc, type ProjectDoc } from '@/lib/studio/schema';
import {
  Saver, browserDrafts, draftIsNewer, studioApi, STUDIO_ERRORS,
  type Draft, type Lease, type OpenedDoc, type SaveState, type StudioApi,
} from '@/lib/studio/persist';

export const LEASE_RENEW_MS = 30_000;

let shared: StudioApi | null = null;
/** The studio's database calls through the signed-in browser client. */
export function useStudioApi(): StudioApi {
  return useMemo(() => (shared ??= studioApi(async (fn, args) => {
    const { data, error } = await supabase().rpc(fn, args);
    return { data, error: error ? { message: error.message } : null };
  })), []);
}

export type ProjectState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | {
      status: 'ready';
      opened: OpenedDoc;
      doc: ProjectDoc;
      lease: Lease | null;
      save: SaveState;
      /** A newer draft from this device, offered back. */
      draft: Draft | null;
    };

export function useStudioProject(id: string) {
  const api = useStudioApi();
  const drafts = useMemo(() => browserDrafts(), []);
  const [state, setState] = useState<ProjectState>({ status: 'loading' });
  const saver = useRef<Saver | null>(null);
  const mine = useRef(false);

  const load = useCallback(
    async (take: boolean) => {
      const lease = await api.lease(id, take);
      const opened = await api.open(id);
      if (!opened.ok) return setState({ status: 'error', error: opened.error });
      let doc: ProjectDoc;
      try {
        doc = openDoc(opened.data.doc);
      } catch {
        return setState({ status: 'error', error: STUDIO_ERRORS.DOC_INVALID });
      }
      const leaseNow = lease.ok ? lease.data : null;
      mine.current = !!leaseNow?.mine;
      saver.current?.dispose();
      const s = new Saver({
        api,
        project: id,
        doc,
        base: opened.data.revision,
        leased: mine.current,
        drafts,
        onState: (save) => setState((st) => (st.status === 'ready' ? { ...st, save } : st)),
      });
      saver.current = s;
      const draft = await drafts.get(id);
      setState({
        status: 'ready',
        opened: opened.data,
        doc,
        lease: leaseNow,
        save: s.state,
        draft: draftIsNewer(draft, opened.data) ? draft : null,
      });
      if (!lease.ok && lease.code === 'ARCHIVED') setState((st) => (st.status === 'ready' ? { ...st, save: { kind: 'readonly', code: 'ARCHIVED', error: STUDIO_ERRORS.ARCHIVED } } : st));
    },
    [api, drafts, id],
  );

  useEffect(() => {
    void load(false);
    return () => {
      saver.current?.dispose();
      saver.current = null;
      if (mine.current) void api.release(id);
      mine.current = false;
    };
  }, [api, id, load]);

  // The lease is renewed while the project is open; losing it turns the editor to reading.
  useEffect(() => {
    if (state.status !== 'ready') return;
    const t = setInterval(async () => {
      if (!mine.current) return;
      const r = await api.lease(id, false);
      if (r.ok && !r.data.mine) {
        mine.current = false;
        saver.current?.setLeased(false);
        setState((st) => (st.status === 'ready' ? { ...st, lease: r.data } : st));
      }
    }, LEASE_RENEW_MS);
    return () => clearInterval(t);
  }, [api, id, state.status]);

  // Leaving the page with unsaved changes asks first; the draft is on the device either way.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (saver.current?.hasChanges) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const change = useCallback((doc: ProjectDoc) => {
    setState((st) => (st.status === 'ready' ? { ...st, doc } : st));
    saver.current?.change(doc);
  }, []);

  const saveVersion = useCallback(async (note: string | null) => {
    const r = await saver.current?.save(true, note);
    if (r?.ok) setState((st) => (st.status === 'ready' ? { ...st, opened: { ...st.opened, revision: r.data.revision } } : st));
    return r ?? { ok: false as const, code: 'NO_LEASE', error: STUDIO_ERRORS.NO_LEASE };
  }, []);

  /** Take the editing over (a long press): reload the latest saved state, then edit. */
  const takeOver = useCallback(() => load(true), [load]);

  const applyDraft = useCallback(() => {
    setState((st) => {
      if (st.status !== 'ready' || !st.draft) return st;
      saver.current?.change(st.draft.doc);
      return { ...st, doc: st.draft.doc, draft: null };
    });
  }, []);
  const discardDraft = useCallback(() => {
    void drafts.delete(id);
    setState((st) => (st.status === 'ready' ? { ...st, draft: null } : st));
  }, [drafts, id]);

  const rename = useCallback(
    async (title: string) => {
      const r = await api.rename(id, title);
      if (r.ok) setState((st) => (st.status === 'ready' ? { ...st, opened: { ...st.opened, title: title.trim() } } : st));
      return r;
    },
    [api, id],
  );

  return { state, change, saveVersion, takeOver, applyDraft, discardDraft, rename, api, revision: () => saver.current?.revision ?? 0, saveNow: () => saver.current?.save(false) };
}
