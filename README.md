# iisauh wallet

A personal finance dashboard that helps you track every dollar: bank balances, credit cards, HYSA buckets, pending money, recurring expenses, loans, investing, and sign-up bonus progress. All in one place, under your control.

---

## What is this?

**iisauh wallet** is a manual-entry, local-first progressive web app (PWA) for personal finance. You enter your own numbers. There is no required connection to your bank. The app gives you a single place to see where your money is and where it's going.

Think of it like a whiteboard on your wall that you keep updated yourself, except it does the math for you, remembers everything, and works on any device with a browser.

**What you can track:**

- **Bank balances** (checking, savings, cash on hand)
- **Credit cards** (balances, what you owe, optional reward category for spending suggestions)
- **HYSA** (high-yield savings: balance, APY, two sub-buckets for reserved savings vs. money set aside for bills)
- **Pending inbound / outbound** (money in motion: transfers and payments not yet settled)
- **Recurring** (repeating income and expenses: salary, rent, subscriptions, loan payments)
- **Loans** (federal and private student loans, with IDR/repayment estimates and payment tracking)
- **Investing** (Roth IRA, 401k, general investing, Coast FIRE projections)
- **Sign-up bonus tracker** (credit card signup bonuses and progress toward spend targets)

**Philosophy:** Track every dollar, including money moving between accounts and money sitting in apps like Venmo. You stay in control; the app does not pull data from your bank unless you opt into an optional Plaid feature.

---

## Architecture and data storage

### The "single source of truth" model

All wallet data lives in one store called `useLedgerStore` (built with Zustand, in `src/state/store.ts`). Think of it like a single notebook that every tab in the app reads from and writes to. Every time you save a change, the whole notebook gets written to your browser's localStorage.

- No backend required. No account. No signup.
- All data stays on your device in your browser.
- The creator cannot see your data.

### How the state flows

When you change something (add a bank account, post a pending item, etc.), the change goes through an "action" on the store, which updates the in-memory state and immediately writes it to localStorage. Components across all tabs read from the same store, so they all update at once.

This is like having one shared spreadsheet that every tab of the app has open at the same time. When you change a cell, every tab that references it updates immediately.

### Key source files

| File | What it does |
|------|-------------|
| `src/state/store.ts` | The entire app state and all mutation actions |
| `src/state/models.ts` | TypeScript types for every data object (BankAccount, CreditCard, etc.) |
| `src/state/storage.ts` | Reading and writing from localStorage, encryption/decryption, data migrations |
| `src/state/calc.ts` | Financial math (interest accrual, recurring interval calculations) |
| `src/state/crypto.ts` | Web Crypto API wrapper for optional data encryption |
| `src/App.tsx` | Root component: routing, tab bar, global header, floating action button |
| `src/styles.css` | Global styles, lava lamp animation, glass effects, button components |
| `src/theme/` | Theme engine: accent colors, font stacks, named presets, appearance context |
| `src/ui/` | Shared primitives: Button, Modal, Select, AnimatedNumber, icon library |

### Local-first and security model (important)

- **Passcode protection:** A 6-digit passcode blocks access to the app UI. It is stored as a SHA-256 hash on your device only.
- **Not encrypted at rest:** The passcode is an access gate, not encryption. Anyone who can read your browser's localStorage (for example, another user on the same device who bypasses the lock screen) can potentially see your data.
- **Profile photo and display name:** Stored in localStorage as a small JPEG data URL. Never sent anywhere automatically.
- **Optional encryption on export:** When exporting a JSON backup you can optionally encrypt it with your passcode.

See the in-app **Security Policy** (Settings > Security Policy) for full details.

---

## Visual design

### Lava lamp background

The background uses 7 CSS blobs with `border-radius` morphing and `transform: translate/scale` animations running on the GPU. Think of each blob as a slow-moving glob of colored wax in a lava lamp.

- **Blob 1** is the large base that sweeps slowly across the screen.
- **Blobs 2 through 7** are satellites that spend most of their time merged into a large cluster (about 65% of each animation cycle), then periodically peel off one by one to float around on their own for roughly 8 seconds before drifting back together. Each satellite has a different cycle duration (19s to 29s) so they never all separate or return at the same time.
- The visual "merge" happens because each blob scales up to about 1.7x to 1.85x when in the merged state. At those scales and with `blur: 28px`, the blobs overlap into one large glow.
- All blobs use `backdrop-filter` and `mix-blend-mode` for the frosted glass ("liquid glass") look on UI surfaces layered on top.

### Theme engine

Themes live in `src/theme/`. You pick an accent color and the entire app derives its color palette from it using `color-mix()` and CSS custom properties. Named presets (like "Midnight", "Ocean", etc.) are in `src/theme/themes.ts`. Font stacks are in `src/theme/fontStacks.ts` and cover system fonts, Google Fonts, serif, and monospace options.

### Glass / frosted surfaces

Cards, the header, modal overlays, and other surfaces use CSS `backdrop-filter: blur(...)` with semi-transparent backgrounds to create a frosted glass look. The lava lamp behind bleeds through. This is all CSS; no canvas or WebGL.

---

## Main tabs and features

### Snapshot

Your main financial overview. Think of it as your financial "dashboard at a glance."

- **Cash:** Total across all bank accounts and tracked cash
- **Credit cards:** Balances and total card debt
- **Pending inbound:** Money you are expecting (like a transfer you sent but that has not arrived yet)
- **Pending outbound:** Money on its way out (a payment sent but not yet cleared)
- **Final net cash:** Cash minus card debt adjusted for pending. "If everything settled right now, where would I stand?"

You can add and edit bank accounts, credit cards, and pending items. Posting a pending item updates the relevant account balance. Each section header has a green-tinted **+ Add** button and a neutral **Hide/Show $0** toggle.

**Reward card config:** Per credit card you can set a reward category and subcategory. When adding a purchase in Spending, the app suggests that category for that card.

### Spending

Log purchases manually: amount, category, subcategory, optional notes. View spending by category, total for this month, last month, or custom date ranges. Export monthly purchases as CSV. Categories are customizable in Settings > Manage Categories.

### Upcoming

Shows expected income and expenses in a projected time window and shows "amount remaining" after expected costs. It reads from your recurring items to build the timeline.

Think of it like a calendar for your money. It shows paychecks and bills coming up, and tells you how much you will have left after the bills are paid.

**Linked HYSA liquidity:** If you have an HYSA with a linked checking account, the "money designated for bills" bucket is added to your effective cash in this view.

You can promote an expected item to a pending item (useful when you have sent a payment and want to track it as "in motion").

### Recurring

Track repeating income and expenses: salary, rent, subscriptions, loan payments. This is the planning layer. Every item here can appear in Upcoming.

- Set frequency (monthly, weekly, biweekly, yearly, custom interval)
- Set payment source or target (bank, card, HYSA bucket)
- Toggle "apply to snapshot" so running "Process recurring" updates actual balances
- Link to a loan so the recurring amount uses that loan's current estimated payment

**Optimizer (457(b)):** From Recurring you can open the 457(b) optimizer. It uses your recurring data to autofill and computes take-home pay, taxes, and expenses (including public and private loan amounts). Results are saved so you can view "last result" without re-running.

### Loans

- **Federal (public) loans:** Enter parameters (balance, interest rate, repayment plan). The app shows IDR and repayment estimates. Two swipeable cards cover payment actions and notes separately.
- **Private loans:** Enter balances, interest rates, and payment schedules. When posting pending outbound with loan adjustments, you can override how much goes to each private loan.
- **Recompute:** Private loan balances can be recomputed from payment history after a batch post. The last recompute date and cycle are stored.
- **Loan Tools button:** Opens a modal with utilities for loan calculations and scenarios.

### Investing / HYSA

- **HYSA:** Balance, APY, two sub-buckets (reserved savings and money designated for bills). Link an HYSA to a checking account so only the bills portion counts as liquid in Upcoming.
- **Roth IRA, 401k, general investing:** Track balances and transfers between bank and investing accounts.
- **Adjust HYSA Allocation:** Moves money between the two HYSA buckets without changing the total balance. Like shuffling money between envelopes inside the same savings account.
- **Coast FIRE projections:** Investing page includes projection sections with info icons that explain the assumptions.
- All balances are entered by you; nothing is pulled from any broker automatically.

### Sign-up Bonus Tracker (Bonuses tab)

Track credit card sign-up bonuses and progress toward spend targets. Add cards, set reward tiers and reward text (cash back, points, miles), and mark progress. An animated progress bar with tier markers shows where you stand. Useful for managing multiple cards and bonus deadlines.

Reward values are parsed from the text you enter, so entering clear numeric quantities (like "150 cash" or "50000 points") keeps the tracker accurate.

### Settings / Profile

- **Profile card:** Set your display name and profile picture (stored locally). The profile page shows a large avatar and name input centered on the card.
- **App Customization:** Theme, accent color, font stack, surface styles.
- **Edit Account Names:** Rename banks, cards, and investing accounts without losing data.
- **Security:** Reset passcode (requires current passcode first).
- **Security Policy:** Links to the in-app security and privacy policy.
- **FAQ:** Common questions about passcode, data, and features.
- **Export JSON / Import JSON:** Full backup and restore. Import replaces all current data and reloads the app.
- **Export monthly purchases CSV:** Current month's purchases as a CSV file.
- **App Guide:** Short in-app guide to tabs and features.
- **Tab visibility and order:** Hide tabs you don't use; drag tabs to reorder them.

---

## Navigation and quick actions

### Tab bar

7 tabs across the bottom: Snapshot, Spending, Upcoming, Recurring, Loans, Investing, Bonuses. The active tab shows a colored pill with an icon and label. Inactive tabs show just the icon. Tabs are draggable to reorder. Hidden tabs are configurable in Settings.

### Global header

The header at the top shows your profile avatar and display name. Tapping it opens Settings. The avatar and name are intentionally large for quick recognition.

### Floating action button (+ FAB)

The `+` button in the bottom-right corner opens a "quick actions" sheet. The most frequently used actions float to the top (sorted by use frequency). Actions include: log a purchase, add pending inbound/outbound, add recurring income/expense, update a balance, transfer to investing, adjust HYSA allocation, add a bonus card, and export a backup.

---

## Button style guide

The app uses two distinct small button styles for section headers:

- **Accent-tinted buttons (the "+ Add" buttons):** A transparent accent-colored background with an accent-colored border. Used only for "create new item" actions (add bank, add card, add pending, add recurring, etc.). These stand out so you know you are about to create something.
- **Neutral utility buttons:** A surface-colored background with a neutral border and muted text. Used for toggle actions like "Hide $0 / Show $0," "Loan Tools," and navigation actions like "back to all categories." These blend into the UI to avoid drawing too much attention.

---

## Data flow: how modules connect

The app keeps multiple screens in sync by connecting the same underlying objects. The important flows are:

**Snapshot reads from:** bank accounts, credit cards, pending items, HYSA accounts, and private loan balances.

**Upcoming reads from:** recurring items (for projected income/costs), HYSA linkage (for effective cash), and pending items (for items already in motion).

**Spending reads from:** purchases, categories, and card reward settings.

**Loans reads from:** federal loan parameters, private loan records, and recurring item links.

**Recurring feeds:** Upcoming (via projected timeline), Snapshot (via "apply to snapshot" and "Process recurring"), and Loans (via loan-linked recurring amounts).

**Pending items are the bridge:** They live between "money on its way" and "money settled." When you post a pending item, the underlying account balance updates and the pending item is removed, keeping Snapshot current.

---

## Passcode and recovery

- Set a 6-digit passcode to lock the app. Stored as a SHA-256 hash on your device only.
- **First-run security onboarding:** Before setting a passcode for the first time, you complete a short required security quiz (5 questions, all must be correct).
- **Optional during setup:** Password hint, two security questions (hashed locally), and a one-time recovery key (save it when shown; only the hash is stored).
- **Reset passcode:** Settings > Security > Reset passcode (requires current passcode).
- **Forgot passcode:** On the lock screen, use recovery key or security questions. The hint alone does not allow reset.
- **Too many failed attempts:** After 10 incorrect attempts you can confirm a full data wipe (then re-import a backup) or lock recovery for 24 hours.

What the passcode does: blocks the UI. What it does not do: encrypt your data in browser storage.

---

## Backup and export

- **Export JSON:** Full backup including accounts, balances, pending, purchases, recurring, loans, investing, categories, and settings. Can be encrypted with your passcode.
- **Import JSON:** Restores from a backup and replaces current data. The app reloads automatically after import.
- **Export monthly purchases CSV:** This month's purchases as a CSV file.
- Back up regularly. If the browser or device is cleared, you can restore from a JSON backup.

---

## Limitations and assumptions

- **Manual entry:** The app does not connect to your bank by default. All balances and transactions are entered by you.
- **Local-first:** Data lives in your browser. The creator cannot access your data, passcode, or recovery key.
- **Single wallet per device:** One wallet per browser profile.
- **No financial advice:** Loan and tax numbers (optimizer, federal loan estimates) are illustrative and may not match your actual situation.
- **Official site:** The only official site is **https://iisauha.github.io/iisauhwallet/**. The creator will never ask for your passcode, recovery key, or financial data.

---

## Getting started

1. Open the app in your browser.
2. Complete the first-run security quiz if shown (5/5 required), then set a passcode. Optionally add a hint, security questions, and save the recovery key.
3. In **Snapshot**, add bank accounts and credit cards and enter current balances.
4. Add **pending** items when money is in motion; post them when it settles.
5. In **Recurring**, add salary, rent, subscriptions, and other repeating income or expenses.
6. Optionally add **Loans**, **Investing** accounts, **Spending** entries, and **Sign-up bonus tracker** cards.
7. Back up regularly: Settings > Export JSON.

---

## Repository and contact

- **Source:** [https://github.com/iisauha/iisauhwallet](https://github.com/iisauha/iisauhwallet)
- **Contact:** [iisauhaguilar@gmail.com](mailto:iisauhaguilar@gmail.com)
- For security and privacy details, see the in-app **Security Policy** (Settings > Security Policy).
