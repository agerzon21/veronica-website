/**
 * Send a text message on WhatsApp via the Cloud API.
 *
 * Deliberately shaped like api/_ig-send.ts, because api/_reply-delivery.ts
 * treats the two as interchangeable and any difference in the result shape
 * would show up as a channel that silently fails to record what it sent.
 * Same three guarantees: never throw, always say whether Meta accepted it,
 * and hand back the id Meta assigned so the outbound row can be deduped.
 *
 * ── WHAT IS DIFFERENT FROM INSTAGRAM, AND WHY IT MATTERS ────────────────
 *
 * 1. The endpoint is per PHONE NUMBER, not `me`. Instagram's token resolves
 *    to one account, so `me/messages` is unambiguous. A WhatsApp Business
 *    Account can own several numbers on one token, so the number's id is
 *    part of the URL. Getting it wrong does not error in a useful way: the
 *    message sends FROM THE WRONG NUMBER, and the customer sees a reply
 *    from a business they never messaged.
 *
 * 2. The recipient is a plain phone number ("wa_id"), digits only, no '+'.
 *    Meta echoes it in that form on every inbound, and
 *    api/inbox/_whatsapp-webhook.ts stores exactly what Meta sent, so
 *    external_user_id is already correct. toWaId() is applied anyway,
 *    because a row could also have been created by hand from a client's
 *    phone field, which IS stored with a '+'.
 *
 * 3. The 24-hour window is enforced HARDER than Instagram's. Outside it,
 *    only a pre-approved template can be sent, and a plain text send is
 *    rejected with error code 131047. That is not a bug to retry; it is a
 *    real state the UI has to explain, so the code is surfaced rather than
 *    flattened into "send failed".
 *
 * 4. Error 131026 means the number cannot receive WhatsApp messages at all
 *    (no WhatsApp account, or it cannot be reached). It is the only honest
 *    way to learn that a number is not on WhatsApp, since Meta offers no
 *    lookup, and it costs nothing. Also surfaced by code.
 */

const WHATSAPP_GRAPH_BASE = 'https://graph.facebook.com/v21.0';

/**
 * Hard cap on how long we wait for Meta.
 *
 * Same reasoning as IG_SEND_TIMEOUT_MS: the outbound row is INSERTed only
 * after this returns, so a hang past Vercel's function cap means the
 * customer got a message that no thread records, and Vero sends it again
 * by hand. Ten seconds is far past Meta's real latency and cuts off the
 * pathological case cleanly.
 */
const WHATSAPP_SEND_TIMEOUT_MS = 10_000;

/** Meta's cap on a text body. Longer is rejected outright. */
export const WHATSAPP_MAX_TEXT_LEN = 4096;

/** Outside the 24-hour customer service window; only templates allowed. */
export const WHATSAPP_ERR_OUTSIDE_WINDOW = 131047;
/** Recipient is not reachable on WhatsApp (no account, or blocked). */
export const WHATSAPP_ERR_NOT_ON_WHATSAPP = 131026;

export interface WhatsAppSendResult {
  ok: boolean;
  externalMessageId?: string;
  error?: string;
  statusCode?: number;
  /** Meta's own numeric error code, when it gave one. */
  metaCode?: number;
}

/** Digits only, no '+', which is the form Meta's API wants. */
function toWaDigits(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/**
 * Turn Meta's error envelope into something a human can act on.
 *
 * Meta's raw message for an expired window is "Message failed to send
 * because more than 24 hours have passed since the customer last replied
 * to this number", which is already good; for most other codes it is not.
 * Only the two codes worth a different DECISION get rewritten.
 */
function describe(code: number | undefined, metaMessage: string): string {
  if (code === WHATSAPP_ERR_OUTSIDE_WINDOW) {
    return 'WhatsApp only allows a free-text reply within 24 hours of the customer’s last message. That window has closed on this thread.';
  }
  if (code === WHATSAPP_ERR_NOT_ON_WHATSAPP) {
    return 'That number cannot receive WhatsApp messages. It may not have WhatsApp, or it may have blocked this business.';
  }
  return metaMessage;
}

/**
 * Send a plain text message to one WhatsApp user.
 *
 * `recipientWaId` is whatever the conversation row holds: Meta's wa_id, or
 * a phone number in any shape a human typed it. Returns Meta's message id
 * so the outbound row can carry it, and on failure returns the code as
 * well as the text, because two of the codes mean "this will never work"
 * rather than "try again".
 */
export async function sendWhatsAppTextMessage(args: {
  recipientWaId: string;
  text: string;
}): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    return { ok: false, error: 'WHATSAPP_ACCESS_TOKEN env var missing' };
  }
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    return { ok: false, error: 'WHATSAPP_PHONE_NUMBER_ID env var missing' };
  }

  const to = toWaDigits(args.recipientWaId);
  // A send to an empty or nonsense recipient would be a 400 from Meta with
  // a confusing message; refuse it here where the reason is obvious.
  if (to.length < 8) {
    return { ok: false, error: `Not a sendable WhatsApp number: '${args.recipientWaId}'` };
  }

  const url = `${WHATSAPP_GRAPH_BASE}/${encodeURIComponent(phoneNumberId)}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    // preview_url false: a bare link in a reply must not expand into a
    // card. Vero's replies routinely carry a gallery link, and the card
    // renders the portal's login page, which reads as if the gallery is
    // locked when it is not.
    text: { preview_url: false, body: args.text },
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The token goes in the header, not the query string, unlike the
        // Instagram call above. Meta accepts both; the header keeps it out
        // of any URL that might get logged.
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(WHATSAPP_SEND_TIMEOUT_MS),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let metaCode: number | undefined;
      let metaMessage = errText || `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(errText) as {
          error?: { message?: string; code?: number; error_data?: { details?: string } };
        };
        metaCode = parsed.error?.code;
        metaMessage = parsed.error?.error_data?.details || parsed.error?.message || metaMessage;
      } catch {
        // Not JSON. Keep the raw text; it is still the best thing we have.
      }
      console.error(`[whatsapp-send] WA API ${res.status} (code ${metaCode ?? '?'}): ${errText}`);
      return {
        ok: false,
        statusCode: res.status,
        metaCode,
        error: describe(metaCode, metaMessage),
      };
    }

    const data = (await res.json()) as {
      messages?: Array<{ id?: string }>;
      contacts?: Array<{ wa_id?: string }>;
    };

    return {
      ok: true,
      // Meta returns a LIST because one call can address several numbers.
      // We always send one, so the first entry is ours.
      externalMessageId: data.messages?.[0]?.id,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'TimeoutError';
    if (isTimeout) {
      console.error(`[whatsapp-send] fetch timed out after ${WHATSAPP_SEND_TIMEOUT_MS}ms`);
      return { ok: false, error: `WhatsApp send timed out after ${WHATSAPP_SEND_TIMEOUT_MS}ms` };
    }
    console.error('[whatsapp-send] fetch failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
