/**
 * Which language to translate a piece of CONTENT into.
 *
 * Deliberately not the admin panel language. That setting governs chrome:
 * button labels, section headings, the things the app itself says. Content is
 * different. A generated reply is written in the customer's language, and the
 * point of the Translate button is to render it in the other one, so keying it
 * to the UI setting produced English translated into English for an admin
 * running the panel in English, which is a button that appears to do nothing.
 *
 * The direction comes from the text: predominantly Latin goes to Russian,
 * predominantly Cyrillic goes to English. That is symmetric, needs no setting,
 * and matches what the button is for in both directions.
 */
export type ContentLang = 'ru' | 'en';

const CYRILLIC = /[Ѐ-ӿ]/g;
const LATIN = /[A-Za-z]/g;

function count(text: string, re: RegExp): number {
  return (text.match(re) || []).length;
}

/** The language `text` should be translated INTO. */
export function translationTargetFor(text: string): ContentLang {
  return count(text, LATIN) >= count(text, CYRILLIC) ? 'ru' : 'en';
}

/**
 * Whether an automatic pass should bother with this text.
 *
 * Only English content is auto-translated: Vero reads Russian, so rendering
 * her own language back at her is noise. Russian content still translates on
 * demand through the button, which uses translationTargetFor above.
 *
 * The threshold is characters rather than "contains no Cyrillic", because the
 * assistant deliberately answers in the UI language while writing the draft
 * inside it in the customer's language. Every reply-drafting turn is therefore
 * mixed, and an all-or-nothing test skipped every single one of them.
 */
export function shouldAutoTranslate(text: string, minForeignChars = 20): boolean {
  return count(text, LATIN) >= minForeignChars;
}
