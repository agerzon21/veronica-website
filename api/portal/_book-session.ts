/**
 * POST /api/portal/book-session
 *   { email, password, kind, when?, note? }
 *   -> 200 { success }
 *
 * "Book another session" in the portal (2026-10-22). A signed-in client asks
 * for another shoot without starting over: it lands where every enquiry
 * lands, as a lead and a message in the client's own email thread in
 * Messages, and Vero gets the same new-lead email as from the contact form.
 * She replies from the panel, then adds the session to this account with
 * "Add a session for this client", which needs no new email or password.
 *
 * No auto-reply and no AI draft-and-send: the client is signed in and sees
 * the confirmation on screen, and this is a returning client Vero answers
 * herself.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkPortalPassword } from './_password.js';
import { portalKeys, recordFailure, throttled, tooManyAttempts } from './_throttle.js';
import { getDb } from '../_db.js';
import { requestedSession } from './_account.js';
import { sendLeadNotification, type ContactPayload } from '../_auto-reply.js';
import { recordContactSubmission } from '../_inbox-record.js';

const WRONG_AUTH_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clip = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const requestedId = requestedSession(req.body);
  const password = typeof req.body?.password === 'string' ? req.body.password.trim() : '';
  const kind = clip(req.body?.kind, 60);
  const when = clip(req.body?.when, 200);
  const note = clip(req.body?.note, 2000);

  if (!email || !password) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return res.status(401).json({ success: false, error: 'Email and password required' });
  }
  if (!kind) {
    return res.status(400).json({ success: false, error: 'Choose what kind of session.' });
  }

  try {
    const sql = getDb();
    const throttleKeys = portalKeys(req, email);
    const gate = await throttled(sql, throttleKeys);
    if (gate.blocked) {
      res.setHeader('Retry-After', String(gate.retryAfterSec));
      return res.status(429).json({ success: false, error: tooManyAttempts(gate.retryAfterSec) });
    }

    // Same lookup as every portal endpoint (see _account.ts).
    const rows = (await sql`
      select id, client_password_hash, client_email, partner_1_full_name, partner_1_first_name
      from client_portals
      where mode = 'full'
        and lower(client_email) = ${email}
        and (${requestedId}::uuid is null or id = ${requestedId}::uuid)
      order by (client_password_hash is null), created_at desc
      limit 1
    `) as Array<{
      id: string;
      client_password_hash: string | null;
      client_email: string;
      partner_1_full_name: string | null;
      partner_1_first_name: string | null;
    }>;
    const row = rows[0];
    if (!checkPortalPassword(password, row?.client_password_hash).ok || !row) {
      await recordFailure(sql, throttleKeys);
      await sleep(WRONG_AUTH_DELAY_MS);
      return res.status(401).json({ success: false, error: 'Incorrect email or password' });
    }

    // Three a day per login is plenty for a real request and caps a stuck
    // button or a script: each one is a lead, a message and an email to Vero.
    const recent = (await sql`
      select count(*)::int as n from contact_submissions
      where lower(email) = ${email} and message like 'Sent from the client portal%'
        and created_at > now() - interval '24 hours'
    `) as Array<{ n: number }>;
    if ((recent[0]?.n ?? 0) >= 3) {
      return res.status(429).json({
        success: false,
        error: 'Veronika already has your requests from today. She will reply by email.',
      });
    }

    // The person's name. Never client_display_name: that is Vero's label for
    // the booking ("Senior Photos"), and the thread's contact name is set from
    // this.
    const name = row.partner_1_full_name || row.partner_1_first_name || email;
    const message = [
      'Sent from the client portal by an existing client: "Book another session".',
      when ? `Roughly when: ${when}` : null,
      note ? `\n${note}` : null,
    ]
      .filter(Boolean)
      .join('\n');
    const data: ContactPayload = { name, email: row.client_email, shoot_type: kind, date: when || undefined, message };

    // A lead, like any enquiry, so it is counted and shown where leads are.
    let submissionId: string | null = null;
    try {
      const ins = (await sql`
        insert into contact_submissions (name, email, shoot_type, package, preferred_date, location, message)
        values (${data.name}, ${data.email}, ${kind}, ${null}, ${when || null}, ${null}, ${message})
        returning id
      `) as Array<{ id: string }>;
      submissionId = ins[0]?.id ?? null;
    } catch (err) {
      console.error('[portal/book-session] could not log the lead (continuing):', err);
    }

    // And a message in the client's own email thread in Messages, linked to
    // this booking if the thread is not linked to one yet.
    const recorded = await recordContactSubmission({ submissionId, data });
    if (recorded.conversationId) {
      try {
        await sql`
          update conversations set linked_client_portal_id = ${row.id}, updated_at = now()
          where id = ${recorded.conversationId} and linked_client_portal_id is null
        `;
      } catch (err) {
        console.error('[portal/book-session] could not link the thread (continuing):', err);
      }
    }

    // Vero's new-lead email. A failure here must not tell the client it
    // failed: the request is already in Messages.
    try {
      await sendLeadNotification(data);
    } catch (err) {
      console.error('[portal/book-session] lead notification failed (the request is in Messages):', err);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[portal/book-session] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Could not send that. Please try again, or message Veronika directly.' });
  }
}
