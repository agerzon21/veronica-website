/**
 * Turns a Google Drive share link into something an <img> can actually load.
 *
 * The link you get from Drive's "Share" button points at a viewer PAGE, not at
 * the file: dropping it into an <img src> renders a broken image every time.
 * Vero is pasting these in for review author photos, usually a frame from the
 * client's own session, which is a much better portrait than a Google avatar
 * so the admin should just accept what the Share button gives her.
 *
 * Handled forms, all of which carry the same file id:
 *   https://drive.google.com/file/d/<ID>/view?usp=sharing
 *   https://drive.google.com/open?id=<ID>
 *   https://drive.google.com/uc?export=view&id=<ID>
 *   https://docs.google.com/uc?id=<ID>
 *
 * They become https://drive.google.com/thumbnail?id=<ID>&sz=w<size>, which
 * serves a real image and lets Google do the downscaling, worth having when
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

/**
 * Re-points an existing Drive thumbnail url at another width.
 *
 * Lived in ClientGallery until the journal needed the same thing. api/_drive.ts
 * hard-codes sz=w800 on every thumbnail it hands out, and w800 is about 300KB,
 * so a 163-file client gallery is ~36MB pulled from a third-party host. That is
 * what was killing phones: iOS Safari cancels image requests under memory and
 * connection pressure, the cancel surfaces as onError, and the tile went to a
 * permanent placeholder. The same measured file is 83KB at w400 and 179KB at
 * w600, so letting the browser pick against `sizes` cuts a phone 2-4x.
 *
 * `jpeg` appends Drive's -rj flag, which forces a JPEG response. Measured over
 * all 55 journal preview thumbnails: 54 of them are JPEG at source already and
 * come back byte-identical, and the one PNG-sourced frame drops from 501KB to
 * 85KB at w800 (144KB to 35KB at w400) at the same pixel dimensions. It is a
 * re-encode, so it is for photographs, not for anything with flat colour or
 * text in it.
 *
 * Drive honours these widths exactly: w200/w300/w400/w600/w800 all come back
 * at precisely that width. Verified against every id the journal serves.
 */
export const thumbAt = (url: string, width: number, jpeg = false): string => {
  try {
    const u = new URL(url);
    u.searchParams.set('sz', `w${width}${jpeg ? '-rj' : ''}`);
    return u.toString();
  } catch {
    // Not a URL we can parse: fall back to whatever the API gave us.
    return url;
  }
};

/** `thumbAt` over a candidate ladder, as a srcset string. */
export const driveThumbSrcSet = (url: string, widths: number[], jpeg = false): string =>
  widths.map((w) => `${thumbAt(url, w, jpeg)} ${w}w`).join(', ');
