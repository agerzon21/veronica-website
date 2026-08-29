import { useEffect, useCallback } from 'react';
import { Box, Flex, Text, Icon, HStack, VStack, Image } from '@chakra-ui/react';
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon } from '@chakra-ui/icons';
import { FaHeart, FaRegComment, FaInstagram, FaFilm, FaImages } from 'react-icons/fa';
import { motion, AnimatePresence } from 'framer-motion';
import CTAButton from './ui/CTAButton';

/**
 * Lightbox modal for Instagram posts. Opens when a user taps a tile
 * in the homepage IG grid — shows the full-size image (or reel
 * thumbnail), the complete caption, engagement stats, timestamp,
 * and a canonical CTAButton to view the actual post on Instagram.
 *
 * Deliberately a NEW component rather than reusing ImageModal:
 * ImageModal is gallery-specific (download flows, favorites, share,
 * origin-rect animation from the clicked thumbnail). IG posts have
 * different affordances (external link, likes/comments) and don't
 * need the gallery machinery. A lean dedicated modal is clearer.
 *
 * Keyboard: Esc closes; ← / → cycle posts when handlers are wired.
 */

export interface IgPostForModal {
  url: string;
  alt: string;
  caption: string;
  permalink?: string;
  timestamp?: string;
  mediaType?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  isReel?: boolean;
  likeCount?: number | null;
  commentsCount?: number | null;
}

interface Props {
  post: IgPostForModal;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

const MotionDiv = motion.div;

const formatCount = (n: number): string => {
  if (n < 1000) return n.toString();
  if (n < 10000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
  if (n < 1000000) return Math.round(n / 1000) + 'K';
  return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
};

const formatFullDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const IgPostModal = ({ post, onClose, onPrev, onNext }: Props) => {
  // Keyboard shortcuts. Attaching once per mount rather than per
  // handler-change so a rapid arrow-key sequence doesn't miss keys
  // in the tiny window between event listener swaps.
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && onPrev) onPrev();
      else if (e.key === 'ArrowRight' && onNext) onNext();
    },
    [onClose, onPrev, onNext],
  );
  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    // Prevent body scroll while the modal is open — same idiom
    // ImageModal uses.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [handleKey]);

  const badge = post.isReel
    ? { icon: FaFilm, label: 'Reel' }
    : post.mediaType === 'VIDEO'
      ? { icon: FaFilm, label: 'Video' }
      : post.mediaType === 'CAROUSEL_ALBUM'
        ? { icon: FaImages, label: 'Carousel' }
        : null;

  return (
    <AnimatePresence>
      <MotionDiv
        key="ig-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.88)',
          zIndex: 2000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
        onClick={onClose}
      >
        {/* Close button — top-right of viewport */}
        <Box
          as="button"
          type="button"
          onClick={onClose}
          position="absolute"
          top={{ base: 4, md: 6 }}
          right={{ base: 4, md: 6 }}
          w="36px"
          h="36px"
          borderRadius="full"
          bg="rgba(255, 255, 255, 0.1)"
          color="whiteAlpha.900"
          display="flex"
          alignItems="center"
          justifyContent="center"
          transition="all 0.2s"
          _hover={{ bg: 'rgba(255, 255, 255, 0.2)', color: 'white' }}
          zIndex={2}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
          aria-label="Close"
        >
          <CloseIcon boxSize={3} />
        </Box>

        {/* Prev / Next chevrons — only rendered if the caller wired them */}
        {onPrev && (
          <NavArrow direction="prev" onClick={onPrev} />
        )}
        {onNext && (
          <NavArrow direction="next" onClick={onNext} />
        )}

        {/* Modal card — click stops propagation so tapping inside
            doesn't close */}
        <MotionDiv
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          style={{ maxWidth: 960, width: '100%', maxHeight: '90vh' }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          <Flex
            direction={{ base: 'column', md: 'row' }}
            bg="white"
            borderRadius="sm"
            overflow="hidden"
            maxH={{ base: '90vh', md: '85vh' }}
            boxShadow="0 20px 60px rgba(0, 0, 0, 0.6)"
          >
            {/* Image column — full aspect on desktop, capped height on mobile */}
            <Box
              position="relative"
              bg="black"
              flexShrink={0}
              w={{ base: '100%', md: '60%' }}
              maxH={{ base: '55vh', md: '85vh' }}
            >
              <Image
                src={post.url}
                alt={post.alt}
                w="100%"
                h="100%"
                maxH="inherit"
                objectFit="contain"
              />
              {badge && (
                <Flex
                  position="absolute"
                  top={3}
                  left={3}
                  align="center"
                  gap={1.5}
                  bg="rgba(0, 0, 0, 0.65)"
                  color="white"
                  px={2}
                  py={1}
                  borderRadius="sm"
                  fontSize="2xs"
                  fontWeight="500"
                  letterSpacing="0.15em"
                  textTransform="uppercase"
                  backdropFilter="blur(6px)"
                >
                  <Icon as={badge.icon} boxSize={2.5} />
                  <Text as="span">{badge.label}</Text>
                </Flex>
              )}
            </Box>

            {/* Meta column — caption, engagement, CTA */}
            <VStack
              flex={1}
              minW={0}
              p={{ base: 5, md: 6 }}
              align="stretch"
              spacing={4}
              overflowY="auto"
            >
              {/* Header: mini profile identity — matches the tone of
                  the widget below on the homepage so the modal reads
                  as part of the same visual language. */}
              <HStack spacing={2} pb={2} borderBottom="1px solid" borderColor="gray.100">
                <Icon as={FaInstagram} color="brand.accent" boxSize={4} />
                <Text
                  fontSize="xs"
                  fontWeight="500"
                  letterSpacing="0.18em"
                  textTransform="uppercase"
                  color="brand.accent"
                >
                  @vero.art.photo
                </Text>
              </HStack>

              {/* Engagement stats */}
              {(post.likeCount != null || post.commentsCount != null) && (
                <HStack spacing={5} color="gray.700">
                  {post.likeCount != null && (
                    <HStack spacing={2}>
                      <Icon as={FaHeart} boxSize={3.5} color="#ff4c68" />
                      <Text fontSize="sm" fontWeight="500">
                        {formatCount(post.likeCount)}
                      </Text>
                    </HStack>
                  )}
                  {post.commentsCount != null && (
                    <HStack spacing={2}>
                      <Icon as={FaRegComment} boxSize={3.5} color="gray.500" />
                      <Text fontSize="sm" fontWeight="500">
                        {formatCount(post.commentsCount)}
                      </Text>
                    </HStack>
                  )}
                </HStack>
              )}

              {/* Caption — full text, scrollable if long */}
              {post.caption && (
                <Text
                  fontSize={{ base: 'sm', md: 'sm' }}
                  color="gray.700"
                  lineHeight="1.7"
                  fontWeight="300"
                  whiteSpace="pre-wrap"
                >
                  {post.caption}
                </Text>
              )}

              {/* Timestamp footer */}
              {post.timestamp && (
                <Text
                  fontSize="2xs"
                  color="gray.500"
                  fontWeight="300"
                  letterSpacing="0.12em"
                  textTransform="uppercase"
                >
                  {formatFullDate(post.timestamp)}
                </Text>
              )}

              {/* CTA at the bottom — canonical CTAButton so it matches
                  every other button on the site */}
              {post.permalink && (
                <Box pt={2} mt="auto">
                  <CTAButton
                    href={post.permalink}
                    newTab
                    icon={FaInstagram}
                    variant="outline"
                    size="sm"
                  >
                    View on Instagram
                  </CTAButton>
                </Box>
              )}
            </VStack>
          </Flex>
        </MotionDiv>
      </MotionDiv>
    </AnimatePresence>
  );
};

function NavArrow({ direction, onClick }: { direction: 'prev' | 'next'; onClick: () => void }) {
  return (
    <Box
      as="button"
      type="button"
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation();
        onClick();
      }}
      position="absolute"
      top="50%"
      transform="translateY(-50%)"
      {...(direction === 'prev' ? { left: { base: 2, md: 6 } } : { right: { base: 2, md: 6 } })}
      w={{ base: '40px', md: '48px' }}
      h={{ base: '40px', md: '48px' }}
      borderRadius="full"
      bg="rgba(255, 255, 255, 0.1)"
      color="whiteAlpha.900"
      display={{ base: 'none', md: 'flex' }}
      alignItems="center"
      justifyContent="center"
      transition="all 0.2s"
      _hover={{ bg: 'rgba(255, 255, 255, 0.2)', color: 'white' }}
      zIndex={2}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
      aria-label={direction === 'prev' ? 'Previous post' : 'Next post'}
    >
      <Icon as={direction === 'prev' ? ChevronLeftIcon : ChevronRightIcon} boxSize={6} />
    </Box>
  );
}

export default IgPostModal;
