/**
 * House style, enforced in code rather than asked of the model.
 *
 * Alex has told the assistant "never use long dashes" many times. Asking did
 * not work, and it cannot: the prompts themselves are full of em dashes, the
 * model copies what it sees, and one slip lands in a message to a customer.
 * This is the same answer the subject-line rule got (see api/_subject-strip.ts,
 * whose header says in as many words that asking the model did not hold): every
 * piece of generated text goes through here on the way out.
 *
 * Applies to drafts, to the assistant's own chat replies, and to translations.
 * The rules live in the database too (ai_context, category 'writing_rules') so
 * the model is told about them, but nothing downstream depends on it obeying.
 */

/** The category in ai_context that holds standing instructions, not facts. */
export const WRITING_RULES_CATEGORY = 'writing_rules';

/**
 * Replace em and en dashes with punctuation Alex actually uses.
 *
 *   "John and Macy — that makes it easier"  ->  "John and Macy, that makes it easier"
 *   "roughly $2,500–$4,000"                 ->  "roughly $2,500 to $4,000"
 *   "Mon–Fri", "well–known", "2026–09–17"   ->  a plain hyphen
 *   "Warmly,\n—\nVero"                      ->  "Warmly,\nVero"
 *
 * The shape of the dash decides the replacement, because one substitution
 * cannot serve all of them. A dash with no spaces around it is standing in for
 * a hyphen (a date, a phone number, "Mon-Fri", "well-known"), and turning those
 * into commas produced "Mon, Fri", which means two days rather than five. A
 * spaced dash is parenthetical and becomes a comma. A spaced dash between
 * numbers is a range and becomes "to", because a comma there reads as a list.
 */
export function stripLongDashes(text: string): string {
  if (!text) return text;
  // Nothing to do, and more importantly nothing to risk: the tidy-up rules at
  // the bottom rewrite ordinary punctuation, so text that never contained a
  // long dash must come back byte for byte.
  if (!/[—–]/.test(text)) return text;

  let out = text;

  // A dash alone on a line (a signature separator), or one left dangling at
  // the start or end of a line: drop it rather than leave a comma there.
  out = out.replace(/^[ \t]*[—–][ \t]*$\n?/gm, '');
  out = out.replace(/[ \t]*[—–][ \t]*(?=\n|$)/g, '');
  out = out.replace(/^[ \t]*[—–][ \t]*/gm, '');

  // Money ranges read better spelled out, and are the case Vero's drafts hit
  // most: "$2,500–$4,000" -> "$2,500 to $4,000".
  out = out.replace(/(\$\s?\d[\d.,]*)\s*[—–]\s*(\$\s?\d)/g, '$1 to $2');

  // Spaced numeric ranges, including "3pm — 5pm" and "10 — 12".
  out = out.replace(
    /(\d[\d.,]*\s*(?:[a-z]{1,4})?)[ \t]+[—–][ \t]+(\$?\d)/gi,
    (_m, a: string, b: string) => `${a.trimEnd()} to ${b}`,
  );

  // An EN dash closed up is a range or a compound, and wants a hyphen: dates,
  // phone numbers, "Mon–Fri", "well–known", "10–12". An EM dash closed up is
  // parenthetical ("brief—thoughtful") and falls through to the comma below,
  // which is the typographic convention and the only way to tell the two apart
  // without understanding the sentence.
  out = out.replace(/([\p{L}\p{N}])–([\p{L}\p{N}])/gu, '$1-$2');
  // Digits either side means a range or a written-out number whatever the dash.
  out = out.replace(/(\d)—(\d)/g, '$1-$2');

  // Everything left is parenthetical or appositive: a comma.
  out = out.replace(/\s*[—–]\s*/g, ', ');

  // Tidy only what the substitutions above can leave behind. Deliberately
  // [ \t] and not \s: \s spans newlines, and an earlier version joined a list
  // item to the line below it in text that had no dash in it at all.
  out = out.replace(/,[ \t]*,+/g, ',');
  out = out.replace(/[ \t]+,/g, ',');
  out = out.replace(/,[ \t]*([.!?;:])/g, '$1');

  return out;
}

/** Every rule this module enforces. One call site for generated text. */
export function applyHouseStyle(text: string): string {
  return stripLongDashes(text);
}

/**
 * Words that mean the instruction is about HOW something is written, which is
 * the only kind of instruction worth storing forever.
 *
 * Without this the trigger below fired on ordinary panel traffic: "Don't send
 * that yet", "Stop, wrong conversation", "reply to Anna and don't mention
 * pricing". Those were being written verbatim into ai_context, which is loaded
 * whole into the prompt that answers every customer, so one customer's name and
 * one afternoon's instruction would have been read as a standing order for the
 * life of the install.
 */
const WRITING_TOPIC =
  /\b(writ|wrote|word|phras|say|said|saying|tone|sound|style|format|punctuat|dash|comma|capital|emoji|greet|sign[- ]?off|signature|length|short|long|brief|concise|formal|casual|mention|language|translat|address|call (?:her|him|them|people))/i;
const WRITING_TOPIC_RU =
  /(пиш|писа|слов|фраз|говор|сказ|тон|стил|формат|пунктуац|тире|запят|эмодзи|привет|подпис|длин|коротк|кратк|формальн|обращ|язык|перевод|упомин)/i;

/**
 * Does this message read as a standing instruction about how to write?
 *
 * Used as a backstop so a rule is recorded even when the model does not call
 * the save tool, which is what kept happening: the refine prompt tells it to
 * rewrite the draft and stop, so the teaching turn ended with nothing written.
 *
 * Deliberately narrow on both axes. It needs an imperative ("never", "always",
 * "stop") or an explicit memory verb ("remember this"), AND a subject that is
 * about wording. Whatever it catches is announced in the chat and is editable
 * in the Context tab, so a false positive costs one line and one click. A false
 * negative costs Vero the same correction tomorrow, which is the failure she
 * actually reported, so the balance leans slightly toward catching.
 */
export function looksLikeStandingRule(message: string): boolean {
  const m = message.trim();
  if (m.length < 6 || m.length > 500) return false;

  const aboutWriting = WRITING_TOPIC.test(m) || WRITING_TOPIC_RU.test(m);

  // "remember this", "write that down", "save that", "запомни", "запиши".
  const explicitMemory =
    /\b(remember (this|that)|write (that|this) down|save (that|this)|note (that|this) down|add (that|this) to (your|the) (database|knowledge|rules))\b/i.test(
      m,
    ) || /(запомни|запиши (это|себе)|сохрани (это|правило)|заруби себе)/i.test(m);
  if (explicitMemory) return true;

  if (!aboutWriting) return false;

  // "never X", "always X", "stop saying X", "don't X", "from now on X".
  const imperative =
    /(^|[.!?\n]\s*|\b(?:and|but|also|please|seriously)\s+)(never|always|stop|don'?t|do not|no more|from now on|no longer|quit)\b/i.test(
      m,
    ) ||
    /(никогда|всегда|перестань|прекрати|хватит|больше не|отныне|не пиши|не говори|не используй)/i.test(
      m,
    );
  return imperative;
}

/**
 * A stable key for a rule, so restating it updates one row instead of adding
 * another. Labels used to be the model's free text, which is how "No long
 * dashes", "Avoid em dashes" and "Punctuation preference" became three rows
 * saying one thing (migration 029 had to delete twelve of those).
 *
 * Unicode-aware, because the chat defaults to Russian. An ASCII-only version
 * returned an empty string for every Cyrillic rule, which silently turned the
 * whole backstop off for the person it was built for.
 */
export function ruleKey(content: string): string {
  const words = content
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .sort();
  return Array.from(new Set(words)).slice(0, 8).join('-');
}

const STOPWORDS = new Set([
  'the', 'and', 'you', 'your', 'our', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'not',
  'but', 'all', 'any', 'can', 'use', 'using', 'used', 'please', 'when', 'what', 'they', 'them',
  'its', 'it\'s', 'has', 'have', 'had', 'will', 'would', 'should', 'could', 'just', 'like',
  // Russian equivalents, so a restated rule collides the same way it does in English.
  'это', 'что', 'как', 'для', 'при', 'так', 'уже', 'его', 'наш', 'она', 'они', 'том', 'этот',
  'пожалуйста', 'надо', 'нужно', 'быть', 'буду', 'будет',
]);
