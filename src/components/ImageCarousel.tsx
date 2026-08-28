import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Box, Image, Flex, Text, Button, useBreakpointValue } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageCarouselProps {
  images: Array<{
    url: string;
    position?: string;
    mobileUrl?: string;
    mobileSrcSet?: string;
    desktopSrcSet?: string;
    mobilePosition?: string;
    /** If true, this image is excluded from the carousel on mobile viewports. */
    mobileSkip?: boolean;
    /** If true, this image is excluded from the carousel on desktop viewports. */
    desktopSkip?: boolean;
  }>;
  height?: string | { base?: string; sm?: string; md?: string; lg?: string };
  hideDevIndicator?: boolean;
}

// Safe check for development mode
const isDevelopment = process.env.NODE_ENV === 'development';

type Slide = ImageCarouselProps['images'][number];

// Filter for the viewport, then shuffle. Fisher-Yates, not
// sort(() => Math.random() - 0.5) — the latter isn't a uniform shuffle and
// biases elements toward staying near their original position.
//
// The WHOLE list is shuffled, slot 0 included, so which photo greets a
// visitor stays random exactly as it always has. (Pinning slot 0 would let
// us preload the first photo as the LCP image, but that makes every visit
// open on the same shot — a product call for Vero, not a perf tweak.)
const arrange = (imgs: Slide[], mobile: boolean): Slide[] => {
  const shuffled = imgs.filter((img) => (mobile ? !img.mobileSkip : !img.desktopSkip));
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
};


const ImageCarousel: React.FC<ImageCarouselProps> = ({
  images: initialImages,
  height = '100vh',
  hideDevIndicator = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  // `fallback: 'base'` is load-bearing — without it useBreakpoint returns
  // undefined on the first pass and the mobileSkip/desktopSkip filter
  // silently does nothing. ssr:false because main.tsx uses createRoot, never
  // hydrateRoot, and prerender-photos.mjs does no React rendering.
  const isMobile =
    useBreakpointValue({ base: true, md: false }, { ssr: false, fallback: 'base' }) ?? true;

  // Seed from the ARRANGED list, not initialImages. Seeding raw meant React
  // committed initialImages[0] and the browser started fetching a ~960KB
  // photo that the shuffle effect then replaced ~122ms later — one full
  // wasted image download on every single homepage load.
  const [images, setImages] = useState<Slide[]>(() => arrange(initialImages, isMobile));
  // Portal target only safe after mount (SSR + first-paint guard)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Re-arrange ONLY on a real breakpoint flip (rotation, window resize across
  // 768px). Previously this ran on mount too, which is what caused the
  // discarded first fetch.
  const lastIsMobile = useRef(isMobile);
  useEffect(() => {
    if (lastIsMobile.current === isMobile) return;
    lastIsMobile.current = isMobile;
    setImages(arrange(initialImages, isMobile));
    setCurrentIndex(0);
  }, [initialImages, isMobile]);

  // The rotation used to start immediately and never stop, pulling a fresh
  // full-resolution original every 5s (~8MB/minute) while the page was still
  // loading — it held the load event open to 19.2s. Now it waits for load,
  // pauses when the tab is hidden, and respects reduced-motion.
  useEffect(() => {
    if (isPaused || images.length <= 1) return; // % 0 would be NaN

    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    let id: number | undefined;
    const tick = () => setCurrentIndex((prev) => (prev + 1) % images.length);
    const start = () => {
      // Never rotate a hidden tab — it burns bandwidth advancing slides nobody
      // is looking at, which is most of what this effect exists to stop.
      if (document.hidden) return;
      if (id === undefined) id = window.setInterval(tick, 5000);
    };
    const stop = () => {
      if (id !== undefined) {
        clearInterval(id);
        id = undefined;
      }
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    // readyState check FIRST — no load event fires when the user navigates
    // back to / within the SPA, which would leave the carousel frozen.
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });

    // Failsafe: if load never fires (a hung third-party request), rotate anyway.
    const failsafe = window.setTimeout(start, 6000);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      clearTimeout(failsafe);
      window.removeEventListener('load', start);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [images.length, isPaused]);

  // ChunkErrorBoundary would catch a throw here, but it renders a full-page
  // error screen — on the homepage that is still a dead front door. Guard the
  // index rather than relying on the boundary to make it survivable.
  const currentImage: Slide | undefined = images[currentIndex] ?? images[0];

  const getCurrentPosition = () =>
    isMobile && currentImage.mobilePosition
      ? currentImage.mobilePosition
      : currentImage.position || 'center 0%';

  const getCurrentImage = () =>
    isMobile && currentImage.mobileUrl ? currentImage.mobileUrl : currentImage.url;

  // Exact, not a guess. The slide paints inside the camera LCD, whose width at
  // scroll 0 is 1.2*vh*0.7140852 = 0.857*vh in portrait and 1.2*vw in
  // landscape (derived from computeCameraSize + LCD_BOUNDS in HeroSection).
  // Verified: 86vh at vh=823 gives 707.8px against a real 705.2px.
  const HERO_SIZES = '(orientation: portrait) 86vh, 120vw';

  const variants = {
    enter: { opacity: 0 },
    center: { opacity: 1 },
    exit: { opacity: 0 }
  };

  // Empty list (every slide filtered out at this breakpoint) — render the
  // sized shell rather than throwing. Keeps the hero's layout box intact,
  // so CLS stays at 0.
  if (!currentImage) {
    return <Box position="relative" width="100%" height={height} overflow="hidden" />;
  }

  return (
    <Box
      position="relative"
      width="100%"
      height={height}
      overflow="hidden"
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={currentIndex}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ opacity: { duration: 1 } }}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
        >
          <Image
            src={getCurrentImage()}
            srcSet={isMobile ? currentImage.mobileSrcSet : currentImage.desktopSrcSet}
            sizes={
              (isMobile ? currentImage.mobileSrcSet : currentImage.desktopSrcSet)
                ? HERO_SIZES
                : undefined
            }
            alt={`Slide ${currentIndex + 1}`}
            objectFit="cover"
            width="100%"
            height="100%"
            objectPosition={getCurrentPosition()}
            decoding="async"
            // Last line of defence for the mobile derivatives. hero-variants
            // are generated + committed and `npm run hero-variants:check`
            // enforces both, but if one ever 404s this swaps in the original
            // rather than leaving the site's front door blank. Guarded so a
            // broken original can't loop.
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              const original = currentImage.url;
              if (img.currentSrc.includes('/assets/hero/') && !img.src.endsWith(original)) {
                // srcset MUST be cleared first. Assigning src alone does not
                // override an already-matched srcset candidate, so without this
                // the fallback silently does nothing and the hero stays blank.
                img.srcset = '';
                img.sizes = '';
                img.src = original;
              }
            }}
          />
        </motion.div>
      </AnimatePresence>

      {/* Dev controls — rendered via a Portal to document.body so they escape
          the parent's CSS transform scaling (the camera MotionBox uses scale
          transforms, which would otherwise make these buttons huge or tiny
          depending on scroll position). Fixed-position relative to viewport. */}
      {mounted && isDevelopment && !hideDevIndicator && createPortal(
        <Flex
          position="fixed"
          bottom="16px"
          left="50%"
          transform="translateX(-50%)"
          bg="blackAlpha.800"
          px={3}
          py={2}
          borderRadius="md"
          zIndex={9999}
          gap={2}
          alignItems="center"
        >
          <Text color="white" fontSize="xs" whiteSpace="nowrap">
            {currentIndex + 1} / {images.length}
          </Text>
          <Button
            onClick={() => setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)}
            size="xs"
            colorScheme="whiteAlpha"
          >
            Prev
          </Button>
          <Button
            onClick={() => setCurrentIndex((prev) => (prev + 1) % images.length)}
            size="xs"
            colorScheme="whiteAlpha"
          >
            Next
          </Button>
          <Button
            onClick={() => setIsPaused(!isPaused)}
            size="xs"
            colorScheme={isPaused ? "green" : "red"}
          >
            {isPaused ? "Play" : "Stop"}
          </Button>
        </Flex>,
        document.body,
      )}
    </Box>
  );
};

export default ImageCarousel; 