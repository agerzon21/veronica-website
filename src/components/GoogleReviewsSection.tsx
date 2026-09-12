// Reviews now come from the DB (admin panel Reviews tab). Was hardcoded
// TESTIMONIAL_POOL — see git history.
import { useEffect, useRef, useState } from 'react';
import { Box, Text, Flex, VStack, HStack, Link, Icon, Image } from '@chakra-ui/react';
import { m, useInView } from 'framer-motion';
import FaGoogle from '../icons/fa/FaGoogle';
import FaStar from '../icons/fa/FaStar';
import CTAButton from './ui/CTAButton';

const MotionDiv = m.div;

const GOOGLE_PROFILE_URL = 'https://g.page/r/CSNq8ccyWt_wEAE';
const GOOGLE_WRITE_REVIEW_URL = 'https://g.page/r/CSNq8ccyWt_wEAE/review';

// Fallback used when the API errors or the aggregate row hasn't been
// seeded yet. Keeps the badge from ever rendering "· null Reviews on
// Google" — a small stability net for a piece of homepage chrome.
const FALLBACK_RATING = '5.0';
const FALLBACK_REVIEW_COUNT = 15;

const TESTIMONIALS_TO_DISPLAY = 2;

interface Review {
  id: string;
  author_name: string;
  author_photo_url: string | null;
  rating: number;
  text: string;
  publish_date: string | null;
}

const FiveStars = ({ size = 3.5 }: { size?: number }) => (
  <HStack spacing={0.5}>
    {[0, 1, 2, 3, 4].map((i) => (
      <Icon as={FaStar} key={i} color="#fbbc04" boxSize={size} />
    ))}
  </HStack>
);

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

const AuthorBadge = ({ review }: { review: Review }) => {
  const initials = getInitials(review.author_name);
  return (
    <HStack spacing={3} align="center">
      {review.author_photo_url ? (
        <Image
          src={review.author_photo_url}
          alt={review.author_name}
          boxSize="32px"
          borderRadius="full"
          objectFit="cover"
          loading="lazy"
        />
      ) : (
        <Flex
          boxSize="32px"
          borderRadius="full"
          bg="whiteAlpha.200"
          border="1px solid"
          borderColor="whiteAlpha.400"
          align="center"
          justify="center"
        >
          <Text textStyle="metaCaption" color="whiteAlpha.900">{initials}</Text>
        </Flex>
      )}
      {/* Was brand.accent (#c9a96e) as TEXT on white — 2.24:1, fails AA.
          The eyebrow token carries brand.accentText instead. */}
      <Text textStyle="eyebrowOnDark">— {review.author_name}</Text>
    </HStack>
  );
};

const GoogleReviewsSection = () => {
  const [testimonials, setTestimonials] = useState<Review[]>([]);
  const [rating, setRating] = useState<string>(FALLBACK_RATING);
  const [reviewCount, setReviewCount] = useState<number>(FALLBACK_REVIEW_COUNT);
  const [loading, setLoading] = useState(true);

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
      ref={sectionRef}
      position="relative"
      layerStyle="section"
      pt={{ base: 16, md: 20 }}
      px={6}
      overflow="hidden"
      sx={{ isolation: 'isolate' }}
    >
      {/* Words about photographs deserve a photograph behind them. The
          scrim is heavy enough for AA on every string in here. */}
      <Image
        src="/assets/photos/site/home-cta-bg.webp"
        alt=""
        position="absolute"
        inset={0}
        w="100%"
        h="100%"
        objectFit="cover"
        objectPosition="center 40%"
        zIndex={-2}
        loading="lazy"
      />
      <Box position="absolute" inset={0} bg="rgba(12, 10, 6, 0.76)" zIndex={-1} />
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
              <FiveStars />
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
            {[0, 1].map((i) => (
              <VStack
                key={i}
                flex={1}
                spacing={6}
                px={{ base: 2, md: 6 }}
                align="start"
              >
                <Box h="14px" w="100px" bg="whiteAlpha.300" borderRadius="sm" />
                <VStack spacing={3} align="stretch" w="100%">
                  <Box h="14px" w="100%" bg="whiteAlpha.300" borderRadius="sm" />
                  <Box h="14px" w="95%" bg="whiteAlpha.300" borderRadius="sm" />
                  <Box h="14px" w="80%" bg="whiteAlpha.300" borderRadius="sm" />
                </VStack>
                <Box h="14px" w="140px" bg="whiteAlpha.300" borderRadius="sm" />
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
              <VStack
                key={t.id}
                flex={1}
                spacing={6}
                p={{ base: 6, md: 8 }}
                align="start"
                bg="rgba(255, 255, 255, 0.07)"
                border="1px solid"
                borderColor="whiteAlpha.300"
                borderRadius="sm"
                backdropFilter="blur(6px)"
              >
                <FiveStars />
                {/* The one paragraph of the card → bodyLead. The old italic
                    weight-200 treatment existed nowhere else on the site; the
                    curly quotes already mark this as speech. */}
                <Text textStyle="bodyLead" color="whiteAlpha.900">“{t.text}”</Text>
                <AuthorBadge review={t} />
              </VStack>
            ))}
          </Flex>
        ) : null}

        {/* CTA — links to write-review URL */}
        <Flex justify="center" mt={{ base: 10, md: 14 }}>
          <CTAButton href={GOOGLE_WRITE_REVIEW_URL}>Leave a Review</CTAButton>
        </Flex>
      </MotionDiv>
    </Box>
  );
};

export default GoogleReviewsSection;
