/**
 * The shape of the message body a website contact submission becomes.
 *
 * api/_inbox-record.ts turns a submission into an inbound message whose body
 * is a few labelled lines. One of those lines carries the wedding package,
 * already resolved server-side by api/_packages.ts, so it is the only place
 * in the whole inbox where the package a visitor actually clicked survives as
 * text rather than as a model's paraphrase.
 *
 * The prefix lives here, in a module with NO IMPORTS OF ITS OWN, because both
 * sides need it: the handler writes the line and the admin reads it back to
 * prefill the new-client form. A tiny shared constant beats retyping the
 * string in the browser, where a silent divergence would make the prefill
 * quietly stop working with no error anywhere.
 *
 * No imports is deliberate rather than incidental. api/ reaching into src/ is
 * how this project once killed its entire admin API: an extensionless
 * relative import in any src module the handlers touch takes the whole
 * function down, and both tsc and the build pass. A file with nothing to
 * import cannot carry that risk, and it keeps the contract-template data out
 * of the inbox function's bundle.
 */

/** Written by api/_inbox-record.ts, read by the new-client prefill. */
export const WEDDING_PACKAGE_LINE_PREFIX = 'Wedding package: ';

/**
 * The package line out of a submission body, or null.
 *
 * Null for every message that is not a website form submission, which is
 * most of them: Instagram threads, replies, and history imported before the
 * package column existed all simply have no such line. Failing closed here
 * means the form falls back to exactly the behaviour it has today.
 */
export function readWeddingPackage(body: string | null | undefined): string | null {
  if (!body) return null;
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(WEDDING_PACKAGE_LINE_PREFIX)) continue;
    const value = trimmed.slice(WEDDING_PACKAGE_LINE_PREFIX.length).trim();
    if (value) return value;
  }
  return null;
}
