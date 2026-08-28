import React from 'react';
import { Box } from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import HeroSection from '../components/HeroSection';
import GoogleReviewsSection from '../components/GoogleReviewsSection';
import InstagramFeed from '../components/InstagramFeed';
import heroSlides from '../data/hero-slides.json';
import heroVariants from '../data/hero-variants.json';

type Slide = {
  url: string;
  mobileUrl?: string;
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
const VARIANTS = heroVariants as Record<string, string>;

const CAROUSEL_IMAGES: Slide[] = (heroSlides as Slide[]).map((slide) => {
  const mobileSource = slide.mobileUrl || slide.url;
  return { ...slide, mobileUrl: VARIANTS[mobileSource] ?? mobileSource };
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
      <InstagramFeed />
      <GoogleReviewsSection />
    </Box>
  );
};

export default Home;
