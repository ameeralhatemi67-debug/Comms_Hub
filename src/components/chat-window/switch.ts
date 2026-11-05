'use client';
// The account's switch for the experimental mail and messaging window (MVP_draft.md 74):
// profiles.chat_window, off by default, changed only through profile_update
// (supabase/migrations/*chat_window*). One store per tab, so the account page and the
// window agree at once. Until the column exists, the switch reads off.
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

type State = { on: boolean; loaded: boolean; error: string };
let state: State = { on: false, loaded: false, error: '' };
let loadedFor = '';
const subs = new Set<(s: State) => void>();

function emit(next: State) {
  state = next;
  for (const f of subs) f(state);
}

async function load(email: string) {
  loadedFor = email;
  const { data, error } = await supabase().from('profiles').select('chat_window').eq('email', email).maybeSingle();
  if (loadedFor !== email) return;
  emit({ on: !error && !!(data as { chat_window?: boolean } | null)?.chat_window, loaded: true, error: '' });
}

export function useChatWindowSwitch(email: string) {
  const [s, setS] = useState<State>(state);
  useEffect(() => {
    subs.add(setS);
    setS(state);
    if (email && loadedFor !== email) void load(email);
    return () => {
      subs.delete(setS);
    };
  }, [email]);
  return {
    ...s,
    async set(on: boolean) {
      emit({ ...state, on, error: '' });
      const { error } = await supabase().rpc('profile_update', { p: { chat_window: on } });
      if (error) {
        emit({ ...state, on: !on, error: 'تعذّر حفظ الإعداد. أعد المحاولة.' });
        return false;
      }
      return true;
    },
  };
}
