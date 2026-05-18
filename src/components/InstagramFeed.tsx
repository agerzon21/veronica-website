import { Box, VStack, HStack, Text, Link, Grid, AspectRatio, Image, Icon } from '@chakra-ui/react';
import { FaInstagram } from 'react-icons/fa';
import instagramData from '../data/instagram.json';

// Native grid replacement for the Instagram embed. Cross-origin iframes
// can't be promoted to independent compositor layers on iOS and Instagram's
// own JS inside the frame runs scroll observers we have no control over —
// rendering posts as plain <img> tags eliminates that cost and unlocks
// every framer-motion animation for the section.
//
// Posts are fetched at build time by scripts/fetch-instagram.mjs hitting
// the Instagram Graph API and written to src/data/instagram.json. If the
// fetch hasn't run yet (no env vars locally, or first build before token
// is set) we fall back to a curated set from her existing gallery so the
// section always renders something coherent.

const INSTAGRAM_URL = 'https://www.instagram.com/vero.art.photo';
const INSTAGRAM_HANDLE = 'vero.art.photo';

type Photo = { url: string; alt: string; permalink?: string };

const FALLBACK_PHOTOS: Photo[] = [
  {
    url: '/assets/photos/portraits/sunset-palm-tree-portrait.webp',
    alt: 'Sunset portrait beneath a palm tree',
  },
  {
    url: '/assets/photos/weddings/winged-couple-fantasy-portrait.webp',
    alt: 'Wedding couple with fantasy wings',
  },
  {
    url: '/assets/photos/family/family-white-beach.webp',
    alt: 'Family portrait on a white-sand beach',
  },
  {
    url: '/assets/photos/maternity/pregnant-friends-colorful-dresses.webp',
    alt: 'Maternity portrait of friends in flowing dresses',
  },
  {
    url: '/assets/photos/portraits/lace-pink-dress-blue-glacier.webp',
    alt: 'Lace dress portrait at a blue glacier',
  },
  {
    url: '/assets/photos/weddings/couple-embracing-greenery.webp',
    alt: 'Couple embracing in lush greenery',
  },
];

const livePhotos: Photo[] = (instagramData.posts ?? []).map((p: any) => ({
  url: p.url,
  alt: p.caption ? p.caption.slice(0, 80) : 'Vero Photography on Instagram',
  permalink: p.permalink,
}));

const PHOTOS: Photo[] = livePhotos.length >= 6 ? livePhotos.slice(0, 6) : FALLBACK_PHOTOS;

const InstagramFeed = () => {
  return (
    <Box py={{ base: 14, md: 20 }} px={4} bg="white">
      <VStack spacing={5} mb={{ base: 10, md: 12 }}>
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.3em"
          color="#c9a96e"
        >
          Follow Along
        </Text>
        <Box w="40px" h="1px" bg="#c9a96e" />
      </VStack>

      {/* Instagram-style profile card so the section reads as a real social
          preview, not just a grid. */}
      <HStack
        maxW="640px"
        mx="auto"
        spacing={{ base: 4, md: 6 }}
        mb={{ base: 8, md: 10 }}
        align="center"
        justify="center"
      >
        <Link href={INSTAGRAM_URL} isExternal flexShrink={0}>
          <Box
            width={{ base: '64px', md: '78px' }}
            height={{ base: '64px', md: '78px' }}
            borderRadius="full"
            border="2px solid #c9a96e"
            padding="3px"
            transition="transform 0.3s ease"
            _hover={{ transform: 'scale(1.05)' }}
          >
            <Box
              width="100%"
              height="100%"
              borderRadius="full"
              overflow="hidden"
              bg="white"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <Image
                src="/assets/images/logo.svg"
                alt="Vero Photography logo"
                objectFit="contain"
                width="80%"
                height="80%"
              />
            </Box>
          </Box>
        </Link>

        <VStack align="start" spacing={1} flex={1} minW={0}>
          <Link
            href={INSTAGRAM_URL}
            isExternal
            _hover={{ textDecoration: 'none', color: '#c9a96e' }}
          >
            <HStack spacing={2}>
              <Text
                fontSize={{ base: 'md', md: 'lg' }}
                fontWeight="500"
                color="gray.700"
                transition="color 0.3s"
              >
                {INSTAGRAM_HANDLE}
              </Text>
              <Icon as={FaInstagram} color="#c9a96e" boxSize={{ base: 4, md: 5 }} />
            </HStack>
          </Link>
          <Text
            fontSize={{ base: 'xs', md: 'sm' }}
            fontWeight="300"
            color="gray.500"
            letterSpacing="0.02em"
          >
            Veronika Gerzon · Wedding & Portrait Photographer
          </Text>
        </VStack>
      </HStack>

      <Grid
        maxW="1100px"
        mx="auto"
        templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' }}
        gap={{ base: 2, md: 3 }}
      >
        {PHOTOS.map((photo) => (
          <Link
            key={photo.url}
            href={photo.permalink ?? INSTAGRAM_URL}
            isExternal
            display="block"
            overflow="hidden"
            position="relative"
            sx={{
              '& img': {
                transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
              },
              '&:hover img': {
                transform: 'scale(1.06)',
              },
              '&:hover .ig-overlay': {
                opacity: 1,
              },
            }}
          >
            <AspectRatio ratio={1}>
              <Image src={photo.url} alt={photo.alt} objectFit="cover" loading="lazy" />
            </AspectRatio>
            <Box
              className="ig-overlay"
              position="absolute"
              inset={0}
              bg="rgba(0, 0, 0, 0.35)"
              opacity={0}
              transition="opacity 0.3s ease"
              display={{ base: 'none', md: 'flex' }}
              alignItems="center"
              justifyContent="center"
              pointerEvents="none"
            >
              <Icon as={FaInstagram} color="white" boxSize={8} />
            </Box>
          </Link>
        ))}
      </Grid>

      <VStack mt={{ base: 10, md: 12 }}>
        <Link
          href={INSTAGRAM_URL}
          isExternal
          display="inline-flex"
          alignItems="center"
          gap={2.5}
          fontSize="xs"
          fontWeight="500"
          letterSpacing="0.25em"
          textTransform="uppercase"
          color="gray.700"
          border="1px solid"
          borderColor="#c9a96e"
          px={8}
          py={3}
          transition="all 0.4s ease"
          _hover={{
            bg: '#c9a96e',
            color: 'white',
            textDecoration: 'none',
            transform: 'translateY(-2px)',
          }}
        >
          <Icon as={FaInstagram} boxSize={4} />
          Follow on Instagram
        </Link>
      </VStack>
    </Box>
  );
};

export default InstagramFeed;
