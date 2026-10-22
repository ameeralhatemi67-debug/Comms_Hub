import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEVELS,
  canEditAt,
  canCreateAt,
  pipeline,
  stageLabels,
  stagePosition,
  isSideStage,
  isAssetLocked,
  quickActions,
  creativeRoles,
  reviewerRoles,
  assignerRoles,
  ratioOf,
  fitsPlatform,
  platformSpecs,
  timecodeSeconds,
  dbErrorText,
  capabilityMatrix,
} from '../src/lib/media/rules.ts';
import { describe, logTypeLabels } from '../src/lib/media/log-text.ts';

const base = {
  role: 'writer',
  level: LEVELS.create,
  folderLocked: false,
  stage: 'draft',
  approvedVersion: null,
  currentVersion: 1,
  hasChannels: true,
  isVideo: false,
};
const ids = (ctx) => quickActions({ ...base, ...ctx }).map((a) => a.id);

test('levels: edit and create are refused in a locked folder unless the person manages it', () => {
  assert.equal(canEditAt(LEVELS.edit, false), true);
  assert.equal(canEditAt(LEVELS.edit, true), false);
  assert.equal(canEditAt(LEVELS.manage, true), true);
  assert.equal(canCreateAt(LEVELS.create, false), true);
  assert.equal(canCreateAt(LEVELS.create, true), false);
  assert.equal(canCreateAt(LEVELS.edit, false), false);
  assert.equal(canEditAt(LEVELS.view, false), false);
});

test('the pipeline keeps the product terms in order, with side states hanging off it', () => {
  assert.deepEqual(
    pipeline.map((s) => stageLabels[s]),
    ['مسودة', 'قيد الإنتاج', 'قيد المراجعة', 'جاهز للنشر', 'مجدول', 'منشور'],
  );
  assert.equal(stageLabels.changes, 'بحاجة إلى تعديل');
  assert.equal(stageLabels.partial, 'نشر جزئي');
  assert.equal(stageLabels.failed, 'فشل النشر');
  assert.equal(stagePosition('review'), 2);
  assert.equal(stagePosition('changes'), 2);
  assert.equal(isSideStage('changes'), true);
  assert.equal(isSideStage('review'), false);
});

test('an approved version on its way to publication is frozen; one in review is not', () => {
  assert.equal(isAssetLocked({ approved_version: 5, stage: 'ready' }), true);
  assert.equal(isAssetLocked({ approved_version: 5, stage: 'scheduled' }), true);
  assert.equal(isAssetLocked({ approved_version: 5, stage: 'review' }), false);
  assert.equal(isAssetLocked({ approved_version: null, stage: 'ready' }), false);
});

test('quick actions follow the role, the stage and the folder', () => {
  assert.deepEqual(ids({ role: 'writer', stage: 'draft' }), ['startprod', 'submit', 'newver', 'writecopy', 'note']);
  assert.deepEqual(ids({ role: 'writer', stage: 'review' }), ['newver', 'writecopy', 'note']);
  assert.ok(ids({ role: 'assistant', stage: 'review', level: LEVELS.create }).includes('approve'));
  assert.ok(ids({ role: 'assistant', stage: 'review' }).includes('changes'));
  assert.equal(ids({ role: 'assistant', stage: 'review' }).includes('reject'), false, 'only the director rejects');
  assert.ok(ids({ role: 'director', stage: 'review' }).includes('reject'));
  assert.ok(ids({ role: 'publisher', level: LEVELS.view, stage: 'ready' }).includes('schedule'));
  assert.ok(ids({ role: 'publisher', level: LEVELS.view, stage: 'ready' }).includes('publish'));
  assert.equal(ids({ role: 'publisher', level: LEVELS.view, stage: 'review' }).includes('schedule'), false);
  assert.equal(ids({ role: 'director', stage: 'ready' }).includes('schedule'), false, 'the director does not publish');
  assert.deepEqual(ids({ role: 'publisher', level: LEVELS.view, stage: 'failed' }).slice(0, 1), ['publish']);
});

test('no decision is offered on a version you uploaded yourself (the database refuses SELF_APPROVAL)', () => {
  for (const role of ['director', 'assistant']) {
    const got = ids({ role, stage: 'review', uploadedByMe: true });
    for (const x of ['approve', 'changes', 'reject']) assert.equal(got.includes(x), false, `${role} ${x}`);
    assert.ok(got.includes('note'), 'a note is still possible');
  }
  assert.ok(ids({ role: 'director', stage: 'review', uploadedByMe: false }).includes('approve'));
});

test('a locked folder removes every action that changes the asset', () => {
  const got = ids({ role: 'writer', folderLocked: true });
  for (const x of ['startprod', 'submit', 'newver']) assert.equal(got.includes(x), false, x);
  assert.ok(got.includes('note'));
  const manager = ids({ role: 'director', level: LEVELS.manage, folderLocked: true, stage: 'draft' });
  assert.ok(manager.includes('startprod'), 'a manager can still work in a locked folder');
});

test('view-only people can annotate but not change anything', () => {
  assert.deepEqual(ids({ role: 'member', level: LEVELS.view, stage: 'review' }), ['note']);
  assert.deepEqual(ids({ role: 'admin', level: LEVELS.manage, stage: 'draft' }), ['copyreq', 'assign', 'note', 'link']);
});

test('writing the copy needs target channels, and nobody edits a published asset', () => {
  assert.equal(ids({ role: 'writer', hasChannels: false }).includes('writecopy'), false);
  const published = ids({ role: 'designer', stage: 'published' });
  for (const x of ['newver', 'startprod', 'submit', 'copyreq']) assert.equal(published.includes(x), false, x);
});

test('the role lists in the interface match the database rules', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20261011180000_media_system.sql', import.meta.url), 'utf8');
  const creative = sql.match(/creative text\[\] := array\[([^\]]*)\]/)?.[1] ?? '';
  const fromSql = creative.split(',').map((s) => s.trim().replace(/'/g, '')).sort();
  assert.deepEqual(fromSql, [...creativeRoles].sort());
  const taskPolicy = sql.match(/tasks_insert[\s\S]*?media_acts\(array\[([^\]]*)\]/)?.[1] ?? '';
  const assigners = taskPolicy.split(',').map((s) => s.trim().replace(/'/g, '')).sort();
  assert.deepEqual(assigners, assignerRoles.filter((r) => r !== 'admin').sort());
  assert.deepEqual([...reviewerRoles].sort(), ['assistant', 'director']);
  // approval is for reviewers, publishing for the publisher, in the trigger too
  assert.match(sql, /old\.stage = 'review' and new\.stage = 'ready' then\s+ok := public\.media_acts\(array\['director','assistant'\]\)/);
  assert.match(sql, /new\.stage in \('scheduled','published','partial','failed'\) then\s+ok := public\.media_acts\(array\['publisher'\]\)/);
});

test('the capability matrix agrees with the level rules', () => {
  const row = (label) => capabilityMatrix.find(([l]) => l.includes(label))[1];
  assert.deepEqual(row('تعديل الاسم'), [false, true, true, true]);
  assert.deepEqual(row('رفع'), [false, false, true, true]);
  assert.deepEqual(row('حذف'), [false, false, false, true]);
});

test('platform fit and timecodes', () => {
  assert.ok(Math.abs(ratioOf('1080 × 1350 px') - 0.8) < 0.001);
  assert.equal(ratioOf('3 صفحات'), null);
  const instagram = platformSpecs.find((p) => p.id === 'Instagram');
  const x = platformSpecs.find((p) => p.id === 'X');
  assert.equal(fitsPlatform('1080 × 1350 px', instagram), true);
  assert.equal(fitsPlatform('1080 × 1350 px', x), false);
  assert.equal(fitsPlatform('—', x), null);
  assert.equal(timecodeSeconds('01:30'), 90);
  assert.equal(timecodeSeconds('1:5'), null);
  assert.equal(timecodeSeconds(''), null);
});

test('log lines read as sentences and carry before and after', () => {
  const names = { 'a@x.com': 'سارة', 'b@x.com': 'محمد' };
  const nameOf = (e) => names[e] ?? e;
  const row = (type, data) => ({ id: 1, at: '2026-10-11T10:00:00Z', actor_email: 'b@x.com', type, asset_id: null, folder_id: null, task_id: null, data });

  const approve = describe(row('approve', { name: 'الملصق', from: 'review', to: 'ready', version: 5 }), nameOf);
  assert.match(approve.text, /اعتمد محمد الإصدار v5/);
  assert.equal(approve.stage, 'ready');
  assert.equal(approve.before, 'قيد المراجعة');
  assert.equal(approve.after, 'جاهز للنشر');

  const rename = describe(row('rename', { before: 'a.png', after: 'b.png' }), nameOf);
  assert.deepEqual([rename.before, rename.after], ['a.png', 'b.png']);

  const access = describe(row('access', { name: 'الهوية', subject_type: 'role', subject: 'designer', before: null, after: 3 }), nameOf);
  assert.match(access.text, /المصمم/);
  assert.deepEqual([access.before, access.after], ['موروث', 'إنشاء']);

  const lock = describe(row('lock', { name: 'الأرشيف', locked: true, reason: 'للقراءة فقط' }), nameOf);
  assert.match(lock.text, /قفل محمد/);

  const assign = describe(row('assign', { what: 'اكتب العنوان', assignee: 'a@x.com', due: '2026-10-12T09:00:00Z' }), nameOf);
  assert.match(assign.text, /إلى سارة: اكتب العنوان/);
  assert.match(assign.after, /قبل 2026-10-12 09:00/);

  const publish = describe(row('publish', { name: 'ملصق', from: 'scheduled', to: 'partial' }), nameOf);
  assert.match(publish.text, /نشر جزئياً/);
  assert.match(publish.text, /محاكاة/);

  for (const type of ['upload', 'version', 'stage', 'copy', 'move', 'remove', 'tag', 'folder', 'note', 'download', 'link', 'done'])
    assert.ok(logTypeLabels[type], `label for ${type}`);
});

test('database refusals become Arabic sentences, never raw codes', () => {
  assert.match(dbErrorText('STAGE_DENIED'), /غير متاح لدورك/);
  assert.match(dbErrorText('NAME_LOCKED'), /مقفل/);
  assert.match(dbErrorText('new row violates row-level security policy'), /صلاحية/);
  assert.doesNotMatch(dbErrorText('something unexpected: XYZ'), /XYZ/);
});
