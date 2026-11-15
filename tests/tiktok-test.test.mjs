// «تجربة النشر» and «نشر مباشر» on TikTok (MVP_draft.md section 79): TikTok's calls against a fake API, the rules the page and the
// server share, the limits held equal to the database's, and TikTok's rules for a posting page held by the panel's source.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TT_LEVEL, ttCreator, ttDraft, ttError, ttPost, ttStatus } from '../src/lib/platforms/tiktok.ts';
import { TEST_ERROR_AR, TT_CAPTION_MAX, TT_PRIVACY_AR, TT_PRIVACY_ORDER, TT_VIDEO_MAX, directLine, ttProblem, ttTitle } from '../src/lib/platforms/test-rules.ts';

const read = (f) => readFileSync(f, 'utf8');
const MIGRATION = read('supabase/migrations/20261115120000_platform_tests_tiktok.sql');
const PANEL = read('src/components/work/tiktok-test.tsx');
const SERVER = read('src/lib/platforms/test-tiktok.ts');
const API = read('src/lib/platforms/tiktok.ts');

/** A fake TikTok: answers by path, and remembers what it was asked. */
function fake(answers) {
  const calls = [];
  const f = async (url, init) => {
    const path = new URL(url).pathname;
    calls.push({ path, auth: init.headers.Authorization, body: init.body ? JSON.parse(init.body) : null });
    const [status, body] = answers[path] ?? [404, {}];
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { f, calls };
}
const OK = { error: { code: 'ok', message: '', log_id: 'x' } };

test('the creator\'s settings are read as TikTok gives them, privacy in TikTok\'s order and nothing else', async () => {
  const { f, calls } = fake({
    '/v2/post/publish/creator_info/query/': [200, { data: { creator_nickname: 'القسم', privacy_level_options: ['SELF_ONLY', 'FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS', 'SOMETHING_NEW'], comment_disabled: true, duet_disabled: true, stitch_disabled: false, max_video_post_duration_sec: 600 }, ...OK }],
  });
  const c = await ttCreator(f, { token: 'tok' });
  assert.deepEqual(c, { nickname: 'القسم', privacy: ['friends', 'followers', 'private'], commentOff: true, duetOff: true, stitchOff: false, maxSeconds: 600 });
  assert.equal(calls[0].auth, 'Bearer tok', 'the token travels in the header');
  assert.equal(calls[0].body, null);
});

test('a draft and a post are fetched by TikTok from the address, a post carries exactly the person\'s choices', async () => {
  const { f, calls } = fake({
    '/v2/post/publish/inbox/video/init/': [200, { data: { publish_id: 'v_inbox_url~v2.123456789' }, ...OK }],
    '/v2/post/publish/video/init/': [200, { data: { publish_id: 'v_pub_url~v2.987654321' }, ...OK }],
  });
  assert.deepEqual(await ttDraft(f, { token: 't', videoUrl: 'https://hub.example.org/api/platforms/test/file/abc' }), { publish: 'v_inbox_url~v2.123456789' });
  assert.deepEqual(calls[0].body, { source_info: { source: 'PULL_FROM_URL', video_url: 'https://hub.example.org/api/platforms/test/file/abc' } }, 'a draft carries no words or privacy');
  const r = await ttPost(f, { token: 't', videoUrl: 'https://hub.example.org/x', options: { title: 'عنوان #وسم', privacy: 'private', comments: true, duet: false, stitch: false, ownBrand: true, branded: false } });
  assert.deepEqual(r, { publish: 'v_pub_url~v2.987654321' });
  assert.deepEqual(calls[1].body.post_info, { title: 'عنوان #وسم', privacy_level: 'SELF_ONLY', disable_comment: false, disable_duet: true, disable_stitch: true, brand_content_toggle: false, brand_organic_toggle: true });
  assert.deepEqual(calls[1].body.source_info, { source: 'PULL_FROM_URL', video_url: 'https://hub.example.org/x' });
  assert.deepEqual(TT_LEVEL, { public: 'PUBLIC_TO_EVERYONE', friends: 'MUTUAL_FOLLOW_FRIENDS', followers: 'FOLLOWER_OF_CREATOR', private: 'SELF_ONLY' });
});

test('TikTok\'s refusals become the site\'s codes, each with words, and a strange id is never kept', async () => {
  const cases = [
    [403, 'unaudited_client_can_only_post_to_private_accounts', 'TT_UNAUDITED'],
    [403, 'url_ownership_unverified', 'TT_URL_UNVERIFIED'],
    [403, 'privacy_level_option_mismatch', 'TT_PRIVACY_MISMATCH'],
    [403, 'spam_risk_too_many_pending_share', 'TT_PENDING_CAP'],
    [403, 'spam_risk_too_many_posts', 'TT_DAILY_CAP'],
    [403, 'reached_active_user_cap', 'TT_DAILY_CAP'],
    [403, 'spam_risk_user_banned_from_posting', 'TT_BANNED'],
    [401, 'access_token_invalid', 'TOKEN_REFUSED'],
    [401, 'scope_not_authorized', 'SCOPE_MISSING'],
    [429, 'rate_limit_exceeded', 'RATE_LIMIT'],
    [500, 'internal_error', 'PLATFORM_DOWN'],
  ];
  for (const [status, code, ours] of cases) {
    const { f } = fake({ '/v2/post/publish/video/init/': [status, { error: { code } }] });
    const r = await ttPost(f, { token: 't', videoUrl: 'https://x/y', options: { title: '', privacy: 'private', comments: false, duet: false, stitch: false, ownBrand: false, branded: false } });
    assert.equal(r.error, ours, code);
    assert.ok(r.detail.startsWith(`tiktok ${code}`), `${code}: TikTok's own code goes with it`);
    assert.ok(TEST_ERROR_AR[ours] || ['TOKEN_REFUSED', 'PLATFORM_DOWN'].includes(ours), `${ours} has words`);
  }
  assert.equal(ttError(null), 'UNREACHABLE');
  const { f } = fake({ '/v2/post/publish/inbox/video/init/': [200, { data: { publish_id: 'bad id with spaces' }, ...OK }] });
  assert.deepEqual(await ttDraft(f, { token: 't', videoUrl: 'https://x' }), { error: 'PLATFORM_ERROR' });
});

test('where an upload stands: fetching, in the inbox, published with its public id only, or failed in words', async () => {
  const at = async (data) => ttStatus(fake({ '/v2/post/publish/status/fetch/': [200, { data, ...OK }] }).f, { token: 't', publish: 'v_pub_url~v2.1' });
  assert.deepEqual(await at({ status: 'PROCESSING_DOWNLOAD' }), { state: 'processing' });
  assert.deepEqual(await at({ status: 'SEND_TO_USER_INBOX' }), { state: 'inbox' });
  // A post id is a 64-bit number: read digit for digit from the answer's text, never through a JavaScript number.
  const raw = '{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7300000000000000123]},"error":{"code":"ok"}}';
  const exact = await ttStatus(async () => new Response(raw, { status: 200 }), { token: 't', publish: 'v_pub_url~v2.1' });
  assert.deepEqual(exact, { state: 'published', post: '7300000000000000123' });
  assert.notEqual(String(JSON.parse(raw).data.publicaly_available_post_id[0]), '7300000000000000123', 'JSON.parse would have rounded it');
  assert.deepEqual(await at({ status: 'PUBLISH_COMPLETE' }), { state: 'published', post: null }, 'a private post has no public id');
  for (const [reason, ours] of [['duration_check_failed', 'TT_DURATION'], ['video_pull_failed', 'TT_PULL_FAILED'], ['file_format_check_failed', 'TT_FORMAT'], ['auth_removed', 'PERMISSION_REVOKED'], ['spam_risk_text', 'TT_TEXT_REFUSED']]) {
    assert.deepEqual(await at({ status: 'FAILED', fail_reason: reason }), { state: 'failed', reason: ours, detail: `tiktok ${reason}` }, reason);
  }
});

test('the rules the page and the server share: a video file, the creator\'s length, a chosen privacy, the commercial disclosure', () => {
  const v = { kind: 'tt_post', size: 1000, mime: 'video/mp4', caption: '', privacy: 'public' };
  assert.equal(ttProblem(v), null);
  assert.equal(ttProblem({ ...v, kind: 'tt_draft', privacy: null }), null, 'a draft has no privacy');
  assert.match(ttProblem({ ...v, privacy: null }), /اختر من يرى/, 'no privacy is chosen in advance');
  assert.match(ttProblem({ ...v, mime: 'video/webm' }), /MP4 أو MOV/);
  assert.match(ttProblem({ ...v, size: TT_VIDEO_MAX + 1 }), /100 ميغابايت/);
  assert.match(ttProblem({ ...v, seconds: 700, maxSeconds: 600 }), /10:00/);
  assert.match(ttProblem({ ...v, caption: 'x'.repeat(TT_CAPTION_MAX + 1) }), /2200/);
  assert.match(ttProblem({ ...v, commercial: true }), /علامتك التجارية/, 'the disclosure on needs one of the two');
  assert.match(ttProblem({ ...v, commercial: true, branded: true, privacy: 'private' }), /لا يكون «أنا فقط»/);
  assert.equal(ttProblem({ ...v, commercial: true, ownBrand: true, privacy: 'private' }), null, 'your own brand may be private');
  assert.equal(ttTitle('tt_draft', ''), 'تجربة مسودة في صندوق TikTok');
  assert.equal(ttTitle('tt_post', '\n <سطر> أول\nثانٍ'), 'سطر أول');
  assert.deepEqual(TT_PRIVACY_ORDER, ['public', 'friends', 'followers', 'private']);
  assert.equal(TT_PRIVACY_AR.private, 'أنا فقط');
  const row = { id: '1', title: 'x', state: 'published', video_id: null, shown_privacy: null, error: null, created_by: 'a', created_at: '', deleted_at: null };
  assert.equal(directLine({ ...row, kind: 'tt_draft', privacy: null }, 0, String), 'أُرسل مسودة إلى صندوق TikTok');
  assert.equal(directLine({ ...row, kind: 'tt_post', privacy: 'followers' }, 0, String), 'نُشر على TikTok · المتابعون');
});

test('the database holds the same limits: the two kinds, the four privacies, MP4 or MOV, 100 MB, TikTok\'s upload names', () => {
  assert.match(MIGRATION, /'tt_draft','tt_post'\)\);/);
  assert.match(MIGRATION, /when kind = 'tt_post' then privacy in \('private','public','friends','followers'\)/);
  assert.match(MIGRATION, /v_kind = 'tt_draft' and v_privacy is not null/);
  assert.match(MIGRATION, /v_mime not in \('video\/mp4','video\/quicktime'\) or v_size > 104857600/);
  assert.equal(TT_VIDEO_MAX, 104857600);
  assert.match(MIGRATION, /a\.platform in \('youtube','instagram','facebook','tiktok'\)/);
  assert.match(MIGRATION, /container_id ~ '\^\[A-Za-z0-9_\.~-\]\{6,64\}\$'/);
  assert.match(API, /\^\[A-Za-z0-9_\.~-\]\{6,64\}\$/, 'the server keeps only what the database accepts');
  // A draft never has a post id, a post may have none; any other platform still needs one.
  assert.match(MIGRATION, /\(p_video is null and not v_tiktok\)/);
  assert.match(MIGRATION, /t\.kind = 'tt_draft'\)\)/);
});

test('the panel follows TikTok\'s posting page: nickname, no privacy chosen, interactions off and greyed, disclosure, consent, preview', () => {
  assert.match(PANEL, /\/api\/platforms\/test\/creator/, 'the creator is read when the form opens');
  assert.match(PANEL, /data-tt="creator"/);
  assert.match(PANEL, /creator\.nickname/);
  assert.match(PANEL, /useState<TtPrivacy \| ''>\(''\)/, 'no privacy in advance');
  assert.match(PANEL, /<option value="" disabled>/);
  for (const k of ['comments', 'duet', 'stitch', 'commercial', 'ownBrand', 'branded']) assert.match(PANEL, new RegExp(`const \\[${k}, set\\w+\\] = useState\\(false\\)`), `${k} starts off`);
  assert.match(PANEL, /disabled=\{Boolean\(off\)\}/, 'an interaction the account turned off is greyed');
  assert.match(PANEL, /TT_MUSIC_URL/);
  assert.match(PANEL, /TT_BRANDED_URL/);
  assert.match(PANEL, /<video className="tt-preview"/);
  assert.match(PANEL, /قد يستغرق ظهور المنشور على الحساب بضع دقائق/);
  assert.match(PANEL, /data-hold=\{direct \? HOLD\.directTikTok : HOLD\.ttTestPost\}/, 'a post asks for a long press');
  assert.doesNotMatch(PANEL, /method: 'DELETE' \}\);\s*setRemoving/, 'no delete of an arrived post: TikTok has none');
});

test('the server never logs, never holds the address in a page, and refuses a delete TikTok cannot do', () => {
  for (const src of [SERVER, API]) assert.doesNotMatch(src, /console\.(log|info|warn|error)/);
  assert.match(SERVER, /return refuse\('TT_NO_DELETE'\)/);
  assert.match(SERVER, /setLink\(request, db, t\)/, 'TikTok fetches from the temporary address');
  assert.match(SERVER, /if \(!c\.privacy\.includes\(options\.privacy\)\) return giveUp\(db, id, 'TT_PRIVACY_MISMATCH'\)/, 'the privacy is checked against the creator now');
  assert.match(read('src/app/api/platforms/test/creator/route.ts'), /ttCreatorFor/);
});

test('a connection that lasts into another year says its year: TikTok\'s sign-in lasts a year', async () => {
  const { accountState } = await import('../src/lib/work/rules.ts');
  assert.equal(accountState({ active: true, authorized_until: '2027-11-15T08:00:00Z' }, '2026-11-15T09:00:00Z')[0], 'متصل حتى 15 نوفمبر 2027');
  assert.equal(accountState({ active: true, authorized_until: '2026-12-15T08:00:00Z' }, '2026-11-15T09:00:00Z')[0], 'متصل حتى 15 ديسمبر');
});

test('«إعادة ضبط» in «المنصات»: a held button for the holders, the database\'s rules, and its words', () => {
  const page = read('src/components/settings/platforms.tsx');
  assert.match(page, /act\('platform_app_reset', \{ p_key: p\.key \}/);
  assert.match(page, /data-hold=\{HOLD\.platformReset\}/);
  assert.match(page, /providerOf\(p\.key\) && p\.key !== 'youtube'/, 'not offered for YouTube, whose Google app is also Drive');
  const sql = read('supabase/migrations/20261115130000_platform_app_reset.sql');
  assert.match(sql, /has_capability\('platforms\.manage', null\) and public\.has_capability\('integrations\.secrets', null\)/);
  assert.match(sql, /raise exception 'APP_IN_USE'/);
  assert.match(sql, /when 'youtube' then raise exception 'APP_SHARED'/);
  assert.match(sql, /delete from public\.platform_setup where key = k/);
  const info = read('src/lib/platforms/info.ts');
  for (const code of ['APP_IN_USE', 'APP_SHARED']) assert.ok(info.includes(`['${code}', '`), code);
});

test('a failed Drive step says Drive\'s short code, and never a message or a body', async () => {
  const { detailOf } = await import('../src/lib/platforms/test-server.ts');
  assert.equal(detailOf(new Error('DRIVE_403')), 'DRIVE_403');
  assert.equal(detailOf(new Error('NO_UPLOAD_SESSION')), 'NO_UPLOAD_SESSION');
  assert.equal(detailOf(new Error('Request had invalid authentication credentials. token=abc')), 'UNKNOWN', 'a sentence is never passed on');
  assert.equal(detailOf(Object.assign(new Error('x'), { name: 'TimeoutError' })), 'TIMEOUT');
  const kit = read('src/components/work/test-kit.ts');
  assert.match(kit, /typeof b\.detail === 'string' && DETAIL_RE\.test\(b\.detail\)/, 'the page shows only a code line');
  for (const f of ['src/lib/platforms/test-tiktok.ts', 'src/lib/platforms/test-facebook.ts', 'src/lib/platforms/test-instagram.ts'])
    assert.match(read(f), /giveUp\(db, (t\.)?id, 'TEMP_UPLOAD_FAILED', (upload\.error|detailOf\(e\))\)/, f);
});

test('a TikTok refusal carries TikTok\'s own code, its log id and the HTTP status, and nothing else of the answer', async () => {
  const { ttDetail } = await import('../src/lib/platforms/tiktok.ts');
  const { DETAIL_RE } = await import('../src/lib/platforms/test-rules.ts');
  const answer = (status, error) => ({ status, body: { error }, text: '' });
  const d = ttDetail(answer(403, { code: 'unaudited_client_can_only_post_to_private_accounts', message: 'Please review our integration guidelines', log_id: '202611150953012345ABCDEF' }));
  assert.equal(d, 'tiktok unaudited_client_can_only_post_to_private_accounts log 202611150953012345ABCDEF http 403');
  assert.ok(DETAIL_RE.test(d), 'the page will show it');
  assert.doesNotMatch(d, /review|guidelines/, 'never TikTok\'s message');
  assert.equal(ttDetail(answer(403, { code: 'Bad Code <x>', log_id: 'x y' })), 'tiktok http 403', 'what is not shaped like a code is left out');
  assert.equal(ttDetail(null), 'tiktok unreachable');
  // The whole way: TikTok's refusal of a post reaches the page with its line.
  const f = async () => new Response(JSON.stringify({ error: { code: 'url_ownership_unverified', message: 'x', log_id: 'ABC123456' } }), { status: 403 });
  const r = await ttPost(f, { token: 't', videoUrl: 'https://x/y', options: { title: '', privacy: 'private', comments: false, duet: false, stitch: false, ownBrand: false, branded: false } });
  assert.deepEqual(r, { error: 'TT_URL_UNVERIFIED', detail: 'tiktok url_ownership_unverified log ABC123456 http 403' });
  const failed = await ttStatus(async () => new Response(JSON.stringify({ data: { status: 'FAILED', fail_reason: 'video_pull_failed' }, error: { code: 'ok' } })), { token: 't', publish: 'v_pub_url~v2.1' });
  assert.deepEqual(failed, { state: 'failed', reason: 'TT_PULL_FAILED', detail: 'tiktok video_pull_failed' });
  const server = read('src/lib/platforms/test-tiktok.ts');
  for (const re of [/giveUp\(db, id, c\.error, c\.detail\)/, /stop\(db, t, r\.error, r\.detail\)/, /stop\(db, t, s\.reason, s\.detail\)/]) assert.match(server, re);
});
