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
      'Wedding, portrait, family, and maternity photography by Veronika Gerzon. Based in Scranton, Pennsylvania — available worldwide.',
  },
  '/about': {
    title: 'About Veronika Gerzon | Vero Photography',
    description:
      'About Veronika Gerzon — wedding, portrait, family, and maternity photographer based in Scranton, Pennsylvania. Twelve years of experience, available worldwide.',
    image: `${SITE_URL}/assets/photos/site/about-bg.webp`,
  },
  '/contact': {
    title: 'Book a Session | Vero Photography',
    description:
      'Get in touch to plan a wedding, portrait, family, or maternity session. Based in Scranton, Pennsylvania — available worldwide.',
  },
  '/contact/thank-you': {
    title: 'Thank You | Vero Photography',
    description:
      'Your inquiry has been received — Veronika will be in touch shortly to discuss your photography session.',
  },
  '/gallery': {
    title: 'Photography Portfolio | Vero Photography',
    description:
      'A curated portfolio of wedding, portrait, family, and maternity photography by Veronika Gerzon.',
  },
  '/gallery/portraits': {
    title: 'Portrait Photography Portfolio | Vero Photography',
    description:
      'Portrait photography portfolio — natural-light, lifestyle, and editorial portraits by Veronika Gerzon.',
    image: `${SITE_URL}/assets/photos/portraits/shadow-play-portrait.webp`,
  },
  '/gallery/weddings': {
    title: 'Wedding Photography Portfolio | Vero Photography',
    description:
      'Wedding photography portfolio — destination, beach, and intimate ceremony coverage by Veronika Gerzon.',
    image: `${SITE_URL}/assets/photos/weddings/newlyweds-running-sea.webp`,
  },
  '/gallery/family': {
    title: 'Family Photography Portfolio | Vero Photography',
    description:
      'Family photography portfolio — multi-generation, lifestyle, and candid family sessions by Veronika Gerzon.',
    image: `${SITE_URL}/assets/photos/family/elegant-family-studio-portrait-black.webp`,
  },
  '/gallery/maternity': {
    title: 'Maternity Photography Portfolio | Vero Photography',
    description:
      'Maternity photography portfolio — beach, studio, and artistic maternity sessions by Veronika Gerzon.',
    image: `${SITE_URL}/assets/photos/maternity/couples-beach-baby-bump-moment.webp`,
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
  const canonical = `${SITE_URL}${normalized === '/' ? '' : normalized}`;
  const image = resolved.image ?? DEFAULT_IMAGE;

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
      <meta property="og:image:alt" content="Vero Photography — Professional Photographer" />

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
