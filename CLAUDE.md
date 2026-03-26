# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite, base path /iisauhwallet/)
npm run build     # Type-check and build for production (tsc -b && vite build)
npm run preview   # Preview production build locally
```

No test runner is configured. There is no lint script.

**Important:** Never run `npm run build` or push to remote — the user handles these manually.

## Architecture

**iisauhwallet** is a local-first personal finance PWA. All data lives in browser localStorage — there is no required backend. The app is a React SPA with 8 main tabs/routes.

### State: Zustand + localStorage

The entire app state flows through `useLedgerStore` in `src/state/store.ts`. This store holds all financial data (bank accounts, credit cards, pending items, purchases, recurring items, loans, investments) and syncs to localStorage via `saveData()` after every mutation.

- `src/state/models.ts` — TypeScript interfaces for all data types (`BankAccount`, `CreditCard`, `PendingInboundItem`, `Purchase`, `RecurringItem`, `LedgerData`, etc.)
- `src/state/storage.ts` — localStorage serialization, encryption/decryption, and data migrations (~70KB)
- `src/state/calc.ts` — Financial calculations (interest accrual, recurring interval math)
- `src/state/crypto.ts` — Web Crypto API wrapper for optional data encryption
- `src/state/keys.ts` — Storage key constants

### Routing & Providers

`src/App.tsx` wraps the app in several context providers before routing:
- `ThemeProvider`, `AppearanceProvider`, `AdvancedUIColorsProvider` — dynamic theming (colors, fonts, per-element overrides)
- `ReminderProvider` — toast notifications
- `DropdownStateProvider` — UI dropdown state
- `PasscodeGate` — security gate on first load

Tab order is draggable and persisted to localStorage. Routes map to `src/features/` subdirectories.

### Feature Pages

Each tab is a large single-file page component in `src/features/<name>/`:

| Feature | File size | Purpose |
|---------|-----------|---------|
| `snapshot` | ~87KB | Bank/card balances, pending transfers, net cash summary |
| `loans` | ~95KB | Federal and private loan tracking |
| `investing` | ~93KB | HYSA, Roth IRA, 401k, general investing, Coast FIRE calc |
| `recurring` | ~59KB | Repeating income/expenses, 457(b) optimizer UI |
| `spending` | ~45KB | Purchase log, category breakdown, Chart.js charts |
| `upcoming` | ~40KB | Projected cash flow from recurring items |
| `subtracker` | — | Credit card sign-up bonus tracker |
| `settings` | — | Themes, fonts, export/import, passcode, FAQ |

### Theme Engine

`src/theme/` contains the full theming system. Colors are CSS custom properties derived from a user-selected hex accent color via `themeUtils.ts`. `fontStacks.ts` has curated Google Font pairings. Named presets are in `themes.ts`. Appearance settings (font family, scale, surface style) live in `AppearanceContext`.

### UI Components

`src/ui/` has shared primitives: `Button`, `Modal`, `Select`, `AnimatedNumber` (balance transitions), and `icons.tsx` (inline SVG icon library).

### PWA & Build

- Vite base path is `/iisauhwallet/` — all asset paths and router `basename` must account for this
- `vite-plugin-pwa` with auto-update service worker
- Dev server proxies `/api` → `http://localhost:3001` for optional Plaid integration
- CSP headers in `index.html` allow Plaid CDN and reCAPTCHA domains

### Optional Plaid Integration

`src/features/detected-activity/` handles Plaid-based bank activity detection. Plaid Link script is loaded via CDN in `index.html`. This feature is entirely optional — the app works without it.
