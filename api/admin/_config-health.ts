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
  /**
   * What covers for this when it is unset — a hardcoded default, a database
   * value, another variable. null means NOTHING does, and unset genuinely
   * means broken.
   *
   * This distinction is the whole point of the card. Without it every unset
   * variable looks like a problem, the screen cries wolf on eight things that
   * are working perfectly, and it gets ignored — which is worse than not
   * having it, because now the one real gap is buried in noise.
   */
  fallback: string | null;
}

const CHECKS: Check[] = [
  // ── Critical: the site or the admin panel is broken without these ──
  {
    key: 'POSTGRES_URL',
    severity: 'critical',
    purpose: 'Neon database connection',
    ifMissing: 'Everything backed by the database fails: portals, inbox, gallery, admin.',
    fallback: null,
  },
  {
    key: 'ADMIN_PASSWORD',
    severity: 'critical',
    purpose: "Vero's admin login, and the lockout-proof fallback",
    ifMissing: 'requireAdmin returns 500 and nobody can use the admin panel.',
    fallback: null,
  },
  {
    key: 'LOGIN_ADMIN_EMAIL',
    severity: 'critical',
    purpose: "Vero's admin login email",
    ifMissing: 'Admin login returns 500.',
    fallback: null,
  },
  {
    key: 'SUPER_ADMIN_PASSWORD',
    severity: 'critical',
    purpose: 'Super-admin login and break-glass recovery',
    ifMissing: 'No super-admin access; account management and crons are unreachable.',
    fallback: null,
  },
  {
    key: 'LOGIN_SUPER_EMAIL',
    severity: 'critical',
    purpose: 'Super-admin login email',
    ifMissing: 'Super-admin cannot sign in, and break-glass password recovery cannot resolve an account.',
    fallback: null,
  },
  {
    key: 'RESEND_API_KEY',
    severity: 'critical',
    purpose: 'All outbound email',
    ifMissing: 'No email sends at all: invites, contracts, gallery links, password resets.',
    fallback: null,
  },

  // ── Feature: something specific silently stops, with no error anywhere ──
  {
    key: 'VERCEL_DEPLOY_HOOK_URL',
    severity: 'feature',
    purpose: 'Rebuild the site after the gallery sync publishes new photos',
    ifMissing:
      'Newly published photos get no prerendered page until the next manual deploy, so search engines see the SPA shell for those URLs.',
    fallback: null,
  },
  {
    key: 'GOOGLE_SERVICE_ACCOUNT_JSON',
    severity: 'feature',
    purpose: 'Google Drive access',
    ifMissing: 'Gallery sync and client gallery delivery both fail — no photos can be read from Drive.',
    fallback: null,
  },
  {
    key: 'GALLERY_DRIVE_FOLDER_ID',
    severity: 'feature',
    purpose: 'Which Drive folder feeds the public gallery',
    ifMissing: 'Only matters if the database value is also missing — then the sync has nothing to read.',
    // _gallery-sync.ts:143 is `dbValue ?? process.env.GALLERY_DRIVE_FOLDER_ID`,
    // so the database WINS and this env var is legacy backwards-compat.
    fallback: 'Set in the database (Gallery settings), which takes priority over this.',
  },
  {
    key: 'OPENAI_API_KEY',
    severity: 'feature',
    purpose: 'Photo descriptions, the assistant, and AI reply drafting',
    ifMissing: 'New gallery photos get no generated alt text or description, and the assistant stops answering.',
    fallback: null,
  },
  {
    key: 'IG_ACCESS_TOKEN',
    severity: 'feature',
    purpose: 'Instagram feed and DM inbox',
    ifMissing: 'The homepage Instagram section falls back to cached tiles, and Instagram DMs stop arriving.',
    fallback: 'Cached Instagram tiles keep the homepage looking right, but nothing refreshes.',
  },
  {
    key: 'IG_USER_ID',
    severity: 'feature',
    purpose: 'Which Instagram account to read',
    ifMissing: 'Instagram feed and DM handling cannot identify the account.',
    fallback: null,
  },
  {
    key: 'IG_APP_SECRET',
    severity: 'feature',
    purpose: 'Verifying Instagram webhook signatures',
    ifMissing: 'Every Instagram webhook is rejected with a 403, so DMs never arrive.',
    fallback: null,
  },
  {
    key: 'CRON_SECRET',
    severity: 'feature',
    purpose: 'Authenticating scheduled cron invocations',
    ifMissing: 'Cron endpoints cannot distinguish a real schedule trigger from an anonymous request.',
    fallback: null,
  },
  {
    key: 'BLOB_READ_WRITE_TOKEN',
    severity: 'feature',
    purpose: 'Storing signed contract PDFs',
    ifMissing: 'A signed contract cannot be saved or downloaded.',
    fallback: null,
  },
  {
    key: 'INBOX_WEBHOOK_TOKEN',
    severity: 'feature',
    purpose: 'Authenticating the inbound email webhook',
    ifMissing: 'Inbound client email is rejected and never reaches the inbox.',
    fallback: null,
  },
  {
    key: 'EMAIL_FROM_ADDRESS',
    severity: 'optional',
    purpose: 'The address outgoing email is sent from, and the one the inbox treats as "us"',
    ifMissing: 'Nothing, unless that address ever changes — then this must be set.',
    fallback: 'Hardcoded vero@vero.photography.',
  },
  {
    key: 'IG_WEBHOOK_VERIFY_TOKEN',
    severity: 'feature',
    purpose: "Meta's webhook subscription handshake",
    ifMissing: 'The Instagram webhook cannot be re-subscribed in the Meta dashboard.',
    fallback: null,
  },
  {
    key: 'RESEND_WEBHOOK_SECRET',
    severity: 'optional',
    purpose: 'Verifying inbound email webhooks IF the provider is ever switched to Resend',
    ifMissing: 'Nothing, while ImprovMX is the inbound provider. Required only if INBOUND_EMAIL_PROVIDER is set to resend.',
    // parseResend is only reachable when PROVIDER === 'resend'; the default and
    // active provider is improvmx, so this code path never runs today.
    fallback: 'Unused — the inbound provider is ImprovMX.',
  },
  {
    key: 'CONTRACT_AUDIT_SECRET',
    severity: 'feature',
    purpose: 'Signing the audit record attached to a signed contract',
    ifMissing: 'Contracts still sign, but without a verifiable audit signature.',
    fallback: null,
  },
  {
    key: 'SITE_ORIGIN',
    severity: 'optional',
    purpose: 'Absolute URLs in outgoing email',
    ifMissing: 'Nothing today. All six uses are inside request handlers, which have a Host header to fall back on.',
    // Checked every use: _share-gallery, _request-reset, _resend-invite,
    // _portals-create (x2), _portal-deliver. None is in a cron.
    fallback: "Request Host header, then the hardcoded https://vero.photography.",
  },

  // ── Optional: cosmetic or convenience only ──
  {
    key: 'VERONIKA_SIGNATURE_PNG_BASE64',
    severity: 'optional',
    purpose: "Vero's signature image on generated contract PDFs",
    ifMissing: 'Contracts render with a typed name instead of the signature image.',
    fallback: 'Typed name is used instead of the signature image.',
  },
  {
    key: 'EMAIL_FROM_DISPLAY',
    severity: 'optional',
    purpose: 'Friendly From name on outgoing email',
    ifMissing: 'Email shows the bare address as the sender name.',
    fallback: 'The bare email address is shown as the sender name.',
  },
  {
    key: 'ALEX_EMAIL',
    severity: 'optional',
    purpose: 'Where the Instagram token-expiry reminder is sent',
    ifMissing: 'Falls back to agerzon21@gmail.com.',
    fallback: 'Hardcoded agerzon21@gmail.com.',
  },
  {
    key: 'ADMIN_URL',
    severity: 'optional',
    purpose: 'Deep links back into the admin panel from notification email',
    ifMissing: 'Notification emails link to the site root instead of the relevant screen.',
    fallback: 'Links point at the site root.',
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
  // The number that actually matters: unset AND nothing covering for it.
  // Unset-but-covered is normal and must not be counted as a problem, or the
  // card reports eight failures on a site where everything works.
  const broken = missing.filter((c) => c.fallback === null);

  return res.status(200).json({
    success: true,
    environment: process.env.VERCEL_ENV ?? 'development',
    checks: resolved,
    broken: broken.length,
    coveredByFallback: missing.length - broken.length,
    brokenCritical: broken.filter((c) => c.severity === 'critical').length,
  });
}
