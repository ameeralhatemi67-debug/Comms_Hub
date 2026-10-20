// The application's own Arabic words of D2 (src/words.ts; MVP_draft.md 63): established terms, no emoji.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REASONS } from '../src/bridge.ts';
import { decisionsLine, HIDDEN_BUSY, HIDDEN_KEPT, QUIT_QUESTION, TRAY_KEEP, TRAY_OPEN, TRAY_QUIT, trayTooltip } from '../src/words.ts';

const all = () => [TRAY_OPEN, TRAY_KEEP, TRAY_QUIT, HIDDEN_KEPT.title, HIDDEN_KEPT.body, ...Object.values(HIDDEN_BUSY).flatMap((x) => [x.title, x.body]), ...Object.values(QUIT_QUESTION).flatMap((x) => Object.values(x)), trayTooltip('export', 3)];

test('the tray says the decision D-10 named, word for word', () => {
  assert.equal(TRAY_KEEP, 'إبقاء التطبيق في شريط المهام');
  assert.equal(TRAY_OPEN, 'فتح مركز الاتصال المؤسسي');
  assert.equal(TRAY_QUIT, 'إنهاء');
});

test('every reason has its notice and its question, the first button keeping the work', () => {
  for (const r of REASONS) {
    assert.ok(HIDDEN_BUSY[r].title && HIDDEN_BUSY[r].body, r);
    assert.ok(QUIT_QUESTION[r].stay.startsWith('متابعة'), r);
    assert.ok(QUIT_QUESTION[r].quit.startsWith('إنهاء'), r);
  }
});

test('the tooltip names what runs and the decisions waiting', () => {
  assert.equal(trayTooltip(null, 0), 'مركز الاتصال المؤسسي');
  assert.equal(trayTooltip('export', 0), 'مركز الاتصال المؤسسي: جارٍ التصدير');
  assert.equal(trayTooltip(null, 2), `مركز الاتصال المؤسسي\n${decisionsLine(2)}`);
  assert.equal(decisionsLine(2), 'إشعارات تحتاج قرارك: 2');
});

test('Arabic, and no emoji anywhere', () => {
  for (const text of all()) {
    assert.match(text, /[؀-ۿ]/, text);
    assert.equal(/\p{Extended_Pictographic}/u.test(text), false, text);
  }
});
