/** Maps stored font family key to CSS font-family value. */
export const FONT_FAMILY_STACKS: Record<string, string> = {
  // ── Iconic / brand-associated ──────────────────────────────
  system:       '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', // SF Pro on Apple
  helveticaNeue:'"Helvetica Neue", Helvetica, Arial, sans-serif', // Apple / Swiss design
  roboto:       'Roboto, -apple-system, sans-serif',              // Google / Android
  inter:        'Inter, -apple-system, BlinkMacSystemFont, sans-serif', // Figma, Linear
  montserrat:   '"Montserrat", -apple-system, sans-serif',        // widely used
  opensans:     '"Open Sans", -apple-system, sans-serif',         // Google products
  lato:         '"Lato", -apple-system, sans-serif',              // widely used
  ibmPlexSans:  '"IBM Plex Sans", -apple-system, sans-serif',     // IBM
  // ── Premium modern (Google Fonts) ──────────────────────────
  dmsans:       '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif',
  manrope:      '"Manrope", -apple-system, sans-serif',
  outfit:       '"Outfit", -apple-system, sans-serif',
  jakarta:      '"Plus Jakarta Sans", -apple-system, sans-serif',
  spaceGrotesk: '"Space Grotesk", -apple-system, sans-serif',
  nunito:       '"Nunito", -apple-system, sans-serif',
  raleway:      '"Raleway", -apple-system, sans-serif',
  figtree:      '"Figtree", -apple-system, sans-serif',
  workSans:     '"Work Sans", -apple-system, sans-serif',
  sourceSans:   '"Source Sans 3", -apple-system, sans-serif',
  poppins:      'Poppins, -apple-system, sans-serif',
  // ── Classic sans ───────────────────────────────────────────
  helvetica:    'Helvetica, Arial, sans-serif',
  arial:        'Arial, Helvetica, sans-serif',
  verdana:      'Verdana, Geneva, sans-serif',
  calibri:      'Calibri, Arial, sans-serif',
  trebuchet:    '"Trebuchet MS", Helvetica, sans-serif',
  // ── Serif / editorial (≈30%) ───────────────────────────────
  playfair:     '"Playfair Display", Georgia, serif',
  merriweather: '"Merriweather", Georgia, serif',
  georgia:      'Georgia, "Times New Roman", serif',
  garamond:     'Garamond, "Times New Roman", serif',
  times:        '"Times New Roman", Times, Georgia, serif',
  // ── Mono ───────────────────────────────────────────────────
  courier:      '"Courier New", Courier, monospace',
};

export function getFontFamilyStack(key: string): string {
  return FONT_FAMILY_STACKS[key] ?? FONT_FAMILY_STACKS.system;
}
