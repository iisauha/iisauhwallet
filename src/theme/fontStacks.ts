/** Maps stored font family key to CSS font-family value. */
export const FONT_FAMILY_STACKS: Record<string, string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  inter: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  helvetica: 'Helvetica, Arial, sans-serif',
  calibri: 'Calibri, Arial, sans-serif',
  times: '"Times New Roman", Times, Georgia, serif',
  georgia: 'Georgia, "Times New Roman", serif',
  verdana: 'Verdana, Geneva, sans-serif',
  trebuchet: '"Trebuchet MS", Helvetica, sans-serif',
  garamond: 'Garamond, "Times New Roman", serif',
  courier: '"Courier New", Courier, monospace',
  roboto: 'Roboto, -apple-system, sans-serif',
  poppins: 'Poppins, -apple-system, sans-serif',
};

export function getFontFamilyStack(key: string): string {
  return FONT_FAMILY_STACKS[key] ?? FONT_FAMILY_STACKS.system;
}
