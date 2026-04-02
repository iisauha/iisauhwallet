import { useRef, useEffect, useCallback, type SelectHTMLAttributes } from 'react';

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const className = ['ll-select', props.className].filter(Boolean).join(' ');
  const selectRef = useRef<HTMLSelectElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);

  const resize = useCallback(() => {
    const sel = selectRef.current;
    const measure = measureRef.current;
    if (!sel || !measure) return;
    const selected = sel.options[sel.selectedIndex];
    if (!selected) return;
    measure.textContent = selected.text;
    // Copy font from select so measurement is accurate
    const cs = getComputedStyle(sel);
    measure.style.fontSize = cs.fontSize;
    measure.style.fontFamily = cs.fontFamily;
    measure.style.fontWeight = cs.fontWeight;
    measure.style.letterSpacing = cs.letterSpacing;
    // Width = text width + left padding + right padding + border
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const br = parseFloat(cs.borderRightWidth) || 0;
    sel.style.width = `${Math.ceil(measure.offsetWidth + pl + pr + bl + br + 2)}px`;
  }, []);

  useEffect(() => {
    resize();
  }, [props.value, props.children, resize]);

  // Also resize after fonts load
  useEffect(() => {
    document.fonts?.ready?.then(resize);
  }, [resize]);

  return (
    <>
      <span
        ref={measureRef}
        aria-hidden
        style={{
          position: 'absolute',
          visibility: 'hidden',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          height: 0,
          overflow: 'hidden',
        }}
      />
      <select {...props} ref={selectRef} className={className} />
    </>
  );
}
