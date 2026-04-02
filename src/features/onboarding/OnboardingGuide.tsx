import { useState } from 'react';
import { Modal } from '../../ui/Modal';
import {
  IconHome, IconShield, IconPalette, IconSnapshot, IconCoin,
  IconCalendar, IconRefreshCircle, IconBankBuilding, IconBarChartTrend,
  IconStar, IconGear, IconDatabase, IconCreditCard, IconLock,
  IconWallet, IconArrowDownRight, IconArrowUpRight, IconTag,
  IconMagnify, IconLayout, IconUser, IconExport,
} from '../../ui/icons';

/* ------------------------------------------------------------------ */
/*  Data types                                                         */
/* ------------------------------------------------------------------ */

type DetailItem = {
  icon: React.ReactNode;
  label: string;
  detail: string;
};

type Section = {
  icon: React.ReactNode;
  title: string;
  tagline: string;
  items: DetailItem[];
  /** Optional callout shown below the items (e.g. warnings, tips). */
  callout?: { text: string; variant: 'accent' | 'red' };
};

/* ------------------------------------------------------------------ */
/*  Slide data — icon hero + progressive-disclosure pills              */
/* ------------------------------------------------------------------ */

const SECTIONS: Section[] = [
  {
    icon: <IconHome />,
    title: 'Add to Home Screen',
    tagline: 'Make it feel like a real app.',
    items: [
      { icon: <IconMagnify />, label: 'Open in Safari', detail: 'Go to https://iisauha.github.io/iisauhwallet/ in Safari.' },
      { icon: <IconLayout />, label: 'Share menu', detail: 'Tap the three dots (bottom right) then tap Share at the top.' },
      { icon: <IconHome />, label: 'Add to Home Screen', detail: 'Tap View More, then Add to Home Screen. Name it whatever you like.' },
      { icon: <IconLock />, label: 'Uncheck "Open as Web App"', detail: 'This is important. The app is built to run as a regular Safari page. Leaving it checked causes bugs.' },
    ],
  },
  {
    icon: <IconShield />,
    title: 'Security',
    tagline: 'Your data never leaves your device.',
    items: [
      { icon: <IconLock />, label: '100% local', detail: 'Everything is stored in Safari\'s local storage. No servers, no cloud. The app creator can never see your data.' },
      { icon: <IconShield />, label: 'Passcode protected', detail: 'A 6-digit passcode is the gate. Lockout protection kicks in after failed attempts.' },
      { icon: <IconExport />, label: 'Encrypted backups', detail: 'When you export a backup you can encrypt it with your passcode. Without it, the file is unreadable gibberish.' },
    ],
    callout: { text: 'Never type actual card numbers, account numbers, passwords, or SSNs. Track balances and names only.', variant: 'red' },
  },
  {
    icon: <IconPalette />,
    title: 'Make It Yours',
    tagline: 'Themes, fonts, colors, and layout.',
    items: [
      { icon: <IconPalette />, label: 'Themes', detail: 'Royal, Midnight, Aurora, Jade, Plum, Sakura, and more. Each changes background, surfaces, and accent at once.' },
      { icon: <IconLayout />, label: 'Fonts & size', detail: 'Dozens of font families. Tap any to preview instantly. Choose Small, Medium, or Large sizing.' },
      { icon: <IconTag />, label: 'Accent color', detail: 'Pick any custom hex color on top of any theme for a truly personal look.' },
      { icon: <IconGear />, label: 'Manage tabs', detail: 'Hide tabs you don\'t use or drag them into a different order.' },
    ],
  },
  {
    icon: <IconSnapshot />,
    title: 'Snapshot',
    tagline: 'Your money, right now.',
    items: [
      { icon: <IconWallet />, label: 'Cash', detail: 'All your bank accounts in one place. Swipe through them, tap any card to edit its balance.' },
      { icon: <IconCreditCard />, label: 'Credit cards', detail: 'What you owe on each card. Set up reward rules so the app suggests which card to use when you shop.' },
      { icon: <IconArrowDownRight />, label: 'Pending inbound', detail: 'Money on the way to you. Tap Post when it arrives and the balance updates.' },
      { icon: <IconArrowUpRight />, label: 'Pending outbound', detail: 'Payments you\'ve sent that haven\'t cleared. Tap Post when they do.' },
      { icon: <IconCoin />, label: 'Net cash', detail: 'Total bank balance minus credit card debt, adjusted for pending items. Your true position right now.' },
    ],
  },
  {
    icon: <IconCoin />,
    title: 'Spending',
    tagline: 'See where your money goes.',
    items: [
      { icon: <IconTag />, label: 'Log purchases', detail: 'Tap "+" to log a purchase. The app suggests which card earns the best rewards for that category.' },
      { icon: <IconLayout />, label: 'Views', detail: 'Toggle between Categories (donut chart), Sources (by payment method), and Rewards (points/miles/cashback balances).' },
      { icon: <IconMagnify />, label: 'Search', detail: 'Search by name, category, or subcategory. Supports regex patterns like /coffee|tea/.' },
      { icon: <IconCoin />, label: 'Reimbursable', detail: 'Mark work expenses as reimbursable and they\'re excluded from your personal totals.' },
    ],
  },
  {
    icon: <IconCalendar />,
    title: 'Upcoming',
    tagline: 'A calendar for your money.',
    items: [
      { icon: <IconArrowDownRight />, label: 'Expected income', detail: 'Upcoming paychecks and deposits pulled from your recurring items. Highlighted in green.' },
      { icon: <IconArrowUpRight />, label: 'Expected costs', detail: 'Bills and expenses on their expected dates, shown in red. Adjust any single occurrence without changing the recurring item.' },
      { icon: <IconWallet />, label: 'Summary', detail: 'Current cash + expected income \u2212 expected costs = what you\'ll have left. Shows min/max range if applicable.' },
    ],
  },
  {
    icon: <IconRefreshCircle />,
    title: 'Recurring',
    tagline: 'Set it once. It flows everywhere.',
    items: [
      { icon: <IconArrowDownRight />, label: 'Income', detail: 'Salary, freelance, side income. Set frequency (weekly, biweekly, monthly, yearly) and which account it deposits into.' },
      { icon: <IconArrowUpRight />, label: 'Expenses', detail: 'Rent, subscriptions, loan payments. Link to a loan to auto-use the current payment amount.' },
      { icon: <IconCoin />, label: 'Split amounts', detail: 'Share an expense with a roommate? Set your portion so only your share counts.' },
    ],
  },
  {
    icon: <IconBankBuilding />,
    title: 'Loans',
    tagline: 'Federal and private, tracked together.',
    items: [
      { icon: <IconBankBuilding />, label: 'Federal loans', detail: 'Estimates payments for each repayment plan (Standard, IDR, PAYE, SAVE, etc.) and shows years to forgiveness.' },
      { icon: <IconCreditCard />, label: 'Private loans', detail: 'Set balance, rate, and payment mode: custom, amortized, interest-only, or deferred. Supports date-range mode changes.' },
      { icon: <IconGear />, label: 'Loan tools', detail: 'Payment scenario calculator. Experiment without changing your actual loan data.' },
    ],
  },
  {
    icon: <IconBarChartTrend />,
    title: 'Investing',
    tagline: 'HYSA, Roth IRA, 401(k), and more.',
    items: [
      { icon: <IconBarChartTrend />, label: 'Balances', detail: 'Tap any account to update. Everything is manual \u2014 no brokerage connections.' },
      { icon: <IconWallet />, label: 'HYSA buckets', detail: 'Reserved (savings) and Bills (for upcoming expenses). The Bills bucket is what Upcoming counts as liquid cash.' },
      { icon: <IconCoin />, label: 'Interest accrual', detail: 'For HYSA accounts, tap Accrue Interest and the app calculates monthly interest from the current APY.' },
      { icon: <IconStar />, label: 'Coast FIRE', detail: 'Enter your age, retirement age, and spending. See your FIRE number, whether you\'ve hit Coast FIRE, and a year-by-year projection.' },
    ],
  },
  {
    icon: <IconStar />,
    title: 'Bonuses',
    tagline: 'Track credit card sign-up bonuses.',
    items: [
      { icon: <IconCreditCard />, label: 'Add a tracker', detail: 'Pick the card, set the deadline, and define spending tiers (e.g. spend $500 for 50k points).' },
      { icon: <IconBarChartTrend />, label: 'Track progress', detail: 'See which tiers you\'ve unlocked, how much more to spend, and days remaining.' },
      { icon: <IconStar />, label: 'Complete & collect', detail: 'Tap Complete when you hit your target. Choose tiers earned and the reward logs to your balance.' },
    ],
  },
  {
    icon: <IconDatabase />,
    title: 'Settings & Backup',
    tagline: 'Customize, export, restore.',
    items: [
      { icon: <IconUser />, label: 'Profile', detail: 'Set your display name and photo. Stored on-device only.' },
      { icon: <IconPalette />, label: 'Customization', detail: 'Themes, fonts, accent color, surface style, tab order \u2014 all under App Customization.' },
      { icon: <IconExport />, label: 'Backup', detail: 'Export JSON to save everything. Encrypt with your passcode. Back up to iCloud Drive weekly.' },
      { icon: <IconDatabase />, label: 'Restore', detail: 'Import JSON to restore. Works across devices and browsers. Enter the export passcode.' },
      { icon: <IconLock />, label: 'Recovery key', detail: 'Keep the recovery key from setup somewhere safe. It resets your passcode if you ever forget it.' },
    ],
    callout: { text: 'You\'re all set. Tap Enter App below to get started.', variant: 'accent' },
  },
];

/* ------------------------------------------------------------------ */
/*  Expandable pill component                                          */
/* ------------------------------------------------------------------ */

function DetailPill({ icon, label, detail }: DetailItem) {
  const [open, setOpen] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        width: '100%',
        textAlign: 'left',
        background: open
          ? 'color-mix(in srgb, var(--accent) 10%, transparent)'
          : 'var(--ui-surface-secondary, color-mix(in srgb, var(--surface) 60%, transparent))',
        border: '1px solid var(--ui-border, var(--border))',
        borderRadius: 10,
        padding: '8px 10px',
        cursor: 'pointer',
        color: 'var(--ui-primary-text, var(--text))',
        fontFamily: 'inherit',
        fontSize: '0.8rem',
        lineHeight: 1.4,
        transition: 'background 0.15s ease',
      }}
    >
      <span style={{
        flexShrink: 0,
        width: 22,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--accent)',
        opacity: 0.85,
      }}>
        {icon}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontWeight: 600 }}>{label}</span>
        {open && (
          <span style={{ display: 'block', marginTop: 3, color: 'var(--muted)', fontSize: '0.78rem', lineHeight: 1.4 }}>
            {detail}
          </span>
        )}
      </span>
      <span style={{
        flexShrink: 0,
        fontSize: '0.7rem',
        color: 'var(--muted)',
        marginTop: 3,
        transition: 'transform 0.15s ease',
        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
      }}>
        &#9662;
      </span>
    </button>
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
  const section = SECTIONS[idx];
  const isLast = idx === SECTIONS.length - 1;
  const isFirst = idx === 0;

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
          padding: compact ? '10px 14px 8px' : '14px 16px 12px',
          flex: '1 1 0',
          overflowY: 'auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Hero icon + title + tagline */}
        <div style={{ textAlign: 'center', marginBottom: 12, flexShrink: 0 }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: 14,
            background: 'color-mix(in srgb, var(--accent) 14%, transparent)',
            color: 'var(--accent)',
            marginBottom: 8,
          }}>
            <span style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {section.icon}
            </span>
          </div>
          <h2 style={{
            margin: '0 0 2px 0',
            fontSize: '1rem',
            fontWeight: 700,
            color: 'var(--ui-title-text, var(--text))',
            lineHeight: 1.3,
          }}>
            {section.title}
          </h2>
          <p style={{
            margin: 0,
            fontSize: '0.82rem',
            color: 'var(--muted)',
            lineHeight: 1.3,
          }}>
            {section.tagline}
          </p>
        </div>

        {/* Expandable pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: '1 1 auto', minHeight: 0 }}>
          {section.items.map((item, i) => (
            <DetailPill key={`${idx}-${i}`} {...item} />
          ))}
        </div>

        {/* Optional callout */}
        {section.callout && (
          <div style={{
            marginTop: 10,
            padding: '8px 12px',
            borderRadius: 8,
            borderLeft: `3px solid var(--${section.callout.variant === 'red' ? 'red' : 'accent'})`,
            background: section.callout.variant === 'red'
              ? 'rgba(220,38,38,0.1)'
              : 'color-mix(in srgb, var(--accent) 12%, transparent)',
            fontSize: '0.8rem',
            lineHeight: 1.4,
            color: 'var(--ui-primary-text, var(--text))',
            flexShrink: 0,
          }}>
            {section.callout.text}
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
