// Who the application is: the fixed id, the name, the data folder, the user agent, refused switches and
// downloads (Desktop_App_Plan.md 5.1, 9 and 11.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { APP_ID, dataFolderName, PRODUCT_NAME, userAgentFor, windowsAppId } from '../src/identity.ts';
import { REFUSED_ALWAYS, REFUSED_IN_RELEASE, refusedSwitch } from '../src/switches.ts';
import { safeFileName, saveDialogFor, SAVE_TITLE } from '../src/downloads.ts';

test('the fixed id is reverse-DNS, and names the data folder', () => {
  assert.equal(APP_ID, 'sa.commshub.desktop');
  assert.match(APP_ID, /^[a-z]+(\.[a-z0-9-]+){2,}$/);
  assert.equal(dataFolderName(false), APP_ID);
  assert.equal(dataFolderName(true), `${APP_ID}.dev`, 'a development build never touches the real profile');
  assert.equal(windowsAppId(false), APP_ID);
  assert.equal(PRODUCT_NAME, 'مركز الاتصال المؤسسي');
});

const electronAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) مركز الاتصال المؤسسي/0.1.0 Chrome/152.0.7977.130 Electron/44.5.1 Safari/537.36';

test('the user agent ends with CommsHubDesktop/<version>, without Electron\'s tokens, in plain ASCII', () => {
  const agent = userAgentFor(electronAgent, '0.1.0');
  assert.equal(agent, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.130 Safari/537.36 CommsHubDesktop/0.1.0');
  assert.match(agent, /^[\x20-\x7e]+$/);
  const odd = userAgentFor('Something مختلف/1 Electron/44', '0.1.0');
  assert.match(odd, /^[\x20-\x7e]+ CommsHubDesktop\/0\.1\.0$/, 'an unexpected agent is still made ASCII and marked');
});

test('a switch that ignores certificates or weakens the sandbox stops every build; remote debugging stops a release build', () => {
  const has = (...names) => (name) => names.includes(name);
  assert.equal(refusedSwitch(has('ignore-certificate-errors'), true), 'ignore-certificate-errors');
  assert.equal(refusedSwitch(has('no-sandbox'), false), 'no-sandbox');
  assert.equal(refusedSwitch(has('remote-debugging-port'), false), 'remote-debugging-port');
  assert.equal(refusedSwitch(has('remote-debugging-port'), true), null, 'the development build is driven through it by the checks');
  assert.equal(refusedSwitch(has('use-fake-device-for-media-stream', 'lang'), false), null);
  assert.equal(refusedSwitch(has(), false), null);
  for (const name of REFUSED_ALWAYS) assert.equal(refusedSwitch(has(name), true), name);
  for (const name of REFUSED_IN_RELEASE) assert.equal(refusedSwitch(has(name), false), name);
});

test('downloads start in the Downloads folder under a name that stays there', () => {
  const folder = 'C:\\Users\\x\\Downloads';
  assert.deepEqual(saveDialogFor(folder, 'تقرير الحملة.mp4'), { title: SAVE_TITLE, defaultPath: path.join(folder, 'تقرير الحملة.mp4') });
  assert.equal(safeFileName('..\\..\\Windows\\evil.exe'), 'evil.exe');
  assert.equal(safeFileName('../../etc/passwd'), 'passwd');
  assert.equal(safeFileName('a:b*c?.txt'), 'a_b_c_.txt');
  assert.equal(safeFileName('...'), 'download');
  assert.equal(safeFileName(''), 'download');
  assert.equal(SAVE_TITLE, 'حفظ الملف');
});
