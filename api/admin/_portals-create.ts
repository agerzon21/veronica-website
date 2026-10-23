/**
 * Admin: create a new client portal.
 *
 * POST {
 *   password,                      // admin password
 *   mode: 'simple' | 'full',
 *   session_type: string,          // e.g. "wedding", "portrait", "family"
 *
 *   // 'full' mode only, required for the contract + portal flow:
 *   client_display_name: string,   // e.g. "Chrisann & Rajiv"
 *   client_email: string,
 *   partner_1_first_name?: string,
 *   partner_2_first_name?: string,
 *   event_date: string (YYYY-MM-DD),
 *   contract_template_key: string, // key from CONTRACT_TEMPLATES (e.g. 'wedding')
 *   variables: Record<string, string>, // template variables for that key
 *   contract_total_amount: number,  // before tax
 *   contract_retainer_amount: number,  // before tax
 *   sales_tax?: 'added' | 'absorbed' | 'exempt',  // default 'added' (migration 049)
 *
 *   // both modes:
 *   gallery_password: string,      // unique
 *   client_phone?: string,         // optional, never a contract variable
 *
 *   // optional, if this portal is being created from a DM conversation,
 *   // pass the conversation id and we'll link the two so the inbox
 *   // shows the "Client" badge and Vero can jump between them.
 *   link_to_conversation_id?: string,
 * }
 *
 *   → 200 { success, portal_id, setup_token }  invite email is sent to client_email
 *   → 400 on an unknown contract_template_key, or a required variable for
 *         that type left blank (see requiredVariablesFor)
 *   → 401 on bad admin password
 *   → 409 if gallery_password collides
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { parseLocations, primaryAddress } from '../../src/data/sessionLocations.js';
import { sendEmail } from '../_auto-reply.js';
import { greetingName } from '../../src/data/client-greeting.js';
import { accountPasswordHash } from '../portal/_account.js';
import {
  CONTRACT_TEMPLATES,
  fillTemplate,
  formatContractMoney,
  formatContractMoneyExact,
  isContractTemplateKey,
  pruneEmptyOptionalSections,
  requiredVariablesFor,
  stripForeignTypeVariables,
  type ContractTemplateSpec,
} from '../../src/data/contract-template.js';
import {
  cardPriceContractVariables,
  isSalesTaxMode,
  salesTaxContractVariables,
  type SalesTaxMode,
} from '../../src/data/sales-tax.js';

function generateToken(): string {
  // 32 bytes → 64 hex chars. Plenty of entropy for a single-use setup link.
  return randomBytes(32).toString('hex');
}

/**
 * Merge the type's forced clause flags UNDER whatever the caller supplied.
 *
 * A blank counts as "not supplied" here. The admin form posts every clause
 * checkbox it renders, unticked ones included, as an empty string, so a plain
 * spread would let a stray '' from a copied or stale payload strip the minors
 * and illness clauses off a family contract, which are exactly the clauses
 * nobody notices are missing until they matter. A non-blank value still wins.
 *
 * Wedding declares no defaultVariables, so this is a pure copy for wedding
 * portals: same keys, same order, same values, and therefore the same rendered
 * body and the same contract_variables JSON as before this existed.
 */
function withTypeDefaults(
  spec: ContractTemplateSpec,
  supplied: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = { ...supplied };
  for (const [key, value] of Object.entries(spec.defaultVariables ?? {})) {
    if (!merged[key]?.trim()) merged[key] = value;
  }
  return merged;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const body = req.body ?? {};
  const mode = body.mode === 'simple' ? 'simple' : 'full';
  const sessionType = typeof body.session_type === 'string' ? body.session_type.trim() : '';
  const galleryPassword = typeof body.gallery_password === 'string' ? body.gallery_password.trim() : '';

  if (!sessionType) {
    return res.status(400).json({ success: false, error: 'session_type is required' });
  }
  if (!galleryPassword) {
    return res.status(400).json({ success: false, error: 'gallery_password is required' });
  }

  /**
   * Optional in both modes, and never a contract variable: it is what the
   * Call button on the client's page dials. Stored as typed, exactly like an
   * edit from that page (see _portal-update.ts), because normalising for
   * dialling and channel matching happens where those happen. The cap keeps a
   * paste of a whole message out of a field that holds one number.
   */
  const clientPhone =
    typeof body.client_phone === 'string' && body.client_phone.trim()
      ? body.client_phone.trim().slice(0, 40)
      : null;

  // Mode-specific validation
  let clientDisplayName: string | null = null;
  let clientEmail: string | null = null;
  let partner1: string | null = null;
  let partner2: string | null = null;
  let partner1FullName: string | null = null;
  let partner2FullName: string | null = null;
  let eventDate: string | null = null;
  let templateKey: string | null = null;
  let totalAmount: number | null = null;
  let retainerAmount: number | null = null;
  /**
   * Pennsylvania sales tax for this booking (migration 049, src/data/sales-tax.ts).
   * A full booking adds 6% unless the form says otherwise: Alex's rule from
   * 2026-10-01 is that new work is taxed and only what existed before is
   * grandfathered. A gallery-only booking is made after the shoot, for a price
   * already quoted, so its default is 'absorbed': the client pays the quote
   * and Vero remits the 6% out of it (Alex, 2026-10-03). 'exempt' is for
   * photos delivered outside Pennsylvania.
   */
  const salesTax: SalesTaxMode = isSalesTaxMode(body.sales_tax) ? body.sales_tax : mode === 'simple' ? 'absorbed' : 'added';
  let contractBody: string | null = null;
  let contractVariables: Record<string, string> = {};
  let setupToken: string | null = null;
  let setupTokenExpiresAt: string | null = null;

  if (mode === 'full') {
    clientDisplayName = typeof body.client_display_name === 'string' ? body.client_display_name.trim() : '';
    clientEmail = typeof body.client_email === 'string' ? body.client_email.trim().toLowerCase() : '';
    partner1 = typeof body.partner_1_first_name === 'string' ? body.partner_1_first_name.trim() : null;
    partner2 = typeof body.partner_2_first_name === 'string' ? body.partner_2_first_name.trim() : null;
    partner1FullName = typeof body.partner_1_full_name === 'string' ? body.partner_1_full_name.trim() : null;
    partner2FullName = typeof body.partner_2_full_name === 'string' ? body.partner_2_full_name.trim() : null;
    eventDate = typeof body.event_date === 'string' ? body.event_date.trim() : '';
    templateKey = typeof body.contract_template_key === 'string' ? body.contract_template_key.trim() : '';

    if (!clientDisplayName || !clientEmail || !eventDate || !templateKey) {
      return res.status(400).json({
        success: false,
        error: 'client_display_name, client_email, event_date, and contract_template_key are all required for full mode.',
      });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return res.status(400).json({ success: false, error: 'client_email is not a valid email address.' });
    }

    // hasOwnProperty, not a truthy lookup. CONTRACT_TEMPLATES is a plain
    // object literal, so 'constructor' and 'toString' both resolve to
    // something truthy off Object.prototype and would sail past an
    // `if (!spec)` guard, then throw inside fillTemplate as a 500 rather than
    // telling the caller the key was wrong.
    if (!isContractTemplateKey(templateKey)) {
      return res.status(400).json({ success: false, error: `Unknown contract template '${templateKey}'.` });
    }
    const spec = CONTRACT_TEMPLATES[templateKey];

    const suppliedVariables =
      body.variables && typeof body.variables === 'object' && !Array.isArray(body.variables)
        ? Object.fromEntries(
            Object.entries(body.variables as Record<string, unknown>).map(([k, v]) => [k, String(v ?? '')]),
          )
        : {};
    // The admin form merges the type's forced clauses too. Doing it here as
    // well means a portal created by POSTing straight at the API still carries
    // them, so a family contract cannot end up without the minors wording just
    // because the caller was not the form.
    // Strip first: a caller (or a prefill carried across a type change in the
    // form) can hand us a clause flag this type does not own, and the five
    // session types share one template, so nothing downstream would notice a
    // portrait contract printing the maternity guidelines.
    contractVariables = withTypeDefaults(
      spec,
      stripForeignTypeVariables(spec.key, suppliedVariables),
    );

    // Per-type required variables, enforced here and not only in the form.
    // The form is bypassable, and a maternity contract created without a due
    // date renders the literal text "[due_date]" to the client, on a document
    // they are being asked to sign.
    const missingVariables = requiredVariablesFor(templateKey).filter(
      (key) => !contractVariables[key]?.trim(),
    );
    if (missingVariables.length > 0) {
      return res.status(400).json({
        success: false,
        error: `The ${spec.name} contract needs these filled in: ${missingVariables.join(', ')}.`,
      });
    }

    totalAmount = Number(body.contract_total_amount);
    retainerAmount = Number(body.contract_retainer_amount);
    if (!Number.isFinite(totalAmount) || totalAmount < 0 || !Number.isFinite(retainerAmount) || retainerAmount < 0) {
      return res.status(400).json({ success: false, error: 'contract_total_amount and contract_retainer_amount must be non-negative numbers.' });
    }
    if (retainerAmount > totalAmount) {
      return res.status(400).json({ success: false, error: 'Retainer cannot exceed total amount.' });
    }

    /*
     * The money lines are the columns' business, never the caller's, the rule
     * _portal-update.ts holds for every later edit: the contract must state
     * exactly what the portal, the card checkout and the delivery gate will
     * charge. The form already sends the first three in this same format, so
     * for it nothing changes; a caller that sent anything else is corrected.
     * The tax lines are empty unless this booking adds tax, which prunes the
     * PENNSYLVANIA SALES TAX section away.
     */
    contractVariables = {
      ...contractVariables,
      total_amount: formatContractMoney(totalAmount),
      retainer_amount: formatContractMoney(retainerAmount),
      remaining_balance: formatContractMoney(Math.max(totalAmount - retainerAmount, 0)),
      ...salesTaxContractVariables(totalAmount, retainerAmount, salesTax, formatContractMoneyExact),
      // Every full booking created from now on is 'dual' (written explicitly
      // in the insert below), so its contract states the card prices.
      ...cardPriceContractVariables(totalAmount, retainerAmount, salesTax, 'dual', formatContractMoneyExact),
    };

    // Render the template body now so it's frozen at creation time.
    // We also persist the variables JSON so the admin can edit them
    // later (while contract is still pending) and we can re-render
    // without losing context.
    //
    // The pruner runs for every type, not just wedding: it is what drops
    // RELATED WEDDING BOOKING from an engagement contract whose wedding_date
    // is blank, instead of printing the heading with nothing under it. It has
    // to see the SAME merged variables the fill did, or a clause switched on
    // by defaultVariables would render and then be pruned back out.
    const filled = pruneEmptyOptionalSections(
      fillTemplate(spec.template, contractVariables),
      contractVariables,
    );
    contractBody = JSON.stringify(filled);

    // Generate the one-time setup token. Expires in 14 days; long enough
    // that an invite email lingering in a client's inbox over a weekend
    // is still valid.
    setupToken = generateToken();
    setupTokenExpiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  }

  try {
    const sql = getDb();

    // Check gallery_password uniqueness up front so we can return a clean
    // 409 instead of leaking the DB constraint error.
    const collision = (await sql`
      select 1 from client_portals where gallery_password = ${galleryPassword} limit 1
    `) as Array<{ '?column?': number }>;
    if (collision.length > 0) {
      return res.status(409).json({ success: false, error: 'That gallery password is already in use. Pick another.' });
    }

    let portalId: string;
    /**
     * A session for a client who already has a portal (portal/_account.ts):
     * the email is on another full booking that has a password. The new one
     * takes that password, gets no setup link (they already chose a
     * password, and a second link would let it be set again), and the client
     * is told a session was added rather than invited to set up an account.
     */
    let accountHash: string | null = null;
    // Invited but not set up yet: the client already has a setup email, and
    // choosing a password through it covers every session on the email
    // (welcome-complete). A second setup email for the second of two sessions
    // booked together was one too many (2026-10-22), so this one joins quietly.
    let joinsPendingAccount = false;
    if (mode === 'full' && clientEmail) {
      accountHash = await accountPasswordHash(sql, clientEmail);
      if (!accountHash) {
        const pending = (await sql`
          select 1 from client_portals where mode = 'full' and lower(client_email) = lower(${clientEmail}) limit 1
        `) as Array<unknown>;
        joinsPendingAccount = pending.length > 0;
      }
      if (accountHash || joinsPendingAccount) {
        setupToken = null;
        setupTokenExpiresAt = null;
      }
    }
    if (mode === 'full') {
      const inserted = (await sql`
        insert into client_portals (
          mode, session_type,
          partner_1_first_name, partner_2_first_name,
          partner_1_full_name, partner_2_full_name,
          client_display_name, client_email, client_phone,
          event_date,
          gallery_password, gallery_enabled,
          contract_status, contract_template_key, contract_body, contract_variables,
          contract_total_amount, contract_retainer_amount, paid_to_date,
          sales_tax, card_pricing,
          setup_token, setup_token_expires_at,
          client_password_hash
        ) values (
          ${mode}, ${sessionType},
          ${partner1}, ${partner2},
          ${partner1FullName}, ${partner2FullName},
          ${clientDisplayName}, ${clientEmail}, ${clientPhone},
          ${eventDate},
          ${galleryPassword}, true,
          'pending', ${templateKey}, ${contractBody}, ${JSON.stringify(contractVariables)},
          ${totalAmount}, ${retainerAmount}, 0,
          -- Written here, never left to the column default (migration 054 keeps
          -- that at 'single'): only this code also writes the PRICES BY CARD
          -- section, so only it may promise a client the card prices checkout
          -- will charge. A gallery-only booking below stays 'single'; it has no
          -- card checkout at all.
          ${salesTax}, 'dual',
          ${setupToken}, ${setupTokenExpiresAt},
          -- The account's password when the client already has one (see
          -- accountHash above), written with the row so a session can never
          -- exist with neither a password nor a setup link.
          ${accountHash}
        )
        returning id
      `) as Array<{ id: string }>;
      portalId = inserted[0].id;

      /**
       * Booked as part of a package (migration 057): which package, and what
       * this session costs on its own, so "Your sessions" can show the saving.
       * The contract states contract_total_amount, the package price. Its own
       * statement, allowed to fail, like every later column.
       */
      const packageId =
        typeof body.package_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.package_id) ? body.package_id : null;
      const regular = Number(body.regular_amount);
      /**
       * The session's own discount (migration 058): what it took off and what
       * Vero called it. regular_amount is the price before ANY discount, so
       * a discounted session records it even outside a package, and only
       * when it is above what the contract states.
       */
      const discount = Number(body.discount_amount);
      const discountAmount = Number.isFinite(discount) && discount > 0 ? Math.round(discount * 100) / 100 : null;
      const discountLabel =
        discountAmount && typeof body.discount_label === 'string' && body.discount_label.trim()
          ? body.discount_label.trim().slice(0, 80)
          : null;
      const regularAmount =
        Number.isFinite(regular) && totalAmount !== null && (packageId ? regular >= totalAmount : regular > totalAmount)
          ? regular
          : null;
      if (packageId || regularAmount !== null) {
        try {
          await sql`update client_portals set package_id = ${packageId}, regular_amount = ${regularAmount} where id = ${portalId}`;
        } catch (err) {
          console.error('[admin/portals-create] could not record the package (session still created):', err);
        }
      }
      if (discountAmount && regularAmount !== null) {
        try {
          await sql`update client_portals set discount_amount = ${discountAmount}, discount_label = ${discountLabel} where id = ${portalId}`;
        } catch (err) {
          console.error('[admin/portals-create] could not record the discount (session still created):', err);
        }
      }

      /**
       * The day-of list, when the booking happens in more than one place.
       *
       * A SEPARATE statement rather than two more columns on the insert
       * above, because the insert is the path every existing booking takes
       * and this is the path almost none of them do. Skipped entirely when
       * nothing was sent, so a single-place create runs exactly the SQL it
       * ran before this existed.
       *
       * session_location is written from primaryAddress in the SAME
       * statement, which is the invariant src/data/sessionLocations.ts
       * exists to hold: the list is the truth, the single column is the
       * first entry that has an address, and the eight readers that can only
       * hold one address keep getting a real address rather than a summary
       * of several. Two statements could leave them disagreeing.
       */
      if (Array.isArray(body.session_locations) && body.session_locations.length > 0) {
        const locations = parseLocations(body.session_locations);
        if (locations.length > 0) {
          const primary = primaryAddress(locations);
          await sql`
            update client_portals
               set session_locations = ${JSON.stringify(locations)}::jsonb,
                   session_location  = ${primary || null},
                   updated_at        = now()
             where id = ${portalId}
          `;
        }
      }
    } else {
      // Simple mode: a gallery-only delivery (no contract, no login email,
      // no setup token). Optional fields can come in: display name,
      // event date, Drive URL, retention months.
      //
      // If a drive_url is provided at creation, the portal is considered
      // delivered immediately and the gallery hosting countdown starts.
      // This matches Vero's workflow: she creates these AFTER editing,
      // for things like portraits where she wants to hand the gallery
      // straight to the client/guests.
      const simpleDisplayName =
        typeof body.client_display_name === 'string' && body.client_display_name.trim()
          ? body.client_display_name.trim()
          : null;
      // Reused for the email greeting, "Hi {first_name}," reads better
      // than parsing the display name (which now is "Portrait Alex 2026"
      // not "Alex"). Stored in the existing partner_1_first_name column.
      const simpleClientFirstName =
        typeof body.partner_1_first_name === 'string' && body.partner_1_first_name.trim()
          ? body.partner_1_first_name.trim()
          : null;
      const simpleClientEmail =
        typeof body.client_email === 'string' && body.client_email.trim()
          ? body.client_email.trim().toLowerCase()
          : null;
      const simpleEventDate =
        typeof body.event_date === 'string' && body.event_date.trim()
          ? body.event_date.trim()
          : null;
      const simpleDriveUrl =
        typeof body.drive_url === 'string' && body.drive_url.trim()
          ? body.drive_url.trim()
          : null;
      const simpleRetentionMonths =
        Number.isFinite(Number(body.retention_months)) && Number(body.retention_months) > 0
          ? Number(body.retention_months)
          : 3;
      const simpleTotalAmount =
        body.contract_total_amount !== null &&
        body.contract_total_amount !== undefined &&
        Number.isFinite(Number(body.contract_total_amount))
          ? Number(body.contract_total_amount)
          : null;
      const simpleRetainerAmount =
        body.contract_retainer_amount !== null &&
        body.contract_retainer_amount !== undefined &&
        Number.isFinite(Number(body.contract_retainer_amount))
          ? Number(body.contract_retainer_amount)
          : null;

      const deliveredAt = simpleDriveUrl ? new Date().toISOString() : null;
      const expiresAt = simpleDriveUrl
        ? new Date(Date.now() + simpleRetentionMonths * 30 * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const inserted = (await sql`
        insert into client_portals (
          mode, session_type,
          partner_1_first_name,
          client_display_name, client_email, client_phone,
          event_date,
          gallery_password, gallery_enabled,
          drive_url, gallery_delivered_at, gallery_expires_at,
          contract_status,
          contract_total_amount, contract_retainer_amount, paid_to_date,
          sales_tax
        ) values (
          ${mode}, ${sessionType},
          ${simpleClientFirstName},
          ${simpleDisplayName}, ${simpleClientEmail}, ${clientPhone},
          ${simpleEventDate},
          ${galleryPassword}, true,
          ${simpleDriveUrl}, ${deliveredAt}, ${expiresAt},
          'none',
          ${simpleTotalAmount}, ${simpleRetainerAmount}, 0,
          ${salesTax}
        )
        returning id
      `) as Array<{ id: string }>;
      portalId = inserted[0].id;

      // Friends and family, chosen on the form (2026-10-19); before, it could
      // only be set from the record afterwards. Its own statement and allowed
      // to fail, like every read of the column: migration 048 added it by hand.
      if (body.complimentary === true) {
        try {
          await sql`update client_portals set complimentary = true where id = ${portalId}`;
        } catch (err) {
          console.error('[admin/portals-create] could not mark the booking free:', err);
        }
      }

      // Auto-send the gallery-ready email if we have both the Drive URL
      // (i.e. the gallery is actually viewable) AND a client email. Same
      // non-blocking semantics as the full-mode invite email below: log
      // a failure, keep the row.
      if (simpleClientEmail && simpleDriveUrl && expiresAt) {
        try {
          const siteOrigin =
            process.env.SITE_ORIGIN ||
            (req.headers.host ? `https://${req.headers.host}` : 'https://vero.photography');
          await sendEmail({
            to: simpleClientEmail,
            subject: 'Your photos are ready, from Vero Photography',
            text: buildGalleryReadyText(simpleClientFirstName, siteOrigin, galleryPassword, expiresAt),
            html: buildGalleryReadyHtml(simpleClientFirstName, siteOrigin, galleryPassword, expiresAt),
          });
        } catch (err) {
          console.error('[admin/portals-create] gallery-ready email failed:', err);
        }
      }
    }

    // Send invite email for full-mode portals. Still non-blocking, a failed
    // send must not lose the portal row, but the outcome is no longer
    // swallowed. Previously a hard Resend rejection was logged server-side and
    // reported to Vero as success, so she had no way to know the client never
    // got their link. The id lets the admin UI poll /api/email-status and show
    // Sending -> Delivered, and the error string tells her it never left.
    let inviteEmailId: string | null = null;
    let inviteEmailError: string | null = null;
    if (mode === 'full' && setupToken && clientEmail) {
      try {
        const siteOrigin =
          process.env.SITE_ORIGIN ||
          (req.headers.host ? `https://${req.headers.host}` : 'https://vero.photography');
        const inviteUrl = `${siteOrigin}/portal/welcome?token=${setupToken}`;
        const sent = await sendEmail({
          to: clientEmail,
          subject: 'Your client portal is ready, from Vero Photography',
          // Greets the first name typed into the form, not the display
          // name, which is Vero's label ("Senior Photos").
          text: buildInviteText(greetingName(clientDisplayName, partner1), inviteUrl),
          html: buildInviteHtml(greetingName(clientDisplayName, partner1), inviteUrl),
        });
        inviteEmailId = sent?.id ?? null;
        // Persist it so the delivery state stays answerable after this
        // request. Best-effort: a portal that exists with an unrecorded
        // invite id is far better than one that does not exist because
        // bookkeeping failed.
        if (inviteEmailId) {
          try {
            await sql`
              UPDATE client_portals
              SET invite_email_id = ${inviteEmailId}, invite_sent_at = NOW()
              WHERE id = ${portalId}
            `;
          } catch (e) {
            console.error('[portals-create] could not record invite email id', e);
          }
        }
      } catch (err) {
        inviteEmailError = err instanceof Error ? err.message : String(err);
        console.error('[admin/portals-create] invite email failed (portal was still created):', err);
      }
    }

    // The client already has a portal: tell them a session was added, and
    // record it the way the invite is recorded, so the record shows whether
    // it arrived.
    // quiet: the later sessions of a package; the first one's email names them all.
    if (mode === 'full' && accountHash && clientEmail && body.quiet !== true) {
      try {
        const siteOrigin =
          process.env.SITE_ORIGIN ||
          (req.headers.host ? `https://${req.headers.host}` : 'https://vero.photography');
        const announced = Array.isArray(body.announce_titles)
          ? (body.announce_titles as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, 6)
          : [];
        const title =
          announced.length > 1
            ? announced.join(' and ')
            : typeof contractVariables.event_title === 'string'
              ? contractVariables.event_title
              : '';
        const sent = await sendEmail({
          to: clientEmail,
          subject: 'A new session is in your portal, from Vero Photography',
          text: buildAddedSessionText(greetingName(clientDisplayName, partner1), title, `${siteOrigin}/portal`),
          html: buildAddedSessionHtml(greetingName(clientDisplayName, partner1), title, `${siteOrigin}/portal`),
        });
        inviteEmailId = sent?.id ?? null;
        if (inviteEmailId) {
          await sql`UPDATE client_portals SET invite_email_id = ${inviteEmailId}, invite_sent_at = NOW() WHERE id = ${portalId}`;
        }
      } catch (err) {
        inviteEmailError = err instanceof Error ? err.message : String(err);
        console.error('[admin/portals-create] new-session email failed (the session was still added):', err);
      }
    }

    // Optionally link this portal back to the DM conversation it was
    // created from, the inbox uses conversations.linked_client_portal_id
    // to show the "Client" badge and jump into the portal from the
    // thread. Best-effort: if the FK update fails (bad convo id, race,
    // etc.), we still return success, the portal itself exists.
    const linkConvoId =
      typeof body.link_to_conversation_id === 'string' ? body.link_to_conversation_id.trim() : '';
    if (linkConvoId) {
      try {
        await sql`
          UPDATE conversations
          SET linked_client_portal_id = ${portalId}, updated_at = NOW()
          WHERE id = ${linkConvoId}
        `;
      } catch (err) {
        console.error('[admin/portals-create] failed to link conversation (portal still created):', err);
      }
    }

    return res.status(200).json({
      success: true,
      portal_id: portalId,
      setup_token: setupToken,
      // null when no invite was due (gallery-only mode) OR when the send threw.
      // invite_email_error disambiguates those two.
      invite_email_id: inviteEmailId,
      invite_email_error: inviteEmailError,
      // True when this was added to a client's existing portal (same email,
      // same password) rather than starting a new one.
      added_to_account: Boolean(accountHash) || joinsPendingAccount,
    });
  } catch (err) {
    console.error('[admin/portals-create] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

function buildInviteText(firstName: string, inviteUrl: string): string {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const portalUrl = `${new URL(inviteUrl).origin}/portal`;
  return `${greeting}

Your client portal with Vero Photography is ready. Click the link below to confirm your booking details and pick a password:

${inviteUrl}

This link is valid for 14 days and works once, to set your password. After that, sign in any time at ${portalUrl} with this email and your password.

Inside, you'll be able to review and sign your contract, track your balance, and (once it's ready) view your photo gallery.

Looking forward to working with you,
Veronika`;
}

function buildInviteHtml(firstName: string, inviteUrl: string): string {
  // The setup link works once. Saying where to go AFTER it is what was missing
  // when a client came back to this email to pay and found it dead (2026-10-15).
  const portalUrl = `${new URL(inviteUrl).origin}/portal`;
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi ${firstName || 'there'},</p>
<p>Your client portal is ready. Click below to confirm your booking details and pick a password:</p>
<p style="margin:24px 0;"><a href="${inviteUrl}" style="display:inline-block;padding:14px 28px;background:#c9a96e;color:#fff;text-decoration:none;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-size:13px;">Set up your portal</a></p>
<p style="font-size:14px;color:#666;">This link is valid for 14 days. If the button doesn't work, paste this URL into your browser:<br><span style="word-break:break-all;color:#c9a96e;">${inviteUrl}</span></p>
<p style="font-size:14px;color:#666;">The link works once, to set your password. After that, sign in any time at <a href="${portalUrl}" style="color:#c9a96e;">${portalUrl.replace(/^https?:\/\//, '')}</a> with this email and your password.</p>
<p>Inside you'll be able to review and sign your contract, track your balance, and (once it's ready) view your photo gallery.</p>
<p>Looking forward to working with you,<br><em>Veronika</em></p>
</body></html>`;
}

function buildGalleryReadyText(
  firstName: string | null,
  siteOrigin: string,
  galleryPassword: string,
  expiresAt: string,
): string {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const exp = new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const directUrl = `${siteOrigin}/portal/pass?password=${encodeURIComponent(galleryPassword)}`;
  return `${greeting}

Your photos are ready ✨

Open your gallery (one-click access):
${directUrl}

If that link doesn't work, you can also go to ${siteOrigin}/portal/pass and enter the password manually:

Password: ${galleryPassword}

The gallery will stay online until ${exp}. Please download and back up your favourites before then.

If you have any questions or want to order prints, just reply to this email.

Warmly,
Veronika`;
}

function buildGalleryReadyHtml(
  firstName: string | null,
  siteOrigin: string,
  galleryPassword: string,
  expiresAt: string,
): string {
  const name = firstName || 'there';
  const exp = new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  // Direct link with password encoded into the URL, /portal/pass auto-
  // submits when it sees ?password=, so this is a true one-click open.
  // We surface the bare URL too as a fallback (in case the styled button
  // gets stripped by an email client), and the plain password as a third
  // fallback (in case the URL itself gets mangled).
  const directUrl = `${siteOrigin}/portal/pass?password=${encodeURIComponent(galleryPassword)}`;
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi ${name},</p>
<p>Your photos are ready ✨</p>
<p style="margin:24px 0;"><a href="${directUrl}" style="display:inline-block;padding:14px 28px;background:#c9a96e;color:#fff;text-decoration:none;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-size:13px;">Open my gallery</a></p>
<p style="font-size:13px;color:#888;margin-top:-8px;">If the button doesn't work, paste this into your browser:<br><span style="word-break:break-all;color:#c9a96e;font-family:monospace;font-size:12px;">${directUrl}</span></p>
<p style="font-size:13px;color:#888;">Or, go to <a href="${siteOrigin}/portal/pass" style="color:#c9a96e">${siteOrigin}/portal/pass</a> and enter:<br>Password: <strong style="color:#2d2d2d;font-family:monospace;">${galleryPassword}</strong></p>
<p style="font-size:14px;color:#666;">The gallery will stay online until <strong>${exp}</strong>. Please download and back up your favourites before then.</p>
<p>If you have any questions or want to order prints, just reply to this email.</p>
<p>Warmly,<br><em>Veronika</em></p>
</body></html>`;
}


/**
 * For a client who already has a portal: their new session is in it, signed
 * in with the same email and password. No setup link: they have a password.
 */
function buildAddedSessionText(firstName: string, eventTitle: string, portalUrl: string): string {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const what = eventTitle ? `${eventTitle} ${/ and /.test(eventTitle) ? 'are' : 'is'}` : 'Your new session is';
  return `${greeting}

${what} now in your client portal with Vero Photography, alongside your other sessions. Sign in with your usual email and password to review and sign the contract:

${portalUrl}

Forgot your password? There's a reset link on the sign-in page.

Looking forward to it,
Veronika`;
}

function buildAddedSessionHtml(firstName: string, eventTitle: string, portalUrl: string): string {
  const what = eventTitle ? `${escapeAttr(eventTitle)} ${/ and /.test(eventTitle) ? 'are' : 'is'}` : 'Your new session is';
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi ${escapeAttr(firstName) || 'there'},</p>
<p>${what} now in your client portal, alongside your other sessions. Sign in with your usual email and password to review and sign the contract.</p>
<p style="margin:24px 0;"><a href="${portalUrl}" style="display:inline-block;padding:14px 28px;background:#c9a96e;color:#fff;text-decoration:none;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;font-size:13px;">Open my portal</a></p>
<p style="font-size:14px;color:#666;">Forgot your password? There's a reset link on the sign-in page.</p>
<p>Looking forward to it,<br><em>Veronika</em></p>
</body></html>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
