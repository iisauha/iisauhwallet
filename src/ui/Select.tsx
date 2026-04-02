import { useRef, useEffect, useCallback, type SelectHTMLAttributes } from 'react';

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const className = ['ll-select', props.className].filter(Boolean).join(' ');
  const selectRef = useRef<HTMLSelectElement>(null);

  // Check if caller explicitly set a width — if so, skip auto-sizing
  const hasExplicitWidth = !!(
    props.style?.width ||
    props.style?.minWidth
  );

  const resize = useCallback(() => {
    if (hasExplicitWidth) return;
    const sel = selectRef.current;
    if (!sel) return;
    const selected = sel.options[sel.selectedIndex];
    if (!selected) return;

    const span = document.createElement('span');
    span.style.position = 'absolute';
    span.style.left = '-9999px';
    span.style.top = '-9999px';
    span.style.whiteSpace = 'nowrap';
    span.style.visibility = 'hidden';
    span.textContent = selected.text;

    const cs = getComputedStyle(sel);
    span.style.fontSize = cs.fontSize;
    span.style.fontFamily = cs.fontFamily;
    span.style.fontWeight = cs.fontWeight;
    span.style.letterSpacing = cs.letterSpacing;

    document.body.appendChild(span);
    const textWidth = span.getBoundingClientRect().width;
    document.body.removeChild(span);

    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const bl = parseFloat(cs.borderLeftWidth) || 0;
    const br = parseFloat(cs.borderRightWidth) || 0;
    sel.style.width = `${Math.ceil(textWidth + pl + pr + bl + br + 2)}px`;
  }, [hasExplicitWidth]);

  useEffect(() => {
    resize();
  }, [props.value, props.children, resize]);

  useEffect(() => {
    document.fonts?.ready?.then(resize);
  }, [resize]);

  // Also resize on native change event (user picks from dropdown)
  useEffect(() => {
    const sel = selectRef.current;
    if (!sel || hasExplicitWidth) return;
    const handler = () => requestAnimationFrame(resize);
    sel.addEventListener('change', handler);
    return () => sel.removeEventListener('change', handler);
  }, [resize, hasExplicitWidth]);

  return (
    <select
      {...props}
      ref={selectRef}
      className={className}
      style={{ textAlign: 'center', textAlignLast: 'center', ...props.style }}
    />
  );
}
