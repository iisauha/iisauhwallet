import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react';

type SwipeRowProps = {
  id: string;
  children: ReactNode;
  onDeleteRequested: () => void;
};

const DELETE_WIDTH_PX = 96;
const OPEN_THRESHOLD_PX = 44;
const CLOSE_THRESHOLD_PX = 24;
const HORIZONTAL_LOCK_RATIO = 1.2;

const SWIPE_EVENT = 'ledgerlite_swipe_row_open';
const getOpenId = () => {
  try {
    return (window as any).__ledgerliteOpenSwipeRowId || '';
  } catch {
    return '';
  }
};
const setOpenId = (id: string) => {
  try {
    (window as any).__ledgerliteOpenSwipeRowId = id;
    window.dispatchEvent(new CustomEvent(SWIPE_EVENT, { detail: { id } }));
  } catch {
    // ignore
  }
};

export function SwipeRow(props: SwipeRowProps) {
  const reactId = useId();
  const rowDomId = useMemo(() => `swipeRow-${props.id}-${reactId}`.replace(/[^a-zA-Z0-9_-]/g, '_'), [props.id, reactId]);

  const [open, setOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const rafRef = useRef<number | null>(null);

  const startRef = useRef<{ x: number; y: number; openAtStart: boolean; horizontalLocked: boolean; pointerId: number | null } | null>(null);

  const translateX = open ? -DELETE_WIDTH_PX : 0;
  const effectiveX = isDragging ? dragX : translateX;

  function close() {
    setOpen(false);
    setDragX(0);
    if (getOpenId() === props.id) setOpenId('');
  }

  function openRow() {
    setOpen(true);
    setDragX(-DELETE_WIDTH_PX);
    setOpenId(props.id);
  }

  useEffect(() => {
    const onGlobal = (e: any) => {
      const nextId = String(e?.detail?.id || '');
      if (nextId && nextId !== props.id) {
        setOpen(false);
        setDragX(0);
      }
      if (!nextId) {
        setOpen(false);
        setDragX(0);
      }
    };
    window.addEventListener(SWIPE_EVENT, onGlobal as any);
    return () => window.removeEventListener(SWIPE_EVENT, onGlobal as any);
  }, [props.id]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!open) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const row = document.getElementById(rowDomId);
      if (!row) return;
      if (row.contains(target)) return;
      close();
    };
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => window.removeEventListener('pointerdown', onPointerDown, { capture: true } as any);
  }, [open, rowDomId]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function scheduleSetDragX(next: number) {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setDragX(next);
    });
  }

  function onPointerDown(e: React.PointerEvent) {
    if ((e as any).pointerType === 'mouse' && e.button !== 0) return;
    startRef.current = { x: e.clientX, y: e.clientY, openAtStart: open, horizontalLocked: false, pointerId: e.pointerId };
    setIsDragging(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = startRef.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;

    if (!s.horizontalLocked) {
      if (Math.abs(dx) < 6) return;
      if (Math.abs(dx) > Math.abs(dy) * HORIZONTAL_LOCK_RATIO) {
        s.horizontalLocked = true;
      } else {
        return;
      }
    }

    e.preventDefault();
    const base = s.openAtStart ? -DELETE_WIDTH_PX : 0;
    let next = base + dx;
    next = Math.min(0, Math.max(-DELETE_WIDTH_PX, next));
    scheduleSetDragX(next);
  }

  function finishDrag(clientX: number) {
    const s = startRef.current;
    if (!s) return;
    const dx = clientX - s.x;
    const base = s.openAtStart ? -DELETE_WIDTH_PX : 0;
    const endX = base + dx;

    if (!s.openAtStart) {
      if (endX < -OPEN_THRESHOLD_PX) openRow();
      else close();
    } else {
      if (endX > -DELETE_WIDTH_PX + CLOSE_THRESHOLD_PX) close();
      else openRow();
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!startRef.current) return;
    finishDrag(e.clientX);
    startRef.current = null;
    setIsDragging(false);
  }

  function onPointerCancel() {
    startRef.current = null;
    setIsDragging(false);
    close();
  }

  return (
    <div className="ll-swipe-row" id={rowDomId}>
      <div className="ll-swipe-row-actions" aria-hidden>
        <button
          type="button"
          className="btn-delete ll-swipe-delete"
          onClick={(e) => {
            e.stopPropagation();
            props.onDeleteRequested();
          }}
        >
          Delete
        </button>
      </div>
      <div
        className={open || isDragging ? 'll-swipe-row-content is-open' : 'll-swipe-row-content'}
        style={{
          transform: `translateX(${effectiveX}px)`,
          transition: isDragging ? 'none' : 'transform 180ms ease'
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {props.children}
      </div>
    </div>
  );
}

