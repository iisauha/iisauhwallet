const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Call from a carousel's onScroll handler. After scrolling fully stops,
 * checks if the carousel is aligned to a snap point and corrects if not.
 *
 * The browser's native CSS scroll-snap (scroll-snap-type: x mandatory)
 * handles most snapping. This is a safety net for edge cases where the
 * native snap fails (e.g. very short swipes, momentum overshoot on iOS).
 *
 * Important: uses behavior:'instant' to avoid fighting with CSS snap
 * animations, and a generous threshold to only intervene when truly stuck.
 */
export function scheduleSnapCorrection(el: HTMLElement) {
  const prev = timers.get(el);
  if (prev) clearTimeout(prev);
  timers.set(
    el,
    setTimeout(() => {
      timers.delete(el);
      const w = el.clientWidth;
      if (!w) return;
      const nearest = Math.round(el.scrollLeft / w) * w;
      const drift = Math.abs(el.scrollLeft - nearest);
      // Only correct if significantly misaligned (>10% of card width).
      // Small drifts (<10%) are either mid-animation or close enough.
      if (drift > w * 0.1) {
        el.scrollTo({ left: nearest, behavior: 'instant' });
      }
    }, 350)
  );
}
