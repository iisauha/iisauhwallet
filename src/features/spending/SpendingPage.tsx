import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCents, formatLongLocalDate } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import { useDetectedActivityOptional } from '../../state/DetectedActivityContext';
import type { CategoryConfig } from '../../state/models';
import { getCategoryName, getCategorySubcategories, loadCategoryConfig, loadCardRewardAdjustments, saveCardRewardAdjustments, loadCardRewardOnlyEntries, saveCardRewardOnlyEntries, uid, type CardRewardAdjustmentsState, type CardRewardOnlyEntriesState, type CardRewardOnlyEntry } from '../../state/storage';
import { useDropdownCollapsed } from '../../state/DropdownStateContext';
import { getEffectiveRules, matchRule, computeEstimatedReward } from '../rewards/rewardMatching';
import { Select } from '../../ui/Select';
import { AddPurchaseModal } from './AddPurchaseModal';
import { getCategoryColor, renderSpendingPieChart } from './charts';

type FilterKey = 'this_month' | 'last_month' | 'all_time' | 'custom';
type BreakdownView = 'category' | 'card';

function toLocalDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

function monthStartKey(d: Date) {
  return toLocalDateKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

function addMonths(d: Date, months: number) {
  return new Date(d.getFullYear(), d.getMonth() + months, 1);
}

export function SpendingPage() {
  const data = useLedgerStore((s) => s.data);
  const actions = useLedgerStore((s) => s.actions);
  const detected = useDetectedActivityOptional();
  const cfg = useMemo(() => loadCategoryConfig(), []);
  const [filter, setFilter] = useState<FilterKey>('this_month');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [openAdd, setOpenAdd] = useState(false);
  const [reimbursementMode, setReimbursementMode] = useState(false);

  useEffect(() => {
    if (detected?.launchFlow?.flow === 'add_purchase') setOpenAdd(true);
  }, [detected?.launchFlow?.flow]);
  const [view, setView] = useState<BreakdownView>('category');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; label: string } | null>(null);
  const [purchasesCollapsed, setPurchasesCollapsed] = useDropdownCollapsed('spending_purchases', true);
  const [byCategoryCollapsed, setByCategoryCollapsed] = useDropdownCollapsed('spending_by_category', false);
  const [showAllPurchases, setShowAllPurchases] = useState<boolean>(false);
  const [editingPurchaseKey, setEditingPurchaseKey] = useState<string | null>(null);
  const [drilldownCategoryId, setDrilldownCategoryId] = useState<string | null>(null);
  const [rewardAdjustments, setRewardAdjustments] = useState<CardRewardAdjustmentsState>(() => loadCardRewardAdjustments());
  const [rewardOnlyEntries, setRewardOnlyEntries] = useState<CardRewardOnlyEntriesState>(() => loadCardRewardOnlyEntries());
  const [rewardAdjustModal, setRewardAdjustModal] = useState<{
    cardId: string;
    cardName: string;
    byCategory: Array<{ categoryKey: string; categoryLabel: string; displayLabel: string; categoryId: string; subcategory: string; amountCents: number }>;
    rewardOnlyEntries: CardRewardOnlyEntry[];
  } | null>(null);
  const [clearBalanceConfirm, setClearBalanceConfirm] = useState<{ cardId: string; cardName: string } | null>(null);
  const [editBalanceModal, setEditBalanceModal] = useState<{
    cardId: string;
    cardName: string;
    currentCashbackCents: number;
    currentPoints: number;
    currentMiles: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const { startKey, endKey } = useMemo(() => {
    const now = new Date();
    if (filter === 'all_time') return { startKey: '0000-01-01', endKey: '9999-12-31' };
    if (filter === 'this_month') {
      const s = monthStartKey(now);
      const e = monthStartKey(addMonths(now, 1));
      return { startKey: s, endKey: e };
    }
    if (filter === 'last_month') {
      const last = addMonths(now, -1);
      const s = monthStartKey(last);
      const e = monthStartKey(addMonths(last, 1));
      return { startKey: s, endKey: e };
    }
    // custom
    const s = customStart || '0000-01-01';
    const e = customEnd ? toLocalDateKey(new Date(customEnd + 'T00:00:00')) : '9999-12-31';
    return { startKey: s, endKey: e };
  }, [filter, customStart, customEnd]);

  const periodPurchases = useMemo(() => {
    const list: any[] = data.purchases || [];
    return list.filter((p) => {
      const k = p.dateISO || '';
      if (!k) return false;
      return k >= startKey && k < endKey;
    });
  }, [data.purchases, startKey, endKey]);

  const filteredPurchases = useMemo(() => {
    const q = (searchQuery || '').trim();
    if (!q) return periodPurchases;
    const lower = q.toLowerCase();

    let rx: RegExp | null = null;
    if (q.length >= 2 && q.startsWith('/') && q.endsWith('/')) {
      const inner = q.slice(1, -1);
      try {
        rx = new RegExp(inner, 'i');
      } catch {
        rx = null;
      }
    }

    return periodPurchases.filter((p: any) => {
      const title = String(p.title || '');
      const catId = String(p.category || 'uncategorized');
      const catName = String(getCategoryName(cfg, catId) || '');
      const sub = String(p.subcategory || '');
      const haystack = `${title} ${catName} ${sub}`;
      if (rx) return rx.test(haystack);
      return haystack.toLowerCase().includes(lower);
    });
  }, [periodPurchases, searchQuery, cfg]);

  const periodTotalCents = useMemo(() => {
    return filteredPurchases.reduce((s, p) => s + (p.amountCents || 0), 0);
  }, [filteredPurchases]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    filteredPurchases.forEach((p) => {
      const cat = (p.category || 'uncategorized') as string;
      map.set(cat, (map.get(cat) || 0) + (p.amountCents || 0));
    });
    return Array.from(map.entries())
      .map(([categoryId, amountCents]) => ({ categoryId, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents);
  }, [filteredPurchases]);

  const byCard = useMemo(() => {
    const bankById = new Map<string, string>((data.banks || []).map((b) => [b.id, b.name || 'Bank']));
    const cardById = new Map<string, string>((data.cards || []).map((c) => [c.id, c.name || 'Card']));
    const map = new Map<string, number>();
    filteredPurchases.forEach((p: any) => {
      const targetId = (p.paymentTargetId || '') as string;
      const src = (p.paymentSource || '') as string;
      const name =
        targetId && (src === 'card' || src === 'credit_card')
          ? cardById.get(targetId) || 'Unknown / Not specified'
          : targetId && (src === 'bank' || src === 'cash')
            ? bankById.get(targetId) || 'Unknown / Not specified'
            : 'Unknown / Not specified';
      map.set(name, (map.get(name) || 0) + (p.amountCents || 0));
    });
    return Array.from(map.entries())
      .map(([paymentTargetName, amountCents]) => ({ paymentTargetName, amountCents }))
      .sort((a, b) => b.amountCents - a.amountCents);
  }, [filteredPurchases, data.banks, data.cards]);

  const cardSpendingAndRewards = useMemo(() => {
    const cards = data.cards || [];
    const cardById = new Map(cards.map((c) => [c.id, c]));
    const periodCardPurchases = periodPurchases.filter(
      (p: any) => (p.paymentSource === 'card' || p.paymentSource === 'credit_card') && p.paymentTargetId && cardById.has(p.paymentTargetId)
    );
    type CategoryRow = {
      categoryKey: string;
      categoryId: string;
      subcategory: string;
      categoryLabel: string;
      /** Display-only: subcategory if both category+subcategory, else category name. */
      displayLabel: string;
      amountCents: number;
      rewardLabel: string;
      cashbackCents: number;
      points: number;
      miles: number;
    };
    const byCardId = new Map<string, {
      cardId: string;
      cardName: string;
      amountCents: number;
      byCategory: Map<string, CategoryRow>;
      byCategoryMy: Map<string, CategoryRow>;
      byCategoryOther: Map<string, CategoryRow>;
      cashbackCents: number;
      points: number;
      miles: number;
    }>();
    const isMyPurchase = (p: any) => !!p.applyToSnapshot && (p.paymentSource === 'card' || p.paymentSource === 'credit_card') && p.paymentTargetId;
    periodCardPurchases.forEach((p: any) => {
      const cardId = p.paymentTargetId as string;
      const card = cardById.get(cardId);
      if (!card) return;
      const amountCents = p.amountCents || 0;
      const rules = getEffectiveRules(card);
      const rule = matchRule(rules, p.category || '', p.subcategory || '');
      const reward = rule ? computeEstimatedReward(rule, amountCents) : {};
      const categoryKey = `${p.category || 'uncategorized'}\t${p.subcategory || ''}`;
      const categoryId = p.category || 'uncategorized';
      const subcategory = p.subcategory || '';
      const categoryLabel = getCategoryName(cfg, categoryId) + (subcategory ? ` → ${subcategory}` : '');
      const displayLabel = subcategory ? subcategory : getCategoryName(cfg, categoryId);
      const cashbackCents = reward.cashbackCents ?? 0;
      const points = reward.points ?? 0;
      const miles = reward.miles ?? 0;
      let rewardLabel = '';
      if (rule) {
        if (rule.unit === 'cashback_percent') rewardLabel = `${rule.value}%`;
        else if (rule.unit === 'points_multiplier') rewardLabel = `${rule.value}× pts`;
        else if (rule.unit === 'miles_multiplier') rewardLabel = `${rule.value}× mi`;
      }
      if (!byCardId.has(cardId)) {
        byCardId.set(cardId, {
          cardId,
          cardName: card.name || 'Card',
          amountCents: 0,
          byCategory: new Map(),
          byCategoryMy: new Map(),
          byCategoryOther: new Map(),
          cashbackCents: 0,
          points: 0,
          miles: 0
        });
      }
      const row = byCardId.get(cardId)!;
      row.amountCents += amountCents;
      row.cashbackCents += cashbackCents;
      row.points += points;
      row.miles += miles;
      const addToMap = (map: Map<string, CategoryRow>, isMy: boolean) => {
        const existing = map.get(categoryKey);
        if (existing) {
          existing.amountCents += amountCents;
          existing.cashbackCents += cashbackCents;
          existing.points += points;
          existing.miles += miles;
        } else {
          map.set(categoryKey, { categoryKey, categoryId, subcategory, categoryLabel, displayLabel, amountCents, rewardLabel, cashbackCents, points, miles });
        }
      };
      addToMap(row.byCategory, false);
      if (isMyPurchase(p)) addToMap(row.byCategoryMy, true); else addToMap(row.byCategoryOther, true);
    });
    Object.keys(rewardOnlyEntries || {}).forEach((cardId) => {
      const card = cardById.get(cardId);
      if (!card) return;
      const entries = rewardOnlyEntries[cardId] || [];
      entries.forEach((entry: CardRewardOnlyEntry) => {
        const amountCents = entry.amountCents || 0;
        const rules = getEffectiveRules(card);
        const rule = matchRule(rules, entry.category || '', entry.subcategory || '');
        const reward = rule ? computeEstimatedReward(rule, amountCents) : {};
        const categoryKey = `${entry.category || 'uncategorized'}\t${entry.subcategory || ''}`;
        const categoryId = entry.category || 'uncategorized';
        const subcategory = entry.subcategory || '';
        const categoryLabel = getCategoryName(cfg, categoryId) + (subcategory ? ` → ${subcategory}` : '');
        const displayLabel = subcategory ? subcategory : getCategoryName(cfg, categoryId);
        const cashbackCents = reward.cashbackCents ?? 0;
        const points = reward.points ?? 0;
        const miles = reward.miles ?? 0;
        let rewardLabel = '';
        if (rule) {
          if (rule.unit === 'cashback_percent') rewardLabel = `${rule.value}%`;
          else if (rule.unit === 'points_multiplier') rewardLabel = `${rule.value}× pts`;
          else if (rule.unit === 'miles_multiplier') rewardLabel = `${rule.value}× mi`;
        }
        if (!byCardId.has(cardId)) {
          byCardId.set(cardId, {
            cardId,
            cardName: card.name || 'Card',
            amountCents: 0,
            byCategory: new Map(),
            byCategoryMy: new Map(),
            byCategoryOther: new Map(),
            cashbackCents: 0,
            points: 0,
            miles: 0
          });
        }
        const row = byCardId.get(cardId)!;
        row.amountCents += amountCents;
        row.cashbackCents += cashbackCents;
        row.points += points;
        row.miles += miles;
        const addToMap = (map: Map<string, CategoryRow>) => {
          const existing = map.get(categoryKey);
          if (existing) {
            existing.amountCents += amountCents;
            existing.cashbackCents += cashbackCents;
            existing.points += points;
            existing.miles += miles;
          } else {
            map.set(categoryKey, { categoryKey, categoryId, subcategory, categoryLabel, displayLabel, amountCents, rewardLabel, cashbackCents, points, miles });
          }
        };
        addToMap(row.byCategory);
        if (entry.isOther) addToMap(row.byCategoryOther); else addToMap(row.byCategoryMy);
      });
    });
    const result = Array.from(byCardId.values()).map((r) => ({
      ...r,
      byCategory: Array.from(r.byCategory.values()),
      byCategoryMy: Array.from(r.byCategoryMy.values()).sort((a, b) => b.amountCents - a.amountCents),
      byCategoryOther: Array.from(r.byCategoryOther.values()).sort((a, b) => b.amountCents - a.amountCents)
    }));
    Object.keys(rewardAdjustments).forEach((cardId) => {
      const card = cardById.get(cardId);
      if (!card) return;
      const cardRow = result.find((r) => r.cardId === cardId);
      if (!cardRow) return;
      const byKey = new Map(cardRow.byCategory.map((row) => [row.categoryKey, row]));
      Object.keys(rewardAdjustments[cardId] || {}).forEach((categoryKey) => {
        if (byKey.has(categoryKey)) return;
        const [categoryId, subcategory] = categoryKey.split('\t');
        const categoryLabel = getCategoryName(cfg, categoryId || 'uncategorized') + (subcategory ? ` → ${subcategory}` : '');
        const displayLabel = (subcategory || '') ? (subcategory || '') : getCategoryName(cfg, categoryId || 'uncategorized');
        byKey.set(categoryKey, { categoryKey, categoryId: categoryId || 'uncategorized', subcategory: subcategory || '', categoryLabel, displayLabel, amountCents: 0, rewardLabel: '', cashbackCents: 0, points: 0, miles: 0 });
      });
      cardRow.byCategory = Array.from(byKey.values());
    });
    result.forEach((cardRow) => {
      const card = cardById.get(cardRow.cardId);
      if (!card) return;
      const rules = getEffectiveRules(card);
      let cardCashback = 0;
      let cardPoints = 0;
      let cardMiles = 0;
      cardRow.byCategory.forEach((row) => {
        const adj = rewardAdjustments[cardRow.cardId]?.[row.categoryKey];
        const baseAmount = row.amountCents;
        const effectiveAmount = adj
          ? (adj.mode === 'set' ? adj.amountCents : baseAmount + adj.amountCents)
          : baseAmount;
        const rule = matchRule(rules, row.categoryId, row.subcategory);
        const reward = rule && effectiveAmount >= 0 ? computeEstimatedReward(rule, effectiveAmount) : {};
        const cashbackCents = reward.cashbackCents ?? 0;
        const points = reward.points ?? 0;
        const miles = reward.miles ?? 0;
        row.amountCents = effectiveAmount;
        row.cashbackCents = cashbackCents;
        row.points = points;
        row.miles = miles;
        row.rewardLabel = rule
          ? (rule.unit === 'cashback_percent' ? `${rule.value}%` : rule.unit === 'points_multiplier' ? `${rule.value}× pts` : `${rule.value}× mi`)
          : '';
        cardCashback += cashbackCents;
        cardPoints += points;
        cardMiles += miles;
      });
      cardRow.cashbackCents = cardCashback;
      cardRow.points = cardPoints;
      cardRow.miles = cardMiles;
      cardRow.amountCents = cardRow.byCategory.reduce((s, row) => s + row.amountCents, 0);
    });
    result.forEach((r) => {
      r.byCategory.sort((a, b) => b.amountCents - a.amountCents);
    });
    result.sort((a, b) => b.amountCents - a.amountCents);
    const totalCashbackCents = result.reduce((s, r) => s + r.cashbackCents, 0);
    const totalMiles = result.reduce((s, r) => s + r.miles, 0);
    const pointsByCard = result.filter((r) => r.points > 0).map((r) => ({ cardName: r.cardName, points: r.points }));
    const cardsWithBalance = result.map((r) => {
      const c = cardById.get(r.cardId);
      return {
        cardId: r.cardId,
        cardName: r.cardName,
        currentCashbackCents: c?.rewardCashbackCents ?? 0,
        currentPoints: c?.rewardPoints ?? 0,
        currentMiles: c?.rewardMiles ?? 0,
        rewardBalanceCleared: !!c?.rewardBalanceCleared,
        avgCentsPerPoint: c?.avgCentsPerPoint,
        avgCentsPerMile: c?.avgCentsPerMile
      };
    });
    return { cards: result, totalCashbackCents, totalMiles, pointsByCard, cardsWithBalance };
  }, [periodPurchases, data.cards, cfg, rewardAdjustments, rewardOnlyEntries]);

  const drilldownFilteredPurchases = useMemo(() => {
    if (!drilldownCategoryId) return filteredPurchases;
    return filteredPurchases.filter((p: any) => (p.category || 'uncategorized') === drilldownCategoryId);
  }, [filteredPurchases, drilldownCategoryId]);

  const sortedPurchases = useMemo(
    () =>
      drilldownFilteredPurchases
        .slice()
        .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || '')),
    [drilldownFilteredPurchases]
  );
  const hasMorePurchases = sortedPurchases.length > 5;
  const visiblePurchases = showAllPurchases ? sortedPurchases : sortedPurchases.slice(0, 5);

  const getPurchaseUiId = (p: any) => {
    if (p.id) return String(p.id);
    const parts = [
      String(p.dateISO || ''),
      String(p.title || ''),
      String(p.amountCents || 0),
      String(p.category || ''),
      String(p.subcategory || '')
    ];
    return parts.join('|');
  };

  const editingPurchase = useMemo(() => {
    if (!editingPurchaseKey) return null;
    const list: any[] = data.purchases || [];
    return list.find((p) => getPurchaseUiId(p) === editingPurchaseKey) || null;
  }, [editingPurchaseKey, data.purchases]);

  useEffect(() => {
    if (!canvasRef.current) return;
    if (view !== 'category') return;
    renderSpendingPieChart(canvasRef.current, byCategory, (categoryId) => {
      setDrilldownCategoryId((prev) => (prev === categoryId ? null : categoryId));
    });
  }, [byCategory, view]);

  return (
    <div className="tab-panel active" id="spendingContent">
      <div className="filter-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Select value={filter} onChange={(e) => setFilter(e.target.value as FilterKey)}>
          <option value="this_month">This Month</option>
          <option value="last_month">Last Month</option>
          <option value="all_time">All Time</option>
          <option value="custom">Custom</option>
        </Select>
        {filter === 'custom' ? (
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input className="ll-control" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <input className="ll-control" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </span>
        ) : null}
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className={view === 'card' ? 'btn btn-secondary ll-toggle active' : 'btn btn-secondary ll-toggle'}
          onClick={() => setView((v) => (v === 'category' ? 'card' : 'category'))}
          aria-pressed={view === 'card'}
        >
          By Card
        </button>
      </div>

      <p className="section-title page-title" style={{ marginTop: 20 }}>Spending distribution</p>
      <div className="card">
        {view === 'category' ? (
          <div
            className="spending-chart-wrap"
            style={{ position: 'relative', width: '100%', height: 220 }}
            onClick={(e) => {
              if (drilldownCategoryId && e.target === e.currentTarget) setDrilldownCategoryId(null);
            }}
          >
            <canvas ref={canvasRef} />
          </div>
        ) : (
          <div>
            {byCard.map((c) => (
              <div className="row" key={c.paymentTargetName} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="name">{c.paymentTargetName}</span>
                <span className="amount">{formatCents(c.amountCents)}</span>
              </div>
            ))}
            {!byCard.length ? <div style={{ color: 'var(--muted)' }}>No purchases in this period.</div> : null}
          </div>
        )}
      </div>

      {view === 'card' && cardSpendingAndRewards.cards.length > 0 ? (
        <>
          <p className="section-title" style={{ marginTop: 24 }}>Rewards by card</p>
          <div className="card" style={{ marginBottom: 0 }}>
            {cardSpendingAndRewards.cards.map((card) => {
              const balance = cardSpendingAndRewards.cardsWithBalance?.find((b) => b.cardId === card.cardId);
              const storedCashback = balance?.currentCashbackCents ?? 0;
              const storedPoints = balance?.currentPoints ?? 0;
              const storedMiles = balance?.currentMiles ?? 0;
              const wasCleared = balance?.rewardBalanceCleared ?? false;
              const currentCashback = !wasCleared && storedCashback === 0 && storedPoints === 0 && storedMiles === 0 ? card.cashbackCents : storedCashback;
              const currentPoints = !wasCleared && storedCashback === 0 && storedPoints === 0 && storedMiles === 0 ? card.points : storedPoints;
              const currentMiles = !wasCleared && storedCashback === 0 && storedPoints === 0 && storedMiles === 0 ? card.miles : storedMiles;
              const hasCurrentBalance = currentCashback > 0 || currentPoints > 0 || currentMiles > 0;
              return (
                <div key={card.cardId} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>{card.cardName}</div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--muted)', marginBottom: 6 }}>
                    Total spending: {formatCents(card.amountCents)}
                  </div>
                  <div style={{ fontSize: '0.85rem', marginBottom: 8 }}>
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ color: 'var(--muted)' }}>Earned this period: </span>
                      {card.cashbackCents > 0 ? formatCents(card.cashbackCents) : ''}
                      {card.points > 0 ? (card.cashbackCents > 0 ? ' · ' : '') + `${card.points.toLocaleString()} pts` : ''}
                      {card.miles > 0 ? (card.cashbackCents > 0 || card.points > 0 ? ' · ' : '') + `${card.miles.toLocaleString()} mi` : ''}
                      {card.cashbackCents === 0 && card.points === 0 && card.miles === 0 ? '—' : ''}
                    </div>
                    <div>
                      <span style={{ color: 'var(--muted)' }}>Current rewards balance: </span>
                      {currentCashback > 0 ? formatCents(currentCashback) : ''}
                      {currentPoints > 0 ? (currentCashback > 0 ? ' · ' : '') + `${currentPoints.toLocaleString()} pts` : ''}
                      {currentMiles > 0 ? (currentCashback > 0 || currentPoints > 0 ? ' · ' : '') + `${currentMiles.toLocaleString()} mi` : ''}
                      {!hasCurrentBalance ? '—' : ''}
                    </div>
                    {(balance?.avgCentsPerPoint != null && balance.avgCentsPerPoint > 0 && currentPoints > 0) || (balance?.avgCentsPerMile != null && balance.avgCentsPerMile > 0 && currentMiles > 0) ? (
                      <div style={{ marginTop: 4, fontSize: '0.85rem', color: 'var(--muted)' }}>
                        Approx. value: ~{formatCents(
                          Math.round((currentPoints * (balance?.avgCentsPerPoint ?? 0) + currentMiles * (balance?.avgCentsPerMile ?? 0)))
                        )}
                      </div>
                    ) : null}
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '2px 8px' }}
                        onClick={() => setEditBalanceModal({
                          cardId: card.cardId,
                          cardName: card.cardName,
                          currentCashbackCents: currentCashback,
                          currentPoints: currentPoints,
                          currentMiles: currentMiles
                        })}
                      >
                        Edit balance
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '2px 8px' }}
                        onClick={() => setRewardAdjustModal({
                          cardId: card.cardId,
                          cardName: card.cardName,
                          byCategory: card.byCategory.map((line) => ({
                            categoryKey: line.categoryKey,
                            categoryLabel: line.categoryLabel,
                            displayLabel: line.displayLabel,
                            categoryId: line.categoryId,
                            subcategory: line.subcategory,
                            amountCents: line.amountCents
                          })),
                          rewardOnlyEntries: rewardOnlyEntries[card.cardId] || []
                        })}
                      >
                        Adjust category amounts
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '2px 8px' }}
                        onClick={() => setClearBalanceConfirm({ cardId: card.cardId, cardName: card.cardName })}
                      >
                        Clear rewards balance
                      </button>
                    </div>
                  </div>
                  {card.byCategory.length > 0 ? (
                    <div style={{ paddingLeft: 12, marginBottom: 8 }}>
                      {card.byCategoryMy && card.byCategoryMy.length > 0 ? (
                        <>
                          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 8, marginBottom: 4 }}>My purchases</div>
                          {card.byCategoryMy.map((line, i) => (
                            <div key={`my-${i}`} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: '0.9rem', marginBottom: 4 }}>
                              <span>{line.displayLabel}: {formatCents(line.amountCents)}{line.rewardLabel ? ` × ${line.rewardLabel}` : ''}</span>
                              <span style={{ color: 'var(--muted)' }}>
                                {line.cashbackCents > 0 ? formatCents(line.cashbackCents) : ''}
                                {line.points > 0 ? (line.cashbackCents > 0 ? ' · ' : '') + `${line.points.toLocaleString()} pts` : ''}
                                {line.miles > 0 ? (line.cashbackCents > 0 || line.points > 0 ? ' · ' : '') + `${line.miles.toLocaleString()} mi` : ''}
                                {line.cashbackCents === 0 && line.points === 0 && line.miles === 0 && line.rewardLabel ? '—' : ''}
                              </span>
                            </div>
                          ))}
                        </>
                      ) : null}
                      {card.byCategoryOther && card.byCategoryOther.length > 0 ? (
                        <>
                          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 8, marginBottom: 4 }}>Other purchases on card</div>
                          {card.byCategoryOther.map((line, i) => (
                            <div key={`other-${i}`} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: '0.9rem', marginBottom: 4 }}>
                              <span>{line.displayLabel}: {formatCents(line.amountCents)}{line.rewardLabel ? ` × ${line.rewardLabel}` : ''}</span>
                              <span style={{ color: 'var(--muted)' }}>
                                {line.cashbackCents > 0 ? formatCents(line.cashbackCents) : ''}
                                {line.points > 0 ? (line.cashbackCents > 0 ? ' · ' : '') + `${line.points.toLocaleString()} pts` : ''}
                                {line.miles > 0 ? (line.cashbackCents > 0 || line.points > 0 ? ' · ' : '') + `${line.miles.toLocaleString()} mi` : ''}
                                {line.cashbackCents === 0 && line.points === 0 && line.miles === 0 && line.rewardLabel ? '—' : ''}
                              </span>
                            </div>
                          ))}
                        </>
                      ) : null}
                      {(!card.byCategoryMy || card.byCategoryMy.length === 0) && (!card.byCategoryOther || card.byCategoryOther.length === 0) ? (
                        card.byCategory.map((line, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: '0.9rem', marginBottom: 4 }}>
                            <span>{line.displayLabel}: {formatCents(line.amountCents)}{line.rewardLabel ? ` × ${line.rewardLabel}` : ''}</span>
                            <span style={{ color: 'var(--muted)' }}>
                              {line.cashbackCents > 0 ? formatCents(line.cashbackCents) : ''}
                              {line.points > 0 ? (line.cashbackCents > 0 ? ' · ' : '') + `${line.points.toLocaleString()} pts` : ''}
                              {line.miles > 0 ? (line.cashbackCents > 0 || line.points > 0 ? ' · ' : '') + `${line.miles.toLocaleString()} mi` : ''}
                              {line.cashbackCents === 0 && line.points === 0 && line.miles === 0 && line.rewardLabel ? '—' : ''}
                            </span>
                          </div>
                        ))
                      ) : null}
                    </div>
                  ) : null}
                  <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                    Card total (period): {card.cashbackCents > 0 ? formatCents(card.cashbackCents) : ''}
                    {card.points > 0 ? (card.cashbackCents > 0 ? ' · ' : '') + `${card.points.toLocaleString()} pts` : ''}
                    {card.miles > 0 ? (card.cashbackCents > 0 || card.points > 0 ? ' · ' : '') + `${card.miles.toLocaleString()} mi` : ''}
                    {card.cashbackCents === 0 && card.points === 0 && card.miles === 0 ? '—' : ''}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="section-title" style={{ marginTop: 16 }}>Period reward totals</p>
          <div className="card">
            {cardSpendingAndRewards.totalCashbackCents > 0 ? (
              <div className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="name">Total cashback</span>
                <span className="amount" style={{ color: 'var(--green)' }}>{formatCents(cardSpendingAndRewards.totalCashbackCents)}</span>
              </div>
            ) : null}
            {cardSpendingAndRewards.pointsByCard.map((p) => (
              <div key={p.cardName} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="name">{p.cardName} points</span>
                <span className="amount" style={{ color: 'var(--muted)' }}>{p.points.toLocaleString()} pts</span>
              </div>
            ))}
            {cardSpendingAndRewards.totalMiles > 0 ? (
              <div className="row" style={{ padding: '6px 0' }}>
                <span className="name">Total miles</span>
                <span className="amount" style={{ color: 'var(--muted)' }}>{cardSpendingAndRewards.totalMiles.toLocaleString()} mi</span>
              </div>
            ) : null}
            {cardSpendingAndRewards.totalCashbackCents === 0 && cardSpendingAndRewards.pointsByCard.length === 0 && cardSpendingAndRewards.totalMiles === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No rewards in this period (no matching rules or no card purchases).</div>
            ) : null}
          </div>
        </>
      ) : null}

      <p className="section-title">This period total</p>
      <div className="card">
        <span className="amount">{formatCents(periodTotalCents)}</span>
      </div>

      {view === 'category' ? (
      <>
      <div
        className="section-header"
        style={{ marginTop: 20, marginBottom: 0 }}
        onClick={() => setByCategoryCollapsed(!byCategoryCollapsed)}
      >
        <span className="section-header-left">By category</span>
        <span className="chevron">{byCategoryCollapsed ? '▸' : '▾'}</span>
      </div>
      {!byCategoryCollapsed ? (
      <>
      {drilldownCategoryId ? (
        <div style={{ marginBottom: 8 }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setDrilldownCategoryId(null)}
          >
            Show all categories
          </button>
        </div>
      ) : null}
      <div>
        {byCategory.map((c) => (
          <div
            className="card"
            key={c.categoryId}
            style={{
              background: getCategoryColor(c.categoryId),
              borderColor: 'var(--border)',
              cursor: 'pointer'
            }}
            onClick={() => setDrilldownCategoryId((prev) => (prev === c.categoryId ? null : c.categoryId))}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setDrilldownCategoryId((prev) => (prev === c.categoryId ? null : c.categoryId));
              }
            }}
          >
            <div className="row">
              <span className="name">{getCategoryName(cfg, c.categoryId)}</span>
              <span className="amount">{formatCents(c.amountCents)}</span>
            </div>
          </div>
        ))}
      </div>
      </>
      ) : null}
      </>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '24px 0 12px 0' }}>
        <div
          className="section-header"
          style={{ margin: 0, padding: '4px 8px', flex: 1 }}
          onClick={() => setPurchasesCollapsed(!purchasesCollapsed)}
        >
          <span className="section-header-left">Purchases</span>
          {drilldownCategoryId ? (
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)', marginLeft: 8 }}>
              (showing: {getCategoryName(cfg, drilldownCategoryId)})
            </span>
          ) : null}
          <span className="chevron">{purchasesCollapsed ? '▸' : '▾'}</span>
        </div>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            setSearchOpen((v) => !v);
            if (searchOpen) setSearchQuery('');
          }}
          aria-label="Search purchases"
          title="Search"
        >
          🔍
        </button>
      </div>
      {searchOpen ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            className="ll-control"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder='Search title, category, subcategory… (or "/regex/")'
            style={{ flex: 1 }}
          />
          <button type="button" className="btn clear-btn" onClick={() => setSearchQuery('')}>
            Clear
          </button>
        </div>
      ) : null}
      {!purchasesCollapsed ? (
        <div>
          {visiblePurchases.map((p: any) => {
            const uiId = getPurchaseUiId(p);
            return (
            <div className="card" key={uiId}>
              <div className="row">
                <span className="name">{p.title || 'Purchase'}</span>
                <span className="amount">{formatCents(p.amountCents || 0)}</span>
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: 6 }}>
                {formatLongLocalDate(p.dateISO || '')} •{' '}
                <span style={{ color: getCategoryColor(p.category || 'uncategorized'), fontWeight: 600 }}>
                  {getCategoryName(cfg, p.category || 'uncategorized')}
                </span>
                {p.subcategory ? <span> • {p.subcategory}</span> : null}
              </div>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditingPurchaseKey(uiId);
                    setReimbursementMode(false);
                    setOpenAdd(true);
                  }}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => setConfirmDelete({ id: p.id, label: p.title || 'Purchase' })}
                >
                  Delete
                </button>
              </div>
            </div>
          )})}
          {!showAllPurchases && hasMorePurchases ? (
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowAllPurchases(true)}
              >
                See more
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        <button
          type="button"
          className="btn btn-add"
          style={{ width: '100%' }}
          onClick={() => {
            setEditingPurchaseKey(null);
            setReimbursementMode(false);
            setOpenAdd(true);
          }}
        >
          + Add Purchase
        </button>
        <button
          type="button"
          className="btn btn-add"
          style={{ width: '100%' }}
          onClick={() => {
            setEditingPurchaseKey(null);
            setReimbursementMode(true);
            setOpenAdd(true);
          }}
        >
          Add Card Purchase (Full reimbursement expected)
        </button>
      </div>

      {openAdd && detected?.launchFlow?.flow === 'add_purchase' && detected.launchFlow.item ? (
        <div className="card" style={{ marginBottom: 12, padding: 10, fontSize: '0.85rem', color: 'var(--muted)', border: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Detected activity (reference)</div>
          <div>Merchant: {detected.launchFlow.item.title}</div>
          <div>Amount: {formatCents(detected.launchFlow.item.amountCents)}</div>
          <div>Account: {detected.launchFlow.item.accountName}</div>
          <div>Date: {detected.launchFlow.item.dateISO}</div>
          <div>Status: {detected.launchFlow.item.pending ? 'Pending' : 'Posted'}</div>
        </div>
      ) : null}
      <AddPurchaseModal
        open={openAdd}
        onClose={() => {
          setOpenAdd(false);
          setReimbursementMode(false);
          if (detected?.launchFlow?.flow === 'add_purchase') detected.setLaunchFlow(null);
        }}
        purchaseKey={editingPurchase ? getPurchaseUiId(editingPurchase) : null}
        prefill={detected?.launchFlow?.flow === 'add_purchase' && detected.launchFlow.item ? { title: detected.launchFlow.item.title, amountCents: Math.abs(detected.launchFlow.item.amountCents), dateISO: detected.launchFlow.item.dateISO } : null}
        onSave={detected?.launchFlow?.flow === 'add_purchase' ? () => { detected.markResolved(detected.launchFlow!.detectedId, 'add_purchase'); detected.setLaunchFlow(null); setOpenAdd(false); } : undefined}
        reimbursementExpected={reimbursementMode}
      />

      {rewardAdjustModal ? (
        <RewardAdjustModal
          modal={rewardAdjustModal}
          cfg={cfg}
          onClose={() => setRewardAdjustModal(null)}
          onSave={(updates, newRewardOnlyEntries) => {
            const { cardId } = rewardAdjustModal;
            const nextAdj: CardRewardAdjustmentsState = { ...rewardAdjustments };
            nextAdj[cardId] = { ...(nextAdj[cardId] || {}) };
            Object.entries(updates).forEach(([categoryKey, amountCents]) => {
              nextAdj[cardId][categoryKey] = { amountCents, mode: 'set' as const };
            });
            saveCardRewardAdjustments(nextAdj);
            setRewardAdjustments(nextAdj);
            if (newRewardOnlyEntries && newRewardOnlyEntries.length > 0) {
              const nextEntries: CardRewardOnlyEntriesState = { ...rewardOnlyEntries };
              nextEntries[cardId] = [...(nextEntries[cardId] || []), ...newRewardOnlyEntries];
              saveCardRewardOnlyEntries(nextEntries);
              setRewardOnlyEntries(nextEntries);
              const card = (data.cards || []).find((c) => c.id === cardId);
              if (card) {
                const rules = getEffectiveRules(card);
                let dCash = 0; let dPoints = 0; let dMiles = 0;
                newRewardOnlyEntries.forEach((e) => {
                  const rule = matchRule(rules, e.category || '', e.subcategory || '');
                  const reward = rule ? computeEstimatedReward(rule, e.amountCents) : {};
                  dCash += reward.cashbackCents ?? 0;
                  dPoints += reward.points ?? 0;
                  dMiles += reward.miles ?? 0;
                });
                if (dCash || dPoints || dMiles) {
                  actions.updateCardRewardTotals(cardId, {
                    rewardCashbackCents: (card.rewardCashbackCents ?? 0) + dCash,
                    rewardPoints: (card.rewardPoints ?? 0) + dPoints,
                    rewardMiles: (card.rewardMiles ?? 0) + dMiles
                  });
                }
              }
            }
            setRewardAdjustModal(null);
          }}
        />
      ) : null}

      {clearBalanceConfirm ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Clear rewards balance</h3>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>
              Reset current rewards balance for <strong>{clearBalanceConfirm.cardName}</strong>? This will not delete any purchases.
            </p>
            <div className="btn-row">
              <button type="button" className="btn btn-secondary" onClick={() => setClearBalanceConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  actions.updateCardRewardTotals(clearBalanceConfirm.cardId, { rewardCashbackCents: 0, rewardPoints: 0, rewardMiles: 0, rewardBalanceCleared: true });
                  setClearBalanceConfirm(null);
                }}
              >
                Reset current rewards balance
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editBalanceModal ? (
        <EditBalanceModal
          modal={editBalanceModal}
          onClose={() => setEditBalanceModal(null)}
          onSave={(rewardCashbackCents, rewardPoints, rewardMiles) => {
            actions.updateCardRewardTotals(editBalanceModal.cardId, { rewardCashbackCents, rewardPoints, rewardMiles });
            setEditBalanceModal(null);
          }}
        />
      ) : null}

      {confirmDelete ? (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Are you sure you want to delete this?</h3>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>{confirmDelete.label}</p>
            <div className="btn-row">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  actions.deletePurchase(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type NewRewardOnlyDraft = { title: string; amountStr: string; category: string; subcategory: string; isOther: boolean };

function RewardAdjustModal({
  modal,
  cfg,
  onClose,
  onSave
}: {
  modal: { cardName: string; byCategory: Array<{ categoryKey: string; displayLabel: string; amountCents: number }>; rewardOnlyEntries: CardRewardOnlyEntry[] };
  cfg: CategoryConfig;
  onClose: () => void;
  onSave: (updates: Record<string, number>, newRewardOnlyEntries?: CardRewardOnlyEntry[]) => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    modal.byCategory.forEach((row) => {
      init[row.categoryKey] = (row.amountCents / 100).toFixed(2);
    });
    return init;
  });
  const [newDraft, setNewDraft] = useState<NewRewardOnlyDraft>({ title: '', amountStr: '', category: 'food', subcategory: '', isOther: true });
  const [newEntries, setNewEntries] = useState<NewRewardOnlyDraft[]>([]);
  const subs = useMemo(() => getCategorySubcategories(cfg, newDraft.category), [cfg, newDraft.category]);

  const handleSubmit = () => {
    const updates: Record<string, number> = {};
    modal.byCategory.forEach((row) => {
      const str = amounts[row.categoryKey] ?? (row.amountCents / 100).toFixed(2);
      const parsed = parseFloat(str);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        updates[row.categoryKey] = Math.round(parsed * 100);
      }
    });
    const toAdd: CardRewardOnlyEntry[] = newEntries
      .filter((e) => e.amountStr.trim() && parseFloat(e.amountStr) > 0)
      .map((e) => ({
        id: uid(),
        title: e.title.trim() || undefined,
        amountCents: Math.round(parseFloat(e.amountStr) * 100),
        category: e.category || 'uncategorized',
        subcategory: e.subcategory || '',
        isOther: e.isOther
      }));
    onSave(updates, toAdd.length > 0 ? toAdd : undefined);
  };

  const addDraftToList = () => {
    if (!newDraft.amountStr.trim() || parseFloat(newDraft.amountStr) <= 0) return;
    setNewEntries((prev) => [...prev, { ...newDraft }]);
    setNewDraft({ title: '', amountStr: '', category: 'food', subcategory: '', isOther: true });
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 460 }}>
        <h3>Adjust category amounts for rewards</h3>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>Card: <strong>{modal.cardName}</strong></p>
        <p style={{ fontSize: '0.9rem', marginTop: 4, marginBottom: 12 }}>Edit the spending amount used for rewards for each category. You can also add reward-only entries (e.g. other people&apos;s spending on the card) that count only toward rewards, not Snapshot or net cash.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {modal.byCategory.map((row) => (
            <div key={row.categoryKey} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <label style={{ flex: '1 1 120px', minWidth: 0, fontSize: '0.9rem' }}>{row.displayLabel}</label>
              <input
                className="ll-control"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                style={{ width: 100 }}
                value={amounts[row.categoryKey] ?? ''}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [row.categoryKey]: e.target.value }))}
              />
            </div>
          ))}
        </div>

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>Add reward-only purchase</div>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0 0 8px 0' }}>These count toward card rewards and spending in this view only. They do not affect Snapshot or Final Net Cash.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="field">
              <label>Label (optional)</label>
              <input className="ll-control" value={newDraft.title} onChange={(e) => setNewDraft((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Family purchase" />
            </div>
            <div className="field">
              <label>Amount ($)</label>
              <input className="ll-control" type="number" min="0" step="0.01" value={newDraft.amountStr} onChange={(e) => setNewDraft((p) => ({ ...p, amountStr: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="field">
              <label>Category</label>
              <Select value={newDraft.category} onChange={(e) => setNewDraft((p) => ({ ...p, category: e.target.value, subcategory: '' }))}>
                {Object.keys(cfg).map((id) => (
                  <option key={id} value={id}>{getCategoryName(cfg, id)}</option>
                ))}
              </Select>
            </div>
            {subs.length > 0 ? (
              <div className="field">
                <label>Subcategory</label>
                <Select value={newDraft.subcategory} onChange={(e) => setNewDraft((p) => ({ ...p, subcategory: e.target.value }))}>
                  <option value="">— None —</option>
                  {subs.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div className="toggle-row">
              <input type="checkbox" id="rewardOnlyIsOther" checked={newDraft.isOther} onChange={(e) => setNewDraft((p) => ({ ...p, isOther: e.target.checked }))} />
              <label htmlFor="rewardOnlyIsOther">Other purchases on card</label>
            </div>
            <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={addDraftToList}>
              Add to list
            </button>
          </div>
          {newEntries.length > 0 ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 4 }}>Will add: {newEntries.length} item(s)</div>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: '0.85rem' }}>
                {newEntries.map((e, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    {e.title || 'No label'} — {formatCents(Math.round(parseFloat(e.amountStr || '0') * 100))} · {getCategoryName(cfg, e.category)}{e.subcategory ? ` → ${e.subcategory}` : ''} {e.isOther ? '(other)' : '(my)'}
                    <button type="button" className="btn clear-btn" style={{ marginLeft: 8, padding: '0 4px', fontSize: '0.75rem' }} onClick={() => setNewEntries((prev) => prev.filter((_, j) => j !== i))}>Remove</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="btn-row" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>Save</button>
        </div>
      </div>
    </div>
  );
}

function EditBalanceModal({
  modal,
  onClose,
  onSave
}: {
  modal: { cardName: string; currentCashbackCents: number; currentPoints: number; currentMiles: number };
  onClose: () => void;
  onSave: (rewardCashbackCents: number, rewardPoints: number, rewardMiles: number) => void;
}) {
  const [cashbackStr, setCashbackStr] = useState(() => (modal.currentCashbackCents / 100).toFixed(2));
  const [pointsStr, setPointsStr] = useState(() => String(modal.currentPoints));
  const [milesStr, setMilesStr] = useState(() => String(modal.currentMiles));
  const handleSubmit = () => {
    const cashbackCents = Math.max(0, Math.round(parseFloat(cashbackStr || '0') * 100));
    const points = Math.max(0, Math.round(parseFloat(pointsStr || '0')));
    const miles = Math.max(0, Math.round(parseFloat(milesStr || '0')));
    onSave(cashbackCents, points, miles);
  };
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Edit current rewards balance</h3>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>Card: <strong>{modal.cardName}</strong></p>
        <div style={{ marginTop: 12 }}>
          <label style={{ display: 'block', marginBottom: 6 }}>
            Cashback ($): <input className="ll-control" type="number" min="0" step="0.01" value={cashbackStr} onChange={(e) => setCashbackStr(e.target.value)} />
          </label>
          <label style={{ display: 'block', marginBottom: 6 }}>
            Points: <input className="ll-control" type="number" min="0" step="1" value={pointsStr} onChange={(e) => setPointsStr(e.target.value)} />
          </label>
          <label style={{ display: 'block', marginBottom: 6 }}>
            Miles: <input className="ll-control" type="number" min="0" step="1" value={milesStr} onChange={(e) => setMilesStr(e.target.value)} />
          </label>
        </div>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={handleSubmit}>Save</button>
        </div>
      </div>
    </div>
  );
}

