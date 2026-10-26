/**
 * Checks that make a drafted email read like a person wrote it, in code
 * (2026-10-26). The prompt asked for this already, and on 2026-10-26 the
 * assistant still opened an apology with "I hope you're doing well" straight
 * after an email that opened the same way, and wrote a long one when Alex had
 * asked for a short one. The precedent is everywhere in this codebase (the
 * dash rule, the subject rule, the send gate): a rule the model keeps
 * breaking moves into code, which refuses the draft and says why, and the
 * model writes it again.
 *
 * Pure functions plus one small read; the assistant tools call
 * `draftSenseProblem` before saving or sending.
 */

import type { getDb } from './_db.js';

/** Stock pleasantries that open an email without saying anything. */
const STOCK_OPENERS: RegExp[] = [
  /\bi hope (?:you(?:'|’)?re|you are|all is|everything is|this (?:email |message |note )?finds you|you(?:'|’)?ve been|you have been)\b[^.!?\n]{0,40}\b(?:well|good|great|fine|wonderful|lovely|going well|having)\b/i,
  /\bhope (?:you(?:'|’)?re|you are) (?:doing|having|well|good|great)/i,
  /\bhope all is well\b/i,
  /\bhope (?:your|the) (?:week|day|weekend) (?:is|has been) /i,
  /\bi (?:just )?wanted to (?:reach out|follow up|check in|touch base)\b/i,
  /\bjust (?:reaching out|following up|checking in)\b/i,
  /надеюсь,? (?:у (?:вас|тебя) всё|вы|ты) (?:хорошо|в порядке|отлично)/i,
];

/** The greeting line ("Hi Jessica,") and sign-off lines are not the opening. */
function bodyLines(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length && /^(?:hi|hello|hey|dear|good (?:morning|afternoon|evening)|здравствуй|привет|добрый)\b/i.test(lines[0]) && lines[0].length < 60) lines.shift();
  const signOff = lines.findIndex((l) => /^(?:warmly|best|thanks|thank you|kind regards|regards|cheers|with love|xo|-- ?)[,!.]?$/i.test(l) || /^с (?:уважением|любовью)/i.test(l));
  return signOff >= 0 ? lines.slice(0, signOff) : lines;
}

/** The first two sentences of the body, where a stock opener would sit. */
export function openingOf(text: string): string {
  const body = bodyLines(text).join(' ');
  const sentences = body.split(/(?<=[.!?])\s+/).slice(0, 2);
  return sentences.join(' ');
}

const firstSentence = (text: string): string =>
  (bodyLines(text).join(' ').split(/(?<=[.!?])\s+/)[0] ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();

export const stockOpenerIn = (text: string): string | null => {
  const opening = openingOf(text);
  for (const re of STOCK_OPENERS) {
    const m = re.exec(opening);
    if (m) return m[0];
  }
  return null;
};

export const wordCount = (text: string): number => bodyLines(text).join(' ').split(/\s+/).filter(Boolean).length;

/** Did she ask for a short one? */
export const askedForShort = (userMessage: string): boolean =>
  /\b(?:short|shorter|quick|brief|concise|one[- ]liner|couple (?:of )?(?:lines|sentences))\b|коротк|кратк/i.test(userMessage);

/**
 * The longest a "short" email may be, in words, greeting and sign-off aside.
 * Set from the real case: Alex called a 68-word apology too long after asking
 * for "super short"; the version he wanted was about 35.
 */
export const SHORT_WORDS = 60;
export const VERY_SHORT_WORDS = 45;
const askedForVeryShort = (userMessage: string): boolean =>
  /(?:super|very|really|extra)[- ]?short|one[- ]liner|очень коротк/i.test(userMessage);

export interface ThreadTail {
  /** The last few emails WE sent this client, newest first. */
  recentOutbound: Array<{ body: string; sent_at: string }>;
  /** True when our message is the newest in the thread: they have not replied since. */
  awaitingReply: boolean;
}

/** The decision, given the thread and what she asked. Null when the draft is fine. */
export function draftSenseProblem(draft: string, tail: ThreadTail, userMessage: string): string | null {
  const opener = stockOpenerIn(draft);
  if (opener) {
    const repeated = tail.recentOutbound.slice(0, 2).find((m) => stockOpenerIn(m.body));
    if (repeated) {
      return (
        `Not saved: this opens with "${opener}", and the last email to this client opened with "${stockOpenerIn(repeated.body)}" too. ` +
        'Two emails in a row with the same pleasantry read like a template. Rewrite the opening so it gets straight to the point ' +
        '(a person writing again just says what they are writing about), then call the tool again.'
      );
    }
    if (tail.awaitingReply) {
      return (
        `Not saved: this opens with "${opener}", but the client has not replied to our last email yet, so this is a follow-up. ` +
        'A follow-up skips the pleasantry: open with the point, and refer to the earlier email if it helps. Rewrite and call the tool again.'
      );
    }
    // The house rule ("No boilerplate opener" in the assistant's prompt) holds
    // everywhere; the prompt alone did not keep it.
    return (
      `Not saved: this opens with "${opener}", a stock pleasantry the house style does not use. ` +
      'Start with the thing you are actually saying, then call the tool again.'
    );
  }
  const last = tail.recentOutbound[0];
  if (last && firstSentence(draft) && firstSentence(draft) === firstSentence(last.body)) {
    return 'Not saved: the first sentence is word for word the first sentence of the last email to this client. Write a new one, then call the tool again.';
  }
  if (askedForShort(userMessage)) {
    const words = wordCount(draft);
    const limit = askedForVeryShort(userMessage) ? VERY_SHORT_WORDS : SHORT_WORDS;
    if (words > limit) {
      return (
        `Not saved: Vero asked for a short email, and this one is ${words} words. ` +
        `Cut it to under ${limit} words (two or three sentences): say the one thing it is for, leave out pleasantries, thanks and repetition, then call the tool again.`
      );
    }
  }
  return null;
}

/** The thread's recent shape, read from the database, never from the model. */
export async function threadTail(sql: ReturnType<typeof getDb>, conversationId: string): Promise<ThreadTail> {
  const rows = (await sql`
    select direction, body, sent_at
    from messages
    where conversation_id = ${conversationId} and coalesce(status, 'sent') = 'sent'
    order by sent_at desc
    limit 12
  `) as Array<{ direction: string; body: string; sent_at: string }>;
  return {
    recentOutbound: rows.filter((r) => r.direction === 'outbound').slice(0, 3).map((r) => ({ body: r.body ?? '', sent_at: r.sent_at })),
    awaitingReply: rows.length > 0 && rows[0].direction === 'outbound',
  };
}
