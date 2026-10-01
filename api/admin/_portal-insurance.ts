/**
 * Per-event insurance on a booking: flag it, then record what was bought.
 *
 * WHY THIS IS NOT AUTOMATED
 * Neither Full Frame nor Thimble sells policies through a public API, so
 * nothing here buys anything. Vero buys the policy on their site, which takes
 * a couple of minutes, and this records what she bought so the client can be
 * told exactly what they are paying for and the cost lands on their balance
 * once, correctly.
 *
 * THE TWO STEPS ARE DELIBERATELY SEPARATE
 * `save` flags that an event needs cover, with the reason, before anything is
 * bought. That is what the client sees as an estimate. `purchase` records the
 * real policy afterwards. Keeping them apart is the whole point: a booking can
 * be flagged the day a venue sends its vendor packet, and the money only moves
 * once a policy actually exists. It also means an estimate and an actual can
 * be compared, so a client who was told $64 is never quietly charged $120
 * without the difference being visible.
 *
 * MONEY GOES THROUGH portal_charges
 * Eight places in this codebase derive a client's balance and all of them read
 * that table. `insurance_charge_id` points at the row so editing the record
 * ten times still bills the client once: a second purchase call UPDATEs the
 * existing charge rather than inserting another. Non-billable cover creates no
 * charge at all, which is how "Vero wanted it for her own peace of mind" stays
 * her cost, exactly as the contract clause promises.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { randomUUID } from 'node:crypto';
import { writeWithRecompute } from '../_payments.js';
import { requireAdmin } from '../_admin-auth.js';

/** Mirrors the CHECK in migration 047, so a typo is a 400 and not a 500. */
const STATUSES = new Set(['none', 'needed', 'purchased', 'declined']);
const TRIGGERS = new Set(['venue_required', 'drone', 'client_request', 'own_choice']);

/**
 * Only two triggers are the client's doing, and the contract clause only
 * permits billing for those. 'own_choice' is Vero insuring herself because she
 * wants to, which the clause explicitly says is never charged on. This is the
 * default rather than the rule: she can still untick billable on a venue
 * requirement if she decides to absorb it, which she frequently will.
 */
function defaultBillable(trigger: string | null): boolean {
  return trigger === 'venue_required' || trigger === 'drone' || trigger === 'client_request';
}

const str = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : null;
};

const money = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'POST only' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const id = str(req.body?.id ?? req.query?.id);
  if (!id) return res.status(400).json({ success: false, error: 'id required' });
  const action = str(req.body?.action) ?? 'save';

  const sql = getDb();

  try {
    const [portal] = (await sql`
      select id, contract_status, contract_retainer_amount, paid_to_date,
             insurance_charge_id, insurance_status, insurance_trigger
      from client_portals where id = ${id} limit 1
    `) as Array<{
      id: string;
      contract_status: string;
      contract_retainer_amount: string | null;
      paid_to_date: string;
      insurance_charge_id: string | null;
      insurance_status: string;
      insurance_trigger: string | null;
    }>;
    if (!portal) return res.status(404).json({ success: false, error: 'No such booking' });

    if (action === 'save') {
      const status = str(req.body?.status) ?? 'needed';
      if (!STATUSES.has(status)) {
        return res.status(400).json({ success: false, error: 'status must be none, needed, purchased or declined' });
      }
      const trigger = str(req.body?.trigger);
      if (trigger && !TRIGGERS.has(trigger)) {
        return res
          .status(400)
          .json({ success: false, error: 'trigger must be venue_required, drone, client_request or own_choice' });
      }
      // The reason is required whenever cover is being flagged, because it is
      // what the client reads on their invoice six months later and what Vero
      // reads when they query it. An unexplained charge is the thing this
      // whole record exists to prevent.
      const note = str(req.body?.note);
      if (status === 'needed' && !note) {
        return res.status(400).json({
          success: false,
          error: 'A reason is required: who asked for this, and why. The client sees it.',
        });
      }
      const billable =
        typeof req.body?.billable === 'boolean' ? req.body.billable : defaultBillable(trigger);

      /**
       * Saving the reasons never UN-buys a policy. The form's Save sends the
       * status it opened with, and on a purchased policy that used to drop it
       * back to "needed" while the cover was real and paid for. Only 'clear'
       * or an explicit 'declined' or 'none' move it off purchased.
       */
      const statusToWrite = portal.insurance_status === 'purchased' && status === 'needed' ? 'purchased' : status;
      const writes = [
        sql`
          update client_portals set
            insurance_status = ${statusToWrite},
            insurance_trigger = ${trigger},
            insurance_note = ${note},
            insurance_billable = ${billable},
            insurance_estimate = ${money(req.body?.estimate)},
            insurance_additional_insured = ${str(req.body?.additional_insured)},
            updated_at = now()
          where id = ${id}
        `,
      ];
      /**
       * "Charge this to the client" switched OFF must take the charge off their
       * balance, here as well as in purchase. It used to stay, so the client
       * kept owing for cover Vero had decided to absorb. Switching it back ON
       * does not re-bill from here: recording the purchase does, because only
       * that knows the actual cost.
       */
      if (!billable && portal.insurance_charge_id) {
        writes.push(sql`delete from portal_charges where id = ${portal.insurance_charge_id} and client_portal_id = ${id}`);
        writes.push(sql`update client_portals set insurance_charge_id = null where id = ${id}`);
      }
      await writeWithRecompute(sql, id, writes, { charges: true });
      return finish(sql, id, res, portal);
    }

    if (action === 'purchase') {
      const actual = money(req.body?.actual);
      if (actual === null || actual <= 0) {
        return res.status(400).json({ success: false, error: 'actual cost must be a positive number' });
      }
      const provider = str(req.body?.provider);
      const policyRef = str(req.body?.policy_ref);
      const documentUrl = str(req.body?.document_url);
      const note = str(req.body?.note);
      const billable =
        typeof req.body?.billable === 'boolean' ? req.body.billable : defaultBillable(portal.insurance_trigger);

      const writes = [
        sql`
          update client_portals set
            insurance_status = 'purchased',
            insurance_actual = ${actual},
            insurance_provider = ${provider},
            insurance_policy_ref = ${policyRef},
            insurance_document_url = ${documentUrl},
            insurance_billable = ${billable},
            insurance_purchased_at = now(),
            insurance_note = coalesce(${note}, insurance_note),
            updated_at = now()
          where id = ${id}
        `,
      ];

      if (billable) {
        // What the client reads on their own invoice. Names the policy and the
        // reason, because "Insurance $64" with no context is the line that
        // generates the email asking what it was for.
        const label = [
          'Event liability insurance',
          str(req.body?.additional_insured) ? `for ${str(req.body?.additional_insured)}` : null,
          policyRef ? `(policy ${policyRef})` : null,
          note,
        ]
          .filter(Boolean)
          .join(' ');

        /**
         * BILLED ONCE, by a stable id. Re-recording corrects the existing
         * charge rather than adding a second, and the id is chosen here so
         * the charge and the pointer to it are written in the same
         * transaction. An UPSERT rather than an UPDATE, because the charge row
         * can have been deleted from under its pointer, and an UPDATE then
         * changed nothing while the panel reported the client billed.
         */
        const chargeId = portal.insurance_charge_id ?? randomUUID();
        writes.push(sql`
          insert into portal_charges (id, client_portal_id, amount, reason, note, charged_at)
          values (${chargeId}, ${id}, ${actual}, 'insurance', ${label}, now())
          on conflict (id) do update
            set amount = excluded.amount, note = excluded.note, reason = 'insurance'
            where portal_charges.client_portal_id = ${id}
        `);
        writes.push(sql`update client_portals set insurance_charge_id = ${chargeId} where id = ${id}`);
      } else if (portal.insurance_charge_id) {
        // Flipped to non-billable after a charge existed. Remove it, or the
        // client keeps paying for cover Vero has decided to absorb.
        writes.push(sql`delete from portal_charges where id = ${portal.insurance_charge_id} and client_portal_id = ${id}`);
        writes.push(sql`update client_portals set insurance_charge_id = null where id = ${id}`);
      }

      // One transaction, with charges_total re-summed inside it. Without that
      // re-sum, card checkout and the delivery gate read a stale total.
      await writeWithRecompute(sql, id, writes, { charges: true });

      return finish(sql, id, res, portal);
    }

    if (action === 'clear') {
      const writes = [];
      if (portal.insurance_charge_id) {
        writes.push(sql`
          delete from portal_charges
          where id = ${portal.insurance_charge_id} and client_portal_id = ${id}
        `);
      }
      writes.push(sql`
        update client_portals set
          insurance_status = 'none', insurance_trigger = null, insurance_note = null,
          insurance_estimate = null, insurance_actual = null, insurance_provider = null,
          insurance_policy_ref = null, insurance_document_url = null,
          insurance_additional_insured = null, insurance_purchased_at = null,
          insurance_charge_id = null, updated_at = now()
        where id = ${id}
      `);
      await writeWithRecompute(sql, id, writes, { charges: true });
      return finish(sql, id, res, portal);
    }

    return res.status(400).json({ success: false, error: 'action must be save, purchase or clear' });
  } catch (err) {
    console.error('[admin/portal-insurance] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

/**
 * Return the saved record, plus whether buying now would be premature.
 *
 * Alex's rule is to buy only once the retainer has landed and the contract is
 * signed, so a cancelled booking never leaves a policy paid for. That is a
 * warning rather than a block: a wedding three days out with an unsigned
 * contract is exactly when she might need to buy anyway, and a hard gate would
 * make the system wrong at the worst moment. The UI shows the reason; she
 * decides.
 */
async function finish(
  sql: ReturnType<typeof getDb>,
  id: string,
  res: VercelResponse,
  before: { contract_status: string; contract_retainer_amount: string | null; paid_to_date: string },
) {
  const [row] = (await sql`
    select insurance_status, insurance_trigger, insurance_note, insurance_billable,
           insurance_estimate, insurance_actual, insurance_provider, insurance_policy_ref,
           insurance_document_url, insurance_additional_insured, insurance_purchased_at,
           insurance_charge_id
    from client_portals where id = ${id} limit 1
  `) as Array<Record<string, unknown>>;

  const retainer = Number(before.contract_retainer_amount ?? 0);
  const paid = Number(before.paid_to_date ?? 0);
  const signed = before.contract_status === 'signed';
  const retainerPaid = retainer > 0 ? paid >= retainer : paid > 0;

  return res.status(200).json({
    success: true,
    insurance: row ?? null,
    readiness: {
      contract_signed: signed,
      retainer_paid: retainerPaid,
      safe_to_buy: signed && retainerPaid,
      warning:
        signed && retainerPaid
          ? null
          : !signed
            ? 'The contract is not signed yet. Buying now risks paying for a booking that never happens.'
            : 'The retainer has not been paid yet. Buying now risks paying for a booking that never happens.',
    },
  });
}
