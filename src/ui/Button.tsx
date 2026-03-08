import type { ButtonHTMLAttributes } from 'react';

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const variant = props.variant ?? 'secondary';
  const className = ['btn', variant === 'primary' ? 'btn-primary' : '', variant === 'danger' ? 'btn-danger' : '', props.className]
    .filter(Boolean)
    .join(' ');
  return <button {...props} className={className} />;
}

