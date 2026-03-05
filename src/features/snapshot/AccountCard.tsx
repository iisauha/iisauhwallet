import type { BankAccount, CreditCard } from '../../state/models';
import { formatCents } from '../../state/calc';

export function AccountCard(props: { name: string; amountCents: number; kind: 'bank' | 'card' }) {
  const amount = props.amountCents;
  const cls = amount < 0 ? 'amount amount-credit' : 'amount';
  return (
    <div className="card">
      <div className="row">
        <span className="name">{props.name}</span>
        <span className={cls}>{formatCents(amount)}</span>
      </div>
    </div>
  );
}

export function BankAccountCard(props: { bank: BankAccount }) {
  return <AccountCard name={props.bank.name} amountCents={props.bank.balanceCents} kind="bank" />;
}

export function CreditCardCard(props: { card: CreditCard }) {
  return <AccountCard name={props.card.name} amountCents={props.card.balanceCents} kind="card" />;
}

