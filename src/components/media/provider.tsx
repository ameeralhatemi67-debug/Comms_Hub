'use client';
// Everything the media pages share: what this person can see (folders, assets, tasks,
// people), how permissions resolve, and the actions that change things. The database
// enforces every rule; this layer loads, calls and explains.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { roles, type Role } from '@/lib/domain';
import { useAccount } from '@/lib/account-context';
import { useHub } from '@/lib/store';
import { supabase } from '@/lib/supabase/client';
import {
  LEVELS,
  canCreateAt,
  canEditAt,
  dbErrorText,
  type Level,
  type Stage,
  type TaskKind,
} from '@/lib/media/rules';
import { uploadNewAsset, uploadNewVersion } from '@/lib/media/upload';
import { useKitMaybe } from '../kit';

export type FolderRow = {
  id: string;
  parent_id: string | null;
  name: string;
  restricted: boolean;
  locked: boolean;
  lock_reason: string | null;
  level: number;
  ghost: boolean;
  locked_by: string | null;
  created_at: string;
};

export type AssetRow = {
  id: string;
  name: string;
  kind: 'image' | 'video' | 'audio' | 'document' | 'other';
  mime_type: string;
  size_bytes: number;
  folder_id: string;
  stage: Stage;
  tags: string[];
  work_ref: string | null;
  current_version: number;
  approved_version: number | null;
  channels: string[];
  copy: Record<string, { t: string; d: string }>;
  schedule: { at: string; platforms: string[]; by?: string } | null;
  checklist: { copy: boolean; rights: boolean; sizes: boolean; review: boolean };
  dims: string | null;
  duration: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
  drive_file_id: string;
};

export type TaskRow = {
  id: string;
  asset_id: string | null;
  what: string;
  kind: TaskKind;
  assignee: string;
  assigned_by: string;
  due: string;
  priority: 'normal' | 'urgent';
  note: string | null;
  status: 'open' | 'done';
  created_at: string;
  done_at: string | null;
};

export type PersonRow = { email: string; display_name: string; role: Role };

export type Transfer = { key: string; name: string; progress: number; error?: string };

type Result = { ok: true } | { ok: false; error: string };

type Ctx = {
  status: 'loading' | 'ready' | 'error';
  email: string;
  /** The role the interface behaves as: the viewed role for an administrator. */
  role: Role;
  isAdmin: boolean;
  people: PersonRow[];
  nameOf: (email: string) => string;
  folders: FolderRow[];
  assets: AssetRow[];
  tasks: TaskRow[];
  folderOf: (id: string | null) => FolderRow | undefined;
  levelOf: (folderId: string | null) => number;
  lockedIn: (folderId: string | null) => boolean;
  canEdit: (folderId: string | null) => boolean;
  canCreate: (folderId: string | null) => boolean;
  canManage: (folderId: string | null) => boolean;
  transfers: Transfer[];
  reload: () => Promise<void>;
  say: (text: string) => void;
  // actions
  upload: (files: File[], folderId: string) => Promise<void>;
  uploadVersion: (assetId: string, file: File, note: string) => Promise<Result>;
  renameAsset: (id: string, name: string) => Promise<Result>;
  moveAssets: (ids: string[], folderId: string) => Promise<Result>;
  trashAsset: (id: string) => Promise<Result>;
  patchAsset: (id: string, patch: Record<string, unknown>) => Promise<Result>;
  createFolder: (name: string, parentId: string | null, restricted: boolean) => Promise<Result & { id?: string }>;
  renameFolder: (id: string, name: string) => Promise<Result>;
  patchFolder: (id: string, patch: { locked?: boolean; lock_reason?: string | null; restricted?: boolean }) => Promise<Result>;
  /** A folder level; for a person, optionally until a moment (media_grants.expires_at, Permissions_Plan.md 4.3). */
  setGrant: (folderId: string, type: 'role' | 'person', subject: string, level: Level | null, until?: string | null) => Promise<Result>;
  assignTask: (t: { assetId: string | null; what: string; kind: TaskKind; assignee: string; due: string; priority: 'normal' | 'urgent'; note: string }) => Promise<Result>;
  completeTask: (id: string) => Promise<Result>;
  addNote: (assetId: string, body: string, timecode: string) => Promise<Result>;
  record: (type: 'download' | 'link', assetId: string) => Promise<void>;
};

const MediaContext = createContext<Ctx | null>(null);

export function useMedia(): Ctx {
  const v = useContext(MediaContext);
  if (!v) throw Error('Media provider missing');
  return v;
}

const fail = (message: string): Result => ({ ok: false, error: dbErrorText(message) });

export function MediaProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const { state, dispatch } = useHub();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [assets, setAssets] = useState<AssetRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  const kit = useKitMaybe();
  const track = kit?.track;
  const isAdmin = account.role === 'admin';
  const role: Role = isAdmin ? state.role : account.role;

  const load = useCallback(async () => {
    const db = supabase();
    const [t, a, k, p] = await Promise.all([
      db.rpc('media_tree'),
      db.from('media_files').select('*').order('created_at', { ascending: false }),
      db.from('media_tasks').select('*').order('due', { ascending: true }),
      db.rpc('media_people'),
    ]);
    if (t.error || a.error || k.error || p.error) return setStatus('error');
    setFolders(t.data as FolderRow[]);
    setAssets(a.data as AssetRow[]);
    setTasks(k.data as TaskRow[]);
    setPeople(p.data as PersonRow[]);
    setStatus('ready');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  // An undo from the top bar or the result message changes what this page shows.
  const onUndo = kit?.onUndo;
  useEffect(() => onUndo?.(() => void load()), [onUndo, load]);

  const say = useCallback((text: string) => dispatch({ type: 'notify', text }), [dispatch]);

  const folderOf = useCallback((id: string | null) => folders.find((f) => f.id === id), [folders]);
  const levelOf = useCallback((id: string | null) => folderOf(id)?.level ?? 0, [folderOf]);
  const lockedIn = useCallback((id: string | null) => Boolean(folderOf(id)?.locked_by), [folderOf]);
  const canEdit = useCallback((id: string | null) => canEditAt(levelOf(id), lockedIn(id)), [levelOf, lockedIn]);
  const canCreate = useCallback((id: string | null) => canCreateAt(levelOf(id), lockedIn(id)), [levelOf, lockedIn]);
  const canManage = useCallback((id: string | null) => levelOf(id) >= LEVELS.manage, [levelOf]);
  const nameOf = useCallback(
    (email: string) => people.find((p) => p.email === email)?.display_name ?? email.split('@')[0],
    [people],
  );

  const after = useCallback(
    async (res: Response, fallback: string): Promise<Result> => {
      if (res.ok) {
        await load();
        void track?.();
        return { ok: true };
      }
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: j?.error ?? fallback };
    },
    [load, track],
  );
  const json = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const value = useMemo<Ctx>(() => {
    const db = () => supabase();
    const done = async (error: { message: string } | null): Promise<Result> => {
      if (error) return fail(error.message);
      await load();
      void track?.();
      return { ok: true };
    };
    return {
      status,
      email: account.email,
      role,
      isAdmin,
      people,
      nameOf,
      folders,
      assets,
      tasks,
      folderOf,
      levelOf,
      lockedIn,
      canEdit,
      canCreate,
      canManage,
      transfers,
      reload: load,
      say,

      async upload(files, folderId) {
        for (const file of files) {
          const key = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
          const patch = (p: Partial<Transfer>) => setTransfers((all) => all.map((t) => (t.key === key ? { ...t, ...p } : t)));
          setTransfers((all) => [...all, { key, name: file.name, progress: 0 }]);
          try {
            await uploadNewAsset(file, folderId, (progress) => patch({ progress }));
            setTransfers((all) => all.filter((t) => t.key !== key));
            say(`رُفع «${file.name}» إلى Google Drive.`);
            await load();
          } catch (e) {
            patch({ error: e instanceof Error ? e.message : 'تعذّر الرفع.' });
          }
        }
      },
      async uploadVersion(assetId, file, note) {
        try {
          await uploadNewVersion(assetId, file, note, () => {});
          await load();
          return { ok: true };
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : 'تعذّر الرفع.' };
        }
      },
      async renameAsset(id, name) {
        return after(await fetch(`/api/media/${id}`, json('PATCH', { name })), 'تعذّرت إعادة التسمية.');
      },
      async moveAssets(ids, folderId) {
        // One request, so moving several files is one action to undo.
        return after(await fetch('/api/media/move', json('POST', { ids, folderId })), 'تعذّر النقل.');
      },
      async trashAsset(id) {
        return after(await fetch(`/api/media/${id}`, { method: 'DELETE' }), 'تعذّر الحذف.');
      },
      async patchAsset(id, patch) {
        const { error } = await db().from('media_files').update(patch).eq('id', id);
        return done(error);
      },
      async createFolder(name, parentId, restricted) {
        const res = await fetch('/api/media/folders', json('POST', { name, parentId, restricted }));
        const r = await after(res.clone(), 'تعذّر إنشاء المجلد.');
        if (!r.ok) return r;
        const j = (await res.json().catch(() => null)) as { id?: string } | null;
        return { ok: true, id: j?.id };
      },
      async renameFolder(id, name) {
        return after(await fetch(`/api/media/folders/${id}`, json('PATCH', { name })), 'تعذّرت إعادة التسمية.');
      },
      async patchFolder(id, patch) {
        const { error } = await db().from('media_folders').update(patch).eq('id', id);
        return done(error);
      },
      async setGrant(folderId, type, subject, level, until) {
        if (level === null) {
          const del = await db().from('media_grants').delete().eq('folder_id', folderId).eq('subject_type', type).eq('subject', subject);
          return done(del.error);
        }
        // The uniqueness is an expression index, so update in place and insert when nothing matched.
        const upd = await db()
          .from('media_grants')
          .update(until === undefined ? { level: LEVELS[level] } : { level: LEVELS[level], expires_at: until })
          .eq('folder_id', folderId)
          .eq('subject_type', type)
          .eq('subject', subject)
          .select('id');
        if (upd.error) return done(upd.error);
        if (!upd.data?.length) {
          const ins = await db().from('media_grants').insert({ folder_id: folderId, subject_type: type, subject, level: LEVELS[level], expires_at: until ?? null });
          return done(ins.error);
        }
        await load();
        return { ok: true };
      },
      async assignTask(t) {
        const { error } = await db().from('media_tasks').insert({
          asset_id: t.assetId,
          what: t.what,
          kind: t.kind,
          assignee: t.assignee,
          assigned_by: account.email,
          due: new Date(t.due).toISOString(),
          priority: t.priority,
          note: t.note || null,
        });
        return done(error);
      },
      async completeTask(id) {
        const { error } = await db().from('media_tasks').update({ status: 'done' }).eq('id', id);
        return done(error);
      },
      async addNote(assetId, body, timecode) {
        const { error } = await db()
          .from('media_notes')
          .insert({ asset_id: assetId, author: account.email, body, timecode: timecode || null });
        return done(error);
      },
      async record(type, assetId) {
        await db().rpc('media_record', { p_type: type, p_asset: assetId });
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, role, isAdmin, people, nameOf, folders, assets, tasks, folderOf, levelOf, lockedIn, canEdit, canCreate, canManage, transfers, load, say, account.email, after, track]);

  return <MediaContext.Provider value={value}>{children}</MediaContext.Provider>;
}

/** The roles' display names, for the access dialog. */
export const roleName = (r: Role) => roles[r].name;
