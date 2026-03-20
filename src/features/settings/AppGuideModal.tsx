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
              You are mostly typing your own money story. The app stores it in the browser on this device.
            </Li>
            <Li>
              Think in three layers: balances you maintain (Snapshot and Investing), money in motion (Pending), and time
              (Recurring and Upcoming).
            </Li>
            <Li>
              Post is the word that turns &quot;in motion&quot; into &quot;in a balance.&quot; Until you post, pending is
              just a queue.
            </Li>
          </B>
        </div>

        <GuideDropdown title="First launch and the lock screen">
          <B>
            <Li>
              The first time, the app walks you through creating a six digit code, confirming it, and saving recovery
              paths like a hint, security questions, and a recovery key so you are not stuck if you forget the code.
            </Li>
            <Li>
              If someone guesses wrong too many times, you can hit a time lockout before you can try again, on purpose,
              so brute forcing is painful.
            </Li>
            <Li>
              There is also a path to wipe everything if you truly cannot recover. That is as destructive as it sounds.
            </Li>
            <Li>
              Later you can migrate or clean up passcode behavior if the app asks you to update an older setup.
            </Li>
            <Li>
              You can pause protection from Settings so the app opens without the code until you resume it. That is for
              convenience on a device you already trust, not extra security.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Bottom bar and Settings shortcuts">
          <B>
            <Li>
              Tabs run along the bottom. You can press, hold, and drag a tab to reorder them.
            </Li>
            <Li>
              In Settings, Visible tabs lets you uncheck whole sections so they vanish from the bar. That only hides the
              shortcut. Your data usually stays until you delete it elsewhere.
            </Li>
            <Li>
              Settings itself is still how you get back to backups, look and feel, legal text, and the like.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Snapshot">
          <B>
            <Li>
              This is your live dashboard: cash accounts, credit cards, money waiting to arrive, money waiting to leave,
              and a stacked summary at the top.
            </Li>
            <Li>
              The top summary is built only from what you entered plus the rules below. It is a model, not a bank
              statement download.
            </Li>
            <Li>
              Current cash in checking accounts adds the balances of bank rows under Cash, after your last edits and
              posts.
            </Li>
            <Li>
              Money in HYSA designated for bills appears when Investing knows you split a high yield savings balance into
              bill money you are willing to spend soon versus reserved money you want the app to treat as untouchable for
              short term planning. If you also link that savings to a specific checking account, the app is allowed to add
              that bill slice into the same mental checking picture so Snapshot and Upcoming do not pretend all spending
              power must already sit in checking. You might read a note on checking about linked HYSA for the same reason.
            </Li>
            <Li>
              Total credit card balance sums the debt style numbers you track on each card.
            </Li>
            <Li>
              Credit card credit is for when a card balance is negative in your tracking because the bank owes you a
              credit. The summary treats that as good dollars so your net picture is not upside down.
            </Li>
            <Li>
              Total pending inbound is the sum of incoming items you have not posted yet.
            </Li>
            <Li>
              Total pending outbound is the sum of outgoing items you have not posted yet. You can expand a small
              breakdown to see credit card payments separated from everything else leaving.
            </Li>
            <Li>
              Final net cash is the headline net after the app folds in cash, cards, pending, credit, and, if configured,
              that HYSA bill slice tied to checking. It answers if my own entries are honest, what is my rough cushion
              after obligations I already modeled.
            </Li>
            <Li>
              Cash: tap the header to collapse or expand. Show or hide zero dollar rows. Add or set balance (add usually
              stacks on what is there, set replaces). Clear pushes that account to zero in the app only. Delete removes the
              account if you confirm. Add bank account creates another manual bucket.
            </Li>
            <Li>
              Credit cards: same collapse and zero toggle. Add or set, clear, delete, add credit card. The small i opens
              reward rules. That is your chart of percent back or points per category. Spending reads this when it
              estimates rewards on each purchase.
            </Li>
            <Li>
              Pending inbound is your incoming queue before money is real in a balance in the app&apos;s eyes. Add, edit,
              delete, clear all, post when it arrived. Post moves dollars into the destination you chose (bank, card
              refund, HYSA buckets, depending on the item).
            </Li>
            <Li>
              Pending outbound is the outgoing queue before dollars officially leave the pocket you track. Add, edit,
              delete, clear all, post when it truly left.
            </Li>
            <Li>
              Outbound tied to Recurring often carries a link back to that bill template. Some outbounds are credit card
              payments in a special shape.
            </Li>
            <Li>
              When you post an outbound tied to loan estimates from Recurring, you may get a question about updating loan
              balances on the Loans tab. Say yes only when that payment really should shave what you track as debt.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Spending">
          <B>
            <Li>
              Pick a period: this month, last month, all time, or custom start and end dates.
            </Li>
            <Li>
              Flip between rewards or by card versus categories. Categories shows spending distribution (the pie chart).
              Legend maps colors to names.
            </Li>
            <Li>
              By card shows totals charged on each payment method in that window from purchase lines, not Snapshot
              balances.
            </Li>
            <Li>
              Rewards shows card by card stored reward balances and approximate dollar value for points or miles if you set
              average cents per point or mile on the card in Snapshot.
            </Li>
            <Li>
              The summary card shows total spend this period and a rough current rewards headline.
            </Li>
            <Li>
              Add a purchase with title, date, amount, category and subcategory from Settings, Manage categories.
            </Li>
            <Li>
              Search filters the list. Edit or delete lines. Reimbursement mode helps when someone else pays you back;
              fully reimbursed purchases can leave personal totals so your graph matches what you really spent.
            </Li>
            <Li>
              You may subtract from rewards or edit reward balance when your real balance does not match what you typed in
              Snapshot.
            </Li>
            <Li>
              Export monthly purchases CSV lives in Settings, not on this tab.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Upcoming (Upcoming cashflow)">
          <B>
            <Li>
              Choose a time window such as the next fourteen to forty five days. Everything below is filtered to that
              forward slice.
            </Li>
            <Li>
              Expected income mixes one off deposits you add here with lines from recurring generated from Recurring items
              that are still active.
            </Li>
            <Li>
              Move to pending inbound means stop treating this only as a calendar hope and start treating it as money in
              flight on Snapshot&apos;s pending inbound list.
            </Li>
            <Li>
              Delete on a from recurring line usually means hide this occurrence from Upcoming without necessarily killing
              the whole template on Recurring. Read the confirm text.
            </Li>
            <Li>
              Expected costs follow the same rhythm for bills. You can move items toward pending outbound when you want
              Snapshot to own the next step.
            </Li>
            <Li>
              The runway summary starts from final net cash style logic from Snapshot, including linked HYSA bill money if
              you turned that on, then adds expected income in the window and subtracts expected costs in the window.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Recurring (Recurring items)">
          <B>
            <Li>
              This tab stores templates: rent every first, paycheck every other Friday, and so on. The app may roll
              templates forward to today so dates stay fresh.
            </Li>
            <Li>
              Recurring income: pause stops feeding Upcoming until you resume. Paused rows look inactive. Edit or delete
              templates.
            </Li>
            <Li>
              Recurring expenses group by category. Each section can expand.
            </Li>
            <Li>
              Frequency, start date, last day of month, min and max for variable bills, split bills, category and
              subcategory from Manage categories.
            </Li>
            <Li>
              Auto pay and payment source tell the app which pocket usually pays: card, bank, or HYSA, and for HYSA
              whether you pull from bill labeled money versus reserved. This is your rule for building pending later, not an
              automatic bill pay service.
            </Li>
            <Li>
              Loan payment category can tie to estimated payment from the Loans tab.
            </Li>
            <Li>
              Investing transfer on deposit can move dollars from a bank into an investing bucket when income lands in the
              model.
            </Li>
            <Li>
              Full time job unlocks pretax deductions and employer match fields. Those feed the Investing contribution
              summary on the Investing tab.
            </Li>
            <Li>
              Optimizer opens extra planning tools. Ignore until you want them.
            </Li>
            <Li>
              Active templates create from recurring lines on Upcoming. Some templates create pending outbound on a
              schedule. Paused templates stop that noise.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Loans">
          <B>
            <Li>
              The pill control switches Public versus Private. Only one big panel shows at a time.
            </Li>
            <Li>
              Summary shows total balance, public slice, private slice, average rates when present, and Payment (now), the
              editable what I actually send each month anchor. Use the info control when you need breakdown or future
              payment detail.
            </Li>
            <Li>
              Public side is the consolidated government style loan helper where you maintain the big public picture and
              how it flows into payment now math.
            </Li>
            <Li>
              Private side is a list of manual loans with edit and delete. Recurring income can improve some derived
              numbers when present.
            </Li>
            <Li>
              Recurring can reference private loan payments. Snapshot posting can apply dollars against loan balances when
              you confirm real paydown.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Investing">
          <B>
            <Li>
              Sections for HYSA, Roth IRA, general investing, and employer based retirement. Each can collapse.
            </Li>
            <Li>
              Set or adjust balance, sometimes with set replaces entire balance so you do not mis-add.
            </Li>
            <Li>
              HYSA tracks interest rate, interest this month, reserved versus bill designated split, linked checking, and
              optional interest baselines. That link is what connects Snapshot and Upcoming to savings you treat like near
              checking cash.
            </Li>
            <Li>
              Other account types are mostly name plus balance you maintain.
            </Li>
            <Li>
              Add account picks type, name, starting balance and APR for HYSA, and when that balance is valid.
            </Li>
            <Li>
              Transfer between cash and investing moves dollars on paper between a Snapshot bank and an investing bucket so
              both sides stay balanced. It is bookkeeping hygiene, not an ACH.
            </Li>
            <Li>
              Investing summary totals each family then all investing.
            </Li>
            <Li>
              Investing contribution shows gross, net after pretax, your pretax percent, employer match when you modeled
              full time job income on Recurring. Otherwise it tells you what is missing.
            </Li>
            <Li>
              HYSA can hide zero balance rows similar to Snapshot.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Sign Up Bonus Tracker">
          <B>
            <Li>
              Separate from your normal card balance. This is a deal tracker: spend X by date, unlock bonus Y, maybe
              multiple tiers with plus rewards along the way.
            </Li>
            <Li>
              Each active card shows required spend, current spend toward the target you maintain here, a progress bar with
              milestone markers, and timing when you gave a deadline or months window.
            </Li>
            <Li>
              Edit changes dates, card link, tiers, spend progress. Complete when the bank granted the bonus. That flow may
              offer to add rewards to your tracked card.
            </Li>
            <Li>
              Completed bonuses view lists history with reward label, completion date, valuation, estimated cash value,
              notes, edit, add completed bonus, and a total value earned line.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Settings">
          <B>
            <Li>
              Profile photo and display name at the top.
            </Li>
            <Li>
              App customization: app background, navigation accent, text colors for titles versus body, surface colors for
              cards popups tab bar borders buttons, save named themes and apply later, built in light and dark defaults,
              typography font and size.
            </Li>
            <Li>
              Visible tabs checklist hides shortcuts from the bar without deleting data.
            </Li>
            <Li>
              Edit account names renames banks and cards everywhere.
            </Li>
            <Li>
              Security cluster: pause or resume passcode, How this app works, FAQ, reset passcode, Security policy link.
            </Li>
            <Li>
              Backup: export monthly purchases CSV, export JSON, import JSON replaces app state on this browser. Only
              import files you trust.
            </Li>
            <Li>
              Manage categories feeds Spending and Recurring.
            </Li>
            <Li>
              About the creator opens story text.
            </Li>
            <Li>
              Reset all data clears local storage for the site and reloads. Nuclear option.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="Security policy page">
          <B>
            <Li>
              Settings links to Security policy on a separate Privacy screen with the full policy text and contact info.
            </Li>
          </B>
        </GuideDropdown>

        <GuideDropdown title="How it all ties together">
          <B>
            <Li>
              You paint truth on Snapshot so the top summary is not fiction.
            </Li>
            <Li>
              You teach Recurring your repeating life so Upcoming stops being blank.
            </Li>
            <Li>
              When reality moves, you either create pending or move from Upcoming to pending, then post when the bank world
              matches your story.
            </Li>
            <Li>
              Spending answers what did I buy and keeps categories meaningful.
            </Li>
            <Li>
              Investing answers where long buckets live and why some savings counts like checking in your model.
            </Li>
            <Li>
              Loans answers what debt exists and feeds bills.
            </Li>
            <Li>
              Sign up bonus tracker answers did I finish the promo without mixing that into everyday balance math.
            </Li>
          </B>
        </GuideDropdown>
      </div>
    </Modal>
  );
}
