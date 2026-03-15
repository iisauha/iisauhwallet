/**
 * Editable assumptions for the 457(b) optimizer.
 * Default values are 2026 assumptions; formulas in optimize457b.ts are unchanged.
 */

import { OPTIMIZER_ASSUMPTIONS_KEY } from '../../state/keys';

export type OptimizerAssumptions = {
  socialSecurityRate: number;
  medicareRate: number;
  fedStandardDeduction: number;
  povertyGuideline: number;
  pensionRate: number;
  hcfsaDeductionYearly: number;
  commuterDeductionYearly: number;
  nySdiYearly: number;
  nyFliRate: number;
  nyStateDeduction: number;
  nycDeduction: number;
  max457b: number;
  min457b: number;
  fedBrackets: number[];
  fedRates: number[];
  nyLowerBounds: number[];
  nyBaseTaxes: number[];
  nyRates: number[];
  nycBounds: number[];
  nycRates: number[];
};

/** Default 2026 assumptions (matches current optimizer constants). */
export function getDefaultOptimizerAssumptions(): OptimizerAssumptions {
  return {
    socialSecurityRate: 0.062,
    medicareRate: 0.0145,
    fedStandardDeduction: 14600,
    povertyGuideline: 15960,
    pensionRate: 0.045,
    hcfsaDeductionYearly: 1200,
    commuterDeductionYearly: 1248,
    nySdiYearly: 31.2,
    nyFliRate: 0.00432,
    nyStateDeduction: 8000,
    nycDeduction: 8000,
    max457b: 24500,
    min457b: 0.01,
    fedBrackets: [11925, 48475, 103350, 197300, 250525, 626350],
    fedRates: [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37],
    nyLowerBounds: [0, 8500, 11700, 13900, 80650, 215400, 1077550, 5000000, 25000000],
    nyBaseTaxes: [0, 340, 484, 600, 4271, 12356, 71413, 449929, 2509929],
    nyRates: [0.04, 0.045, 0.0525, 0.055, 0.06, 0.0685, 0.0965, 0.103, 0.109],
    nycBounds: [0, 12000, 25000, 50000],
    nycRates: [0.03078, 0.03762, 0.03819, 0.03876],
  };
}

function parseNumber(x: unknown, fallback: number): number {
  const n = typeof x === 'number' && Number.isFinite(x) ? x : parseFloat(String(x));
  return Number.isFinite(n) ? n : fallback;
}

function parseNumberArray(arr: unknown, fallback: number[]): number[] {
  if (!Array.isArray(arr)) return fallback;
  return arr.map((x, i) => parseNumber(x, fallback[i] ?? 0));
}

export function loadOptimizerAssumptions(): OptimizerAssumptions {
  try {
    const raw = localStorage.getItem(OPTIMIZER_ASSUMPTIONS_KEY);
    if (!raw) return getDefaultOptimizerAssumptions();
    const o = JSON.parse(raw) as Record<string, unknown>;
    const def = getDefaultOptimizerAssumptions();
    return {
      socialSecurityRate: parseNumber(o.socialSecurityRate, def.socialSecurityRate),
      medicareRate: parseNumber(o.medicareRate, def.medicareRate),
      fedStandardDeduction: parseNumber(o.fedStandardDeduction, def.fedStandardDeduction),
      povertyGuideline: parseNumber(o.povertyGuideline, def.povertyGuideline),
      pensionRate: parseNumber(o.pensionRate, def.pensionRate),
      hcfsaDeductionYearly: parseNumber(o.hcfsaDeductionYearly, def.hcfsaDeductionYearly),
      commuterDeductionYearly: parseNumber(o.commuterDeductionYearly, def.commuterDeductionYearly),
      nySdiYearly: parseNumber(o.nySdiYearly, def.nySdiYearly),
      nyFliRate: parseNumber(o.nyFliRate, def.nyFliRate),
      nyStateDeduction: parseNumber(o.nyStateDeduction, def.nyStateDeduction),
      nycDeduction: parseNumber(o.nycDeduction, def.nycDeduction),
      max457b: parseNumber(o.max457b, def.max457b),
      min457b: parseNumber(o.min457b, def.min457b),
      fedBrackets: parseNumberArray(o.fedBrackets, def.fedBrackets),
      fedRates: parseNumberArray(o.fedRates, def.fedRates),
      nyLowerBounds: parseNumberArray(o.nyLowerBounds, def.nyLowerBounds),
      nyBaseTaxes: parseNumberArray(o.nyBaseTaxes, def.nyBaseTaxes),
      nyRates: parseNumberArray(o.nyRates, def.nyRates),
      nycBounds: parseNumberArray(o.nycBounds, def.nycBounds),
      nycRates: parseNumberArray(o.nycRates, def.nycRates),
    };
  } catch {
    return getDefaultOptimizerAssumptions();
  }
}

export function saveOptimizerAssumptions(a: OptimizerAssumptions): void {
  localStorage.setItem(OPTIMIZER_ASSUMPTIONS_KEY, JSON.stringify(a));
}
