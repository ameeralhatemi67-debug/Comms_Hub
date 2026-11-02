// Looks at the live site after a deployment of a tester's note (MVP_draft.md section 69), signed out, as nothing signed in can be
// driven from here. It reads what the site serves: the version in the page, the published privacy words, and that the database
// functions refuse a stranger. It signs in to nothing and changes nothing.
// Usage: node qa/feedback-live.cjs   (writes qa/feedback-live.json)
const fs = require('node:fs');
const path = require('node:path');
const h = require('./android-helpers.cjs');

const SITE = 'https://comms-hub-three.vercel.app';
const { check, finish } = h.record('qa/feedback-live.cjs');
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(h.root, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .map((l) => /^([A-Z0-9_]+)=(.*)$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"|"$/g, '')]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const rpc = (fn, body) => fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

(async () => {
  const want = process.argv[2];
  const page = await (await fetch(`${SITE}/`)).text();
  const build = /name="hub-build" content="([^"]*)"/.exec(page)?.[1];
  check('the page carries the deployed version', /^[0-9a-f]{7}$/.test(build ?? '') && (!want || want.startsWith(build)), build);
  check('nothing of the note is served to a stranger', !page.includes('fb-open') && !page.includes('fb-form'));
  const privacy = await (await fetch(`${SITE}/privacy.html`)).text();
  check('the privacy page says no picture is taken, in both languages', privacy.includes('There is no picture of your screen') && privacy.includes('لا تُلتقط صورة للشاشة'));
  if (url && key) {
    const submit = await rpc('feedback_submit', { p_kind: 'idea', p_page: '/', p_body: 'x' });
    check('a stranger cannot send a note', submit.status === 401 || submit.status === 403 || submit.status === 404, submit.status);
    for (const [fn, body] of [['feedback_list', { p_limit: 1 }], ['feedback_mine', { p_limit: 1 }], ['feedback_merge', { p_id: '00000000-0000-0000-0000-000000000000', p_into: null }]]) {
      const r = await rpc(fn, body);
      check(`a stranger cannot call ${fn}`, r.status === 401 || r.status === 403 || r.status === 404, r.status);
    }
    const helper = await rpc('feedback_tell', { p_author: 'x', p_body: 'x' });
    check('a stranger cannot reach a helper', helper.status === 401 || helper.status === 403 || helper.status === 404, helper.status);
  } else check('the public address and key were found in .env.local', false);
  process.exitCode = finish(path.join(__dirname, 'feedback-live.json')) ? 1 : 0;
})();
