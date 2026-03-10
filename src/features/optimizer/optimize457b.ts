/**
 * Standalone port of optimize_457b_standalone.py.
 * Formula logic is identical; constants are supplied via OptimizerAssumptions.
 */

import type { OptimizerAssumptions } from './optimizerAssumptions';
import { getDefaultOptimizerAssumptions } from './optimizerAssumptions';

export type OptimizerResult = {
  gross_yearly: number;
  pension_yearly: number;
  hcfsa_yearly: number;
  commuter_yearly: number;
  contrib_457b_yearly: number;
  agi_yearly: number;
  social_security_yearly: number;
  medicare_yearly: number;
  fica_yearly: number;
  after_fica_yearly: number;
  federal_tax_yearly: number;
  ny_state_tax_yearly: number;
  ny_sdi_yearly: number;
  ny_fli_yearly: number;
  nyc_tax_yearly: number;
  after_federal_state_yearly: number;
  rent_yearly: number;
  utilities_yearly: number;
  wifi_yearly: number;
  private_loans_yearly: number;
  public_loans_yearly: number;
  groceries_yearly: number;
  fun_money_yearly: number;
  other_yearly: number;
  after_expenses_yearly: number;
  gross_monthly: number;
  pension_monthly: number;
  hcfsa_monthly: number;
  commuter_monthly: number;
  contrib_457b_monthly: number;
  agi_monthly: number;
  social_security_monthly: number;
  medicare_monthly: number;
  fica_monthly: number;
  after_fica_monthly: number;
  federal_tax_monthly: number;
  ny_state_tax_monthly: number;
  ny_sdi_monthly: number;
  ny_fli_monthly: number;
  nyc_tax_monthly: number;
  after_federal_state_monthly: number;
  rent_monthly: number;
  utilities_monthly: number;
  wifi_monthly: number;
  private_loans_monthly: number;
  public_loans_monthly: number;
  groceries_monthly: number;
  fun_money_monthly: number;
  other_monthly: number;
  after_expenses_monthly: number;
};

function federal_tax_formula(agi: number, a: OptimizerAssumptions): number {
  const taxable = Math.max(agi - a.fedStandardDeduction, 0.0);
  const B = a.fedBrackets;
  const R = a.fedRates;
  const amounts = [
    Math.min(taxable, B[0]),
    Math.max(Math.min(taxable, B[1]) - B[0], 0.0),
    Math.max(Math.min(taxable, B[2]) - B[1], 0.0),
    Math.max(Math.min(taxable, B[3]) - B[2], 0.0),
    Math.max(Math.min(taxable, B[4]) - B[3], 0.0),
    Math.max(Math.min(taxable, B[5]) - B[4], 0.0),
    Math.max(taxable - B[5], 0.0),
  ];
  return amounts.reduce((sum, amt, i) => sum + amt * R[i], 0);
}

function ny_state_tax_formula(agi: number, a: OptimizerAssumptions): number {
  const taxable = Math.max(agi - a.nyStateDeduction, 0.0);
  const L = a.nyLowerBounds;
  const B = a.nyBaseTaxes;
  const R = a.nyRates;
  let idx = 0;
  for (let i = 0; i < L.length; i++) {
    if (taxable >= L[i]) idx = i;
    else break;
  }
  return B[idx] + (taxable - L[idx]) * R[idx];
}

function nyc_tax_formula(agi: number, a: OptimizerAssumptions): number {
  const taxable = Math.max(agi - a.nycDeduction, 0.0);
  const B = a.nycBounds;
  const R = a.nycRates;
  const part1 = Math.min(taxable, B[1]) * R[0];
  const part2 = Math.max(Math.min(taxable, B[2]) - B[1], 0.0) * R[1];
  const part3 = Math.max(Math.min(taxable, B[3]) - B[2], 0.0) * R[2];
  const part4 = Math.max(taxable - B[3], 0.0) * R[3];
  return part1 + part2 + part3 + part4;
}

function calculate_model(
  gross_yearly: number,
  rent_monthly: number,
  utilities_monthly: number,
  wifi_monthly: number,
  private_loans_monthly: number,
  groceries_monthly: number,
  fun_money_monthly: number,
  other_monthly: number,
  contrib_457b_yearly: number,
  a: OptimizerAssumptions
): OptimizerResult {
  const rent_yearly = rent_monthly * 12.0;
  const utilities_yearly = utilities_monthly * 12.0;
  const wifi_yearly = wifi_monthly * 12.0;
  const private_loans_yearly = private_loans_monthly * 12.0;
  const groceries_yearly = groceries_monthly * 12.0;
  const fun_money_yearly = fun_money_monthly * 12.0;
  const other_yearly = other_monthly * 12.0;

  const pension_yearly = gross_yearly * a.pensionRate;
  const hcfsa_yearly = a.hcfsaDeductionYearly;
  const commuter_yearly = a.commuterDeductionYearly;
  const agi_yearly = gross_yearly - pension_yearly - hcfsa_yearly - commuter_yearly - contrib_457b_yearly;
  const social_security_yearly = gross_yearly * a.socialSecurityRate;
  const medicare_yearly = gross_yearly * a.medicareRate;
  const fica_yearly = social_security_yearly + medicare_yearly;
  const after_fica_yearly = agi_yearly - fica_yearly;
  const federal_tax_yearly = federal_tax_formula(agi_yearly, a);
  const ny_state_tax_yearly = ny_state_tax_formula(agi_yearly, a);
  const ny_sdi_yearly = a.nySdiYearly;
  const ny_fli_yearly = a.nyFliRate * gross_yearly;
  const nyc_tax_yearly = nyc_tax_formula(agi_yearly, a);
  const after_federal_state_yearly = after_fica_yearly - federal_tax_yearly - ny_state_tax_yearly - nyc_tax_yearly;

  const public_loans_yearly = 0.1 * (agi_yearly - 1.5 * a.povertyGuideline);
  const after_expenses_yearly =
    after_federal_state_yearly -
    rent_yearly -
    utilities_yearly -
    wifi_yearly -
    private_loans_yearly -
    public_loans_yearly -
    groceries_yearly -
    fun_money_yearly -
    other_yearly;

  const result: Record<string, number> = {
    gross_yearly,
    pension_yearly,
    hcfsa_yearly,
    commuter_yearly,
    contrib_457b_yearly,
    agi_yearly,
    social_security_yearly,
    medicare_yearly,
    fica_yearly,
    after_fica_yearly,
    federal_tax_yearly,
    ny_state_tax_yearly,
    ny_sdi_yearly,
    ny_fli_yearly,
    nyc_tax_yearly,
    after_federal_state_yearly,
    rent_yearly,
    utilities_yearly,
    wifi_yearly,
    private_loans_yearly,
    public_loans_yearly,
    groceries_yearly,
    fun_money_yearly,
    other_yearly,
    after_expenses_yearly,
  };

  for (const key of Object.keys(result)) {
    if (key.endsWith('_yearly')) {
      result[key.replace('_yearly', '_monthly')] = result[key] / 12.0;
    }
  }

  return result as OptimizerResult;
}

/**
 * Optimize 457b contribution; same logic as Python optimize_457b().
 * Uses provided assumptions for all constants.
 */
export function optimize_457b_with_assumptions(
  gross_yearly: number,
  rent_monthly: number,
  utilities_monthly: number,
  wifi_monthly: number,
  private_loans_monthly: number,
  groceries_monthly: number,
  fun_money_monthly: number,
  other_monthly: number,
  assumptions: OptimizerAssumptions
): OptimizerResult {
  const a = assumptions;
  const at_min = calculate_model(
    gross_yearly,
    rent_monthly,
    utilities_monthly,
    wifi_monthly,
    private_loans_monthly,
    groceries_monthly,
    fun_money_monthly,
    other_monthly,
    a.min457b,
    a
  );
  if (at_min.after_expenses_yearly < 0) {
    throw new Error(
      'No feasible positive 457b contribution exists with these inputs because ' +
        'Yearly After Expenses is already below 0 even at the minimum positive 457b.'
    );
  }

  const at_max = calculate_model(
    gross_yearly,
    rent_monthly,
    utilities_monthly,
    wifi_monthly,
    private_loans_monthly,
    groceries_monthly,
    fun_money_monthly,
    other_monthly,
    a.max457b,
    a
  );
  if (at_max.after_expenses_yearly >= 0) {
    return at_max;
  }

  let low = Math.round(a.min457b * 100);
  let high = Math.round(a.max457b * 100);
  let best: OptimizerResult = at_min;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const trial_457b = mid / 100.0;
    const trial = calculate_model(
      gross_yearly,
      rent_monthly,
      utilities_monthly,
      wifi_monthly,
      private_loans_monthly,
      groceries_monthly,
      fun_money_monthly,
      other_monthly,
      trial_457b,
      a
    );
    if (trial.after_expenses_yearly >= 0) {
      best = trial;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

/**
 * Optimize 457b using default 2026 assumptions (backward compatible).
 */
export function optimize_457b(
  gross_yearly: number,
  rent_monthly: number,
  utilities_monthly: number,
  wifi_monthly: number,
  private_loans_monthly: number,
  groceries_monthly: number,
  fun_money_monthly: number,
  other_monthly: number
): OptimizerResult {
  return optimize_457b_with_assumptions(
    gross_yearly,
    rent_monthly,
    utilities_monthly,
    wifi_monthly,
    private_loans_monthly,
    groceries_monthly,
    fun_money_monthly,
    other_monthly,
    getDefaultOptimizerAssumptions()
  );
}

/**
 * Apply optional public loan monthly override to a result.
 * Does not change AGI or any tax logic; only replaces public loan and adjusts after expenses.
 */
export function applyPublicLoanOverride(
  result: OptimizerResult,
  publicLoansMonthlyOverride: number
): OptimizerResult {
  if (!Number.isFinite(publicLoansMonthlyOverride) || publicLoansMonthlyOverride < 0) return result;
  const overrideYearly = publicLoansMonthlyOverride * 12;
  const diffYearly = overrideYearly - result.public_loans_yearly;
  return {
    ...result,
    public_loans_yearly: overrideYearly,
    public_loans_monthly: publicLoansMonthlyOverride,
    after_expenses_yearly: result.after_expenses_yearly - diffYearly,
    after_expenses_monthly: result.after_expenses_monthly - diffYearly / 12,
  };
}
