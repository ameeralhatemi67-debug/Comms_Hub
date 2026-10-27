// The push sender against a local FCM stub, and the push routes of the built site (MVP_draft.md 64.3).
//
//   npm run build
//   node qa/push-flush.cjs            (writes qa/push-flush.json)
//
// Part 1, the sender. The real flush (src/lib/push/flush.ts, payload.ts, fcm.ts) runs against
//   - a stub of Google on 127.0.0.1: a token endpoint that verifies the RS256 assertion with the
//     public half of a key pair made in this run, and a messages:send endpoint that records every
//     message and answers UNREGISTERED for one token and UNAVAILABLE once for another;
//   - a stand-in for the database that keeps the outbox as push_claim and push_report do
//     (supabase/tests/push_rules.sql holds the real functions to the same contract).
//   The stub must receive exactly the expected messages: data-only, no message text, no query string.
// Part 2, the routes. `next start` on port 3101 (never 3000 to 3002, which another session uses), with
//   WHATSAPP_SERVER_KEY and MAIL_SERVER_KEY set to random values made in memory for this run. The
//   database holds neither hash, so it refuses every key-gated call: nothing is claimed or written.
//   Signed-out only: agents never sign in, and there is no bypass.
// The key pair, the keys and the tokens exist only in this process; nothing is written but the result.
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');

if (!process.execArgv.includes('--experimental-strip-types')) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', __filename, ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const PORT = 3101;
const base = `http://127.0.0.1:${PORT}`;
// The server names itself localhost, so that is its origin (as qa/whatsapp-routes.cjs found).
const siteOrigin = `http://localhost:${PORT}`;
const result = { run: new Date().toISOString(), what: 'The push sender against a local FCM stub, and the push routes of the built site', checks: [], errors: [] };
const check = (name, pass, detail = '') => result.checks.push({ name, pass: Boolean(pass), detail: String(detail).slice(0, 400) });
const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tok = (w) => `tok_${w}_${'x'.repeat(30)}`;
const SECRET_WORD = 'سرّي';

// ---------------------------------------------------------------------------------------------
// Google, stubbed
// ---------------------------------------------------------------------------------------------
function stubGoogle(publicKey) {
  const s = { tokens: 0, issued: null, sent: [], denied: [], refuse: false, busyOnce: new Set([tok('busy')]), bad: [] };
  s.server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      const send = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      if (req.method === 'POST' && req.url === '/token') {
        const p = new URLSearchParams(body);
        const [h, c, sig] = String(p.get('assertion') ?? '').split('.');
        let ok = false;
        try {
          const head = JSON.parse(Buffer.from(h, 'base64url'));
          const claims = JSON.parse(Buffer.from(c, 'base64url'));
          const now = Math.floor(Date.now() / 1000);
          ok = p.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer' && head.alg === 'RS256'
            && crypto.createVerify('RSA-SHA256').update(`${h}.${c}`).verify(publicKey, Buffer.from(sig, 'base64url'))
            && claims.iss === 'push@comms-hub-qa.iam.gserviceaccount.com' && claims.scope === 'https://www.googleapis.com/auth/firebase.messaging'
            && claims.aud === `${s.base}/token` && claims.exp - claims.iat === 3600 && Math.abs(claims.iat - now) < 60;
        } catch {
          ok = false;
        }
        if (!ok) s.bad.push('assertion');
        if (!ok || s.refuse) return send(400, { error: 'invalid_grant' });
        s.tokens++;
        s.issued = `stub-access-${s.tokens}-${crypto.randomBytes(8).toString('hex')}`;
        return send(200, { access_token: s.issued, expires_in: 3599, token_type: 'Bearer' });
      }
      if (req.method === 'POST' && req.url === '/v1/projects/comms-hub-qa/messages:send') {
        if (req.headers.authorization !== `Bearer ${s.issued}`) {
          s.denied.push(req.url);
          return send(401, { error: { status: 'UNAUTHENTICATED' } });
        }
        const { message } = JSON.parse(body);
        s.sent.push(message);
        if (message.token === tok('gone')) return send(404, { error: { status: 'NOT_FOUND', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } });
        if (s.busyOnce.delete(message.token)) return send(503, { error: { status: 'UNAVAILABLE' } });
        return send(200, { name: `projects/comms-hub-qa/messages/${s.sent.length}` });
      }
      send(404, {});
    });
  });
  return new Promise((r) => s.server.listen(0, '127.0.0.1', () => ((s.base = `http://127.0.0.1:${s.server.address().port}`), r(s))));
}

// ---------------------------------------------------------------------------------------------
// The outbox, as push_claim and push_report keep it
// ---------------------------------------------------------------------------------------------
function fakeOutbox(rows) {
  const db = { rows: rows.map((r) => ({ ...r, state: 'queued', attempts: 0, error: null })), calls: [], gone: new Set(), lock: false, keys: new Set() };
  db.rpc = async (fn, args) => {
    db.calls.push(fn);
    db.keys.add(args.p_key);
    if (args.p_key !== 'k-qa-server') return { data: null, error: { message: 'FORBIDDEN' } };
    if (fn === 'push_flush_begin') {
      if (!db.rows.some((r) => r.state === 'queued')) return { data: { go: false, why: 'empty' }, error: null };
      if (db.lock) return { data: { go: false, why: 'busy' }, error: null };
      db.lock = true;
      return { data: { go: true }, error: null };
    }
    if (fn === 'push_flush_end') return ((db.lock = false), { data: null, error: null });
    if (fn === 'push_claim') {
      const out = [];
      for (const r of db.rows.filter((x) => x.state === 'queued').slice(0, args.p_limit)) {
        if (db.gone.has(r.token)) {
          r.state = 'failed';
          r.error = 'DEVICE_GONE';
          continue;
        }
        r.state = 'sending';
        r.attempts++;
        out.push({ id: r.id, token: r.token, kind: r.kind, tier: r.tier, notice: r.notice, title: r.title, body: r.body, go: r.go, tag: r.tag });
      }
      return { data: out, error: null };
    }
    if (fn === 'push_report') {
      let n = 0;
      for (const p of args.p) {
        const r = db.rows.find((x) => x.id === p.id && x.state === 'sending');
        if (!r) continue;
        n++;
        if (p.ok) r.state = 'sent';
        else if (p.error === 'TOKEN_GONE') {
          r.state = 'failed';
          r.error = p.error;
          db.gone.add(r.token);
        } else if (p.error === 'RETRY' && r.attempts < 5) {
          r.state = 'queued';
          r.error = p.error;
        } else {
          r.state = 'failed';
          r.error = p.error;
        }
      }
      return { data: n, error: null };
    }
    return { data: null, error: { message: 'UNKNOWN' } };
  };
  return db;
}

const notice = (n, token, tier, body) => ({ id: U(n), token, kind: 'notice', tier, notice: U(900 + n), title: '', body, go: `/n/notice/${U(900 + n)}`, tag: `notice:${U(900 + n)}:${tier}` });
const chat = (n, token, tier, body, kind = 'chat') => ({ id: U(n), token, kind, tier, notice: null, title: '', body, go: `/n/${kind}/${U(500 + n)}`, tag: `${kind}:${U(500 + n)}:${tier}` });

async function partSender() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const SA = JSON.stringify({ type: 'service_account', project_id: 'comms-hub-qa', private_key_id: 'cd'.repeat(20), private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), client_email: 'push@comms-hub-qa.iam.gserviceaccount.com' });
  const g = await stubGoogle(publicKey);
  try {
    const { flushPush } = await import(pathToFileURL(path.join(root, 'src/lib/push/flush.ts')).href);
    const { tokenCache } = await import(pathToFileURL(path.join(root, 'src/lib/push/fcm.ts')).href);
    const endpoints = { token: `${g.base}/token`, base: g.base };
    const rows = [
      notice(1, tok('m1'), 'decide', 'اعتمد المنشور «حملة الخريف».'),
      notice(2, tok('m2'), 'decide', 'لديك إشعار جديد في المركز.'),
      chat(3, tok('a'), 'attention', 'رسالة جديدة من Dir'),
      chat(4, tok('b'), 'decide', 'رسالة جديدة من Asst', 'mail'),
      chat(5, tok('gone'), 'attention', 'رسالة جديدة من Dir'),
      notice(6, tok('busy'), 'attention', 'موعد التسليم غداً.'),
      chat(7, tok('c'), 'attention', `${SECRET_WORD}: موعد الحملة غداً`),
      { ...notice(8, tok('d'), 'decide', 'نص'), go: `/n/notice/${U(908)}?token=1` },
    ];

    // No credential yet: nothing is claimed and Google is not asked.
    const empty = fakeOutbox(rows);
    const r0 = await flushPush({ rpc: empty.rpc, key: 'k-qa-server', credential: async () => null, endpoints, cache: tokenCache() });
    check('no credential yet: nothing claimed, Google not asked, rows wait', r0.state === 'not-configured' && !empty.calls.includes('push_claim') && g.tokens === 0 && empty.rows.every((r) => r.state === 'queued'), JSON.stringify(r0));

    // A credential Google refuses: nothing is claimed either, and the health says so.
    g.refuse = true;
    const health = [];
    const refused = fakeOutbox(rows);
    const r1 = await flushPush({ rpc: refused.rpc, key: 'k-qa-server', credential: async () => SA, endpoints, cache: tokenCache(), health: async (ok, e) => void health.push([ok, e]) });
    check('a refused credential: nothing claimed, the health recorded as refused', r1.state === 'credential' && !refused.calls.includes('push_claim') && JSON.stringify(health) === '[[false,"TOKEN_REFUSED"]]' && g.sent.length === 0, JSON.stringify(r1));
    g.refuse = false;

    // The real run.
    const db = fakeOutbox(rows);
    const cache = tokenCache();
    let reads = 0;
    const credential = async () => (reads++, SA);
    const f1 = await flushPush({ rpc: db.rpc, key: 'k-qa-server', credential, endpoints, cache });
    check('the first flush: five sent, one invalid token, one to try again, one refused before sending', f1.state === 'done' && f1.sent === 5 && f1.gone === 1 && f1.retry === 1 && f1.failed === 1 && f1.rounds === 1, JSON.stringify(f1));
    check('the assertion was signed by the service account and verified with its public key', g.tokens === 1 && g.bad.length === 0, `tokens ${g.tokens}, bad ${g.bad.length}`);
    check('every send carried the access token Google issued', g.denied.length === 0, g.denied.join(','));
    const byToken = Object.fromEntries(g.sent.map((m) => [m.token, m]));
    check('the stub received exactly the seven sendable items, the one with a query string never left', g.sent.length === 7 && !byToken[tok('d')], g.sent.map((m) => m.token.split('_')[1]).join(','));
    const expected = {
      [tok('m1')]: { token: tok('m1'), data: { v: '1', kind: 'notice', id: U(901), tier: 'decide', go: `/n/notice/${U(901)}`, tag: `notice:${U(901)}:decide`, title: 'يحتاج قرارك', body: 'اعتمد المنشور «حملة الخريف».' }, android: { priority: 'HIGH', ttl: '86400s' } },
      [tok('m2')]: { token: tok('m2'), data: { v: '1', kind: 'notice', id: U(902), tier: 'decide', go: `/n/notice/${U(902)}`, tag: `notice:${U(902)}:decide`, title: 'يحتاج قرارك', body: 'لديك إشعار جديد في المركز.' }, android: { priority: 'HIGH', ttl: '86400s' } },
      [tok('a')]: { token: tok('a'), data: { v: '1', kind: 'chat', id: '', tier: 'attention', go: `/n/chat/${U(503)}`, tag: `chat:${U(503)}:attention`, title: 'المراسلة', body: 'رسالة جديدة من Dir' }, android: { priority: 'NORMAL', ttl: '86400s' } },
      [tok('b')]: { token: tok('b'), data: { v: '1', kind: 'mail', id: '', tier: 'decide', go: `/n/mail/${U(504)}`, tag: `mail:${U(504)}:decide`, title: 'البريد', body: 'رسالة جديدة من Asst' }, android: { priority: 'HIGH', ttl: '86400s' } },
      [tok('c')]: { token: tok('c'), data: { v: '1', kind: 'chat', id: '', tier: 'attention', go: `/n/chat/${U(507)}`, tag: `chat:${U(507)}:attention`, title: 'المراسلة', body: 'رسالة جديدة' }, android: { priority: 'NORMAL', ttl: '86400s' } },
    };
    for (const [t, want] of Object.entries(expected))
      check(`the message to ${t.split('_')[1]} is exactly as specified (data-only)`, JSON.stringify(byToken[t]) === JSON.stringify(want), JSON.stringify(byToken[t]));
    check('no message has a notification block: the application shows it itself', g.sent.every((m) => !('notification' in m) && !('notification' in (m.android ?? {}))), '');
    check('no message carries a message\'s text, even when the database handed one over', g.sent.every((m) => !JSON.stringify(m).includes(SECRET_WORD)), '');
    check('no destination has a query string or leaves the site', g.sent.every((m) => /^\/n\/(notice|chat|mail)\/[0-9a-f-]{36}$/.test(m.data.go)), g.sent.map((m) => m.data.go).join(' '));
    check('every data value is a string, under the 4096-byte limit', g.sent.every((m) => Object.values(m.data).every((x) => typeof x === 'string') && Buffer.byteLength(JSON.stringify(m)) < 4096), '');
    const st = Object.fromEntries(db.rows.map((r) => [r.id, `${r.state}${r.error ? `:${r.error}` : ''}`]));
    check('the reports: sent, the invalid token, the row to try again, the refused row', st[U(1)] === 'sent' && st[U(2)] === 'sent' && st[U(3)] === 'sent' && st[U(4)] === 'sent' && st[U(7)] === 'sent'
      && st[U(5)] === 'failed:TOKEN_GONE' && st[U(6)] === 'queued:RETRY' && st[U(8)] === 'failed:BAD_PAYLOAD', JSON.stringify(st));
    check('every database call carried the server key, and the turn was given back', [...db.keys].join() === 'k-qa-server' && db.calls[0] === 'push_flush_begin' && db.calls.at(-1) === 'push_flush_end' && !db.lock, db.calls.join(','));

    // The second flush: the row that waited goes, with the same access token, and the vault is not read again.
    const before = g.sent.length;
    const f2 = await flushPush({ rpc: db.rpc, key: 'k-qa-server', credential, endpoints, cache });
    check('the second flush sends the row that waited, once', f2.sent === 1 && g.sent.length === before + 1 && g.sent.at(-1).token === tok('busy') && db.rows.find((r) => r.id === U(6)).state === 'sent', JSON.stringify(f2));
    check('the access token was reused: one token request and one vault read for both flushes', g.tokens === 1 && reads === 1, `tokens ${g.tokens}, reads ${reads}`);
    // Nothing waits: the flush answers at once.
    const calls = db.calls.length;
    const f3 = await flushPush({ rpc: db.rpc, key: 'k-qa-server', credential, endpoints, cache });
    check('nothing waits: the third flush answers at once, one database call, nothing sent', f3.state === 'empty' && db.calls.length === calls + 1 && g.sent.length === before + 1, JSON.stringify(f3));
    // A wrong server key: refused by the database stand-in, as the real functions refuse it.
    const f4 = await flushPush({ rpc: db.rpc, key: 'wrong', credential, endpoints, cache });
    check('a wrong server key is refused before anything is claimed', f4.state === 'refused', JSON.stringify(f4));
    result.sender = { messages: g.sent.length, tokenRequests: g.tokens, flushes: [f1, f2, f3] };
  } finally {
    g.server.close();
  }
}

// ---------------------------------------------------------------------------------------------
// The routes of the built site
// ---------------------------------------------------------------------------------------------
async function waitUp() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${base}/health`);
      if (r.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function partRoutes() {
  const KEY = crypto.randomBytes(32).toString('hex');
  const server = spawn(process.execPath, [path.join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '--hostname', '127.0.0.1', '--port', String(PORT)], {
    cwd: root,
    env: { ...process.env, WHATSAPP_SERVER_KEY: KEY, MAIL_SERVER_KEY: crypto.randomBytes(32).toString('hex'), MAIL_SITE_URL: base },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  server.stdout.on('data', (d) => (log += d));
  server.stderr.on('data', (d) => (log += d));
  try {
    check('the built site starts on port 3101', await waitUp(), log.slice(-300));
    const post = (p, headers = {}) => fetch(base + p, { method: 'POST', headers, redirect: 'manual' });
    let r = await post('/api/push/flush');
    check('flush: from outside the site, refused (403)', r.status === 403, r.status);
    r = await post('/api/push/flush', { Origin: siteOrigin });
    check('flush: from the site but signed out, refused (401)', r.status === 401, r.status);
    r = await post('/api/push/flush', { Authorization: `Bearer ${crypto.randomBytes(32).toString('hex')}` });
    check('flush: a wrong bridge key, refused (401)', r.status === 401, r.status);
    r = await post('/api/push/flush', { Authorization: `Bearer ${KEY}` });
    const j = await r.json().catch(() => null);
    check('flush: the bridge key opens it, and the database refuses a server key whose hash it does not hold', r.status === 502 && j?.state === 'refused' && j.sent === 0, `${r.status} ${JSON.stringify(j)}`);
    check('flush: the answer is counts only', j && Object.keys(j).sort().join() === 'failed,gone,retry,rounds,sent,state', JSON.stringify(j));
    r = await fetch(`${base}/api/push/flush`, { method: 'GET' });
    check('flush: GET is not a door', r.status === 405, r.status);
    r = await post('/api/push/credential', { 'Content-Type': 'application/json' });
    check('credential: from outside the site, refused (403)', r.status === 403, r.status);
    r = await fetch(`${base}/api/push/credential`, { method: 'POST', headers: { Origin: siteOrigin, 'Content-Type': 'application/json' }, body: JSON.stringify({ json: '{}' }), redirect: 'manual' });
    check('credential: signed out, refused (401)', r.status === 401, r.status);
    const loc = async (p) => {
      const x = await fetch(base + p, { redirect: 'manual' });
      return `${x.status} ${x.headers.get('location')}`;
    };
    check('a tapped chat notice opens the conversation', (await loc(`/n/chat/${U(42)}`)) === `303 /mail/chat?room=${U(42)}`, await loc(`/n/chat/${U(42)}`));
    check('a tapped mail notice opens the thread', (await loc(`/n/mail/${U(43)}`)) === `303 /mail?thread=${U(43)}`, await loc(`/n/mail/${U(43)}`));
    check('a notice, signed out, finds nothing and goes home', (await loc(`/n/notice/${U(44)}`)) === '303 /', await loc(`/n/notice/${U(44)}`));
    check('anything else goes home', (await loc(`/n/work/${U(45)}`)) === '303 /' && (await loc('/n/chat/not-an-id')) === '303 /', `${await loc(`/n/work/${U(45)}`)} ${await loc('/n/chat/not-an-id')}`);
    check('the server printed no key, token or secret', !log.includes(KEY) && !/stub-access|PRIVATE KEY/.test(log), '');
  } finally {
    server.kill();
  }
}

(async () => {
  try {
    await partSender();
  } catch (e) {
    result.errors.push(`sender: ${e && e.message}`);
  }
  try {
    await partRoutes();
  } catch (e) {
    result.errors.push(`routes: ${e && e.message}`);
  }
  const passed = result.checks.filter((c) => c.pass).length;
  result.total = result.checks.length;
  result.passed = passed;
  fs.writeFileSync(path.join(__dirname, 'push-flush.json'), `${JSON.stringify(result, null, 2)}\n`);
  for (const c of result.checks) if (!c.pass) console.log('FAIL', c.name, c.detail);
  console.log(`push-flush: ${passed} of ${result.total}${result.errors.length ? `, errors: ${result.errors.join('; ')}` : ''}`);
  process.exit(passed === result.total && !result.errors.length ? 0 : 1);
})();
