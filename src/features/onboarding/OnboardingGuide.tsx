import { useState } from 'react';
import { Modal } from '../../ui/Modal';

type Section = { title: string; content: React.ReactNode };

const SECTIONS: Section[] = [
  {
    title: 'How to Add to Your Home Screen',
    content: (
      <div style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--ui-primary-text, var(--text))' }}>
        <p style={{ marginTop: 0 }}>This app is a website. Adding it to your home screen makes it feel and open like a real app.</p>
        <ol style={{ paddingLeft: 20, margin: '0 0 12px 0' }}>
          <li style={{ marginBottom: 8 }}>Open <strong>https://iisauha.github.io/iisauhwallet/</strong> in Safari</li>
          <li style={{ marginBottom: 8 }}>Tap the three dots in the bottom right of the screen (next to the URL bar)</li>
          <li style={{ marginBottom: 8 }}>Tap <strong>Share</strong> at the top of the menu</li>
          <li style={{ marginBottom: 8 }}>Tap <strong>View More</strong> (looks like an upside-down chevron)</li>
          <li style={{ marginBottom: 8 }}>Tap <strong>Add to Home Screen</strong> (square icon with a + inside)</li>
          <li style={{ marginBottom: 8 }}>Name the app whatever you want. The creator named it iisauhwallet but feel free to call it anything :)</li>
          <li style={{ marginBottom: 8 }}><strong>IMPORTANT: Uncheck "Open as Web App"</strong></li>
          <li>Tap <strong>Add</strong> in the top right</li>
        </ol>
        <p style={{ margin: '12px 0 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
          Why uncheck "Open as Web App"? The app was built to work as a regular Safari website. Leaving it checked causes the app to malfunction. Always keep it unchecked.
        </p>
      </div>
    ),
  },
  {
    title: 'Security: What You Need to Know',
    content: (
      <div style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--ui-primary-text, var(--text))' }}>
        <p style={{ marginTop: 0 }}>Your data lives entirely on your device inside Safari's local storage. It is never sent to any server. The creator of this app cannot see your data, ever.</p>
        <p><strong>The 6-digit passcode</strong> is the gate. Nobody gets in without it.</p>
        <p><strong>What encryption does:</strong> When you export a backup you can encrypt it with your passcode. Without the passcode the file looks like random gibberish:</p>
        <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', background: 'var(--ui-surface-secondary, var(--surface))', borderRadius: 8, padding: '8px 12px', margin: '8px 0', wordBreak: 'break-all', color: 'var(--muted)' }}>
          U2FsdGVkX1+kZ3xQ8pM2V7nRtYwJhF0B...4gX9cLm1pQ6nWsKdA8vBzRy
        </div>
        <p><strong>How safe is it really?</strong> A bad actor would need to: get your physical phone past Face ID, find this specific app, bypass the passcode with lockout protection, open dev tools on mobile (very hard), then decrypt the data. And all they would find is a finance journal with hand-entered balances. No bank credentials. No account numbers. Nothing they could use to access anything.</p>
        <p style={{ margin: '12px 0 0 0', padding: '10px 12px', background: 'rgba(220,38,38,0.1)', borderRadius: 8, borderLeft: '3px solid var(--red)', fontSize: '0.88rem' }}>
          <strong>Do not type actual card numbers, account numbers, passwords, or Social Security numbers into this app.</strong> Track balances and account names only (like "Chase Checking" or "Amex Gold").
        </p>
      </div>
    ),
  },
  {
    title: 'Personalize the Look and Feel',
    content: (
      <div style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--ui-primary-text, var(--text))' }}>
        <p style={{ marginTop: 0 }}>Go to Settings (tap your name or avatar at the top) and then tap <strong>App Customization</strong> to change how the app looks.</p>
        <p><strong>Themes:</strong> Royal (default), Midnight, Aurora, Jade, Plum, Copper, Mocha, Steel, and more. Light themes too: Light, Arctic, Sakura. Each theme changes the background, surfaces, and accent all at once.</p>
        <p><strong>Fonts:</strong> Dozens of options: SF Pro, Inter, Roboto, DM Sans, Helvetica, Georgia, Playfair, and more. Tap any to preview instantly.</p>
        <p><strong>Font Size:</strong> Small, Medium, or Large.</p>
        <p><strong>Surface Style:</strong> Standard or frosted glass (cards blur the animated background behind them).</p>
        <p><strong>Accent Color:</strong> Pick any custom hex color on top of any theme.</p>
        <p style={{ marginBottom: 0 }}><strong>Tabs:</strong> Go to Settings and tap <strong>Manage Tabs</strong> to hide tabs you do not use or drag them into a different order.</p>
      </div>
    ),
  },
  {
    title: 'Snapshot Tab',
    content: (
      <div style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--ui-primary-text, var(--text))' }}>
        <p style={{ marginTop: 0 }}>Your main financial dashboard. Shows where your money is right now.</p>
        <p><strong>Cash:</strong> All your bank accounts. Tap the header to expand. Swipe through accounts. Tap <strong>+ Add</strong> to create one, tap any card to edit its balance.</p>
        <p><strong>Credit Cards:</strong> All your credit cards and what you owe. Tap <strong>+ Add</strong> to add one. Tap a card to edit balance or set up reward rules (cashback, miles, points) so the app can suggest which card to use when you shop.</p>
        <p><strong>Pending Inbound:</strong> Money on its way to you (bank transfer, Venmo, etc.). Swipe through pending items. Tap <strong>Post</strong> when it arrives and the account balance updates.</p>
        <p><strong>Pending Outbound:</strong> Money you have sent but that has not cleared yet. Swipe through items and tap <strong>Post</strong> when it clears.</p>
        <p style={{ marginBottom: 0 }}><strong>Net Cash:</strong> At the bottom of the page. Your total bank balance minus total credit card debt, adjusted for pending items. "If everything settled right now, where do I stand?"</p>
      </div>
    ),
  },
  {
    title: 'Spending Tab',
    content: (
      <div style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--ui-primary-text, var(--text))' }}>
        <p style={{ marginTop: 0 }}>Log every purchase manually and see where your money goes by category.</p>
        <p><strong>Adding a purchase:</strong> Tap the "+" button in the bottom right corner and choose "Log a purchase." The app suggests which card earns the best rewards for that spending category.</p>
        <p><strong>Views:</strong> Toggle between Categories (donut chart with tappable category grid below), Sources (spending by payment source), and Rewards (current points/miles/cashback balances across all cards).</p>
        <p><strong>Date ranges:</strong> This month, last month, all time, or custom.</p>
        <p><strong>Search:</strong> Tap the magnifying glass icon to search purchases by name, category, or subcategory. Supports regex patterns like /coffee|tea/.</p>
        <p><strong>Reward tracking:</strong> After logging a purchase on a rewards card, confirm how many points/miles/cashback you earned and it gets added to that card's balance.</p>
        <p style={{ marginBottom: 0 }}><strong>Reimbursable purchases:</strong> Mark purchases as reimbursable (a work expense someone is paying you back for) and they are excluded from your personal totals.</p>
      </div>
    ),
  },
  {
    title: 'Upcoming Tab',
    content: (
      <div style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--ui-primary-text, var(--text))' }}>
        <p style={{ marginTop: 0 }}>A calendar for your money. Shows every expected paycheck and bill coming up in the next 14, 21, 30, or 45 days.</p>
        <p><strong>Expected Income:</strong> Automatically pulled from your recurring income items. Shows each upcoming paycheck or deposit with how many days away it is, highlighted in green.</p>
        <p><strong>Expected Costs:</strong> Bills and expenses from your recurring list, shown on their expected dates, in red. You can adjust the amount for one specific occurrence without touching the permanent recurring item.</p>
        <p><strong>Move to Pending:</strong> When you have already sent a payment and want to track it as "in motion," tap the button next to it. It becomes a Pending Outbound in the Snapshot tab.</p>
        <p><strong>Summary:</strong> At the top the page shows your current cash, adds expected income, subtracts expected costs, and tells you what you will be left with. If any item has a min/max range, the summary shows that range too.</p>
        <p style={{ marginBottom: 0 }}><strong>Dismiss:</strong> If an occurrence does not apply this time, dismiss it without affecting the underlying recurring item.</p>
      </div>
    ),
  },
  {
    title: 'Recurring Tab',
    content: (
      <div style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--ui-primary-text, var(--text))' }}>
        <p style={{ marginTop: 0 }}>Set up anything that repeats and it will automatically flow into Upcoming and optionally into Snapshot.</p>
        <p><strong>Recurring Income:</strong> Salary, freelance checks, side income, rental income, anything that comes in regularly. Set the name, amount, frequency (monthly, weekly, biweekly, yearly, or every X days), start date, and which account it deposits into. Toggle "autopay" to automatically create a Pending Inbound item when it is due.</p>
        <p><strong>Recurring Expenses:</strong> Rent, subscriptions, insurance, loan payments, anything that repeats. Link an expense to a loan and it will always use the current estimated payment amount. "Apply to Snapshot" means the expense actually updates your account balances when processed.</p>
        <p><strong>Split amounts:</strong> If you share an expense with a roommate, set your portion so only your share counts.</p>
        <p style={{ marginBottom: 0 }}><strong>Monthly totals:</strong> The tab shows total monthly income and total monthly expenses normalized to a monthly basis regardless of each item's frequency.</p>
      </div>
    ),
  },
  {
    title: 'Loans Tab',
    content: (
      <div style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--ui-primary-text, var(--text))' }}>
        <p style={{ marginTop: 0 }}>Track federal student loans and private loans in one place.</p>
        <p><strong>Federal Loans:</strong> Add your federal student loans. The app estimates monthly payments for each repayment plan (Standard, IDR, PAYE, SAVE, IBR, ICR) and shows years to potential forgiveness for each. You can log your current status: in school, grace period, deferment, forbearance, or active repayment.</p>
        <p><strong>Private Loans:</strong> Add private loans with balance, interest rate, and a payment mode: custom monthly amount, full amortized repayment, interest-only, or deferred. Set date ranges for different modes. For example: deferred through graduation, then interest-only for a year, then full repayment.</p>
        <p><strong>Swipe between views:</strong> Each loan card has two views you can swipe between. Balance and payment info on one side, notes and details on the other.</p>
        <p><strong>Loan Tools:</strong> Tap "Loan Tools" for a payment scenario calculator. Experiment without changing your actual loan data.</p>
        <p style={{ marginBottom: 0 }}><strong>Posting payments:</strong> Create a Pending Outbound directly from the Loans tab. For multiple private loans, you see the breakdown and can adjust the allocation per loan.</p>
      </div>
    ),
  },
  {
    title: 'Investing Tab',
    content: (
      <div style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--ui-primary-text, var(--text))' }}>
        <p style={{ marginTop: 0 }}>Track all investment accounts: HYSA, Roth IRA, 401(k), Traditional IRA, and general brokerage. Includes a Coast FIRE calculator.</p>
        <p><strong>Balances:</strong> Tap any account to update its balance. Everything is entered manually. The app does not connect to any brokerage.</p>
        <p><strong>HYSA sub-buckets:</strong> Each HYSA has two buckets: Reserved (savings you are not touching) and Bills (money set aside for upcoming bills). The Bills bucket is what the Upcoming tab counts as available liquid cash. Use Allocate to move between them without changing the total balance.</p>
        <p><strong>Transfers:</strong> Tap "Transfer" to move money between a bank account and an investing account. This creates a Pending Outbound in Snapshot so you can track it while it is in motion.</p>
        <p><strong>Interest accrual:</strong> For HYSA accounts, tap "Accrue Interest" and the app calculates and adds the monthly interest based on the current APY.</p>
        <p style={{ marginBottom: 0 }}><strong>Coast FIRE Calculator:</strong> Enter your age, retirement age, expected spending in retirement, safe withdrawal rate, market return, and inflation. The calculator shows your FIRE Number, whether you have hit Coast FIRE, and projects your portfolio year by year on a chart.</p>
      </div>
    ),
  },
  {
    title: 'Bonuses Tab',
    content: (
      <div style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--ui-primary-text, var(--text))' }}>
        <p style={{ marginTop: 0 }}>Track credit card sign-up bonuses. These typically require spending a target amount in the first few months to earn a large reward.</p>
        <p><strong>Adding a tracker:</strong> Tap <strong>+ Add</strong>, pick the card, set the deadline, and define the spending tiers. For example: spend $500 to get 50,000 points, spend $1,000 to get an additional 25,000 points.</p>
        <p><strong>Tracking progress:</strong> Enter how much you have spent toward the bonus so far. The tracker shows which tiers you have unlocked, how much more you need for the next tier, and how many days remain until the deadline.</p>
        <p><strong>Completing a bonus:</strong> Tap <strong>Complete</strong> when you hit your target. Choose which tiers you earned and the app logs the reward to your balance. Points, miles, and cashback are all tracked separately.</p>
        <p style={{ marginBottom: 0 }}><strong>History:</strong> Completed bonuses are saved in the Completed section so you can see every card you have earned a bonus from and the total value.</p>
      </div>
    ),
  },
  {
    title: 'Settings Tab',
    content: (
      <div style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--ui-primary-text, var(--text))' }}>
        <p style={{ marginTop: 0 }}>Tap your name or avatar in the top bar to open Settings.</p>
        <p><strong>Profile:</strong> Set your display name and upload a profile photo. Stored on your device only.</p>
        <p><strong>App Customization:</strong> Theme, fonts, font size, accent color, surface style.</p>
        <p><strong>Manage Tabs:</strong> Reorder or hide tabs in the navigation bar.</p>
        <p><strong>Edit Account Names:</strong> Rename any bank, card, or investing account without losing data.</p>
        <p><strong>Manage Categories:</strong> Create, rename, and delete spending categories and subcategories.</p>
        <p><strong>Security:</strong> Pause/resume the passcode, reset it, or set an auto-lock timer.</p>
        <p><strong>Export JSON:</strong> Full backup of all your data. Encrypt it with your passcode for extra protection. Back up regularly.</p>
        <p><strong>Import JSON:</strong> Restore from a backup file. Works across devices and browsers. Just enter the passcode used when the backup was exported.</p>
        <p style={{ marginBottom: 0 }}><strong>Export Purchases CSV:</strong> This month's purchases as a CSV file you can open in a spreadsheet.</p>
      </div>
    ),
  },
  {
    title: 'Backing Up Your Data',
    content: (
      <div style={{ fontSize: '0.82rem', lineHeight: 1.45, color: 'var(--ui-primary-text, var(--text))' }}>
        <p style={{ marginTop: 0 }}>Your data lives in Safari's local storage on your device. If Safari data is cleared, your phone is lost, or you switch browsers, your data goes with it unless you have a backup.</p>
        <p><strong>How to back up:</strong> Settings {'>'} Export JSON. Save the file to iCloud Drive or another safe location outside your phone. Do this regularly. Once a week is a good habit.</p>
        <p><strong>Encrypted backups:</strong> When you export you can encrypt the file with your passcode. If you do this, you need your passcode to open the backup later.</p>
        <p><strong>Restoring:</strong> Settings {'>'} Import JSON. Select the backup file and enter the export passcode. Works on any device or browser. The app reloads with all your data restored.</p>
        <p><strong>Recovery key:</strong> You saved a recovery key during setup. Keep it somewhere safe. It is how you reset your passcode if you forget it. Without it (and without security question answers), forgetting your passcode may require wiping the app data and restoring from a backup.</p>
        <p style={{ margin: '12px 0 0 0', padding: '10px 12px', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', borderRadius: 8, borderLeft: '3px solid var(--accent)', fontSize: '0.88rem' }}>
          You are all set. Tap <strong>Enter App</strong> below to get started.
        </p>
      </div>
    ),
  },
];

const ONBOARDING_DONE_KEY = 'iisauhwallet_onboarding_done_v1';

export function markOnboardingDone() {
  try { localStorage.setItem(ONBOARDING_DONE_KEY, '1'); } catch (_) {}
}

export function isOnboardingDone(): boolean {
  try { return localStorage.getItem(ONBOARDING_DONE_KEY) === '1'; } catch (_) { return true; }
}

export function OnboardingGuide({ onDone, canClose, onClose }: { onDone: () => void; canClose?: boolean; onClose?: () => void }) {
  const [idx, setIdx] = useState(0);
  const section = SECTIONS[idx];
  const isLast = idx === SECTIONS.length - 1;
  const isFirst = idx === 0;

  // Settings app guide is more compact so each page fits without scrolling
  const compact = !!canClose;

  function handleNext() {
    if (isLast) {
      markOnboardingDone();
      onDone();
    } else {
      setIdx(idx + 1);
    }
  }

  function handleBack() {
    if (!isFirst) setIdx(idx - 1);
  }

  const inner = (
    <>
      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginBottom: compact ? 10 : 16, flexShrink: 0 }}>
        {SECTIONS.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === idx ? 18 : 6,
              height: 6,
              borderRadius: 3,
              background: i === idx
                ? 'var(--ui-add-btn, var(--accent))'
                : i < idx
                  ? 'color-mix(in srgb, var(--ui-add-btn, var(--accent)) 45%, transparent)'
                  : 'var(--ui-border, var(--border))',
              transition: 'width 0.2s ease, background 0.2s ease',
            }}
          />
        ))}
      </div>

      {/* Card */}
      <div
        className={compact ? 'guide-compact' : undefined}
        style={{
          background: 'var(--ui-card-bg, var(--surface))',
          borderRadius: 16,
          border: '1px solid var(--ui-border, var(--border))',
          padding: compact ? '10px 14px 8px' : '10px 14px 10px',
          flex: '1 1 0',
          overflowY: 'auto',
          minHeight: 0,
        }}
      >
        <h2
          style={{
            margin: compact ? '0 0 6px 0' : '0 0 6px 0',
            fontSize: compact ? '0.95rem' : '0.98rem',
            fontWeight: 700,
            color: 'var(--ui-title-text, var(--text))',
            lineHeight: 1.3,
          }}
        >
          {section.title}
        </h2>
        {section.content}
      </div>

      {/* Step counter + Buttons right below card */}
      <div style={{ flexShrink: 0, paddingTop: 8 }}>
        <div style={{ textAlign: 'center', fontSize: '0.78rem', color: 'var(--muted)', marginBottom: 6 }}>
          {idx + 1} of {SECTIONS.length}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isFirst && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ flex: '0 0 auto', minWidth: 72 }}
              onClick={handleBack}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={handleNext}
          >
            {isLast ? (canClose ? 'Done' : 'Enter App') : 'Next'}
          </button>
        </div>
      </div>
    </>
  );

  if (canClose) {
    return (
      <Modal open fullscreen title="App Guide" onClose={onClose} className="guide-modal">
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          {inner}
        </div>
      </Modal>
    );
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--bg)',
        zIndex: 9000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px 16px',
        animation: 'passcodeFadeIn 0.3s ease-out',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          display: 'flex',
          flexDirection: 'column',
          height: 'calc(100vh - 40px)',
        }}
      >
        {inner}
      </div>
    </div>
  );
}
