# iisauhwallet

**iisauhwallet** is a manual-first personal finance tracker designed to help you manage spending, balances, pending transfers, recurring income and expenses, subscription or spending goals, investment tracking, and financial planning—all with you in control.

The app is intentionally **manual-first**: you decide what to enter and when. No automatic pulling of bank data in the public version; you stay in the driver’s seat.

---

## Why this app exists

- Many finance apps are heavily automated and can feel opaque or out of your control.
- Spreadsheets are powerful but often awkward to use on a phone.
- A lot of people want full control over what gets recorded and when.
- iisauhwallet focuses on **speed**, **clarity**, and **manual control** so you can track your money the way you like.

---

## Why it’s safe

- The app relies on **manual input**. You choose what to record.
- **No financial account credentials** are collected. You never enter bank usernames or passwords into the app.
- The application **does not automatically retrieve** your bank data. What you see is what you enter (and what you choose to store locally).

---

## Core features

### Snapshot

A single-screen overview of your balances and financial picture: cash, accounts, and a quick view of where things stand.

### Spending

Log purchases and expenses manually as they happen. Add amount, category, and optional notes. Great for tracking daily spending without waiting for bank updates.

### Pending inbound / Pending outbound

Track transfers that are in progress—money moving between your accounts or to/from elsewhere. You can record them as soon as you initiate them and clear them when they settle.

### Upcoming

See future scheduled payments or transfers so you can plan around bills and known expenses.

### Recurring

Define recurring income (e.g. salary) and recurring expenses (e.g. rent, subscriptions). The app uses these to help you plan and to show expected cash flow.

### SUB Tracker

Track spending goals such as credit card bonus progress (e.g. “spend $X in 3 months”). You set the target and log spending; the app shows how close you are.

### Investing

Manually track investment account balances over time. No automatic sync—you enter the numbers when you want to update.

### Settings

Manage categories, colors, and other configuration so the app matches how you think about your money.

---

## Example real-life scenarios

- **Log a purchase right away** — You buy coffee; you add it in Spending immediately instead of waiting for the bank to show it.
- **Track a transfer before it settles** — You move money from checking to savings. You add it as pending outbound (and later pending inbound or as an adjustment) so your snapshot stays accurate.
- **Monitor progress toward a spending goal** — You’re working on a card bonus; you use SUB Tracker to see how much you’ve spent and how much is left.
- **Plan around upcoming bills** — You add rent and utilities in Upcoming so you know what’s due and when.
- **Replace spreadsheets on the go** — You get a mobile-friendly tracker that works in the browser without tying you to a desktop spreadsheet.

---

## How to use

1. **Set your balances** — In Snapshot, enter or adjust your cash and account balances so the app reflects reality.
2. **Add categories** — In Settings, create or edit categories so you can tag spending and recurring items.
3. **Log spending** — Use Spending to record purchases and expenses as they happen.
4. **Track transfers** — Use Pending inbound / Pending outbound for money in motion; clear or resolve them when they settle.
5. **Manage recurring items** — In Recurring, add income and expenses that repeat (e.g. monthly rent, paychecks).
6. **Review your snapshot** — Use Snapshot and Upcoming to see where you stand and what’s coming.

---

## Running locally

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Start the development server**
   ```bash
   npm run dev
   ```

3. **Open the app**  
   Vite will print a local URL (e.g. `http://localhost:5173/iisauhwallet/`). Open it in your browser.

4. **Optional backend**  
   The app works fully without a backend. If you use the optional server for extra features, see `server/README.md` for setup (e.g. run on port 3001; the dev server can proxy `/api` to it).

---

## Deploy to GitHub Pages

The repo is set up for auto-deploy to GitHub Pages on every push to `main`.

1. **One-time setup** — In the repo on GitHub: **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions**.
2. **Deploy** — Push to `main`. The workflow in `.github/workflows/deploy.yml` runs: it builds the app and deploys the `dist` output. The site will be at `https://<your-username>.github.io/iisauhwallet/`.

No extra config needed; just push to `main` and GitHub runs the deploy.

---

## Project philosophy

- **Manual-first** — You enter and control your data.
- **Transparent** — No hidden automation; you see what you’ve entered.
- **Flexible** — Use as much or as little of the app as you need.
- **Mobile-friendly** — Use it on your phone or desktop in the browser.
- **You stay in control** — Your information stays in your browser unless you choose otherwise.

---

For privacy practices, see the in-app **Privacy** page (e.g. via Settings or the privacy route).
