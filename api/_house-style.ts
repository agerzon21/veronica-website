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
 *
 * It also holds the pure, database-free guards the assistant chat needs but
 * must not be allowed to talk itself past: looksLikeSendApproval below is the
 * one that decides whether a real email leaves for a real customer. They live
 * HERE rather than in a new module on purpose. api/admin/_assistant-chat.ts
 * already imports this file, so nothing new enters the api/ import graph, and
 * an extensionless relative import anywhere in that graph takes down every
 * admin endpoint with FUNCTION_INVOCATION_FAILED while the build and the
 * typecheck both pass (see scripts/check-api-imports.mjs).
 */

/** The category in ai_context that holds standing instructions, not facts. */
export const WRITING_RULES_CATEGORY = 'writing_rules';

// ────────────────────────────────────────────────────────────────────────────
// TWO OPEN OWNER DECISIONS. Each is one constant. Flipping it is one line.
// ────────────────────────────────────────────────────────────────────────────

/**
 * OWNER DECISION 1: may a single message both ask for a draft and approve
 * sending it? "draft a reply to Sarah and send it" is one message that
 * contains a compose verb and a send verb.
 *
 * TRUE (current): the send is allowed. She asked for it in the sentence, and
 * refusing would mean telling her no to something she plainly said yes to.
 * The cost is that the mail goes out without her having read it first.
 *
 * FALSE: a message carrying a compose verb never approves a send, so she
 * always sees the text before it leaves. She would have to type a second
 * message ("send it") every time.
 *
 * Covered by scratchpad/test-send-approval.mjs, which asserts both branches.
 */
export const ALLOW_DRAFT_AND_SEND_IN_ONE_MESSAGE = true;

/**
 * OWNER DECISION 2: how hard should the gate try to read an unusual approval?
 *
 * FALSE (current): only the plain approvals are accepted. "fire away",
 * "погнали", "ну ладно давай уже" and a lone thumbs up are REFUSED, and she
 * has to type "send it" or "отправь". That is a false refusal, it costs one
 * retyped message, and it is the direction we want to be wrong in: refusing a
 * real approval is an annoyance, sending on a misread one mails a customer.
 *
 * TRUE: the looser phrasings below also count, and still only when the
 * assistant's previous message actually offered to send.
 *
 * The right way to widen this is from the refusal log, not from guesses. Every
 * refusal is logged by api/admin/_assistant-chat.ts with the message text, so
 * after a week of real use the list can be extended from what Vero actually
 * typed.
 */
export const ACCEPT_LOOSE_AFFIRMATIVES = true;
// Set TRUE by Alex, 2026-09-18: "if it analyses MY INTENT to be to send the
// message it's fine". Safe to widen here and nowhere else, because this branch
// is reached ONLY when assistantOfferedToSend() says the previous turn put
// sending on the table. It therefore cannot re-open the failure this gate was
// built for: "stop messing with the signature" is an edit request, it never
// reaches the loose branch, and NO_SEND refuses it regardless.

/**
 * BONUS, and NOT one of the two decisions above: see ruleKey at the bottom of
 * this file. Left FALSE so this change set cannot alter a single stored label.
 */
export const RULE_KEY_MEANING_ORDER = false;

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

// ────────────────────────────────────────────────────────────────────────────
// The send gate.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Unicode word boundaries, built by hand.
 *
 * READ THIS BEFORE EDITING ANY REGEX BELOW. \b is defined over [A-Za-z0-9_].
 * Against Cyrillic it does not error, it does not warn, it simply never sits
 * where you think it does, so an ASCII-only pattern turns into a rule that is
 * quietly off for exactly one language. This project has shipped that bug
 * already: ruleKey's first version stripped non-ASCII and returned an empty
 * key for every Russian rule, which switched the whole learning backstop off
 * for the person it was written for, silently, for weeks.
 *
 * This chat defaults to Russian (api/admin/_assistant-chat.ts sets 'ru' when
 * the client sends nothing) and Vero is the primary user. If anyone
 * "simplifies" these to \b, every Russian approval fails, she can never send
 * anything, and there is no error message that would explain why.
 */
const WORD_CHAR = '\\p{L}\\p{N}';
const NOT_BEFORE = `(?<![${WORD_CHAR}])`;
const NOT_AFTER = `(?![${WORD_CHAR}])`;

/**
 * "Send this." Nothing else.
 *
 * English words are bounded on both sides so "sent" (past tense: "it has been
 * 24 hours since I sent them the portal signup") and "sending" do not read as
 * an instruction to send now. The Russian entries are bounded on the left only
 * because they are stems, not words: отправь, отправьте, отправляй, отправить
 * are all one instruction with four endings.
 */
const SEND_VERB = new RegExp(
  `${NOT_BEFORE}(send|resend|ship)${NOT_AFTER}` + `|${NOT_BEFORE}(отправ|отошли|скинь)`,
  'iu',
);

/**
 * Words that mean this message is NOT an approval, even though it may contain
 * a send verb: a refusal, a delay, a condition, a question, or an edit she
 * wants made first. Checked BEFORE anything can approve, because the whole
 * point of this gate is that "send it after you fix the greeting" is not
 * permission to send anything yet.
 *
 * Deliberately broad, and every entry here can only ever cause a REFUSAL. An
 * over-broad list costs Vero a retyped message. An under-broad one costs a
 * customer an email she never approved. That trade is not close.
 *
 * "draft" is deliberately absent: compose verbs are handled separately, under
 * ALLOW_DRAFT_AND_SEND_IN_ONE_MESSAGE.
 */
const NO_SEND = new RegExp(
  NOT_BEFORE +
    "(don'?t|dont|do not|never|no|nope|not|hold|wait|hold off|stop|pause|cancel|before|first|after|once|until|unless|if|why|what|who|when|where|how|whether|instead|rather|change|edit|fix|rewrite|revise|redo|shorter|longer|remove|delete|add|but|except|almost|nearly|maybe|later)" +
    NOT_AFTER +
    '|' +
    NOT_BEFORE +
    '(не|нет|пока|подожди|погоди|стоп|стой|сначала|снaчала|измен|исправ|перепиш|переде|убер|добав|почему|зачем|если|когда|как|что|кто|позже|потом)',
  'iu',
);

/**
 * A bare yes. These approve ONLY when the assistant's own previous message
 * asked whether to send, because "да" is the most common word in this chat and
 * answers a hundred other questions. See assistantOfferedToSend.
 */
const BARE_AFFIRMATIVES = new Set([
  'yes', 'yep', 'yeah', 'yup', 'ok', 'okay', 'k', 'sure', 'go', 'go ahead', 'do it',
  'go for it', 'perfect', 'great', 'confirmed', 'confirm', 'approved', 'looks good',
  'sounds good', 'lgtm',
  'да', 'ага', 'угу', 'ок', 'окей', 'хорошо', 'давай', 'го', 'можно', 'сделай',
  'подтверждаю', 'отлично', 'супер',
]);

/**
 * Only consulted when ACCEPT_LOOSE_AFFIRMATIVES is true. Same offer
 * requirement as the plain ones: this list widens what counts as a yes, it
 * never removes the need for the assistant to have asked.
 */
const LOOSE_AFFIRMATIVES = new Set([
  'fire away', 'shoot', 'hit it', 'send away', 'by all means', 'please do', 'do',
  'погнали', 'валяй', 'вперед', 'вперёд', 'ладно', 'ну ладно', 'ну давай',
  'давай уже', 'ну ладно давай уже', 'пошли', 'жми',
  '👍', '👌', '🚀', '✅', '+',
]);

/** Compose verbs, used only when ALLOW_DRAFT_AND_SEND_IN_ONE_MESSAGE is false. */
const COMPOSE_VERB = new RegExp(
  `${NOT_BEFORE}(draft|write|compose|rewrite|prepare|make)${NOT_AFTER}` +
    `|${NOT_BEFORE}(напиш|составь|набросай|сочини|подготов)`,
  'iu',
);

/** A question that asks whether to send, as opposed to prose containing "send". */
const SEND_OFFER = new RegExp(
  `${NOT_BEFORE}(send|sending)${NOT_AFTER}|${NOT_BEFORE}(отправ)`,
  'iu',
);

/**
 * Blank out text the user is QUOTING rather than saying.
 *
 * Without this, pasting a draft back with a note ("here is what I want: 'I
 * will send the gallery link tomorrow'") reads as an instruction to send,
 * because the send verb is right there in the message. It is in the draft, not
 * in the request.
 */
function withoutQuotedText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/^\s*>.*$/gmu, ' ')
    .replace(/"[^"]*"/gu, ' ')
    .replace(/“[^”]*”/gu, ' ')
    .replace(/«[^»]*»/gu, ' ');
}

/**
 * Did the assistant's previous message actually ask whether to send?
 *
 * Only the question clauses count. A draft the assistant wrote almost always
 * contains the word "send" ("I will send the gallery link over") and almost
 * always ends with a question of some kind, so testing the whole message would
 * make every "yes" an approval, which is the hole this is here to close.
 */
function assistantOfferedToSend(lastAssistantText: string): boolean {
  if (!lastAssistantText) return false;
  const clean = withoutQuotedText(lastAssistantText);
  return clean
    .split(/(?<=\?)/u)
    .filter((chunk) => /\?\s*$/u.test(chunk))
    .map((chunk) => chunk.split(/[.!\n]/u).pop() ?? '')
    .some((clause) => SEND_OFFER.test(clause));
}

/**
 * An approval is a short sentence. Anything longer is a briefing, a pasted
 * draft or an argument, and none of those are permission to mail a customer.
 * The message that actually triggered the unauthorised send was 100 characters
 * of complaint about the signature; the one before it was over 300 characters
 * of context about a portal invite.
 */
const MAX_APPROVAL_LENGTH = 120;

/** The verdict, plus a short machine readable reason for the log. */
export interface SendApproval {
  ok: boolean;
  why: string;
}

/**
 * Did Vero, in her own words, in THIS turn, say send it?
 *
 * This is a HARD GATE on a destructive action, enforced in code, because the
 * prompt did not hold and could not. On 2026-09-18 the model read "stop
 * messing with the signature, we dont need to include our email" as approval
 * and mailed a paying customer. The prompt said, in three separate places, to
 * send only after explicit approval. The only thing the code checked was a
 * boolean the model itself filled in, which asks the model to restate the
 * judgement it had already got wrong. A check the acting party performs on
 * itself is not a check.
 *
 * This file already contains the precedent twice over: the dash rule and the
 * subject-line rule were both prompt-only, both failed, and both now live in
 * code. api/admin/_assistant-chat.ts holds a third, languageMismatch, which
 * re-derives the customer's language from the database and can contradict the
 * model outright. Approval is the higher-stakes version of the same bug and
 * was the last one still left to the model's word.
 *
 * Deliberately refuses when unsure. Every branch that returns ok:false costs
 * one retyped message. The branch that wrongly returns ok:true costs a
 * customer relationship.
 *
 * @param userMessage      Vero's message for THIS turn, verbatim.
 * @param lastAssistantText The assistant's previous text turn, so a bare "yes"
 *                          can be checked against what was actually asked.
 */
export function looksLikeSendApproval(
  userMessage: string,
  lastAssistantText = '',
): SendApproval {
  const raw = (userMessage ?? '').trim();
  if (!raw) return { ok: false, why: 'empty-message' };

  // Lowercase, and shave punctuation and emoji off both ends so "Yes!" and
  // "да," and "ok 👍" land on the same key as "yes".
  const normalized = raw
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .replace(/[^\p{L}\p{N}]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();

  // A question is not an instruction, however many send verbs it contains.
  // "did you send it already?" and "should I send this one first?" are Vero
  // trying to find out what happened, and enumerating every auxiliary verb
  // that can open a question, in two languages, is a losing game next to
  // reading the punctuation she actually typed.
  if (/\?\s*$/u.test(raw)) return { ok: false, why: 'question-not-approval' };

  // Anything that reads as "not yet", "not like that" or "why did you" is out
  // before any of the accepting branches get a look in.
  if (NO_SEND.test(raw)) return { ok: false, why: 'negation-or-edit-request' };

  const loose = ACCEPT_LOOSE_AFFIRMATIVES && (LOOSE_AFFIRMATIVES.has(normalized) || LOOSE_AFFIRMATIVES.has(raw));
  if (BARE_AFFIRMATIVES.has(normalized) || loose) {
    return assistantOfferedToSend(lastAssistantText)
      ? { ok: true, why: 'affirmative-after-send-offer' }
      : { ok: false, why: 'bare-affirmative-without-send-offer' };
  }

  if (raw.length > MAX_APPROVAL_LENGTH) {
    return { ok: false, why: 'too-long-to-be-an-approval' };
  }

  if (!SEND_VERB.test(withoutQuotedText(raw))) {
    return { ok: false, why: 'no-send-verb' };
  }

  if (!ALLOW_DRAFT_AND_SEND_IN_ONE_MESSAGE && COMPOSE_VERB.test(raw)) {
    return { ok: false, why: 'draft-and-send-in-one-message' };
  }

  return { ok: true, why: 'explicit-send-verb' };
}

/**
 * Does this text name someone currently in the inbox?
 *
 * Used twice: to stop the learning backstop storing "reply to Anna and keep it
 * short" as a standing rule, and to stop the model labelling a knowledge row
 * with a customer's name. ai_context is loaded WHOLE into the prompt that
 * answers every customer, so one name in there is one name in front of
 * everyone else.
 *
 * It was a raw `lower.includes(name)` with only a length > 2 filter, which is
 * a substring match over every contact name in the database. A client called
 * Sue vetoed any rule containing "issue"; Ann vetoed "planning"; Ash vetoed
 * "cash". The veto is silent, so a rule could be dropped on the floor with no
 * chat line and no log, which makes it a candidate explanation for a rule Alex
 * believed he had saved and could not find afterwards.
 *
 * Matches the WHOLE contact name, bounded. Matching each word of it separately
 * would look tighter and is a trap: a contact called "Will Parker" or "Grace
 * Kim" would then veto any rule containing "will" or "grace", which is most of
 * them.
 */
export function findCustomerNameIn(text: string, contactNames: string[]): string | null {
  const haystack = (text ?? '').toLowerCase();
  if (!haystack) return null;
  for (const candidate of contactNames ?? []) {
    const name = (candidate ?? '').trim().toLowerCase();
    // Two characters or fewer is an initial, not a name, and would match
    // everywhere.
    if (name.length <= 2) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`${NOT_BEFORE}${escaped}${NOT_AFTER}`, 'u').test(haystack)) return name;
  }
  return null;
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
 *
 * KNOWN DEFECT, left in place on purpose, behind RULE_KEY_MEANING_ORDER.
 * The current order is sort, then slice: the key is built from whichever eight
 * words sort first alphabetically, not from the eight that carry the meaning.
 * Alex's "never send an email until you literally have me say so" keys as
 * "add-adjustment-anyways-asked-did-email-fine-forwards", containing neither
 * "never" nor "send" nor "permission", so a restatement of the same rule will
 * not collide with it and both rows survive to dilute each other. That is the
 * exact failure migration 034 was written to end.
 *
 * Flipping the constant to true dedupes in reading order, slices, THEN sorts,
 * which is the correct algorithm. It is off because it changes the key of
 * every rule written from then on: existing rows keyed the old way stop
 * matching their own restatements, so each one duplicates once. That is a
 * small, prunable cost, but it is the owner's to accept, and it wants a
 * migration that relabels category='writing_rules' in the same deploy.
 */
export function ruleKey(content: string): string {
  const words = content
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  if (RULE_KEY_MEANING_ORDER) {
    return Array.from(new Set(words)).slice(0, 8).sort().join('-');
  }
  return Array.from(new Set(words.sort())).slice(0, 8).join('-');
}

const STOPWORDS = new Set([
  'the', 'and', 'you', 'your', 'our', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'not',
  'but', 'all', 'any', 'can', 'use', 'using', 'used', 'please', 'when', 'what', 'they', 'them',
  'its', 'it\'s', 'has', 'have', 'had', 'will', 'would', 'should', 'could', 'just', 'like',
  // Russian equivalents, so a restated rule collides the same way it does in English.
  'это', 'что', 'как', 'для', 'при', 'так', 'уже', 'его', 'наш', 'она', 'они', 'том', 'этот',
  'пожалуйста', 'надо', 'нужно', 'быть', 'буду', 'будет',
]);
