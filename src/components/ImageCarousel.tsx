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
const RAIL_MARGIN_PX = 96;
/**
 * Clear space either side of the cue, so the numbers do not crowd it.
 *
 * Tighter on a phone: twelve numbers plus the desktop gap measured 384px in a
 * 390px viewport, which is touching both edges.
 */
const CUE_PADDING_PX = 22;
const CUE_PADDING_COMPACT_PX = 8;

/**
 * Below this width the row does not fit around the cue and sits above it.
 *
 * It was 380, from when a phone showed all twelve numbers and the row measured
 * 348px inside a 320px screen. A phone shows a WINDOW of six now, which needs
 * about 311px including the gap, so every real phone parts around the cue and
 * the fallback is effectively unreachable. Leaving the threshold at 380 left
 * the 375px phones, the 13 mini and the SE, on the wrong path: no centre gap,
 * so numerals ran straight across the mouse icon.
 */
const SPLIT_MIN_VW = 320;

function useRailPlacement(ref: React.RefObject<HTMLDivElement>): {
  bottom: number;
  cueWidth: number;
  narrow: boolean;
} {
  const [placement, setPlacement] = useState({ bottom: RAIL_MARGIN_PX, cueWidth: 0, narrow: false });
  useEffect(() => {
    /**
     * NO VIEWPORT HEIGHT ANYWHERE IN HERE, and that is the fix.
     *
     * This used to compute the offset from window.innerHeight. On a phone
     * browser that is the LARGE viewport, the one that includes the space the
     * URL bar sits in, so it is taller than what anybody can actually see. The
     * rail was positioned against a screen bigger than the screen, and it came
     * out low on an iPhone in Chrome and on a Pixel, and clean off the bottom
     * in Safari where the toolbar takes the most. visualViewport would fix the
     * arithmetic but not the fragility.
     *
     * So it measures the two things it actually cares about and nothing else:
     * where the cue is, and where the slide ends. Both are read at rest, where
     * the camera is unscaled, and offsetHeight is the layout height so no
     * transform can reach it. Whatever a device does with its chrome, the rail
     * lands on the cue, because the cue is what it is measured against.
     */
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      /**
       * ONLY AT EXACT REST, and the strictness is the point.
       *
       * The camera scales with the scroll, and a scaled element's rect no
       * longer agrees with its offsetHeight, so the arithmetic below is only
       * true at scale 1. A tolerance of a few pixels let a measurement through
       * while the scale had already begun to move, which is what made the rail
       * creep upward a little on every scroll down and back.
       */
      if (window.scrollY !== 0) return;

      const block = document.querySelector('[data-hero-scroll-block]') as HTMLElement | null;
      const cue = document.querySelector('[data-hero-scroll-cue]') as HTMLElement | null;
      const blockRect = (block ?? cue)?.getBoundingClientRect();
      const cueRect = cue?.getBoundingClientRect();

      if (!blockRect) {
        setPlacement({ bottom: RAIL_MARGIN_PX, cueWidth: 0, narrow: window.innerWidth < NARROW_VW });
        return;
      }

      /**
       * Vertically the rail centres on the whole cue BLOCK, the word and the
       * mouse under it, because that is what a person sees as one object.
       * Horizontally the gap only has to clear the LABEL, the widest part.
       */
      const slideBottom = el.getBoundingClientRect().top + el.offsetHeight;
      const cueCentre = blockRect.top + blockRect.height / 2;
      const halfRow = window.innerWidth < 768 ? 22 : 9;
      const split = window.innerWidth >= SPLIT_MIN_VW;

      setPlacement({
        bottom: Math.round(slideBottom - cueCentre - (split ? halfRow : -30)),
        cueWidth: cueRect && split ? Math.round(cueRect.width) : 0,
        narrow: window.innerWidth < NARROW_VW,
      });
    };

    measure();
    // The cue mounts with the hero, so one frame is not always enough.
    const t1 = window.setTimeout(measure, 300);
    const t2 = window.setTimeout(measure, 1200);

    /**
     * WIDTH ONLY. This is the creep, and it took three attempts to catch
     * because it cannot happen in a headless browser.
     *
     * A phone's toolbar retracts when you scroll down and extends when you
     * scroll back up, and each of those fires a window resize. Scroll down a
     * little and straight back and the resize arrives with scrollY returned to
     * exactly 0, so it passed the guard above and re-measured, except the bar
     * was still sliding: blockRect and the slide's rect were both caught
     * mid-animation. Every round trip landed on a slightly different answer and
     * the rail walked up the screen, a few pixels at a time, exactly as
     * reported. Simulating the bar by resizing the window across a scroll nudge
     * reproduces it: 761 to 754 on the first pass.
     *
     * A toolbar only ever changes the HEIGHT. A real relayout that the rail
     * needs to hear about, an orientation flip or a desktop window drag,
     * changes the WIDTH. So the listener ignores height-only changes, which is
     * the same rule HeroSection already applies to its own viewport state four
     * files up, and the mechanism is gone rather than tuned.
     *
     * The rail does not need the height anyway: the cue is anchored in svh
     * units, so it does not move when the bar does.
     */
    let lastWidth = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      measure();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', measure);
    /**
     * NO visualViewport LISTENER, deliberately.
     *
     * It fires continuously while a phone's toolbar slides away, including at
     * scroll offsets where the camera is mid-scale, and every one of those
     * firings nudged the rail. It is not needed either: the cue is anchored in
     * svh units now, so it does not move when the bar does, and a position
     * measured once at rest stays correct because the rail and the slide scale
     * together.
     */
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', measure);
    };
  }, [ref]);
  return placement;
}

/** Below this scale the rail is gone. Above it, fully present. */
const RAIL_FADE_FROM = 1;
const RAIL_FADE_TO = 0.72;
/**
 * How many numerals a phone shows at once, half either side of the cue.
 *
 * Six on any phone made this decade. Four below 340px, where six plus the
 * gap measured 347px inside a 320px screen and hung off both edges: the
 * choice there is fewer numbers or smaller targets, and a target you cannot
 * hit is worth less than a number you cannot see.
 */
const WINDOW_SIZE = 6;
const WINDOW_SIZE_NARROW = 4;
const NARROW_VW = 340;
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
  /** Measured width of the hero's Scroll cue, or 0 when there is not one. */
  cueWidth: number;
  /** Under 340px, where six numerals plus the gap do not fit. */
  narrow: boolean;
}> = ({ total, index, rotating, onPick, scale, bottom, compact, cueWidth, narrow }) => {
  const windowSize = narrow ? WINDOW_SIZE_NARROW : WINDOW_SIZE;
  const centreGap =
    cueWidth > 0
      ? cueWidth + (compact ? CUE_PADDING_COMPACT_PX : CUE_PADDING_PX) * 2
      : 0;
  // Hooks run unconditionally. useTransform needs a MotionValue, and there is
  // no conditional-hook escape, so a constant stand-in keeps the shape stable
  // when the caller passes nothing.
  const fallback = useRef<MotionValue<number> | null>(null);
  if (!fallback.current) fallback.current = new MotionValueShim(1) as unknown as MotionValue<number>;
  const source = scale ?? fallback.current;
  const opacity = useTransform(source, [RAIL_FADE_TO, RAIL_FADE_FROM], [0, 1]);

  /**
   * A PHONE SHOWS A PAGE, NOT THE WHOLE RUN AND NOT A SLIDING WINDOW.
   *
   * Twelve numbers on a 390px screen came out at 15px of text with nothing
   * around them: too small to read and far too small to hit. So six.
   *
   * The first version SLID those six, advancing by one on every slide, and it
   * was wrong in a way that only shows once it is moving: every numeral
   * changes every five seconds, so instead of reading as a position in a set
   * it reads as one number churning over and over.
   *
   * It pages instead. The same six sit still while the highlight walks across
   * them, and only when it reaches the end does the set turn over to the next
   * six. Six slides of stillness, then one change, rather than a change every
   * slide.
   *
   * The last page is clamped to a full row rather than left ragged, so a
   * count that does not divide by six overlaps the previous page instead of
   * showing two numerals and a gap. Desktop keeps every number: there is room.
   */
  const windowed = compact && total > windowSize;
  const pageStart = windowed
    ? Math.max(0, Math.min(Math.floor(index / windowSize) * windowSize, total - windowSize))
    : 0;
  const slots = windowed
    ? Array.from({ length: windowSize }, (_, k) => pageStart + k)
    : Array.from({ length: total }, (_, k) => k);

  const reduced =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * One numeral, plus the growing line when it is the active one.
   *
   * The line lives INSIDE its half, so its width only ever pushes numbers
   * within that half. It cannot move the gap, which is what put a number on
   * top of the mouse icon when the whole row was one centred run.
   */
  const renderSlot = (i: number) => {
    const active = i === index;
    return (
      <React.Fragment key={windowed ? `slot-${i}` : i}>
        <Box
          as="button"
          type="button"
          onClick={() => onPick(i)}
          aria-label={`Show photo ${i + 1} of ${total}`}
          aria-current={active ? 'true' : undefined}
          flexShrink={0}
          bg="transparent"
          border="none"
          p={0}
          cursor="pointer"
          lineHeight="1"
          minW={compact ? '34px' : undefined}
          minH={compact ? '44px' : undefined}
          display={compact ? 'inline-flex' : undefined}
          alignItems={compact ? 'center' : undefined}
          justifyContent={compact ? 'center' : undefined}
          fontSize={compact ? '15px' : '17px'}
          letterSpacing={compact ? '0.06em' : '0.16em'}
          fontWeight="400"
          color={active ? 'white' : 'rgba(255,255,255,0.55)'}
          transition="color 0.35s ease"
          _hover={{ color: 'white' }}
          _focusVisible={{ outline: '2px solid white', outlineOffset: '3px' }}
          sx={{ WebkitTapHighlightColor: 'transparent', textShadow: '0 1px 6px rgba(0,0,0,0.45)' }}
        >
          {windowed ? (
            <Box position="relative" w="100%" h="100%" display="flex" alignItems="center" justifyContent="center">
              <AnimatePresence initial={false}>
                <m.span
                  key={i}
                  initial={{ opacity: 0, y: 7 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -7 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  style={{ position: 'absolute', lineHeight: 1 }}
                >
                  {String(i + 1).padStart(2, '0')}
                </m.span>
              </AnimatePresence>
            </Box>
          ) : (
            String(i + 1).padStart(2, '0')
          )}
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
  };

  const half = windowed ? windowSize / 2 : Math.ceil(slots.length / 2);
  const leftSlots = slots.slice(0, half).map(renderSlot);
  const rightSlots = slots.slice(half).map(renderSlot);

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
        /**
         * Above the hero's footer layer, which is what was eating the clicks.
         *
         * That footer Box stretches left 0 to right 0 at zIndex 3 with default
         * pointer events, so it covered the whole row: elementFromPoint at the
         * centre of a numeral returned the footer DIV, not the button. The
         * handler was fine, which is why clicking it from script worked and
         * clicking it with a pointer did nothing. The Scroll cue above this at
         * zIndex 5 is pointerEvents none, so it is not in the way.
         */
        zIndex: 6,
        pointerEvents: 'auto',
      }}
    >
      {/* TWO EQUAL HALVES with the gap between them, not one centred run.
          As one run the whole row was centred, so the growing line added width
          to the left of the gap and pushed the gap to the RIGHT while the cue
          stayed where it was. On a narrow phone that was enough for the last
          number on the left to end up on top of the mouse icon. Each half now
          takes half the width whatever is inside it, so the gap sits dead
          centre and the cue sits in it. */}
      <Flex align="center" w="100%" px={compact ? 2 : 4}>
        <Flex flex="1" minW={0} align="center" justify="flex-end" gap={compact ? '6px' : '14px'}>
          {leftSlots}
        </Flex>
        <Box aria-hidden flexShrink={0} w={`${centreGap}px`} h="1px" />
        <Flex flex="1" minW={0} align="center" justify="flex-start" gap={compact ? '6px' : '14px'}>
          {rightSlots}
        </Flex>
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
  const railPlacement = useRailPlacement(slideBoxRef);
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
          bottom={railPlacement.bottom}
          cueWidth={railPlacement.cueWidth}
          narrow={railPlacement.narrow}
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