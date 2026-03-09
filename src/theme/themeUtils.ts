/** Lighten a hex color by a factor (e.g. 1.25 = 25% lighter). Used for --accent-hover from custom accent. */
export function lightenHex(hex: string, factor: number): string {
  const m = hex.slice(1).match(/.{2}/g);
  if (!m || m.length !== 3) return hex;
  const r = Math.min(255, Math.round(parseInt(m[0], 16) * factor));
  const g = Math.min(255, Math.round(parseInt(m[1], 16) * factor));
  const b = Math.min(255, Math.round(parseInt(m[2], 16) * factor));
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
