/**
 * AI reply engine for the Vero messaging assistant.
 *
 * Called from the Instagram webhook after a new inbound message is
 * persisted. Runs through a series of guardrails before generating,
 * then generates a reply via GPT-4o-mini, sends it via the IG API,
 * and stores the outbound message row.
 *
 * The pipeline:
 *   1. Check global kill switch (system_state.messaging_ai_state)
 *   2. Check per-conversation ai_enabled toggle
 *   3. Check dedup: any outbound msg after this inbound already?
 *   4. Check rate limit: any AI msg from us in the last 5 min?
 *   5. Detect booking COMMITMENT (deposit/contract/"book it") → send
 *      bridge, disable AI, done. Pricing questions and date mentions
 *      deliberately do NOT bridge — they go to the model.
 *   6. Detect spam (last 3 inbounds too similar) → send bridge, disable AI, done
 *   7. Detect wrap-up trigger (>= MAX_AI_MSGS AI replies already)
 *      → send wrap-up handoff, disable AI, done
 *   8. Load ai_context rows + last N messages for context
 *   9. Call OpenAI with a system prompt + conversation history
 *  10. Send the reply via IG API
 *  11. Persist the outbound message row (direction=outbound, sender=ai)
 *
 * Every skip / escalation path logs a reason so we can trace behavior
 * without dumping full messages. Everything Vero can edit lives in
 * ai_context; hardcoded meta-framing keeps her from accidentally
 * unmaking the safety rails via the UI.
 *
 * A note on that split, learned the hard way: the rails must forbid
 * only what is genuinely unsafe. They previously banned quoting any
 * price and making any suggestion, which meant the pricing Vero had
 * carefully entered could never be used, and no amount of coaching
 * through the Assistant tab could change it — her edits land in
 * ai_context, which the hardcoded rules overrode. If Vero is asking
 * for behavior the rails prohibit, the rails are what need revisiting.
 */

import OpenAI from 'openai';
import { getDb } from './_db.js';
import { sendIgTextMessage } from './_ig-send.js';

// GPT-4o-mini is fast, cheap, and plenty smart for concierge-style
// short replies. ~$0.15/1M input tokens, ~$0.60/1M output — a typical
// reply is well under a cent.
const OPENAI_MODEL = 'gpt-4o-mini';

// After this many AI replies in a conversation, send the wrap-up
// handoff and disable AI. Prevents the bot from having infinite
// conversations that could deliver bad info OR waste API tokens.
const MAX_AI_MSGS_PER_CONVO = 6;

// Minimum gap between AI replies in the same conversation. Prevents
// spam/bursts if the webhook fires multiple times or messages arrive
// in quick succession.
const MIN_GAP_MS_BETWEEN_AI = 60_000; // 60 seconds

// How many recent messages to feed the AI as conversation history.
// Balances context (better replies) vs token cost.
const HISTORY_CONTEXT_MESSAGES = 12;

/**
 * COMMITMENT keywords only — the point where money or a firm date is
 * actually being locked in, which Vero must handle herself.
 *
 * Deliberately much narrower than it used to be. The old list included
 * 'price', 'cost', 'how much', 'rate', 'package', 'available' — i.e. the
 * ordinary questions every prospective client opens with. Bridging those
 * meant the assistant refused to answer exactly the questions Vero had
 * loaded pricing data into the knowledge base to answer, and then
 * switched itself off. Those now flow to the model, which quotes RANGES
 * from KNOWN FACTS and gathers the variables a real quote depends on.
 *
 * What stays here is genuinely transactional: deposits, contracts,
 * invoices, and explicit "I want to book" intent.
 */
const BOOKING_INTENT_KEYWORDS = [
  // English
  'deposit', 'retainer', 'contract', 'invoice', 'pay', 'payment',
  'book it', 'book you', 'book her', 'booking form', 'lock in', 'reserve',
  'sign up', 'put down',
  // Russian
  'предоплата', 'аванс', 'забронировать', 'бронирование', 'договор',
  'оплатить', 'оплата', 'внести',
];

// Date pattern regex — catches month names, ISO dates, "the 12th",
// "next weekend", "this saturday", etc.
//
// No longer a bridge trigger. A date mention is ordinary in a first
// message ("we're thinking sometime in May") and bridging on it meant
// refusing to engage with most real inquiries. It now raises the
// never-confirm-availability rail inside the prompt instead.
const DATE_INTENT_PATTERNS: RegExp[] = [
  // Month names (English + Russian) + optional day
  /\b(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\b/i,
  /\b(январ|феврал|март|апрел|мая|июн|июл|август|сентябр|октябр|ноябр|декабр)/i,
  // ISO dates (2026-08-12)
  /\b\d{4}-\d{2}-\d{2}\b/,
  // Numeric dates (8/12, 8-12-2026, 12.08)
  /\b\d{1,2}[\/\-.]\d{1,2}([\/\-.]\d{2,4})?\b/,
  // "12th", "3rd", "1st"
  /\b\d+(st|nd|rd|th)\b/i,
  // Relative dates
  /\b(today|tomorrow|next (week|weekend|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this (weekend|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i,
  /\b(завтра|послезавтра|на выходн|в субботу|в воскресенье|на следующ)/i,
];

// Agency / solicitation / spam patterns. These are the sales pitches
// that flood every creator's DMs — web design agencies claiming her
// site is "outdated", SEO shops, marketing services, crypto pitches,
// bogus "collab" offers with a link. The right response is SILENCE:
// no reply, no bridge (which would just confirm the account is live
// and hand them a target). Match is broad-and-generous on purpose —
// false positives here are extremely cheap (Vero can toggle AI back
// on and reply manually if she wants) while false negatives are the
// context-deaf "great! for pricing…" reply that embarrasses her.
const SPAM_SOLICITATION_PATTERNS: RegExp[] = [
  // "Your website is outdated / we can modernize"
  /\b(your|the) (website|site) (is )?(outdated|old|slow|not optimi[sz]ed)/i,
  /\b(modernize|redesign|revamp|rebuild) (your|the) (website|site)/i,
  /\bfree (website|site|seo) (audit|review|check)/i,

  // Agency / service selling ("we specialize in", "we help X grow", "we design")
  /\bwe (specialize|specialise) in\b/i,

  // FREELANCER pitches — the same solicitation in the first person.
  // Every pattern here used to assume "we", so a solo editor writing
  // "Hello! I'm a professional photo editor, I specialize in colour
  // correction..." sailed straight through. That flavor is the single
  // most common junk DM a photographer gets.
  /\bi (specialize|specialise) in\b/i,
  /\bi(?:'m| am)?\s+a\s+(professional\s+)?(photo|video|image|wedding|event)\s*(editor|retoucher)/i,
  /\b(photo|video|image)\s*(editor|editing|retouch(ing|er)?)\b[\s\S]{0,60}\b(\d+\+?\s*years?|experience|service)/i,
  /\bi (came across|noticed|found) your (instagram|profile|account|page|work|website)/i,
  /\bi(?:'d| would) love to (help|work with|collaborate)/i,
  /\b(color|colour) correction\b/i,
  /\bskin retouch(ing)?\b/i,
  /\bbackground (cleanup|removal)\b/i,
  /\bwe (help|design|build|create|make) (websites?|brands?|logos?|content|videos?|clients?|businesses?|companies)/i,
  /\bwe (are|are a|are an)\s+\w+\s+(agency|studio|team|company|firm)/i,
  /\bour (agency|studio|team|portfolio|services|clients?|work)\b/i,

  // "Just reply YES / reply DM for X" — classic mass-DM CTA
  /\b(just )?reply ["']?(yes|y|dm|info|more|details)["']?\b/i,
  /\bcomment ["']?(yes|info|more|details)["']?\b/i,

  // SEO / marketing / lead-gen solicitations
  /\b(seo|search engine optimi[sz]ation|google (ranking|visibility|traffic))\b/i,
  /\b(lead generation|leads for you|more (leads|clients|bookings|inquiries))\b/i,
  /\b(digital marketing|social media (management|marketing)|content strategy)/i,

  // Crypto / investment / MLM
  /\b(crypto|bitcoin|forex|trading|investment opportunity|passive income|financial freedom)\b/i,
  /\b(earn|make) \$?\d+.*\b(per|a|\/) ?(day|week|month|hour)/i,

  // "We noticed your account / came across your profile" — cold outreach opener
  /\bwe (noticed|came across|found|discovered) (your|the) (account|profile|website|instagram|page)/i,

  // Bulk collab bait ("we'd love to collaborate", link included)
  /\b(collab|collaborate|partnership) .*(https?:\/\/|www\.)/i,

  // Russian equivalents
  /\bваш сайт (устарел|устаревш|не оптимизирован)/i,
  /\bмы специализируемся\b/i,
  /\bмы (помогаем|создаём|разрабатываем) (сайт|бренд|логотип|контент)/i,
  /\bбесплатн(ый|ая|ое) (аудит|анализ) сайт/i,
  /\bпросто напишите ["']?да["']?/i,
];


export interface ReplyResult {
  action:
    | 'sent-ai-reply'
    | 'sent-booking-bridge'
    | 'sent-wrap-up'
    | 'sent-spam-bridge'
    | 'skipped-global-kill'
    | 'skipped-convo-disabled'
    | 'skipped-already-replied'
    | 'skipped-rate-limit'
    | 'skipped-casual-message'
    | 'skipped-spam-solicitation'
    // Cross-invocation race — another Vercel lambda already claimed
    // the ai_reply_intents row for this inbound (Meta shipped two
    // POSTs milliseconds apart to two different lambdas). See
    // db/migrations/015-ai-reply-intents.sql for the mechanism.
    | 'skipped-concurrent-run'
    | 'error-send-failed'
    | 'error-generation-failed';
  reason?: string;
  outboundBody?: string;
}

interface Conversation {
  id: string;
  external_user_id: string;
  ai_enabled: boolean;
}

interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  sender: 'contact' | 'ai' | 'human';
  body: string;
  sent_at: string;
}

interface ContextRow {
  category: string;
  label: string;
  content: string;
}

// Client-side timeout on OpenAI calls. The SDK default is 600s (10 min)
// which is nowhere near what we want for a webhook-driven reply:
//   - gpt-4o-mini with max_tokens:300 normally returns in a few
//     seconds (typical: 1-3s).
//   - If OpenAI is having a bad day and a call actually takes 30s+,
//     that used to blow Meta's 20s webhook SLA (fixed in _ig-webhook.ts
//     by moving processInboundMessage to waitUntil, so this is now
//     defense-in-depth rather than load-bearing).
//   - Beyond that, an unbounded call ties up the serverless function
//     for the entire maxDuration:60 window, wasting execution budget
//     and delaying any other work.
// 15s is well above the p99 for our request shape but cleanly cuts
// off pathological hangs. On timeout the SDK throws AbortError which
// bubbles through processInboundMessage's try/catch to
// action:'error-generation-failed' with reason:'…timeout…'.
const OPENAI_CLIENT_TIMEOUT_MS = 15_000;

let cachedClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (cachedClient) return cachedClient;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY env var missing');
  cachedClient = new OpenAI({ apiKey: key, timeout: OPENAI_CLIENT_TIMEOUT_MS });
  return cachedClient;
}

/**
 * Main entry — call after persisting an inbound message. Handles
 * everything from guardrail checks to sending the outbound reply.
 * Never throws; returns a structured result the caller can log.
 */
export async function processInboundMessage(args: {
  conversationId: string;
  inboundMessageId: string;
  inboundSentAt: string;
}): Promise<ReplyResult> {
  try {
    const sql = getDb();

    // ── 1. Global kill switch ────────────────────────────────
    const stateRows = (await sql`
      SELECT value FROM system_state WHERE key = 'messaging_ai_state' LIMIT 1
    `) as Array<{ value: string | null }>;
    if (stateRows[0]?.value === 'off') {
      return { action: 'skipped-global-kill', reason: 'messaging_ai_state=off' };
    }

    // ── 2. Load conversation + per-convo toggle check ────────
    const convoRows = (await sql`
      SELECT id, external_user_id, ai_enabled
      FROM conversations
      WHERE id = ${args.conversationId}
      LIMIT 1
    `) as Array<Conversation>;
    const convo = convoRows[0];
    if (!convo) {
      return { action: 'error-generation-failed', reason: 'conversation not found' };
    }
    if (!convo.ai_enabled) {
      return { action: 'skipped-convo-disabled', reason: 'ai_enabled=false' };
    }

    // ── 3. Dedup: did we already reply to this inbound? ──────
    const laterOutbound = (await sql`
      SELECT id FROM messages
      WHERE conversation_id = ${args.conversationId}
        AND direction = 'outbound'
        AND sent_at > ${args.inboundSentAt}
      LIMIT 1
    `) as Array<{ id: string }>;
    if (laterOutbound.length > 0) {
      return { action: 'skipped-already-replied', reason: 'outbound exists after inbound' };
    }

    // ── 4. Rate limit: any outbound within the last N seconds? ──
    // Compute the cutoff timestamp in JS rather than using a Postgres
    // INTERVAL literal — the sql-tag driver treats every ${} as a
    // parameterized bind, but $N placeholders inside quoted strings
    // like 'INTERVAL "$2 seconds"' are just literal text to Postgres,
    // so the driver ends up binding more params than the query
    // recognizes. Passing an ISO timestamp as a plain parameter
    // sidesteps the whole problem.
    const rateLimitCutoff = new Date(Date.now() - MIN_GAP_MS_BETWEEN_AI).toISOString();
    const rateRows = (await sql`
      SELECT id, sent_at FROM messages
      WHERE conversation_id = ${args.conversationId}
        AND direction = 'outbound'
        AND sent_at > ${rateLimitCutoff}
      LIMIT 1
    `) as Array<{ id: string; sent_at: string }>;
    if (rateRows.length > 0) {
      return { action: 'skipped-rate-limit', reason: 'outbound within rate-limit window' };
    }

    // ── 5. Load full conversation history for the AI + guardrails ──
    const historyRows = (await sql`
      SELECT id, direction, sender, body, sent_at
      FROM messages
      WHERE conversation_id = ${args.conversationId}
      ORDER BY sent_at DESC
      LIMIT ${HISTORY_CONTEXT_MESSAGES}
    `) as Array<Message>;
    // Query returned newest-first for LIMIT purposes; feed AI oldest-first.
    const history = [...historyRows].reverse();
    const inboundMessages = history.filter((m) => m.direction === 'inbound');
    const outboundAiMessages = history.filter(
      (m) => m.direction === 'outbound' && m.sender === 'ai',
    );
    const latestInbound = [...inboundMessages].reverse()[0];
    const latestInboundBody = latestInbound?.body ?? '';

    // ── 6. Truly-empty message filter ────────────────────────
    // Skip AI reply ONLY if there's genuinely nothing to respond to
    // (pure emojis, punctuation, or a single-character message).
    // Loosened from the previous "casual/greeting" filter after
    // feedback: a "hey" alone might be a real client with a shy
    // opener, and we shouldn't ghost them. The AI's system prompt
    // is now conservative enough that a "hi! anything I can help
    // with?" reply is fine for both real inquiries and Vero's
    // friends (friends realize they're talking to a bot and move
    // on; clients engage further).
    if (isEmptyOrEmojiOnly(latestInboundBody)) {
      return {
        action: 'skipped-casual-message',
        reason: 'message has no substantive content',
      };
    }

    // ── 7. Agency / solicitation spam filter ─────────────────
    // Silent skip — don't reply, don't send a bridge, don't confirm
    // the account is live. Also flip ai_enabled off so a follow-up
    // pitch doesn't burn another API call. Vero can regen the
    // summary in the inbox to see the classification, and if she
    // decides it's actually legit she can toggle AI back on and
    // reply manually.
    if (matchesSpamSolicitation(latestInboundBody)) {
      await sql`
        UPDATE conversations
        SET ai_enabled = FALSE, updated_at = NOW()
        WHERE id = ${convo.id}
      `;
      return {
        action: 'skipped-spam-solicitation',
        reason: 'agency / solicitation pattern matched — silent skip',
      };
    }

    // ── 7.5. Cross-invocation race guard ─────────────────────
    //
    // Claim exclusive right to reply in THIS CONVERSATION. If Meta
    // shipped two POSTs milliseconds apart to two different Vercel
    // lambdas (routine — happens whenever a customer types quickly,
    // not just on retries), both lambdas will have passed the dedup
    // + rate-limit gates above concurrently. The PRIMARY KEY on
    // ai_reply_intents.conversation_id makes this INSERT atomic:
    // one lambda per conversation wins and proceeds; the other gets
    // zero rows back and short-circuits without touching OpenAI or
    // the IG API.
    //
    // See db/migrations/015-ai-reply-intents.sql for the full
    // rationale. The within-invocation version of this race is
    // handled by the sequential-for-await loop in _ig-webhook.ts;
    // this is the cross-invocation counterpart.
    //
    // Why conversation_id and not inbound_message_id: the race is
    // about "don't send two replies to the same customer in a tiny
    // window." Two different mids in the same conversation processed
    // by two lambdas would each claim their own row if we keyed on
    // inbound_message_id — both would proceed and both would send.
    // Conversation-scoped claim is the right lock granularity.
    //
    // Placed AFTER the silent-skip filters (empty/emoji + spam
    // solicitation) so we don't burn claim rows on messages we'd
    // never reply to anyway — and BEFORE any code path that sends
    // (bridges + main AI reply below).
    // Track whether we actually acquired the claim. Stays false in
    // the fail-open path below (missing table); the finally then
    // knows to skip the release DELETE, which would ALSO fail with
    // the same 42P01 and drown the real return in cleanup noise.
    let claimAcquired = false;
    try {
      const claim = (await sql`
        INSERT INTO ai_reply_intents (conversation_id)
        VALUES (${convo.id})
        ON CONFLICT DO NOTHING
        RETURNING conversation_id
      `) as Array<{ conversation_id: string }>;

      if (claim.length === 0) {
        return {
          action: 'skipped-concurrent-run',
          reason: 'another lambda is currently replying in this conversation',
        };
      }
      claimAcquired = true;
    } catch (claimErr) {
      // Defensive fail-open on missing table (42P01). If someone
      // deployed the code before running migration 015, we don't
      // want every single AI reply to silently die with
      // 'error-generation-failed' — that would look identical to
      // an OpenAI outage from the outside. Fall back to pre-015
      // behavior (works but the cross-invocation race is possible)
      // and emit a loud warning that names the exact remediation.
      //
      // Any OTHER error here is unexpected — re-throw so the outer
      // catch handles it as a real pipeline error.
      const msg = claimErr instanceof Error ? claimErr.message : String(claimErr);
      const isMissingTable =
        msg.includes('ai_reply_intents') &&
        (msg.includes('does not exist') || msg.includes('42P01'));
      if (!isMissingTable) throw claimErr;
      console.warn(
        '[ai-reply] ai_reply_intents table missing — falling back to pre-015 ' +
          'behavior. Cross-invocation double-reply race is possible until ' +
          'db/migrations/015-ai-reply-intents.sql is applied to prod Neon. ' +
          `Underlying error: ${msg}`,
      );
      // claimAcquired stays false; the finally block will skip the DELETE
      // (which would fail with the same 42P01 and add nothing useful).
    }

    // Below this point we ALWAYS release the claim in the finally
    // block if we acquired it — success OR failure. The claim's
    // purpose is pure serialization: once we're done, the next
    // legitimate reply to this conversation should be free to
    // proceed. Keeping the claim on success would block ALL future
    // AI replies to this convo forever. Any subsequent inbound
    // during our flight already hit skipped-concurrent-run above;
    // any inbound arriving AFTER we release will pass the claim
    // gate but get caught by the existing dedup ("outbound after
    // this inbound?") or the 60s rate-limit gate — because our
    // outbound is now in the DB.
    try {
      // ── 8. Booking COMMITMENT → bridge + disable ──────────────
      //
      // Narrowed hard. This used to also fire on any date mention and
      // any request for a suggestion, on top of a keyword list that
      // included 'price', 'cost', 'available' and 'package'. Between
      // them, almost every real opening message got the canned deferral
      // instead of an answer — and the bridge switches the AI off, so
      // one false positive killed the thread permanently.
      //
      // Now only actual transaction intent (deposit, contract, invoice,
      // "I want to book") defers, because that is where Vero genuinely
      // has to take over. Pricing questions, date mentions and requests
      // for ideas all continue to the model, which has the knowledge
      // base and clear rules about what it may and may not commit to.
      if (matchesBookingIntent(latestInboundBody)) {
        return await sendBridgeAndEscalate(
          sql,
          convo,
          'booking_bridge',
          'sent-booking-bridge',
          'booking commitment detected',
        );
      }

      // ── 9. Spam / repeat detection: last 3 inbounds very similar ──
      if (looksLikeSpam(inboundMessages)) {
        return await sendBridgeAndEscalate(
          sql,
          convo,
          'booking_bridge',
          'sent-spam-bridge',
          'inbound messages look repetitive',
        );
      }

      // ── 10. Wrap-up trigger: too many AI replies already ─────
      if (outboundAiMessages.length >= MAX_AI_MSGS_PER_CONVO) {
        return await sendBridgeAndEscalate(
          sql,
          convo,
          'escalation_wrap_up',
          'sent-wrap-up',
          `hit MAX_AI_MSGS (${MAX_AI_MSGS_PER_CONVO})`,
        );
      }

      // ── 11. Load ai_context for the system prompt ─────────────
      //
      // EXCLUDES source='system'. Those rows document how the admin
      // panel works — they exist so Veronika can ask the in-panel
      // assistant "how do I give a client gallery access?". They are
      // not facts about the photography business, and a customer
      // asking about wedding coverage must never be told how to use
      // the Journal panel. See migration 018.
      const contextRows = (await sql`
        SELECT category, label, content
        FROM ai_context
        WHERE active = TRUE AND source <> 'system'
        ORDER BY category, sort_order
      `) as Array<ContextRow>;

      // ── 12. Generate reply ───────────────────────────────────
      let replyText: string;
      try {
        replyText = await generateReply({
          contextRows,
          history,
          aiMessageCount: outboundAiMessages.length,
          mentionsDate: matchesDateIntent(latestInboundBody),
        });
      } catch (err) {
        console.error('[ai-reply] generation failed:', err);
        return {
          action: 'error-generation-failed',
          reason: err instanceof Error ? err.message : 'unknown',
        };
      }
      if (!replyText.trim()) {
        return { action: 'error-generation-failed', reason: 'empty reply' };
      }

      // ── 13. Send via IG API ──────────────────────────────────
      const sendResult = await sendIgTextMessage({
        recipientIgsid: convo.external_user_id,
        text: replyText,
      });
      if (!sendResult.ok) {
        return {
          action: 'error-send-failed',
          reason: sendResult.error ?? `HTTP ${sendResult.statusCode}`,
        };
      }

      // ── 14. Persist outbound row ─────────────────────────────
      await sql`
        INSERT INTO messages (
          conversation_id, direction, sender, channel, body,
          external_message_id, sent_at, ai_model
        )
        VALUES (
          ${convo.id}, 'outbound', 'ai',
          -- Derived from the conversation rather than hardcoded, so this
          -- stays correct when the reply engine gains non-Instagram
          -- channels. messages.channel is NOT NULL (migration 017).
          (SELECT platform FROM conversations WHERE id = ${convo.id}),
          ${replyText},
          ${sendResult.externalMessageId ?? null}, NOW(), ${OPENAI_MODEL}
        )
        ON CONFLICT (external_message_id) DO NOTHING
      `;

      return { action: 'sent-ai-reply', outboundBody: replyText };
    } finally {
      // Only release if we actually acquired the claim (the fail-
      // open path above leaves claimAcquired=false, in which case
      // the DELETE would also throw 42P01 and just add noise).
      // Swallow any DELETE failure — we don't want a cleanup error
      // to mask the real return value we're about to hand back.
      // Worst case a stuck claim row lingers; the next inbound in
      // this conversation will be blocked until it's cleared
      // manually, via a conversation reset (which clears the claim
      // in _messages-reset.ts), or via the ON DELETE CASCADE if
      // the conversation itself is deleted. If we start seeing
      // stuck claims in the wild, add a periodic sweep of
      // ai_reply_intents where claimed_at < NOW() - INTERVAL '5 minutes'.
      if (claimAcquired) {
        try {
          await sql`
            DELETE FROM ai_reply_intents
            WHERE conversation_id = ${convo.id}
          `;
        } catch (releaseErr) {
          console.error(
            '[ai-reply] failed to release ai_reply_intents claim:',
            releaseErr,
          );
        }
      }
    }
  } catch (err) {
    console.error('[ai-reply] pipeline error:', err);
    return {
      action: 'error-generation-failed',
      reason: err instanceof Error ? err.message : 'unknown',
    };
  }
}

/**
 * Send a pre-written bridge / handoff message from the ai_context
 * table and flip the conversation's ai_enabled to false so Vero
 * takes over from here. Used for booking intent, spam, and wrap-up.
 */
async function sendBridgeAndEscalate(
  sql: ReturnType<typeof getDb>,
  convo: Conversation,
  contextCategory: 'booking_bridge' | 'escalation_wrap_up',
  action: ReplyResult['action'],
  reason: string,
): Promise<ReplyResult> {
  const bridgeRows = (await sql`
    SELECT content FROM ai_context
    WHERE category = ${contextCategory} AND active = TRUE
    ORDER BY sort_order
    LIMIT 1
  `) as Array<{ content: string }>;
  const bridgeText =
    bridgeRows[0]?.content ??
    'Thanks so much for reaching out! Vero will personally get back to you shortly.';

  const send = await sendIgTextMessage({
    recipientIgsid: convo.external_user_id,
    text: bridgeText,
  });

  if (!send.ok) {
    console.error(`[ai-reply] bridge send failed (${action}): ${send.error}`);
    return { action: 'error-send-failed', reason: send.error };
  }

  // Persist outbound row, then flip ai_enabled to false so this
  // conversation stays quiet until Vero re-engages via admin UI.
  await sql`
    INSERT INTO messages (
      conversation_id, direction, sender, channel, body,
      external_message_id, sent_at
    )
    VALUES (
      ${convo.id}, 'outbound', 'ai',
      -- See the note on the reply INSERT above: channel is NOT NULL and
      -- is derived from the conversation, not hardcoded to instagram.
      (SELECT platform FROM conversations WHERE id = ${convo.id}),
      ${bridgeText},
      ${send.externalMessageId ?? null}, NOW()
    )
    ON CONFLICT (external_message_id) DO NOTHING
  `;
  await sql`
    UPDATE conversations
    SET ai_enabled = FALSE, updated_at = NOW()
    WHERE id = ${convo.id}
  `;

  return { action, reason, outboundBody: bridgeText };
}

/**
 * Whole-phrase match that works for Latin AND Cyrillic.
 *
 * `String.includes` was catastrophic here: "fee" matched "feel" and
 * "feel free", "rate" matched "grateful"/"celebrate"/"corporate", "book"
 * matched "Facebook", and Russian "сколько" ("how many") matched
 * "сколько человек". Seven out of eight ordinary opening messages
 * tripped the booking bridge, which sent a canned deferral and switched
 * the AI off for that conversation permanently — half of Vero's threads
 * ended up with ai_enabled=false from false positives alone.
 *
 * JS `\b` is ASCII-only, so it silently fails on Cyrillic. Unicode
 * property escapes with lookaround give a real word boundary for both
 * alphabets.
 */
function containsPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(haystack);
}

function matchesBookingIntent(text: string): boolean {
  return BOOKING_INTENT_KEYWORDS.some((kw) => containsPhrase(text, kw));
}

function matchesDateIntent(text: string): boolean {
  return DATE_INTENT_PATTERNS.some((re) => re.test(text));
}


/**
 * Detects agency / solicitation / sales-pitch DMs. Bias toward
 * silence: false positives (a real client whose message vaguely
 * matches a pattern) cost us "AI didn't reply, Vero handles manually
 * as usual" — no drama. False negatives cost us a context-deaf reply
 * that embarrasses Vero (see the "your website is outdated…" example
 * that triggered this filter).
 */
function matchesSpamSolicitation(text: string): boolean {
  return SPAM_SOLICITATION_PATTERNS.some((re) => re.test(text));
}

/**
 * A message is "truly empty" if it has no substantive content —
 * pure emojis, punctuation only, whitespace, or a single character.
 * We stay silent on these because there's genuinely nothing to
 * respond to, not because we're guessing the sender is a friend.
 * A short "hey" alone will pass this filter — the AI's conservative
 * prompt handles it appropriately with a brief opener.
 */
function isEmptyOrEmojiOnly(text: string): boolean {
  const trimmed = text.trim();
  // Empty / whitespace only
  if (trimmed.length === 0) return true;
  // Single character (probably a typo)
  if (trimmed.length === 1) return true;
  // No letters in any of our supported scripts → pure emoji/punct
  if (!/[a-zA-Zа-яА-ЯёЁ]/.test(trimmed)) return true;
  return false;
}

/**
 * Basic spam detection: if the last 3+ inbound messages are all
 * substantially the same (Jaccard similarity of word sets), it's
 * probably a bot or a frustrated user hitting send repeatedly.
 * Escalate to Vero rather than reply.
 */
function looksLikeSpam(inbound: Message[]): boolean {
  if (inbound.length < 3) return false;
  const recent = inbound.slice(-3);
  const [a, b, c] = recent.map((m) => wordSet(m.body));
  return jaccard(a, b) > 0.7 && jaccard(b, c) > 0.7;
}

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9а-яё\s]/gi, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

interface GenerateArgs {
  contextRows: ContextRow[];
  history: Message[];
  aiMessageCount: number;
  /**
   * Whether the message being replied to names a date. Dates used to be
   * intercepted before generation ever ran; now they reach the model, so
   * the "never confirm availability" rail is emphasized per-message
   * rather than relying on a rule buried in a long prompt.
   */
  mentionsDate: boolean;
}

async function generateReply(args: GenerateArgs): Promise<string> {
  const client = getOpenAI();

  const systemPrompt = buildSystemPrompt(
    args.contextRows,
    args.aiMessageCount,
    args.mentionsDate,
  );

  // Feed conversation history as alternating user/assistant messages.
  // 'contact' = user, 'ai' = assistant, 'human' = assistant too
  // (Vero's own manual replies still count as our side).
  const chatMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];
  for (const m of args.history) {
    chatMessages.push({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.body,
    });
  }

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: chatMessages,
    // Keep replies short and warm — the tone context also asks for
    // this but the parameter enforces it as a hard cap.
    max_tokens: 300,
    temperature: 0.7,
  });

  return response.choices[0]?.message?.content?.trim() ?? '';
}

function buildSystemPrompt(
  contextRows: ContextRow[],
  aiMessageCount: number,
  mentionsDate: boolean,
): string {
  // Group context rows by category for clean prompt structure.
  const byCategory = new Map<string, ContextRow[]>();
  for (const row of contextRows) {
    if (!byCategory.has(row.category)) byCategory.set(row.category, []);
    byCategory.get(row.category)!.push(row);
  }

  const identityRows = byCategory.get('identity') ?? [];
  const assistantName =
    identityRows.find((r) => r.label === 'Assistant name')?.content ?? "Vero's Assistant";
  // First-message intro template — Vero edits this via the Assistant
  // tab. If empty, the AI just introduces itself with the name.
  const firstMessageIntro =
    identityRows.find((r) => r.label === 'First-message intro')?.content ?? '';

  const contextSections: string[] = [];
  for (const [cat, rows] of byCategory.entries()) {
    if (cat === 'booking_bridge' || cat === 'escalation_wrap_up' || cat === 'identity') {
      // These are used elsewhere, not in the system prompt
      continue;
    }
    const heading = cat.replace(/_/g, ' ').toUpperCase();
    const bullets = rows.map((r) => `- ${r.content}`).join('\n');
    contextSections.push(`## ${heading}\n${bullets}`);
  }

  // Website CTA hint — the AI decides when to weave it in naturally
  // (usually after ~2 exchanges when the conversation has warmed).
  const websiteCtaHint =
    aiMessageCount >= 2
      ? 'You may naturally mention vero.photography once during this exchange if it fits (portfolio link).'
      : 'Do NOT mention the website in your first 1-2 replies — feels salesy. Save it for once the conversation has warmed.';

  // First-message greeting guidance — includes Vero's edited intro
  // template if she has one, so what she writes in the Assistant tab
  // actually shapes the greeting the customer receives.
  const introGuidance = firstMessageIntro
    ? `On your FIRST reply of the conversation, use this greeting template as your style/tone reference (adapt lightly for the specific message you're responding to, keep it brief, don't quote verbatim if it doesn't fit — but preserve the identity + spirit):

"${firstMessageIntro}"

Then, in the same message, briefly address whatever the customer actually asked. Don't re-introduce in subsequent replies.`
    : `On your FIRST reply of the conversation, introduce yourself briefly as "${assistantName}" (one sentence) and then address whatever the customer asked. Don't re-introduce in subsequent replies.`;

  // The current message names a date. Dates used to be intercepted
  // before the model ever ran; now they reach it, so the guardrail has
  // to be loud at exactly the moment it matters.
  const dateWarning = mentionsDate
    ? ' **The message you are replying to mentions a specific date — this rule is live right now.**'
    : '';

  return `You are ${assistantName} — an AI assistant helping Vero manage her Instagram inbox while she's shooting.

## WHO YOU ARE (never violate)
- You are NOT Vero. You're her AI assistant.
- Always refer to yourself as "I" and to Vero in the third person ("Vero will follow up", "Vero prefers...").
- ${introGuidance}

## HARD BEHAVIORAL RULES (these are safety rails — never break them)
1. **NEVER confirm availability on a specific date.** If a customer names a date, acknowledge it as noted — never "great!", "that works!", "she's free" or anything implying it's held. Only Vero confirms dates.${dateWarning}
2. **Pricing: give RANGES, never a firm quote.** You MAY share the figures in KNOWN FACTS below, always framed as a starting point or a range — "sessions typically start around X", "wedding coverage runs roughly X–Y". Then explain that the exact number depends on the specifics and ask for what's missing: number of people, location and travel distance, and how many hours of coverage. NEVER state a final total, and never invent a figure that isn't in KNOWN FACTS. If you have no relevant figure, say Vero will follow up with a quote.
3. **You SHOULD be helpful and ask good questions.** Answer what you can from KNOWN FACTS, and gather what Vero will need — session type, guest count, rough location and travel, timeframe, the kind of look they're after. Suggesting options that appear in KNOWN FACTS is fine and encouraged. What you must NOT do is invent creative direction, promise a specific artistic outcome, or claim details that aren't written below.
4. **NEVER commit to deliverables or timing** beyond what's in KNOWN FACTS.
5. When you genuinely don't know, say so and hand off — but only after answering what you DO know. "Let me pass this to Vero" as a reply to a question you have the facts for is a failure, not a safe default.

## KNOWN FACTS (only cite these — never invent details)
${contextSections.join('\n\n')}

## TONE
- **Brief.** 1-2 sentences per reply, maximum. Never wall-of-text.
- Match the customer's energy — brief if brief, thoughtful if they're thoughtful (but still short).
- Warm and professional but NOT effusive. Avoid "amazing!", "wonderful!", "absolutely!" — those sound robotic AND can imply commitment.
- Prefer "got it", "thanks for sharing", "noted" as acknowledgments.
- Emojis sparingly (max one per reply, when it fits naturally). Not required.
- Use the customer's first name once, if they've shared it. Don't repeat.
- Match the customer's language (English, Russian, or whatever they wrote in).

## STYLE GUIDE
- ${websiteCtaHint}
- If someone asks a question you have a KNOWN FACT for → answer it, then ask ONE follow-up that moves things forward.
- If someone asks something you have no KNOWN FACT for → brief acknowledgment + "Vero will follow up personally on that."
- Answer AND gather. Do not withhold information you have in order to route the customer to Vero — she added those facts so they would get used.

## THE GOAL
Be genuinely useful on the first reply, and leave Vero a warm lead with the details already collected. Answer what you can from KNOWN FACTS, give ranges rather than quotes, and gather the specifics a real quote depends on. You're a knowledgeable first responder — not a salesperson, and not a wall that forwards everything to Vero.

Now respond to the most recent customer message.`;
}
