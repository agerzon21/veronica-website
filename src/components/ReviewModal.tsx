import { useEffect, useId, useRef, useState } from 'react';
import { Box, Flex, HStack, Icon, Image, Text, chakra } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { m, useReducedMotion } from 'framer-motion';
import FaExternalLinkAlt from '../icons/fa/FaExternalLinkAlt';
import FaGoogle from '../icons/fa/FaGoogle';
import FaStar from '../icons/fa/FaStar';
import FaTimes from '../icons/fa/FaTimes';
import CTAButton from './ui/CTAButton';
import { SectionHead } from './ContactRail';
import { toDirectImageUrl } from '../utils/driveImage';
import { reviewSite, verifyLabel, type ReviewSource } from '../utils/reviewSource';

/**
 * The full view of one homepage review: the whole text, the photos the client
 * attached, and a button to the review where it was posted, so a visitor can
 * check it is real.
 *
 * Built like IgPostModal (plain m.div, not Chakra's Modal) for the reason that
 * file gives, plus one of its own: the public site runs framer-motion under
 * <LazyMotion strict>, and Chakra's modal uses the full `motion` component,
 * which throws there. What IgPostModal lacks, this adds: it is announced as a
 * dialog, keeps Tab inside itself, and hands focus back to the card that
 * opened it.
 *
 * Loaded lazily by GoogleReviewsSection, so the homepage does not ship it
 * until someone reaches for a review.
 */

export interface PublicReview {
  id: string;
  author_name: string;
  author_photo_url: string | null;
  rating: number;
  text: string;
  publish_date: string | null;
  source?: ReviewSource;
  review_url?: string | null;
  photo_urls?: string[];
}

interface Props {
  review: PublicReview;
  onClose: () => void;
  // The business profile, for Google reviews that have no link of their own
  // yet. It still lets a visitor see the reviews exist.
  profileUrl: string;
}

const MotionDiv = m.div;

// Noon, not midnight: a bare YYYY-MM-DD parses as UTC midnight, which is the
// previous evening anywhere west of London.
const formatDate = (ymd: string): string => {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

const initialsOf = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

const Stars = ({ rating }: { rating: number }) => {
  const filled = Math.max(0, Math.min(5, Math.round(rating || 0)));
  return (
    <HStack spacing={0.5} role="img" aria-label={`${filled} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Icon key={n} as={FaStar} boxSize={3.5} color={n <= filled ? '#fbbc04' : 'gray.200'} />
      ))}
    </HStack>
  );
};

const StageArrow = ({ direction, onClick }: { direction: 'prev' | 'next'; onClick: () => void }) => (
  <chakra.button
    type="button"
    onClick={onClick}
    aria-label={direction === 'prev' ? 'Previous photo' : 'Next photo'}
    position="absolute"
    top="50%"
    transform="translateY(-50%)"
    {...(direction === 'prev' ? { left: 2 } : { right: 2 })}
    w="40px"
    h="40px"
    borderRadius="full"
    bg="rgba(255, 255, 255, 0.88)"
    color="gray.700"
    boxShadow="0 2px 10px rgba(0, 0, 0, 0.18)"
    display="flex"
    alignItems="center"
    justifyContent="center"
    transition="background 0.2s, color 0.2s"
    _hover={{ bg: 'white', color: 'brand.accentText' }}
    _focusVisible={{ outline: 'none', boxShadow: 'accentFocusThick' }}
    sx={{ WebkitTapHighlightColor: 'transparent' }}
  >
    <Icon as={direction === 'prev' ? ChevronLeftIcon : ChevronRightIcon} boxSize={6} />
  </chakra.button>
);

const ReviewModal = ({ review, onClose, profileUrl }: Props) => {
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const photos = (review.photo_urls ?? []).filter(Boolean);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const site = reviewSite(review.source, review.review_url);
  const name = firstName(review.author_name);
  const avatar = toDirectImageUrl(review.author_photo_url, 240);

  const step = (dir: 1 | -1) => {
    if (photos.length < 2) return;
    setActive((i) => (i + dir + photos.length) % photos.length);
  };

  // The key handler is installed once, so it reads the latest callbacks
  // through refs. Re-installing it on every render would also re-run the
  // focus grab below and lose track of what to return focus to.
  const onCloseRef = useRef(onClose);
  const stepRef = useRef(step);
  onCloseRef.current = onClose;
  stepRef.current = step;

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === 'ArrowRight') {
        stepRef.current(1);
      } else if (e.key === 'ArrowLeft') {
        stepRef.current(-1);
      } else if (e.key === 'Tab') {
        const root = dialogRef.current;
        if (!root) return;
        // The scrolling body is in the cycle too, or a review with no links
        // pins Tab to Close and a long text can't be scrolled by keyboard.
        const items = Array.from(
          root.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const current = document.activeElement;
        if (e.shiftKey && (current === first || current === root)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && current === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      returnTo?.focus?.({ preventScroll: true });
    };
  }, []);

  // Swipe between photos on the stage.
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    if (start == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(dx) < 50) return;
    step(dx > 0 ? -1 : 1);
  };

  const meta = [site ? `${site.name} review` : null, review.publish_date ? formatDate(review.publish_date) : null]
    .filter(Boolean)
    .join(' · ');
  const showProfileFallback = !review.review_url && review.source === 'google';

  return (
    <MotionDiv
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        backgroundColor: 'rgba(10, 8, 5, 0.82)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
      onClick={onClose}
    >
      <MotionDiv
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
        transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: 720 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <Flex
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabIndex={-1}
          direction="column"
          bg="white"
          borderRadius="sm"
          overflow="hidden"
          boxShadow="0 24px 70px rgba(0, 0, 0, 0.55)"
          outline="none"
          // dvh, not vh: on iPhone vh is the height with Safari's bars hidden,
          // so a vh-sized sheet puts its own button behind the toolbar.
          sx={{
            maxHeight: 'calc(100vh - 24px)',
            '@supports (height: 1dvh)': { maxHeight: 'calc(100dvh - 24px)' },
            '@media (min-width: 48em)': {
              maxHeight: '88vh',
              '@supports (height: 1dvh)': { maxHeight: '88dvh' },
            },
          }}
        >
          {/* Header: the rating and where it was posted, and the way out. */}
          <Flex
            flex="none"
            align="center"
            gap={3}
            pl={{ base: 5, md: 7 }}
            pr={{ base: 2, md: 4 }}
            py={2}
            borderBottom="1px solid"
            borderColor="gray.100"
          >
            <HStack spacing={3} flex={1} minW={0} wrap="wrap" rowGap={1}>
              <Stars rating={review.rating} />
              {meta && <Text textStyle="metaCaption">{meta}</Text>}
            </HStack>
            <CTAButton onClick={onClose} icon={FaTimes} variant="ghost" size="sm" aria-label="Close">
              {null}
            </CTAButton>
          </Flex>

          {/* Body: scrolls on its own, so the header and the button stay put. */}
          <Box
            flex="1"
            minH={0}
            overflowY="auto"
            px={{ base: 5, md: 7 }}
            py={{ base: 5, md: 6 }}
            tabIndex={0}
            role="region"
            aria-label="Review"
            outline="none"
            _focusVisible={{ boxShadow: 'inset 0 0 0 2px #c9a96e' }}
            sx={{ overscrollBehavior: 'contain' }}
          >
            <Flex align="center" gap={4}>
              <Flex
                flex="none"
                boxSize={{ base: '64px', md: '72px' }}
                bg="brand.surface"
                border="1px solid"
                borderColor="brand.accentBorder"
                align="center"
                justify="center"
                overflow="hidden"
              >
                {avatar ? (
                  <Image
                    src={avatar}
                    alt=""
                    w="100%"
                    h="100%"
                    objectFit="cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <Text fontFamily="heading" fontWeight="300" fontSize="1.5rem" color="brand.accentText">
                    {initialsOf(review.author_name)}
                  </Text>
                )}
              </Flex>
              <Text as="h2" id={titleId} textStyle="cardTitle" m={0} minW={0}>
                {review.author_name}
              </Text>
            </Flex>

            {/* pre-line keeps the paragraph breaks the client wrote. */}
            <Text textStyle="bodyLead" color="gray.700" mt={5} whiteSpace="pre-line">
              “{review.text}”
            </Text>

            {photos.length > 0 && (
              <Box mt={8}>
                <SectionHead title={photos.length === 1 ? `The photo ${name} shared` : `Photos ${name} shared`} />
                <Box
                  position="relative"
                  h={{ base: '320px', md: '420px' }}
                  bg="brand.surfaceSunken"
                  borderRadius="sm"
                  overflow="hidden"
                  onTouchStart={onTouchStart}
                  onTouchEnd={onTouchEnd}
                >
                  {failed[active] ? (
                    <Flex h="100%" align="center" justify="center" px={6}>
                      <Text textStyle="bodyCopy" color="brand.mutedText" textAlign="center">
                        This photo could not be loaded.
                      </Text>
                    </Flex>
                  ) : (
                    <Image
                      key={photos[active]}
                      src={toDirectImageUrl(photos[active], 1600)}
                      alt={`Photo ${active + 1} of ${photos.length} shared by ${review.author_name}`}
                      w="100%"
                      h="100%"
                      objectFit="contain"
                      referrerPolicy="no-referrer"
                      onError={() => setFailed((f) => ({ ...f, [active]: true }))}
                    />
                  )}
                  {photos.length > 1 && (
                    <>
                      <StageArrow direction="prev" onClick={() => step(-1)} />
                      <StageArrow direction="next" onClick={() => step(1)} />
                      <Text
                        position="absolute"
                        right={3}
                        bottom={3}
                        px={2}
                        py={0.5}
                        bg="rgba(10, 8, 5, 0.6)"
                        color="white"
                        textStyle="metaCaption"
                        borderRadius="sm"
                        sx={{ fontVariantNumeric: 'tabular-nums' }}
                        aria-live="polite"
                      >
                        {active + 1} / {photos.length}
                      </Text>
                    </>
                  )}
                </Box>

                {photos.length > 1 && (
                  <Flex mt={3} gap={2} overflowX="auto" pb={1}>
                    {photos.map((url, i) => (
                      <chakra.button
                        key={`${i}-${url}`}
                        type="button"
                        onClick={() => setActive(i)}
                        aria-label={`Show photo ${i + 1} of ${photos.length}`}
                        aria-current={i === active ? 'true' : undefined}
                        flex="none"
                        w="64px"
                        h="64px"
                        p={0}
                        bg="brand.surfaceSunken"
                        borderRadius="sm"
                        overflow="hidden"
                        border="2px solid"
                        borderColor={i === active ? 'brand.accent' : 'transparent'}
                        opacity={i === active ? 1 : 0.65}
                        transition="opacity 0.2s, border-color 0.2s"
                        _hover={{ opacity: 1 }}
                        _focusVisible={{ outline: 'none', boxShadow: 'accentFocusThick' }}
                        sx={{ WebkitTapHighlightColor: 'transparent' }}
                      >
                        <Image
                          src={toDirectImageUrl(url, 400)}
                          alt=""
                          w="100%"
                          h="100%"
                          objectFit="cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      </chakra.button>
                    ))}
                  </Flex>
                )}
              </Box>
            )}
          </Box>

          {/* Footer: the proof. Pinned, because on a long review a button at
              the end of the text is a button nobody sees. */}
          {(review.review_url || showProfileFallback) && (
            <Flex
              flex="none"
              direction={{ base: 'column', md: 'row' }}
              align={{ base: 'stretch', md: 'center' }}
              gap={{ base: 2, md: 5 }}
              px={{ base: 5, md: 7 }}
              py={4}
              borderTop="1px solid"
              borderColor="brand.accentBorder"
              bg="brand.surface"
            >
              {review.review_url ? (
                <>
                  <CTAButton
                    href={review.review_url}
                    icon={site?.icon ?? FaExternalLinkAlt}
                    variant="outline"
                    size="sm"
                    fullWidth={{ base: true, md: false }}
                  >
                    {verifyLabel(review.source, review.review_url)}
                  </CTAButton>
                  <Text fontSize="sm" color="brand.mutedText" textAlign={{ base: 'center', md: 'left' }}>
                    Opens the review{site ? ` on ${site.name}` : ''}, exactly as {name} posted it.
                  </Text>
                </>
              ) : (
                <CTAButton
                  href={profileUrl}
                  icon={FaGoogle}
                  variant="outline"
                  size="sm"
                  fullWidth={{ base: true, md: false }}
                >
                  See all our Google reviews
                </CTAButton>
              )}
            </Flex>
          )}
        </Flex>
      </MotionDiv>
    </MotionDiv>
  );
};

export default ReviewModal;
