import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

// Route-aware base SEO. Each route gets its own title, description, canonical,
// and OG/Twitter image so Google doesn't see every page as a duplicate of /.
// Page components are still free to override individual tags via their own
// Helmet — later Helmet instances win, so e.g. IndividualPhoto.tsx overrides
// these for /photo/:category/:photoId.

const SITE_URL = 'https://vero.photography';
const DEFAULT_IMAGE = `${SITE_URL}/assets/photos/site/contact-bg.webp`;

type RouteMeta = { title: string; description: string; image?: string };

const ROUTE_META: Record<string, RouteMeta> = {
  '/': {
    // 59 chars — under Google's 60-char SERP truncation threshold so the
    // whole brand+keyword string shows in search results. Previous title
    // was 78 chars and got truncated mid-word.
    title: 'Vero Photography | Scranton Wedding & Portrait Photographer',
    description:
      'Wedding, portrait, family, and maternity photography by Veronika Polbina. Based in Scranton, Pennsylvania, available worldwide.',
  },
  '/about': {
    title: 'About Veronika Polbina | Vero Photography',
    description:
      'About Veronika Polbina: wedding, portrait, family, and maternity photographer based in Scranton, Pennsylvania. Twelve years of experience, available worldwide.',
    image: `${SITE_URL}/assets/photos/site/about-bg.webp`,
  },
  '/contact': {
    title: 'Book a Session | Vero Photography',
    description:
      'Get in touch to plan a wedding, portrait, family, or maternity session. Based in Scranton, Pennsylvania, available worldwide.',
  },
  '/contact/thank-you': {
    title: 'Thank You | Vero Photography',
    description:
      'Your inquiry has been received. Veronika will be in touch shortly to discuss your photography session.',
  },
  // Was missing entirely, so this route fell through to the home defaults and
  // shipped the homepage's title, description and canonical — on the site's
  // highest-intent commercial page.
  '/wedding-photography': {
    title: 'Wedding Photography Services | Vero Photography',
    description:
      'Wedding photography by Veronika Polbina: coverage from intimate ceremonies to full days, planning help, honest answers, and trusted local vendors. Based in Scranton, Pennsylvania; available worldwide.',
    image: `${SITE_URL}/assets/photos/site/weddings-hero.webp`,
  },
  '/gallery': {
    title: 'Photography Portfolio | Vero Photography',
    description:
      'A curated portfolio of wedding, portrait, family, and maternity photography by Veronika Polbina.',
    // Named explicitly rather than inherited. Without it this fell through to
    // DEFAULT_IMAGE while the prerendered /gallery named a second file and
    // Gallery.tsx named a third, so a shared link previewed whichever
    // photograph the sharer's crawler happened to read.
    image: `${SITE_URL}/assets/photos/portraits/sunset-sunflower-field-joy.webp`,
  },
  // Absent, so /journal took the '/' entry and its twitter card and WebPage
  // JSON-LD advertised the homepage. Byte-identical to the Helmet in
  // Journal.tsx so the two cannot disagree.
  '/journal': {
    title: 'Journal | Vero Photography',
    description:
      'Long-form recaps from behind the lens: recent portrait, wedding, family, and maternity sessions with the stories, favorite frames, and small moments that made them.',
  },
  '/gallery/portraits': {
    title: 'Portrait Photography Portfolio | Vero Photography',
    description:
      'Portrait photography portfolio: natural-light, lifestyle, and editorial portraits by Veronika Polbina.',
    image: `${SITE_URL}/assets/photos/portraits/shadow-play-portrait.webp`,
  },
  '/gallery/weddings': {
    title: 'Wedding Photography Portfolio | Vero Photography',
    description:
      'Wedding photography portfolio: destination, beach, and intimate ceremony coverage by Veronika Polbina.',
    image: `${SITE_URL}/assets/photos/weddings/newlyweds-running-sea.webp`,
  },
  '/gallery/family': {
    title: 'Family Photography Portfolio | Vero Photography',
    description:
      'Family photography portfolio: multi-generation, lifestyle, and candid family sessions by Veronika Polbina.',
    image: `${SITE_URL}/assets/photos/family/elegant-family-studio-portrait-black.webp`,
  },
  '/gallery/maternity': {
    title: 'Maternity Photography Portfolio | Vero Photography',
    description:
      'Maternity photography portfolio: beach, studio, and artistic maternity sessions by Veronika Polbina.',
    image: `${SITE_URL}/assets/photos/maternity/couples-beach-baby-bump-moment.webp`,
  },
  // The two policy routes were absent, so they fell through to the '/' entry
  // and every social card, canonical and WebPage JSON-LD on /privacy and
  // /terms described the homepage. Both strings are byte-identical to the
  // Helmet already in Privacy.tsx and Terms.tsx, which is what lets the
  // prerender drift guard below hold all three sources together.
  '/privacy': {
    title: 'Privacy Policy | Vero Photography',
    description:
      'Privacy policy for vero.photography: what information we collect, how we use it, and how to request deletion.',
  },
  '/terms': {
    title: 'Terms of Service | Vero Photography',
    description:
      'Terms of service for vero.photography: how the site may be used, photo copyright, and how to request image removal.',
  },
  // Aimed at photographers and videographers rather than couples, so the
  // description says so in its first clause: the wrong reader should be able
  // to tell from a search result that this page is not for them.
  '/collaborate': {
    title: 'Collaborate | Vero Photography',
    description:
      'Wedding videographers and second shooters in northeastern Pennsylvania: what Vero Photography looks for in a collaborator, how the work is paid, and how to get in touch.',
  },
};

const SEO = () => {
  const { pathname } = useLocation();
  // Strip trailing slash for lookup (but keep root). Avoids /about and /about/
  // diverging on the meta we serve.
  const normalized =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const meta = ROUTE_META[normalized];
  // For unrecognized paths (e.g. /photo/:category/:photoId, /pay, /404), fall
  // back to the home defaults. Per-page Helmet on those routes overrides this.
  const resolved = meta ?? ROUTE_META['/'];
  // The trailing slash on the root is deliberate: index.html and every
  // prerendered page write `${SITE}${path}`, and the homepage's path is '/'.
  // Emitting the bare origin here made the one string that is supposed to be
  // identical in three places the one string that was not.
  const canonical = `${SITE_URL}${normalized === '/' ? '/' : normalized}`;
  const image = resolved.image ?? DEFAULT_IMAGE;

  /**
   * ONE CANONICAL PER PAGE, WHICH IS NOT WHAT THIS SITE HAS BEEN SHIPPING.
   *
   * index.html carries a static canonical pointing at the homepage, on purpose:
   * a crawler that does not run JavaScript still gets one. Every prerendered
   * page then strips it and writes its own (see the loops in
   * scripts/prerender-photos.mjs, which all call
   * `html.replace(/<link rel="canonical"[^>]*>/g, '')` first), so /about,
   * /gallery/*, /photo/*, /journal/* and the policy pages each ship exactly one
   * and Helmet's copy below agrees with it byte for byte.
   *
   * The routes that are NOT prerendered are served the raw index.html by the
   * catch-all rewrite, and there the static homepage canonical survives. Helmet
   * adds the route's own beside it and the page ends up claiming to be two
   * different URLs. Measured on production, 2026-09-29: /portal, /portal/pass,
   * /pay and /contact/thank-you each served
   * `https://vero.photography/` plus their own, which is the
   * "multiple conflicting URLs" Lighthouse reports on /portal.
   *
   * So: remove a canonical this document did not write, and only when it
   * disagrees. On a prerendered page the static tag resolves to the same URL
   * and is left exactly where it is, which matters, because that tag is the one
   * a non-JS crawler reads.
   *
   * Compared as RESOLVED urls, not as strings. `https://vero.photography` and
   * `https://vero.photography/` are the same document, and treating them as
   * different would strip the homepage's static canonical for nothing.
   *
   * Timed to a frame, because react-helmet-async commits its own tags inside a
   * requestAnimationFrame. Removing the static one first would leave the
   * document with no canonical at all in between, and if rAF never runs (a
   * background tab), nothing is removed and the page behaves exactly as it did
   * before this existed.
   */
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
    const target = new URL(canonical).href;
    const id = window.requestAnimationFrame(() => {
      document.querySelectorAll('link[rel="canonical"]:not([data-rh])').forEach((link) => {
        let resolved = '';
        try {
          resolved = new URL(link.getAttribute('href') ?? '', window.location.origin).href;
        } catch {
          // An href this cannot parse is not one worth keeping either.
        }
        if (resolved !== target) link.remove();
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [canonical]);

  // Per-page WebPage + primaryImageOfPage. This is the missing signal
  // that lets Google pick the right SERP thumbnail per route — the
  // existing static ProfessionalService schema in index.html covers
  // the business entity, but doesn't declare which image is the page's
  // primary one. Without this, Google falls back to its automated
  // picker and on /, the hero camera image wins on visual prominence.
  //
  // Per Google's official Image SEO docs, og:image and primaryImageOfPage
  // are the only two confirmed methods to influence thumbnail selection
  // (alt text is for understanding, not selection). After deploying,
  // re-index via Search Console (URL Inspection → Request Indexing) to
  // skip the multi-week crawl delay.
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: canonical,
    name: resolved.title,
    description: resolved.description,
    inLanguage: 'en-US',
    primaryImageOfPage: {
      '@type': 'ImageObject',
      url: image,
      width: 1200,
      height: 630,
    },
  };

  return (
    <Helmet>
      <title>{resolved.title}</title>
      <meta name="description" content={resolved.description} />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta charSet="utf-8" />
      <meta name="language" content="English" />
      {/* max-image-preview:large lets Google show the chosen thumbnail at
          its full SERP size instead of a tiny 50x50 — doesn't decide
          *which* image, but ensures whatever Google picks is shown big.
          Google's own case studies cite up to 333% click increase from
          this directive. */}
      <meta name="robots" content="index, follow, max-image-preview:large" />
      <link rel="canonical" href={canonical} />

      {/* Mobile */}
      <meta name="theme-color" content="#000000" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black" />
      <meta name="format-detection" content="telephone=no" />

      {/* Open Graph */}
      <meta property="og:title" content={resolved.title} />
      <meta property="og:description" content={resolved.description} />
      <meta property="og:image" content={image} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="Vero Photography" />
      <meta property="og:locale" content="en_US" />
      <meta property="og:locale:alternate" content="es_DO" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Vero Photography, Professional Photographer" />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={resolved.title} />
      <meta name="twitter:description" content={resolved.description} />
      <meta name="twitter:image" content={image} />

      {/* Structured data — primaryImageOfPage is the canonical signal
          Google uses (alongside og:image) to choose the SERP thumbnail. */}
      <script type="application/ld+json">{JSON.stringify(structuredData)}</script>
    </Helmet>
  );
};

export default SEO;
