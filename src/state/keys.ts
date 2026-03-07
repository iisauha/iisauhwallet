// IMPORTANT: these must match legacy/index.html EXACTLY.
export const STORAGE_KEY = 'ledgerlite';
export const CASH_STORAGE_KEY = 'snapshot_cashInHandCents'; // legacy (migrated into banks)

export const LAST_OUT_BANK_KEY = 'snapshot_lastPostedOutboundBankId';
export const LAST_IN_BANK_KEY = 'snapshot_lastPostedInboundBankId';

export const BACKUP_BEFORE_COLOR_UPDATE_KEY = 'ledgerlite_backup_before_color_update';

export const SHOW_ZERO_BALANCES_KEY = 'ledgerlite_showZeroBalances'; // legacy (applied to both cash + cards)
export const SHOW_ZERO_CASH_KEY = 'ledgerlite_showZeroCashItems';
export const SHOW_ZERO_CARDS_KEY = 'ledgerlite_showZeroCreditCards';

export const PENDING_IN_COLLAPSED_KEY = 'ledgerlite_pendingInboundCollapsed';
export const PENDING_OUT_COLLAPSED_KEY = 'ledgerlite_pendingOutboundCollapsed';

export const CATEGORY_STORAGE_KEY = 'ledgerlite_categories_v1';
export const CATEGORY_COLOR_MAP_KEY = 'categoryColorMap_v1';

export const EXPECTED_COSTS_KEY = 'expectedCosts_v1';
export const EXPECTED_INCOME_KEY = 'expectedIncome_v1';
export const UPCOMING_WINDOW_KEY = 'upcomingCashflow_window_v1';
export const LAST_ADJUSTMENTS_KEY = 'ledgerlite_lastAdjustments';
export const INVESTING_KEY = 'ledgerlite_investing_v1';
export const COASTFIRE_KEY = 'ledgerlite_coastfire_v1';

export const PHYSICAL_CASH_ID = 'physical_cash';

export const UI_DROPDOWN_STATE_KEY = 'ledgerlite_ui_dropdown_state_v1';

// New features (do not replace any legacy keys).
export const SUB_TRACKER_KEY = 'ledgerlite_subTracker_v1';

// Loans + profile-related keys.
export const LOANS_KEY = 'iisauhwallet_loans_v1';
export const BIRTHDATE_KEY = 'iisauhwallet_birthdate_v1';

// Detected activity inbox (optional backend when configured).
export const DETECTED_ACTIVITY_KEY = 'iisauhwallet_detected_activity_v1';
