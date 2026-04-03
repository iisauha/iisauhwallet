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
      if (!w || !el.children.length) return;
      const maxScroll = el.scrollWidth - w;
      const nearest = Math.min(Math.round(el.scrollLeft / w) * w, Math.max(0, maxScroll));
      const drift = Math.abs(el.scrollLeft - nearest);
      // Only correct if significantly misaligned — let CSS snap handle small drifts
      if (drift > w * 0.12) {
        el.scrollTo({ left: nearest, behavior: 'smooth' });
      }
    }, 320)
  );
}
