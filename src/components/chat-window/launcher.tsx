'use client';
// The launcher on the left edge. It moves up and down that edge only (owner's note of 2026-11-05);
// a press without a drag opens the window. Its numbers (unread conversations and mail, and what
// waits for this person's decision) are given by ./live once the window was opened.
import { useRef, useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { LAUNCHER, backHome } from '@/lib/chat-window/rules';

export type LauncherProps = {
  y: number;
  home: number;
  min: number;
  maxY: number;
  onMove: (y: number | null) => void;
  onOpen: () => void;
};

/** The button itself; its numbers come from the window's live part once the window was opened. */
export function Launcher({ y, home, min, maxY, onMove, onOpen, unread = 0, decide = 0 }: LauncherProps & { unread?: number; decide?: number }) {
  const drag = useRef<{ startY: number; fromY: number; moved: boolean } | null>(null);
  const [moving, setMoving] = useState(false);
  const at = (pageY: number) => {
    const d = drag.current!;
    return Math.min(Math.max(d.fromY - (pageY - d.startY), min), maxY);
  };
  const label = `البريد والمراسلة${unread ? `، ${unread} غير مقروءة` : ''}${decide ? `، ${decide} بانتظار قرارك` : ''}. اسحب الزر لأعلى أو لأسفل لتحريكه`;
  return (
    <button
      type="button"
      className={`cw-launch ${moving ? 'moving' : ''}`}
      style={{ left: LAUNCHER.x, bottom: y }}
      aria-label={label}
      title={`${label} · Alt+M`}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startY: e.clientY, fromY: y, moved: false };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        if (!d.moved && Math.abs(e.clientY - d.startY) < 6) return;
        d.moved = true;
        setMoving(true);
        onMove(at(e.clientY));
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        if (!d) return;
        const to = at(e.clientY);
        drag.current = null;
        setMoving(false);
        if (!d.moved) return onOpen();
        onMove(backHome(to, home) ? null : to);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setMoving(false);
      }}
      onClick={(e) => {
        // A key press (Enter, Space) arrives as a click with no pointer.
        if (e.detail === 0) onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          onMove(Math.min(Math.max(y + (e.key === 'ArrowUp' ? 40 : -40), min), maxY));
        }
      }}
    >
      <MessagesSquare aria-hidden />
      {unread > 0 && <span className="cw-badge">{unread > 99 ? '99+' : unread}</span>}
      {decide > 0 && (
        <span className="cw-decide" title="بانتظار قرارك">
          {decide}
        </span>
      )}
    </button>
  );
}
