/** Theme ids must match [data-theme] values in theme.css and storage validation. */
export type ThemeId =
  | 'alenjo'
  | 'blue'
  | 'green'
  | 'light'
  | 'purple'
  | 'amber'
  | 'rose'
  | 'teal'
  | 'red'
  | 'indigo'
  | 'cyan'
  | 'emerald'
  | 'orange'
  | 'slate'
  | 'custom';

export const THEME_OPTIONS: { id: ThemeId; label: string }[] = [
  { id: 'alenjo', label: 'Alenjo' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
  { id: 'teal', label: 'Teal' },
  { id: 'cyan', label: 'Cyan' },
  { id: 'emerald', label: 'Emerald' },
  { id: 'purple', label: 'Purple' },
  { id: 'indigo', label: 'Indigo' },
  { id: 'amber', label: 'Amber' },
  { id: 'orange', label: 'Orange' },
  { id: 'rose', label: 'Rose' },
  { id: 'red', label: 'Red' },
  { id: 'slate', label: 'Slate' },
  { id: 'light', label: 'Light' },
  { id: 'custom', label: 'Custom' },
];
