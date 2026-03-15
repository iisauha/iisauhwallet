import type { SelectHTMLAttributes } from 'react';

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const className = ['ll-select', props.className].filter(Boolean).join(' ');
  return <select {...props} className={className} />;
}

