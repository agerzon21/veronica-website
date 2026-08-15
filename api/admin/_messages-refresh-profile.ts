/**
 * Admin: manually re-fetch a conversation's IG profile from Meta.
 *
 * POST { password, conversationId }
 *   → 200 { success, name, handle, profilePicUrl }
 *   → 400 missing conversationId
 *   → 401 wrong password
 *   → 404 no such conversation
 *   → 422 profile fetch failed (e.g. stale IGSID, missing scope,
 *          rate-limited, or user has never DM'd us). We surface a
 *          generic message; the specific reason is in the server log
 *          under `[ig-profile]`.
 *
 * Powers the small "refresh from Instagram" button in the conversation
 * header. Called on demand — normally the webhook path enriches new
 * conversations automatically, so this is only needed to (a) fix rows
 * that predate the auto-enrichment feature or (b) pick up a name
 * change on the user's IG profile.
 *
 * Unlike the webhook path (which uses COALESCE to preserve existing
 * fields), this endpoint OVERWRITES with whatever Meta returns —
 * "refresh" means "please replace what I have with the current
 * truth". Manual intent, so we trust it.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../_db.js';
import { requireAdmin } from '../_admin-auth.js';
import { fetchIgProfile } from '../_ig-profile.js';

interface ConversationRow {
  id: string;
  platform: string;
  external_user_id: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const auth = await requireAdmin(req.body?.password);
  if (!auth.ok) return res.status(auth.status).json({ success: false, error: auth.error });

  const conversationId =
    typeof req.body?.conversationId === 'string' ? req.body.conversationId.trim() : '';
  if (!conversationId) {
    return res.status(400).json({ success: false, error: 'conversationId is required' });
  }

  try {
    const sql = getDb();

    const rows = (await sql`
      SELECT id, platform, external_user_id
      FROM conversations
      WHERE id = ${conversationId}
      LIMIT 1
    `) as ConversationRow[];

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const convo = rows[0];
    if (convo.platform !== 'instagram') {
      return res
        .status(422)
        .json({ success: false, error: 'Only Instagram conversations can be refreshed.' });
    }

    const profile = await fetchIgProfile(convo.external_user_id);
    if (!profile) {
      // fetchIgProfile logs the specific reason under [ig-profile]
      // — we surface a generic user-facing message.
      return res
        .status(422)
        .json({ success: false, error: 'Could not fetch profile from Instagram.' });
    }

    // Overwrite (manual refresh = trust the caller's intent). Note we
    // still don't clobber a field with NULL when the OTHER field on
    // Meta's side is populated — fetchIgProfile only returns non-null
    // strings for fields Meta actually gave us. So if Meta returns
    // { name: "Peter", username: null }, we set name=Peter and set
    // handle=null. That's the correct behavior: the user removed
    // their public handle on IG side.
    await sql`
      UPDATE conversations
      SET contact_name = ${profile.name},
          contact_handle = ${profile.username},
          contact_profile_pic_url = ${profile.profilePicUrl},
          updated_at = NOW()
      WHERE id = ${conversationId}
    `;

    return res.status(200).json({
      success: true,
      name: profile.name,
      handle: profile.username,
      profilePicUrl: profile.profilePicUrl,
    });
  } catch (err) {
    console.error('[admin/messages-refresh-profile] handler failed:', err);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
