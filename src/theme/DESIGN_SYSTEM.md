# Premium Design System (UI Only)

This is a **UI/UX-only** layer. No financial or business logic changes.

## Goals
- Premium, minimal, Apple/Robinhood-style fintech feel
- Strong typography and hierarchy
- Consistent spacing and motion
- Clean cards, modals, and controls

## Tokens (design-system.css)

### Spacing
- `--space-1` (4px) … `--space-10` (40px)
- Use for padding, margin, gap

### Typography
- Sizes: `--text-xs` (0.75rem) … `--text-3xl` (1.875rem)
- Weights: `--font-normal` (400), `--font-medium` (500), `--font-semibold` (600), `--font-bold` (700)
- Leading: `--leading-tight`, `--leading-snug`, `--leading-normal`

### Motion
- Durations: `--motion-duration-fast` (180ms), `--motion-duration-normal` (280ms), `--motion-duration-slow` (380ms)
- Easings: `--motion-ease`, `--motion-ease-out`

### Radii
- `--radius-sm` (8px) … `--radius-2xl` (24px), `--radius-full` (9999px)

## Where theme colors come from
- **Theme (dark/light, surfaces):** Set in `main.tsx` from Settings (`getThemeColorsFromHex`, `getAccentColorsFromHex`). Use `--bg`, `--surface`, `--border`, `--accent`, etc.
- **Semantic (never overridden):** `--green`, `--red` for positive/negative. Do not change these in theme.

## First implementation pass
- Global: `styles.css` updated to use design tokens; cards, summary, section headers, tabs, buttons, modals, pending items refined.
- Snapshot/Upcoming/Recurring/Loans/Investing: Use the same global classes; they inherit the premium pass.

## Next passes (suggested)
- Snapshot: Optional Snapshot-specific tweaks (e.g. summary card accent).
- Upcoming: Softer status pills, cleaner collapsibles.
- Recurring: Form layout and selector polish.
- Loans: Loan card hierarchy and disclosure motion.
- Investing/HYSA: Card and control polish.
- Motion: Expand/collapse and modal transitions (partially applied).
