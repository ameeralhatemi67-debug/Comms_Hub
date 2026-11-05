'use client';
// The window's own state, shared by its parts (MVP_draft.md 74). Kept by the window's root, so
// it survives a change of size and of conversation.
import { createContext, useContext } from 'react';
import type { Urgency } from '@/lib/chat/rules';
import type { FolderId } from '@/lib/mail/rules';
import type { Dest, SizeName, Tier } from '@/lib/chat-window/rules';
import type { Geometry } from './geometry';
import type { FileLite } from '../mail/provider';

/** What the message box holds while the window is open, kept across sizes and conversations. */
export type BoxDraft = { text: string; dest: Dest | null; to: string[]; cc: string[]; subject: string; urgency: Urgency; files: FileLite[] };
export const EMPTY_BOX: BoxDraft = { text: '', dest: null, to: [], cc: [], subject: '', urgency: 0, files: [] };

export type WinState = {
  geo: Geometry;
  width: number;
  max: number;
  size: SizeName;
  tier: Tier;
  setSize: (s: { w: number; full: boolean }) => void;
  mode: 'chat' | 'mail';
  setMode: (m: 'chat' | 'mail') => void;
  room: string | null;
  openRoom: (id: string | null) => void;
  /** A work's conversation not started yet, or «العام» before its first message. */
  pending: { k: 'work'; id: string; title: string } | { k: 'all' } | null;
  openPending: (p: WinState['pending']) => void;
  thread: string | null;
  openThread: (id: string | null) => void;
  folder: FolderId;
  setFolder: (f: FolderId) => void;
  box: BoxDraft;
  setBox: (p: Partial<BoxDraft> | ((b: BoxDraft) => Partial<BoxDraft>)) => void;
  globalOk: boolean;
  setGlobalOk: (v: boolean) => void;
  pageWork: string | null;
  focusBox: { current: (() => void) | null };
  minimize: () => void;
  toMailPage: () => void;
};

export const WinContext = createContext<WinState | null>(null);
export function useWin() {
  const v = useContext(WinContext);
  if (!v) throw Error('Chat window state missing');
  return v;
}

