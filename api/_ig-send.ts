/**
 * Send a text message on Instagram via the Graph API.
 *
 * Uses the same `me/messages` endpoint that Meta's messaging platform
 * expects. `me` resolves to whichever account owns the IG_ACCESS_TOKEN
 * — i.e., vero.art.photo in production.
 *
 * Meta enforces a 24-hour window: we can only send messages to users
 * who have messaged us within the last 24 hours (with a few narrow
 * exceptions for message tags). All AI replies + Vero's manual replies
 * from the admin inbox are always within this window because they're
 * responses to real inbound messages.
 *
 * Rate limits: Meta has undocumented but real limits. GPT-4o-mini
 * replies are short enough that we won't hit them at expected volume.
 * If we ever start seeing 429s we'll add backoff + queue.
 */

const IG_GRAPH_BASE = 'https://graph.instagram.com/v21.0';

// Hard cap on how long we'll wait for Meta's Graph API to respond.
// Meta's typical send latency is well under 2s; 10s is comfortable
// headroom but cleanly cuts off pathological hangs.
//
// Why this matters: the send is called from inside a waitUntil() in
// api/inbox/_ig-webhook.ts. Meta's ACK of our webhook already went
// out — but the outbound row is only INSERTed AFTER this send returns.
// If Meta hangs past Vercel's maxDuration:60 cap, the function is
// killed with the outbound row uncommitted; the customer received the
// reply but the admin thread is missing it, and Vero might reply
// manually → double-send. AbortSignal.timeout aborts cleanly at 10s
// so the caller can see a real error and skip the INSERT if we don't
// know whether Meta actually accepted our message.
const IG_SEND_TIMEOUT_MS = 10_000;

export interface IgSendResult {
  ok: boolean;
  externalMessageId?: string;
  error?: string;
  statusCode?: number;
}

/**
 * Send a plain text message to a specific Instagram user (identified
 * by their IGSID — the scoped ID Meta gave us in the inbound webhook).
 *
 * Returns the message ID Meta assigns so we can store it on the
 * outbound row for dedup / correlation. On failure returns error
 * details so the caller can decide whether to retry or escalate.
 */
export async function sendIgTextMessage(args: {
  recipientIgsid: string;
  text: string;
}): Promise<IgSendResult> {
  const token = process.env.IG_ACCESS_TOKEN;
  if (!token) {
    return { ok: false, error: 'IG_ACCESS_TOKEN env var missing' };
  }

  const url = `${IG_GRAPH_BASE}/me/messages?access_token=${encodeURIComponent(token)}`;
  const body = {
    recipient: { id: args.recipientIgsid },
    // Message text — Meta will chunk into multiple bubbles if it's
    // longer than a certain threshold, but for AI replies we keep
    // them short anyway.
    message: { text: args.text },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // See IG_SEND_TIMEOUT_MS docs at the top of this file.
      // AbortSignal.timeout is native Node 18+ / modern browsers;
      // Vercel serverless runs Node 20+ so this is supported without
      // a polyfill. On timeout, fetch rejects with a DOMException
      // (name: 'TimeoutError'), which lands in the catch below and
      // surfaces to the caller as { ok: false, error: '...' }.
      signal: AbortSignal.timeout(IG_SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(
        `[ig-send] IG API ${res.status}: ${errText}`,
      );
      return { ok: false, statusCode: res.status, error: errText || `HTTP ${res.status}` };
    }

    const data = (await res.json()) as {
      recipient_id?: string;
      message_id?: string;
    };

    return {
      ok: true,
      externalMessageId: data.message_id,
    };
  } catch (err) {
    // AbortSignal.timeout throws a TimeoutError DOMException — surface
    // it distinctly so callers see 'timeout' vs a generic network
    // error in the ai_reply action reason field.
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    if (isTimeout) {
      console.error(`[ig-send] fetch timed out after ${IG_SEND_TIMEOUT_MS}ms`);
      return { ok: false, error: `IG send timed out after ${IG_SEND_TIMEOUT_MS}ms` };
    }
    console.error('[ig-send] fetch failed:', err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
