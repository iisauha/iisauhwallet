const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
const lastScroll = new WeakMap<HTMLElement, number>();

/**
 * Call from a carousel's onScroll handler. After scrolling stops (~200ms idle),
 * checks if the carousel is aligned to a snap point and corrects if not.
 * Fixes stuck-at-partial-position on quick/short swipes.
 */
export function scheduleSnapCorrection(el: HTMLElement) {
  const prev = timers.get(el);
  if (prev) clearTimeout(prev);
  lastScroll.set(el, Date.now());
  timers.set(
    el,
    setTimeout(() => {
      timers.delete(el);
      const w = el.clientWidth;
      if (!w) return;
      // Only correct if scrolling has truly stopped (no events in the last 180ms)
      const last = lastScroll.get(el) || 0;
      if (Date.now() - last < 180) return;
      const nearest = Math.round(el.scrollLeft / w) * w;
      if (Math.abs(el.scrollLeft - nearest) > 2) {
        el.scrollTo({ left: nearest, behavior: 'smooth' });
      }
    }, 200)
  );
}
