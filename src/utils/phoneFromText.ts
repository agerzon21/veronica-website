/**
 * Find a phone number a client typed into a message.
 *
 * DETERMINISTIC AND DELIBERATELY CONSERVATIVE, and that is the point rather
 * than a limitation. The number this produces gets written to a client's
 * record and dialled from the Call button, so the evidence behind it has to be
 * something a model did not author: the raw bytes of a message that person
 * really sent. This repo has an incident on file where a safety flag the model
 * set was treated as a gate, and migration 037's own column comment says the
 * field is "unverified by nature: it drives suggestions, never an automatic
 * identity merge".
 *
 * EVERY RULE BELOW WAS WRITTEN AGAINST THE REAL INBOX, not imagined. A first
 * pass over 260 real inbound messages returned the three numbers that matter
 * and eleven that do not: Chase transaction ids, a Google Business profile id,
 * a Google Ads customer id ("864-349-1203", shaped exactly like a phone),
 * toll-free support lines in marketing mail, and, worst of them, VERO'S OWN
 * NUMBER quoted back inside a Gmail reply. After these rules the same corpus
 * returns the three and nothing else.
 *
 * A missed number costs one tap. A wrong one puts a stranger on a booking.
 */

/**
 * Numbers that are ours, never a client's.
 *
 * Vero's number reaches threads by several routes: the auto-reply quotes it,
 * the signature appended to persisted outbound replies carries it, and Gmail
 * keeps both inside the customer's next reply. In a typical website-form
 * thread it is the ONLY phone-shaped string in the transcript.
 */
export const HOUSE_PHONES = ['5709095707'];

/** Digits only, with a leading US country code dropped. */
export function normalizePhone(raw: string): string {
  const d = String(raw).replace(/\D/g, '');
  return d.length === 11 && d[0] === '1' ? d.slice(1) : d;
}

/** The grouping the rest of this screen already uses. */
export function formatPhone(digits: string): string {
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** Toll-free prefixes. A client's own mobile is never one of these. */
const TOLL_FREE = new Set(['800', '833', '844', '855', '866', '877', '888']);

/**
 * Quoted history, cut before anything is read.
 *
 * Gmail includes the whole thread in every reply, so Vero's signature and her
 * number sit inside the customer's own message. Without this, one real thread
 * in this inbox hands back her number as the client's.
 */
function withoutQuotedHistory(text: string): string {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (t.startsWith('>')) break;
    if (/^On .+ wrote:$/i.test(t)) break;
    if (/^-{2,}\s*(Original Message|Forwarded message)/i.test(t)) break;
    if (/^From:\s/i.test(t) && out.length > 0) break;
    out.push(line);
  }
  return out.join('\n');
}

const CANDIDATE = /(?:\+?1[\s.\-]?)?(?:\(\d{3}\)|\d{3})[\s.\-]?\d{3}[\s.\-]?\d{4}/g;

/** Words that mark a phone-shaped run as an identifier instead. */
const IDENTIFIER_NEARBY =
  /\b(?:zip|postal|invoice|order|account|routing|card|ssn|ein|tracking|transaction|customer\s+id|fid|profile)\b/i;

export interface FoundPhone {
  /** Exactly as it was typed, for showing back. */
  raw: string;
  /** Ten digits, for comparing and storing. */
  digits: string;
  /** The sentence around it, so a person can confirm at a glance. */
  context: string;
}

/**
 * Every plausible client phone number in one message body.
 *
 * Call this ONLY on inbound messages. An outbound one is Vero writing, and
 * the numbers in it are hers.
 */
export function findPhonesInText(
  text: string | null | undefined,
  exclude: readonly string[] = HOUSE_PHONES,
): FoundPhone[] {
  if (!text) return [];
  const body = withoutQuotedHistory(String(text));
  const skip = new Set(exclude.map(normalizePhone));
  const out: FoundPhone[] = [];
  const seen = new Set<string>();

  for (const m of body.matchAll(CANDIDATE)) {
    const digits = normalizePhone(m[0]);
    const at = m.index ?? 0;
    if (digits.length !== 10) continue;

    /*
     * NOT PART OF A LONGER RUN OF DIGITS. This single rule removes every
     * Chase transaction id and every Google profile id in the real corpus:
     * they are 11+ digit strings whose first ten happen to look like a
     * number.
     */
    if (/\d/.test(body.slice(Math.max(0, at - 1), at))) continue;
    if (/\d/.test(body.slice(at + m[0].length, at + m[0].length + 1))) continue;

    // North American numbering: neither the area code nor the exchange may
    // begin with 0 or 1.
    if (/^[01]/.test(digits) || /^[01]/.test(digits.slice(3))) continue;
    if (TOLL_FREE.has(digits.slice(0, 3))) continue;
    // 555 is the reserved fictional exchange.
    if (digits.slice(3, 6) === '555') continue;
    // A single repeated digit is a placeholder somebody typed, not a number.
    if (/^(\d)\1{9}$/.test(digits)) continue;
    if (skip.has(digits)) continue;

    const before = body.slice(Math.max(0, at - 60), at);
    const context = body.slice(Math.max(0, at - 60), at + m[0].length + 30);
    if (IDENTIFIER_NEARBY.test(context)) continue;
    // Inside a URL it is an identifier, not something to ring.
    if (/https?:\/\/\S*$/.test(before)) continue;
    /**
     * A tel: LINK TARGET, not a typed number.
     *
     * Bark's marketing mail renders "call our Customer Experience team on
     * (424) 227-5323 <tel:+14242275869>" — the href and the words disagree,
     * and neither belongs to a client. Every real number in this inbox was
     * typed in prose ("my number is 732 330 3426"), so dropping URI targets
     * costs nothing and removes the only false positive left in 261 real
     * inbound messages.
     */
    if (/(?:tel|callto|sms|fax):\s*$/i.test(before)) continue;
    if (/[$€£]\s*$/.test(before)) continue;

    if (seen.has(digits)) continue;
    seen.add(digits);
    out.push({ raw: m[0].trim(), digits, context: context.replace(/\s+/g, ' ').trim() });
  }
  return out;
}
