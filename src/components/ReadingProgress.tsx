import { Box } from '@chakra-ui/react';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The VP coin that travels down a long page.
 *
 * Lifted out of JournalPost, where it was born, because the client portal is
 * every bit as long a read and the owner remembered it there. Both call sites
 * render THIS, so the mark, the rail and the maths cannot drift into two
 * slightly different coins.
 *
 * Every default below is the journal's behaviour exactly, so `<ReadingProgress
 * articleRef={ref} />` renders what it always did, down to the DOM: rail in the
 * right gutter at `xl`, hairline along the bottom edge under it, always on,
 * pointer-events none, aria-hidden. The portal turns on the extras.
 *
 * WHAT IT IS NOT. It is not a replacement for the scrollbar and it does not
 * touch one. The native macOS overlay scrollbar lives at the very right edge
 * and comes and goes on its own; styling it to make room here would turn it
 * into a permanent, space-taking bar on every page in the site, and only in
 * WebKit. The coin sits alongside it.
 */

/**
 * The round VP monogram lifted from /assets/images/logo.svg (the circle
 * group, viewBox re-based onto it). Inlined so the reading-progress coin
 * needs no extra network fetch and inherits crispness at any size.
 */
export function VPMedallion({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="107 3 64 64" aria-hidden="true" focusable="false">
      <circle cx="139" cy="35" r="29.5" fill="white" stroke="#2d2d2d" strokeOpacity="0.4" strokeWidth="1.2" />
      <path
        d="M136.865 23.0692C140.881 22.7923 144.412 22.6538 147.458 22.6538C156.042 22.6538 160.335 25.6827 160.335 31.7404C160.335 34.5442 159.608 37.0019 158.154 39.1135C157.392 40.2558 156.215 41.1731 154.623 41.8654C153.031 42.5231 151.11 42.8519 148.86 42.8519H141.175V59H136.865V23.0692ZM147.51 23.1731C145.502 23.1731 143.39 23.2942 141.175 23.5365V42.3327H148.86C153.74 42.125 156.181 38.6288 156.181 31.8442C156.181 29.075 155.454 26.9462 154 25.4577C152.546 23.9346 150.383 23.1731 147.51 23.1731Z"
        fill="#7C7C7C"
      />
      <path
        d="M143.321 9.73078C143.979 10.3885 144.308 11.2365 144.308 12.275C144.308 13.1404 144.117 14.0231 143.737 14.9231L130.444 46.0769L129.873 46.3366L116.788 9.73078H121.202L132.054 40.4692L143.113 14.9231C143.494 14.0577 143.685 13.1577 143.685 12.2231C143.685 11.2885 143.425 10.5615 142.906 10.0423L143.321 9.73078Z"
        fill="#0f0f0f"
      />
    </svg>
  );
}

const COIN = 28;
const COIN_MOBILE = 22;

/** How far the mobile coin is inset from each end of its hairline. */
const MOB_INSET = 4;
const MOB_TRAVEL_PAD = 8;

/**
 * A thumb is owed 44px and the coin is 28. When it is draggable it gets an
 * invisible box of that size centred on it; when it is decoration it gets
 * nothing, because a decoration with a hit area is just a trap.
 */
const GRAB = 44;

/** How long the page stands still before the coin fades out. */
const IDLE_MS = 1400;

/** Reduced motion means no fade, not no coin. */
const STILL = { '@media (prefers-reduced-motion: reduce)': { transition: 'none' } };

export interface ReadingProgressProps {
  /**
   * The element whose height is the journey. Omit it and the coin measures the
   * whole document, which is what a portal wants: it is not reading one
   * article, it is one long page.
   */
  articleRef?: { current: HTMLElement | null };
  /**
   * Where the vertical rail is allowed to show.
   *
   * 'gutter' is the journal's: a 1000px column only leaves a real gutter at
   * `xl`, so below that it falls back to the hairline along the bottom edge.
   * 'always' is the portal's, which has no column to clear and whose reader is
   * already looking at the right edge, because that is where they mistook the
   * native scrollbar for this.
   */
  rail?: 'gutter' | 'always';
  /** Show the bottom hairline at the widths the rail is not shown. */
  bottomBar?: boolean;
  /** Fade out once the page has been still. Default: always on, as the journal. */
  autoHide?: boolean;
  /**
   * Grab the coin to scrub the page.
   *
   * This is what turns it from decoration into a control, so it also stops
   * being aria-hidden and becomes a real slider: focusable, with arrow keys,
   * Page Up/Down, Home and End. A draggable thing that a keyboard cannot reach
   * is the version of this that is not worth shipping.
   */
  scrub?: boolean;
}

/**
 * Reading progress, in the site's own voice: the VP monogram coin travels
 * a hairline track as you read. Desktop (xl+, where the 1000px column
 * leaves a real gutter): a vertical rail on the right edge, coin sliding
 * downward. Smaller screens: a hairline along the BOTTOM edge with the
 * coin riding its leading tip, since the top edge belongs to the fixed navbar.
 *
 * All motion is transform-only, driven by one rAF-throttled passive
 * scroll listener writing directly to refs: no React re-renders, no
 * layout thrash. Bounds are re-measured per frame so images finishing
 * their load (which changes article height) can't leave the coin lying.
 */
export default function ReadingProgress({
  articleRef,
  rail = 'gutter',
  bottomBar = true,
  autoHide = false,
  scrub = false,
}: ReadingProgressProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const deskFillRef = useRef<HTMLDivElement>(null);
  const deskCoinRef = useRef<HTMLDivElement>(null);
  const mobFillRef = useRef<HTMLDivElement>(null);
  const mobCoinRef = useRef<HTMLDivElement>(null);

  /**
   * The progress the last frame computed, 0 to 1.
   *
   * A ref and not state: it changes every scroll frame and nothing in the tree
   * renders from it. It exists so the slider's aria value and the keyboard
   * steps have somewhere to read "where are we" from without measuring again.
   */
  const pRef = useRef(0);
  /** Mirrored into state ONLY for the aria value, and only when scrubbing. */
  const [ariaP, setAriaP] = useState(0);
  const [awake, setAwake] = useState(!autoHide);
  /** Held awake by a drag, a hover or focus, whatever the idle timer thinks. */
  const heldRef = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** The scrollable height of whatever is being measured, and its top. */
  const measure = useCallback(() => {
    const el = articleRef ? articleRef.current : document.documentElement;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { top: rect.top, total: rect.height - window.innerHeight };
  }, [articleRef]);

  const wake = useCallback(() => {
    if (!autoHide) return;
    setAwake(true);
    if (idleTimer.current !== null) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => {
      if (!heldRef.current) setAwake(false);
    }, IDLE_MS);
  }, [autoHide]);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const m = measure();
      if (!m) return;
      const { top, total } = m;
      const p = total > 80 ? Math.min(1, Math.max(0, -top / total)) : top < 0 ? 1 : 0;
      pRef.current = p;
      if (deskFillRef.current) deskFillRef.current.style.transform = `scaleY(${p})`;
      if (deskCoinRef.current && trackRef.current) {
        deskCoinRef.current.style.transform = `translateY(${p * (trackRef.current.clientHeight - COIN)}px)`;
      }
      if (mobFillRef.current) mobFillRef.current.style.transform = `scaleX(${p})`;
      if (mobCoinRef.current) {
        mobCoinRef.current.style.transform = `translateX(${MOB_INSET + p * (window.innerWidth - COIN_MOBILE - MOB_TRAVEL_PAD)}px)`;
      }
    };
    const onScroll = () => {
      wake();
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (idleTimer.current !== null) clearTimeout(idleTimer.current);
    };
  }, [measure, wake]);

  /**
   * Scrub to a fraction of the page.
   *
   * `instant`, never smooth: a drag is a continuous gesture and an animated
   * scroll chasing it from behind is what makes a scrubber feel broken.
   */
  const scrollToP = useCallback(
    (p: number) => {
      const m = measure();
      if (!m || m.total <= 0) return;
      const clamped = Math.min(1, Math.max(0, p));
      const el = articleRef ? articleRef.current : null;
      // The article's own top in document coordinates, so scrubbing an article
      // that does not start at the top of the page still lands inside it.
      const base = el ? window.scrollY + el.getBoundingClientRect().top : 0;
      window.scrollTo({ top: base + clamped * m.total, behavior: 'instant' as ScrollBehavior });
      pRef.current = clamped;
      setAriaP(clamped);
    },
    [articleRef, measure],
  );

  /** Where along its track a pointer sits, as a fraction. */
  const pFromPointer = useCallback((e: { clientX: number; clientY: number }, vertical: boolean) => {
    if (vertical) {
      const track = trackRef.current;
      if (!track) return null;
      const r = track.getBoundingClientRect();
      const travel = r.height - COIN;
      if (travel <= 0) return null;
      return (e.clientY - r.top - COIN / 2) / travel;
    }
    const travel = window.innerWidth - COIN_MOBILE - MOB_TRAVEL_PAD;
    if (travel <= 0) return null;
    return (e.clientX - MOB_INSET - COIN_MOBILE / 2) / travel;
  }, []);

  const dragProps = (vertical: boolean) =>
    scrub
      ? {
          role: 'slider',
          tabIndex: 0,
          'aria-label': 'Scroll position',
          // The WIDGET's orientation, not the page's. The bottom hairline is
          // laid out across the screen even though what it moves is vertical,
          // and a screen reader announcing "vertical" over a control the reader
          // drags sideways is the wrong half of the truth to tell.
          'aria-orientation': (vertical ? 'vertical' : 'horizontal') as 'vertical' | 'horizontal',
          'aria-valuemin': 0,
          'aria-valuemax': 100,
          'aria-valuenow': Math.round(ariaP * 100),
          'aria-valuetext': `${Math.round(ariaP * 100)} percent down the page`,
          onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
            e.preventDefault();
            heldRef.current = true;
            wake();
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
            const p = pFromPointer(e, vertical);
            if (p !== null) scrollToP(p);
          },
          onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
            if (!heldRef.current) return;
            const p = pFromPointer(e, vertical);
            if (p !== null) scrollToP(p);
          },
          onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
            heldRef.current = false;
            const el = e.currentTarget as HTMLElement;
            if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
            wake();
          },
          onPointerCancel: () => {
            heldRef.current = false;
            wake();
          },
          onFocus: () => {
            heldRef.current = true;
            setAriaP(pRef.current);
            wake();
          },
          onBlur: () => {
            heldRef.current = false;
            wake();
          },
          onKeyDown: (e: React.KeyboardEvent) => {
            // A tenth of the page per arrow, a screenful per page key. Both
            // are what the native scrollbar's own keys do, near enough.
            const step =
              e.key === 'PageDown' || e.key === 'PageUp'
                ? 1 / Math.max(1, (measure()?.total ?? 1) / window.innerHeight)
                : 0.1;
            const dir =
              e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown'
                ? 1
                : e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp'
                  ? -1
                  : 0;
            if (dir !== 0) {
              e.preventDefault();
              scrollToP(pRef.current + dir * step);
              return;
            }
            if (e.key === 'Home' || e.key === 'End') {
              e.preventDefault();
              scrollToP(e.key === 'Home' ? 0 : 1);
            }
          },
          cursor: 'grab',
          _active: { cursor: 'grabbing' },
          // Or a touch drag scrolls the page underneath instead of scrubbing.
          sx: { touchAction: 'none', WebkitTapHighlightColor: 'transparent', ...STILL },
        }
      : {};

  // Nothing at all when the coin is always on, so the journal's boxes carry
  // exactly the props they carried before this component existed.
  const fade = autoHide
    ? { opacity: awake ? 1 : 0, transition: 'opacity 0.35s ease', sx: STILL }
    : {};
  const railDisplay = { base: rail === 'always' ? 'block' : 'none', xl: 'block' };
  const barDisplay = { base: rail === 'always' ? 'none' : 'block', xl: 'none' };

  return (
    <>
      {/* Desktop rail. Lives in the right gutter, below the navbar's z-index. */}
      <Box
        ref={trackRef}
        data-vp-coin-rail={scrub ? 'scrub' : 'plain'}
        position="fixed"
        // The journal's two values, untouched, plus one for the widths only the
        // portal shows the rail at. 10px clears a classic Windows scrollbar,
        // which sits OUTSIDE the box a fixed element is positioned against, and
        // leaves the macOS overlay room to come and go beside it.
        right={rail === 'always' ? { base: '10px', xl: '28px', '2xl': '44px' } : { xl: '28px', '2xl': '44px' }}
        top="50%"
        transform="translateY(-50%)"
        h="min(44vh, 400px)"
        w={`${COIN}px`}
        zIndex={900}
        display={railDisplay}
        // The TRACK never takes pointer events, whatever the coin does. It is
        // 400px of invisible column down the side of the page and anything it
        // swallowed would be a click the reader aimed at the page.
        pointerEvents="none"
        aria-hidden={scrub ? undefined : 'true'}
        {...fade}
      >
        <Box position="absolute" left="50%" top={`${COIN / 2}px`} bottom={`${COIN / 2}px`} w="1px" bg="gray.200" />
        <Box
          ref={deskFillRef}
          position="absolute"
          left="50%"
          top={`${COIN / 2}px`}
          h={`calc(100% - ${COIN}px)`}
          w="1px"
          bg="brand.accent"
          transformOrigin="top"
          transform="scaleY(0)"
        />
        <Box
          ref={deskCoinRef}
          position="absolute"
          top="0"
          left="0"
          w={`${COIN}px`}
          h={`${COIN}px`}
          willChange="transform"
          filter="drop-shadow(0 1px 4px rgba(15, 15, 15, 0.18))"
        >
          <VPMedallion size={COIN} />
          {scrub && (
            <Box
              data-vp-coin-grab="rail"
              position="absolute"
              top="50%"
              left="50%"
              w={`${GRAB}px`}
              h={`${GRAB}px`}
              ml={`${-GRAB / 2}px`}
              mt={`${-GRAB / 2}px`}
              borderRadius="full"
              pointerEvents="auto"
              _focusVisible={{ outline: '2px solid', outlineColor: 'brand.accent', outlineOffset: '2px' }}
              {...dragProps(true)}
            />
          )}
        </Box>
      </Box>

      {/* Mobile and tablet: a hairline along the bottom edge, coin on its tip.

          NOT RENDERED AT ALL when a surface has turned it off, rather than
          hidden: a draggable coin is a focusable slider, and one sitting in a
          display:none box is a tab stop nobody can see waiting for the day
          somebody changes a breakpoint. */}
      {bottomBar && (
        <Box
          data-vp-coin-bar={scrub ? 'scrub' : 'plain'}
          position="fixed"
          left="0"
          right="0"
          bottom="0"
          zIndex={1400}
          display={barDisplay}
          pointerEvents="none"
          aria-hidden={scrub ? undefined : 'true'}
          {...fade}
        >
          <Box
            ref={mobCoinRef}
            position="absolute"
            bottom="7px"
            left="0"
            w={`${COIN_MOBILE}px`}
            h={`${COIN_MOBILE}px`}
            willChange="transform"
            filter="drop-shadow(0 1px 3px rgba(15, 15, 15, 0.22))"
          >
            <VPMedallion size={COIN_MOBILE} />
            {scrub && (
              <Box
                data-vp-coin-grab="bar"
                position="absolute"
                top="50%"
                left="50%"
                w={`${GRAB}px`}
                h={`${GRAB}px`}
                ml={`${-GRAB / 2}px`}
                mt={`${-GRAB / 2}px`}
                borderRadius="full"
                pointerEvents="auto"
                _focusVisible={{ outline: '2px solid', outlineColor: 'brand.accent', outlineOffset: '2px' }}
                {...dragProps(false)}
              />
            )}
          </Box>
          <Box h="2.5px" bg="blackAlpha.100">
            <Box
              ref={mobFillRef}
              h="100%"
              w="100%"
              bg="brand.accent"
              transformOrigin="left"
              transform="scaleX(0)"
            />
          </Box>
        </Box>
      )}
    </>
  );
}
