// Reviews now come from the DB (admin panel Reviews tab). Was hardcoded
// TESTIMONIAL_POOL — see git history.
import { useState, useEffect } from 'react';
import { Box, Text, Flex, VStack, HStack, Link, Icon, Image } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { FaGoogle, FaStar } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';

const MotionDiv = motion.div;

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
          bg="brand.surface"
          border="1px solid"
          borderColor="brand.accentBorder"
          align="center"
          justify="center"
        >
          <Text
            fontSize="xs"
            fontWeight="500"
            color="brand.accentText"
            letterSpacing="0.05em"
          >
            {initials}
          </Text>
        </Flex>
      )}
      <Text
        fontSize="xs"
        fontWeight="500"
        textTransform="uppercase"
        letterSpacing="0.2em"
        color="brand.accent"
      >
        — {review.author_name}
      </Text>
    </HStack>
  );
};

const GoogleReviewsSection = () => {
  const [testimonials, setTestimonials] = useState<Review[]>([]);
  const [rating, setRating] = useState<string>(FALLBACK_RATING);
  const [reviewCount, setReviewCount] = useState<number>(FALLBACK_REVIEW_COUNT);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
  }, []);

  return (
    <Box bg="white" pt={0} pb={{ base: 14, md: 16 }} px={6}>
      <MotionDiv
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Header */}
        <VStack spacing={6} mb={{ base: 12, md: 16 }} maxW="600px" mx="auto">
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.2em"
            color="brand.accentText"
          >
            Kind Words
          </Text>
          <Box w="35px" h="1px" bg="brand.accent" />

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
              <Icon as={FaGoogle} boxSize={4} color="gray.600" />
              <FiveStars />
              <Text
                fontSize="sm"
                fontWeight="300"
                color="gray.700"
                letterSpacing="0.05em"
                textDecoration="underline"
                textUnderlineOffset="4px"
                textDecorationColor="gray.400"
                transition="color 0.3s, text-decoration-color 0.3s"
                _groupHover={{
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
            maxW="1100px"
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
                <Box h="14px" w="100px" bg="gray.100" borderRadius="sm" />
                <VStack spacing={3} align="stretch" w="100%">
                  <Box h="14px" w="100%" bg="gray.100" borderRadius="sm" />
                  <Box h="14px" w="95%" bg="gray.100" borderRadius="sm" />
                  <Box h="14px" w="80%" bg="gray.100" borderRadius="sm" />
                </VStack>
                <Box h="14px" w="140px" bg="gray.100" borderRadius="sm" />
              </VStack>
            ))}
          </Flex>
        ) : testimonials.length > 0 ? (
          <Flex
            gap={{ base: 10, md: 14 }}
            maxW="1100px"
            mx="auto"
            direction={{ base: 'column', md: 'row' }}
            align="stretch"
          >
            {testimonials.map((t) => (
              <VStack
                key={t.id}
                flex={1}
                spacing={6}
                px={{ base: 2, md: 6 }}
                align="start"
              >
                <FiveStars />
                <Text
                  fontSize={{ base: 'md', md: 'lg' }}
                  fontWeight="200"
                  color="gray.700"
                  fontStyle="italic"
                  lineHeight="1.8"
                >
                  “{t.text}”
                </Text>
                <AuthorBadge review={t} />
              </VStack>
            ))}
          </Flex>
        ) : null}

        {/* CTA — links to write-review URL */}
        <Flex justify="center" mt={{ base: 14, md: 20 }}>
          <CTAButton href={GOOGLE_WRITE_REVIEW_URL}>Leave a Review</CTAButton>
        </Flex>
      </MotionDiv>
    </Box>
  );
};

export default GoogleReviewsSection;
