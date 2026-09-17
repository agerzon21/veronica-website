// Reviews now come from the DB (admin panel Reviews tab). Was hardcoded
// TESTIMONIAL_POOL — see git history.
import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Box, Text, Flex, VStack, HStack, Link, Icon, Image, Portal, VisuallyHidden, chakra,
} from '@chakra-ui/react';
import { AnimatePresence, m, useInView, useMotionValue, useScroll, useTransform } from 'framer-motion';
import FaArrowRight from '../icons/fa/FaArrowRight';
import FaCamera from '../icons/fa/FaCamera';
import FaGoogle from '../icons/fa/FaGoogle';
import FaStar from '../icons/fa/FaStar';
import CTAButton from './ui/CTAButton';
import { toDirectImageUrl } from '../utils/driveImage';
import { attemptChunkRecovery, isChunkLoadError, prefetchChunk } from './ChunkErrorBoundary';
// Type only, so this import is erased and the popup stays out of the
// homepage bundle until it is needed.
import type { PublicReview } from './ReviewModal';

// The full-review popup. Fetched the first time a visitor points at, touches
// or tabs to a card, so it is usually already loaded by the time they click.
const loadReviewModal = () => import('./ReviewModal');
const ReviewModal = lazy(loadReviewModal);
// Through prefetchChunk, so a warm-up that 404s in a tab left open across a
// deploy stays silent instead of reloading the page under the visitor.
const preloadReviewModal = () => prefetchChunk(loadReviewModal);

/**
 * Keeps a failed popup download from taking the whole homepage with it.
 * Suspense does not catch errors, so without this a rejected chunk (offline,
 * or a stale tab) would climb to the root boundary and replace the entire
 * site with its error screen. Here it only closes the popup, and a stale-deploy
 * miss still gets the usual one-time reload.
 */
class ReviewModalBoundary extends Component<
  { children: ReactNode; onFail: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onFail();
    if (isChunkLoadError(error)) attemptChunkRecovery();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

const MotionDiv = m.div;

const GOOGLE_PROFILE_URL = 'https://g.page/r/CSNq8ccyWt_wEAE';
const GOOGLE_WRITE_REVIEW_URL = 'https://g.page/r/CSNq8ccyWt_wEAE/review';

// Fallback used when the API errors or the aggregate row hasn't been
// seeded yet. Keeps the badge from ever rendering "· null Reviews on
// Google" — a small stability net for a piece of homepage chrome.
const FALLBACK_RATING = '5.0';
const FALLBACK_REVIEW_COUNT = 15;

const TESTIMONIALS_TO_DISPLAY = 2;

// Every card is the same size whatever the review's length (Alex, 2026-09-16).
// The quote box is fixed at exactly this many lines of bodyLead (1rem / 1.125rem
// at line-height 1.75) and clamped with an ellipsis, so a two-line review
// leaves the space empty rather than shrinking its card, and a long one is cut
// off with the whole text a click away.
const QUOTE_LINES = 5;
const QUOTE_HEIGHT = {
  base: `${QUOTE_LINES * 1.75}rem`,
  md: `${QUOTE_LINES * 1.75 * 1.125}rem`,
};

type Review = PublicReview;

// Draws the review's actual rating. It used to draw five stars whatever the
// row said.
const Stars = ({ rating, size = 3.5 }: { rating: number; size?: number }) => {
  const filled = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return (
    <HStack spacing={0.5} role="img" aria-label={`${filled} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon
          as={FaStar}
          key={n}
          color={n <= filled ? '#fbbc04' : 'whiteAlpha.400'}
          boxSize={size}
        />
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
 * the remainder.
 *
 * The photograph was a 32px circle, which is avatar furniture — too small to
 * recognise anyone in, and a shape that appears nowhere else on a site built
 * out of squared frames and hairlines. At 88px it is a portrait, which is the
 * point: these are Vero's own photographs of the people doing the recommending.
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
 * One review on the band. The whole card opens the popup: the small gold
 * button's ::after is stretched over the card, which keeps a single, named
 * control for keyboards and screen readers while giving touch the full card
 * as a target. (It is a text affordance inside a card, like the "Reviews on
 * Google" link above, not a CTA, hence not CTAButton.)
 */
const ReviewCard = ({ review, onOpen }: { review: Review; onOpen: () => void }) => {
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
  const label = clamped
    ? 'Read the full review'
    : photoCount > 0
      ? 'See their photos'
      : 'View the review';

  return (
    <VStack
      role="group"
      position="relative"
      flex={1}
      minW={0}
      w="100%"
      spacing={5}
      p={{ base: 5, md: 6 }}
      align="start"
      bg="rgba(255, 255, 255, 0.07)"
      border="1px solid"
      borderColor="whiteAlpha.300"
      borderRadius="sm"
      backdropFilter="blur(6px)"
      cursor="pointer"
      transition="background-color 0.3s, border-color 0.3s"
      _hover={{ bg: 'rgba(255, 255, 255, 0.1)', borderColor: 'whiteAlpha.500' }}
      onPointerEnter={preloadReviewModal}
      onTouchStart={preloadReviewModal}
      onFocusCapture={preloadReviewModal}
    >
      {/* Fixed height: the photo count's line box is a pixel and a half taller
          than the stars, which made cards with photos taller than cards
          without. */}
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

      {/* The one paragraph of the card → bodyLead. The old italic
          weight-200 treatment existed nowhere else on the site; the
          curly quotes already mark this as speech. */}
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
        onClick={onOpen}
        aria-haspopup="dialog"
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
  );
};

const GoogleReviewsSection = () => {
  // Parallax: the backdrop travels a shorter distance than the page, which
  // is what reads as depth. 'start end' → 'end start' means the range runs
  // from the section entering the viewport to it leaving.
  const parallaxRef = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress: bandProgress } = useScroll({
    target: parallaxRef,
    offset: ['start end', 'end start'],
  });
  // Alex tuned these on a live preview. Two notes on the numbers:
  //
  // The drift he picked is 50% OF THE BAND's height. framer-motion's '%'
  // translation is a percentage of the ELEMENT's own height, and the backdrop
  // is taller than the band by twice the overscan below — so the band figure
  // has to be divided by (1 + 2 x overscan) before it goes in here.
  // 50 / 2.02 = 24.75.
  //
  // Overscan is 51%, not the 45% he had on screen, because drift has to stay
  // within it or the backdrop's own edge slides into the band. At 45% against
  // 50% drift there was a bare strip at the extremes; the broken scrim in that
  // preview is why it was not visible. 51 gives it a point of margin.
  const parallaxY = useTransform(bandProgress, [0, 1], ['-24.75%', '24.75%']);

  // PHONES get their own backdrop geometry (Alex, 2026-09-17: the lighthouse
  // was "zoomed in too much").
  //
  // The numbers above keep the band's WHOLE height covered at every scroll
  // position, which takes a backdrop about twice the band's height. A phone's
  // band is a tall column (about 1,070px at 390 wide), so that backdrop was
  // ~2,170px tall, and the square photograph covering it showed barely a sixth
  // of its width: a blur of dress. Only the part of the band that is on screen
  // ever needs covering, so a much shorter backdrop does the job.
  //
  // The drift is the same as before: the photo moves by the band's height H
  // over the whole scroll (y = p * H + constant), which is what makes it lag
  // the page. With V the screen height and k = H / (H + V), the shortest
  // backdrop that still covers every on-screen slice is H - k(H - V), placed
  // at y = p * H - k * V. It gets 10% of V (at least 64px) spare at each end,
  // because Safari's toolbars change V mid-scroll, and is never shorter than
  // the band. Checked with screenshots at three scroll positions.
  const mobileGeom = useRef<{ H: number; V: number; spare: number } | null>(null);
  const [mobileBoxH, setMobileBoxH] = useState<number | null>(null);
  const mobileY = useMotionValue(0);
  useEffect(() => {
    const band = parallaxRef.current;
    if (!band) return;
    const place = (p: number) => {
      const g = mobileGeom.current;
      if (!g) return;
      const k = g.H / (g.H + g.V);
      mobileY.set(p * g.H - k * g.V - g.spare);
    };
    const measure = () => {
      const H = band.offsetHeight;
      // clientHeight, not innerHeight: it is what framer's progress is built
      // on, and it stays put when a phone's toolbar slides in or out, so the
      // photo does not re-zoom mid-scroll. The spare absorbs the difference.
      const V = document.documentElement.clientHeight;
      if (!H || !V) return;
      const k = H / (H + V);
      const shortest = H - k * (H - V);
      const boxH = Math.max(H, shortest + 2 * Math.max(64, 0.1 * V));
      mobileGeom.current = { H, V, spare: (boxH - shortest) / 2 };
      setMobileBoxH(Math.ceil(boxH));
      place(bandProgress.get());
    };
    measure();
    const unsubscribe = bandProgress.on('change', place);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    ro?.observe(band);
    window.addEventListener('resize', measure);
    return () => {
      unsubscribe();
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [bandProgress, mobileY]);
  const [testimonials, setTestimonials] = useState<Review[]>([]);
  const [rating, setRating] = useState<string>(FALLBACK_RATING);
  const [reviewCount, setReviewCount] = useState<number>(FALLBACK_REVIEW_COUNT);
  const [loading, setLoading] = useState(true);
  const [openReview, setOpenReview] = useState<Review | null>(null);
  const closeReview = useCallback(() => setOpenReview(null), []);

  // Only fetch once this section is near the viewport.
  //
  // This ran on mount, which put /api/reviews on the homepage's critical
  // request chain — a PageSpeed run measured it as the longest pole there at
  // 891 ms — for a strip that sits well below the fold. The score barely cares
  // (that audit is unscored and the payload is 2 KiB), but every homepage visit
  // was invoking a serverless function for data most visitors never scroll to,
  // and function calls are the scarce resource on this plan.
  //
  // rootMargin starts the fetch before the section is actually visible, so it
  // is still loaded by the time it is scrolled into view. Same useInView the
  // rest of the site already uses for reveal animations.
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const nearViewport = useInView(sectionRef, { once: true, margin: '600px 0px' });

  useEffect(() => {
    if (!nearViewport) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/reviews?limit=10');
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success && Array.isArray(data.reviews)) {
          const shuffled = [...(data.reviews as Review[])].sort(
            () => Math.random() - 0.5
          );
          setTestimonials(shuffled.slice(0, TESTIMONIALS_TO_DISPLAY));
          // aggregate.rating / .count are null before Vero seeds them —
          // fall through to the constants so the badge stays intact.
          const agg = data.aggregate as
            | { rating?: string | null; count?: number | null }
            | undefined;
          if (agg && typeof agg.rating === 'string' && agg.rating.trim()) {
            setRating(agg.rating.trim());
          }
          if (agg && typeof agg.count === 'number' && agg.count >= 0) {
            setReviewCount(agg.count);
          }
        } else {
          setTestimonials([]);
        }
      } catch {
        if (!cancelled) setTestimonials([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nearViewport]);

  return (
    // layerStyle="section" supplies the bottom padding on the site's one
    // vertical interval; pt stays 0 because InstagramFeed already owns the
    // gap above this section and doubling it is exactly the "spacey" the
    // brief is about. Declared after layerStyle so it wins.
    <Box
      ref={(node: HTMLDivElement | null) => {
        sectionRef.current = node;
        parallaxRef.current = node;
      }}
      position="relative"
      layerStyle="section"
      pt={{ base: 16, md: 20 }}
      px={6}
      overflow="hidden"
      sx={{ isolation: 'isolate' }}
    >
      {/* Words about photographs deserve a photograph behind them, and it
          PARALLAXES: the backdrop is taller than the section and drifts
          against the scroll, so the band has depth instead of sitting
          flat. Portrait-centred on each breakpoint — the wide frame on
          desktop, the lighthouse portrait on phones, which is the shape
          a phone actually has room for. */}
      {/* Desktop: unchanged from Alex's tuning. */}
      <Box display={{ base: 'none', md: 'block' }}>
        <MotionDiv
          // The extra height is what the drift travels through; without it
          // the top and bottom edges would slide into view.
          style={{ y: parallaxY, position: 'absolute', top: '-51%', bottom: '-51%', left: 0, right: 0, zIndex: -2 }}
        >
          <Image
            src="/assets/photos/site/home-cta-bg.webp"
            alt=""
            w="100%"
            h="100%"
            objectFit="cover"
            objectPosition="center 0%"
            loading="lazy"
          />
        </MotionDiv>
      </Box>
      {/* Phones: the geometry measured above. Until the first measurement
          (the mount effect, long before the band is on screen) the box simply
          matches the band. `y` is always the same motion value on purpose:
          framer-motion 10 did not rebind when style.y was swapped from the
          percentage drift to this one, and the backdrop kept the old drift
          with the new height, which left a bare strip on short bands. */}
      <Box display={{ base: 'block', md: 'none' }}>
        <MotionDiv
          style={{
            y: mobileY,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: mobileBoxH ?? '100%',
            zIndex: -2,
          }}
        >
          {/* The phone photograph is SQUARE (3000x2971) and this band is a narrow
              column, so `cover` fills the height exactly and crops only the
              sides. That left no vertical overflow, which meant the
              `objectPosition: center 35%` this used to carry was doing literally
              nothing — the framing could not be adjusted at all.
              A transform moves the picture itself, which works regardless of
              which axis is overflowing. Alex tuned these on a live preview. The
              1.1 scale is what keeps the frame covered at a 5% shift: scaling is
              centred, so a scale of s leaves (s-1)/2 of spare height at each
              edge, and anything past that pulls the image's own edge into view. */}
          <Image
            src="/assets/photos/portraits/white-dress-lighthouse.webp"
            alt=""
            w="100%"
            h="100%"
            objectFit="cover"
            objectPosition="center"
            transform="translate(0%, 5%) scale(1.1)"
            loading="lazy"
          />
        </MotionDiv>
      </Box>
      {/* Desktop runs with NO wash at all. The backdrop is a portrait frame
          anchored to its top, so what the band sees is the dark blue sky, and
          the old warm-black wash was flattening exactly the colour that makes
          it worth using. Mobile keeps a wash: it is a different photograph
          (the lighthouse portrait, which is bright), it was never tuned, and
          white review text needs something behind it there. The tint is the
          cool blue rather than the old near-black, per the same call. */}
      <Box
        position="absolute"
        inset={0}
        bg={{ base: 'rgba(10, 16, 32, 0.62)', md: 'transparent' }}
        zIndex={-1}
      />
      <MotionDiv
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Header */}
        <VStack spacing={6} mb={{ base: 10, md: 14 }} maxW="measureWide" mx="auto">
          <Text textStyle="eyebrowOnDark">Kind Words</Text>
          {/* 40px, not 35 — the one rule width PageHeader uses everywhere. */}
          <Box w="40px" h="1px" bg="brand.accent" />

          {/* Google rating badge — links to profile */}
          <Link
            href={GOOGLE_PROFILE_URL}
            isExternal
            _hover={{ textDecoration: 'none' }}
            data-group
          >
            <HStack
              spacing={3}
              align="center"
              transition="all 0.3s"
              _groupHover={{ transform: 'translateY(-1px)' }}
            >
              <Icon as={FaGoogle} boxSize={4} color="whiteAlpha.800" />
              <Stars rating={Number(rating) || 5} />
              <Text
                textStyle="bodyCopy"
                color="whiteAlpha.900"
                textDecoration="underline"
                textUnderlineOffset="4px"
                textDecorationColor="whiteAlpha.500"
                transition="color 0.3s, text-decoration-color 0.3s"
                _groupHover={{
                  // accentText, not accent: this text sits on white, where
                  // #c9a96e is 2.24:1. The decoration colour below may stay
                  // decorative gold.
                  color: 'brand.accent',
                  textDecorationColor: 'brand.accent',
                }}
              >
                {rating} · {reviewCount} Reviews on Google →
              </Text>
            </HStack>
          </Link>
        </VStack>

        {/* Testimonial cards — skeleton while loading, hidden if empty */}
        {loading ? (
          <Flex
            gap={{ base: 10, md: 14 }}
            maxW="content"
            mx="auto"
            direction={{ base: 'column', md: 'row' }}
            align="stretch"
          >
            {/* Same box as a real card, so the band does not change height
                when the reviews arrive. */}
            {[0, 1].map((i) => (
              <VStack
                key={i}
                flex={1}
                spacing={5}
                p={{ base: 5, md: 6 }}
                align="start"
                border="1px solid"
                borderColor="whiteAlpha.200"
                borderRadius="sm"
              >
                <Box h="14px" w="100px" bg="whiteAlpha.300" borderRadius="sm" />
                <VStack spacing={3} align="stretch" w="100%" h={QUOTE_HEIGHT} pt={1}>
                  <Box h="14px" w="100%" bg="whiteAlpha.300" borderRadius="sm" />
                  <Box h="14px" w="95%" bg="whiteAlpha.300" borderRadius="sm" />
                  <Box h="14px" w="80%" bg="whiteAlpha.300" borderRadius="sm" />
                </VStack>
                <Box h="12px" w="140px" bg="whiteAlpha.300" borderRadius="sm" />
                <Box h={{ base: '78px', md: '90px' }} w="100%" bg="whiteAlpha.200" borderRadius="sm" />
              </VStack>
            ))}
          </Flex>
        ) : testimonials.length > 0 ? (
          <Flex
            gap={{ base: 10, md: 14 }}
            maxW="content"
            mx="auto"
            direction={{ base: 'column', md: 'row' }}
            align="stretch"
          >
            {testimonials.map((t) => (
              <ReviewCard key={t.id} review={t} onOpen={() => setOpenReview(t)} />
            ))}
          </Flex>
        ) : null}

        {/* CTA — links to write-review URL */}
        <Flex justify="center" mt={{ base: 10, md: 14 }}>
          <CTAButton href={GOOGLE_WRITE_REVIEW_URL} variant="solid">
            Leave a Review
          </CTAButton>
        </Flex>
      </MotionDiv>

      {/* Portalled to <body>. This section is `isolation: isolate`, which
          would otherwise trap the popup's z-index under the fixed navbar. */}
      <Portal>
        <ReviewModalBoundary key={openReview?.id ?? 'closed'} onFail={closeReview}>
          <Suspense fallback={null}>
            <AnimatePresence>
              {openReview && (
                <ReviewModal
                  key={openReview.id}
                  review={openReview}
                  onClose={closeReview}
                  profileUrl={GOOGLE_PROFILE_URL}
                />
              )}
            </AnimatePresence>
          </Suspense>
        </ReviewModalBoundary>
      </Portal>
    </Box>
  );
};

export default GoogleReviewsSection;
