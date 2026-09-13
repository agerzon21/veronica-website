/**
 * Turns a Google Drive share link into something an <img> can actually load.
 *
 * The link you get from Drive's "Share" button points at a viewer PAGE, not at
 * the file: dropping it into an <img src> renders a broken image every time.
 * Vero is pasting these in for review author photos — usually a frame from the
 * client's own session, which is a much better portrait than a Google avatar —
 * so the admin should just accept what the Share button gives her.
 *
 * Handled forms, all of which carry the same file id:
 *   https://drive.google.com/file/d/<ID>/view?usp=sharing
 *   https://drive.google.com/open?id=<ID>
 *   https://drive.google.com/uc?export=view&id=<ID>
 *   https://docs.google.com/uc?id=<ID>
 *
 * They become https://drive.google.com/thumbnail?id=<ID>&sz=w<size>, which
 * serves a real image and lets Google do the downscaling — worth having when
 * the source is a full-resolution photograph and the destination is a 96px
 * square.
 *
 * THE FILE STILL HAS TO BE SHARED. Drive returns a 403 for "Anyone with the
 * link" being off, and no URL rewriting can fix that, so the admin warns
 * about it at the input instead of failing silently on the public site.
 *
 * Anything that is not a Drive link is returned untouched.
 */

const DRIVE_ID_PATTERNS = [
  /\/file\/d\/([a-zA-Z0-9_-]{10,})/,
  /[?&]id=([a-zA-Z0-9_-]{10,})/,
  /\/d\/([a-zA-Z0-9_-]{10,})/,
];

export const isDriveUrl = (url: string): boolean =>
  /^https?:\/\/(drive|docs)\.google\.com\//i.test(url.trim());

export const driveFileId = (url: string): string | null => {
  if (!isDriveUrl(url)) return null;
  for (const re of DRIVE_ID_PATTERNS) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
};

export const toDirectImageUrl = (url: string | null | undefined, size = 400): string => {
  const raw = (url ?? '').trim();
  if (!raw) return '';
  const id = driveFileId(raw);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w${size}` : raw;
};
