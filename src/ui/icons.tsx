// All icons: inline SVG, 24×24, stroke="currentColor", fill="none", stroke-width="1.5"
// stroke-linecap="round", stroke-linejoin="round"

const SVG_PROPS = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// --- Tab Icons ---

export function IconHome() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5z" />
      <path d="M9 21V12h6v9" />
    </svg>
  );
}

export function IconArrowExchange() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M12 2v20" />
      <path d="M16 7C16 4 8 4 8 7C8 10 16 14 16 17C16 20 8 20 8 17" />
    </svg>
  );
}

export function IconCalendar() {
  return (
    <svg {...SVG_PROPS}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
      <rect x="8" y="14" width="4" height="4" rx="0.5" />
    </svg>
  );
}

export function IconRefreshCircle() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M1 4v6h6" />
      <path d="M23 20v-6h-6" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10" />
      <path d="M3.51 15A9 9 0 0 0 18.36 18.36L23 14" />
    </svg>
  );
}

export function IconBankBuilding() {
  return (
    <svg {...SVG_PROPS}>
      {/* Bill / note in center */}
      <rect x="7" y="9" width="10" height="6" rx="1" />
      <circle cx="12" cy="12" r="1.5" />
      {/* Top-left giving hand */}
      <path d="M2 3c2-0.5 4 0 5.5 1.5" />
      <path d="M2 3v4" />
      <path d="M2 7c2-0.5 4 0 5.5 1.5" />
      {/* Bottom-right receiving hand */}
      <path d="M22 21c-2 0.5-4 0-5.5-1.5" />
      <path d="M22 21v-4" />
      <path d="M22 17c-2 0.5-4 0-5.5-1.5" />
    </svg>
  );
}

export function IconBarChartTrend() {
  return (
    <svg {...SVG_PROPS}>
      <rect x="2" y="15" width="4" height="7" rx="0.5" />
      <rect x="9" y="10" width="4" height="12" rx="0.5" />
      <rect x="16" y="6" width="4" height="16" rx="0.5" />
    </svg>
  );
}

export function IconStar() {
  return (
    <svg {...SVG_PROPS}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

// --- Header Icons ---

export function IconBell() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function IconFlame() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M12 2C6.5 6.5 9 12 9 12c-2-1-3-2.5-3-4.5C4 11 3 14 5 17a7 7 0 0 0 14 0c0-5-3-8-4-10-1.5 2.5-2.5 4-2.5 5.5S11 15 12 15s2-1.5 1.5-3.5C13 9 12 6.5 12 2z" />
    </svg>
  );
}

export function IconGear() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// --- Action Icons ---

export function IconPlusCircle() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function IconEye() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconChevronRightCircle() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="12" cy="12" r="10" />
      <path d="m10 8 4 4-4 4" />
    </svg>
  );
}

export function IconVault() {
  return (
    <svg {...SVG_PROPS}>
      <rect x="2" y="3" width="20" height="18" rx="2" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1.5" />
      <path d="M15.5 8.5L17 7" />
    </svg>
  );
}

export function IconCreditCard() {
  return (
    <svg {...SVG_PROPS}>
      <rect x="1" y="4" width="22" height="16" rx="3" />
      <path d="M1 10h22" />
    </svg>
  );
}

export function IconClock() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

export function IconArrowUpRight() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M7 17L17 7" />
      <path d="M7 7h10v10" />
    </svg>
  );
}

export function IconArrowDownRight() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M7 7l10 10" />
      <path d="M17 7v10H7" />
    </svg>
  );
}

export function IconPlusClock() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="16" cy="15" r="6" />
      <path d="M16 11v4l2.5 1.5" />
      <path d="M5 9h6M8 6v6" />
    </svg>
  );
}

export function IconCheckCircle() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export function IconPencil() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M3 6h18" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconExport() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

export function IconPiggyBank() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M19 10c0-4.42-3.58-8-8-8S3 5.58 3 10c0 2.76 1.4 5.2 3.5 6.68V19a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-1h4v1a1 1 0 0 0 1 1h1a1 1 0 0 0 1-1v-2.32A7.98 7.98 0 0 0 19 10z" />
      <circle cx="8.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <path d="M19 10h2a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-2" />
      <path d="M12 3v2" />
    </svg>
  );
}

export function IconShieldChart() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 16v-5M12 16v-8M15 16v-3" />
    </svg>
  );
}

export function IconInfoCircle() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8h.01M12 11v5" />
    </svg>
  );
}

export function IconGiftBox() {
  return (
    <svg {...SVG_PROPS}>
      <rect x="3" y="8" width="18" height="14" rx="1" />
      <path d="M21 8H3V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2z" />
      <path d="M12 5v17" />
      <path d="M8 5c0-2 4-4 4-4s4 2 4 4" />
    </svg>
  );
}

export function IconChevronRight() {
  return (
    <svg {...SVG_PROPS}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

export function IconChevronDown() {
  return (
    <svg {...SVG_PROPS}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconPlus() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconCoin() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v2M12 15v2M9.5 9.5C9.5 8.67 10.67 8 12 8s2.5.67 2.5 1.5c0 1.5-2.5 2-2.5 3.5s2.5 2 2.5 3.5" />
    </svg>
  );
}

export function IconRefresh() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M23 4v6h-6" />
      <path d="M1 20v-6h6" />
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
      <path d="M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
    </svg>
  );
}

export function IconMagnify() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

export function IconWallet() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M21 18V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v1" />
      <path d="M23 13H17a2 2 0 0 0 0 4h6v-4z" />
    </svg>
  );
}

export function IconPalette() {
  return (
    <svg {...SVG_PROPS}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="8" cy="14" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="9" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="16" cy="14" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconLayout() {
  return (
    <svg {...SVG_PROPS}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </svg>
  );
}

export function IconShield() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export function IconTag() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M20.59 13.41L13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconUser() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function IconDatabase() {
  return (
    <svg {...SVG_PROPS}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

export function IconLock() {
  return (
    <svg {...SVG_PROPS}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
