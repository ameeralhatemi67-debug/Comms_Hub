'use client';
// Who is who, and how each person chose to appear: name, picture, headline, name
// colour, presence and mail signature. Shared by mail, messaging and the account page.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { roles, type Role } from '@/lib/domain';
import { useAccount } from '@/lib/account-context';
import { supabase } from '@/lib/supabase/client';
import { PRESENCE_AR, chatErrorText, type Presence, type ProfileRow } from '@/lib/chat/rules';

export type Person = { email: string; display_name: string; role: Role; profile: ProfileRow | null };

type Ctx = {
  people: Person[];
  personOf: (email: string) => Person | undefined;
  nameOf: (email: string) => string;
  me: Person | undefined;
  reload: () => Promise<void>;
  update: (patch: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const PeopleContext = createContext<Ctx | null>(null);
export const usePeople = () => {
  const v = useContext(PeopleContext);
  if (!v) throw Error('People provider missing');
  return v;
};
export const usePeopleOptional = () => useContext(PeopleContext);

export function PeopleProvider({ children }: { children: ReactNode }) {
  const account = useAccount();
  const [people, setPeople] = useState<Person[]>([]);

  const reload = useCallback(async () => {
    const db = supabase();
    const [p, f] = await Promise.all([db.rpc('media_people'), db.from('profiles').select('*')]);
    if (p.error) return;
    const prof = new Map(((f.data ?? []) as ProfileRow[]).map((x) => [x.email, x]));
    setPeople(
      (p.data as { email: string; display_name: string; role: Role }[]).map((x) => ({ ...x, profile: prof.get(x.email) ?? null })),
    );
  }, []);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 120_000);
    return () => clearInterval(t);
  }, [reload]);

  const value = useMemo<Ctx>(() => {
    const personOf = (email: string) => people.find((p) => p.email === email);
    return {
      people,
      personOf,
      nameOf: (email: string) => personOf(email)?.display_name ?? email.split('@')[0],
      me: personOf(account.email),
      reload,
      async update(patch) {
        const { error } = await supabase().rpc('profile_update', { p: patch });
        if (error) return { ok: false, error: chatErrorText(error.message) };
        await reload();
        return { ok: true };
      },
    };
  }, [people, account.email, reload]);

  return <PeopleContext.Provider value={value}>{children}</PeopleContext.Provider>;
}

export const presenceOf = (p: Person | undefined): Presence => p?.profile?.presence ?? 'online';
export const presenceText = (p: Person | undefined) => p?.profile?.presence_note || PRESENCE_AR[presenceOf(p)];
export const roleTitle = (p: Person | undefined) => (p ? roles[p.role]?.name ?? '' : '');

/** A person's picture, or the first letter of their name, with an optional presence dot. */
export function Face({ email, label, size = 'md', dot = false, tone = '' }: { email?: string | null; label: string; size?: 'sm' | 'md' | 'lg'; dot?: boolean; tone?: string }) {
  const ctx = usePeopleOptional();
  const p = email ? ctx?.personOf(email) : undefined;
  const pic = p?.profile?.avatar;
  return (
    <span className={`face ${size} ${tone}`} aria-hidden="true">
      {pic ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pic} alt="" />
      ) : (
        (label.trim().charAt(0) || '·')
      )}
      {dot && <i className={`pdot ${presenceOf(p)}`} />}
    </span>
  );
}
