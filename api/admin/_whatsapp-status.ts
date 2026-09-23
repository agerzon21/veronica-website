/**
 * Is WhatsApp actually plugged in, and is anything coming through it?
 *
 * POST { password }
 *   → 200 { success, configured, env, webhookUrl, threads, messages,
 *           lastInboundAt, lastOutboundAt, linkedThreads }
 *   → 403 non-super
 *   → 405 non-POST
 *
 * Two questions, because they fail independently and the answers look the
 * same from the outside. The credentials can all be set while Meta was never
 * pointed at the webhook, in which case nothing arrives and nothing anywhere
 * says why; and messages can be arriving perfectly while the send token is
 * missing, in which case every reply fails at the moment it matters. So this
 * reports the four variables AND the traffic, and the card shows both.
 *
 * SECURITY: booleans and counts. No token, no prefix, no length, and no
 * message body. The webhook URL is derived from the request's own Host and is
 * public by construction, since Meta has to POST to it.
 *
 * Read-only, but SUPER only, matching config-health: which integrations exist
 * is itself infrastructure detail.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';
import { getDb } from '../_db.js';

const ENV_KEYS = [
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
  'WHATSAPP_ACCESS_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });
  if (auth.level !== 'super') {
    return res.status(403).json({ success: false, error: 'Requires super-admin access.' });
  }

  // Trimmed, because a value pasted into Vercel with a trailing newline is
  // "set" and then fails every comparison it is used in.
  const env: Record<string, boolean> = {};
  for (const k of ENV_KEYS) {
    const v = process.env[k];
    env[k] = typeof v === 'string' && v.trim().length > 0;
  }
  const configured = ENV_KEYS.every((k) => env[k]);

  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'vero.photography') as string;
  const webhookUrl = `https://${String(host).split(',')[0].trim()}/api/inbox/whatsapp-webhook`;

  const sql = getDb();
  let threads = 0;
  let messages = 0;
  let linkedThreads = 0;
  let lastInboundAt: string | null = null;
  let lastOutboundAt: string | null = null;

  try {
    const rows = (await sql`
      SELECT
        (SELECT COUNT(*) FROM conversations WHERE platform = 'whatsapp')                          AS threads,
        (SELECT COUNT(*) FROM conversations
          WHERE platform = 'whatsapp' AND linked_client_portal_id IS NOT NULL)                    AS linked,
        (SELECT COUNT(*) FROM messages WHERE channel = 'whatsapp')                                AS messages,
        (SELECT MAX(sent_at) FROM messages WHERE channel = 'whatsapp' AND direction = 'inbound')  AS last_in,
        (SELECT MAX(sent_at) FROM messages WHERE channel = 'whatsapp' AND direction = 'outbound') AS last_out
    `) as Array<{
      threads: string | number;
      linked: string | number;
      messages: string | number;
      last_in: string | null;
      last_out: string | null;
    }>;
    const r = rows[0];
    if (r) {
      threads = Number(r.threads) || 0;
      linkedThreads = Number(r.linked) || 0;
      messages = Number(r.messages) || 0;
      lastInboundAt = r.last_in;
      lastOutboundAt = r.last_out;
    }
  } catch (err) {
    // The counts are the nice-to-have half. A database hiccup must not hide
    // the configuration half, which is the part that tells Alex what to do.
    console.error('[admin/whatsapp-status] counts failed (non-fatal):', err);
  }

  return res.status(200).json({
    success: true,
    configured,
    env,
    webhookUrl,
    threads,
    linkedThreads,
    messages,
    lastInboundAt,
    lastOutboundAt,
  });
}
