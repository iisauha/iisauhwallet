import type { CreditCard, RewardRule } from '../../state/models';
import { uid } from '../../state/storage';

/** Returns effective reward rules for a card (rewardRules if set, else one rule from legacy fields). Used for recommendation only. */
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

/** Check if a rule matches the given category/subcategory (supports multi-category rules). */
function ruleMatchesCatSub(r: RewardRule, cat: string, sub: string): boolean {
  if (r.isCatchAll) return false;
  // Multi-category path (new format)
  if (r.categories && r.categories.length > 0) {
    return r.categories.some(
      (p) => p.category === cat && (sub === '' || (p.subcategory || '').trim() === sub || !(p.subcategory || '').trim())
    );
  }
  // Legacy single-category path
  return r.category === cat;
}

/** Check if a rule matches category+subcategory exactly (exact sub match). */
function ruleMatchesExact(r: RewardRule, cat: string, sub: string): boolean {
  if (r.isCatchAll) return false;
  if (r.categories && r.categories.length > 0) {
    return r.categories.some(
      (p) => p.category === cat && (p.subcategory || '').trim() === sub
    );
  }
  return r.category === cat && (r.subcategory || '').trim() === sub;
}

/** Check if a rule matches the whole category (no subcategory restriction). */
function ruleMatchesCategoryOnly(r: RewardRule, cat: string): boolean {
  if (r.isCatchAll) return false;
  if (r.categories && r.categories.length > 0) {
    return r.categories.some((p) => p.category === cat && !(p.subcategory || '').trim());
  }
  return r.category === cat && !(r.subcategory || '').trim();
}

/** Match rule by category/subcategory or catch-all. Used for recommendation only. */
export function matchRule(
  rules: RewardRule[],
  category: string,
  subcategory: string
): RewardRule | null {
  const sub = (subcategory || '').trim();
  const cat = (category || '').trim();
  if (!cat) {
    return rules.find((r) => r.isCatchAll) || null;
  }

  const exact = rules.find((r) => ruleMatchesExact(r, cat, sub));
  if (exact) return exact;

  const categoryOnly = rules.find((r) => ruleMatchesCategoryOnly(r, cat));
  if (categoryOnly) return categoryOnly;

  return rules.find((r) => r.isCatchAll) || null;
}

/** Percentage value for comparing rules (recommendation priority). Higher = better. */
function rulePercentScore(rule: RewardRule): number {
  switch (rule.unit) {
    case 'cashback_percent':
      return rule.value;
    case 'points_multiplier':
    case 'miles_multiplier':
      return rule.value;
    default:
      return 0;
  }
}

export type SuggestResult = { card: CreditCard; rule: RewardRule | null };

/**
 * Returns all card suggestions in priority order: 1) Active SUB card, 2) Category matches (highest % first),
 * 3) Catch-all matches (highest % first). Caller shows one at a time; on decline, show next.
 */
export function suggestAllCardsForPurchase(
  category: string,
  subcategory: string,
  cards: CreditCard[],
  activeSubCardId: string | null
): SuggestResult[] {
  const list = cards || [];
  if (list.length === 0) return [];
  const sub = (subcategory || '').trim();
  const cat = (category || '').trim();
  const result: SuggestResult[] = [];
  const seenCardIds = new Set<string>();

  if (activeSubCardId) {
    const subCard = list.find((c) => c.id === activeSubCardId);
    if (subCard) {
      const rules = getEffectiveRules(subCard);
      const rule = matchRule(rules, cat, sub);
      result.push({ card: subCard, rule });
      seenCardIds.add(subCard.id);
    }
  }

  const categoryMatches: SuggestResult[] = [];
  const catchAllMatches: SuggestResult[] = [];
  for (const card of list) {
    if (seenCardIds.has(card.id)) continue;
    const rules = getEffectiveRules(card);
    const rule = matchRule(rules, cat, sub);
    if (!rule) continue;
    const score = rulePercentScore(rule);
    if (rule.isCatchAll) {
      catchAllMatches.push({ card, rule });
    } else {
      categoryMatches.push({ card, rule });
    }
  }
  categoryMatches.sort((a, b) => rulePercentScore(b.rule!) - rulePercentScore(a.rule!));
  catchAllMatches.sort((a, b) => rulePercentScore(b.rule!) - rulePercentScore(a.rule!));

  for (const s of categoryMatches) {
    if (!seenCardIds.has(s.card.id)) {
      result.push(s);
      seenCardIds.add(s.card.id);
    }
  }
  for (const s of catchAllMatches) {
    if (!seenCardIds.has(s.card.id)) {
      result.push(s);
      seenCardIds.add(s.card.id);
    }
  }
  return result;
}

/** First suggestion only (for backward compat). Prefer suggestAllCardsForPurchase for decline/next flow. */
export function suggestCardForPurchase(
  category: string,
  subcategory: string,
  cards: CreditCard[],
  activeSubCardId: string | null
): SuggestResult | null {
  const all = suggestAllCardsForPurchase(category, subcategory, cards, activeSubCardId);
  return all.length > 0 ? all[0] : null;
}

export function getRewardRuleUnitLabel(unit: string): string {
  switch (unit) {
    case 'cashback_percent':
      return '%';
    case 'points_multiplier':
      return '× pts';
    case 'miles_multiplier':
      return '× mi';
    default:
      return unit;
  }
}

export type RewardDelta =
  | { rewardType: 'cashback'; deltaCashbackCents: number }
  | { rewardType: 'points'; deltaPoints: number }
  | { rewardType: 'miles'; deltaMiles: number };

export function computeRewardDeltaForPurchase(params: {
  card: CreditCard;
  amountCents: number;
  category: string;
  subcategory?: string;
}): RewardDelta | null {
  const { card, amountCents, category, subcategory } = params;
  if (!card) return null;
  const cents = typeof amountCents === 'number' ? amountCents : 0;
  if (!(cents > 0)) return null;

  const rules = getEffectiveRules(card);
  const rule = matchRule(rules, category, subcategory || '');
  if (!rule) return null;

  switch (rule.unit) {
    case 'cashback_percent': {
      const delta = Math.round(cents * (rule.value / 100));
      return delta > 0 ? { rewardType: 'cashback', deltaCashbackCents: delta } : null;
    }
    case 'points_multiplier': {
      const dollars = cents / 100;
      const delta = Math.round(dollars * rule.value);
      return delta > 0 ? { rewardType: 'points', deltaPoints: delta } : null;
    }
    case 'miles_multiplier': {
      const dollars = cents / 100;
      const delta = Math.round(dollars * rule.value);
      return delta > 0 ? { rewardType: 'miles', deltaMiles: delta } : null;
    }
    default:
      return null;
  }
}
