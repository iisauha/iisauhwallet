# iisauh wallet

A personal finance dashboard that helps you track **every dollar**: bank balances, credit cards, HYSA buckets, pending money, recurring expenses, loans, investing, and sign-up bonus progress. All in one place, under your control.

---

## Overview

**iisauh wallet** is a **manual-entry, local-first** finance app. You enter your own numbers. There is no required connection to your bank. The app gives you a single place to see where your money is and where it's going.

**What you can track:**

- **Bank balances** — Checking, savings, cash on hand  
- **Credit cards** — Balances, what you owe, optional reward category/subcategory for spending suggestions  
- **HYSA** — Balances, APY, reserved savings vs. money designated for bills; optional link to a checking account so “bills” portion counts as liquid  
- **Pending inbound / outbound** — Money in motion (transfers, payments not yet settled)  
- **Recurring** — Income and expenses (salary, rent, subscriptions, loan payments); can feed into Upcoming and Snapshot  
- **Loans** — Federal (with IDR/repayment estimates) and private student or other loans; payment and payoff views  
- **Investing** — HYSA, Roth IRA, 401k, general investing; transfers between cash and investing  
- **Sign-up bonus tracker** — Credit card bonuses and progress toward spend targets  

**Philosophy:** Track every dollar, including money moving between accounts and money in apps like Venmo. You stay in control; the app does not pull data from your bank unless you explicitly use an optional backend/Plaid feature.

---

## Architecture and data storage

- **Local-first:** All wallet data is stored locally in your browser (e.g. localStorage). The creator does not have access to your financial data. Data is not stored on a central server by default.
- **Manual input:** There is no direct connection to your bank by default. Users manually enter balances and transactions. Optional features (e.g. Plaid-based detected activity) require a separate backend you configure.
- **Device sync (optional):** In Settings → Device Sync you can create a 6-digit sync code on one device and enter it on another so they share the same wallet. Sync is optional; if you don’t use it, everything stays local.
- **Security:** Passcode protection, optional hint, security questions, and recovery key are stored only on your device. See “Passcode and recovery” and the in-app **Security Policy** (Settings → Security Policy) for full details.

---

## Main tabs and features

### Snapshot

Your main financial overview.

- **Cash** — Total across bank accounts and any cash you track  
- **Credit cards** — Balances and total card debt  
- **Pending inbound** — Money you’re expecting (e.g. a transfer not yet received)  
- **Pending outbound** — Money on its way out (e.g. a payment sent but not yet cleared)  
- **Final net cash** — Cash minus card debt, adjusted for pending. “If everything settled right now, where would I stand?”

You can add/edit bank accounts, credit cards, pending inbound/outbound, and post pending items (with optional bank/card target, refund handling, and loan adjustments for private loans). For pending outbound you can choose source: bank, card, or HYSA (and if HYSA, whether to use “money designated for bills” or “reserved savings”). Snapshot is the only place that combines cash, credit, and pending in one view.

**Reward card config:** Per credit card you can set a reward category and subcategory (and “catch-all”). When adding a purchase in Spending, the app can suggest that category/subcategory for that card.

### Spending

Log purchases manually with amount, category, subcategory, and optional notes. View spending by category, totals for this month, last month, or custom ranges. Export monthly purchases as CSV. Categories and subcategories are customizable in Settings → Manage Categories. Cards can have a reward category/subcategory so the app suggests categories when you log a purchase on that card.

### Upcoming

Shows expected income and expenses in a time window, and “amount remaining” after expected costs. Uses recurring income and recurring expenses to build the timeline. **Linked HYSA liquidity:** If you have an HYSA with a linked checking account, the “money in HYSA designated for bills” portion is added to your effective cash for this view so you see how much you have including that liquid HYSA portion. You can move expected income or expected costs into **pending** (e.g. “Add to pending inbound” or “Add to pending outbound”); moving a cost to pending can optionally add a spending entry when you later post it.

### Recurring

Track repeating income and expenses: salary, rent, subscriptions, loan payments. Recurring items feed into **Upcoming** (expected income/costs) and can be linked to loans so the planned expense uses the loan’s current estimated payment. You can set:

- Frequency (monthly, weekly, biweekly, yearly, custom interval)  
- Payment source/target (bank, card, or HYSA; if HYSA, which sub-bucket)  
- Whether to “apply to snapshot” (when you run “Process recurring up to today,” income can update bank balances and expenses can create purchases and update snapshot)  
- Optional link to a loan so the recurring amount uses that loan’s estimated payment  

**Optimizer:** From Recurring you can open the **457(b) optimizer** (Run optimizer / View last result). It uses your recurring data for autofill and computes take-home, taxes, and expenses (including public/private loan amounts). You can override assumptions and public loan payment; results are saved so you can view “last result” without re-running.

### Loans

- **Federal (public) loans:** Support for federal student loan parameters, IDR/repayment estimates, and payment modes (e.g. “current payment” vs “first payment date”). Summary cards show estimated payment and payoff info.  
- **Private loans:** Track balances, interest, and payment schedules. You can set payment ranges and modes. When posting pending outbound that includes private loan adjustments, you can override how much applies to each private loan.  
- **Recompute:** Private loan balances can be recomputed from payment history (e.g. after a batch post). Recompute cycle and last recompute date are stored.  
- **Recurring link:** Recurring expenses can use “loan estimated payment” and link to a loan so the amount stays in sync with the Loans tab.

### Investing / HYSA

- **HYSA:** Balance, APY, “reserved savings” vs “money in HYSA designated for bills.” You can link an HYSA to a checking account; only the “bills” portion is then treated as liquid in Upcoming (and when choosing HYSA source for pending outbound). **Adjust HYSA Allocation** moves money between reserved and bills without changing total balance.  
- **Roth IRA, 401k, general investing:** Track balances and optionally transfers between bank and investing.  
- **Coast FIRE / projections:** Investing page includes projection sections with info icons (e.g. Coast FIRE) that explain assumptions in a popup.  
- All balances are entered by you; no automatic pull from brokers.

### Sign-up bonus tracker (Sub Tracker)

Track credit card sign-up bonuses and progress toward spend targets. Add cards, set tiers and reward text (e.g. cash back, points), and mark progress. Useful for managing multiple cards and bonus deadlines.

### Settings

- **App Customization** — Colors, typography, surface styles (theme/accent, font stack, etc.).  
- **Edit Account Names** — Rename banks, cards, and investing accounts.  
- **Device Sync** — Create or join sync code to share wallet across devices (see “Device sync” above).  
- **Security** — Reset passcode (if you have one); requires current passcode then set new one. Recovery key and security questions unchanged.  
- **Security Policy** — Link to the in-app Security & Privacy Policy.  
- **FAQ** — Common questions; many answers point to the Security Policy for passcode/recovery/data details.  
- **Export JSON / Import JSON** — Full backup and restore of app data.  
- **Export monthly purchases CSV** — Current month’s purchases as CSV.  
- **App Guide** — Short in-app guide to tabs, data storage, and main features; link to full documentation on GitHub.  

---

## Passcode and recovery (local-only)

- Set a 4-digit passcode to open the app. Stored in hashed form on your device only; the creator cannot access it.  
- **First-run security onboarding:** Before setting a passcode for the first time, users complete a short required security quiz (5 questions). Must score 5/5 to proceed to passcode setup. Completion is stored locally so existing users are unaffected.  
- **Optional during setup:** Password hint, two security questions (hashed locally), and a one-time **recovery key** (save it when shown; only a hash is stored).  
- **Reset passcode:** Settings → Security → Reset passcode (current passcode then new one).  
- **Forgot passcode:** On the lock screen, “Forgot passcode?” then use recovery key or security questions to reset. The hint alone does not allow reset.  
- **Too many failed attempts:** After 10 incorrect attempts you can (1) **Confirm wipe** — clear all local app data and start fresh (you can re-import a JSON backup), or (2) **Don’t wipe** — lock recovery for 24 hours. All local; no credentials sent to any server.

See the in-app **Security Policy** for exact wording and official site URL.

---

## Device sync (optional)

- **Create sync code:** Settings → Device Sync → Create Sync Code. This device becomes the “source”; a 6-digit code is generated (expires in 15 minutes).  
- **Join:** On another device, enter the code to replace that device’s local data with the source wallet. After that, changes sync both ways (last-write-wins).  
- **Pause / Resume / Disconnect** — Pause stops pushing/pulling but keeps the link; disconnect keeps local data and stops syncing.  
- If you don’t use sync, everything stays local.

---

## Pending inbound / outbound flows

- **Pending inbound:** Money you expect to receive (e.g. transfer) that hasn’t hit an account yet. When it settles, you “post” it and can choose deposit target (bank, or card, or HYSA).  
- **Pending outbound:** Money you’ve committed (e.g. payment or transfer) that hasn’t cleared. You can choose source: bank, card, or HYSA (and if HYSA, liquid vs reserved). When posting, you can apply to bank/card and optionally run loan adjustments (e.g. private loan breakdown). Moving an expected cost from Upcoming to pending outbound can optionally create a spending entry when posted.  
- Posting or clearing pending items keeps Snapshot and balances accurate.

---

## Recurring → Upcoming / Snapshot flow

- Recurring income and expenses are projected into a time window and shown on **Upcoming** as expected income and expected costs.  
- “Process recurring up to today” (and similar logic) can mark recurring items as “posted” and, when **apply to snapshot** is set, update bank balances (income) or create purchases and update snapshot (expenses).  
- Recurring expenses can be linked to a loan and use that loan’s estimated payment so amounts stay in sync with the Loans tab.

---

## Loans: federal vs private, payment modes, recompute

- **Federal (public):** Parameters (e.g. balance, interest, repayment plan), IDR estimates, and payment modes such as “current payment” vs “first payment date.” Summary cards show estimated payment and payoff. Public loan monthly amount can be overridden for the optimizer.  
- **Private:** Balances, interest, payment schedules, and payment range modes. When posting pending outbound with loan adjustments, you can override how much goes to each private loan.  
- **Recompute:** Private loan balances can be recomputed from payment history; last recompute date and cycle are stored. Useful after batch posting.

---

## Optimizer (457(b))

- Opened from **Recurring** (Run optimizer / View last result).  
- Uses configurable assumptions (tax rates, deductions, etc.) and can autofill from recurring (rent, utilities, loans, etc.).  
- Computes take-home, taxes, expenses (including public/private loans), and optional 457(b) contribution. You can override public loan monthly amount.  
- Result is saved so you can view “View last result” without re-running. No financial data is sent to any server; all calculation is local.

---

## Reward card suggestion (Spending)

- In Snapshot you can set per-card **reward category** and **reward subcategory** (and catch-all).  
- In Spending, when adding a purchase and selecting that card, the app can suggest that category/subcategory.  
- Purely a convenience; you can always change the category.

---

## Detected activity (optional, backend-dependent)

- If your deployment has a backend that supports it, the app can show a “Detected activity” inbox: suggested transactions (e.g. from Plaid) to link to purchases or pending.  
- This is optional and requires a configured API. Without it, the app works fully with manual entry only.  
- Local ledger data and manual entry are not dependent on detected activity.

---

## Backup and export

- **Export JSON** — Full copy of app data (accounts, balances, pending, recurring, loans, investing, categories, settings, etc.). Use for backup or moving to another device.  
- **Import JSON** — Restores from a previously exported file. **Replaces** current data on the device.  
- **Export monthly purchases CSV** — Current month’s purchases as CSV.  
- Backing up regularly is recommended so you don’t lose data if the browser or device is cleared. After a wipe (e.g. too many failed passcode attempts), you can re-import a JSON backup.

---

## UI customization and hidden UI

- **App Customization** (Settings): Theme, accent color, font stack, surface styles.  
- **Tab order:** Tabs can be reordered by drag-and-drop; order is persisted.  
- **Info icons:** Some sections (e.g. Investing Coast FIRE, Device Sync) have a small circular “i” icon that opens a short explanation or the Security Policy modal.  
- **Security Policy** and **FAQ** in Settings; **App Guide** for a concise overview and link to full docs on GitHub.

---

## Limitations and assumptions

- **Manual entry:** The app does not connect to your bank by default. All balances and transactions are entered by you. Optional Plaid/detected activity depends on a backend you configure.  
- **Local-first:** Data lives in your browser (and optionally on a sync server if you enable Device Sync). The creator cannot access your data, passcode, or recovery key.  
- **Single wallet per device:** One wallet per device; Device Sync links devices to the same logical wallet.  
- **No financial advice:** The app is for tracking and planning only. Loan and tax numbers (e.g. optimizer, federal loan estimates) are illustrative and may not match your actual situation.  
- **Official site:** The only official site for this app is **https://iisauha.github.io/iisauhwallet/** . The creator will never ask for your passcode, recovery key, or financial data, and will never send you a different link to log in.

---

## Getting started

1. Open the app in your browser.  
2. Complete the first-run **security quiz** if shown (5/5 required), then set a **passcode**. Optionally add a hint, security questions, and save the **recovery key**.  
3. In **Snapshot**, add bank accounts and credit cards and enter current balances.  
4. Add **pending** items when money is in motion; **post** them when it settles.  
5. In **Recurring**, add salary, rent, subscriptions, and other repeating income or expenses.  
6. Optionally add **Loans**, **Investing** accounts, **Spending** entries, and **Sign-up bonus tracker** cards.  
7. Optionally enable **Device Sync** (Settings → Device Sync).  
8. Back up regularly: **Settings → Export JSON**.

---

## Repository and contact

- **Full documentation and source:** [https://github.com/iisauha/iisauhwallet](https://github.com/iisauha/iisauhwallet)  
- **Contact:** [iisauhaguilar@gmail.com](mailto:iisauhaguilar@gmail.com)  
- For security and privacy details, see the in-app **Security Policy** (Settings → Security Policy).
