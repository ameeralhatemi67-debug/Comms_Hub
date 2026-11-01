'use client';
// «تقرير الشهر» in «سجل النشاط» (MVP_draft.md 66): what each person did in one month, and who came first. The database
// gives the counts (activity_report, for the holders of «تقرير الشهر عن الفريق»); src/lib/activity/report.ts turns them
// into points. The files are made here in the browser, from what is on the screen, so nothing about people passes
// through a server, and their libraries load only when one is asked for. The Android application refuses a file made
// in the page (Downloads.java), so there the buttons say where to get it.
import { Fragment, useEffect, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { permError } from '@/lib/permissions';
import { native } from '@/lib/native';
import { CATEGORIES, buildReport, defaultMonth, methodLines, monthOf, monthTitle, recentMonths, topNames, type MonthlyReport, type RawReport, type ReportPerson } from '@/lib/activity/report';
import { Avatar, Ts } from './parts';

const riyadhDay = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Riyadh' }).slice(0, 10);

function save(bytes: Uint8Array, name: string, type: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

type Kind = 'xlsx' | 'brief' | 'full';

export function ActivityReport() {
  const [month, setMonth] = useState(() => defaultMonth(new Date()));
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<Kind | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const months = recentMonths(new Date());
  const phone = native().platform === 'android';

  useEffect(() => {
    let live = true;
    setReport(null);
    setError('');
    setOpen(null);
    void supabase()
      .rpc('activity_report', { p_month: month })
      .then(({ data, error: e }) => {
        if (!live) return;
        if (e) return setError(permError(e.message));
        setReport(buildReport(data as RawReport, new Date()));
      });
    return () => {
      live = false;
    };
  }, [month]);

  const download = async (kind: Kind) => {
    if (!report) return;
    setBusy(kind);
    setNote('');
    try {
      if (kind === 'xlsx') {
        const { reportXlsx } = await import('@/lib/activity/report-xlsx');
        save(reportXlsx(report), `تقرير-الفريق-${report.month}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else {
        const { reportPdf, PDF_ASSET_PATHS } = await import('@/lib/activity/report-pdf');
        const entries = await Promise.all(
          Object.entries(PDF_ASSET_PATHS).map(async ([k, path]) => {
            const res = await fetch(path);
            if (!res.ok) throw Error(path);
            return [k, new Uint8Array(await res.arrayBuffer())] as const;
          }),
        );
        const bytes = await reportPdf(report, kind, Object.fromEntries(entries) as Parameters<typeof reportPdf>[2]);
        save(bytes, `تقرير-الفريق-${report.month}-${kind === 'brief' ? 'ملخص' : 'مفصل'}.pdf`, 'application/pdf');
      }
    } catch {
      setNote('تعذّر إعداد الملف. أعد المحاولة.');
    }
    setBusy(null);
  };

  const max = Math.max(1, ...(report?.people.map((p) => p.points) ?? [1]));
  const lead = report?.top[0];

  return (
    <div className="rp">
      <div className="rp-bar">
        <label className="rp-month">
          <span>الشهر</span>
          <select className="sel" value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((x) => (
              <option key={x} value={x}>
                {monthTitle(x)}
                {x === monthOf(new Date()) ? ' (حتى اليوم)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="rp-files" role="group" aria-label="تنزيل التقرير">
          <button type="button" className="secondary" disabled={!report || !!busy || phone} onClick={() => void download('xlsx')}>
            <FileSpreadsheet aria-hidden="true" />
            {busy === 'xlsx' ? 'جارٍ الإعداد…' : 'Excel'}
          </button>
          <button type="button" className="secondary" disabled={!report || !!busy || phone} title="صفحة للنظرة السريعة: الأول والأرقام والترتيب" onClick={() => void download('brief')}>
            <FileText aria-hidden="true" />
            {busy === 'brief' ? 'جارٍ الإعداد…' : 'PDF: الملخص التنفيذي'}
          </button>
          <button type="button" className="secondary" disabled={!report || !!busy || phone} title="الجدول كاملاً، وما أنجزه كل شخص" onClick={() => void download('full')}>
            <Download aria-hidden="true" />
            {busy === 'full' ? 'جارٍ الإعداد…' : 'PDF: التقرير التفصيلي'}
          </button>
        </div>
      </div>
      {phone && <p className="muted">تنزيل الملفات متاح من الموقع وتطبيق الحاسوب، وليس من تطبيق الهاتف بعد.</p>}
      {note && (
        <p className="warning" role="alert">
          {note}
        </p>
      )}
      {error && (
        <p className="warning" role="alert">
          {error}
        </p>
      )}
      {!report && !error && <p role="status">جارٍ إعداد التقرير…</p>}
      {report && (
        <>
          {report.partial && <p className="rp-partial">الشهر لم ينتهِ بعد: الأرقام حتى الآن.</p>}
          <section className={`rp-hero ${lead ? '' : 'quiet'}`} aria-label="الأكثر إنتاجية">
            {lead ? (
              <>
                <Trophy aria-hidden="true" />
                <div className="rp-who">
                  <small>الأكثر إنتاجية في {report.title}</small>
                  <b>{topNames(report)}</b>
                  <span>{report.top.length > 1 ? 'تعادل في المركز الأول' : lead.roleName}</span>
                </div>
                <div className="rp-score">
                  <b>{lead.points}</b>
                  <span>نقطة</span>
                </div>
              </>
            ) : (
              <div className="rp-who">
                <small>{report.title}</small>
                <b>لا إنجاز مسجّل في هذا الشهر.</b>
              </div>
            )}
          </section>
          <div className="mx-stats">
            {[
              ['مراحل أُنجزت', report.totals.counts.stages],
              ['مهام أُنجزت', report.totals.counts.tasks],
              ['أعمال اعتُمدت', report.totals.counts.works],
              ['أُنجز في موعده', report.totals.onTime === null ? '—' : `${report.totals.onTime}%`],
            ].map(([label, value]) => (
              <div className="mx-stat" key={label}>
                <b>{value}</b>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="rp-table" role="table" aria-label="ما أنجزه كل شخص">
            <div className="rp-row head" role="row">
              <span role="columnheader">#</span>
              <span role="columnheader">العضو</span>
              <span role="columnheader">النقاط</span>
              {CATEGORIES.slice(0, 6).map((c) => (
                <span role="columnheader" className="rp-n" key={c.id} title={c.label}>
                  {c.short}
                </span>
              ))}
              <span role="columnheader" className="rp-n">
                في الموعد
              </span>
              <span role="columnheader" />
            </div>
            {report.people.map((p) => (
              <Fragment key={p.email}>
                <PersonRow p={p} max={max} open={open === p.email} onToggle={() => setOpen(open === p.email ? null : p.email)} />
              </Fragment>
            ))}
          </div>
          <details className="rp-method">
            <summary>كيف تُحسب النقاط</summary>
            <ul>
              {methodLines().map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}

function PersonRow({ p, max, open, onToggle }: { p: ReportPerson; max: number; open: boolean; onToggle: () => void }) {
  const first = p.rank === 1;
  return (
    <div className={`rp-person ${first ? 'first' : ''} ${p.ranked ? '' : 'outside'}`} role="rowgroup">
      <div className="rp-row" role="row">
        <span role="cell" className="rp-rank">
          {p.rank ?? '–'}
        </span>
        <span role="cell" className="rp-name">
          <Avatar name={p.name} />
          <span>
            <b>{p.name}</b>
            <small>
              {p.roleName}
              {p.ranked ? '' : ' · خارج الترتيب'}
            </small>
          </span>
        </span>
        <span role="cell" className="rp-points">
          <b>{p.points}</b>
          <i aria-hidden="true">
            <em style={{ width: `${(p.points / max) * 100}%` }} />
          </i>
        </span>
        {CATEGORIES.slice(0, 6).map((c) => (
          <span role="cell" className={`rp-n ${p.counts[c.id] ? '' : 'zero'}`} key={c.id} data-label={c.short}>
            {p.counts[c.id]}
          </span>
        ))}
        <span role="cell" className="rp-n" data-label="في الموعد">
          {p.onTime === null ? '–' : `${p.onTime}%`}
        </span>
        <span role="cell">
          <button type="button" className="rp-open" aria-expanded={open} aria-label={`ما أنجزه ${p.name}`} onClick={onToggle}>
            <ChevronDown aria-hidden="true" />
          </button>
        </span>
      </div>
      {open && (
        <div className="rp-detail">
          <p className="rp-counts">
            {CATEGORIES.filter((c) => p.counts[c.id] > 0).map((c) => `${c.short} ${p.counts[c.id]}`).join(' · ')}
          </p>
          <p>
            {p.days ? `نشط في ${p.days} ${p.days === 1 ? 'يوم' : 'أيام'}` : 'لا نشاط مسجّل'}
            {p.onTime === null ? '' : ` · في الموعد ${p.onTime}%`}
            {p.lateOpen ? ` · ${p.lateOpen} مهام متأخرة عند نهاية الشهر` : ''}
          </p>
          {p.items.length ? (
            <ul>
              {p.items.map((it, i) => (
                <li key={`${it.at}-${i}`}>
                  <Ts>{riyadhDay(it.at).slice(5)}</Ts>
                  <span>
                    {it.name}
                    {it.work ? <small> · {it.work}</small> : null}
                  </span>
                  {it.onTime !== null && <small className={it.onTime ? 'ok' : 'late'}>{it.onTime ? 'في الموعد' : 'متأخرة'}</small>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">لا مراحل ولا مهام أُنجزت في هذا الشهر.</p>
          )}
        </div>
      )}
    </div>
  );
}
