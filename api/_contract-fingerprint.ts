/**
 * A fingerprint of the exact contract text a client was shown.
 *
 * The portal sends it with the contract (api/portal/_client.ts), and the
 * client sends it back when signing (api/portal/_sign-contract.ts), which
 * refuses if the stored text no longer matches. That is half of the fix for
 * the signing race (audit M10): Vero saving a price edit while the client was
 * reading used to re-render the contract, and the client then signed text they
 * had never seen. One function, so the two ends cannot compute it differently.
 */

import { createHash } from 'node:crypto';

export function contractFingerprint(body: string | null | undefined): string | null {
  if (!body) return null;
  return createHash('sha256').update(body, 'utf8').digest('hex');
}
