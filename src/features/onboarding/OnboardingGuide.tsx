import { useState, useEffect, useRef } from 'react';
import { Modal } from '../../ui/Modal';
import {
  IconHome, IconShield, IconPalette,
  IconCalendar, IconRefreshCircle, IconBankBuilding, IconBarChartTrend,
  IconStar, IconDatabase, IconWallet, IconArrowExchange,
} from '../../ui/icons';

/* ------------------------------------------------------------------ */
/*  Data types                                                         */
/* ------------------------------------------------------------------ */

type DetailItem = {
  label: string;
  detail: string;
};

type Section = {
  icon: React.ReactNode;
  title: string;
  tagline: string;
  /** Helper text telling users where to find this feature. */
  hint?: string;
  items: DetailItem[];
  /** Show numbered steps instead of bullet labels. */
  numbered?: boolean;
  /** Optional callout shown below the items. */
  callout?: { text: string; variant: 'accent' | 'red' };
  /** If true, the callout is only shown in onboarding (not Settings). */
  calloutOnboardingOnly?: boolean;
};

/* ------------------------------------------------------------------ */
/*  Slide data                                                         */
/* ------------------------------------------------------------------ */

const SECTIONS: Section[] = [
  {
    icon: <IconHome />,
    title: 'Add to Home Screen',
    tagline: 'Make it feel like a real app.',
    numbered: true,
    items: [
      { label: 'Open in Safari', detail: 'Go to https://iisauha.github.io/iisauhwallet/ in Safari.' },
      { label: 'Share menu', detail: 'Tap the three dots (bottom right) then tap Share at the top.' },
      { label: 'Add to Home Screen', detail: 'Tap View More, then Add to Home Screen. Name it whatever you like.' },
      { label: 'Uncheck "Open as Web App"', detail: 'This is important. The app is built to run as a regular Safari page. Leaving it checked causes bugs.' },
    ],
  },
  {
    icon: <IconShield />,
    title: 'Security',
    tagline: 'Your data never leaves your device.',
    items: [
      { label: '100% local', detail: 'Everything lives in Safari on your phone. No servers, no cloud. Not even the app creator can see it.' },
      { label: 'Passcode protected', detail: 'A 6-digit passcode is the front door. Get it wrong too many times and lockout kicks in.' },
      { label: 'Encrypted backups', detail: 'Exporting a backup? Encrypt it with your passcode. Without it, the file is just random gibberish.' },
    ],
    callout: { text: 'Never type actual card numbers, account numbers, passwords, or SSNs. Track balances and names only.', variant: 'red' },
  },
  {
    icon: <IconPalette />,
    title: 'Make It Yours',
    tagline: 'Like choosing an outfit for your app.',
    hint: 'Tap your name at the top, then App Customization.',
    items: [
      { label: 'Themes', detail: 'Royal, Midnight, Aurora, Jade, Plum, Sakura, and more. Pick one and the whole app transforms.' },
      { label: 'Fonts & size', detail: 'Dozens of font families. Tap any to preview. Go Small for more info on screen or Large for easy reading.' },
      { label: 'Manage tabs', detail: 'Don\'t track loans? Hide that tab. Want Spending first? Drag it there.' },
    ],
  },
  {
    icon: <IconWallet />,
    title: 'Snapshot',
    tagline: 'Your financial dashboard.',
    hint: 'This is the first tab in the navigation bar.',
    items: [
      { label: 'Bank accounts & cash', detail: 'Checking, savings (not HYSA, those go in Investing), and physical cash. Tap a card then tap Update Balance. "Add" adds to your current balance, "Set" replaces it entirely.' },
      { label: 'Credit cards', detail: 'What you owe on each card. Same Update Balance logic for balances. You can also set up reward rules so the app suggests which card to use at checkout.' },
      { label: 'Pending inbound', detail: 'Money on the way to you. A Venmo from a friend splitting dinner, a work reimbursement, a bank transfer. Tap Mark Received when it lands.' },
      { label: 'Pending outbound', detail: 'Payments you\'ve sent that haven\'t cleared yet. Rent check in the mail, a credit card payment processing, a Zelle that\'s pending.' },
      { label: 'Net cash', detail: '"If everything settled right now, what do I actually have?" Banks minus cards, adjusted for pending.' },
    ],
  },
  {
    icon: <IconArrowExchange />,
    title: 'Spending',
    tagline: 'Where did my money go?',
    hint: 'Tap the $ tab in the navigation bar.',
    items: [
      { label: 'Log purchases', detail: 'Bought coffee? Groceries? Tap "+" and log it. The app suggests which card gets you the best rewards.' },
      { label: 'Split purchases', detail: 'Splitting a dinner bill? When logging a purchase, mark it as split and enter just your portion. The full amount stays on record but only your share counts.' },
      { label: 'Views', detail: 'See a donut chart of your categories, a breakdown by card, or your total reward balances across all cards.' },
      { label: 'Search', detail: '"How much have I spent on Uber this month?" Search by name or category and find out instantly.' },
      { label: 'Reimbursable', detail: 'Someone used your card for their purchase and they\'re paying you back (like a friend who Venmos you later). Mark it reimbursable so it doesn\'t count against your spending.' },
    ],
  },
  {
    icon: <IconCalendar />,
    title: 'Upcoming',
    tagline: 'Know what\'s coming before it hits.',
    hint: 'Tap the calendar tab in the navigation bar.',
    items: [
      { label: 'Works best with Recurring', detail: 'The easiest way to use this: set up your income and bills once in the Recurring tab and they auto-populate here every month (or whatever frequency you set). But you can also add one-time expected income or costs directly here if you need to.' },
      { label: 'Expected income', detail: 'Your next paycheck, freelance payment, rental income. Each shows a countdown so you know exactly when it lands.' },
      { label: 'Expected costs', detail: 'Rent due in 5 days, Netflix in 12, car insurance in 18. Each shows a countdown so you can plan ahead.' },
      { label: 'Summary', detail: '"I have $3,200 now, $2,800 coming in, $1,900 going out. I\'ll have $4,100 left." That\'s the summary.' },
    ],
  },
  {
    icon: <IconRefreshCircle />,
    title: 'Recurring',
    tagline: 'Set it once. It flows everywhere.',
    hint: 'Tap the refresh tab in the navigation bar.',
    items: [
      { label: 'Income', detail: 'Your paycheck, side hustle, whatever comes in regularly. Set the frequency and it auto-shows in Upcoming.' },
      { label: 'Expenses', detail: 'Rent, Spotify, gym, car payment. Anything that repeats. Link to a loan and it always uses the current amount.' },
      { label: 'Splitting', detail: 'Say your Verizon bill is $60/month but you split it with a roommate. Enter $60 as the full amount and turn on split. Your card still gets charged $60 (so rewards are based on $60), but only your portion counts in your totals. When you mark it complete, a pending inbound is auto-created for your roommate\'s share.' },
    ],
  },
  {
    icon: <IconBankBuilding />,
    title: 'Loans',
    tagline: 'Federal and private, all in one place.',
    hint: 'Tap the bank tab in the navigation bar.',
    items: [
      { label: 'Federal loans', detail: 'There\'s a button that opens the Student Aid website in Safari so you can grab your exact loan details. Or if you already know your balances, just type them in.' },
      { label: 'Private loans', detail: 'Car loan, personal loan, private student loan. Set the rate and payment mode. Switch between deferred and active as your situation changes.' },
      { label: 'Posting payments', detail: 'Link a recurring expense to a loan, then when you mark it complete in Upcoming, a popup shows how much is being subtracted from each loan. Confirm or adjust the amounts. After that, go to Loan Tools and tap Recompute to update your monthly payments based on the new balances.' },
    ],
  },
  {
    icon: <IconBarChartTrend />,
    title: 'Investing',
    tagline: 'Watch your money grow.',
    hint: 'Tap the chart tab in the navigation bar.',
    items: [
      { label: 'Balances', detail: 'Tap an account card, then tap Update Balance. "Add" adds to your current balance, "Set" replaces it with a new amount. Check your brokerage app for the latest number.' },
      { label: 'HYSA buckets', detail: 'Split your high-yield savings into Savings reserve (money you won\'t touch) and Bills fund (set aside for upcoming expenses like rent or insurance).' },
      { label: 'Interest accrual', detail: 'Estimates this month\'s HYSA interest by taking your current balance times your APY divided by 12. It\'s a simple estimate and doesn\'t account for daily deposits or withdrawals.' },
      { label: 'Coast FIRE', detail: '"Can I stop saving aggressively and still retire on time?" Enter your age, retirement age, and expected spending to find out.' },
    ],
  },
  {
    icon: <IconStar />,
    title: 'Bonuses',
    tagline: 'Don\'t leave free money on the table.',
    hint: 'Tap the star tab in the navigation bar.',
    items: [
      { label: 'Add a tracker', detail: '"Spend $4,000 in 3 months, get 60,000 points." Set it up and the app tracks your progress.' },
      { label: 'Track progress', detail: 'How much more to spend, how many days left. Like a progress bar for free rewards.' },
      { label: 'Complete & collect', detail: 'Hit your target? Tap Complete, pick the tiers you earned, and the reward logs to your card.' },
    ],
  },
  {
    icon: <IconDatabase />,
    title: 'Settings & Backup',
    tagline: 'Your safety net.',
    hint: 'Tap your name or avatar at the top of the screen.',
    items: [
      { label: 'Profile', detail: 'Set your display name and photo. Just for you, stored on your device only.' },
      { label: 'Customization', detail: 'Themes, fonts, surface style, tab order. Make the app look exactly how you want it.' },
      { label: 'Backup', detail: 'One tap to export everything. Save to iCloud Drive or Files. Think of it like a save file for a video game.' },
      { label: 'Restore', detail: 'New phone? Different browser? Import your backup and everything comes back exactly how you left it.' },
      { label: 'Recovery key', detail: 'You saved one during setup. Keep it somewhere safe. It\'s your "forgot my passcode" lifeline.' },
    ],
    callout: { text: 'You\'re all set. Tap Enter App below to get started.', variant: 'accent' },
    calloutOnboardingOnly: true,
  },
];

/* ------------------------------------------------------------------ */
/*  Static pill with staggered entrance                                */
/* ------------------------------------------------------------------ */

function DetailPill({ label, detail, delay, step }: { label: string; detail: string; delay: number; step?: number }) {
  return (
    <div
      className="guide-pill"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
        borderRadius: 12,
        padding: '10px 12px',
        color: 'var(--ui-primary-text, var(--text))',
        fontFamily: 'inherit',
        fontSize: '0.8rem',
        lineHeight: 1.4,
        opacity: 0,
        animation: `guidePillIn 0.35s ease-out ${delay}ms forwards`,
        borderLeft: '3px solid color-mix(in srgb, var(--accent) 40%, transparent)',
      }}
    >
      {step != null && (
        <span style={{
          flexShrink: 0,
          width: 24,
          height: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
          color: 'var(--accent)',
          fontSize: '0.72rem',
          fontWeight: 700,
        }}>
          {step}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        <span style={{
          display: 'block',
          marginTop: 2,
          color: 'var(--muted)',
          fontSize: '0.76rem',
          lineHeight: 1.35,
        }}>
          {detail}
        </span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Exports                                                            */
/* ------------------------------------------------------------------ */

const ONBOARDING_DONE_KEY = 'iisauhwallet_onboarding_done_v1';

export function markOnboardingDone() {
  try { localStorage.setItem(ONBOARDING_DONE_KEY, '1'); } catch (_) {}
}

export function isOnboardingDone(): boolean {
  try { return localStorage.getItem(ONBOARDING_DONE_KEY) === '1'; } catch (_) { return true; }
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function OnboardingGuide({ onDone, canClose, onClose }: { onDone: () => void; canClose?: boolean; onClose?: () => void }) {
  const [idx, setIdx] = useState(0);
  const [slideKey, setSlideKey] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const section = SECTIONS[idx];
  const isLast = idx === SECTIONS.length - 1;
  const isFirst = idx === 0;

  const compact = !!canClose;

  function go(next: number) {
    setIdx(next);
    setSlideKey(k => k + 1);
  }

  // Scroll card to top on slide change
  useEffect(() => {
    cardRef.current?.scrollTo(0, 0);
  }, [idx]);

  function handleNext() {
    if (isLast) {
      markOnboardingDone();
      onDone();
    } else {
      go(idx + 1);
    }
  }

  function handleBack() {
    if (!isFirst) go(idx - 1);
  }

  // Inject keyframes once
  useEffect(() => {
    const id = 'guide-keyframes';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = `
      @keyframes guidePillIn {
        from { opacity: 0; transform: translateY(8px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes guideHeroIn {
        from { opacity: 0; transform: scale(0.85) rotate(-5deg); }
        to   { opacity: 1; transform: scale(1) rotate(0deg); }
      }
      @keyframes guideTagIn {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes guideCardIn {
        from { opacity: 0.6; transform: translateX(16px); }
        to   { opacity: 1; transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  const showCallout = section.callout && !(compact && section.calloutOnboardingOnly);

  const inner = (
    <>
      {/* Progress dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginBottom: compact ? 8 : 14, flexShrink: 0 }}>
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
        key={slideKey}
        ref={cardRef}
        className={compact ? 'guide-compact' : undefined}
        style={{
          background: 'var(--ui-card-bg, var(--surface))',
          borderRadius: 16,
          border: '1px solid var(--ui-border, var(--border))',
          padding: compact ? '10px 14px 8px' : '14px 16px 12px',
          flex: '1 1 0',
          overflowY: 'auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          animation: 'guideCardIn 0.3s ease-out',
        }}
      >
        {/* Hero icon + title + tagline + hint */}
        <div style={{ textAlign: 'center', marginBottom: 14, flexShrink: 0 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
            color: 'var(--accent)',
            marginBottom: 10,
            animation: 'guideHeroIn 0.35s ease-out',
          }}>
            <span style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {section.icon}
            </span>
          </div>
          <h2 style={{
            margin: '0 0 3px 0',
            fontSize: '1.05rem',
            fontWeight: 700,
            color: 'var(--ui-title-text, var(--text))',
            lineHeight: 1.3,
            animation: 'guideTagIn 0.3s ease-out 0.1s both',
          }}>
            {section.title}
          </h2>
          <p style={{
            margin: 0,
            fontSize: '0.82rem',
            color: 'var(--muted)',
            lineHeight: 1.3,
            animation: 'guideTagIn 0.3s ease-out 0.15s both',
          }}>
            {section.tagline}
          </p>
          {section.hint && (
            <p style={{
              margin: '6px 0 0 0',
              fontSize: '0.74rem',
              color: 'var(--accent)',
              lineHeight: 1.3,
              opacity: 0.8,
              animation: 'guideTagIn 0.3s ease-out 0.2s both',
            }}>
              {section.hint}
            </p>
          )}
        </div>

        {/* Pills — staggered entrance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
          {section.items.map((item, i) => (
            <DetailPill
              key={`${slideKey}-${i}`}
              label={item.label}
              detail={item.detail}
              delay={80 + i * 60}
              step={section.numbered ? i + 1 : undefined}
            />
          ))}
        </div>

        {/* Optional callout */}
        {showCallout && (
          <div style={{
            marginTop: 12,
            padding: '8px 12px',
            borderRadius: 8,
            borderLeft: `3px solid var(--${section.callout!.variant === 'red' ? 'red' : 'accent'})`,
            background: section.callout!.variant === 'red'
              ? 'color-mix(in srgb, var(--red, var(--danger)) 12%, transparent)'
              : 'color-mix(in srgb, var(--accent) 12%, transparent)',
            fontSize: '0.8rem',
            lineHeight: 1.4,
            color: 'var(--ui-primary-text, var(--text))',
            flexShrink: 0,
            opacity: 0,
            animation: `guidePillIn 0.3s ease-out ${80 + section.items.length * 60}ms forwards`,
          }}>
            {section.callout!.text}
          </div>
        )}
      </div>

      {/* Step counter + Buttons */}
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
