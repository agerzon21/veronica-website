/**
 * Admin: patch an existing portal.
 *
 * POST { password, id, patch: {...editable fields} }
 *   → 200 { success }
 *   → 401 on bad admin password
 *   → 404 if portal not found
 *   → 409 if gallery_password collides
 *
 * Editable fields (each independently optional):
 *   client_display_name, client_email, event_date, session_type,
 *   drive_url, gallery_password, gallery_enabled
 *
 * Contract fields (only editable while contract_status != 'signed'):
 *   contract_total_amount, contract_retainer_amount,
 *   contract_variables, contract_template_key
 *
 * We deliberately don't expose contract_body editing here. The body is
 * only ever re-rendered from the template, never patched directly, and
 * once the contract is signed nothing that feeds it can change at all.
 * To "change the contract" after signing she'd void the portal and
 * create a new one.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hashPortalPassword } from '../portal/_password.js';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import {
  CONTRACT_TEMPLATES,
  fillTemplate,
  isContractTemplateKey,
  pruneEmptyOptionalSections,
  requiredVariablesFor,
  stripForeignTypeVariables,
  type ContractTemplateSpec,
} from '../../src/data/contract-template.js';

/**
 * Merge the type's forced clause flags UNDER whatever the caller supplied.
 *
 * A blank counts as "not supplied" here. The admin form posts every clause
 * checkbox it renders, unticked ones included, as an empty string, so a plain
 * spread would let a stray '' strip the minors and illness clauses off a
 * family contract, which are exactly the clauses nobody notices are missing
 * until they matter. A non-blank value still wins.
 *
 * Wedding declares no defaultVariables, so this is a pure copy for wedding
 * portals: same keys, same order, same values, and therefore a byte-identical
 * re-render of a body that may already have been read and signed.
 *
 * Deliberately duplicated in _portals-create.ts. The two endpoints are the
 * only callers, and a shared api/ helper for eight lines is not worth another
 * module in a tree with a serverless function budget.
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

/**
 * Back-fill the NEW type's own field defaults for keys the OLD type never
 * collected. Only used when the type actually changes.
 *
 * A wedding portal's stored variables carry no reschedule_window, because the
 * wedding form has no such field. Re-rendering those same variables against a
 * session template printed the literal text "[reschedule_window]" into the
 * CANCELLATION clause of a contract the client is being asked to sign. The
 * required-variable check below does not catch it, because the field has a
 * sensible default and so is not marked required.
 *
 * Only keys that are ABSENT get filled. A key someone deliberately blanked
 * stays blank, since a blank substitutes to nothing while a missing key
 * becomes a visible placeholder.
 *
 * This never runs on a wedding portal that stays a wedding, so a pending
 * wedding body still re-renders byte for byte.
 */
function withFieldDefaults(
  spec: ContractTemplateSpec,
  supplied: Record<string, string>,
): Record<string, string> {
  const merged: Record<string, string> = { ...supplied };
  for (const field of spec.fields) {
    if (!field.defaultValue) continue;
    if (!Object.prototype.hasOwnProperty.call(merged, field.key)) {
      merged[field.key] = field.defaultValue;
    }
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

  const id = typeof req.body?.id === 'string' ? req.body.id.trim() : '';
  const patch = (req.body?.patch ?? {}) as Record<string, unknown>;
  if (!id) return res.status(400).json({ success: false, error: 'id required' });

  try {
    const sql = getDb();
    const existing = (await sql`
      select id, contract_status, contract_template_key, contract_variables
      from client_portals where id = ${id} limit 1
    `) as Array<{
      id: string;
      contract_status: string;
      contract_template_key: string;
      contract_variables: Record<string, string> | null;
    }>;
    if (existing.length === 0) return res.status(404).json({ success: false, error: 'Portal not found' });

    // Gallery password uniqueness check
    if (typeof patch.gallery_password === 'string') {
      const newPwd = patch.gallery_password.trim();
      if (!newPwd) return res.status(400).json({ success: false, error: 'Gallery password cannot be empty.' });
      const collision = (await sql`
        select 1 from client_portals
        where gallery_password = ${newPwd} and id <> ${id}
        limit 1
      `) as Array<{ '?column?': number }>;
      if (collision.length > 0) {
        return res.status(409).json({ success: false, error: 'That gallery password is already in use.' });
      }
    }

    // Block financial edits once contract is signed
    const contractFrozen = existing[0].contract_status === 'signed';
    if (
      contractFrozen &&
      (patch.contract_total_amount !== undefined ||
        patch.contract_retainer_amount !== undefined)
    ) {
      return res.status(409).json({
        success: false,
        error: 'Contract amounts cannot change after the contract is signed.',
      });
    }

    // The contract TYPE is patchable while the contract is still pending:
    // Vero books a Portrait, then finds out it is a family shoot, and the
    // alternative is voiding the portal and re-sending the invite. Once the
    // contract is signed it is refused exactly the way the amounts above are,
    // because re-rendering the body would rewrite a document the client has
    // already read and signed.
    //
    // Re-sending the SAME key is not a change, so it passes at any status.
    // The client screen posts its whole edit form back, unchanged fields
    // included, and a signed portal must not fail to save an email correction
    // because the type field rode along with it.
    let templateKey = existing[0].contract_template_key;
    let templateKeyChanged = false;
    if (typeof patch.contract_template_key === 'string') {
      const nextKey = patch.contract_template_key.trim();
      // hasOwnProperty, not a truthy lookup: CONTRACT_TEMPLATES is a plain
      // object, so 'constructor' and 'toString' would both pass `if (!spec)`
      // and then throw inside fillTemplate as a 500.
      if (!isContractTemplateKey(nextKey)) {
        return res.status(400).json({
          success: false,
          error: `Unknown contract template '${nextKey}'.`,
        });
      }
      if (nextKey !== templateKey) {
        if (contractFrozen) {
          return res.status(409).json({
            success: false,
            error: 'The contract type cannot change after the contract is signed.',
          });
        }
        if (existing[0].contract_status !== 'pending') {
          return res.status(409).json({
            success: false,
            error: 'This portal has no pending contract, so there is no contract type to change.',
          });
        }
        templateKey = nextKey;
        templateKeyChanged = true;
      }
    }

    // Contract variables and the contract type both feed the same re-render,
    // so they are resolved and validated HERE, before anything is written.
    // The field updates below run as a series of separate statements, so a 400
    // raised after them would leave half the patch applied with no way to tell
    // which half.
    const patchedVariables =
      patch.contract_variables &&
      typeof patch.contract_variables === 'object' &&
      !Array.isArray(patch.contract_variables)
        ? (patch.contract_variables as Record<string, unknown>)
        : null;

    let contractRender: { spec: ContractTemplateSpec; vars: Record<string, string> } | null = null;
    if ((patchedVariables || templateKeyChanged) && !contractFrozen) {
      const spec = CONTRACT_TEMPLATES[templateKey];
      if (!spec) {
        // Only reachable for a stored key, since a patched one was checked
        // above. Old rows can hold a key that no longer exists.
        return res.status(400).json({
          success: false,
          error: `Unknown contract template '${templateKey}'.`,
        });
      }
      // No new variables means the type changed on its own, so re-render from
      // what is already stored rather than wiping the client's details.
      const supplied = Object.fromEntries(
        Object.entries(patchedVariables ?? existing[0].contract_variables ?? {}).map(([k, v]) => [
          k,
          String(v ?? ''),
        ]),
      );
      // On a type change the new template can reference fields the old type
      // never had, so fill those from the new type's own defaults first.
      // On a TYPE CHANGE, drop the clauses the old type owned and the new one
      // does not. A booking that was maternity and is now portrait still
      // carries maternity_clauses_enabled, and the five session types share
      // one body, so the portrait contract would carry on printing MATERNITY
      // SESSION GUIDELINES with the due date still in it. Nothing about that
      // looks wrong on screen, which is why it has to be handled here.
      //
      // Only on a type change, deliberately. A plain variable save must NOT
      // strip, because the variable editor exposes due_date and session_scope
      // on every session type on purpose: that is how a pending wedding
      // reaches maternity, by hopping through portrait and filling the due
      // date before the second switch. Stripping on every save would delete
      // the value between the two steps and make that path a dead end.
      const vars = withTypeDefaults(
        spec,
        templateKeyChanged
          ? stripForeignTypeVariables(spec.key, withFieldDefaults(spec, supplied))
          : supplied,
      );

      // Required variables are checked only when the TYPE changed. A new type
      // can require something the old one never collected (maternity wants a
      // due date, Other wants a scope), and rendering without it prints
      // "[due_date]" into the contract. A plain variable edit is left alone on
      // purpose: portals created before this check existed can carry a blank
      // required field, and fixing an unrelated typo on one must not 400.
      if (templateKeyChanged) {
        const missingVariables = requiredVariablesFor(templateKey).filter(
          (key) => !vars[key]?.trim(),
        );
        if (missingVariables.length > 0) {
          return res.status(400).json({
            success: false,
            error: `The ${spec.name} contract needs these filled in: ${missingVariables.join(', ')}.`,
          });
        }
      }

      contractRender = { spec, vars };
    }

    // Apply each field individually with parameterized SQL. Using
    // multiple short statements keeps the dynamic-SQL footprint
    // minimal — much easier to keep safe than a query builder.
    const setStr = (val: unknown) => (typeof val === 'string' ? val.trim() : null);

    if (typeof patch.client_display_name === 'string') {
      await sql`update client_portals set client_display_name = ${setStr(patch.client_display_name)}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.client_email === 'string') {
      await sql`update client_portals set client_email = ${setStr(patch.client_email)?.toLowerCase() ?? null}, updated_at = now() where id = ${id}`;
    }
    // Stored as typed, not as parsed. A number she half-remembers is worth
    // more than a refusal: this field exists so she can reach a client from
    // the shoot, and rejecting "570 555 1234 (mom)" to insist on E.164 would
    // lose the note and the number. Normalization for channel matching belongs
    // where the matching happens, not in the box she is typing into.
    if (typeof patch.client_phone === 'string') {
      await sql`update client_portals set client_phone = ${setStr(patch.client_phone)}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.event_date === 'string') {
      const v = patch.event_date.trim() || null;
      await sql`update client_portals set event_date = ${v}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.session_type === 'string') {
      await sql`update client_portals set session_type = ${setStr(patch.session_type)}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.drive_url === 'string') {
      const v = patch.drive_url.trim() || null;
      await sql`update client_portals set drive_url = ${v}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.gallery_password === 'string') {
      await sql`update client_portals set gallery_password = ${patch.gallery_password.trim()}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.gallery_enabled === 'boolean') {
      await sql`update client_portals set gallery_enabled = ${patch.gallery_enabled}, updated_at = now() where id = ${id}`;
    }
    // Extending a gallery that is about to expire.
    //
    // The countdown turned orange under seven days and then the gallery simply
    // went dark, because nothing in the entire system could move this date.
    // The capability existed on the server (the deliver handler has no
    // already-delivered guard and would happily re-stamp it) but the only
    // button that called it was gated on NOT being delivered yet, so it was
    // unreachable exactly when it was needed. A warning colour with no route
    // to the fix is decoration, not a warning.
    //
    // Deliberately separate from delivery: re-running delivery would re-send
    // the photos-are-ready email to a client who got it months ago, and would
    // move gallery_delivered_at, which is the release switch and the date on
    // the client's own portal.
    if (typeof patch.gallery_expires_at === 'string') {
      const when = new Date(patch.gallery_expires_at);
      if (Number.isNaN(when.getTime())) {
        return res.status(400).json({ success: false, error: 'gallery_expires_at is not a valid date.' });
      }
      // Only ever forward. Moving an expiry INTO the past would black out a
      // live gallery with no warning and no undo, and there is no reason to
      // want that which is not better served by disabling the gallery.
      const currentRow = (await sql`
        select gallery_expires_at, gallery_delivered_at from client_portals where id = ${id} limit 1
      `) as Array<{ gallery_expires_at: string | null; gallery_delivered_at: string | null }>;
      const current = currentRow[0]?.gallery_expires_at;
      if (!currentRow[0]?.gallery_delivered_at) {
        return res.status(409).json({
          success: false,
          error: 'This gallery has not been delivered yet, so it has no expiry to extend.',
        });
      }
      if (when.getTime() <= Date.now()) {
        return res.status(400).json({ success: false, error: 'Pick a date in the future.' });
      }
      if (current && when.getTime() < new Date(current).getTime()) {
        return res.status(400).json({
          success: false,
          error: 'That is earlier than the current expiry. Extending only moves it later.',
        });
      }
      await sql`update client_portals set gallery_expires_at = ${when.toISOString()}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.contract_total_amount === 'number' && !contractFrozen) {
      await sql`update client_portals set contract_total_amount = ${patch.contract_total_amount}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.contract_retainer_amount === 'number' && !contractFrozen) {
      await sql`update client_portals set contract_retainer_amount = ${patch.contract_retainer_amount}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.partner_1_full_name === 'string') {
      const v = patch.partner_1_full_name.trim() || null;
      await sql`update client_portals set partner_1_full_name = ${v}, updated_at = now() where id = ${id}`;
    }
    if (typeof patch.partner_2_full_name === 'string') {
      const v = patch.partner_2_full_name.trim() || null;
      await sql`update client_portals set partner_2_full_name = ${v}, updated_at = now() where id = ${id}`;
    }

    // Admin override of the client's portal password. Used when the
    // client forgets their password and needs to be unblocked — set a
    // temporary value and tell them to change it on first login.
    // Always allowed regardless of contract status; this is the support
    // hatch.
    // `patch` is Record<string, unknown>, so a key rename is NOT caught by the
    // compiler — a stale caller would silently no-op and Vero would think she
    // had set a password when she had not. Fail loudly instead.
    if ('client_password' in patch) {
      return res.status(400).json({
        success: false,
        error: 'client_password was renamed to set_client_password.',
      });
    }

    if (typeof patch.set_client_password === 'string') {
      const v = patch.set_client_password.trim();
      if (v.length < 6) {
        return res.status(400).json({ success: false, error: 'New password must be at least 6 characters.' });
      }
      await sql`
        update client_portals
        set client_password_hash = ${hashPortalPassword(v)},
            setup_token = null,
            setup_token_expires_at = null,
            updated_at = now()
        where id = ${id}
      `;
    }

    // Re-render the contract body (only while pending), from whichever of the
    // type and the variables changed, so the client sees the updated contract
    // on their next portal load. Both go through one render because a type
    // change with no new variables still has to re-render, and variables
    // edited in the same request have to render against the NEW template
    // rather than the one being replaced.
    //
    // The pruner sees the SAME merged variables the fill did, which is what
    // drops RELATED WEDDING BOOKING from an engagement contract whose
    // wedding_date was cleared, rather than leaving an orphan heading.
    if (contractRender) {
      const { spec, vars } = contractRender;
      const filled = pruneEmptyOptionalSections(
        fillTemplate(spec.template, vars),
        vars,
      );
      const body = JSON.stringify(filled);
      await sql`
        update client_portals
        set contract_template_key = ${templateKey},
            contract_variables = ${JSON.stringify(vars)},
            contract_body = ${body},
            updated_at = now()
        where id = ${id}
      `;
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[admin/portal-update] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
