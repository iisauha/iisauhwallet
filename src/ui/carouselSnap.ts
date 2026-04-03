const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Call from a carousel's onScroll handler. After scrolling fully stops,
 * checks if the carousel is aligned to a snap point and corrects if not.
 *
 * The browser's native CSS scroll-snap (scroll-snap-type: x mandatory)
 * handles most snapping. This is a safety net for edge cases where the
 * native snap fails (e.g. very short swipes, momentum overshoot on iOS).
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
      const maxScroll = el.scrollWidth - w;
      // If at the very end, snap to the last card exactly
      if (maxScroll > 0 && el.scrollLeft >= maxScroll - 1) {
        const lastSnap = Math.round(maxScroll / w) * w;
        if (Math.abs(el.scrollLeft - lastSnap) > 2) {
          el.scrollTo({ left: lastSnap, behavior: 'instant' });
        }
        return;
      }
      const nearest = Math.round(el.scrollLeft / w) * w;
      const drift = Math.abs(el.scrollLeft - nearest);
      // Correct if misaligned by more than 5% of card width
      if (drift > w * 0.05) {
        el.scrollTo({ left: nearest, behavior: 'instant' });
      }
    }, 200)
  );
}
