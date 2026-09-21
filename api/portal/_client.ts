/**
 * Client Portal auth — email + password access for full client portal.
 *
 * POST { email, password }
 *   → 200 { success, ...full portal payload }    on hit
 *   → 401                                        on wrong email/password
 *   → 405                                        non-POST
 *
 * Two-factor-ish friction: requiring both an email AND a password is what
 * stops clients from casually handing their login to wedding guests. Anyone
 * they want to share photos with goes through the Gallery Pass tab instead.
 *
 * Returns the full client portal payload: contract status, payment info,
 * gallery files (once released), and the manageable Gallery Pass settings.
 * Client-side UI renders progressively based on what's populated.
 *
 * Photo data is gated. Until Vero marks the gallery delivered, drive_url is
 * null, the file lists are empty, and gallery_withheld is true. See
 * ./_gallery-gate.ts.
 *
 * Only `mode='full'` portals can log in here. `mode='simple'` portals have
 * no email/password, so any lookup against them is impossible by design.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkPortalPassword } from './_password.js';
import { isGalleryReleased } from './_gallery-gate.js';
import { getDb } from '../_db.js';
import { isStripeTestMode } from '../_stripe.js';
import { listFolderTree, extractFolderId, type FolderTree } from '../_drive.js';

const WRONG_AUTH_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type ClientPortalRow = {
  id: string;
  // Always 'full' here (the lookup filters on it), but selected rather than
  // assumed so isGalleryReleased is handed the row's real mode.
  mode: 'simple' | 'full';
  // Selected only to authenticate. Never returned — check the response object
  // below; neither field appears in it.
  client_password_hash: string | null;
  client_display_name: string | null;
  client_email: string | null;
  drive_url: string | null;
  // Session metadata — shown in the portal header so the client sees
  // what they booked at a glance (Wedding on {date} at {location},
  // delivery within {timeframe}). event_date + session_type live as
  // top-level columns; the more descriptive event_title,
  // event_location, and delivery_timeframe are stored inside the
  // contract_variables JSONB blob populated when Vero creates the
  // portal.
  event_date: string | null;
  session_type: string | null;
  // The contract TYPE, distinct from session_type. session_type is a display
  // label Vero can type freely (an "Other" booking might read "branding"), so
  // it cannot be trusted to decide wording. This is the key into
  // CONTRACT_TEMPLATES and is what tells the portal whether to say "Event
  // Date" or "Session Date". Legacy rows default to 'wedding'.
  contract_template_key: string | null;
  contract_variables: Record<string, string> | null;
  contract_status: 'none' | 'pending' | 'signed' | 'void';
  contract_signed_at: string | null;
  contract_body: string | null;
  contract_signed_pdf_url: string | null;
  contract_total_amount: string | null;
  contract_retainer_amount: string | null;
  paid_to_date: string;
  payment_plan_enabled: boolean;
  gallery_password: string;
  gallery_enabled: boolean;
  gallery_delivered_at: string | null;
  gallery_expires_at: string | null;
  // List of Drive file IDs the client has hearted. Postgres TEXT[]
  // column added in the favorites migration. `coalesce(..., '{}')` on
  // the select side means older rows without the column populated
  // come back as an empty array instead of null.
  favorite_photo_ids: string[] | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password =
    typeof req.body?.password === 'string' ? req.body.password.trim() : '';

  if (!email || !password) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return res.status(401).json({ success: false, error: 'Email and password required' });
  }

  try {
    const sql = getDb();
    const rows = (await sql`
      select id, mode, client_display_name, client_email, drive_url,
             event_date, session_type, contract_template_key, contract_variables,
             contract_status, contract_signed_at, contract_body, contract_signed_pdf_url,
             contract_total_amount, contract_retainer_amount, paid_to_date, payment_plan_enabled,
             gallery_password, gallery_enabled,
             gallery_delivered_at, gallery_expires_at,
             client_password_hash,
             coalesce(favorite_photo_ids, '{}') as favorite_photo_ids
      from client_portals
      where mode = 'full'
        and lower(client_email) = ${email}
      limit 1
    `) as ClientPortalRow[];

    // The password is no longer compared in SQL — it is hashed now, so the
    // check has to happen in code. Same 401 and same delay whether the email
    // was unknown or the password was wrong, so this cannot be used to
    // enumerate which addresses are clients.
    const candidate = rows[0];
    const check = candidate
      ? checkPortalPassword(password, candidate.client_password_hash)
      : { ok: false };

    if (!candidate || !check.ok) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return res.status(401).json({ success: false, error: 'Incorrect email or password' });
    }


    const row = rows[0];

    // Fetch payment installments if a payment plan is enabled.
    let installments: Array<{
      installment_number: number;
      amount: number;
      due_date: string;
      paid_at: string | null;
      paid_amount: number | null;
      payment_method: string | null;
    }> = [];
    if (row.payment_plan_enabled) {
      const inst = (await sql`
        select installment_number, amount, due_date, paid_at, paid_amount, payment_method
        from payment_installments
        where client_portal_id = ${row.id}
        order by installment_number asc
      `) as Array<{
        installment_number: number;
        amount: string;
        due_date: string;
        paid_at: string | null;
        paid_amount: string | null;
        payment_method: string | null;
      }>;
      installments = inst.map((i) => ({
        installment_number: i.installment_number,
        amount: parseFloat(i.amount),
        due_date: i.due_date,
        paid_at: i.paid_at,
        paid_amount: i.paid_amount ? parseFloat(i.paid_amount) : null,
        payment_method: i.payment_method,
      }));
    }

    // Fetch the payment-entry log so the client can see itemized
    // payments their photographer has logged (e.g. "Retainer received
    // via Zelle — Jun 25"). This is separate from `installments`,
    // which is for the planned Stripe-managed payment-plan flow.
    const paymentRows = (await sql`
      select id, amount, method, note, paid_at, kind
      from payment_entries
      where client_portal_id = ${row.id}
      order by paid_at desc, created_at desc
    `) as Array<{
      id: string;
      amount: string;
      method: string | null;
      note: string | null;
      paid_at: string;
      kind: string | null;
    }>;
    /**
     * Tips are in this list but are NOT part of the balance.
     *
     * The list is a history of money the client has sent, so leaving a tip out
     * of it would mean they paid something the portal never admits receiving.
     * But paid_to_date deliberately excludes them (migration 043), so a row
     * that reads the same as a payment while not counting like one would make
     * the arithmetic underneath look broken. Each row says which it is, and
     * the UI labels tip rows instead of quietly summing them.
     */
    const payments = paymentRows.map((p) => ({
      id: p.id,
      amount: parseFloat(p.amount),
      method: p.method,
      note: p.note,
      paid_at: p.paid_at,
      kind: p.kind === 'tip' ? ('tip' as const) : ('payment' as const),
    }));
    const tipsTotal = payments
      .filter((p) => p.kind === 'tip')
      .reduce((sum, p) => sum + p.amount, 0);

    /**
     * Charges added to the booking after the fact: extra time, and costs paid
     * on the day. The client sees these itemized, because a balance that grew
     * with no line explaining it is the thing this feature exists to prevent.
     *
     * Fetched in its own try/catch because migration 035 is applied by hand:
     * a portal must still open on a database that does not have the table
     * yet, and on such a database there are no charges anyway.
     *
     * Summed from the rows rather than read off client_portals.charges_total
     * so the total can never disagree with the lines shown beneath it.
     */
    let charges: Array<{
      id: string;
      amount: number;
      reason: string;
      note: string | null;
      charged_at: string;
    }> = [];
    try {
      const chargeRows = (await sql`
        select id, amount, reason, note, charged_at
        from portal_charges
        where client_portal_id = ${row.id}
        order by charged_at desc, created_at desc
      `) as Array<{
        id: string;
        amount: string;
        reason: string;
        note: string | null;
        charged_at: string;
      }>;
      charges = chargeRows.map((c) => ({
        id: c.id,
        amount: parseFloat(c.amount),
        reason: c.reason,
        note: c.note,
        charged_at: c.charged_at,
      }));
    } catch {
      /* pre-migration-035 database: nothing has been charged, so nothing shows */
    }
    const chargesTotal = charges.reduce((sum, c) => sum + c.amount, 0);

    // The release gate. A full portal's photos are served only after Vero
    // marks the gallery delivered, so pasting a Drive URL no longer publishes
    // anything. See api/portal/_gallery-gate.ts for why the predicate lives
    // in one place and why simple portals are out of scope.
    const galleryReleased = isGalleryReleased(row);

    // Try to list Drive files if gallery is ready. Same fall-through pattern
    // as /api/portal/gallery: a Drive listing failure is non-fatal because
    // the portal page can still show the contract / payment / "Open in Drive"
    // fallback link even without thumbnails.
    let tree: FolderTree = { rootFiles: [], sections: [] };
    let warning: string | undefined;

    if (galleryReleased && row.drive_url) {
      const folderId = extractFolderId(row.drive_url);
      if (folderId) {
        try {
          tree = await listFolderTree(folderId);
        } catch (err) {
          console.error('[portal/client] Drive listing failed:', err);
          warning = 'Could not load photo previews. Use "View in Drive" below.';
        }
      }
    }

    // Session-metadata fields for the portal header. contract_variables
    // is a JSONB blob with contract-template placeholders — we surface
    // the human-readable ones (title, location, delivery window). Kept
    // permissive: if the blob doesn't have a field or the whole thing
    // is null (older portals created before we started storing it),
    // the client just doesn't render that line.
    const vars = row.contract_variables ?? {};

    return res.status(200).json({
      success: true,
      mode: 'full',

      /**
       * Whether the deployed Stripe keys are TEST keys.
       *
       * The portal used to infer this from CARD_PAYMENTS_MODE, the ROLLOUT
       * flag, which is a different fact. The moment the live keys went in
       * while the rollout was still 'preview', the portal carried on telling
       * clients "no real money moves and a real card will be declined" over a
       * button that was by then charging real cards. A flag about who can see
       * the button cannot answer a question about which Stripe account is
       * behind it, so the server answers it instead.
       */
      card_test_mode: isStripeTestMode(),
      client_name: row.client_display_name,
      client_email: row.client_email,
      // Null until release, not "present but hidden": the Drive URL is the
      // photos. tree stays empty for the same reason, because it is never
      // fetched while the gate is closed.
      drive_url: galleryReleased ? row.drive_url : null,
      rootFiles: tree.rootFiles,
      sections: tree.sections,
      // Lets the portal say "not released yet" instead of rendering an empty
      // gallery that reads as a bug.
      gallery_withheld: !galleryReleased,
      warning,

      // Session metadata — shown in the portal header
      event_date: row.event_date,
      session_type: row.session_type,
      contract_template_key: row.contract_template_key ?? 'wedding',
      event_title: typeof vars.event_title === 'string' ? vars.event_title : null,
      event_location: typeof vars.event_location === 'string' ? vars.event_location : null,
      delivery_timeframe:
        typeof vars.delivery_timeframe === 'string' ? vars.delivery_timeframe : null,

      // Contract
      contract_status: row.contract_status,
      contract_signed_at: row.contract_signed_at,
      contract_body: row.contract_body,
      // We never return the raw blob URL to the client — it's not directly
      // accessible without the token. Surface only whether a signed PDF
      // exists; the UI uses /api/portal/download-contract to fetch it.
      contract_signed_pdf_available: !!row.contract_signed_pdf_url,

      // Payment
      contract_total_amount: row.contract_total_amount ? parseFloat(row.contract_total_amount) : null,
      contract_retainer_amount: row.contract_retainer_amount ? parseFloat(row.contract_retainer_amount) : null,
      paid_to_date: parseFloat(row.paid_to_date),
      // Owed = contract_total_amount + charges_total - paid_to_date.
      charges_total: chargesTotal,
      payment_plan_enabled: row.payment_plan_enabled,
      installments,
      payments,
      charges,
      // What the client has tipped, already excluded from paid_to_date. Sent
      // so the portal can thank them for it without the number having to be
      // re-derived in the browser.
      tips_total: tipsTotal,

      // Gallery Pass (manageable here)
      gallery_password: row.gallery_password,
      gallery_enabled: row.gallery_enabled,

      // Gallery hosting
      gallery_delivered_at: row.gallery_delivered_at,
      gallery_expires_at: row.gallery_expires_at,

      // Favorites — list of Drive file IDs the client has hearted.
      // Empty array if none / column not yet populated.
      favorite_photo_ids: row.favorite_photo_ids ?? [],
    });
  } catch (err) {
    console.error('[portal/client] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
