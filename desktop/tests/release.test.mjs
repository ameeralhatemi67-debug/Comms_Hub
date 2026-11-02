// The chores around a release (scripts/release.mjs, D3): the version raised in both files, and a release
// checked before the owner uploads it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compare, readLatest, bumpText } from '../scripts/release.mjs';

const yml = `version: 0.7.0
files:
  - url: CommsHub-Setup-0.7.0-x64.exe
    sha512: abc123==
    size: 111527803
path: CommsHub-Setup-0.7.0-x64.exe
sha512: abc123==
releaseDate: '2026-11-03T08:00:00.000Z'
`;

test('versions compare as numbers, and anything but x.y.z is refused', () => {
  assert.equal(compare('0.10.0', '0.9.0'), 1);
  assert.equal(compare('0.6.0', '0.6.0'), 0);
  assert.equal(compare('0.6.0', '0.6.1'), -1);
  assert.equal(compare('latest', '0.6.0'), null);
});

test('latest.yml is read for the fields a check needs, and nothing else passes', () => {
  assert.deepEqual(readLatest(yml), { version: '0.7.0', file: 'CommsHub-Setup-0.7.0-x64.exe', sha512: 'abc123==', size: 111527803 });
  for (const bad of ['', 'not yaml', yml.replace('0.7.0', 'next'), yml.replaceAll('CommsHub-Setup-0.7.0-x64.exe', '../x.exe'), yml.replaceAll('sha512: abc123==\n', '')]) {
    assert.equal(readLatest(bad), null, bad.slice(0, 30));
  }
});

test('bumping changes the version in the package and in the lockfile root, and nothing else', () => {
  const pkg = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  const lock = fs.readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8');
  const from = JSON.parse(pkg).version;
  const lines = (t) => t.split('\n');
  for (const text of [pkg, lock]) {
    const raised = bumpText(text, from, '9.9.9');
    const changed = lines(raised).filter((l, i) => l !== lines(text)[i]);
    assert.ok(changed.length >= 1 && changed.length <= 2, `${changed.length} lines changed`);
    assert.ok(changed.every((l) => l.includes('"version": "9.9.9"')));
    assert.equal(lines(raised).length, lines(text).length);
  }
  assert.throws(() => bumpText(pkg, '0.0.1', '9.9.9'));
});
