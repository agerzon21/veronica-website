import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Flex, HStack, Icon, Image, Text, VStack, VisuallyHidden, chakra } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { AnimatePresence, m, useReducedMotion } from 'framer-motion';
import FaArrowRight from '../icons/fa/FaArrowRight';
import FaCamera from '../icons/fa/FaCamera';
import FaStar from '../icons/fa/FaStar';
import { toDirectImageUrl } from '../utils/driveImage';
// Type only: erased at build, so the popup stays out of the homepage bundle.
import type { PublicReview } from './ReviewModal';

/**
 * The homepage review band as a carousel (Alex, 2026-09-17, after the
 * neptolab.com showcase): two reviews in the middle, and the pairs before and
 * after them waiting at the sides as faint, slightly smaller outlines. The
 * arrows slide the whole row, so the pair on screen moves off to one side and
 * the next pair takes its place. It loops, and the order is shuffled once per
 * visit, so every visit still opens on a random two.
 *
 * Built on m.div with measured pixel offsets rather than a slider library:
 * framer-motion is already on the page, and <LazyMotion strict> only loads
 * domAnimation, which has no drag, so the swipe is plain touch events.
 */

type Review = PublicReview;

const MotionDiv = m.div;

// Every card is the same size whatever the review's length (Alex, 2026-09-16).
// The quote box is fixed at exactly this many lines of bodyLead (1rem / 1.125rem
// at line-height 1.75) and clamped with an ellipsis, so a two-line review
// leaves the space empty rather than shrinking its card, and a long one is cut
// off with the whole text a click away.
const QUOTE_LINES = 5;
export const QUOTE_HEIGHT = {
  base: `${QUOTE_LINES * 1.75}rem`,
  md: `${QUOTE_LINES * 1.75 * 1.125}rem`,
};

// Draws the review's actual rating. It used to draw five stars whatever the
// row said.
export const Stars = ({ rating, size = 3.5 }: { rating: number; size?: number }) => {
  const filled = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return (
    <HStack spacing={0.5} role="img" aria-label={`${filled} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon as={FaStar} key={n} color={n <= filled ? '#fbbc04' : 'whiteAlpha.400'} boxSize={size} />
      ))}
    </HStack>
  );
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

/**
 * The attribution block: a rectangle ruled off from the quote, with the
 * client's own photograph filling a square at its left edge and the name in
 * the remainder. At 88px the photograph is a portrait rather than avatar
 * furniture, which is the point: these are Vero's own photographs of the
 * people doing the recommending.
 *
 * Legacy rows may still hold a raw Drive share link, so they are normalised on
 * the way out as well as on the way in.
 */
const AuthorBadge = ({ review }: { review: Review }) => {
  const initials = getInitials(review.author_name);
  const photo = toDirectImageUrl(review.author_photo_url, 240);
  return (
    <Flex
      w="100%"
      mt="auto"
      border="1px solid"
      borderColor="whiteAlpha.300"
      bg="rgba(255, 255, 255, 0.05)"
      align="stretch"
      overflow="hidden"
    >
      <Box
        flex="none"
        w={{ base: '76px', md: '88px' }}
        h={{ base: '76px', md: '88px' }}
        borderRight="1px solid"
        borderColor="whiteAlpha.300"
        bg="whiteAlpha.200"
        // Not positioned: a positioned box here would paint over the card
        // button's stretched ::after and swallow taps on the portrait.
      >
        {photo ? (
          <Image
            src={photo}
            alt={review.author_name}
            w="100%"
            h="100%"
            objectFit="cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        ) : (
          <Flex w="100%" h="100%" align="center" justify="center">
            <Text
              fontFamily="heading"
              fontWeight="300"
              fontSize={{ base: '1.5rem', md: '1.75rem' }}
              letterSpacing="0.06em"
              color="whiteAlpha.900"
            >
              {initials}
            </Text>
          </Flex>
        )}
      </Box>
      <Flex flex="1" align="center" px={{ base: 4, md: 5 }} minW={0}>
        <Text textStyle="eyebrowOnDark" noOfLines={2}>
          {review.author_name}
        </Text>
      </Flex>
    </Flex>
  );
};

/**
 * One review. The whole card is the target: the small gold button's ::after
 * is stretched over the card, which keeps a single, named control for
 * keyboards and screen readers while giving touch the full card. (It is a
 * text affordance inside a card, like the "Reviews on Google" link above it,
 * not a CTA, hence not CTAButton.)
 *
 * `active` is false for the faint pairs at the sides: their content fades out
 * and only the card's outline stays, and a click brings that pair to the
 * middle instead of opening the popup.
 */
export const ReviewCard = ({
  review,
  active = true,
  onActivate,
  onWarm,
}: {
  review: Review;
  active?: boolean;
  onActivate: () => void;
  onWarm?: () => void;
}) => {
  const quoteRef = useRef<HTMLParagraphElement | null>(null);
  const [clamped, setClamped] = useState(false);

  // Whether the ellipsis actually cut anything decides the button's wording.
  // Re-measured when the webfont lands, since that changes where lines break
  // without changing the box's size (which is all ResizeObserver reports).
  useEffect(() => {
    const el = quoteRef.current;
    if (!el) return;
    let alive = true;
    const measure = () => {
      if (alive) setClamped(el.scrollHeight - el.clientHeight > 1);
    };
    measure();
    void document.fonts?.ready.then(measure);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    return () => {
      alive = false;
      ro?.disconnect();
    };
  }, [review.text]);

  const photoCount = review.photo_urls?.length ?? 0;
  const label = clamped ? 'Read the full review' : photoCount > 0 ? 'See their photos' : 'View the review';

  return (
    <Box
      role="group"
      position="relative"
      flex={1}
      minW={0}
      w="100%"
      bg="rgba(255, 255, 255, 0.07)"
      border="1px solid"
      borderColor="whiteAlpha.300"
      borderRadius="sm"
      backdropFilter="blur(6px)"
      cursor="pointer"
      transition="background-color 0.3s, border-color 0.3s"
      _hover={{ bg: 'rgba(255, 255, 255, 0.1)', borderColor: 'whiteAlpha.500' }}
      onPointerEnter={active ? onWarm : undefined}
      onTouchStart={active ? onWarm : undefined}
      onFocusCapture={active ? onWarm : undefined}
    >
      <VStack
        spacing={5}
        p={{ base: 5, md: 6 }}
        align="start"
        h="100%"
        opacity={active ? 1 : 0}
        // Fading in a beat after the slide starts, and out straight away, so
        // the outgoing text is gone before it reaches the side.
        transition={active ? 'opacity 0.4s ease 0.18s' : 'opacity 0.2s ease'}
        sx={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
      >
        {/* Fixed height: the photo count's line box is a pixel and a half
            taller than the stars, which made cards with photos taller than
            cards without. */}
        <Flex w="100%" h={4} align="center" justify="space-between" gap={3}>
          <Stars rating={review.rating} />
          {photoCount > 0 && (
            <HStack spacing={1.5}>
              <Icon as={FaCamera} boxSize={3} color="brand.accent" />
              <Text textStyle="metaCaption" color="whiteAlpha.800">
                {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
              </Text>
            </HStack>
          )}
        </Flex>

        <Text
          ref={quoteRef}
          textStyle="bodyLead"
          color="whiteAlpha.900"
          noOfLines={QUOTE_LINES}
          h={QUOTE_HEIGHT}
          w="100%"
        >
          “{review.text}”
        </Text>

        <chakra.button
          type="button"
          onClick={onActivate}
          aria-haspopup={active ? 'dialog' : undefined}
          tabIndex={active ? 0 : -1}
          display="inline-flex"
          alignItems="center"
          gap={2}
          p={0}
          bg="transparent"
          textStyle="ctaLabel"
          color="brand.accent"
          transition="color 0.3s"
          _groupHover={{ color: 'brand.accentSoft' }}
          sx={{
            WebkitTapHighlightColor: 'transparent',
            '&::after': { content: '""', position: 'absolute', inset: 0, borderRadius: 'sm' },
            '&:focus-visible': { outline: 'none' },
            '&:focus-visible::after': { boxShadow: '0 0 0 2px #c9a96e' },
          }}
        >
          {label}
          <VisuallyHidden>, from {review.author_name}</VisuallyHidden>
          <Icon
            as={FaArrowRight}
            boxSize={2.5}
            transition="transform 0.3s"
            _groupHover={{ transform: 'translateX(3px)' }}
          />
        </chakra.button>

        <AuthorBadge review={review} />
      </VStack>
    </Box>
  );
};

// ── Carousel geometry ──────────────────────────────────────────────────
// Three bands, matching the theme's md (48em) and lg (62em) breakpoints.
// `peek` is how much of the neighbouring pair shows at each side, `s1`/`s2`
// the scale of the first and second pair out. Phones stack each pair.
const LAYOUT = {
  phone: { gap: 12, peek: 22, maxPage: 560, s1: 0.92, s2: 0.8, stacked: true },
  tablet: { gap: 24, peek: 44, maxPage: 1000, s1: 0.86, s2: 0.72, stacked: false },
  desktop: { gap: 40, peek: 72, maxPage: 1000, s1: 0.86, s2: 0.72, stacked: false },
} as const;
type Band = keyof typeof LAYOUT;

const bandNow = (): Band => {
  if (typeof window === 'undefined' || !window.matchMedia) return 'desktop';
  if (window.matchMedia('(min-width: 62em)').matches) return 'desktop';
  if (window.matchMedia('(min-width: 48em)').matches) return 'tablet';
  return 'phone';
};

const mod = (n: number, m: number) => ((n % m) + m) % m;

const SLIDE = { duration: 0.6, ease: [0.22, 1, 0.36, 1] };

// Round glass arrow, the same family as the Instagram popup's arrows but
// lighter, because it sits on the photograph rather than a black backdrop.
const SideArrow = ({
  direction,
  onClick,
  left,
}: {
  direction: 'prev' | 'next';
  onClick: () => void;
  left: string;
}) => (
  <chakra.button
    type="button"
    onClick={onClick}
    aria-label={direction === 'prev' ? 'Previous reviews' : 'Next reviews'}
    position="absolute"
    top="50%"
    left={left}
    zIndex={5}
    w={{ base: '40px', md: '48px' }}
    h={{ base: '40px', md: '48px' }}
    transform="translate(-50%, -50%)"
    borderRadius="full"
    border="1px solid"
    borderColor="whiteAlpha.400"
    bg="rgba(10, 16, 32, 0.45)"
    color="whiteAlpha.900"
    backdropFilter="blur(8px)"
    display="flex"
    alignItems="center"
    justifyContent="center"
    transition="background-color 0.25s, border-color 0.25s, color 0.25s"
    _hover={{ bg: 'rgba(201, 169, 110, 0.22)', borderColor: 'brand.accent', color: 'white' }}
    _focusVisible={{ outline: 'none', boxShadow: '0 0 0 2px #c9a96e' }}
    sx={{ WebkitTapHighlightColor: 'transparent' }}
  >
    <Icon as={direction === 'prev' ? ChevronLeftIcon : ChevronRightIcon} boxSize={{ base: 5, md: 6 }} />
  </chakra.button>
);

const ReviewsCarousel = ({
  reviews,
  onOpen,
  onWarm,
}: {
  reviews: Review[];
  onOpen: (index: number) => void;
  onWarm?: () => void;
}) => {
  const n = reviews.length;
  // Pages of two. With an odd count the last page borrows the first review,
  // so every page is a full pair.
  const pageCount = n <= 2 ? 1 : Math.ceil(n / 2);
  const pageItems = (k: number): number[] =>
    n === 1 ? [0] : [2 * k, 2 * k + 1 < n ? 2 * k + 1 : 0];

  // pos is unbounded, so looping past the end keeps sliding the same way
  // instead of rewinding; the page shown is pos mod pageCount.
  const [pos, setPos] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [announce, setAnnounce] = useState('');
  const page = mod(pos, pageCount);
  const reduceMotion = useReducedMotion();

  const trackRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  const [band, setBand] = useState<Band>(bandNow);
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth || window.innerWidth);
      setBand(bandNow());
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const L = LAYOUT[band];
  const pageW = Math.max(240, Math.min(L.maxPage, width - 2 * (L.gap + L.peek)));
  const x1 = pageW / 2 + L.gap + (L.s1 * pageW) / 2;
  const x2 = x1 + (L.s1 * pageW) / 2 + L.gap + (L.s2 * pageW) / 2;
  const placeFor = (o: number) => {
    const a = Math.abs(o);
    const sign = Math.sign(o);
    if (a === 0) return { x: 0, scale: 1, opacity: 1 };
    if (a === 1) return { x: sign * x1, scale: L.s1, opacity: 0.55 };
    return { x: sign * x2, scale: L.s2, opacity: 0 };
  };

  const go = useCallback(
    (delta: number) => {
      if (pageCount < 2 || delta === 0) return;
      setDir(delta > 0 ? 1 : -1);
      setPos((p) => p + delta);
    },
    [pageCount],
  );

  // Tell screen readers which pair is showing, but only after a move.
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) {
      moved.current = true;
      return;
    }
    const [a, b] = pageItems(page);
    const names = n === 1 ? reviews[a].author_name : `${reviews[a].author_name} and ${reviews[b].author_name}`;
    setAnnounce(`Showing reviews from ${names}, page ${page + 1} of ${pageCount}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  // Swipe: one finger, horizontal, and deliberate, so vertical scrolling over
  // the cards is never hijacked and a pinch or a pan of a zoomed page is not
  // mistaken for a page turn.
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchCancel = () => {
    touch.current = null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    const t = e.changedTouches[0];
    if (!start || !t || e.touches.length > 0) return;
    if (window.visualViewport && window.visualViewport.scale > 1.01) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    go(dx < 0 ? 1 : -1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Modified arrows belong to the browser (Alt+Left is Back).
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    // A card button that had focus is about to slide off to the side and
    // become hidden; hold focus on the carousel itself instead, so the next
    // Tab lands on the new middle pair.
    if ((e.target as HTMLElement).closest('[data-page]')) {
      trackRef.current?.focus({ preventScroll: true });
    }
    go(e.key === 'ArrowRight' ? 1 : -1);
  };

  const transition = reduceMotion ? { duration: 0 } : SLIDE;
  const offsets = pageCount < 2 ? [0] : [-2, -1, 0, 1, 2];
  // Where a pair enters from, and leaves to, when it was not already one of
  // the five on stage (a jump from the dots): the far side it came from.
  const variants = {
    enter: (d: number) => ({ ...placeFor(2 * d), transition: { duration: 0 } }),
    exit: (d: number) => ({ ...placeFor(-2 * d), transition }),
  };

  return (
    <Box>
      <Box
        ref={trackRef}
        position="relative"
        // Full bleed: the pairs at the sides run out to the band's edges.
        mx={-6}
        role="region"
        aria-roledescription="carousel"
        aria-label="Client reviews"
        tabIndex={-1}
        outline="none"
        onKeyDown={onKeyDown}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        {/* popLayout: a pair leaving after a dot jump is taken out of the flow
            while it animates away, so it never stacks under the new one. */}
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          {offsets.map((o) => {
            const key = pos + o;
            const k = mod(key, pageCount);
            const active = o === 0;
            const items = pageItems(k);
            return (
              <MotionDiv
                key={key}
                custom={dir}
                variants={variants}
                initial="enter"
                exit="exit"
                animate={placeFor(o)}
                transition={transition}
                aria-hidden={active ? undefined : true}
                data-page={k}
                data-active={active ? 'true' : 'false'}
                // The middle pair is in flow and gives the row its height;
                // the others sit on top of it at the same spot and are moved
                // out by their transform. Same left edge either way, and no
                // negative margin, which popLayout would count twice when it
                // pins a leaving page. The far pairs are invisible, so they
                // must not catch clicks on very wide screens either.
                style={{
                  position: active ? 'relative' : 'absolute',
                  top: 0,
                  left: active ? undefined : `calc(50% - ${pageW / 2}px)`,
                  marginLeft: active ? 'auto' : undefined,
                  marginRight: active ? 'auto' : undefined,
                  width: pageW,
                  zIndex: 3 - Math.abs(o),
                  pointerEvents: Math.abs(o) >= 2 ? 'none' : undefined,
                }}
              >
                <Flex direction={L.stacked ? 'column' : 'row'} gap={L.stacked ? 10 : 14} align="stretch">
                  {items.map((idx) => (
                    <ReviewCard
                      key={idx}
                      review={reviews[idx]}
                      active={active}
                      onActivate={active ? () => onOpen(idx) : () => go(o)}
                      onWarm={onWarm}
                    />
                  ))}
                </Flex>
              </MotionDiv>
            );
          })}
        </AnimatePresence>

        {pageCount > 1 && (
          <>
            <SideArrow direction="prev" onClick={() => go(-1)} left={`calc(50% - ${pageW / 2 + L.gap / 2}px)`} />
            <SideArrow direction="next" onClick={() => go(1)} left={`calc(50% + ${pageW / 2 + L.gap / 2}px)`} />
          </>
        )}
        <VisuallyHidden aria-live="polite">{announce}</VisuallyHidden>
      </Box>

      {pageCount > 1 && (
        <Flex justify="center" wrap="wrap" mt={{ base: 6, md: 8 }} role="group" aria-label="Choose reviews">
          {Array.from({ length: pageCount }, (_, k) => {
            const current = k === page;
            return (
              <chakra.button
                key={k}
                type="button"
                onClick={() => go(k - page)}
                aria-label={`Show review page ${k + 1} of ${pageCount}`}
                aria-current={current ? 'true' : undefined}
                // A 28px target around a 6px dot: easy to hit with a thumb.
                h="28px"
                minW="28px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                bg="transparent"
                _focusVisible={{ outline: 'none', '& > span': { boxShadow: '0 0 0 2px #c9a96e' } }}
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Box
                  as="span"
                  display="block"
                  h="6px"
                  w={current ? '22px' : '6px'}
                  borderRadius="full"
                  bg={current ? 'brand.accent' : 'whiteAlpha.500'}
                  transition="width 0.3s ease, background-color 0.3s ease"
                />
              </chakra.button>
            );
          })}
        </Flex>
      )}
    </Box>
  );
};

export default ReviewsCarousel;
