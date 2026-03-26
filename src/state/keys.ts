// IMPORTANT: these must match legacy/index.html EXACTLY.
export const STORAGE_KEY = 'ledgerlite';
export const CASH_STORAGE_KEY = 'snapshot_cashInHandCents'; // legacy (migrated into banks)

export const LAST_OUT_BANK_KEY = 'snapshot_lastPostedOutboundBankId';
export const LAST_IN_BANK_KEY = 'snapshot_lastPostedInboundBankId';

export const BACKUP_BEFORE_COLOR_UPDATE_KEY = 'ledgerlite_backup_before_color_update';

export const SHOW_ZERO_BALANCES_KEY = 'ledgerlite_showZeroBalances'; // legacy (applied to both cash + cards)
export const SHOW_ZERO_CASH_KEY = 'ledgerlite_showZeroCashItems';
export const SHOW_ZERO_CARDS_KEY = 'ledgerlite_showZeroCreditCards';

// Investing: UI-only preference for showing $0 HYSA balances.
export const INVESTING_SHOW_ZERO_HYSA_KEY = 'iisauhwallet_investing_showZeroHysa_v1';

export const PENDING_IN_COLLAPSED_KEY = 'ledgerlite_pendingInboundCollapsed';
export const PENDING_OUT_COLLAPSED_KEY = 'ledgerlite_pendingOutboundCollapsed';

export const CATEGORY_STORAGE_KEY = 'ledgerlite_categories_v1';
export const CATEGORY_COLOR_MAP_KEY = 'categoryColorMap_v1';

export const EXPECTED_COSTS_KEY = 'expectedCosts_v1';
export const EXPECTED_INCOME_KEY = 'expectedIncome_v1';
export const UPCOMING_WINDOW_KEY = 'upcomingCashflow_window_v1';
/** Upcoming tab only: dismissed recurring keys exp:id:YYYY-MM-DD / inc:id:YYYY-MM-DD */
export const UPCOMING_DISMISSED_OCCURRENCES_KEY = 'iisauhwallet_upcoming_dismissed_occurrences_v1';
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
export const FEDERAL_REPAYMENT_CONFIG_KEY = 'iisauhwallet_federal_repayment_v1';
export const FEDERAL_LOAN_PARAMETERS_KEY = 'iisauhwallet_federal_loan_params_v1';
export const PUBLIC_LOAN_ESTIMATOR_KEY = 'iisauhwallet_public_loan_estimator_v1';
export const PUBLIC_LOAN_SUMMARY_KEY = 'iisauhwallet_public_loan_summary_v1';
export const PUBLIC_PAYMENT_NOW_ADDED_KEY = 'iisauhwallet_public_payment_now_added_v1';
export const PRIVATE_PAYMENT_NOW_BASE_KEY = 'iisauhwallet_private_payment_now_base_v1';
export const LAST_RECOMPUTE_DATE_KEY = 'iisauhwallet_last_recompute_date_v1';
export const PAYMENT_NOW_MANUAL_OVERRIDE_KEY = 'iisauhwallet_payment_now_manual_override_v1';

// Detected activity inbox (optional backend when configured).
export const DETECTED_ACTIVITY_KEY = 'iisauhwallet_detected_activity_v1';

// UI-only: theme color (hex) for surfaces, backgrounds, borders.
export const APP_THEME_COLOR_KEY = 'iisauhwallet_app_theme_color_v1';
// UI-only: accent color (hex) for buttons, tabs, highlights.
export const APP_ACCENT_COLOR_KEY = 'iisauhwallet_app_accent_color_v1';
// UI-only: font family preference (e.g. system, Inter, Georgia).
export const APP_FONT_FAMILY_KEY = 'iisauhwallet_app_font_family_v1';
// UI-only: font scale (e.g. 0.94, 1, 1.06).
export const APP_FONT_SCALE_KEY = 'iisauhwallet_app_font_scale_v1';

// UI-only: loans page Public/Private section visibility.
export const LOANS_SECTION_SHOW_PUBLIC_KEY = 'loansSectionShowPublic';
export const LOANS_SECTION_SHOW_PRIVATE_KEY = 'loansSectionShowPrivate';
// UI-only: public loans card "Hide payment actions" toggle (true = show, false = hide).
export const PUBLIC_LOAN_SHOW_PAYMENT_ACTIONS_KEY = 'iisauhwallet_public_loan_show_payment_actions_v1';

// Optimizer: editable assumptions and last result.
export const OPTIMIZER_ASSUMPTIONS_KEY = 'iisauhwallet_optimizer_assumptions_v1';
export const OPTIMIZER_LAST_RESULT_KEY = 'iisauhwallet_optimizer_last_result_v1';

// UI: main app tab order (array of tab keys).
export const TAB_ORDER_KEY = 'iisauhwallet_tab_order_v1';
// UI: tabs hidden from the tab bar (array of tab keys; Settings cannot be hidden).
export const HIDDEN_TABS_KEY = 'iisauhwallet_hidden_tabs_v1';

// Settings: user display name and profile picture (base64 data URL).
export const USER_DISPLAY_NAME_KEY = 'iisauhwallet_user_display_name_v1';
export const USER_PROFILE_IMAGE_KEY = 'iisauhwallet_user_profile_image_v1';

// Passcode gate: stored hash of 4-digit passcode (local device only).
export const PASSCODE_HASH_KEY = 'iisauhwallet_passcode_hash_v1';
// Passcode recovery: hint (plain, user-provided), recovery key hash, security Q&A hashes, setup flag, lockout.
export const PASSCODE_HINT_KEY = 'iisauhwallet_passcode_hint_v1';
export const PASSCODE_RECOVERY_KEY_HASH_KEY = 'iisauhwallet_passcode_recovery_key_hash_v1';
export const PASSCODE_SECURITY_QA_KEY = 'iisauhwallet_passcode_security_qa_v1';
export const PASSCODE_RECOVERY_SETUP_DONE_KEY = 'iisauhwallet_passcode_recovery_setup_done_v1';
export const PASSCODE_FAILED_ATTEMPTS_KEY = 'iisauhwallet_passcode_failed_attempts_v1';
export const PASSCODE_LOCKOUT_UNTIL_KEY = 'iisauhwallet_passcode_lockout_until_v1';

// First-run security onboarding: quiz must be passed before passcode can be set.
export const SECURITY_QUIZ_COMPLETED_KEY = 'iisauhwallet_security_quiz_completed_v1';
// Passcode: when true, gate is skipped (user paused protection). Local-only.
export const PASSCODE_PAUSED_KEY = 'iisauhwallet_passcode_paused_v1';
// Passcode: auto-lock after N minutes of inactivity (0 = disabled). Default 2.
export const PASSCODE_AUTO_LOCK_MINUTES_KEY = 'iisauhwallet_passcode_auto_lock_minutes_v1';
// UI: whether to show the "Welcome back" screen on app open.
export const SHOW_WELCOME_SCREEN_KEY = 'iisauhwallet_show_welcome_screen_v1';
// Passcode: when true, stored passcode is 6-digit (required for new/updated passcodes).
export const PASSCODE_6DIGIT_KEY = 'iisauhwallet_passcode_6digit_v1';

// UI-only: advanced UI surface colors (card, section, modal, dropdown, border, muted).
export const UI_ADVANCED_COLORS_KEY = 'iisauhwallet_ui_advanced_colors_v1';

// UI-only: whether to show $0 reward cards in the rewards overview.
export const SHOW_ZERO_REWARDS_KEY = 'iisauhwallet_show_zero_rewards_v1';

// Recent activity log: records significant user actions (deletions, transfers, etc.).
export const RECENT_ACTIVITY_LOG_KEY = 'iisauhwallet_recent_activity_log_v1';

// Rewards: manual category amount adjustments for by-card rewards view (cardId -> categoryKey -> { amountCents, mode }).
export const CARD_REWARD_ADJUSTMENTS_KEY = 'iisauhwallet_card_reward_adjustments_v1';
// Rewards: manual reward-only entries per card (not real purchases; rewards-view only; do not affect snapshot/net cash).
export const CARD_REWARD_ONLY_ENTRIES_KEY = 'iisauhwallet_card_reward_only_entries_v1';
// Rewards: card IDs to show in by-card view even when they have zero activity (user explicitly added).
export const REWARDS_VISIBLE_CARD_IDS_KEY = 'iisauhwallet_rewards_visible_card_ids_v1';
