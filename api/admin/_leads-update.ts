/**
 * Admin: update a lead — status flip and/or notes edit.
 *
 * POST { password, id, status?, notes?, contacted_at? }
 *   → 200 { success, lead }
 *   → 400 missing id / invalid status
 *   → 401 bad password
 *   → 404 no such lead
 *
 * Deliberately narrow surface: only the three fields Vero manages from
 * the admin panel are updatable. Immutable fields (name, email,
 * shoot_type, preferred_date, location, message, created_at) come from
 * the submitter and must never be edited — if they were, the audit
 * trail of what the lead actually said becomes fiction.
 *
 * All three fields are optional; a POST with only `id` is a no-op
 * (returns the row unchanged). This lets the UI send a partial patch
 * without stitching a full object.
 *
 * requireAdmin, NOT requireSuper — status flips + notes are Vero's
 * daily workflow. Deletion is super-only (see _leads-delete.ts).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';

// App-level enum for the status field. Kept out of the DB CHECK constraint
// (see 014-contact-submissions.sql header) so we can add new statuses
// without a migration — but the API still enforces the allow-list so
// nobody smuggles arbitrary strings into the column via the admin UI.
const ALLOWED_STATUSES = [
  'new',
  'contacted',
  'replied',
  'booked',
  'ghosted',
  'spam',
] as const;
type Status = (typeof ALLOWED_STATUSES)[number];

type Row = {
  id: string;
  name: string;
  email: string;
  shoot_type: string | null;
  preferred_date: string | null;
  location: string | null;
  message: string | null;
  status: string;
  notes: string | null;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  if (!id) return res.status(400).json({ success: false, error: 'id is required' });

  // Status — validate against the allow-list if present. Missing means
  // "don't touch this field."
  let nextStatus: Status | undefined;
  if (req.body?.status !== undefined) {
    const raw = typeof req.body.status === 'string' ? req.body.status.trim().toLowerCase() : '';
    if (!(ALLOWED_STATUSES as readonly string[]).includes(raw)) {
      return res.status(400).json({
        success: false,
        error: `status must be one of ${ALLOWED_STATUSES.join(', ')}`,
      });
    }
    nextStatus = raw as Status;
  }

  // Notes — empty string is a real value ("clear the notes"), not
  // "leave alone." Only `undefined` means don't touch.
  const notesProvided = req.body?.notes !== undefined;
  const nextNotes: string | null = notesProvided
    ? typeof req.body.notes === 'string' && req.body.notes.trim()
      ? req.body.notes.trim()
      : null
    : null;

  // contacted_at — nullable timestamp. Accept ISO string OR the sentinel
  // 'now' (server-side NOW()) so the UI can set it without shipping a
  // timestamp from the browser (which would be in the visitor's clock).
  // Passing null clears it.
  const contactedProvided = req.body?.contacted_at !== undefined;
  let contactedIso: string | null = null;
  let contactedNow = false;
  if (contactedProvided) {
    const raw = req.body.contacted_at;
    if (raw === null) {
      contactedIso = null;
    } else if (raw === 'now' || raw === 'NOW()') {
      contactedNow = true;
    } else if (typeof raw === 'string') {
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ success: false, error: 'contacted_at is not a valid timestamp' });
      }
      contactedIso = parsed.toISOString();
    } else {
      return res.status(400).json({ success: false, error: 'contacted_at must be a timestamp, null, or "now"' });
    }
  }

  try {
    const sql = getDb();

    // Build the UPDATE dynamically with COALESCE-of-existing where the
    // caller didn't send a field. Neon's sql`` tag doesn't compose easily
    // for optional SETs, so we branch on the combination that's present.
    // Keeps the query set finite (2^3 = 8 branches) but each is trivial;
    // the alternative is a plpgsql helper which is more moving parts.
    //
    // The updated_at trigger fires on any UPDATE, so we don't need to
    // set it manually.
    //
    // contacted_at semantics: "first outbound reply." Once set, we never
    // overwrite it — otherwise a race between two admin tabs would let
    // the later-saving tab clobber the first-contact timestamp with a
    // newer NOW(), which would poison the "average lead response time"
    // analytic this column exists to enable. The COALESCE(contacted_at,
    // NOW()) guard is the first-writer-wins invariant.
    // Explicit-timestamp branch (contactedIso) is different — that's an
    // admin deliberately overriding, so we honor it verbatim.
    const rows = (await sql`
      UPDATE contact_submissions
      SET
        status = COALESCE(${nextStatus ?? null}, status),
        notes = CASE WHEN ${notesProvided} THEN ${nextNotes} ELSE notes END,
        contacted_at = CASE
          WHEN ${contactedNow} THEN COALESCE(contacted_at, NOW())
          WHEN ${contactedProvided} THEN ${contactedIso}
          ELSE contacted_at
        END
      WHERE id = ${id}
      RETURNING
        id,
        name,
        email,
        shoot_type,
        preferred_date,
        location,
        message,
        status,
        notes,
        contacted_at,
        created_at,
        updated_at
    `) as Row[];

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Lead not found' });
    }

    return res.status(200).json({ success: true, lead: rows[0] });
  } catch (err) {
    console.error('[admin/leads-update] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
