import { useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION_MS = 280;
const CACHE_PREFIX = 'animnum_';

type Props = {
  /** Value in cents or raw number to display */
  value: number;
  /** Format for display, e.g. (n) => formatCents(n) */
  format: (n: number) => string;
  /** Animation duration in ms */
  durationMs?: number;
  /** Optional className for the wrapper span */
  className?: string;
  /** Optional style for the wrapper span */
  style?: React.CSSProperties;
  /** Add a micro-bounce when the value changes (default: false) */
  bounce?: boolean;
  /** Stable key for remembering the last-seen value across tab switches.
   *  When provided, the component animates from the previous value on mount. */
  cacheKey?: string;
};

function getCachedValue(key: string): number | null {
  try {
    const v = sessionStorage.getItem(CACHE_PREFIX + key);
    return v != null ? Number(v) : null;
  } catch { return null; }
}

function setCachedValue(key: string, value: number) {
  try { sessionStorage.setItem(CACHE_PREFIX + key, String(value)); } catch {}
}

/**
 * Displays a numeric value with a smooth count-up/count-down animation when the value changes.
 * When `cacheKey` is provided, remembers the last value in sessionStorage so the ticker
 * animates from old→new even when the component remounts (e.g. switching tabs).
 * UI-only; does not affect underlying data or calculations.
 */
export function AnimatedNumber({ value, format, durationMs = DEFAULT_DURATION_MS, className, style, bounce, cacheKey }: Props) {
  const [displayValue, setDisplayValue] = useState(() => {
    if (cacheKey) {
      const cached = getCachedValue(cacheKey);
      if (cached != null && cached !== value) return cached;
    }
    return value;
  });
  const rafRef = useRef<number | null>(null);
  const startValueRef = useRef(displayValue);
  const startTimeRef = useRef(0);
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    startValueRef.current = displayValue;
    if (displayValue === value) {
      // Already at target — cache and skip
      if (cacheKey) setCachedValue(cacheKey, value);
      return;
    }

    const endVal = value;
    startTimeRef.current = performance.now();

    // Trigger micro-bounce
    if (bounce && spanRef.current) {
      spanRef.current.classList.remove('value-bounce');
      void spanRef.current.offsetWidth;
      spanRef.current.classList.add('value-bounce');
    }

    const tick = (now: number) => {
      const elapsed = now - startTimeRef.current;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const current = Math.round(startValueRef.current + (endVal - startValueRef.current) * eased);
      setDisplayValue(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayValue(endVal);
        if (cacheKey) setCachedValue(cacheKey, endVal);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]);

  useEffect(() => {
    if (displayValue !== value && rafRef.current == null) setDisplayValue(value);
  }, [value, displayValue]);

  return (
    <span ref={spanRef} className={className} style={{ display: 'inline-block', ...style }}>
      {format(displayValue)}
    </span>
  );
}
