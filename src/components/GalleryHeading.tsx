/**
 * The top of a client's gallery page: the "Private Gallery" eyebrow, the
 * heading, and the "Available until" ribbon.
 *
 * Its own module (2026-10-19) so the admin's "What the client sees" preview
 * renders these same components instead of a copy of them, and so the admin
 * chunk does not pull in the whole gallery to do it.
 */

import { Box, Flex, Icon, Text } from '@chakra-ui/react';
import FaClock from '../icons/fa/FaClock';

/** "Private Gallery", the gold rule, and the heading (galleryHeading()). */
export function GalleryTitle({ heading }: { heading: string }) {
  return (
    <>
      <Text
        fontSize="xs"
        fontWeight="500"
        textTransform="uppercase"
        letterSpacing="0.25em"
        color="brand.accent"
        mb={3}
      >
        Private Gallery
      </Text>
      <Box w="40px" h="1px" bg="brand.accent" mx="auto" mb={5} />
      <Text
        as="h1"
        fontSize={{ base: '2xl', md: '3xl' }}
        fontWeight="200"
        color="gray.800"
        letterSpacing="0.02em"
        mb={2}
        m={0}
      >
        {heading}
      </Text>
    </>
  );
}

/**
 * Format the gallery expiration date. Same UTC-safe idiom used
 * elsewhere in the app (see ClientPortalView.formatDate) so the
 * displayed day matches what Veronika typed regardless of the
 * viewer's timezone.
 */
export function formatGalleryExpiry(iso: string): string {
  const datePart = iso.split('T')[0];
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Ribbon-style banner for the gallery-expiry callout. Renders as a
 * warm gold ribbon with chevron-notched ends so it visually reads as
 * an actual banner (not just a text line). The date is bolded inside
 * the ribbon; a small footnote sits below (contact-Veronika / download-
 * by) so the two feel like one grouped object.
 *
 * Kept as its own component so if we ever want to reuse this ribbon
 * treatment elsewhere (e.g. contract-signed banner) we can just call
 * it, please don't duplicate the clip-path values by hand.
 */
export function ExpiryRibbon({
  expiresAt,
  footnote,
}: {
  expiresAt: string;
  footnote: string;
}) {
  return (
    <Box mt={5} textAlign="center">
      <Flex
        as="span"
        display="inline-flex"
        align="center"
        justify="center"
        gap={2}
        bgGradient="linear(to-r, #f3e6bf, #ecd8a3)"
        color="#5f4a12"
        // Chevron-notched ends. 10px points give a subtle ribbon feel
        // without looking like a Christmas ornament. The extra outer
        // padding compensates for the visual "eating" the notches do.
        px={{ base: 8, md: 12 }}
        py={2}
        fontSize={{ base: 'xs', md: 'sm' }}
        fontWeight="400"
        letterSpacing="0.04em"
        sx={{
          clipPath:
            'polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)',
          WebkitClipPath:
            'polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)',
        }}
      >
        <Icon as={FaClock} boxSize={3} />
        <Box as="span">
          Available until{' '}
          <Text as="span" fontWeight="700">
            {formatGalleryExpiry(expiresAt)}
          </Text>
        </Box>
      </Flex>
      <Text
        mt={1.5}
        fontSize="2xs"
        color="gray.500"
        fontWeight="300"
        lineHeight="1.5"
      >
        {footnote}
      </Text>
    </Box>
  );
}
