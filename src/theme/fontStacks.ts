/** Maps stored font family key to CSS font-family value. */
export const FONT_FAMILY_STACKS: Record<string, string> = {
  // System / classic
  system:   '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  inter:    'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  roboto:   'Roboto, -apple-system, sans-serif',
  arial:    'Arial, Helvetica, sans-serif',
  helvetica:'Helvetica, Arial, sans-serif',
  verdana:  'Verdana, Geneva, sans-serif',
  // Premium modern (Google Fonts)
  dmsans:   '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif',
  manrope:  '"Manrope", -apple-system, sans-serif',
  outfit:   '"Outfit", -apple-system, sans-serif',
  jakarta:  '"Plus Jakarta Sans", -apple-system, sans-serif',
  spaceGrotesk: '"Space Grotesk", -apple-system, sans-serif',
  nunito:   '"Nunito", -apple-system, sans-serif',
  raleway:  '"Raleway", -apple-system, sans-serif',
  poppins:  'Poppins, -apple-system, sans-serif',
  // Editorial / serif
  playfair: '"Playfair Display", Georgia, serif',
  georgia:  'Georgia, "Times New Roman", serif',
  garamond: 'Garamond, "Times New Roman", serif',
  times:    '"Times New Roman", Times, Georgia, serif',
  // Other
  calibri:  'Calibri, Arial, sans-serif',
  trebuchet:'"Trebuchet MS", Helvetica, sans-serif',
  courier:  '"Courier New", Courier, monospace',
};

export function getFontFamilyStack(key: string): string {
  return FONT_FAMILY_STACKS[key] ?? FONT_FAMILY_STACKS.system;
}
