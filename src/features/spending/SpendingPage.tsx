import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCents, formatLongLocalDate } from '../../state/calc';
import { useLedgerStore } from '../../state/store';
import { useDetectedActivityOptional } from '../../state/DetectedActivityContext';
import { getCategoryName, loadCategoryConfig, loadCardRewardAdjustments, saveCardRewardAdjustments, loadCardRewardOnlyEntries, saveCardRewardOnlyEntries, loadRewardsVisibleCardIds, saveRewardsVisibleCardIds, type CardRewardAdjustmentsState, type CardRewardOnlyEntriesState, type CardRewardOnlyEntry } from '../../state/storage';
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
  const [rewardsVisibleCardIds, setRewardsVisibleCardIds] = useState<string[]>(() => loadRewardsVisibleCardIds());
  const [editingRewardAmount, setEditingRewardAmount] = useState<{ cardId: string; categoryKey: string; section?: 'my' | 'other' } | null>(null);
  const [editingRewardAmountValue, setEditingRewardAmountValue] = useState('');
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
    (data.cards || []).forEach((card) => {
      if (!byCardId.has(card.id)) {
        byCardId.set(card.id, {
          cardId: card.id,
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
    });
    periodCardPurchases.forEach((p: any) => {
      const cardId = p.paymentTargetId as string;
      const card = cardById.get(cardId);
      if (!card) return;
      const fullChargeCents = typeof p.splitTotalCents === 'number' ? p.splitTotalCents : typeof p.originalTotal === 'number' ? p.originalTotal : (p.amountCents || 0);
      const isSplit = !!p.isSplit && (typeof p.splitTotalCents === 'number' || typeof p.originalTotal === 'number');
      const fullReimbursement = !!p.fullReimbursementExpected;
      const applied = !!(p.paymentSource === 'card' || p.paymentSource === 'credit_card') && p.paymentTargetId;
      let myPortionCents: number;
      let otherPortionCents: number;
      if (fullReimbursement) {
        myPortionCents = 0;
        otherPortionCents = fullChargeCents;
      } else {
        myPortionCents = applied ? (isSplit ? (typeof p.splitMyPortionCents === 'number' ? p.splitMyPortionCents : p.amountCents || 0) : fullChargeCents) : 0;
        otherPortionCents = Math.max(0, fullChargeCents - myPortionCents);
      }
      const rules = getEffectiveRules(card);
      const rule = matchRule(rules, p.category || '', p.subcategory || '');
      const rewardFull = rule && fullChargeCents > 0 ? computeEstimatedReward(rule, fullChargeCents) : {};
      const ratioMy = fullChargeCents > 0 ? myPortionCents / fullChargeCents : 0;
      const ratioOther = fullChargeCents > 0 ? otherPortionCents / fullChargeCents : 0;
      const categoryKey = `${p.category || 'uncategorized'}\t${p.subcategory || ''}`;
      const categoryId = p.category || 'uncategorized';
      const subcategory = p.subcategory || '';
      const categoryLabel = getCategoryName(cfg, categoryId) + (subcategory ? ` → ${subcategory}` : '');
      const displayLabel = subcategory ? subcategory : getCategoryName(cfg, categoryId);
      let rewardLabel = '';
      if (rule) {
        if (rule.unit === 'cashback_percent') rewardLabel = `${rule.value}%`;
        else if (rule.unit === 'points_multiplier') rewardLabel = `${rule.value}× pts`;
        else if (rule.unit === 'miles_multiplier') rewardLabel = `${rule.value}× mi`;
      }
      const cashbackFull = rewardFull.cashbackCents ?? 0;
      const pointsFull = rewardFull.points ?? 0;
      const milesFull = rewardFull.miles ?? 0;
      const row = byCardId.get(cardId)!;
      row.amountCents += fullChargeCents;
      row.cashbackCents += cashbackFull;
      row.points += pointsFull;
      row.miles += milesFull;
      const addToCategory = (map: Map<string, CategoryRow>, amountCents: number, cashbackCents: number, points: number, miles: number) => {
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
      addToCategory(row.byCategory, fullChargeCents, cashbackFull, pointsFull, milesFull);
      if (myPortionCents > 0) addToCategory(row.byCategoryMy, myPortionCents, Math.round(cashbackFull * ratioMy), Math.round(pointsFull * ratioMy), Math.round(milesFull * ratioMy));
      if (otherPortionCents > 0) addToCategory(row.byCategoryOther, otherPortionCents, Math.round(cashbackFull * ratioOther), Math.round(pointsFull * ratioOther), Math.round(milesFull * ratioOther));
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
      cardRow.byCategory.forEach((row) => {
        const adj = rewardAdjustments[cardRow.cardId]?.[row.categoryKey];
        const baseAmount = row.amountCents;
        const effectiveAmount = adj
          ? (adj.mode === 'set' ? adj.amountCents : baseAmount + adj.amountCents)
          : baseAmount;
        const rule = matchRule(rules, row.categoryId, row.subcategory);
        const reward = rule && effectiveAmount > 0 ? computeEstimatedReward(rule, effectiveAmount) : {};
        row.amountCents = effectiveAmount;
        row.cashbackCents = reward.cashbackCents ?? 0;
        row.points = reward.points ?? 0;
        row.miles = reward.miles ?? 0;
      });
      cardRow.byCategory = cardRow.byCategory.filter((row) => row.amountCents > 0);

      const applyToSection = (rows: typeof cardRow.byCategoryMy, suffix: string) => {
        const byKey = new Map(rows.map((r) => [r.categoryKey, { ...r }]));
        Object.keys(rewardAdjustments[cardRow.cardId] || {}).forEach((adjKey) => {
          if (!adjKey.endsWith(suffix)) return;
          const categoryKey = adjKey.slice(0, -suffix.length);
          if (byKey.has(categoryKey)) return;
          const [categoryId, subcategory] = categoryKey.split('\t');
          const categoryLabel = getCategoryName(cfg, categoryId || 'uncategorized') + (subcategory ? ` → ${subcategory}` : '');
          const displayLabel = (subcategory || '') ? (subcategory || '') : getCategoryName(cfg, categoryId || 'uncategorized');
          byKey.set(categoryKey, { categoryKey, categoryId: categoryId || 'uncategorized', subcategory: subcategory || '', categoryLabel, displayLabel, amountCents: 0, rewardLabel: '', cashbackCents: 0, points: 0, miles: 0 });
        });
        byKey.forEach((row) => {
          const adj = rewardAdjustments[cardRow.cardId]?.[row.categoryKey + suffix];
          const baseAmount = row.amountCents;
          const effectiveAmount = adj
            ? (adj.mode === 'set' ? adj.amountCents : baseAmount + adj.amountCents)
            : baseAmount;
          const rule = matchRule(rules, row.categoryId, row.subcategory);
          const reward = rule && effectiveAmount > 0 ? computeEstimatedReward(rule, effectiveAmount) : {};
          row.amountCents = effectiveAmount;
          row.cashbackCents = reward.cashbackCents ?? 0;
          row.points = reward.points ?? 0;
          row.miles = reward.miles ?? 0;
        });
        return Array.from(byKey.values()).filter((r) => r.amountCents > 0).sort((a, b) => b.amountCents - a.amountCents);
      };
      cardRow.byCategoryMy = applyToSection(cardRow.byCategoryMy, '|my');
      cardRow.byCategoryOther = applyToSection(cardRow.byCategoryOther, '|other');

      const hasSplit = (cardRow.byCategoryMy?.length ?? 0) > 0 || (cardRow.byCategoryOther?.length ?? 0) > 0;
      if (hasSplit) {
        const mySum = (cardRow.byCategoryMy || []).reduce((s, r) => s + r.amountCents, 0);
        const otherSum = (cardRow.byCategoryOther || []).reduce((s, r) => s + r.amountCents, 0);
        cardRow.amountCents = mySum + otherSum;
        cardRow.cashbackCents = (cardRow.byCategoryMy || []).reduce((s, r) => s + r.cashbackCents, 0) + (cardRow.byCategoryOther || []).reduce((s, r) => s + r.cashbackCents, 0);
        cardRow.points = (cardRow.byCategoryMy || []).reduce((s, r) => s + r.points, 0) + (cardRow.byCategoryOther || []).reduce((s, r) => s + r.points, 0);
        cardRow.miles = (cardRow.byCategoryMy || []).reduce((s, r) => s + r.miles, 0) + (cardRow.byCategoryOther || []).reduce((s, r) => s + r.miles, 0);
      } else {
        cardRow.cashbackCents = cardRow.byCategory.reduce((s, row) => s + row.cashbackCents, 0);
        cardRow.points = cardRow.byCategory.reduce((s, row) => s + row.points, 0);
        cardRow.miles = cardRow.byCategory.reduce((s, row) => s + row.miles, 0);
        cardRow.amountCents = cardRow.byCategory.reduce((s, row) => s + row.amountCents, 0);
      }
    });
    result.forEach((r) => {
      r.byCategory.sort((a, b) => b.amountCents - a.amountCents);
    });
    result.sort((a, b) => b.amountCents - a.amountCents);
    const totalCashbackCents = result.reduce((s, r) => s + r.cashbackCents, 0);
    const totalMiles = result.reduce((s, r) => s + r.miles, 0);
    const pointsByCard = result.filter((r) => r.points > 0).map((r) => ({ cardId: r.cardId, cardName: r.cardName, points: r.points }));
    const milesByCard = result.filter((r) => r.miles > 0).map((r) => ({ cardId: r.cardId, cardName: r.cardName, miles: r.miles }));
    const cardsWithBalance = result.map((r) => {
      const c = cardById.get(r.cardId);
      return {
        cardId: r.cardId,
        cardName: r.cardName,
        currentCashbackCents: c?.rewardCashbackCents ?? 0,
        currentPoints: c?.rewardPoints ?? 0,
        currentMiles: c?.rewardMiles ?? 0,
        rewardBalanceCleared: !!c?.rewardBalanceCleared,
        rewardManualOverride: !!c?.rewardManualOverride,
        avgCentsPerPoint: c?.avgCentsPerPoint,
        avgCentsPerMile: c?.avgCentsPerMile
      };
    });
    return { cards: result, totalCashbackCents, totalMiles, pointsByCard, milesByCard, cardsWithBalance };
  }, [periodPurchases, data.cards, cfg, rewardAdjustments, rewardOnlyEntries]);

  const visibleRewardsCards = useMemo(() => {
    const ids = new Set(rewardsVisibleCardIds);
    return cardSpendingAndRewards.cards.filter(
      (c) =>
        ids.has(c.cardId) ||
        c.amountCents > 0 ||
        c.cashbackCents > 0 ||
        c.points > 0 ||
        c.miles > 0 ||
        (rewardOnlyEntries[c.cardId]?.length ?? 0) > 0 ||
        Object.keys(rewardAdjustments[c.cardId] || {}).length > 0
    );
  }, [cardSpendingAndRewards.cards, rewardsVisibleCardIds, rewardOnlyEntries, rewardAdjustments]);

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

      {view === 'card' ? (
        <>
          <p className="section-title" style={{ marginTop: 24 }}>Rewards by card</p>
          <div className="card" style={{ marginBottom: 0 }}>
            {visibleRewardsCards.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: 8 }}>
                No cards with activity. Add a card in Snapshot to track rewards, or add a card below to show it here.
              </div>
            ) : null}
            {visibleRewardsCards.map((card) => {
              const balance = cardSpendingAndRewards.cardsWithBalance?.find((b) => b.cardId === card.cardId);
              const storedCashback = balance?.currentCashbackCents ?? 0;
              const storedPoints = balance?.currentPoints ?? 0;
              const storedMiles = balance?.currentMiles ?? 0;
              const useStoredBalance = (balance?.rewardBalanceCleared ?? false) || (balance?.rewardManualOverride ?? false);
              const currentCashback = useStoredBalance ? storedCashback : card.cashbackCents;
              const currentPoints = useStoredBalance ? storedPoints : card.points;
              const currentMiles = useStoredBalance ? storedMiles : card.miles;
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
                        onClick={() => setClearBalanceConfirm({ cardId: card.cardId, cardName: card.cardName })}
                      >
                        Clear rewards balance
                      </button>
                    </div>
                  </div>
                  {card.byCategory.length > 0 ? (
                    <div style={{ paddingLeft: 12, marginBottom: 8 }}>
                      {(() => {
                        const hasMy = card.byCategoryMy && card.byCategoryMy.length > 0;
                        const hasOther = card.byCategoryOther && card.byCategoryOther.length > 0;
                        const showSplit = hasMy || hasOther;
                        const saveAdjustment = (adjKey: string, amountCents: number, mode: 'set' | 'add') => {
                          const next: CardRewardAdjustmentsState = { ...rewardAdjustments };
                          next[card.cardId] = { ...(next[card.cardId] || {}) };
                          next[card.cardId][adjKey] = { amountCents, mode };
                          saveCardRewardAdjustments(next);
                          setRewardAdjustments(next);
                          setEditingRewardAmount(null);
                        };
                        const renderEditableAmount = (line: { categoryKey: string; amountCents: number; displayLabel: string; cashbackCents: number; points: number; miles: number }, section: 'my' | 'other' | undefined) => {
                          const adjKey = section ? line.categoryKey + (section === 'my' ? '|my' : '|other') : line.categoryKey;
                          const isEditing = editingRewardAmount?.cardId === card.cardId && editingRewardAmount?.categoryKey === line.categoryKey && editingRewardAmount?.section === section;
                          return isEditing ? (
                            <input
                              type="text"
                              autoFocus
                              style={{ width: 64, padding: '0 4px', fontSize: 'inherit', border: 'none', borderBottom: '1px solid var(--muted)', borderRadius: 0, background: 'transparent' }}
                              value={editingRewardAmountValue}
                              onChange={(e) => setEditingRewardAmountValue(e.target.value)}
                              onBlur={() => {
                                const raw = editingRewardAmountValue.trim();
                                const isAdd = raw.startsWith('+') || raw.startsWith('-');
                                const num = raw.replace(/^[+-]/, '');
                                const parsed = parseFloat(num);
                                const amountCents = Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
                                const mode: 'set' | 'add' = isAdd ? 'add' : 'set';
                                const finalCents = mode === 'add' ? Math.max(0, line.amountCents + (raw.startsWith('-') ? -amountCents : amountCents)) : amountCents;
                                saveAdjustment(adjKey, finalCents, 'set');
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                            />
                          ) : (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setEditingRewardAmount({ cardId: card.cardId, categoryKey: line.categoryKey, section });
                                setEditingRewardAmountValue((line.amountCents / 100).toFixed(2));
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setEditingRewardAmount({ cardId: card.cardId, categoryKey: line.categoryKey, section }); setEditingRewardAmountValue((line.amountCents / 100).toFixed(2)); } }}
                              style={{ cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 2 }}
                              title="Click to edit (type +10 to add)"
                            >
                              {formatCents(line.amountCents)}
                            </span>
                          );
                        };
                        if (showSplit) {
                          return (
                            <>
                              {hasMy ? (
                                <>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 8, marginBottom: 4 }}>My purchases</div>
                                  {card.byCategoryMy!.map((line, i) => (
                                    <div key={`my-${line.categoryKey}`} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: '0.9rem', marginBottom: 4 }}>
                                      <span>{line.displayLabel}: {renderEditableAmount(line, 'my')}</span>
                                      <span style={{ color: 'var(--muted)' }}>
                                        {line.cashbackCents > 0 ? formatCents(line.cashbackCents) : ''}
                                        {line.points > 0 ? (line.cashbackCents > 0 ? ' · ' : '') + `${line.points.toLocaleString()} pts` : ''}
                                        {line.miles > 0 ? (line.cashbackCents > 0 || line.points > 0 ? ' · ' : '') + `${line.miles.toLocaleString()} mi` : ''}
                                        {line.cashbackCents === 0 && line.points === 0 && line.miles === 0 ? '—' : ''}
                                      </span>
                                    </div>
                                  ))}
                                </>
                              ) : null}
                              {hasOther ? (
                                <>
                                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 8, marginBottom: 4 }}>Reimbursed / other card spend</div>
                                  {card.byCategoryOther!.map((line, i) => (
                                    <div key={`other-${line.categoryKey}`} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: '0.9rem', marginBottom: 4 }}>
                                      <span>{line.displayLabel}: {renderEditableAmount(line, 'other')}</span>
                                      <span style={{ color: 'var(--muted)' }}>
                                        {line.cashbackCents > 0 ? formatCents(line.cashbackCents) : ''}
                                        {line.points > 0 ? (line.cashbackCents > 0 ? ' · ' : '') + `${line.points.toLocaleString()} pts` : ''}
                                        {line.miles > 0 ? (line.cashbackCents > 0 || line.points > 0 ? ' · ' : '') + `${line.miles.toLocaleString()} mi` : ''}
                                        {line.cashbackCents === 0 && line.points === 0 && line.miles === 0 ? '—' : ''}
                                      </span>
                                    </div>
                                  ))}
                                </>
                              ) : null}
                            </>
                          );
                        }
                        return card.byCategory.map((line) => (
                          <div key={line.categoryKey} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 4, fontSize: '0.9rem', marginBottom: 4 }}>
                            <span>{line.displayLabel}: {renderEditableAmount(line, undefined)}</span>
                            <span style={{ color: 'var(--muted)' }}>
                              {line.cashbackCents > 0 ? formatCents(line.cashbackCents) : ''}
                              {line.points > 0 ? (line.cashbackCents > 0 ? ' · ' : '') + `${line.points.toLocaleString()} pts` : ''}
                              {line.miles > 0 ? (line.cashbackCents > 0 || line.points > 0 ? ' · ' : '') + `${line.miles.toLocaleString()} mi` : ''}
                              {line.cashbackCents === 0 && line.points === 0 && line.miles === 0 ? '—' : ''}
                            </span>
                          </div>
                        ));
                      })()}
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
          {(data.cards || []).length > visibleRewardsCards.length ? (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <label style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Add card to view: </label>
              <Select
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  if (!id) return;
                  const next = [...rewardsVisibleCardIds, id];
                  saveRewardsVisibleCardIds(next);
                  setRewardsVisibleCardIds(next);
                  e.target.value = '';
                }}
                style={{ marginLeft: 8, display: 'inline-block', width: 'auto', minWidth: 140 }}
              >
                <option value="">— Select card —</option>
                {(data.cards || [])
                  .filter((c) => !visibleRewardsCards.some((v) => v.cardId === c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name || 'Card'}</option>
                  ))}
              </Select>
            </div>
          ) : null}
          <p className="section-title" style={{ marginTop: 16 }}>Earned this period</p>
          <div className="card">
            {(() => {
              const periodCashback = visibleRewardsCards.reduce((s, c) => s + c.cashbackCents, 0);
              const periodPointsByCard = visibleRewardsCards.filter((c) => c.points > 0).map((c) => ({ cardId: c.cardId, cardName: c.cardName, points: c.points }));
              const periodMilesByCard = visibleRewardsCards.filter((c) => c.miles > 0).map((c) => ({ cardId: c.cardId, cardName: c.cardName, miles: c.miles }));
              return (
                <>
            {periodCashback > 0 ? (
              <div className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span className="name">Cashback earned this period</span>
                <span className="amount" style={{ color: 'var(--green)' }}>{formatCents(periodCashback)}</span>
              </div>
            ) : null}
            {periodPointsByCard.map((p) => {
              const bal = cardSpendingAndRewards.cardsWithBalance?.find((b) => b.cardId === p.cardId);
              const approxCents = (bal?.avgCentsPerPoint != null && bal.avgCentsPerPoint > 0) ? Math.round(p.points * bal.avgCentsPerPoint) : null;
              return (
                <div key={p.cardId || p.cardName} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="name">{p.cardName} points earned this period</span>
                  <span className="amount" style={{ color: 'var(--muted)' }}>
                    {p.points.toLocaleString()} pts
                    {approxCents != null && approxCents > 0 ? ` (~${formatCents(approxCents)})` : ''}
                  </span>
                </div>
              );
            })}
            {periodMilesByCard.map((m) => {
              const bal = cardSpendingAndRewards.cardsWithBalance?.find((b) => b.cardId === m.cardId);
              const approxCents = (bal?.avgCentsPerMile != null && bal.avgCentsPerMile > 0) ? Math.round(m.miles * bal.avgCentsPerMile) : null;
              return (
                <div key={m.cardId || m.cardName} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span className="name">{m.cardName} miles earned this period</span>
                  <span className="amount" style={{ color: 'var(--muted)' }}>
                    {m.miles.toLocaleString()} mi
                    {approxCents != null && approxCents > 0 ? ` (~${formatCents(approxCents)})` : ''}
                  </span>
                </div>
              );
            })}
            {periodCashback === 0 && periodPointsByCard.length === 0 && periodMilesByCard.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No rewards in this period (no matching rules or no card purchases).</div>
            ) : null}
                </>
              );
            })()}
          </div>
          <p className="section-title" style={{ marginTop: 16 }}>Current rewards balance</p>
          <div className="card">
            {(() => {
              let sumCashback = 0; let sumPoints = 0; let sumMiles = 0; let sumApproxCents = 0;
              visibleRewardsCards.forEach((card) => {
                const balance = cardSpendingAndRewards.cardsWithBalance?.find((b) => b.cardId === card.cardId);
                const storedCashback = balance?.currentCashbackCents ?? 0;
                const storedPoints = balance?.currentPoints ?? 0;
                const storedMiles = balance?.currentMiles ?? 0;
                const useStoredBalance = (balance?.rewardBalanceCleared ?? false) || (balance?.rewardManualOverride ?? false);
                const currentCashback = useStoredBalance ? storedCashback : card.cashbackCents;
                const currentPoints = useStoredBalance ? storedPoints : card.points;
                const currentMiles = useStoredBalance ? storedMiles : card.miles;
                sumCashback += currentCashback; sumPoints += currentPoints; sumMiles += currentMiles;
                if (balance?.avgCentsPerPoint != null && balance.avgCentsPerPoint > 0) sumApproxCents += Math.round(currentPoints * balance.avgCentsPerPoint);
                if (balance?.avgCentsPerMile != null && balance.avgCentsPerMile > 0) sumApproxCents += Math.round(currentMiles * balance.avgCentsPerMile);
              });
              const hasAny = sumCashback > 0 || sumPoints > 0 || sumMiles > 0;
              return (
                <>
                  {sumCashback > 0 ? (
                    <div className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span className="name">Current cashback balance</span>
                      <span className="amount" style={{ color: 'var(--green)' }}>{formatCents(sumCashback)}</span>
                    </div>
                  ) : null}
                  {sumPoints > 0 ? (
                    <div className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span className="name">Current points balance</span>
                      <span className="amount" style={{ color: 'var(--muted)' }}>{sumPoints.toLocaleString()} pts</span>
                    </div>
                  ) : null}
                  {sumMiles > 0 ? (
                    <div className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span className="name">Current miles balance</span>
                      <span className="amount" style={{ color: 'var(--muted)' }}>{sumMiles.toLocaleString()} mi</span>
                    </div>
                  ) : null}
                  {sumApproxCents > 0 ? (
                    <div className="row" style={{ padding: '6px 0' }}>
                      <span className="name">Approx. value (points + miles)</span>
                      <span className="amount" style={{ color: 'var(--muted)' }}>~{formatCents(sumApproxCents)}</span>
                    </div>
                  ) : null}
                  {!hasAny && sumApproxCents === 0 ? (
                    <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No current balance.</div>
                  ) : null}
                </>
              );
            })()}
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

      {view === 'category' ? (
      <>
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
      </>
      ) : null}

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
            actions.updateCardRewardTotals(editBalanceModal.cardId, { rewardCashbackCents, rewardPoints, rewardMiles, rewardManualOverride: true });
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

