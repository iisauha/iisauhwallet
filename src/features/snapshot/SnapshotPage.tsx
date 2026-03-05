import { useMemo } from 'react';
import { calcFinalNetCashCents, formatCents } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import { BankAccountCard, CreditCardCard } from './AccountCard';
import { PendingInboundList, PendingOutboundList } from './PendingList';

export function SnapshotPage() {
  const data = useLedgerStore((s) => s.data);

  const totals = useMemo(() => calcFinalNetCashCents(data), [data]);
  const finalNetCashClass =
    totals.finalNetCashCents >= 0 ? 'summary-kv final-net-cash positive' : 'summary-kv final-net-cash negative';

  return (
    <div className="tab-panel active" id="snapshotContent">
      <div className="section-header" id="bankHeader">
        <span className="section-header-left">
          Cash — <span>{formatCents(totals.bankTotalCents)}</span>
        </span>
      </div>
      <div>
        {(data.banks || []).map((b) => (
          <BankAccountCard key={b.id} bank={b} />
        ))}
      </div>

      <div className="section-header" id="cardHeader" style={{ marginTop: 24 }}>
        <span className="section-header-left">
          Credit Cards — <span>{formatCents(totals.ccDebtCents - totals.ccCreditCents)}</span>
        </span>
      </div>
      <div>
        {(data.cards || []).map((c) => (
          <CreditCardCard key={c.id} card={c} />
        ))}
      </div>

      <div className="section-header" id="pendingInHeader" style={{ marginTop: 24 }}>
        <span className="section-header-left">
          Pending Inbound — <span>{formatCents(totals.pendingInCents)}</span>
        </span>
      </div>
      <PendingInboundList data={data} items={data.pendingIn || []} />

      <div className="section-header" id="pendingOutHeader" style={{ marginTop: 24 }}>
        <span className="section-header-left">
          Pending Outbound — <span>{formatCents(totals.pendingOutCents)}</span>
        </span>
      </div>
      <PendingOutboundList data={data} items={data.pendingOut || []} />

      <div className="summary" id="snapshotSummary">
        <div className="summary-compact">
          <div className="summary-kv">
            <span className="k">Net Cash (Cash Total)</span>
            <span className="v">{formatCents(totals.bankTotalCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Total Current Credit Card Balance</span>
            <span className="v">{formatCents(totals.ccDebtCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Credit Card Credit</span>
            <span className="v">{formatCents(totals.ccCreditCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Total Pending Outbound</span>
            <span className="v">{formatCents(totals.pendingOutCents)}</span>
          </div>
          <div className="summary-kv">
            <span className="k">Total Pending Inbound</span>
            <span className="v">{formatCents(totals.pendingInCents)}</span>
          </div>
          <div className={finalNetCashClass}>
            <span className="k">Final Net Cash</span>
            <span className="v">{formatCents(totals.finalNetCashCents)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

