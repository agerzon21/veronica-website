import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Box, Image, Flex, Text, Button, useBreakpointValue } from '@chakra-ui/react';
import { m, AnimatePresence, useTransform, type MotionValue } from 'framer-motion';

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
  /**
   * Show the 01 02 03 rail across the bottom of the slide, with a line that
   * fills between the current number and the next one as the slide runs.
   * Each number is a real button that jumps to that slide.
   *
   * Off by default. Only the hero asks for it.
   */
  showIndex?: boolean;
  /**
   * The hero's camera scale, so the rail can fade out as the LCD shrinks.
   *
   * The rail lives INSIDE the element that scale transforms, which is what
   * makes it travel with the photo rather than float over the page. The cost
   * is that it shrinks too, and past a point the numbers are unreadable and
   * far too small to hit, so they are faded out before they get there rather
   * than left as sub-pixel tap targets.
   *
   * Optional: without it the rail simply never fades.
   */
  indexScale?: MotionValue<number>;
}

/**
 * Where the rail sits, measured rather than guessed.
 *
 * The slide is BIGGER THAN THE SCREEN at rest. On the homepage it is the
 * camera's LCD at scale 1, sized to cover the viewport and centred on it, so
 * it overflows symmetrically: measured at 1440x900 the slide box is 1728x1294
 * and hangs 197px past the bottom of the screen, and at 390x844 it is 723x1013
 * and hangs 85px past. A percentage from the slide's bottom therefore lands
 * off-screen, which is exactly what the first attempt did: the numbers
 * rendered 119px below the fold.
 *
 * So the offset is (slide height - viewport height) / 2, which puts it level
 * with the bottom of the screen, plus a margin.
 *
 * offsetHeight, NOT getBoundingClientRect: the slide is inside a CSS transform
 * that scales during the scroll, and a rect would shrink with it and move the
 * rail every frame. offsetHeight is the layout height and ignores transforms,
 * so this is computed once per size and then scales with the photo like
 * everything else inside, which is the whole point of living in there.
 */
/**
 * How far above the bottom of the SCREEN the rail sits.
 *
 * Not a taste number. The hero already stacks two centred things down there,
 * measured at 1440x900: the "Book a Session" line occupies y 750 to 791 and
 * the Scroll cue with its dot occupies y 801 to 860. The first attempt put the
 * rail at y 813 and it ran straight through the Scroll cue. This clears both
 * and reads as a third row above them rather than a collision.
 */
const RAIL_MARGIN_PX = 196;

function useRailBottom(ref: React.RefObject<HTMLDivElement>): number {
  const [bottom, setBottom] = useState(RAIL_MARGIN_PX);
  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const overflow = Math.max((el.offsetHeight - window.innerHeight) / 2, 0);
      setBottom(Math.round(overflow + RAIL_MARGIN_PX));
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [ref]);
  return bottom;
}

/** Below this scale the rail is gone. Above it, fully present. */
const RAIL_FADE_FROM = 1;
const RAIL_FADE_TO = 0.72;
/** How long one slide is on screen. Must match the rotation interval below. */
const SLIDE_MS = 5000;

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



/**
 * A minimal stand-in for a framer MotionValue, used only so IndexRail can call
 * useTransform unconditionally when the caller passes no scale. It never
 * changes, so the derived opacity is a constant 1.
 */
class MotionValueShim {
  private v: number;
  constructor(v: number) {
    this.v = v;
  }
  get() {
    return this.v;
  }
  onChange() {
    return () => {};
  }
  on() {
    return () => {};
  }
  destroy() {}
}


/**
 * The 01 02 03 rail.
 *
 * A row of numbers across the bottom of the slide with a line that fills
 * between the current number and the next as the slide runs, so the wait is
 * visible rather than a surprise. Every number is a real <button>, so it is
 * reachable by keyboard and announced, and pressing one jumps to that slide.
 *
 * The filling element is the line itself: its WIDTH animates from 0, which is
 * what pushes the later numbers along and reads as the dash growing. Keyed on
 * the index so it restarts cleanly on every change, including a manual jump.
 *
 * It renders inside the slide, so on the homepage it sits inside the element
 * the hero scales, travels with the photo, and shrinks with it. Past
 * RAIL_FADE_TO it is faded out and made non interactive: at that size the
 * numbers are unreadable and far too small to hit.
 */
const IndexRail: React.FC<{
  total: number;
  index: number;
  rotating: boolean;
  onPick: (i: number) => void;
  scale?: MotionValue<number>;
  /** Distance up from the BOTTOM OF THE SLIDE, in px. See useRailBottom. */
  bottom: number;
  /**
   * Tighten everything so twelve numbers fit a phone.
   *
   * Measured at the default sizes: the row spans 409px, which overflows BOTH
   * edges of a 390px screen and is 89px too wide for a 320px one. The growing
   * rule is most of the problem, since it adds up to 62px on its own, so it
   * gets a shorter travel here as well.
   */
  compact: boolean;
}> = ({ total, index, rotating, onPick, scale, bottom, compact }) => {
  // Hooks run unconditionally. useTransform needs a MotionValue, and there is
  // no conditional-hook escape, so a constant stand-in keeps the shape stable
  // when the caller passes nothing.
  const fallback = useRef<MotionValue<number> | null>(null);
  if (!fallback.current) fallback.current = new MotionValueShim(1) as unknown as MotionValue<number>;
  const source = scale ?? fallback.current;
  const opacity = useTransform(source, [RAIL_FADE_TO, RAIL_FADE_FROM], [0, 1]);

  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <m.div
      style={{
        opacity,
        position: 'absolute',
        left: 0,
        right: 0,
        bottom,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 3,
        pointerEvents: 'auto',
      }}
    >
      <Flex align="center" gap={compact ? '6px' : '14px'} px={compact ? 2 : 4} maxW="100%" flexWrap="nowrap">
        {Array.from({ length: total }, (_, i) => {
          const active = i === index;
          return (
            <React.Fragment key={i}>
              <Box
                as="button"
                type="button"
                onClick={() => onPick(i)}
                aria-label={`Show photo ${i + 1} of ${total}`}
                aria-current={active ? 'true' : undefined}
                bg="transparent"
                border="none"
                p={0}
                cursor="pointer"
                lineHeight="1"
                fontSize={compact ? '11px' : '15px'}
                letterSpacing={compact ? '0.06em' : '0.16em'}
                fontWeight="400"
                color={active ? 'white' : 'rgba(255,255,255,0.55)'}
                transition="color 0.35s ease"
                _hover={{ color: 'white' }}
                _focusVisible={{ outline: '2px solid white', outlineOffset: '3px' }}
                sx={{ WebkitTapHighlightColor: 'transparent', textShadow: '0 1px 6px rgba(0,0,0,0.45)' }}
              >
                {String(i + 1).padStart(2, '0')}
              </Box>
              {active && (
                <m.span
                  key={`rule-${index}`}
                  aria-hidden
                  initial={{ width: 0 }}
                  animate={{ width: reduced || !rotating ? (compact ? 12 : 26) : compact ? 26 : 62 }}
                  transition={
                    reduced || !rotating
                      ? { duration: 0.25 }
                      : { duration: SLIDE_MS / 1000, ease: 'linear' }
                  }
                  style={{
                    height: 1,
                    background: 'rgba(255,255,255,0.9)',
                    boxShadow: '0 1px 6px rgba(0,0,0,0.45)',
                    display: 'block',
                    flexShrink: 0,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </Flex>
    </m.div>
  );
};

const ImageCarousel: React.FC<ImageCarouselProps> = ({
  images: initialImages,
  height = '100vh',
  hideDevIndicator = false,
  showIndex = false,
  indexScale,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  /**
   * Is the slideshow actually advancing right now?
   *
   * The rail's filling line is a promise about when the next slide arrives, so
   * it must not run while rotation is stopped. Rotation waits for load, stops
   * on a hidden tab and never starts under prefers-reduced-motion, so "there
   * are several slides" is not the same question as "is it rotating".
   */
  const [rotating, setRotating] = useState(false);
  /**
   * Bumped whenever the viewer picks a slide themselves, so the rotation
   * effect tears down and starts a fresh interval.
   *
   * Without it the 5s timer keeps running from whenever it last fired, so
   * choosing a photo 4.9 seconds in shows it for 100ms and then moves on.
   * Measured: clicking 05 landed on 06 almost immediately. It also makes the
   * rail honest, since the filling line is a promise about when the next slide
   * arrives and it restarts from zero on a pick.
   */
  const [cycleKey, setCycleKey] = useState(0);
  const pickSlide = (i: number) => {
    setCurrentIndex(i);
    setCycleKey((k) => k + 1);
  };
  const slideBoxRef = useRef<HTMLDivElement>(null);
  const railBottom = useRailBottom(slideBoxRef);
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
  // pauses when the tab is hidden, and respects reduced-m.
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
      if (id === undefined) id = window.setInterval(tick, SLIDE_MS);
      setRotating(true);
    };
    const stop = () => {
      if (id !== undefined) {
        clearInterval(id);
        id = undefined;
      }
      setRotating(false);
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
  }, [images.length, isPaused, cycleKey]);

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
      ref={slideBoxRef}
      position="relative"
      width="100%"
      height={height}
      overflow="hidden"
    >
      <AnimatePresence initial={false}>
        <m.div
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
        </m.div>
      </AnimatePresence>

      {/* Inside the slide box on purpose: on the homepage that box is inside
          the element the hero scales, so the rail travels and shrinks with the
          photo instead of floating over the page. */}
      {showIndex && images.length > 1 && (
        <IndexRail
          total={images.length}
          index={currentIndex}
          rotating={rotating}
          onPick={pickSlide}
          scale={indexScale}
          bottom={railBottom}
          compact={isMobile}
        />
      )}

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