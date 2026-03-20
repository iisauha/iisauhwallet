import type { ReactNode } from 'react';
import { Modal } from '../../ui/Modal';

/** Matches App Customization → “All Other Text” (primaryText → --ui-primary-text). */
const ALL_OTHER_TEXT_COLOR = 'var(--ui-primary-text, var(--text))';

function GuideDropdown({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details
      style={{
        border: '1px solid var(--ui-border, var(--border))',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--ui-modal-bg, var(--surface))',
      }}
    >
      <summary
        style={{
          padding: '12px 14px',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: '0.95rem',
          color: ALL_OTHER_TEXT_COLOR,
          fontFamily: 'var(--app-font-family)',
        }}
      >
        {title}
      </summary>
      <div
        style={{
          padding: '0 14px 14px',
          fontSize: '0.9rem',
          lineHeight: 1.55,
          color: ALL_OTHER_TEXT_COLOR,
          fontFamily: 'var(--app-font-family)',
        }}
      >
        {children}
      </div>
    </details>
  );
}

function B({ children }: { children: ReactNode }) {
  return (
    <ul style={{ margin: '0 0 12px 0', paddingLeft: 18, color: ALL_OTHER_TEXT_COLOR }}>
      {children}
    </ul>
  );
}

function Li({ children }: { children: ReactNode }) {
  return (
    <li style={{ marginBottom: 8, color: ALL_OTHER_TEXT_COLOR }}>
      {children}
    </li>
  );
}

export function AppGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <Modal
      open={open}
      title="How This App Works"
      onClose={onClose}
      titleStyle={{ color: ALL_OTHER_TEXT_COLOR }}
    >
      <div
        style={{
          fontSize: '0.95rem',
          lineHeight: 1.6,
          color: ALL_OTHER_TEXT_COLOR,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          fontFamily: 'var(--app-font-family)',
        }}
      >
        <div style={{ marginBottom: 4 }}>
          <B>
            <Li>
              You enter your own numbers. Everything is saved in this browser on this device, encrypted, and unlocked when you enter your passcode.
            </Li>
            <Li>
              Three ideas work together: balances you update (Snapshot and Investing), money that is on the way but not
              finalized yet (Pending inbound and outbound), and repeating items plus a short-term calendar (Recurring and
              Upcoming).
            </Li>
            <Li>
              When you <strong>post</strong> a pending item, you are telling the app the money has arrived or left. Until
              then, it stays in the pending lists and does not change your main balances the same way.
            </Li>
          </B>
        </div>

        <GuideDropdown title="First launch and the lock screen">
          <B>
            <Li>
              On first setup you create a six digit passcode, confirm it, and can add recovery options: a hint, two security
              questions, and a recovery key (save the key when shown).
            </Li>
            <Li>
              Too many wrong passcode attempts can trigger a timed lockout before you can try again.
            </Li>
            <Li>
              If you cannot get back in, there is an option to erase all app data on this device. That removes your local
              wallet data permanently unless you have a backup.
            </Li>
            <Li>
              The app may prompt you to update an older passcode setup to the current format; follow the on-screen steps.
            </Li>
            <Li>
              In Settings you manage your passcode and recovery options, and the app will require your code to open.
            </Li>
            <Li>
              When the app is locked, it keeps your saved wallet data unreadable in your browser storage until you enter your passcode.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Bottom bar and Settings shortcuts">
          <B>
            <Li>
              Main sections appear as tabs at the bottom. Drag a tab to change the order.
            </Li>
            <Li>
              Settings → Visible tabs: uncheck a tab to remove it from the bar. Hiding a tab does not delete its data.
            </Li>
            <Li>
              Open Settings for backups, appearance, categories, passcode, Security policy, FAQ, and other options.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Snapshot">
          <B>
            <Li>
              Snapshot is the main status screen: bank accounts, credit cards, pending money in, pending money out, and a
              summary block at the top.
            </Li>
            <Li>
              The summary uses only what you entered in the app. It is for your tracking, not an automatic feed from a bank.
            </Li>
            <Li>
              Current cash in checking adds up the balances you set under the Cash section (after your latest edits and
              posts).
            </Li>
            <Li>
              If you use Investing → HYSA, you can split savings into reserved vs money designated for bills, and optionally
              link that HYSA to a checking account. Then Snapshot (and Upcoming) can count that bill portion toward cash
              available for spending even though it still sits in savings. Checking may show a short line about linked HYSA
              when that applies.
            </Li>
            <Li>
              Total credit card balance adds what you owe on each card (as you entered it).
            </Li>
            <Li>
              Credit card credit covers statement credit or overpayment (negative balance on a card). The summary counts it
              so your net view stays consistent.
            </Li>
            <Li>
              Total pending inbound adds items you have not posted yet (money you expect in).
            </Li>
            <Li>
              Total pending outbound adds items you have not posted yet (money you expect out). You can expand to separate
              credit card payments from other outgoing pending items.
            </Li>
            <Li>
              Final net cash is the headline total using cash, cards, pending, credit, and linked HYSA bill money if you set
              it up. It reflects your entries, not a bank&apos;s official number.
            </Li>
            <Li>
              Cash: expand or collapse the section; show or hide $0 accounts; add or set balance (add increases the
              balance, set replaces it—check the dialog); clear sets balance to $0 in the app only; delete removes the
              account after you confirm; add bank account creates a new manual account.
            </Li>
            <Li>
              Credit cards: same layout. The i button opens reward rules (cash back %, points, miles by category). Spending
              uses those rules to estimate rewards on purchases.
            </Li>
            <Li>
              Pending inbound: list money coming in before you post it. Add, edit, delete, or clear all. Post when it has
              arrived; posting applies the amount to the destination you chose (bank, card refund, HYSA portion, etc.).
            </Li>
            <Li>
              Pending outbound: list money going out before you post it. Post when the payment or transfer has actually left
              the account you track.
            </Li>
            <Li>
              Items created from Recurring may stay linked to that recurring entry. Credit card payments can be tracked as
              their own pending type.
            </Li>
            <Li>
              Posting a loan-related outbound may ask whether to update balances on the Loans tab. Confirm only if that
              payment should reduce the loan balances you keep there.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Spending">
          <B>
            <Li>
              Filter by this month, last month, all time, or custom dates.
            </Li>
            <Li>
              Switch between Categories (pie chart of spending distribution), By card (totals per card), or Rewards (balances
              and value). Use Legend on the chart to match colors to category names.
            </Li>
            <Li>
              By card totals come from purchase records in the selected period, not from Snapshot card balances.
            </Li>
            <Li>
              Rewards view lists each card&apos;s stored rewards. For points or miles, approximate dollar value appears if
              you set cents per point or mile on the card in Snapshot.
            </Li>
            <Li>
              The summary shows total spend for the period and a summary line for current rewards.
            </Li>
            <Li>
              Add purchases with title, date, amount, category, and subcategory (categories are edited under Settings →
              Manage categories).
            </Li>
            <Li>
              Search, edit, or delete purchases. Reimbursement mode is for purchases someone else repays; items marked fully
              reimbursed can be excluded from your personal spend totals.
            </Li>
            <Li>
              Adjust reward balances here if they drift from what your bank or program shows (after you update Snapshot card
              settings if needed).
            </Li>
            <Li>
              To export this month&apos;s purchases as a CSV file, use Settings → Export monthly purchases CSV.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Upcoming (Upcoming cashflow)">
          <B>
            <Li>
              Pick a forward window (for example next 14–45 days). Lists below only show items in that range.
            </Li>
            <Li>
              Expected income includes one-off items you add here plus projected lines from active Recurring income
              templates.
            </Li>
            <Li>
              Move to pending inbound copies the item into Snapshot → Pending inbound so you can track it as in transit,
              then post when it clears.
            </Li>
            <Li>
              Deleting a line that came from Recurring often removes only that date from Upcoming, not the whole recurring
              item. Read the confirmation message.
            </Li>
            <Li>
              Expected costs work the same way for bills. You can send an item to pending outbound when you are ready to
              track it on Snapshot.
            </Li>
            <Li>
              The bottom summary uses Snapshot&apos;s net position (including linked HYSA bill money if configured), then
              adds expected income and subtracts expected costs inside the window.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Recurring (Recurring items)">
          <B>
            <Li>
              Store repeating income and bills (amount, frequency, start date). The app advances schedules so projections
              stay current.
            </Li>
            <Li>
              Paused income does not appear in Upcoming projections until you resume. Edit or delete templates as needed.
            </Li>
            <Li>
              Expenses are grouped by category; expand each group to see its items.
            </Li>
            <Li>
              Options include frequency, start date, last day of month, min/max amounts for variable bills, split amounts,
              and categories from Manage categories.
            </Li>
            <Li>
              Payment source (card, bank, or HYSA) tells the app which account type usually pays the bill. For HYSA, choose
              bill-designated vs reserved savings. The app uses this when building pending items; it does not pay bills for
              you.
            </Li>
            <Li>
              Loan payment lines can link to estimated amounts from the Loans tab.
            </Li>
            <Li>
              You can schedule an automatic transfer from a bank to an investing account when a paycheck template is modeled.
            </Li>
            <Li>
              Marking income as a full-time job enables pre-tax deductions and employer match fields, which feed the
              Investing contribution summary.
            </Li>
            <Li>
              Optimizer opens optional planning tools for advanced use.
            </Li>
            <Li>
              Active templates generate lines on Upcoming and may create scheduled pending outbound items. Paused templates
              do not.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Loans">
          <B>
            <Li>
              Use the Public / Private toggle to switch between the two areas; one main panel shows at a time.
            </Li>
            <Li>
              The summary shows total balance (public vs private), average rates when available, and Payment (now), which
              you can edit to match what you pay this month. The info button opens extra payment breakdown when offered.
            </Li>
            <Li>
              Public: tools for consolidated federal-style loan tracking and how they roll into monthly payment totals.
            </Li>
            <Li>
              Private: list of loans you enter manually (edit, delete). Some estimates improve when Recurring income data
              exists.
            </Li>
            <Li>
              Recurring can reference private loan payments. When you post a linked payment from Snapshot, you can choose to
              update loan balances on this tab.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Investing">
          <B>
            <Li>
              Accounts are grouped by type: HYSA, Roth IRA, general investing, and employer-based retirement. Sections can
              collapse.
            </Li>
            <Li>
              Update balances with add/set flows; use &quot;set&quot; when you want to replace the balance instead of adding
              to it.
            </Li>
            <Li>
              HYSA supports interest rate, interest accrued this month, reserved vs bill-designated savings, optional linked
              checking, and optional interest baselines. Linking bill-designated HYSA to checking lets Snapshot and Upcoming
              treat part of savings like near-term cash.
            </Li>
            <Li>
              Roth, 401(k)-style, and general accounts are mainly name and balance fields you maintain.
            </Li>
            <Li>
              Add account: choose type, name, and for HYSA starting balance, APR, and the date the balance is measured as of.
            </Li>
            <Li>
              Transfer between cash and investing records the same dollars leaving a Snapshot bank account and entering an
              investing account (or the reverse). It updates your ledger only, not a real bank transfer.
            </Li>
            <Li>
              Investing summary shows subtotals by category and a grand total.
            </Li>
            <Li>
              Investing contribution summarizes gross income, net after pre-tax deductions, and employer match when you set
              up qualifying Recurring income; otherwise it explains what to add.
            </Li>
            <Li>
              HYSA lists can hide $0 balances like Snapshot.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Sign Up Bonus Tracker">
          <B>
            <Li>
              Tracks sign-up offers separately from everyday card balances: spend requirements, deadlines, tiered rewards,
              and completion.
            </Li>
            <Li>
              Each active offer shows required spend, spend recorded toward it, a progress bar with milestones, and timing
              based on your deadline or window.
            </Li>
            <Li>
              Edit dates, linked card, tiers, or progress. Mark Complete when the issuer has awarded the bonus; you may be
              prompted to add rewards to the card balance in Snapshot.
            </Li>
            <Li>
              The completed-bonuses view stores history (reward, date completed, valuation, estimated cash value, notes),
              with edit, add manual completion, and a running total of completed bonus value.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Settings">
          <B>
            <Li>
              Profile photo and display name at the top of Settings.
            </Li>
            <Li>
              App customization: background color, navigation accent, title vs body text colors, card/popup/tab bar/button
              colors, save and apply named themes (plus built-in light/dark defaults), font family and size.
            </Li>
            <Li>
              Visible tabs: show or hide tabs in the bottom bar without deleting underlying data.
            </Li>
            <Li>
              Edit account names updates labels for banks and cards across the app.
            </Li>
            <Li>
              Security: manage your passcode and recovery options, open this guide, FAQ, reset passcode, and Security
              policy (Privacy screen).
            </Li>
            <Li>
              Backup: export monthly purchases CSV; export full data as JSON; import JSON replaces data on this device. The encrypted
              wallet part in the backup needs your passcode to restore.
              Import only files you trust.
            </Li>
            <Li>
              Manage categories: categories and subcategories used in Spending and Recurring.
            </Li>
            <Li>
              About the creator opens a short background note from the developer.
            </Li>
            <Li>
              Reset all data erases local app storage for this site and reloads. Use only if you intend to start over or
              have a backup.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Security policy page">
          <B>
            <Li>
              Settings → Security policy opens the Privacy page with the full Security &amp; Privacy Policy and contact
              email.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="How it all ties together">
          <B>
            <Li>
              Keep Snapshot balances and cards current so the summary matches how you want to track your position.
            </Li>
            <Li>
              Enter Recurring templates so Upcoming can project income and bills automatically.
            </Li>
            <Li>
              When money is in transit, add or move items to Pending, then post once your bank or card activity matches what
              you recorded.
            </Li>
            <Li>
              Use Spending for purchase history, categories, and reward estimates tied to Snapshot card rules.
            </Li>
            <Li>
              Use Investing for long-term buckets and HYSA settings that affect how Snapshot and Upcoming count savings.
            </Li>
            <Li>
              Use Loans for debt balances and payments that can link to Recurring and Snapshot posting.
            </Li>
            <Li>
              Use Sign Up Bonus Tracker for promotional spend goals separately from day-to-day card balances.
            </Li>
          </B>
        </GuideDropdown>
      </div>
    </Modal>
  );
}
