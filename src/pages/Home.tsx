import React from 'react';
import { Box } from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import HeroSection from '../components/HeroSection';
import GoogleReviewsSection from '../components/GoogleReviewsSection';
import { HomeChapters } from '../components/HomeChapters';
import InstagramFeed from '../components/InstagramFeed';
import heroSlides from '../data/hero-slides.json';
import heroVariants from '../data/hero-variants.json';
import { desktopSrcSetFor } from '../utils/heroSrcSet';

type Slide = {
  url: string;
  /** The photograph's own description, handed to the carousel's <img>. */
  alt?: string;
  /** Only set when mobileUrl is a different photograph, not a derivative. */
  mobileAlt?: string;
  mobileUrl?: string;
  /** "path 1280w, path 1600w" — mobile derivatives only. */
  mobileSrcSet?: string;
  /** Desktop rungs plus the untouched original as the widest candidate. */
  desktopSrcSet?: string;
  position?: string;
  mobilePosition?: string;
  mobileSkip?: boolean;
  desktopSkip?: boolean;
};

// Phones were downloading full-resolution gallery originals (up to 1.2MB) to
// render them at roughly 566 CSS px. scripts/build-hero-variants.mjs emits a
// 1100px derivative per mobile-eligible slide and records it in
// hero-variants.json; here we point mobileUrl at that derivative.
//
// Desktop is untouched — `url` still resolves to the original file, so the
// full-bleed hero keeps its quality on a large retina display.
//
// The `?? original` fallback is deliberate: if the manifest is ever stale or a
// derivative is missing, mobile silently serves the original rather than
// rendering a blank hero. Slower, never broken.
const VARIANTS = heroVariants as Record<string, Record<string, string>>;

// Desktop was still served the untouched originals — 8.26MB across 12 slides,
// up to 5947px wide — which is why mobile PageSpeed moved and desktop stayed
// at 72. The ORIGINAL remains the widest srcset candidate, so a large retina
// display still gets the full-quality file; everything smaller takes a rung.
// desktopSrcSetFor moved to utils/heroSrcSet when the contact and gallery
// heroes needed the same manifests. It is unchanged; the carousel still gets
// exactly the candidates it got before.

// Every hero photograph was announced to a screen reader as "Slide 3", or
// whatever its index happened to be, which says nothing about the photograph.
// These are the alt strings photos.csv already holds for the same files,
// copied rather than imported: photos.ts does `import csv?raw` and parses at
// module init, and Home is the eager LCP chunk, so importing it would drag
// 64KB of CSV onto the one route that must paint fastest.
const HERO_ALT: Record<string, string> = {
  '/assets/photos/portraits/tropical-bikini-pose-bamboo.webp':
    'Athletic girl in a bikini leaning against a bamboo fence with palm trees behind.',
  '/assets/photos/portraits/shadow-play-portrait.webp':
    'Girl gently covering her face with her hand, casting intriguing shadows across her features.',
  '/assets/photos/portraits/girl-embracing-palm-leaf.webp':
    'Joyful girl embracing a large palm leaf against a clear blue sky.',
  '/assets/photos/portraits/ocean-swimming-joy.webp':
    'Girl swimming in the ocean, submerged to her neck.',
  '/assets/photos/weddings/winged-couple-fantasy-portrait.webp':
    'Bride and groom posed together with large white wings, in a fantasy-like atmosphere.',
  '/assets/photos/weddings/wedding-party-seafoam.webp':
    'Bride and groom with their wedding party in seafoam-colored attire.',
  '/assets/photos/weddings/newlyweds-running-sea.webp':
    'Newlyweds running hand-in-hand toward the ocean.',
  '/assets/photos/family/elegant-family-studio-portrait-black.webp':
    'Elegant family portrait against a black background, lit with artistic studio lighting.',
  '/assets/photos/portraits/lace-pink-dress-blue-glacier.webp':
    'Girl in a delicate lace pink dress posing before a blue glacier.',
  '/assets/photos/weddings/couple-back-camera-ocean-view.webp':
    'Bride and groom from behind, looking out at an ocean view.',
  '/assets/photos/weddings/wedding-kiss-pink-sunset.webp':
    'Bride and groom kissing beneath a pink sunset sky.',
  '/assets/photos/weddings/confident-bride-bouquet.webp':
    'Bride holding a bouquet and looking confidently at the camera.',
  '/assets/photos/family/family-camping-adventure.webp':
    'Family enjoying time outdoors with tents set up for camping.',
  '/assets/photos/weddings/bride-groom-under-veil-smiles.webp':
    'Bride and groom smiling beneath a delicate veil.',
  '/assets/photos/portraits/friendship-tree-roots.webp':
    'Two girls posing gracefully against the intricate roots of a tree.',
  '/assets/photos/weddings/lotus-pond-reflection-newlyweds.webp':
    'Reflection of a newlywed couple in a tranquil lotus pond.',
  '/assets/photos/portraits/woman-poppy-petals-floating.webp':
    'Elegant woman seated in a poppy field with petals drifting through the air around her.',
  '/assets/photos/portraits/yellow-tank-top-sunflower-field.webp':
    'Girl in a yellow tank top standing among blooming sunflowers.',
};

const CAROUSEL_IMAGES: Slide[] = (heroSlides as Slide[]).map((slide) => {
  const mobileSource = slide.mobileUrl || slide.url;
  const rungs = VARIANTS[mobileSource];
  const desktopSrcSet = desktopSrcSetFor(slide.url);
  const alt = HERO_ALT[slide.url];
  // Looked up from the ORIGINAL mobileUrl, before it is rewritten to a
  // derivative below. One slide shows a different photograph on mobile, and
  // only that one needs a second description; the rest resolve to alt.
  const mobileAlt =
    slide.mobileUrl && slide.mobileUrl !== slide.url ? HERO_ALT[slide.mobileUrl] : undefined;
  if (!rungs) return { ...slide, alt, mobileAlt, mobileUrl: mobileSource, desktopSrcSet };
  return {
    ...slide,
    alt,
    mobileAlt,
    desktopSrcSet,
    // src falls back to the widest rung for anything that ignores srcSet.
    mobileUrl: rungs['1600'] ?? mobileSource,
    mobileSrcSet: Object.entries(rungs)
      .map(([w, path]) => `${path} ${w}w`)
      .join(', '),
  };
});

const Home: React.FC = () => {
  return (
    <Box
      position="relative"
      width="100%"
    >
      <Helmet>
        <meta property="og:image" content="https://vero.photography/assets/photos/site/contact-bg.webp" />
      </Helmet>
      <HeroSection images={CAROUSEL_IMAGES} />
      {/* Her own work before anyone else's feed: three doors in one row —
          portfolio, latest journal entry, wedding packages. */}
      <HomeChapters />
      <InstagramFeed />
      <GoogleReviewsSection />
    </Box>
  );
};

export default Home;
