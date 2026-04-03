import { useRef, useEffect, useCallback } from 'react';

/**
 * Manages carousel wrapper height via direct DOM mutation — no React re-renders.
 * The wrapper clips to the currently visible card's height and interpolates
 * smoothly during swiping without triggering setState.
 */
export function useCarouselHeight() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  /** Set wrapper height to the currently snapped card's height. */
  const syncHeight = useCallback(() => {
    const wrapper = wrapperRef.current;
    const carousel = carouselRef.current;
    if (!wrapper || !carousel) return;
    const w = carousel.clientWidth;
    if (!w || !carousel.children.length) return;
    const idx = Math.max(0, Math.min(Math.round(carousel.scrollLeft / w), carousel.children.length - 1));
    const child = carousel.children[idx] as HTMLElement | undefined;
    if (child) wrapper.style.height = child.offsetHeight + 'px';
  }, []);

  /** Interpolate height during scroll — pure DOM, no setState. */
  const handleScroll = useCallback(() => {
    const wrapper = wrapperRef.current;
    const carousel = carouselRef.current;
    if (!wrapper || !carousel) return;
    const w = carousel.clientWidth;
    if (!w || !carousel.children.length) return;
    const rawIdx = carousel.scrollLeft / w;
    const count = carousel.children.length;
    const leftIdx = Math.max(0, Math.min(Math.floor(rawIdx), count - 1));
    const rightIdx = Math.min(leftIdx + 1, count - 1);
    const progress = leftIdx === rightIdx ? 0 : rawIdx - leftIdx;
    const lh = (carousel.children[leftIdx] as HTMLElement | undefined)?.offsetHeight ?? 0;
    const rh = (carousel.children[rightIdx] as HTMLElement | undefined)?.offsetHeight ?? lh;
    wrapper.style.height = Math.round(lh + (rh - lh) * progress) + 'px';
  }, []);

  // Re-sync height on resize / orientation change
  useEffect(() => {
    const carousel = carouselRef.current;
    if (!carousel) return;
    const ro = new ResizeObserver(() => syncHeight());
    ro.observe(carousel);
    return () => ro.disconnect();
  }, [syncHeight]);

  return { wrapperRef, carouselRef, handleScroll, syncHeight };
}
