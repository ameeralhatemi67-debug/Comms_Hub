'use client';

// The studio's menu bar (MVP_draft.md 62.2): «ملف», «تحرير», «المقطع», «عرض», «النوافذ» and «مساعدة»,
// each item with its shortcut beside it (shortcuts.ts); the ready-made workspaces as tabs in the middle;
// filling the browser window, the editor's dark or light chrome and the shortcuts sheet at the end. The
// menus are worked with the mouse or the keyboard (arrows, Enter, Escape).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronLeft, Keyboard, Maximize, Minimize, Moon, Search, Sun } from 'lucide-react';
import { GROUPS, SHORTCUTS, comboLabel, type Scope } from '@/lib/studio/shortcuts';
import { Modal } from '../ui';

export type MenuItem =
  | { kind?: 'item'; label: string; keys?: string; icon?: ReactNode; checked?: boolean; disabled?: boolean; onSelect?: () => void; items?: MenuItem[]; hint?: string }
  | { kind: 'sep' }
  | { kind: 'label'; label: string };
export type Menu = { id: string; label: string; items: MenuItem[] };

function Items({ items, close, depth = 0 }: { items: MenuItem[]; close: () => void; depth?: number }) {
  const [sub, setSub] = useState<number | null>(null);
  return (
    <>
      {items.map((it, i) => {
        if (it.kind === 'sep') return <hr key={`s${i}`} />;
        if (it.kind === 'label') return <span key={`l${i}`} className="st-menu-label">{it.label}</span>;
        const hasSub = !!it.items?.length;
        return (
          <div key={`${it.label}${i}`} className="st-menu-row" onPointerEnter={() => setSub(hasSub ? i : null)}>
            <button
              type="button"
              role={it.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={it.checked === undefined ? undefined : it.checked}
              aria-haspopup={hasSub ? 'menu' : undefined}
              aria-expanded={hasSub ? sub === i : undefined}
              disabled={it.disabled}
              title={it.hint}
              onClick={() => {
                if (hasSub) return setSub(sub === i ? null : i);
                close();
                it.onSelect?.();
              }}
              onKeyDown={(e) => {
                if (hasSub && (e.key === 'ArrowLeft' || e.key === 'Enter')) {
                  e.preventDefault();
                  setSub(i);
                  requestAnimationFrame(() => (e.currentTarget.parentElement?.querySelector('.st-menu-sub button:not(:disabled)') as HTMLElement | null)?.focus());
                }
              }}
            >
              <span className="st-menu-ico">{it.checked ? <Check aria-hidden="true" /> : it.icon}</span>
              <span className="st-menu-text">{it.label}</span>
              {it.keys && <kbd dir="ltr">{it.keys}</kbd>}
              {hasSub && <ChevronLeft className="st-menu-more" aria-hidden="true" />}
            </button>
            {hasSub && sub === i && (
              <div
                className="st-menu st-menu-sub"
                role="menu"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight' || e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setSub(null);
                    (e.currentTarget.parentElement?.querySelector('button') as HTMLElement | null)?.focus();
                  }
                }}
              >
                <Items items={it.items!} close={close} depth={depth + 1} />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

export function MenuBar({
  menus, presets, preset, onPreset, full, onFull, chrome, onChrome, onShortcuts, extra,
}: {
  menus: Menu[];
  presets: { id: string; label: string; hint: string }[];
  preset: string;
  onPreset: (id: string) => void;
  full: boolean;
  onFull: () => void;
  chrome: 'dark' | 'light';
  onChrome: () => void;
  onShortcuts: () => void;
  /** Shown beside the workspaces (the tools of the editor). */
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !bar.current?.contains(e.target as Node) && setOpen(null);
    window.addEventListener('pointerdown', off, true);
    return () => window.removeEventListener('pointerdown', off, true);
  }, [open]);

  const focusMenu = (id: string) => requestAnimationFrame(() => (bar.current?.querySelector(`[data-menu="${id}"] .st-menu button:not(:disabled)`) as HTMLElement | null)?.focus());
  const step = (dir: 1 | -1) => {
    const i = menus.findIndex((m) => m.id === open);
    const next = menus[(i + dir + menus.length) % menus.length];
    setOpen(next.id);
    focusMenu(next.id);
  };

  return (
    <div className="st-menubar" ref={bar} role="menubar" aria-label="قوائم المحرر">
      <div className="st-menus">
        {menus.map((m) => (
          <div key={m.id} className="st-menu-top" data-menu={m.id}>
            <button
              type="button"
              className="st-menu-btn"
              aria-haspopup="menu"
              aria-expanded={open === m.id}
              data-on={open === m.id ? 'yes' : 'no'}
              onClick={() => setOpen(open === m.id ? null : m.id)}
              onPointerEnter={() => open && open !== m.id && setOpen(m.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen(m.id);
                  focusMenu(m.id);
                }
              }}
            >
              {m.label}
            </button>
            {open === m.id && (
              <div
                className="st-menu"
                role="menu"
                aria-label={m.label}
                onKeyDown={(e) => {
                  const items = [...e.currentTarget.querySelectorAll<HTMLElement>(':scope > .st-menu-row > button:not(:disabled)')];
                  const at = items.indexOf(document.activeElement as HTMLElement);
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    items[(at + 1) % items.length]?.focus();
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    items[(at - 1 + items.length) % items.length]?.focus();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setOpen(null);
                    (bar.current?.querySelector(`[data-menu="${m.id}"] .st-menu-btn`) as HTMLElement | null)?.focus();
                  } else if (e.key === 'ArrowLeft' && !(document.activeElement as HTMLElement)?.getAttribute('aria-haspopup')) {
                    e.preventDefault();
                    step(1);
                  } else if (e.key === 'ArrowRight' && !e.defaultPrevented) {
                    e.preventDefault();
                    step(-1);
                  }
                }}
              >
                <Items items={m.items} close={() => setOpen(null)} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="st-presets" role="tablist" aria-label="مساحات العمل">
        {presets.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === preset} data-on={p.id === preset ? 'yes' : 'no'} title={p.hint} onClick={() => onPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="st-bar-tools">
        {extra}
        <button type="button" className="st-icon-btn" onClick={onShortcuts} aria-label="قائمة الاختصارات" title="قائمة الاختصارات (?)">
          <Keyboard aria-hidden="true" />
        </button>
        <button type="button" className="st-icon-btn" onClick={onChrome} aria-label={chrome === 'dark' ? 'محرر فاتح' : 'محرر داكن'} title={chrome === 'dark' ? 'محرر فاتح' : 'محرر داكن'}>
          {chrome === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
        </button>
        <button type="button" className="st-icon-btn" onClick={onFull} aria-pressed={full} aria-label={full ? 'الخروج من ملء النافذة' : 'ملء النافذة'} title={full ? 'الخروج من ملء النافذة (Ctrl+Shift+F)' : 'ملء النافذة (Ctrl+Shift+F)'}>
          {full ? <Minimize aria-hidden="true" /> : <Maximize aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

/** Every shortcut of this editor, by group, searchable. */
export function ShortcutsSheet({ scope, onClose, windowNames }: { scope: Scope; onClose: () => void; windowNames: Record<number, string> }) {
  const [q, setQ] = useState('');
  const list = useMemo(
    () =>
      SHORTCUTS.filter((s) => s.scopes.includes(scope))
        .map((s) => (s.id.startsWith('window-') ? { ...s, label: windowNames[Number(s.id.slice(7))] ? `نافذة «${windowNames[Number(s.id.slice(7))]}»` : '' } : s))
        .filter((s) => s.label && (!q.trim() || s.label.includes(q.trim()) || s.combos.some((c) => comboLabel(c).toLowerCase().includes(q.trim().toLowerCase())))),
    [scope, q, windowNames],
  );
  return (
    <Modal title="اختصارات لوحة المفاتيح" onClose={onClose}>
      <div className="st-keysheet">
        <label className="st-search">
          <Search aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن أمر أو مفتاح" aria-label="ابحث في الاختصارات" autoFocus />
        </label>
        <p className="st-hint">تعمل الاختصارات بموضع المفتاح، فلا يغيّرها تبديل لغة لوحة المفاتيح. وعلى حاسوب Mac تقوم ⌘ مقام Ctrl.</p>
        {GROUPS.map((g) => {
          const rows = list.filter((s) => s.group === g);
          if (!rows.length) return null;
          return (
            <section key={g}>
              <h3>{g}</h3>
              <dl>
                {rows.map((s) => (
                  <div key={s.id}>
                    <dt>{s.label}</dt>
                    <dd>
                      {s.combos.map((c, i) => (
                        <span key={c}>
                          {i > 0 && <i> أو </i>}
                          <kbd dir="ltr">{comboLabel(c)}</kbd>
                        </span>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
        {!list.length && <p className="st-hint">لا اختصار مطابق.</p>}
      </div>
    </Modal>
  );
}
