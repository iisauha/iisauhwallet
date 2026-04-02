/**
 * Content filter: checks user input against banned word lists.
 *
 * Two lists (sourced from github.com/BurntRouter/filtered-word-lists):
 * - blanketBanned: caught even when embedded within other text
 * - standaloneOnly: caught only as isolated whole words
 *
 * Warning system: 3 warnings → 4th offense wipes all data.
 */

const WARNINGS_KEY = 'iisauhwallet_content_filter_warnings_v1';

// ── Blanket-banned: matched anywhere in the string (substring match) ────────
const BLANKET_BANNED: string[] = [
  'milf','nazi','orgy','porn','pussy','niggar','nigga','nigger','assfucker','assfucka',
  'b00b','b00bs','ballsack','beastial','beastiality','bestial','bestiality','blow job',
  'blowjob','blowjobs','boner','boobs','booobs','boooobs','booooobs','buttplug','c0ck',
  'c0cksucker','chink','cl1t','clit','clitoris','clits','cock-sucker','cockface','cockhead',
  'cockmunch','cockmuncher','cocks','cocksuck','cocksucked','cocksucker','cocksucking',
  'cocksucks','cocksuka','cocksukka','cokmuncher','coksucka','cummer','cumshot','cunilingus',
  'cunillingus','cunnilingus','cuntlick','cuntlicker','cuntlicking','cunts','cyalis','cyberfuc',
  'cyberfuck','cyberfucked','cyberfucker','cyberfuckers','cyberfucking','d1ck','dickhead',
  'dildo','dildos','dog-fucker','doggin','dogging','donkeyribber','doosh','douche','ejaculate',
  'ejaculated','ejaculates','ejaculating','ejaculatings','ejaculation','ejakulate','f4nny',
  'fagging','faggitt','faggot','faggs','fagot','fagots','fatass','felching','fellate','fellatio',
  'fingerfuck','fingerfucked','fingerfucker','fingerfuckers','fingerfucking','fingerfucks',
  'fistfuck','fistfucked','fistfucker','fistfuckers','fistfucking','fistfuckings','fistfucks',
  'fuckhead','fuckheads','fuckingshitmotherfucker','fuckme','fuckwhit','fuckwit','fukwit',
  'fukwhit','gangbang','gangbanged','gangbangs','gaysex','goatse','hardcoresex','horniest',
  'horny','hotsex','jack-off','jackoff','jerk-off','jism','jizm','jizz','kawk','kondum',
  'kondums','kummer','kunilingus','l3i+ch','l3itch','labia','m0f0','m0fo','m45terbate',
  'ma5terb8','ma5terbate','masochist','master-bate','masterb8','masterbat3','masterbate',
  'masterbation','masterbations','masturbate','nig','n1g','n1gga','n1gger','nigg3r','nigg4h',
  'nigga','niggah','niggas','niggaz','nigger','niggers','nutsack','orgasim','orgasims','orgasm',
  'orgasms','p0rn','penis','phonesex','penisfucker','phuck','phuk','phuked','phuking','phukked',
  'phukking','phuks','pigfucker','pissoff','porno','pornography','pornos','pusse','pussi',
  'pussies','pussy','pussys','rectum','rimjaw','sadist','schlong','scrotum','shaggin','shagging',
  'shitdick','shited','shitfuck','shithead','sluts','smegma','spunk','t1tt1e5','t1tties',
  'testical','testicle','titfuck','tittie5','tittiefucker','titties','tittyfuck','tittywank',
  'titwank','tw4t','twathead','twatty','twunt','twunter','v14gra','v1gra','vagina','viagra',
  'vulva','w00se','wanker','wanky','whore','xrated'
];

// ── Standalone-only: matched only as whole words ────────────────────────────
const STANDALONE_ONLY: string[] = [
  'nig','cum','pron','jap','xxx','cok','kkk','africoon','akata','beaner','camel jockey',
  'chink','coon','coonass','dune coon','gook','jungle bunny','niglet','nignog','porch monkey',
  'spook','towel head','turk','wetback','wigger','cock','sex','fag','kock','pecker','tit',
  'wang','wank','willy','willies','anal','slut','retard','retarded','niga','raped','rape',
  'rapist','semen','cums','fags','porn','smut','teets','tits','jiz','doosh','dick','cunt',
  'boob','scat','pube','pubes','twat','retards','rimming'
];

// Pre-compute lowercase sets for fast lookup
const blanketSet = BLANKET_BANNED.map(w => w.toLowerCase());
const standaloneSet = new Set(STANDALONE_ONLY.map(w => w.toLowerCase()));

/**
 * Check if a string contains any banned words.
 * Returns the first matched word or null if clean.
 */
export function checkForBannedContent(input: string): string | null {
  if (!input) return null;
  const lower = input.toLowerCase();

  // Check blanket-banned (substring match)
  for (const word of blanketSet) {
    if (lower.includes(word)) return word;
  }

  // Check standalone-only (whole-word match)
  // Split on non-alphanumeric to get tokens
  const tokens = lower.split(/[^a-z0-9]+/).filter(Boolean);
  for (const token of tokens) {
    if (standaloneSet.has(token)) return token;
  }

  // Also check multi-word standalone phrases
  for (const phrase of STANDALONE_ONLY) {
    const lp = phrase.toLowerCase();
    if (lp.includes(' ') && lower.includes(lp)) return lp;
  }

  return null;
}

/** Get current warning count from localStorage. */
export function getWarningCount(): number {
  try {
    return parseInt(localStorage.getItem(WARNINGS_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

/** Increment warning count and persist. Returns new count. */
export function incrementWarnings(): number {
  const next = getWarningCount() + 1;
  try { localStorage.setItem(WARNINGS_KEY, String(next)); } catch {}
  return next;
}

/** Reset warnings (e.g. after data wipe). */
export function resetWarnings(): void {
  try { localStorage.removeItem(WARNINGS_KEY); } catch {}
}

/**
 * Build the warning message for a given offense number.
 * - 1st: first warning
 * - 2nd: second warning
 * - 3rd: final warning (next offense wipes data)
 * - 4th+: should not show message — wipe happens immediately
 */
export function getWarningMessage(warningNumber: number): string {
  const base = 'We seek to maintain a higher standard than using racial slurs, sexual terms, or other offensive language. Please refrain from doing this.';
  if (warningNumber === 1) {
    return `${base}\n\nThis is your 1st warning.`;
  }
  if (warningNumber === 2) {
    return `${base}\n\nThis is your 2nd warning.`;
  }
  if (warningNumber === 3) {
    return `${base}\n\nThis is your 3rd and FINAL warning. If you do this again, all of your data will be permanently wiped.`;
  }
  return '';
}
