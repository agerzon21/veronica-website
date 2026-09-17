import type { IconType } from 'react-icons';
import FaExternalLinkAlt from '../icons/fa/FaExternalLinkAlt';
import FaGoogle from '../icons/fa/FaGoogle';
import FaInstagram from '../icons/fa/FaInstagram';
import FaYelp from '../icons/fa/FaYelp';

/**
 * Names the site a review lives on, for the button that opens it there.
 *
 * Shared by the public review popup, which renders the button, and the admin
 * editor, which previews its label under the link field, so the two can never
 * disagree about what a visitor will see.
 *
 * The link's host wins over the `source` dropdown: the host is what the button
 * actually opens, and a review whose source was left on "Manual entry" but
 * whose link is a Google Maps share link should still say Google.
 */

export type ReviewSource = 'google' | 'yelp' | 'instagram' | 'email' | 'manual';

interface Site {
  name: string;
  icon: IconType;
}

const HOSTS: Array<[RegExp, Site]> = [
  // maps.app.goo.gl is what Google Maps' "Share review" button hands out.
  [/(^|\.)(google\.[a-z.]+|goo\.gl|g\.page)$/, { name: 'Google', icon: FaGoogle }],
  [/(^|\.)yelp\.[a-z.]+$/, { name: 'Yelp', icon: FaYelp }],
  [/(^|\.)instagram\.com$/, { name: 'Instagram', icon: FaInstagram }],
  [/(^|\.)facebook\.com$/, { name: 'Facebook', icon: FaExternalLinkAlt }],
  [/(^|\.)theknot\.com$/, { name: 'The Knot', icon: FaExternalLinkAlt }],
  [/(^|\.)weddingwire\.com$/, { name: 'WeddingWire', icon: FaExternalLinkAlt }],
  [/(^|\.)thumbtack\.com$/, { name: 'Thumbtack', icon: FaExternalLinkAlt }],
];

const BY_SOURCE: Partial<Record<ReviewSource, Site>> = {
  google: { name: 'Google', icon: FaGoogle },
  yelp: { name: 'Yelp', icon: FaYelp },
  instagram: { name: 'Instagram', icon: FaInstagram },
};

export const reviewSite = (source: ReviewSource | null | undefined, url?: string | null): Site | null => {
  if (url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      const hit = HOSTS.find(([re]) => re.test(host));
      if (hit) return hit[1];
    } catch {
      // Not a parseable URL; fall through to the dropdown value.
    }
  }
  return (source && BY_SOURCE[source]) || null;
};

/** The verify button's label: "Read it on Google", or a neutral fallback. */
export const verifyLabel = (source: ReviewSource | null | undefined, url?: string | null): string => {
  const site = reviewSite(source, url);
  return site ? `Read it on ${site.name}` : 'Read the original';
};

/** Links copied off Google Maps images. They expire, so the admin warns. */
export const isGooglePhotoCdnUrl = (url: string): boolean => {
  try {
    return /(^|\.)googleusercontent\.com$/i.test(new URL(url.trim()).hostname);
  } catch {
    return false;
  }
};

export const isHttpsUrl = (url: string): boolean => {
  try {
    return new URL(url.trim()).protocol === 'https:';
  } catch {
    return false;
  }
};
