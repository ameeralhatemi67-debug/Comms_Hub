// One sync of the department mailbox: read new mail into the Hub, then send what is
// due. Runs when someone opens the mail page (and every minute while it is open);
// there is no background worker in Version 0. The database hands out one turn at a
// time, so two open pages never send the same message twice.
import type { SupabaseClient } from '@supabase/supabase-js';
import { storageConfigured, storageFor } from '../storage';
import { fetchSince, mailboxConfigured, readMailEnv, sendOutgoing, type Outgoing } from './gmail';

/** Gmail refuses messages over 25 MB; larger approved files go as review links instead. */
const ATTACH_LIMIT = 25 * 1024 * 1024;

async function driveBytes(id: string): Promise<Buffer> {
  const res = await storageFor('mail').open(id);
  if (!res.ok) throw new Error(`DRIVE_${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export type SyncResult =
  | { configured: false }
  | { configured: true; skipped: true }
  | { configured: true; skipped: false; received: number; sent: number; failed: number };

export async function runSync(supabase: SupabaseClient, site: string, force: boolean): Promise<SyncResult> {
  const env = readMailEnv();
  if (!mailboxConfigured(env)) return { configured: false };

  const begin = await supabase.rpc('mail_sync_begin', { p_key: env.key, p_force: force });
  if (begin.error) throw new Error(begin.error.message);
  if (!begin.data) return { configured: true, skipped: true };
  const state = begin.data as { last_uid: number; uid_validity: number | null; paused: boolean };

  let lastUid = Number(state.last_uid);
  let validity = state.uid_validity === null ? null : Number(state.uid_validity);
  let received = 0;
  let sent = 0;
  let failed = 0;
  try {
    const got = await fetchSince(env, lastUid, validity);
    for (const m of got.messages) {
      if (m.from_email === env.address?.toLowerCase()) continue;
      const r = await supabase.rpc('mail_ingest', { p_key: env.key, p: m });
      if (r.error) throw new Error(r.error.message);
      if (r.data) received++;
    }
    lastUid = got.lastUid;
    validity = got.uidValidity;

    const out = await supabase.rpc('mail_outbox', { p_key: env.key });
    if (out.error) throw new Error(out.error.message);
    for (const item of (out.data ?? []) as Outgoing[]) {
      try {
        const attachments: { filename: string; content: Buffer; contentType: string }[] = [];
        const needsDrive = item.files.length > 0 || item.refs.some((r) => !r.link);
        if (needsDrive && !storageConfigured('mail')) throw new Error('DRIVE_NOT_CONFIGURED');
        for (const r of item.refs.filter((x) => !x.link && x.size <= ATTACH_LIMIT))
          attachments.push({ filename: r.name, content: await driveBytes(r.drive), contentType: r.mime });
        for (const f of item.files) attachments.push({ filename: f.name, content: await driveBytes(f.drive), contentType: f.mime });
        const total = attachments.reduce((n, a) => n + a.content.length, 0);
        if (total > ATTACH_LIMIT) throw new Error('ATTACHMENTS_TOO_LARGE');
        const gmailId = await sendOutgoing(env, item, attachments, site);
        await supabase.rpc('mail_mark_sent', { p_key: env.key, p_id: item.id, p_gmail_id: gmailId, p_error: null });
        sent++;
      } catch (e) {
        failed++;
        await supabase.rpc('mail_mark_sent', {
          p_key: env.key,
          p_id: item.id,
          p_gmail_id: null,
          p_error: e instanceof Error ? e.message : 'SEND_FAILED',
        });
      }
    }
  } finally {
    await supabase.rpc('mail_sync_end', { p_key: env.key, p_last_uid: lastUid, p_uid_validity: validity });
  }
  return { configured: true, skipped: false, received, sent, failed };
}
