'use client';
// «ألوان التقويم» (MVP_draft.md section 75, Director_Notes_Plan.md N-1): the person's own choice of colours, read once
// per visit from `calendar_prefs` (row level security shows each person their own row only) and written only through
// `calendar_prefs_save`, one save after another, always the latest. The calendar, the project pages and Home's next
// days read the same choice through `useCalendarColors`. The rules are src/lib/work/calendar-colors.ts.
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { ChevronDown, ChevronUp, Clock, RotateCcw, TriangleAlert } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { accountName, type AccountRow } from '@/lib/work/rules';
import type { CalEntry, CalKind } from '@/lib/work/planning';
import {
  COLOR_MODES,
  DEFAULT_PREFS,
  MAX_PAIRS,
  PALETTE,
  changedIn,
  cleanPrefs,
  isChanged,
  kindClass,
  legendOf,
  modeLabel,
  palOf,
  resetMode,
  setColor,
  valuesOf,
  type CalPrefs,
  type ColorLook,
  type ColorMode,
  type ValueSource,
} from '@/lib/work/calendar-colors';
import { Sheet, SheetHead } from '../sheet';
import { useWork } from './data';
import { Ic } from './parts';

// ---------------------------------------------------------------------------
// One choice per page load, shared by every page that colours the calendar
// ---------------------------------------------------------------------------
type Store = { me: string; prefs: CalPrefs; ready: boolean };
let store: Store = { me: '', prefs: DEFAULT_PREFS, ready: false };
let saved: CalPrefs = DEFAULT_PREFS;
let loading = '';
let want: CalPrefs | null = null;
let busy = false;
const subs = new Set<() => void>();
const emit = (s: Store) => {
  store = s;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};
function load(me: string) {
  if (loading === me || (store.me === me && store.ready)) return;
  loading = me;
  emit({ me, prefs: DEFAULT_PREFS, ready: false });
  void supabase()
    .from('calendar_prefs')
    .select('mode,colors')
    .maybeSingle()
    .then(({ data, error }) => {
      if (loading !== me) return;
      loading = '';
      // No row yet is today's calendar. So is a refusal: the page then keeps working with the usual colours.
      saved = error ? DEFAULT_PREFS : cleanPrefs(data);
      emit({ me, prefs: saved, ready: true });
    });
}
type Call = ReturnType<typeof useWork>['call'];
async function flush(call: Call, say: (t: string) => void) {
  if (busy) return;
  busy = true;
  while (want) {
    const next = want;
    want = null;
    const r = await call('calendar_prefs_save', { p_mode: next.mode, p_colors: next.colors });
    if (!r.ok) {
      want = null;
      say(r.error);
      emit({ ...store, prefs: saved });
      break;
    }
    saved = next;
  }
  busy = false;
}

export function useCalendarColors(): { prefs: CalPrefs; ready: boolean; choose: (next: CalPrefs) => void } {
  const w = useWork();
  const s = useSyncExternalStore(subscribe, () => store, () => store);
  useEffect(() => {
    if (w.me) load(w.me);
  }, [w.me]);
  const { call, say } = w;
  const choose = useCallback(
    (next: CalPrefs) => {
      emit({ ...store, prefs: next });
      want = next;
      void flush(call, say);
    },
    [call, say],
  );
  return { prefs: s.me === w.me ? s.prefs : DEFAULT_PREFS, ready: s.me === w.me && s.ready, choose };
}

/** What an entry needs to be coloured: its work's projects and stages, the project on screen, its account's platform. */
export function useColorLook(items: { w: { id: string }; projects: string[]; stages: { who: string | null }[] }[], accounts: AccountRow[], project?: string): ColorLook {
  return useMemo(() => {
    const byId = new Map(items.map((x) => [x.w.id, x]));
    const acc = new Map(accounts.map((a) => [a.id, a.platform]));
    return {
      projectsOf: (id) => byId.get(id)?.projects ?? [],
      stageWho: (id, si) => byId.get(id)?.stages[si]?.who,
      project,
      platformOf: (id) => acc.get(id),
    };
  }, [items, accounts, project]);
}

/** The values the sheet and the key name, from what the page already has. */
export function useValueSource(): ValueSource {
  const w = useWork();
  return useMemo(
    () => ({
      projects: w.projects.map((p) => ({ id: p.id, name: p.name })),
      accounts: w.accounts.map((a) => ({ id: a.id, label: accountName(a) })),
      people: w.people.map((p) => ({ email: p.email, name: p.display_name })),
    }),
    [w.projects, w.accounts, w.people],
  );
}

// ---------------------------------------------------------------------------
// The sheet
// ---------------------------------------------------------------------------
export function CalendarColorsSheet({ onClose }: { onClose: () => void }) {
  const w = useWork();
  const { prefs, choose } = useCalendarColors();
  const src = useValueSource();
  const [open, setOpen] = useState<string | null>(null);
  const platformOf = useCallback((id: string) => w.accounts.find((a) => a.id === id)?.platform, [w.accounts]);
  const mode = COLOR_MODES.find((m) => m.id === prefs.mode)!;
  const rows = valuesOf(prefs.mode, src);
  const changed = changedIn(prefs, prefs.mode);
  const pick = (key: string, pal: number | null) => {
    const r = setColor(prefs, key, pal, platformOf);
    if (r.full) return w.say(`بلغت ألوانك المحفوظة ${MAX_PAIRS}. أرجع بعض القيم إلى الافتراضي أولاً.`);
    choose(r.prefs);
  };
  const setMode = (m: ColorMode) => {
    setOpen(null);
    if (m !== prefs.mode) choose({ ...prefs, mode: m });
  };
  return (
    <Sheet label="ألوان التقويم" onClose={onClose}>
      <SheetHead title="ألوان التقويم" sub="ألوانك أنت: تتبعك على كل جهاز، ولا تغيّر ما يراه غيرك." onClose={onClose} />
      <div className="cc-sheet" data-cc="sheet">
        <h3 id="cc-by">لوّن حسب</h3>
        <div className="wk-seg" role="group" aria-labelledby="cc-by" data-cc="modes">
          {COLOR_MODES.map((m) => (
            <button type="button" key={m.id} aria-pressed={prefs.mode === m.id} onClick={() => setMode(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <p className="cc-hint" data-cc="hint">
          {mode.hint} {mode.none}
        </p>
        <h3>الألوان</h3>
        {rows.length ? (
          <div className="cc-list" data-cc="values">
            {rows.map((r) => {
              const pal = palOf(r.key, prefs, platformOf);
              const mine = isChanged(r.key, prefs);
              const sample = prefs.mode === 'kind' ? kindClass(r.key.slice(5) as CalKind, prefs) : `pal pal-${pal}`;
              const isOpen = open === r.key;
              return (
                <div key={r.key} className={`cc-row${isOpen ? ' open' : ''}`} data-cc-row={r.key}>
                  <button type="button" className="cc-pick" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : r.key)}>
                    <span className={`wk-cchip static ${sample}`}>
                      <span>{r.label}</span>
                    </span>
                    <small>{pal === null ? 'اللون المعتاد' : PALETTE[pal].name}</small>
                    <span className="cc-end">
                      {mine && <span className="cc-mine">اختيارك</span>}
                      <Ic i={isOpen ? ChevronUp : ChevronDown} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="cc-open">
                      <div className="cc-sws" role="radiogroup" aria-label={`لون «${r.label}»`}>
                        {PALETTE.map((p, i) => (
                          <button
                            type="button"
                            key={p.name}
                            role="radio"
                            aria-checked={pal === i}
                            aria-label={p.name}
                            title={p.name}
                            className={`cc-sw pal-${i}`}
                            onClick={() => pick(r.key, i)}
                          />
                        ))}
                      </div>
                      {mine && (
                        <div className="cc-acts">
                          <button type="button" className="pf-btn ghost" data-cc="reset-one" onClick={() => pick(r.key, null)}>
                            <Ic i={RotateCcw} />
                            إرجاع الافتراضي
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="cc-hint">لا قيم لهذا الاختيار بعد.</p>
        )}
        <div className="cc-foot">
          <span>تُحفظ ألوانك فور اختيارها.</span>
          {changed > 0 && (
            <button type="button" className="pf-btn" data-cc="reset-all" onClick={() => choose(resetMode(prefs, prefs.mode))}>
              <Ic i={RotateCcw} />
              إرجاع الافتراضي للكل
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// The key under the calendar
// ---------------------------------------------------------------------------
export function CalendarKey({ entries, look }: { entries: CalEntry[]; look: ColorLook }) {
  const { prefs } = useCalendarColors();
  const src = useValueSource();
  const items = legendOf(prefs, entries, look, src);
  const kind = prefs.mode === 'kind';
  // The warnings drawn as they are on screen: on a kind's own colour, or on a chosen one.
  const warn = kind ? 'k-pub' : 'k-pub pal pal-11';
  return (
    <div className="wk-legend" data-cc="key" data-mode={prefs.mode}>
      {!kind && <span className="cc-mode">لوّن حسب {modeLabel(prefs.mode)}:</span>}
      {items.map((x) => (
        <span key={x.key} className={`wk-cchip ${x.cls} static`} data-cc-key={x.key}>
          <span>{x.label}</span>
        </span>
      ))}
      {!kind && !items.length && <span className="cc-none">لا شيء على التقويم الآن بهذا الاختيار.</span>}
      {!kind && (
        <>
          <span className={`wk-cchip ${warn} late static`}>
            <Ic i={TriangleAlert} />
            <span>متأخر</span>
          </span>
          <span className={`wk-cchip ${warn} urg static`}>
            <span>عاجل</span>
          </span>
        </>
      )}
      <span className={`wk-cchip ${warn} risk static`}>
        <Ic i={TriangleAlert} />
        <span>التفويض لا يغطي الموعد</span>
      </span>
      <span className={`wk-cchip ${warn} near static`}>
        <Ic i={Clock} />
        <span>قريب من منشور آخر</span>
      </span>
      {!kind && <span className="cc-none">{COLOR_MODES.find((m) => m.id === prefs.mode)!.none} وتبقى علامات التنبيه فوق أي لون.</span>}
    </div>
  );
}
