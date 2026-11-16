/**
 * Does this text read like a note to the Assistant rather than a message to
 * the client?
 *
 * WHY THIS EXISTS
 * On 2026-11-16 Vero typed "Write to her that the $500 package is suitable
 * for..." into the reply box under a thread instead of into the Assistant,
 * pressed Send, and Laura Pechart received the instruction itself, signature
 * and all. Email cannot be recalled. Nothing between the box and the client
 * asked whether a message talking ABOUT the client in the third person was
 * meant FOR the client.
 *
 * Used twice: the composer asks before sending (src/components/AdminMessages.tsx),
 * and deliverReply (api/_reply-delivery.ts) refuses it unless Vero answered
 * that question, which also covers the Assistant's own send_reply and text
 * that only became English after translate-on-send.
 *
 * Deliberately narrow. It looks at how the message STARTS: an order verb
 * ("write", "tell", "напиши", "ответь") followed closely by her/him/them or
 * "a reply", which is how a note to the Assistant opens and how a message to
 * a client almost never does. "Tell me", "write me", "напишите мне" are the
 * client-facing forms and never match. Checked against every message ever
 * sent from the admin before it shipped: no false positives.
 *
 * No imports: api/ reaches this file, see reference_api_esm_extensions.
 */

/** Openers that carry no meaning, stripped before the first word is read. */
const PREAMBLE = new Set([
  'please', 'pls', 'ok', 'okay', 'so', 'now', 'and', 'then', 'can', 'could', 'would', 'you',
  'пожалуйста', 'можешь', 'можете', 'давай', 'так', 'теперь', 'и', 'а', 'ну',
]);

/** Order verbs that, followed by a third person, mean "say this to them". */
const TELL_VERBS = new Set([
  'write', 'tell', 'reply', 'respond', 'answer', 'say', 'explain', 'ask', 'let', 'text',
  'email', 'message', 'inform', 'remind', 'send', 'offer', 'thank',
  'напиши', 'напишите', 'ответь', 'ответьте', 'скажи', 'скажите', 'передай', 'передайте',
  'объясни', 'объясните', 'сообщи', 'сообщите', 'спроси', 'спросите', 'предложи',
  'предложите', 'напомни', 'напомните', 'поблагодари', 'поблагодарите',
]);

/** The client, spoken about rather than to. */
const THIRD_PERSON = new Set([
  'her', 'him', 'them', 'she', 'he', 'they', 'client', 'clients', 'couple', 'bride', 'groom',
  'customer',
  'ей', 'ему', 'им', 'ней', 'нему', 'них', 'она', 'он', 'они', 'клиенту', 'клиентке',
  'клиентам', 'невесте', 'жениху', 'паре',
]);

/** Verbs that, followed by "a reply", mean "make me a message". */
const DRAFT_VERBS = new Set([
  'write', 'draft', 'compose', 'prepare', 'make', 'create', 'come',
  'напиши', 'составь', 'подготовь', 'сделай', 'придумай',
]);

const MESSAGE_NOUNS = new Set([
  'reply', 'response', 'message', 'answer', 'email', 'draft', 'note',
  'ответ', 'сообщение', 'письмо', 'текст',
]);

/** The client-facing forms of the same verbs: "tell me", "напишите мне". */
const FIRST_PERSON = new Set(['me', 'us', 'мне', 'нам']);

const TRANSLATE = new Set(['translate', 'переведи', 'переведите']);
/** "Переведите" also means "transfer (money)", so a language must follow. */
const LANGUAGES = new Set(['english', 'russian', 'this', 'it', 'английский', 'русский', 'это']);

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

export function looksLikeAssistantInstruction(text: string): boolean {
  const all = words(text.slice(0, 200));
  let i = 0;
  while (i < all.length && PREAMBLE.has(all[i])) i += 1;
  const tokens = all.slice(i);
  if (tokens.length < 2) return false;

  const [first, second] = tokens;
  if (FIRST_PERSON.has(second)) return false;

  // "Write to her that...", "Tell him the price", "Ответь ей, что..."
  if (TELL_VERBS.has(first) && tokens.slice(1, 4).some((w) => THIRD_PERSON.has(w))) return true;
  // "Write a reply saying...", "Come up with a message", "Составь ответ"
  if (DRAFT_VERBS.has(first) && tokens.slice(1, 5).some((w) => MESSAGE_NOUNS.has(w))) return true;
  // "Translate this into English", "Переведи на английский"
  if (TRANSLATE.has(first) && tokens.slice(1, 4).some((w) => LANGUAGES.has(w))) return true;

  return false;
}
