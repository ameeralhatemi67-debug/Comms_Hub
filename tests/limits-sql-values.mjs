// Prints the VALUES list that supabase/tests/limits_rules.sql runs through work_copy_issues, with
// the expected codes computed by the TypeScript rule (src/lib/platforms/limits.ts).
// Usage: node --experimental-strip-types tests/limits-sql-values.mjs
import { checkCopy, limitsOf } from '../src/lib/platforms/limits.ts';
import { ACCEPTS, CASES, textOf } from './limits-battery.mjs';

const q = (s) => "'" + s.replace(/'/g, "''") + "'";
const esc = (s) => 'E' + q(s.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t'));
const sqlText = (parts) => parts.map((p) => (Array.isArray(p) ? `repeat(${esc(p[0])}, ${p[1]})` : esc(p))).join(' || ');

export const expected = (parts, im, vi, tv, p) =>
  checkCopy(limitsOf(ACCEPTS[p]), { text: textOf(parts), images: im, videos: vi, typeVideo: tv })
    .issues.filter((x) => x.level === 'error')
    .map((x) => x.code)
    .sort()
    .join(',');

export const valuesSql = () =>
  CASES.map(([parts, im, vi, tv, p], i) => `(${i + 1}, ${sqlText(parts)}, ${im}, ${vi}, ${tv}, ${q(p)}, ${q(expected(parts, im, vi, tv, p))})`).join(',\n');

if (process.argv[1] && process.argv[1].endsWith('limits-sql-values.mjs')) {
  console.log(valuesSql());
  console.log('-- ACCEPTS ' + JSON.stringify(ACCEPTS));
}
