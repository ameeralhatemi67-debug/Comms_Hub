// Who sees which page, by role (Action_Plan.md B4): the default menu and the routes a new account of
// each role may open, computed from src/lib/access.ts and the capability templates, saved as JSON and
// printed as the table kept in MVP_draft.md. Re-run after any change to access rules or role defaults.
// Usage: node --experimental-strip-types qa/access-matrix.mjs   (writes qa/access-matrix.json)
import { writeFileSync } from 'node:fs';
import { accessMatrix, matrixMarkdown } from '../src/lib/access-matrix.ts';

const m = accessMatrix();
const out = { script: 'qa/access-matrix.mjs', run: new Date().toISOString(), ...m, markdown: matrixMarkdown(m) };
writeFileSync(new URL('./access-matrix.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(out.markdown);
console.log('\nمن يرى «سجل النشاط» كاملاً مع لوحة الفريق:', m.roles.filter((r) => r.activity === 'whole').map((r) => r.name).join('، '));
console.log('صلاحيات افتراضية خارج الصفحات:');
for (const r of m.roles) console.log(`  ${r.name}: ${r.caps.join(', ') || '-'}`);
console.log('مسؤول النظام حين يعرض بصفة دور:');
for (const [role, menu] of Object.entries(m.adminViewAs)) console.log(`  ${role}: ${menu.length} إدخالاً${menu.includes('create') ? '' : ' (دون إنشاء)'}${menu.includes('accounts') ? '' : ' (دون الحسابات)'}`);
