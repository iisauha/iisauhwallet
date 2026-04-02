/** Parse hex to [r, g, b] (0-255). */
function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.slice(1).match(/.{2}/g);
  if (!m || m.length !== 3) return null;
  return [parseInt(m[0], 16) || 0, parseInt(m[1], 16) || 0, parseInt(m[2], 16) || 0];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
}

/** Darken hex by blending toward black. pct in 0..1 (0 = no change, 1 = black). */
export function darkenHex(hex: string, pct: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return rgbToHex(r * (1 - pct), g * (1 - pct), b * (1 - pct));
}

/** Lighten a hex color by a factor (e.g. 1.25 = 25% lighter). Used for --accent-hover. */
export function lightenHex(hex: string, factor: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return rgbToHex(
    Math.min(255, r * factor),
    Math.min(255, g * factor),
    Math.min(255, b * factor)
  );
}

/** Lighten by blending toward white. pct in 0..1 (0 = no change, 1 = white). */
export function lightenHexBlend(hex: string, pct: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb;
  return rgbToHex(
    r + (255 - r) * pct,
    g + (255 - g) * pct,
    b + (255 - b) * pct
  );
}

const THEME_TEXT = '#f1f5f9';
const THEME_MUTED = '#94a3b8';

/** Derive theme (surface) CSS variable values from a single theme hex. Keeps text/muted fixed for readability. */
export function getThemeColorsFromHex(hex: string): {
  bg: string;
  bgSecondary: string;
  surface: string;
  surfaceHover: string;
  border: string;
  borderSubtle: string;
  text: string;
  muted: string;
  shadow: string;
  shadowStrong: string;
} {
  const surface = hex;
  const bg = darkenHex(hex, 0.42);
  const bgSecondary = darkenHex(hex, 0.25);
  const surfaceHover = lightenHexBlend(hex, 0.06);
  const border = lightenHexBlend(hex, 0.22);
  const borderSubtle = lightenHexBlend(hex, 0.12);
  return {
    bg,
    bgSecondary,
    surface,
    surfaceHover,
    border,
    borderSubtle,
    text: THEME_TEXT,
    muted: THEME_MUTED,
    shadow: '0 1px 6px rgba(0,0,0,0.18)',
    shadowStrong: '0 2px 10px rgba(0,0,0,0.22)',
  };
}

/** Derive accent and accent-hover from a single accent hex. */
export function getAccentColorsFromHex(hex: string): { accent: string; accentHover: string } {
  return {
    accent: hex,
    accentHover: lightenHex(hex, 1.3),
  };
}

/** Normalize hex to #rrggbb lowercase. */
export function normalizeHex(input: string): string | null {
  let s = input.trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 6 && /^[0-9A-Fa-f]{6}$/.test(s)) return '#' + s.toLowerCase();
  return null;
}
