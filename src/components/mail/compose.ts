// How a reply, a reply to all and a forward are built from a thread, and how a quick reply
// becomes an outgoing mail. Shared by the mail page and the mail and messaging window
// (MVP_draft.md 74), so both send exactly the same mail.
import { useEffect, useState } from 'react';
import { roles } from '@/lib/domain';
import { fullWhen, mails } from '@/lib/mail/rules';
import { blankDraft, type Draft } from './composer';
import type { Outgoing, useMail } from './provider';

type Mail = ReturnType<typeof useMail>;
export type Extra = Partial<Draft> & { replyTo?: string; quick?: boolean };

/** A draft for a new mail, or a reply, reply to all or forward of the thread named in `extra`. */
export function composeDraft(m: Mail, extra: Extra = {}): Draft {
  const { replyTo: _r, quick: _q, ...over } = extra;
  void _r;
  void _q;
  let d: Draft = { ...blankDraft(), ...over };
  const v = extra.thread ? m.viewOf(extra.thread) : undefined;
  if (v && extra.mode && extra.mode !== 'new') {
    const ms = mails(v);
    const src = ms.find((x) => x.id === extra.replyTo) ?? ms[ms.length - 1];
    const t = v.thread;
    if (extra.mode === 'forward') {
      const who = src.author ? m.nameOf(src.author) : src.from_name || src.from_email || '';
      d = {
        ...d,
        subject: `إعادة توجيه: ${t.subject}`,
        body: `${extra.body ?? ''}\n\n---------- رسالة محوّلة ----------\nمن: ${who}\nالتاريخ: ${fullWhen(src.created_at)}\nالموضوع: ${t.subject}\n\n${src.body}`,
        refs: src.refs,
        files: m.files.filter((f) => src.files.includes(f.id)),
      };
    } else {
      const sender = src.author ? `p:${src.author}` : null;
      const others = [...src.to_list, ...src.cc_list].filter((x) => x !== `p:${m.me}` && !x.startsWith('e:'));
      const to: string[] = t.kind === 'external' ? [] : src.author === m.me ? src.to_list : sender ? [sender] : [];
      d = {
        ...d,
        subject: t.subject.startsWith('رد: ') ? t.subject : `رد: ${t.subject}`,
        to: extra.mode === 'replyall' && t.kind === 'internal' ? [...new Set([...to, ...others])] : to,
      };
    }
  }
  return d;
}

/** The signature under a quick mail: the person's own, or their name and role. */
export function signatureOf(m: Mail, own: string | null | undefined) {
  const me = m.personOf(m.me);
  return own || `${me?.display_name ?? ''}\n${roles[m.role]?.name ?? ''}، إدارة الاتصال المؤسسي`;
}

/** A quick mail as it is sent: the draft's fields, the signature under the text, no card. */
export function quickOutgoing(d: Draft, signature: string): Outgoing {
  return {
    thread: d.thread,
    forward: d.mode === 'forward',
    subject: d.subject,
    to: d.to,
    cc: d.cc,
    bcc: d.bcc,
    body: `${d.body.trim()}\n\n${signature}`,
    refs: d.refs,
    files: d.files.map((f) => f.id),
    card: null,
    sendAt: null,
    links: [],
  };
}

/** Drafts live in this browser for now, shared by the mail page and the window. */
export function useDrafts(me: string): [Draft[], (d: Draft[]) => void] {
  const key = `comms-hub-mail-drafts:${me}`;
  const [drafts, setState] = useState<Draft[]>([]);
  useEffect(() => {
    try {
      setState(JSON.parse(localStorage.getItem(key) ?? '[]') as Draft[]);
    } catch {
      setState([]);
    }
  }, [key]);
  const set = (d: Draft[]) => {
    setState(d);
    try {
      localStorage.setItem(key, JSON.stringify(d.slice(0, 30)));
    } catch {
      /* storage unavailable: drafts stay for this visit only */
    }
  };
  return [drafts, set];
}
