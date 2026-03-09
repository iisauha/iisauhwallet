/** Theme ids must match [data-theme] values in theme.css and storage validation. */
export type ThemeId =
  | 'blue'
  | 'green'
  | 'light'
  | 'purple'
  | 'amber'
  | 'rose'
  | 'teal';

export const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'light', label: 'Light' },
  { id: 'purple', label: 'Purple' },
  { id: 'amber', label: 'Amber' },
  { id: 'rose', label: 'Rose' },
  { id: 'teal', label: 'Teal' },
];
