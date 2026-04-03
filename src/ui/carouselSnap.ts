const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Safety net for edge cases where CSS scroll-snap fails to settle
 * (e.g. very short swipes, iOS momentum overshoot). Only intervenes
 * when the carousel is clearly stuck between two cards after scrolling
 * has fully stopped. Uses 'instant' to avoid fighting CSS snap animations.
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
      // Only correct if truly stuck between cards (>20% off snap point)
      if (drift > w * 0.2) {
        el.scrollTo({ left: nearest, behavior: 'instant' });
      }
    }, 400)
  );
}
