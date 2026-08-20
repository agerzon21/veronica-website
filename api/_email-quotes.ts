/**
 * Splits an inbound email into what the sender actually WROTE and the
 * quoted history their mail client tacked underneath.
 *
 * Two jobs, one parser:
 *
 * 1. DISPLAY. Every reply in a thread arrives carrying the entire
 *    conversation re-quoted beneath it. The admin panel already renders
 *    the full thread above, so repeating it inside each bubble is pure
 *    noise — by message four the actual sentence is buried under three
 *    screens of `>`.
 *
 * 2. RECOVERY. When Veronika replies from Gmail instead of the panel,
 *    that message never touches our infrastructure and the thread has a
 *    hole in it. But the client's next reply quotes it verbatim. So the
 *    quoted block is the only record we will ever get of what she sent,
 *    and parsing it back out closes the gap without the Gmail API.
 *
 * Deliberately conservative: when the shape is unfamiliar we return the
 * body unchanged rather than guessing. Losing a client's actual words to
 * an over-eager regex is far worse than showing some extra quoted text.
 */

/** A quoted block attributed to one sender at one time. */
export interface QuotedMessage {
  /** Display name or address from the attribution line, if present. */
  author: string | null;
  /** Email address from the attribution line, if present. */
  authorEmail: string | null;
  /** Parsed timestamp from the attribution line, if usable. */
  sentAt: string | null;
  /** The quoted body with `>` markers stripped. */
  body: string;
}

export interface SplitEmail {
  /** What the sender wrote this time. */
  newContent: string;
  /** Everything below the quote boundary, markers intact. */
  quoted: string;
  /** The most recent quoted message, parsed. Null if unrecognizable. */
  mostRecentQuote: QuotedMessage | null;
}

/**
 * Attribution lines that introduce a quoted block. Ordered most- to
 * least- specific; the first match wins.
 *
 * The English/Gmail form is the common case. The Russian variant matters
 * because Veronika's clients write in Russian and her own Gmail is
 * Russian-localized, so her quoted replies carry the Russian header.
 */
const ATTRIBUTION_PATTERNS: RegExp[] = [
  // Gmail: "On Thu, Aug 20, 2026 at 11:57 AM Vero Photography <vero@…> wrote:"
  //
  // `when` is anchored to END AT A CLOCK TIME. An unanchored lazy group
  // stops at the first whitespace it can get away with, which splits the
  // date mid-way ("Thu, Aug") and dumps the remainder into `who` —
  // yielding an author of "20, 2026 at 11:57 AM Vero Photography" and an
  // unparseable timestamp.
  /^On\s+(?<when>.{4,70}?\d{1,2}:\d{2}(?:\s*[AP]M)?)\s+(?<who>.{1,120}?)\s+wrote:\s*$/im,
  // Outlook / Apple Mail: "On 20 Aug 2026, at 11:57, Name <addr> wrote:"
  /^On\s+(?<when>.{4,60}?,\s*at\s+\d{1,2}:\d{2}(?:\s*[AP]M)?),\s*(?<who>.{1,120}?)\s+wrote:\s*$/im,
  // Russian Gmail: "чт, 20 авг. 2026 г. в 11:57, Имя <addr>:"
  /^(?<when>(?:пн|вт|ср|чт|пт|сб|вс),\s*.{4,60}?\s+в\s+\d{1,2}:\d{2}),\s*(?<who>.{1,120}?):\s*$/im,
  // Loose fallback — no recoverable timestamp, but still a real boundary.
  /^On\s+.{6,120}?\s+wrote:\s*$/im,
  // Generic forwarded/original-message separators.
  /^-{2,}\s*(?:Original Message|Forwarded message|Пересылаемое сообщение)\s*-{2,}\s*$/im,
];

/**
 * Trailing sign-off lines to trim from a RECOVERED quote.
 *
 * Gmail drops the RFC 3676 `-- ` delimiter when it quotes, so the
 * signature arrives as ordinary text with nothing marking where the
 * message ends. Without trimming, every recovered message carries
 * "Warmly, Veronika, Vero Photography" — which reads as though she typed
 * it twice once the panel appends the real signature on the next send.
 */
const TRAILING_SIGNOFF =
  /\n+\s*(?:Warmly|Best|Regards|Sincerely|Thanks|Cheers|С уважением|Всего доброго)\s*,?[\s\S]{0,160}$/i;

/**
 * The RFC 3676 signature delimiter (`-- ` on its own line). Our own
 * outbound uses it, so it also marks where a quoted copy of one of our
 * messages ends and its signature begins.
 */
const SIG_DELIMITER = /^--\s*$/m;

/**
 * Find where the quoted history starts.
 *
 * Prefers an attribution line, because that gives us the author and
 * timestamp for recovery. Falls back to the first run of `>`-prefixed
 * lines, which catches clients that quote without attribution.
 */
function findQuoteBoundary(body: string): number {
  let earliest = -1;
  for (const pattern of ATTRIBUTION_PATTERNS) {
    const m = pattern.exec(body);
    if (m && m.index >= 0 && (earliest === -1 || m.index < earliest)) {
      earliest = m.index;
    }
  }
  if (earliest !== -1) return earliest;

  // Fallback: a run of at least two consecutive '>' lines. One stray
  // '>' line is more likely to be someone quoting a phrase inline than
  // a mail client's quote block.
  const lines = body.split('\n');
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].startsWith('>') && lines[i + 1].startsWith('>')) {
      return lines.slice(0, i).join('\n').length;
    }
  }
  return -1;
}

/**
 * Split an email body into new content and quoted history.
 *
 * If no boundary is found, everything is treated as new content — the
 * safe direction to be wrong in.
 */
export function splitQuotedEmail(rawBody: string): SplitEmail {
  const body = (rawBody || '').replace(/\r\n/g, '\n');
  const boundary = findQuoteBoundary(body);

  if (boundary === -1) {
    return { newContent: body.trim(), quoted: '', mostRecentQuote: null };
  }

  const newContent = body.slice(0, boundary).replace(/\s+$/, '');
  const quoted = body.slice(boundary);

  // A boundary at position 0 means the message is quote-only — a
  // "+1" or an empty reply. Keep the original body rather than
  // storing an empty string.
  if (!newContent.trim()) {
    return { newContent: body.trim(), quoted: '', mostRecentQuote: null };
  }

  return { newContent, quoted, mostRecentQuote: parseMostRecentQuote(quoted) };
}

/**
 * Parse the FIRST quoted block — which, because mail clients nest
 * oldest-deepest, is the most recent message in the chain. That is the
 * one we might be missing.
 */
export function parseMostRecentQuote(quoted: string): QuotedMessage | null {
  if (!quoted.trim()) return null;

  let author: string | null = null;
  let authorEmail: string | null = null;
  let sentAt: string | null = null;
  let rest = quoted;

  for (const pattern of ATTRIBUTION_PATTERNS) {
    const m = pattern.exec(quoted);
    if (!m) continue;
    const who = m.groups?.who ?? '';
    const when = m.groups?.when ?? '';

    const emailMatch = who.match(/<\s*([^>\s]+@[^>\s]+)\s*>/);
    if (emailMatch) {
      authorEmail = emailMatch[1].trim().toLowerCase();
      author = who.replace(emailMatch[0], '').replace(/["']/g, '').trim() || null;
    } else if (who.includes('@')) {
      authorEmail = who.trim().toLowerCase();
    } else {
      author = who.trim() || null;
    }

    if (when) {
      const parsed = new Date(when.replace(/\s+at\s+/i, ' '));
      if (!Number.isNaN(parsed.getTime())) sentAt = parsed.toISOString();
    }

    rest = quoted.slice(m.index + m[0].length);
    break;
  }

  // Strip one level of '>' markers. Stop at the next attribution line —
  // beyond it is an OLDER message we already have.
  const collected: string[] = [];
  for (const line of rest.split('\n')) {
    const unquoted = line.replace(/^>\s?/, '');
    if (ATTRIBUTION_PATTERNS.some((p) => new RegExp(p.source, 'i').test(unquoted.trim()))) break;
    collected.push(unquoted);
  }

  // Drop the signature block — it is chrome, and including it makes
  // recovered messages compare unequal to what we actually sent.
  let text = collected.join('\n');
  const sigAt = text.search(SIG_DELIMITER);
  if (sigAt > 0) {
    text = text.slice(0, sigAt);
  } else {
    // No delimiter survived the quoting — trim a recognizable sign-off
    // instead, but only if real content precedes it.
    const trimmed = text.replace(TRAILING_SIGNOFF, '');
    if (trimmed.trim().length >= 15) text = trimmed;
  }
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  if (!text) return null;
  return { author, authorEmail, sentAt, body: text };
}

/**
 * Loose equality for deciding whether a quoted block is a message we
 * already stored.
 *
 * Exact comparison is useless here: mail clients re-wrap lines, convert
 * unicode punctuation, and drop or reformat signatures. So compare on
 * collapsed alphanumerics, and treat a containment match as equal —
 * a quote is frequently a truncated version of the original.
 */
export function looksLikeSameMessage(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[^a-z0-9'"]+/g, ' ')
      .trim();

  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Containment, but only when the shorter side carries enough signal
  // that the overlap can't be coincidental.
  const [shorter, longer] = na.length <= nb.length ? [na, nb] : [nb, na];
  if (shorter.length >= 25 && longer.includes(shorter)) return true;

  // Word-overlap fallback.
  //
  // Containment alone is too strict for the case that actually bites:
  // the SAME message rendered two different ways. Our auto-reply goes
  // out as multipart, and the client's quote may come back derived from
  // the HTML part — carrying a "Vero Photography" header and a
  // "you're receiving this because…" footer that the stored plaintext
  // part never had. 608 chars vs 431, neither containing the other,
  // despite being one message. Without this the auto-reply gets
  // "recovered" as a phantom duplicate on the client's first reply.
  //
  // Jaccard over word sets ignores that chrome: the shared sentences
  // dominate. 0.6 is deliberately well clear of the ~0.1-0.2 that two
  // genuinely different messages between the same two people score.
  return jaccardSimilarity(na, nb) >= 0.6;
}

/** Jaccard index over whitespace-delimited word sets. */
function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(/\s+/).filter(Boolean));
  const setB = new Set(b.split(/\s+/).filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}
