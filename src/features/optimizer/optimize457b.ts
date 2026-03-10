/**
 * Standalone port of optimize_457b_standalone.py.
 * Formulas and logic are identical to the Python script; do not modify.
 */

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

// -----------------------------
// Fixed parameters from workbook
// -----------------------------
const SOCIAL_SECURITY_RATE = 0.062;
const MEDICARE_RATE = 0.0145;
const FED_STANDARD_DEDUCTION = 14600.0;
const POVERTY_GUIDELINE = 15960.0;
const PENSION_RATE = 0.045;

const HCFSA_DEDUCTION_YEARLY = 1200.0;
const COMMUTER_DEDUCTION_YEARLY = 1248.0;
const NY_SDI_YEARLY = 31.2;
const NY_FLI_RATE = 0.00432;

const MAX_457B = 24500.0;
const MIN_457B = 0.01;

const FED_BRACKETS = [11925.0, 48475.0, 103350.0, 197300.0, 250525.0, 626350.0];
const FED_RATES = [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37];

const NY_LOWER_BOUNDS = [0.0, 8500.0, 11700.0, 13900.0, 80650.0, 215400.0, 1077550.0, 5000000.0, 25000000.0];
const NY_BASE_TAXES = [0.0, 340.0, 484.0, 600.0, 4271.0, 12356.0, 71413.0, 449929.0, 2509929.0];
const NY_RATES = [0.04, 0.045, 0.0525, 0.055, 0.06, 0.0685, 0.0965, 0.103, 0.109];

const NYC_BOUNDS = [0.0, 12000.0, 25000.0, 50000.0];
const NYC_RATES = [0.03078, 0.03762, 0.03819, 0.03876];

function federal_tax_formula(agi: number): number {
  const taxable = Math.max(agi - FED_STANDARD_DEDUCTION, 0.0);
  const amounts = [
    Math.min(taxable, FED_BRACKETS[0]),
    Math.max(Math.min(taxable, FED_BRACKETS[1]) - FED_BRACKETS[0], 0.0),
    Math.max(Math.min(taxable, FED_BRACKETS[2]) - FED_BRACKETS[1], 0.0),
    Math.max(Math.min(taxable, FED_BRACKETS[3]) - FED_BRACKETS[2], 0.0),
    Math.max(Math.min(taxable, FED_BRACKETS[4]) - FED_BRACKETS[3], 0.0),
    Math.max(Math.min(taxable, FED_BRACKETS[5]) - FED_BRACKETS[4], 0.0),
    Math.max(taxable - FED_BRACKETS[5], 0.0),
  ];
  return amounts.reduce((sum, a, i) => sum + a * FED_RATES[i], 0);
}

function ny_state_tax_formula(agi: number): number {
  const taxable = Math.max(agi - 8000.0, 0.0);
  let idx = 0;
  for (let i = 0; i < NY_LOWER_BOUNDS.length; i++) {
    if (taxable >= NY_LOWER_BOUNDS[i]) {
      idx = i;
    } else {
      break;
    }
  }
  return NY_BASE_TAXES[idx] + (taxable - NY_LOWER_BOUNDS[idx]) * NY_RATES[idx];
}

function nyc_tax_formula(agi: number): number {
  const taxable = Math.max(agi - 8000.0, 0.0);
  const part1 = Math.min(taxable, NYC_BOUNDS[1]) * NYC_RATES[0];
  const part2 = Math.max(Math.min(taxable, NYC_BOUNDS[2]) - NYC_BOUNDS[1], 0.0) * NYC_RATES[1];
  const part3 = Math.max(Math.min(taxable, NYC_BOUNDS[3]) - NYC_BOUNDS[2], 0.0) * NYC_RATES[2];
  const part4 = Math.max(taxable - NYC_BOUNDS[3], 0.0) * NYC_RATES[3];
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
  contrib_457b_yearly: number
): OptimizerResult {
  const rent_yearly = rent_monthly * 12.0;
  const utilities_yearly = utilities_monthly * 12.0;
  const wifi_yearly = wifi_monthly * 12.0;
  const private_loans_yearly = private_loans_monthly * 12.0;
  const groceries_yearly = groceries_monthly * 12.0;
  const fun_money_yearly = fun_money_monthly * 12.0;
  const other_yearly = other_monthly * 12.0;

  const pension_yearly = gross_yearly * PENSION_RATE;
  const hcfsa_yearly = HCFSA_DEDUCTION_YEARLY;
  const commuter_yearly = COMMUTER_DEDUCTION_YEARLY;
  const agi_yearly = gross_yearly - pension_yearly - hcfsa_yearly - commuter_yearly - contrib_457b_yearly;
  const social_security_yearly = gross_yearly * SOCIAL_SECURITY_RATE;
  const medicare_yearly = gross_yearly * MEDICARE_RATE;
  const fica_yearly = social_security_yearly + medicare_yearly;
  const after_fica_yearly = agi_yearly - fica_yearly;
  const federal_tax_yearly = federal_tax_formula(agi_yearly);
  const ny_state_tax_yearly = ny_state_tax_formula(agi_yearly);
  const ny_sdi_yearly = NY_SDI_YEARLY;
  const ny_fli_yearly = NY_FLI_RATE * gross_yearly;
  const nyc_tax_yearly = nyc_tax_formula(agi_yearly);
  const after_federal_state_yearly = after_fica_yearly - federal_tax_yearly - ny_state_tax_yearly - nyc_tax_yearly;

  const public_loans_yearly = 0.1 * (agi_yearly - 1.5 * POVERTY_GUIDELINE);
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
  const at_min = calculate_model(
    gross_yearly,
    rent_monthly,
    utilities_monthly,
    wifi_monthly,
    private_loans_monthly,
    groceries_monthly,
    fun_money_monthly,
    other_monthly,
    MIN_457B
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
    MAX_457B
  );
  if (at_max.after_expenses_yearly >= 0) {
    return at_max;
  }

  let low = Math.round(MIN_457B * 100);
  let high = Math.round(MAX_457B * 100);
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
      trial_457b
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
