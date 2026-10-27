// This phone in «أجهزتي» (MVP_draft.md 64.3; Android_Build_Plan.md A5). Inside the Android application the page
// registers the phone for the signed-in person at each opening, with the push token when notices are allowed, and
// asks whether the phone was removed from «أجهزتي»; a removed phone signs out here. The database functions are
// device_register and device_seen (supabase/migrations/*push*). The phone's id in that list is remembered on the
// phone only. Before signing out, the token is taken off, so a signed-out phone receives nothing.
import { supabase } from '@/lib/supabase/client';
import { native } from './index.ts';
import { pushToken } from './push.ts';

export const DEVICE_KEY = 'commshub.device';

const stored = (): string | null => {
  try {
    const v = localStorage.getItem(DEVICE_KEY);
    return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null;
  } catch {
    return null;
  }
};
const store = (id: string | null) => {
  try {
    if (id) localStorage.setItem(DEVICE_KEY, id);
    else localStorage.removeItem(DEVICE_KEY);
  } catch {
    // a phone that keeps nothing registers again next time, and the token finds the same row
  }
};

const inApp = () => native().platform === 'android' && !!native().version;

/** What the opening found: the phone is in the list, was removed (so it signs out), or this is not the application. */
export type DeviceAnswer = 'live' | 'removed' | 'none';

/** Registers this phone for the signed-in person, with its token when there is one. */
export async function registerPhone(token?: string | null): Promise<DeviceAnswer> {
  if (!inApp()) return 'none';
  const version = native().version!;
  const t = token === undefined ? await pushToken() : token;
  // A remembered id of another person's row is not theirs to update: the database then finds or makes this
  // person's own row for the phone.
  const { data, error } = await supabase().rpc('device_register', { p_device: stored(), p_platform: 'android', p_version: version, p_name: null, p_token: t });
  if (error) return /DEVICE_REMOVED/.test(error.message) ? 'removed' : 'none';
  const id = (data as { id?: string } | null)?.id;
  if (id) store(id);
  return 'live';
}

/** At each opening: whether this phone is still in the person's list. */
export async function phoneSeen(): Promise<DeviceAnswer> {
  const id = stored();
  if (!inApp() || !id) return 'none';
  const { data, error } = await supabase().rpc('device_seen', { p_device: id, p_version: native().version });
  if (error) return 'none';
  if (data === 'removed') return 'removed';
  if (data === 'unknown') store(null);
  return data === 'live' ? 'live' : 'none';
}

/** Signs out on this phone only, after the phone was removed from «أجهزتي» on another device. */
export async function signOutRemoved(): Promise<void> {
  store(null);
  await supabase().auth.signOut({ scope: 'local' });
}

const SIGNED_IN = 'commshub.signed-in';

/**
 * Called by the sign-in screen once a sign-in succeeded. A phone removed from «أجهزتي» while it was signed out
 * (by «الخروج من كل الأجهزة» elsewhere) then starts over in the list instead of being signed out again.
 */
export function markSignedIn(): void {
  try {
    sessionStorage.setItem(SIGNED_IN, '1');
  } catch {
    // without it, a phone removed while signed out is signed out once more and starts over at the next sign-in
  }
}

/** Whether this is the first check since a sign-in on this phone; asking clears it. */
export function justSignedIn(): boolean {
  try {
    const v = sessionStorage.getItem(SIGNED_IN) === '1';
    sessionStorage.removeItem(SIGNED_IN);
    return v;
  } catch {
    return false;
  }
}

/** This phone's remembered entry is forgotten, so the next registration finds or makes the right one. */
export function forgetPhone(): void {
  store(null);
}

/**
 * Before «الخروج من الأجهزة الأخرى» or «الخروج من كل الأجهزة»: every other phone of the person leaves «أجهزتي», so
 * its token goes with it and a signed-out phone receives nothing. This phone, when it is one, stays. Returns how
 * many were removed.
 */
export async function removeOtherPhones(): Promise<number> {
  const here = inApp() ? stored() : null;
  const { data } = await supabase().from('my_devices').select('id');
  let n = 0;
  for (const d of (data ?? []) as { id: string }[]) {
    if (d.id === here) continue;
    const { error } = await supabase().rpc('device_remove', { p_device: d.id });
    if (!error) n++;
  }
  return n;
}

/** Before any sign-out inside the application: the token is taken off so the phone receives nothing signed out. */
export async function beforeSignOut(): Promise<void> {
  if (!inApp() || !stored()) return;
  await registerPhone(null).catch(() => undefined);
}
