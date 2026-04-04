import { useCallback, useRef, useState } from 'react';
import { scheduleSnapCorrection } from './carouselSnap';

/**
 * Performant carousel scroll hook.
 * - Index updates only fire when the snapped index actually changes
 * - Height interpolation is throttled via rAF (one render per frame max)
 * - onScroll is stable (useCallback) so it never causes re-mounts
 */
export function useCarouselScroll() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [idx, setIdx] = useState(0);
  const [height, setHeight] = useState<number | undefined>(undefined);
  const idxRef = useRef(0);
  const heightRef = useRef<number | undefined>(undefined);
  const rafRef = useRef<number | null>(null);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const rawIdx = el.scrollLeft / (el.clientWidth || 1);
    const snappedIdx = Math.round(rawIdx);

    // Update index only when it actually changes
    if (snappedIdx !== idxRef.current) {
      idxRef.current = snappedIdx;
      setIdx(snappedIdx);
    }

    // Throttle height updates via rAF to avoid re-rendering every scroll pixel
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (!ref.current) return;
        const curEl = ref.current;
        const curRaw = curEl.scrollLeft / (curEl.clientWidth || 1);
        const leftIdx = Math.floor(curRaw);
        const rightIdx = Math.min(leftIdx + 1, curEl.children.length - 1);
        const progress = curRaw - leftIdx;
        const lh = (curEl.children[leftIdx] as HTMLElement | undefined)?.offsetHeight ?? 0;
        const rh = (curEl.children[rightIdx] as HTMLElement | undefined)?.offsetHeight ?? lh;
        const newH = Math.round(lh + (rh - lh) * progress);
        if (newH !== heightRef.current) {
          heightRef.current = newH;
          setHeight(newH);
        }
      });
    }

    scheduleSnapCorrection(el);
  }, []);

  const resetIdx = useCallback((toIdx = 0) => {
    idxRef.current = toIdx;
    setIdx(toIdx);
  }, []);

  return { ref, idx, height, onScroll, resetIdx };
}
