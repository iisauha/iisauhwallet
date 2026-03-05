import type { BankAccount, CreditCard } from '../../state/models';
import { formatCents } from '../../state/calc';

export function AccountCard(props: { name: string; amountCents: number; kind: 'bank' | 'card' }) {
  const amount = props.amountCents;
  const isCredit = amount < 0;
  let amountClass = 'amount';
  if (props.kind === 'bank') {
    amountClass = amount >= 0 ? 'amount amount-pos' : 'amount amount-neg';
  } else if (props.kind === 'card') {
    amountClass = amount > 0 ? 'amount amount-neg' : amount < 0 ? 'amount amount-pos' : 'amount amount-pos';
  } else if (isCredit) {
    amountClass = 'amount amount-credit';
  }
  return (
    <div className="row ll-account-row">
      <span className="name bank-card-name">{props.name}</span>
      <span className={amountClass}>{formatCents(amount)}</span>
    </div>
  );
}

export function BankAccountCard(props: { bank: BankAccount }) {
  return <AccountCard name={props.bank.name} amountCents={props.bank.balanceCents} kind="bank" />;
}

export function CreditCardCard(props: { card: CreditCard }) {
  return <AccountCard name={props.card.name} amountCents={props.card.balanceCents} kind="card" />;
}

