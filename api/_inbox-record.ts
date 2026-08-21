/**
 * Records a contact-form submission into the unified inbox.
 *
 * Called from api/contact.ts after the submission has been persisted and
 * the auto-reply sent. Produces the same conversation shape the email
 * webhook produces, so a form submission and a later direct email from
 * the same person land in ONE thread — the conversation is keyed on the
 * sender's address, and the form gave us that address.
 *
 * Best-effort by design. Every failure path here is caught and logged,
 * never rethrown: the client already has their auto-reply and the lead
 * row is already in `contact_submissions`. Losing the inbox mirror is a
 * cosmetic problem, and it must not turn a successful submission into a
 * 500 for the person filling out the form.
 */

import { getDb } from './_db.js';
import { FROM_ADDRESS, type ContactPayload } from './_auto-reply.js';

export interface RecordResult {
  conversationId: string | null;
  /** The inbound row we created for the submission, for the AI to act on. */
  inboundMessageId: string | null;
  inboundSentAt: string | null;
}

export interface RecordArgs {
  /** contact_submissions.id — NULL if that insert failed. */
  submissionId: string | null;
  data: ContactPayload;
  /**
   * The auto-reply's real SMTP Message-ID (normalized, no angle
   * brackets), if it went out. NOT Resend's tracking id — this value is
   * what api/admin/_messages-send.ts threads Vero's later reply against,
   * so it has to be a genuine RFC 5322 msg-id or the reply arrives
   * detached from the confirmation the client already has.
   */
  autoReplyMessageId?: string | null;
  /** Rendered plaintext of the auto-reply, so the thread reads correctly. */
  autoReplyText?: string | null;
}

/**
 * Render the form fields as a message body.
 *
 * Mirrors migration 017's backfill SQL exactly — the two must agree or
 * imported history and live submissions will look different in the same
 * inbox.
 */
export function buildSubmissionBody(data: ContactPayload): string {
  const lines: string[] = [`Name: ${data.name}`, `Email: ${data.email}`];
  if (data.shoot_type?.trim()) lines.push(`Shoot type: ${data.shoot_type.trim()}`);
  if (data.date?.trim()) lines.push(`Preferred date: ${data.date.trim()}`);
  if (data.location?.trim()) lines.push(`Location: ${data.location.trim()}`);
  if (data.message?.trim()) lines.push('', data.message.trim());
  return lines.join('\n');
}

export function buildSubmissionSubject(data: ContactPayload): string {
  const shoot = data.shoot_type?.trim();
  return shoot ? `Contact form inquiry — ${shoot}` : 'Contact form inquiry';
}

/**
 * Upsert the conversation, append the inbound submission, and — if the
 * auto-reply went out — append that as an outbound message too.
 *
 * Recording the auto-reply matters for more than display. api/_ai-reply.ts
 * skips a conversation when an outbound already exists after the newest
 * inbound, so storing it is exactly what stops the AI assistant from
 * firing a second message at someone who was just auto-replied to.
 *
 * The auto-reply is stored with sender='ai' (machine-generated, not
 * something Veronika typed) and ai_model=NULL, which distinguishes a
 * template send from a real LLM reply.
 */
export async function recordContactSubmission(args: RecordArgs): Promise<RecordResult> {
  const empty: RecordResult = {
    conversationId: null,
    inboundMessageId: null,
    inboundSentAt: null,
  };
  const email = (args.data.email || '').trim().toLowerCase();
  if (!email) return empty;

  try {
    const sql = getDb();

    const convoRows = (await sql`
      INSERT INTO conversations (platform, external_user_id, contact_name, contact_handle)
      VALUES ('email', ${email}, ${args.data.name || null}, ${email})
      ON CONFLICT (platform, external_user_id) DO UPDATE
        SET contact_name = COALESCE(EXCLUDED.contact_name, conversations.contact_name),
            updated_at = NOW()
      RETURNING id
    `) as Array<{ id: string }>;

    const conversationId = convoRows[0]?.id;
    if (!conversationId) {
      console.error('[inbox-record] no conversation id returned');
      return empty;
    }

    // Deterministic id keyed on the submission row so a retry can't
    // double-record. Falls back to a time-based key when the
    // contact_submissions insert failed — still unique, just not
    // reconcilable with a lead row.
    const externalId = args.submissionId
      ? `form:${args.submissionId}`
      : `form:orphan:${Date.now()}:${email}`;

    const inboundRows = (await sql`
      INSERT INTO messages (
        conversation_id, direction, sender, channel, body,
        external_message_id, from_address, subject, sent_at
      )
      VALUES (
        ${conversationId}, 'inbound', 'contact', 'form',
        ${buildSubmissionBody(args.data)}, ${externalId}, ${email},
        ${buildSubmissionSubject(args.data)}, NOW()
      )
      ON CONFLICT (external_message_id) DO NOTHING
      RETURNING id, sent_at
    `) as Array<{ id: string; sent_at: string }>;

    if (args.autoReplyMessageId && args.autoReplyText) {
      await sql`
        INSERT INTO messages (
          conversation_id, direction, sender, channel, body,
          external_message_id, from_address, subject, sent_at
        )
        VALUES (
          ${conversationId}, 'outbound', 'ai', 'email',
          ${args.autoReplyText}, ${args.autoReplyMessageId}, ${FROM_ADDRESS},
          ${`Re: Your ${args.data.shoot_type || 'Photography'} Inquiry`}, NOW()
        )
        ON CONFLICT (external_message_id) DO NOTHING
      `;
    }

    // Link the lead row to its thread so the admin UI can move between
    // the structured lead view and the conversation.
    if (args.submissionId) {
      await sql`
        UPDATE contact_submissions
        SET conversation_id = ${conversationId}
        WHERE id = ${args.submissionId} AND conversation_id IS NULL
      `;
    }

    console.log(
      `[inbox-record] recorded submission for ${email} → conversation ${conversationId}`,
    );
    return {
      conversationId,
      inboundMessageId: inboundRows[0]?.id ?? null,
      inboundSentAt: inboundRows[0]?.sent_at ?? null,
    };
  } catch (err) {
    console.error('[inbox-record] failed (non-fatal):', err);
    return empty;
  }
}
