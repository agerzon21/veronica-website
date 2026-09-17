import { useEffect, useId, useRef, useState } from 'react';
import { Box, Flex, HStack, Icon, Image, Text, VisuallyHidden, chakra } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { AnimatePresence, m, useIsPresent, useReducedMotion } from 'framer-motion';
import FaChevronLeft from '../icons/fa/FaChevronLeft';
import FaChevronRight from '../icons/fa/FaChevronRight';
import FaExternalLinkAlt from '../icons/fa/FaExternalLinkAlt';
import FaStar from '../icons/fa/FaStar';
import FaTimes from '../icons/fa/FaTimes';
import CTAButton from './ui/CTAButton';
import { SectionHead } from './ContactRail';
import { NavArrow } from './IgPostModal';
import { toDirectImageUrl } from '../utils/driveImage';
import { reviewSite, verifyLabel, type ReviewSource } from '../utils/reviewSource';

/**
 * The full view of the homepage reviews: the whole text, the photos the
 * client attached, and a button to the review where it was posted, so a
 * visitor can check it is real. Arrows (and swipes, and the arrow keys) move
 * through every review, the way the Instagram popup moves through posts.
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
  reviews: PublicReview[];
  index: number;
  onNavigate: (index: number) => void;
  onClose: () => void;
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

/**
 * One review's photos. Its own component, keyed by review, so moving to the
 * next review starts back at that review's first photo.
 */
const ReviewPhotos = ({ review }: { review: PublicReview }) => {
  const photos = (review.photo_urls ?? []).filter(Boolean);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});

  const step = (d: 1 | -1) => {
    if (photos.length < 2) return;
    setActive((i) => (i + d + photos.length) % photos.length);
  };

  // Swipes on the stage change the photo. With more than one photo, touches
  // anywhere in the photo block (the stage, or the thumbnail strip being
  // scrolled sideways) are kept from reaching the popup, where a swipe
  // changes the review. A single photo passes swipes through.
  const pages = photos.length > 1;
  const stop = pages ? (e: React.TouchEvent) => e.stopPropagation() : undefined;
  const touchX = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches.length === 1 ? e.touches[0]?.clientX ?? null : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    if (start == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(dx) < 50) return;
    step(dx > 0 ? -1 : 1);
  };

  if (photos.length === 0) return null;

  return (
    <Box mt={8} onTouchStart={stop} onTouchEnd={stop}>
      {/* Neutral on purpose: the photos may be the ones the client attached
          on Google, or Vero's originals from the same session. */}
      <SectionHead title="From the session" />
      <Box
        position="relative"
        h={{ base: '320px', md: '420px' }}
        bg="brand.surfaceSunken"
        borderRadius="sm"
        overflow="hidden"
        onTouchStart={pages ? onTouchStart : undefined}
        onTouchEnd={pages ? onTouchEnd : undefined}
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
            alt={`Photo ${active + 1} of ${photos.length} from the session with ${review.author_name}`}
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
              data-photo-counter
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
  );
};

const ReviewModal = ({ reviews, index, onNavigate, onClose }: Props) => {
  const reduceMotion = useReducedMotion();
  // False while the popup plays its closing animation; keys are ignored then,
  // or an arrow press would page the list and reopen it.
  const isPresent = useIsPresent();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const count = reviews.length;
  const safeIndex = ((index % count) + count) % count;
  const review = reviews[safeIndex];
  const canPage = count > 1;
  const [dir, setDir] = useState<1 | -1>(1);
  const site = reviewSite(review.source, review.review_url);
  const name = firstName(review.author_name);
  const avatar = toDirectImageUrl(review.author_photo_url, 240);

  const go = (d: 1 | -1) => {
    if (!canPage) return;
    // Focus on something that is about to be swapped out (a photo control,
    // the footer link) would fall to <body>; park it on the text region,
    // which stays.
    const a = document.activeElement;
    if (
      a &&
      a !== bodyRef.current &&
      (bodyRef.current?.contains(a) || footerRef.current?.contains(a))
    ) {
      bodyRef.current?.focus({ preventScroll: true });
    }
    setDir(d);
    onNavigate((safeIndex + d + count) % count);
  };

  // The key handler is installed once, so it reads the latest callbacks
  // through refs. Re-installing it on every render would also re-run the
  // focus grab below and lose track of what to return focus to.
  const onCloseRef = useRef(onClose);
  const goRef = useRef(go);
  const presentRef = useRef(isPresent);
  onCloseRef.current = onClose;
  goRef.current = go;
  presentRef.current = isPresent;

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus({ preventScroll: true });
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (!presentRef.current) return;
      const modified = e.altKey || e.metaKey || e.ctrlKey;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
      } else if (e.key === 'ArrowRight' && !modified) {
        // Modified arrows are left to the browser (Alt+Left is Back).
        e.preventDefault();
        goRef.current(1);
      } else if (e.key === 'ArrowLeft' && !modified) {
        e.preventDefault();
        goRef.current(-1);
      } else if (e.key === 'Tab') {
        const root = dialogRef.current;
        if (!root) return;
        // The scrolling body is in the cycle too, or a review with no links
        // pins Tab to Close and a long text can't be scrolled by keyboard.
        const items = Array.from(
          root.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.getClientRects().length > 0);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const current = document.activeElement;
        // Focus that has fallen out of the dialog (its element was removed)
        // is brought back rather than let the browser continue from there.
        if (!current || current === root || !root.contains(current)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }
        if (e.shiftKey && current === first) {
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

  // Swipe anywhere on the card (the photo stage handles its own) to move
  // between reviews. Horizontal and deliberate only, so scrolling the text
  // never turns the page.
  const touch = useRef<{ x: number; y: number } | null>(null);
  // One finger only: a pinch is not a page turn.
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touch.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    const t = e.changedTouches[0];
    if (!start || !t || e.touches.length > 0) return;
    if (window.visualViewport && window.visualViewport.scale > 1.01) return;
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    go(dx > 0 ? -1 : 1);
  };
  const onTouchCancel = () => {
    touch.current = null;
  };

  const meta = [site ? `${site.name} review` : null, review.publish_date ? formatDate(review.publish_date) : null]
    .filter(Boolean)
    .join(' · ');
  const swap = reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] };

  return (
    <MotionDiv
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
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
        outline: 'none',
      }}
      onClick={onClose}
    >
      {/* The Instagram popup's own arrows, at the screen's edges. Only where
          there is room beside the card (lg and up); smaller screens get the
          pair in the header instead, so nothing sits on top of the text. */}
      {canPage && (
        <Box display={{ base: 'none', lg: 'block' }}>
          <NavArrow direction="prev" onClick={() => go(-1)} label="Previous review" />
          <NavArrow direction="next" onClick={() => go(1)} label="Next review" />
        </Box>
      )}

      <MotionDiv
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24 }}
        transition={{ duration: reduceMotion ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{ width: '100%', maxWidth: 720 }}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        <Flex
          direction="column"
          bg="white"
          borderRadius="sm"
          overflow="hidden"
          boxShadow="0 24px 70px rgba(0, 0, 0, 0.55)"
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
          {/* Header: the rating, where and when it was posted, the way
              through the reviews on smaller screens, and the way out. */}
          <Flex
            flex="none"
            align="center"
            gap={2}
            pl={{ base: 5, md: 7 }}
            pr={{ base: 2, md: 4 }}
            py={2}
            borderBottom="1px solid"
            borderColor="gray.100"
          >
            <HStack spacing={3} flex={1} minW={0} wrap="wrap" rowGap={1}>
              <Stars rating={review.rating} />
              {/* On phones the header also carries the review arrows, so the
                  site and date move under the name instead of wrapping here. */}
              {meta && (
                <Text textStyle="metaCaption" display={{ base: 'none', md: 'block' }}>
                  {meta}
                </Text>
              )}
            </HStack>
            {canPage && (
              <HStack spacing={0} flex="none" display={{ base: 'flex', lg: 'none' }}>
                <CTAButton onClick={() => go(-1)} icon={FaChevronLeft} variant="ghost" size="sm" aria-label="Previous review">
                  {null}
                </CTAButton>
                <Text
                  textStyle="metaCaption"
                  minW="3.2em"
                  textAlign="center"
                  sx={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {safeIndex + 1} / {count}
                </Text>
                <CTAButton onClick={() => go(1)} icon={FaChevronRight} variant="ghost" size="sm" aria-label="Next review">
                  {null}
                </CTAButton>
              </HStack>
            )}
            {canPage && (
              <Text
                display={{ base: 'none', lg: 'block' }}
                textStyle="metaCaption"
                pr={2}
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {safeIndex + 1} / {count}
              </Text>
            )}
            <CTAButton onClick={onClose} icon={FaTimes} variant="ghost" size="sm" aria-label="Close">
              {null}
            </CTAButton>
          </Flex>
          <VisuallyHidden aria-live="polite">
            {canPage ? `Review ${safeIndex + 1} of ${count}, from ${review.author_name}` : ''}
          </VisuallyHidden>

          {/* Body: scrolls on its own, so the header and the button stay put. */}
          <Box
            ref={bodyRef}
            flex="1"
            minH={0}
            overflowY="auto"
            overflowX="hidden"
            px={{ base: 5, md: 7 }}
            py={{ base: 5, md: 6 }}
            tabIndex={0}
            role="region"
            aria-label="Review"
            outline="none"
            _focusVisible={{ boxShadow: 'inset 0 0 0 2px #c9a96e' }}
            sx={{ overscrollBehavior: 'contain' }}
          >
            {/* A new review starts at the top of its text. Reset once the old
                one has faded out, not while it is still on screen. */}
            <AnimatePresence
              mode="wait"
              initial={false}
              custom={dir}
              onExitComplete={() => {
                if (bodyRef.current) bodyRef.current.scrollTop = 0;
              }}
            >
              <MotionDiv
                key={review.id}
                custom={dir}
                variants={{
                  enter: (d: number) => ({ opacity: 0, x: reduceMotion ? 0 : d * 28 }),
                  center: { opacity: 1, x: 0 },
                  exit: (d: number) => ({ opacity: 0, x: reduceMotion ? 0 : d * -28 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={swap}
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
                  <Box minW={0}>
                    <Text as="h2" id={titleId} textStyle="cardTitle" m={0}>
                      {review.author_name}
                    </Text>
                    {meta && (
                      <Text textStyle="metaCaption" mt={1} display={{ base: 'block', md: 'none' }}>
                        {meta}
                      </Text>
                    )}
                  </Box>
                </Flex>

                {/* pre-line keeps the paragraph breaks the client wrote. */}
                <Text textStyle="bodyLead" color="gray.700" mt={5} whiteSpace="pre-line">
                  “{review.text}”
                </Text>

                <ReviewPhotos key={review.id} review={review} />
              </MotionDiv>
            </AnimatePresence>
          </Box>

          {/* Footer: the proof, centred. Only when this review has its own
              link: the button has to open THIS review (Alex, 2026-09-17), so
              a review without one gets no button rather than a generic one.
              Pinned, because on a long review a button at the end of the text
              is a button nobody sees. */}
          {review.review_url && (
            <Flex
              ref={footerRef}
              flex="none"
              direction="column"
              align="center"
              textAlign="center"
              gap={2}
              px={{ base: 5, md: 7 }}
              py={4}
              borderTop="1px solid"
              borderColor="brand.accentBorder"
              bg="brand.surface"
            >
              <CTAButton
                href={review.review_url}
                icon={site?.icon ?? FaExternalLinkAlt}
                variant="outline"
                size="sm"
              >
                {verifyLabel(review.source, review.review_url)}
              </CTAButton>
              <Text fontSize="sm" color="brand.mutedText">
                Opens the review{site ? ` on ${site.name}` : ''}, exactly as {name} posted it.
              </Text>
            </Flex>
          )}
        </Flex>
      </MotionDiv>
    </MotionDiv>
  );
};

export default ReviewModal;
