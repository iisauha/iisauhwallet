import { useRef, useEffect, useCallback, type SelectHTMLAttributes } from 'react';

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const className = ['ll-select', props.className].filter(Boolean).join(' ');
  const selectRef = useRef<HTMLSelectElement>(null);

  const resize = useCallback(() => {
    const sel = selectRef.current;
    if (!sel) return;
    const selected = sel.options[sel.selectedIndex];
    if (!selected) return;

    // Measure selected text using a temporary off-screen span
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
  }, []);

  useEffect(() => {
    resize();
  }, [props.value, props.children, resize]);

  useEffect(() => {
    document.fonts?.ready?.then(resize);
  }, [resize]);

  return <select {...props} ref={selectRef} className={className} />;
}
