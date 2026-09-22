// Reviews now come from the DB (admin panel Reviews tab). Was hardcoded
// TESTIMONIAL_POOL — see git history.
import { Component, Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Box, Text, Flex, VStack, HStack, Link, Icon, Image, Portal } from '@chakra-ui/react';
import { AnimatePresence, m, useInView, useMotionValue, useScroll, useTransform } from 'framer-motion';
import Reveal from './ui/Reveal';
import FaGoogle from '../icons/fa/FaGoogle';
import CTAButton from './ui/CTAButton';
import ReviewsCarousel, { QUOTE_HEIGHT, Stars } from './ReviewsCarousel';
import { attemptChunkRecovery, isChunkLoadError, prefetchChunk } from './ChunkErrorBoundary';
// Type only, so this import is erased and the popup stays out of the
// homepage bundle until it is needed.
import type { PublicReview } from './ReviewModal';
import { pageHeroSrcSet, pageHeroFallback } from '../utils/heroSrcSet';

const CTA_BG = '/assets/photos/site/home-cta-bg.webp';
const REVIEWS_BG = '/assets/photos/portraits/white-dress-lighthouse.webp';

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

type Review = PublicReview;

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
  // Every featured review, shuffled once per visit. The carousel opens on the
  // first two, so each visit still starts on a random pair, and the popup
  // pages through the same order.
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState<string>(FALLBACK_RATING);
  const [reviewCount, setReviewCount] = useState<number>(FALLBACK_REVIEW_COUNT);
  const [loading, setLoading] = useState(true);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const closeReview = useCallback(() => setOpenIndex(null), []);
  // The error boundary is remounted only after a failure, never on a plain
  // close, so the popup's closing animation gets to play.
  const [boundaryKey, setBoundaryKey] = useState(0);
  const onReviewFail = useCallback(() => {
    setOpenIndex(null);
    setBoundaryKey((k) => k + 1);
  }, []);

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
        const res = await fetch('/api/reviews?limit=100');
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success && Array.isArray(data.reviews)) {
          const shuffled = [...(data.reviews as Review[])].sort(
            () => Math.random() - 0.5
          );
          setReviews(shuffled);
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
          setReviews([]);
        }
      } catch {
        if (!cancelled) setReviews([]);
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
            src={pageHeroFallback(CTA_BG)}
            srcSet={pageHeroSrcSet(CTA_BG)}
            sizes="100vw"
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
          {/* 120vw, not 100vw: this one is scaled 1.1 and shifted inside a
              box that is already wider than the column, so the painted width
              exceeds the viewport. A sizes that undershoots would pick a
              candidate the browser then upscales. */}
          <Image
            src={pageHeroFallback(REVIEWS_BG)}
            srcSet={pageHeroSrcSet(REVIEWS_BG)}
            sizes="120vw"
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
      {/* amount 'some' is what `viewport={{ once: true }}` already meant:
          framer defaults the viewport amount to 'some', so nothing about when
          this fires has changed. The gate matters here because this block
          holds the Google profile link, one of the two reveals caught live at
          opacity 0 in the sweep that followed the CTAButton outage. */}
      <Reveal amount="some" from={{ opacity: 0, y: 20 }} duration={0.8}>
        {/* Header */}
        <VStack spacing={6} mb={{ base: 10, md: 14 }} maxW="measureWide" mx="auto">
          {/* as="h2", not a visual change: Home was one h1 with nothing under
              it, so no section had a name in the heading outline. The theme sets
              no styles on h1-h6 and CSSReset gives them the same margin as p. */}
          <Text as="h2" textStyle="eyebrowOnDark">Kind Words</Text>
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
        ) : reviews.length > 0 ? (
          <ReviewsCarousel reviews={reviews} onOpen={setOpenIndex} onWarm={preloadReviewModal} />
        ) : null}

        {/* The ask (Alex, 2026-09-17): not just "leave a review" but the
            reason to, which is that a review with photos can end up right
            here. "May feature" because Vero chooses which ones show. */}
        {/* Desktop has no wash over its photograph, and this sits on the
            bright sand spray, so a soft dark halo behind the words keeps them
            readable without adding a box. Phones already have the wash. */}
        <VStack
          spacing={4}
          mt={{ base: 10, md: 14 }}
          maxW="measure"
          mx="auto"
          textAlign="center"
          position="relative"
          sx={{
            '@media (min-width: 48em)': {
              textShadow: '0 1px 2px rgba(10, 16, 32, 0.35)',
              '&::before': {
                content: '""',
                position: 'absolute',
                inset: '-56px -120px',
                background:
                  'radial-gradient(closest-side, rgba(10, 16, 32, 0.55), rgba(10, 16, 32, 0.28) 55%, rgba(10, 16, 32, 0) 100%)',
                zIndex: -1,
                pointerEvents: 'none',
              },
            },
          }}
        >
          <Text
            fontFamily="heading"
            fontWeight="300"
            fontStyle="italic"
            fontSize={{ base: '1.5rem', md: '1.85rem' }}
            lineHeight="1.3"
            color="white"
          >
            Picture yourself right here.
          </Text>
          <Text textStyle="bodyCopy" color="whiteAlpha.800" maxW="30rem">
            Leave a Google review with a few favorites from your session, and we may feature it on
            this page.
          </Text>
          <Box pt={2}>
            <CTAButton href={GOOGLE_WRITE_REVIEW_URL} variant="solid" icon={FaGoogle}>
              Share your story
            </CTAButton>
          </Box>
        </VStack>
      </Reveal>

      {/* Portalled to <body>. This section is `isolation: isolate`, which
          would otherwise trap the popup's z-index under the fixed navbar. */}
      <Portal>
        <ReviewModalBoundary key={boundaryKey} onFail={onReviewFail}>
          <Suspense fallback={null}>
            <AnimatePresence>
              {openIndex !== null && reviews.length > 0 && (
                // One stable key: paging through reviews updates this popup
                // in place rather than remounting it, which would reset the
                // scroll lock and lose the focus to return to.
                <ReviewModal
                  key="review-modal"
                  reviews={reviews}
                  index={openIndex}
                  onNavigate={setOpenIndex}
                  onClose={closeReview}
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
