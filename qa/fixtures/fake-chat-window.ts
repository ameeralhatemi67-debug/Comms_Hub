// Stand-ins for qa/chat-window-flow.cjs: the window, the messaging tab's conversation, the mail reader and the providers are
// the real components; the database, the account, the store, the capabilities and file uploads are these. The database's
// own rules (who is in «العام», who may start a work's conversation, the account switch) are held by
// supabase/tests/chat_window_rules.sql. Every call is kept on window.__calls, so the check reads what the page would send.
type Row = Record<string, unknown>;
type Call = { fn: string; args: Record<string, unknown> };
const w = window as unknown as { __calls: Call[]; __db: Record<string, Row[]>; __kicks: number; __on: boolean };
const params = new URLSearchParams(location.search);
export const ME = 'dir@t.test';
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

const people = [
  { email: ME, display_name: 'ريم السالم', role: 'director' },
  { email: 'sara@t.test', display_name: 'سارة القحطاني', role: 'writer' },
  { email: 'khalid@t.test', display_name: 'خالد المطيري', role: 'assistant' },
  { email: 'fahad@t.test', display_name: 'فهد الدوسري', role: 'producer' },
  { email: 'lama@t.test', display_name: 'لمى العنزي', role: 'member' },
];
const profile = (email: string, over: Row = {}) => ({
  email, avatar: null, headline: null, color: null, presence: 'online', presence_note: null, signature: null, enter_sends: true, chat_window: false, updated_at: ago(100), ...over,
});
const room = (id: string, type: string, name: string | null, over: Row = {}) => ({
  id, type, name, description: null, link: null, dm_key: null, pinned_message: null, created_by: ME, created_at: ago(600), last_at: ago(5), ...over,
});
const member = (room_id: string, email: string, read = 0) => ({ room_id, email, admin: email === ME, joined_at: ago(600), last_read_at: ago(read), muted: false, pinned: false });
const msg = (id: string, room_id: string, author: string, body: string, min: number, over: Row = {}) => ({
  id, room_id, author, kind: 'text', body, reply_to: null, forwarded: false, urgency: 0, data: null, deleted: false, edited_at: null, created_at: ago(min), ...over,
});
const mailMsg = (id: string, thread_id: string, author: string | null, body: string, min: number, over: Row = {}) => ({
  id, thread_id, kind: 'mail', author, from_name: null, from_email: null, to_list: [`p:${ME}`], cc_list: [], bcc_list: [], body, created_at: ago(min),
  send_at: null, state: 'sent', hold_by: null, hold_note: null, ext_sent_at: null, error: null, refs: [], files: [], inbound_files: [], card: null, ...over,
});
const thread = (id: string, kind: string, subject: string, min: number, over: Row = {}) => ({
  id, kind, subject, created_by: ME, created_at: ago(min), last_at: ago(min), labels: [], links: [], contact_email: null, contact_name: null,
  ext_status: kind === 'external' ? 'assigned' : null, assignee: null, reply_by: null, req_no: null, ...over,
});
const mailMember = (thread_id: string, email: string, read: string | null) => ({
  thread_id, email, participant: true, read_at: read, starred: false, archived: false, trashed: false, muted: false, snooze_until: null,
});

function seed(): Record<string, Row[]> {
  return {
    accounts: people,
    profiles: [
      profile(ME, { chat_window: !params.has('off') }),
      profile('sara@t.test'),
      profile('khalid@t.test', { presence: 'busy' }),
      profile('fahad@t.test'),
      profile('lama@t.test', { presence: 'dnd' }),
    ],
    chat_rooms: [
      room('r-design', 'group', 'فريق التصميم', { last_at: ago(20) }),
      room('r-sara', 'dm', null, { dm_key: `${ME}|sara@t.test`, last_at: ago(8) }),
      room('r-news', 'channel', 'إعلانات الإدارة', { last_at: ago(300) }),
    ],
    chat_members: [
      member('r-design', ME, 30), member('r-design', 'sara@t.test'), member('r-design', 'fahad@t.test'),
      member('r-sara', ME, 30), member('r-sara', 'sara@t.test'),
      member('r-news', ME), member('r-news', 'khalid@t.test'), member('r-news', 'sara@t.test'), member('r-news', 'lama@t.test'),
    ],
    chat_messages: [
      msg('m1', 'r-design', 'fahad@t.test', 'المقترح الثاني لمنشور الحملة في المكتبة.', 25),
      msg('m2', 'r-design', 'sara@t.test', '@ريم السالم هل نعتمد الخلفية الخضراء؟', 20),
      msg('m3', 'r-sara', 'sara@t.test', 'أرسلت النسخة 3 من النص.', 8),
      msg('m4', 'r-news', 'khalid@t.test', 'تبدأ إجازة اليوم الوطني يوم الثلاثاء.', 300, { urgency: 2 }),
    ],
    chat_reactions: [],
    chat_votes: [],
    chat_acks: [],
    chat_stars: [],
    media_files: [],
    whatsapp_outbox: [],
    system_whatsapp: [{ id: 1, enabled: false }],
    mail_threads: [
      thread('t-int', 'internal', 'موعد اعتماد نص الفيلم', 40, { created_by: 'khalid@t.test' }),
      thread('t-ext', 'external', 'طلب تغطية: افتتاح مركز الابتكار', 70, { contact_email: 'pr@amanah.example.org', contact_name: 'العلاقات العامة', assignee: ME, ext_status: 'assigned' }),
    ],
    mail_messages: [
      mailMsg('x1', 't-int', 'khalid@t.test', 'أقترح أن نراجع النسخة 3 قبل الظهر.', 40, { to_list: [`p:${ME}`, 'p:sara@t.test'] }),
      mailMsg('x2', 't-ext', null, 'نرجو تغطية حفل الافتتاح يوم الأحد.', 70, { from_name: 'العلاقات العامة', from_email: 'pr@amanah.example.org', to_list: [] }),
    ],
    mail_members: [mailMember('t-int', ME, null), mailMember('t-int', 'khalid@t.test', ago(40)), mailMember('t-ext', ME, ago(60))],
    mail_settings: [{ paused: false, sla_hours: 8, sync_at: null }],
    mail_rules: [],
    works: [
      { id: 'CH-241', title: 'فيلم اليوم الوطني القصير', status: 'IN_REVIEW', assignee: 'sara@t.test', created_by: ME, people: [], closed_at: null, updated_at: ago(30) },
      { id: 'CH-238', title: 'حملة التبرع بالدم', status: 'IN_PRODUCTION', assignee: 'fahad@t.test', created_by: ME, people: [], closed_at: null, updated_at: ago(90) },
    ],
    work_stages: [{ work_id: 'CH-241', who: 'khalid@t.test' }],
  };
}

const KEY = 'chat-window-fixture-db';
w.__calls = [];
w.__kicks = 0;
w.__db = (() => {
  try {
    const s = sessionStorage.getItem(KEY);
    if (s && !params.has('fresh')) return JSON.parse(s) as Record<string, Row[]>;
  } catch {
    /* fall through */
  }
  return seed();
})();
const save = () => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(w.__db));
  } catch {
    /* the fixture still works for this page */
  }
};
save();
const db = w.__db;
let seq = 1;
const id = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;
const roomOf = (rid: unknown) => db.chat_rooms.find((r) => r.id === rid);
const addMember = (rid: string, email: string) => {
  if (!db.chat_members.some((m) => m.room_id === rid && m.email === email)) db.chat_members.push(member(rid, email));
};

function rpc(fn: string, args: Record<string, unknown>): { data: unknown; error: { message: string } | null } {
  w.__calls.push({ fn, args });
  const ok = (data: unknown = null) => ({ data, error: null });
  switch (fn) {
    case 'media_people':
      return ok(people);
    case 'wa_people':
      return ok([]);
    case 'mail_visible_files':
      return ok([]);
    case 'profile_update': {
      const p = args.p as Row;
      const mine = db.profiles.find((x) => x.email === ME)!;
      Object.assign(mine, p);
      return ok();
    }
    case 'chat_state':
      return ok();
    case 'chat_open_dm': {
      const other = String(args.p_email);
      const key = [ME, other].sort().join('|');
      let r = db.chat_rooms.find((x) => x.dm_key === key);
      if (!r) {
        r = room(id('dm'), 'dm', null, { dm_key: key });
        db.chat_rooms.push(r);
        addMember(String(r.id), ME);
        addMember(String(r.id), other);
      }
      return ok(r.id);
    }
    case 'chat_global_room': {
      let r = db.chat_rooms.find((x) => (x.link as Row | null)?.type === 'all');
      if (!r) {
        r = room('r-all', 'group', 'العام', { link: { type: 'all' } });
        db.chat_rooms.push(r);
        db.chat_messages.push(msg(id('sys'), 'r-all', ME, '', 0, { kind: 'sys', data: { e: 'created', type: 'all' } }));
      }
      for (const p of people) addMember('r-all', p.email);
      return ok(r.id);
    }
    case 'chat_work_room': {
      const work = db.works.find((x) => x.id === args.p_work);
      if (!work) return { data: null, error: { message: 'FORBIDDEN' } };
      let r = db.chat_rooms.find((x) => (x.link as Row | null)?.type === 'work' && (x.link as Row).id === work.id && (x.link as Row).auto);
      if (!r) {
        r = room(`r-${work.id}`, 'group', String(work.title), { link: { type: 'work', id: work.id, title: work.title, auto: true } });
        db.chat_rooms.push(r);
        db.chat_messages.push(msg(id('sys'), String(r.id), ME, '', 0, { kind: 'sys', data: { e: 'created', type: 'work' } }));
      }
      const who = [ME, work.assignee, work.created_by, ...db.work_stages.filter((s) => s.work_id === work.id).map((s) => s.who), 'khalid@t.test'];
      for (const e of who) if (e) addMember(String(r.id), String(e));
      return ok(r.id);
    }
    case 'chat_send': {
      const r = roomOf(args.p_room);
      if (!r || !db.chat_members.some((m) => m.room_id === r.id && m.email === ME)) return { data: null, error: { message: 'FORBIDDEN' } };
      if (r.type === 'channel' && !db.chat_members.some((m) => m.room_id === r.id && m.email === ME && m.admin)) return { data: null, error: { message: 'CHANNEL_POST' } };
      const mid = id('m');
      db.chat_messages.push(msg(mid, String(r.id), ME, String(args.p_body ?? ''), 0, { kind: args.p_kind, data: args.p_data ?? null, urgency: args.p_urgency ?? 0, reply_to: args.p_reply ?? null }));
      r.last_at = new Date().toISOString();
      return ok(mid);
    }
    case 'chat_edit':
      return ok();
    case 'mail_state': {
      const patch = args.p_patch as Row;
      for (const t of args.p_threads as string[]) {
        const mm = db.mail_members.find((x) => x.thread_id === t && x.email === ME);
        if (mm && patch.read) mm.read_at = new Date().toISOString();
      }
      return ok();
    }
    case 'mail_send': {
      const tid = (args.p_thread as string | null) ?? id('t');
      if (!args.p_thread) {
        db.mail_threads.unshift(thread(tid, (args.p_to as string[]).some((x) => x.startsWith('e:')) ? 'external' : 'internal', String(args.p_subject), 0));
        db.mail_members.push(mailMember(tid, ME, new Date().toISOString()));
      }
      db.mail_messages.push(mailMsg(id('x'), tid, ME, String(args.p_body), 0, { to_list: args.p_to, cc_list: args.p_cc }));
      return ok({ state: 'sent', thread: tid });
    }
    case 'mail_note':
      return ok();
    default:
      return ok();
  }
}

type Filter = (r: Row) => boolean;
class Query implements PromiseLike<{ data: unknown; error: null }> {
  private filters: Filter[] = [];
  private sortBy: { col: string; asc: boolean } | null = null;
  private max = Infinity;
  private one = false;
  constructor(private table: string) {}
  select() {
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  is(col: string, v: unknown) {
    this.filters.push((r) => (r[col] ?? null) === v);
    return this;
  }
  or(expr: string) {
    const parts = expr.split(/,(?![^{]*\})/).map((p) => {
      const [col, op, ...rest] = p.split('.');
      const val = rest.join('.').replace(/^\{|\}$/g, '').replace(/"/g, '');
      return (r: Row) => (op === 'cs' ? Array.isArray(r[col]) && (r[col] as unknown[]).includes(val) : r[col] === val);
    });
    this.filters.push((r) => parts.some((f) => f(r)));
    return this;
  }
  order(col: string, o?: { ascending?: boolean }) {
    this.sortBy = { col, asc: o?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.one = true;
    return this;
  }
  single() {
    this.one = true;
    return this;
  }
  private run() {
    let rows = (db[this.table] ?? []).filter((r) => this.filters.every((f) => f(r)));
    if (this.table === 'chat_rooms') rows = rows.filter((r) => db.chat_members.some((m) => m.room_id === r.id && m.email === ME));
    if (this.sortBy) {
      const { col, asc } = this.sortBy;
      rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
    }
    rows = rows.slice(0, this.max).map((r) => JSON.parse(JSON.stringify(r)) as Row);
    return { data: this.one ? (rows[0] ?? null) : rows, error: null as null };
  }
  then<A, B>(ok?: ((v: { data: unknown; error: null }) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}

const channel = () => {
  const ch = { on: () => ch, subscribe: () => ch, send: async () => 'ok' };
  return ch;
};

export function supabase() {
  return {
    from: (t: string) => new Query(t),
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      const r = rpc(fn, args);
      save();
      return r;
    },
    channel,
    removeChannel: async () => 'ok',
  };
}

// Stable, as the real store's are: a new dispatch on every render would make the mail provider send at once.
const hubState = { role: 'director' };
const dispatch = (a: { type: string; text?: string }) => {
  if (a.type === 'notify') ((window as unknown as { __said: string[] }).__said ??= []).push(a.text ?? '');
};
const hub = { state: hubState, dispatch };
export const useHub = () => hub;
const account = { email: ME, name: 'ريم السالم', role: 'director', pages: ['mail', 'work'], caps: [] };
export const useAccount = () => account;
const caps = { ready: true, has: () => true, evals: [], grants: [], evalOf: () => undefined, reload: async () => undefined };
export const useCaps = () => caps;
export function kickPush(): void {
  w.__kicks += 1;
}
export type UploadedFile = { id: string; name: string; mime_type: string; size_bytes: number };
export async function uploadAttachment(file: File, onProgress: (f: number) => void): Promise<UploadedFile> {
  onProgress(1);
  return { id: id('f'), name: file.name, mime_type: file.type, size_bytes: file.size };
}
