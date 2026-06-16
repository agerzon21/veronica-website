import { useState, useEffect } from 'react';
import { Box, VStack, HStack, Text, Link, Grid, AspectRatio, Image, Icon } from '@chakra-ui/react';
import { FaInstagram } from 'react-icons/fa';
import instagramData from '../data/instagram.json';
import CTAButton from './ui/CTAButton';

// Native grid replacement for the Instagram embed. Cross-origin iframes
// can't be promoted to independent compositor layers on iOS Safari and
// Instagram's own JS inside them runs scroll observers we have no control
// over — rendering posts as plain <img> tags eliminates the scroll cost
// and unlocks every framer-motion animation for the section.
//
// Data flow:
//   1. First paint uses the bundled instagram.json — instant, no network.
//      In production this typically has working URLs from the build's
//      Graph API fetch; in dev it's an empty stub.
//   2. On mount we fetch /api/instagram-feed for FRESH urls. Instagram's
//      CDN signs media URLs with a short-lived expiry, so the bundled
//      version goes stale within hours of deploy. The live fetch
//      guarantees the tiles are never showing expired (403) urls.
//   3. If the live fetch fails or returns fewer than 6 posts, we keep
//      whatever we had so the section still looks intentional.

const INSTAGRAM_URL = 'https://www.instagram.com/vero.art.photo';

type Photo = { url: string; alt: string; permalink?: string };

type IgPost = {
  id?: string;
  url: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
};

type IgProfile = {
  username?: string | null;
  name?: string | null;
  biography?: string | null;
  profilePictureUrl?: string | null;
  followersCount?: number | null;
  mediaCount?: number | null;
};

type IgData = {
  profile?: IgProfile;
  posts?: IgPost[];
};

const FALLBACK_PHOTOS: Photo[] = [
  { url: '/assets/photos/portraits/sunset-palm-tree-portrait.webp', alt: 'Sunset portrait beneath a palm tree' },
  { url: '/assets/photos/weddings/winged-couple-fantasy-portrait.webp', alt: 'Wedding couple with fantasy wings' },
  { url: '/assets/photos/family/family-white-beach.webp', alt: 'Family portrait on a white-sand beach' },
  { url: '/assets/photos/maternity/pregnant-friends-colorful-dresses.webp', alt: 'Maternity portrait of friends in flowing dresses' },
  { url: '/assets/photos/portraits/lace-pink-dress-blue-glacier.webp', alt: 'Lace dress portrait at a blue glacier' },
  { url: '/assets/photos/weddings/couple-embracing-greenery.webp', alt: 'Couple embracing in lush greenery' },
];

// Convert raw counts to "1.2K" / "12.3K" / "1.2M" style.
const formatCount = (n: number): string => {
  if (n < 1000) return n.toString();
  if (n < 10000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
  if (n < 1000000) return Math.round(n / 1000) + 'K';
  return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
};

const toPhotos = (posts: IgPost[]): Photo[] =>
  posts.map((p) => ({
    url: p.url,
    alt: p.caption ? p.caption.slice(0, 80) : 'Vero Photography on Instagram',
    permalink: p.permalink,
  }));

const InstagramFeed = () => {
  const [data, setData] = useState<IgData>(instagramData as IgData);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/instagram-feed');
        if (!res.ok) return;
        const live = (await res.json()) as IgData;
        if (cancelled) return;
        // Only swap if we got a usable response — guard against an
        // unexpected shape silently nuking the working initial render.
        if (live && Array.isArray(live.posts) && live.posts.length > 0) {
          setData(live);
        }
      } catch {
        // Network error / endpoint missing — keep the bundled fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const livePhotos = toPhotos(data.posts ?? []);
  const PHOTOS: Photo[] = livePhotos.length >= 6 ? livePhotos.slice(0, 6) : FALLBACK_PHOTOS;

  const profile = data.profile ?? {};
  const USERNAME: string = profile.username ?? 'vero.art.photo';
  const DISPLAY_NAME: string = profile.name ?? 'Veronika Gerzon';
  const BIO: string = profile.biography ?? 'Wedding & Portrait Photographer';
  const PROFILE_PIC_URL: string | null = profile.profilePictureUrl ?? null;
  const FOLLOWERS_COUNT: number | null = profile.followersCount ?? null;
  const MEDIA_COUNT: number | null = profile.mediaCount ?? null;

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

      {/* Instagram-style profile card. Avatar is the real IG profile pic
          when available (falls back to the site logo). Followers + posts
          counts come from the Graph API. */}
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
            width={{ base: '72px', md: '88px' }}
            height={{ base: '72px', md: '88px' }}
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
              {PROFILE_PIC_URL ? (
                <Image
                  src={PROFILE_PIC_URL}
                  alt={`${USERNAME} profile picture`}
                  objectFit="cover"
                  width="100%"
                  height="100%"
                />
              ) : (
                <Image
                  src="/assets/images/logo.svg"
                  alt="Vero Photography logo"
                  objectFit="contain"
                  width="80%"
                  height="80%"
                />
              )}
            </Box>
          </Box>
        </Link>

        <VStack align="start" spacing={1.5} flex={1} minW={0}>
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
                {USERNAME}
              </Text>
              <Icon as={FaInstagram} color="#c9a96e" boxSize={{ base: 4, md: 5 }} />
            </HStack>
          </Link>

          {/* Counts row — only renders if we have live data, so the
              fallback profile card stays clean. */}
          {(FOLLOWERS_COUNT != null || MEDIA_COUNT != null) && (
            <HStack
              spacing={{ base: 3, md: 4 }}
              fontSize={{ base: 'xs', md: 'sm' }}
              color="gray.600"
              fontWeight="400"
            >
              {MEDIA_COUNT != null && (
                <Text>
                  <Text as="span" fontWeight="600" color="gray.800">
                    {formatCount(MEDIA_COUNT)}
                  </Text>{' '}
                  posts
                </Text>
              )}
              {FOLLOWERS_COUNT != null && (
                <Text>
                  <Text as="span" fontWeight="600" color="gray.800">
                    {formatCount(FOLLOWERS_COUNT)}
                  </Text>{' '}
                  followers
                </Text>
              )}
            </HStack>
          )}

          <Text
            fontSize={{ base: 'xs', md: 'sm' }}
            fontWeight="300"
            color="gray.500"
            letterSpacing="0.02em"
            noOfLines={2}
          >
            {DISPLAY_NAME !== USERNAME ? `${DISPLAY_NAME} · ` : ''}
            {BIO}
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
        <CTAButton href={INSTAGRAM_URL} icon={FaInstagram}>Follow on Instagram</CTAButton>
      </VStack>
    </Box>
  );
};

export default InstagramFeed;
