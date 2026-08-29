import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_admin-auth.js';

/**
 * Config health — which environment variables are actually set in the running
 * deployment, and what silently stops working when one is not.
 *
 * WHY THIS EXISTS
 * The recurring failure mode on this project is not a crash, it is a feature
 * that quietly does nothing. VERCEL_DEPLOY_HOOK_URL is the standing example:
 * api/cron/_gallery-sync.ts calls triggerDeployHook() after publishing new
 * photos, the variable has never been set in Vercel, so the call logs one line
 * and returns false. Newly published photos therefore never get a prerendered
 * page, and nothing anywhere surfaces that.
 *
 * A green checklist is not the point. The point is that an unset variable
 * becomes VISIBLE instead of being discovered months later.
 *
 * SECURITY
 * Returns booleans only. No value, no prefix, no length — a set/unset bit
 * cannot leak a credential. Super-only, because knowing which integrations
 * exist is itself a small amount of infrastructure detail.
 */

/**
 * DELIBERATELY NOT LISTED, so their absence does not read as an oversight:
 *   EMAIL_REPLY_TO          falls back to EMAIL_FROM_ADDRESS
 *   INBOUND_EMAIL_PROVIDER  defaults to 'improvmx', the provider in use
 *   VERCEL_ENV              injected by Vercel, never set by hand
 *   VERCEL_ENV_VAR_LINK     cosmetic deep link in one admin screen
 *
 * Everything else that api/ reads from process.env appears below. If you add a
 * new process.env read, add it here too — an unlisted variable is invisible
 * again, which is the whole problem this file exists to solve.
 */

type Severity = 'critical' | 'feature' | 'optional';

interface Check {
  key: string;
  severity: Severity;
  /** What this powers, in plain language. */
  purpose: string;
  /** What actually happens when it is missing. Concrete, not "may not work". */
  ifMissing: string;
}

const CHECKS: Check[] = [
  // ── Critical: the site or the admin panel is broken without these ──
  {
    key: 'POSTGRES_URL',
    severity: 'critical',
    purpose: 'Neon database connection',
    ifMissing: 'Everything backed by the database fails: portals, inbox, gallery, admin.',
  },
  {
    key: 'ADMIN_PASSWORD',
    severity: 'critical',
    purpose: "Vero's admin login, and the lockout-proof fallback",
    ifMissing: 'requireAdmin returns 500 and nobody can use the admin panel.',
  },
  {
    key: 'LOGIN_ADMIN_EMAIL',
    severity: 'critical',
    purpose: "Vero's admin login email",
    ifMissing: 'Admin login returns 500.',
  },
  {
    key: 'SUPER_ADMIN_PASSWORD',
    severity: 'critical',
    purpose: 'Super-admin login and break-glass recovery',
    ifMissing: 'No super-admin access; account management and crons are unreachable.',
  },
  {
    key: 'LOGIN_SUPER_EMAIL',
    severity: 'critical',
    purpose: 'Super-admin login email',
    ifMissing: 'Super-admin cannot sign in, and break-glass password recovery cannot resolve an account.',
  },
  {
    key: 'RESEND_API_KEY',
    severity: 'critical',
    purpose: 'All outbound email',
    ifMissing: 'No email sends at all: invites, contracts, gallery links, password resets.',
  },

  // ── Feature: something specific silently stops, with no error anywhere ──
  {
    key: 'VERCEL_DEPLOY_HOOK_URL',
    severity: 'feature',
    purpose: 'Rebuild the site after the gallery sync publishes new photos',
    ifMissing:
      'Newly published photos get no prerendered page until the next manual deploy, so search engines see the SPA shell for those URLs.',
  },
  {
    key: 'GOOGLE_SERVICE_ACCOUNT_JSON',
    severity: 'feature',
    purpose: 'Google Drive access',
    ifMissing: 'Gallery sync and client gallery delivery both fail — no photos can be read from Drive.',
  },
  {
    key: 'GALLERY_DRIVE_FOLDER_ID',
    severity: 'feature',
    purpose: 'Which Drive folder feeds the public gallery',
    ifMissing: 'The gallery sync has nothing to sync from.',
  },
  {
    key: 'OPENAI_API_KEY',
    severity: 'feature',
    purpose: 'Photo descriptions, the assistant, and AI reply drafting',
    ifMissing: 'New gallery photos get no generated alt text or description, and the assistant stops answering.',
  },
  {
    key: 'IG_ACCESS_TOKEN',
    severity: 'feature',
    purpose: 'Instagram feed and DM inbox',
    ifMissing: 'The homepage Instagram section falls back to cached tiles, and Instagram DMs stop arriving.',
  },
  {
    key: 'IG_USER_ID',
    severity: 'feature',
    purpose: 'Which Instagram account to read',
    ifMissing: 'Instagram feed and DM handling cannot identify the account.',
  },
  {
    key: 'IG_APP_SECRET',
    severity: 'feature',
    purpose: 'Verifying Instagram webhook signatures',
    ifMissing: 'Every Instagram webhook is rejected with a 403, so DMs never arrive.',
  },
  {
    key: 'CRON_SECRET',
    severity: 'feature',
    purpose: 'Authenticating scheduled cron invocations',
    ifMissing: 'Cron endpoints cannot distinguish a real schedule trigger from an anonymous request.',
  },
  {
    key: 'BLOB_READ_WRITE_TOKEN',
    severity: 'feature',
    purpose: 'Storing signed contract PDFs',
    ifMissing: 'A signed contract cannot be saved or downloaded.',
  },
  {
    key: 'INBOX_WEBHOOK_TOKEN',
    severity: 'feature',
    purpose: 'Authenticating the inbound email webhook',
    ifMissing: 'Inbound client email is rejected and never reaches the inbox.',
  },
  {
    key: 'EMAIL_FROM_ADDRESS',
    severity: 'feature',
    purpose: 'The address outgoing email is sent from, and the one the inbox treats as "us"',
    ifMissing: 'Falls back to vero@vero.photography. Wrong only if that address ever changes.',
  },
  {
    key: 'IG_WEBHOOK_VERIFY_TOKEN',
    severity: 'feature',
    purpose: "Meta's webhook subscription handshake",
    ifMissing: 'The Instagram webhook cannot be re-subscribed in the Meta dashboard.',
  },
  {
    key: 'RESEND_WEBHOOK_SECRET',
    severity: 'feature',
    purpose: 'Verifying Resend delivery-status webhooks',
    ifMissing: 'Bounce and delivery events are not trusted, so send failures stop being reported.',
  },
  {
    key: 'CONTRACT_AUDIT_SECRET',
    severity: 'feature',
    purpose: 'Signing the audit record attached to a signed contract',
    ifMissing: 'Contracts still sign, but without a verifiable audit signature.',
  },
  {
    key: 'SITE_ORIGIN',
    severity: 'feature',
    purpose: 'Absolute URLs in outgoing email',
    ifMissing: 'Falls back to the request Host header — usually right, but wrong for links built inside a cron, which has no request.',
  },

  // ── Optional: cosmetic or convenience only ──
  {
    key: 'VERONIKA_SIGNATURE_PNG_BASE64',
    severity: 'optional',
    purpose: "Vero's signature image on generated contract PDFs",
    ifMissing: 'Contracts render with a typed name instead of the signature image.',
  },
  {
    key: 'EMAIL_FROM_DISPLAY',
    severity: 'optional',
    purpose: 'Friendly From name on outgoing email',
    ifMissing: 'Email shows the bare address as the sender name.',
  },
  {
    key: 'ALEX_EMAIL',
    severity: 'optional',
    purpose: 'Where the Instagram token-expiry reminder is sent',
    ifMissing: 'Falls back to agerzon21@gmail.com.',
  },
  {
    key: 'ADMIN_URL',
    severity: 'optional',
    purpose: 'Deep links back into the admin panel from notification email',
    ifMissing: 'Notification emails link to the site root instead of the relevant screen.',
  },
];

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

  // A variable set to the empty string is not configured. Trim, because a
  // trailing newline pasted into the Vercel UI is a real and confusing way to
  // "set" something that then fails every comparison.
  const isSet = (key: string) => {
    const v = process.env[key];
    return typeof v === 'string' && v.trim().length > 0;
  };

  // No aliasing. api/_db.ts reads process.env.POSTGRES_URL exactly; the
  // DATABASE_URL and POSTGRES_URL_LOCAL fallbacks live only in the scripts run
  // from a laptop. Accepting those here would report green while the deployed
  // app could not connect, which is precisely the kind of confidently-wrong
  // status this screen exists to eliminate.
  const resolved = CHECKS.map((c) => ({ ...c, set: isSet(c.key) }));

  const missing = resolved.filter((c) => !c.set);
  return res.status(200).json({
    success: true,
    environment: process.env.VERCEL_ENV ?? 'development',
    checks: resolved,
    missingCritical: missing.filter((c) => c.severity === 'critical').length,
    missingFeature: missing.filter((c) => c.severity === 'feature').length,
    missingOptional: missing.filter((c) => c.severity === 'optional').length,
  });
}
