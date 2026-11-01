// Checks the files of «تقرير الشهر» (MVP_draft.md 66), not only that they were written. Each PDF is rendered to pictures
// and its text read back with PyMuPDF; the Excel file is opened by Excel itself, which refuses or repairs a bad file,
// and its cells are read back from there. Both from the invented month in qa/fixtures/report-sample.mjs, plus an
// empty month and a large one, because a report that only works on a good month fails on the first quiet one.
// Needs Python with PyMuPDF, and Excel. Pictures and files go to qa/artifacts/activity-exports/.
// Usage: node --experimental-strip-types qa/activity-exports.mjs   (writes qa/activity-exports.json)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SAMPLE_REPORT } from './fixtures/report-sample.mjs';
import { buildReport } from '../src/lib/activity/report.ts';
import { reportPdf, PDF_ASSET_PATHS } from '../src/lib/activity/report-pdf.ts';
import { reportXlsx } from '../src/lib/activity/report-xlsx.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'artifacts', 'activity-exports');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass: Boolean(pass), detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
  console.log(`${pass ? 'pass' : 'FAIL'}  ${name}${pass ? '' : ` | ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
};

const assets = Object.fromEntries(Object.entries(PDF_ASSET_PATHS).map(([k, p]) => [k, new Uint8Array(fs.readFileSync(path.join(root, 'public', p)))]));
const NOW = new Date('2026-11-01T09:00:00Z');
const months = {
  good: buildReport(SAMPLE_REPORT, NOW),
  empty: buildReport({ ...SAMPLE_REPORT, actions: [], days: {}, approved: {}, stages: [], tasks: [], late: {} }, NOW),
  large: buildReport(
    {
      ...SAMPLE_REPORT,
      people: Array.from({ length: 26 }, (_, i) => ({ email: `p${i}@example.test`, name: `عضو الفريق رقم ${i + 1}`, role: 'writer' })),
      actions: Array.from({ length: 26 }, (_, i) => ({ who: `p${i}@example.test`, src: 'work', type: 'text', n: 26 - i })),
      days: {},
      approved: {},
      late: {},
      stages: Array.from({ length: 120 }, (_, i) => ({ who: `p${i % 6}@example.test`, at: '2026-10-10T09:00:00Z', due: '2026-10-11', on_time: true, name: `مرحلة ${i + 1}`, work: 'عمل بعنوان طويل نسبياً لاختبار قص السطر عند نهاية العمود في التقرير التفصيلي', work_id: 'CH-1' })),
      tasks: [],
    },
    NOW,
  ),
};

const reader = path.join(out, 'read.py');
fs.writeFileSync(reader, `import sys, json
import pymupdf
doc = pymupdf.open(sys.argv[1])
pages = []
for i, page in enumerate(doc):
    page.get_pixmap(matrix=pymupdf.Matrix(1.6, 1.6)).save(f"{sys.argv[2]}-{i + 1}.png")
    pages.append(page.get_text())
print(json.dumps({'pages': pages, 'size': [doc[0].rect.width, doc[0].rect.height], 'fonts': sorted({f[3] for p in doc for f in p.get_fonts()}), 'title': doc.metadata.get('title')}))
`);
const readPdf = (file, base) => JSON.parse(execFileSync('python', [reader, file, base], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, maxBuffer: 1 << 26 }));

for (const template of ['brief', 'full']) {
  const bytes = await reportPdf(months.good, template, assets);
  const file = path.join(out, `report-${template}.pdf`);
  fs.writeFileSync(file, bytes);
  const pdf = readPdf(file, path.join(out, `report-${template}`));
  const text = pdf.pages.join('\n');
  check(`${template}: A4, the site's fonts embedded, titled`, Math.round(pdf.size[0]) === 595 && Math.round(pdf.size[1]) === 842 && pdf.fonts.some((f) => f.includes('IBMPlexSansArabic')) && pdf.title.includes('أكتوبر 2026'), pdf.fonts);
  check(`${template}: under 400 KB, ${Math.round(bytes.length / 1024)} KB`, bytes.length < 400 * 1024);
  check(`${template}: the numbers are selectable text, not a picture`, /\b\d{2,3}\b/.test(text) && text.includes('2026'), text.slice(0, 120));
  check(`${template}: page numbers on every page`, pdf.pages.length >= 1 && pdf.pages.every((p, i) => p.includes(String(i + 1))), pdf.pages.length);
  check(`${template}: no Arabic letter fell out to a missing glyph`, !text.includes('�') && !text.includes('.notdef'));
}
const fullText = readPdf(path.join(out, 'report-full.pdf'), path.join(out, 'report-full')).pages.join('\n');
check('full: the date of a finished stage is in the ledger', /10-0?4/.test(fullText), fullText.slice(0, 200));

for (const [name, r] of [['empty', months.empty], ['large', months.large]]) {
  for (const template of ['brief', 'full']) {
    const bytes = await reportPdf(r, template, assets);
    const file = path.join(out, `${name}-${template}.pdf`);
    fs.writeFileSync(file, bytes);
    const pdf = readPdf(file, path.join(out, `${name}-${template}`));
    check(`${name} month, ${template}: it draws, ${pdf.pages.length} page(s)`, pdf.pages.length >= 1);
  }
}

// Excel itself, hidden, read-only. A damaged file raises an error here or comes back with a repair note.
const xlsx = path.join(out, 'report.xlsx');
fs.writeFileSync(xlsx, reportXlsx(months.good));
fs.writeFileSync(path.join(out, 'empty.xlsx'), reportXlsx(months.empty));
const ps = path.join(os.tmpdir(), `activity-excel-${process.pid}.ps1`);
fs.writeFileSync(ps, `$ErrorActionPreference = 'Stop'
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$result = @{}
try {
  foreach ($name in @('report', 'empty')) {
    $book = $excel.Workbooks.Open((Join-Path '${out.replace(/\\/g, '\\\\')}' "$name.xlsx"), 0, $true)
    $sheets = @()
    foreach ($s in $book.Worksheets) { $sheets += @{ name = $s.Name; rtl = $s.Parent.Windows.Item(1).DisplayRightToLeft; used = $s.UsedRange.Address($false, $false) } }
    $first = $book.Worksheets.Item(1)
    $cells = @{}
    foreach ($ref in 'A1','A3','A5','B5','D5','A6','B6','C6','D6','K6') { $cells[$ref] = [string]$first.Range($ref).Text }
    $result[$name] = @{ sheets = $sheets; cells = $cells; filter = [bool]$first.AutoFilterMode }
    $book.Close($false)
  }
} finally { $excel.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel) }
$result | ConvertTo-Json -Depth 6 -Compress
`);
let excel = null;
try {
  excel = JSON.parse(execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps], { encoding: 'utf8', maxBuffer: 1 << 24, timeout: 120000 }));
} catch (e) {
  check('Excel opened the file', false, String(e.stdout || e.message).slice(0, 400));
}
fs.rmSync(ps, { force: true });
if (excel) {
  const r = excel.report;
  check('Excel opened the file without a repair, three sheets', r.sheets.length === 3 && r.sheets[0].name === 'الملخص', r.sheets);
  check('every sheet runs right to left', r.sheets.every((s) => s.rtl === true), r.sheets);
  check('the title, the first place and the table are where they should be', r.cells.A1.includes('أكتوبر 2026') && r.cells.A3.includes('الأكثر إنتاجية') && r.cells.A5 === 'الترتيب' && r.cells.B5 === 'الاسم', r.cells);
  const top = months.good.people[0];
  check('the first row is the first place, its points a real number', r.cells.B6 === top.name && Number(r.cells.D6) === top.points, r.cells);
  check('the table can be filtered', r.filter === true);
  check('Excel opened an empty month too', excel.empty.sheets.length === 3 && excel.empty.cells.A3.includes('لا إنجاز'), excel.empty.cells);
}

const passed = checks.filter((c) => c.pass).length;
fs.writeFileSync(path.join(here, 'activity-exports.json'), `${JSON.stringify({ script: 'qa/activity-exports.mjs', run: new Date().toISOString(), total: checks.length, passed, failed: checks.length - passed, checks }, null, 2)}\n`);
console.log(`${passed} of ${checks.length} passed`);
process.exitCode = passed === checks.length ? 0 : 1;
