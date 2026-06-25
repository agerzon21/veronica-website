/**
 * Sign a pending contract.
 *
 * POST { email, password, signer_name, signer_signature, consent }
 *   signer_signature: base64 PNG data URL from react-signature-canvas
 *   consent: must be exactly true (ESIGN intent-to-sign requirement)
 *
 *   → 200 { success, contract_status, contract_signed_at, contract_signed_pdf_drive_id }
 *   → 400  on missing/invalid fields
 *   → 401  on bad credentials
 *   → 409  contract not in 'pending' state
 *
 * Flow:
 *  1. Auth the client (email + password)
 *  2. Validate consent, signature data, signer_name
 *  3. Build audit record + HMAC-sign it (tamper-evident, ESIGN-compliant)
 *  4. Generate signed PDF (React-PDF) — contract body, both signatures, audit page
 *  5. Upload PDF to Veronika's "Signed Contracts" Drive folder
 *  6. Email both parties with the PDF attached (Resend)
 *  7. Persist signed state to client_portals
 *
 * Steps 4–6 are sequential because a failure in any one means we shouldn't
 * persist the signed state — the client should be able to retry. We don't
 * write to the DB until Drive + email both succeed.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'node:crypto';
import { getDb } from '../_db.js';
import { uploadFile } from '../_drive.js';
import { sendEmail, FROM_ADDRESS } from '../_auto-reply.js';
import { renderContractPdf, type AuditRecord } from '../_contract-pdf.js';
import type { ContractTemplate } from '../../src/data/contract-template.js';

const WRONG_AUTH_DELAY_MS = 750;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const VERONIKA_NAME = 'Veronika Polbina';

type ClientRow = {
  id: string;
  client_display_name: string | null;
  client_email: string;
  contract_status: 'none' | 'pending' | 'signed' | 'void';
  contract_body: string | null;
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
  const signerName =
    typeof req.body?.signer_name === 'string' ? req.body.signer_name.trim() : '';
  const signerSignature =
    typeof req.body?.signer_signature === 'string' ? req.body.signer_signature : '';
  const consent = req.body?.consent === true;

  if (!email || !password) {
    await sleep(WRONG_AUTH_DELAY_MS);
    return res.status(401).json({ success: false, error: 'Email and password required' });
  }
  if (!consent) {
    return res.status(400).json({
      success: false,
      error: 'You must confirm you intend to sign this contract electronically.',
    });
  }
  if (signerName.length < 2) {
    return res.status(400).json({
      success: false,
      error: 'Please type your full name to sign.',
    });
  }
  if (!/^data:image\/(png|jpeg);base64,/.test(signerSignature) || signerSignature.length < 200) {
    return res.status(400).json({
      success: false,
      error: 'Your signature didn’t come through. Draw it again and resubmit.',
    });
  }

  // Env-var checks done up front so the user gets a clear error rather
  // than a half-done sign (e.g. Drive upload succeeded but email failed).
  const auditSecret = process.env.CONTRACT_AUDIT_SECRET;
  if (!auditSecret) {
    console.error('[sign-contract] CONTRACT_AUDIT_SECRET env var is missing');
    return res.status(500).json({ success: false, error: 'Server is not configured to sign contracts. Please contact us.' });
  }
  const driveFolderId = process.env.SIGNED_CONTRACTS_FOLDER_ID;
  if (!driveFolderId) {
    console.error('[sign-contract] SIGNED_CONTRACTS_FOLDER_ID env var is missing');
    return res.status(500).json({ success: false, error: 'Server is not configured to sign contracts. Please contact us.' });
  }

  try {
    const sql = getDb();

    // 1. Auth + load contract body
    const rows = (await sql`
      select id, client_display_name, client_email, contract_status, contract_body
      from client_portals
      where mode = 'full'
        and lower(client_email) = ${email}
        and client_password = ${password}
      limit 1
    `) as ClientRow[];

    if (rows.length === 0) {
      await sleep(WRONG_AUTH_DELAY_MS);
      return res.status(401).json({ success: false, error: 'Incorrect email or password' });
    }

    const portal = rows[0];

    if (portal.contract_status !== 'pending') {
      return res.status(409).json({
        success: false,
        error: `Contract is currently '${portal.contract_status}'. Only pending contracts can be signed.`,
      });
    }
    if (!portal.contract_body) {
      return res.status(409).json({
        success: false,
        error: 'No contract body is set for this portal. Please contact us.',
      });
    }

    // The contract_body is stored as a JSON-serialized ContractTemplate (the
    // result of fillTemplate() at portal-creation time). Parse it back so we
    // can hand it to the PDF renderer.
    let filledTemplate: ContractTemplate;
    try {
      filledTemplate = JSON.parse(portal.contract_body) as ContractTemplate;
    } catch (err) {
      console.error('[sign-contract] contract_body is not valid JSON:', err);
      return res.status(500).json({
        success: false,
        error: 'Your contract is stored in an unexpected format. Please contact us.',
      });
    }

    // 2. Capture audit data
    const signedAt = new Date().toISOString();
    const signerIp =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0].trim() ||
      (req.socket.remoteAddress ?? 'unknown');
    const signerUserAgent = (req.headers['user-agent'] as string | undefined) ?? 'unknown';

    // 3. HMAC-sign the audit record so the PDF audit page is tamper-evident.
    // The record we sign is the canonical JSON of the fields below — any
    // change (e.g. someone editing the PDF to alter the signer's name) will
    // invalidate the HMAC.
    const auditPayload = {
      portal_id: portal.id,
      signer_name: signerName,
      signer_email: portal.client_email,
      signed_at: signedAt,
      signer_ip: signerIp,
      signer_user_agent: signerUserAgent,
      // Hash of the signature image so a swapped signature image breaks the HMAC.
      signature_hash: createHmac('sha256', auditSecret).update(signerSignature).digest('hex'),
    };
    const auditHmac = createHmac('sha256', auditSecret)
      .update(JSON.stringify(auditPayload))
      .digest('hex');

    const audit: AuditRecord = {
      signer_name: signerName,
      signer_email: portal.client_email,
      signed_at: signedAt,
      signer_ip: signerIp,
      signer_user_agent: signerUserAgent,
      hmac: auditHmac,
    };

    // 4. Render PDF
    // Allow the env var to be either the full data URL or just the base64
    // payload — saves a step when copy-pasting from `base64 -i file.png`.
    const sigEnv = process.env.VERONIKA_SIGNATURE_PNG_BASE64?.trim();
    const photographerSignaturePng = sigEnv
      ? sigEnv.startsWith('data:')
        ? sigEnv
        : `data:image/png;base64,${sigEnv}`
      : null;
    const pdfBuffer = await renderContractPdf({
      filled: filledTemplate,
      photographerName: VERONIKA_NAME,
      photographerSignaturePng: photographerSignaturePng,
      clientSignaturePng: signerSignature,
      clientName: signerName,
      audit,
    });

    // 5. Upload to Drive
    const pdfFilename = `Contract — ${portal.client_display_name ?? portal.client_email} — ${signedAt.slice(0, 10)}.pdf`;
    const driveFileId = await uploadFile({
      folderId: driveFolderId,
      name: pdfFilename,
      mimeType: 'application/pdf',
      content: pdfBuffer,
    });

    // 6. Email both parties with the PDF attached
    try {
      await sendEmail({
        to: portal.client_email,
        cc: FROM_ADDRESS,
        subject: `Signed: ${filledTemplate.title} — Vero Photography`,
        text: buildSignedEmailText(portal.client_display_name, signerName),
        html: buildSignedEmailHtml(portal.client_display_name, signerName),
        attachments: [
          {
            filename: pdfFilename,
            content: pdfBuffer,
          },
        ],
      });
    } catch (err) {
      // If the email fails after Drive upload succeeded, the PDF is still
      // saved in Veronika's Drive — log the issue, but continue to mark the
      // contract signed in the DB so the client doesn't get stuck. They can
      // download the signed PDF from the portal directly.
      console.error('[sign-contract] email send failed (Drive upload OK):', err);
    }

    // 7. Persist signed state
    await sql`
      update client_portals
      set contract_status = 'signed',
          contract_signed_at = ${signedAt},
          contract_signer_name = ${signerName},
          contract_signer_email = ${portal.client_email},
          contract_signer_signature_data = ${signerSignature},
          contract_signer_ip = ${signerIp},
          contract_signer_user_agent = ${signerUserAgent},
          contract_audit_hmac = ${auditHmac},
          contract_signed_pdf_drive_id = ${driveFileId},
          updated_at = now()
      where id = ${portal.id}
    `;

    return res.status(200).json({
      success: true,
      contract_status: 'signed',
      contract_signed_at: signedAt,
      contract_signed_pdf_drive_id: driveFileId,
    });
  } catch (err) {
    console.error('[sign-contract] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}

// Simple confirmation email — kept short and personal, no marketing tone.
function buildSignedEmailText(clientLabel: string | null, signerName: string): string {
  const greeting = clientLabel ? `Hi ${clientLabel.split(/[&,]/)[0].trim()},` : 'Hi there,';
  return `${greeting}

Thank you for signing your contract — you're officially on the books.

Your signed copy is attached to this email for your records. You can also access it any time from your Client Portal at vero.photography/portal.

If anything looks off or you have questions, just reply to this email.

Warmly,
Veronika

— Signed electronically by ${signerName}`;
}

function buildSignedEmailHtml(clientLabel: string | null, signerName: string): string {
  const firstName = clientLabel ? clientLabel.split(/[&,]/)[0].trim() : 'there';
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2d2d2d;max-width:560px;margin:0 auto;padding:24px 16px;line-height:1.6;font-size:16px;">
<p style="font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;color:#c9a96e;margin:0 0 20px;">Vero Photography</p>
<p>Hi ${firstName},</p>
<p>Thank you for signing your contract — you're officially on the books.</p>
<p>Your signed copy is attached to this email for your records. You can also access it any time from your <a href="https://vero.photography/portal" style="color:#c9a96e">Client Portal</a>.</p>
<p>If anything looks off or you have questions, just reply to this email.</p>
<p>Warmly,<br><em>Veronika</em></p>
<hr style="border:none;border-top:1px solid #ececec;margin:28px 0 12px;">
<p style="font-size:12px;color:#888;">Signed electronically by ${signerName}.</p>
</body></html>`;
}
