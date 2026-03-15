import type { CreditCard, RewardRule } from '../../state/models';
import { uid } from '../../state/storage';

/** Returns effective reward rules for a card (rewardRules if set, else one rule from legacy fields). */
export function getEffectiveRules(card: CreditCard): RewardRule[] {
  const rules = card.rewardRules;
  if (rules && Array.isArray(rules) && rules.length > 0) {
    return rules;
  }
  const cat = card.rewardCategory;
  if (!cat || !cat.trim()) return [];
  const sub = (card.rewardSubcategory || '').trim();
  const isCatchAll = !!card.isCatchAll;
  return [
    {
      id: uid(),
      category: cat.trim(),
      subcategory: sub || undefined,
      value: 1.5,
      unit: 'cashback_percent',
      isCatchAll,
    },
  ];
}

/** Strict match: exact category+subcategory, or category-only (rule has no sub), or catch-all. */
export function matchRule(
  rules: RewardRule[],
  category: string,
  subcategory: string
): RewardRule | null {
  const sub = (subcategory || '').trim();
  const cat = (category || '').trim();
  if (!cat) return null;

  const exact = rules.find(
    (r) => !r.isCatchAll && r.category === cat && (r.subcategory || '').trim() === sub
  );
  if (exact) return exact;

  const categoryOnly = rules.find(
    (r) => !r.isCatchAll && r.category === cat && !(r.subcategory || '').trim()
  );
  if (categoryOnly) return categoryOnly;

  const catchAll = rules.find((r) => r.isCatchAll);
  return catchAll || null;
}

/** Compute estimated reward for a purchase amount given a rule. Strict: no reward if rule value invalid. */
export function computeEstimatedReward(
  rule: RewardRule,
  amountCents: number
): { cashbackCents?: number; points?: number; miles?: number } {
  if (amountCents <= 0) return {};
  const val = rule.value;
  if (typeof val !== 'number' || Number.isNaN(val) || val < 0) return {};
  const dollars = amountCents / 100;
  switch (rule.unit) {
    case 'cashback_percent':
      return { cashbackCents: Math.round((val / 100) * amountCents) };
    case 'points_multiplier':
      return { points: Math.round(val * dollars) };
    case 'miles_multiplier':
      return { miles: Math.round(val * dollars) };
    default:
      return {};
  }
}

/** Compare two rules for "best" by value (for suggestion). Higher is better. */
function ruleScore(rule: RewardRule): number {
  switch (rule.unit) {
    case 'cashback_percent':
      return rule.value;
    case 'points_multiplier':
    case 'miles_multiplier':
      return rule.value * 10;
    default:
      return 0;
  }
}

export type SuggestResult = { card: CreditCard; rule: RewardRule | null };

/**
 * Suggestion priority: 1) Active SUB card, 2) Highest matching rule, 3) Catch-all.
 * Does not consider SUB here; caller passes activeSubCardId to force that card first.
 */
export function suggestCardForPurchase(
  category: string,
  subcategory: string,
  cards: CreditCard[],
  activeSubCardId: string | null
): SuggestResult | null {
  const list = cards || [];
  if (list.length === 0) return null;
  const sub = (subcategory || '').trim();
  const cat = (category || '').trim();

  if (activeSubCardId) {
    const subCard = list.find((c) => c.id === activeSubCardId);
    if (subCard) {
      const rules = getEffectiveRules(subCard);
      const rule = matchRule(rules, cat, sub);
      return { card: subCard, rule };
    }
  }

  let best: SuggestResult | null = null;
  let bestScore = -1;
  for (const card of list) {
    const rules = getEffectiveRules(card);
    const rule = matchRule(rules, cat, sub);
    if (!rule) continue;
    const score = ruleScore(rule);
    if (score > bestScore) {
      bestScore = score;
      best = { card, rule };
    }
  }
  return best;
}

export function getRewardRuleUnitLabel(unit: string): string {
  switch (unit) {
    case 'cashback_percent':
      return '% cashback';
    case 'points_multiplier':
      return 'x points';
    case 'miles_multiplier':
      return 'x miles';
    default:
      return unit;
  }
}
