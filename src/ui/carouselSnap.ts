const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Call from a carousel's onScroll handler. After scrolling stops (~120ms idle),
 * checks if the carousel is aligned to a snap point and corrects if not.
 * Fixes stuck-at-partial-position on quick/short swipes.
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
      if (Math.abs(el.scrollLeft - nearest) > 2) {
        el.scrollTo({ left: nearest, behavior: 'smooth' });
      }
    }, 120)
  );
}
