import { useState, useEffect } from 'react';
import { Box, VStack, HStack, Text, Link, Grid, AspectRatio, Image, Icon, Flex } from '@chakra-ui/react';
import { FaInstagram, FaHeart, FaRegComment, FaPlay, FaFilm, FaImages } from 'react-icons/fa';
import instagramData from '../data/instagram.json';
import CTAButton from './ui/CTAButton';
import IgPostModal, { type IgPostForModal } from './IgPostModal';

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
//   3. If the live fetch fails or returns fewer than 9 posts, we keep
//      whatever we had so the section still looks intentional.
//
// Layout:
//   * Desktop: mosaic — 4-column grid, first tile spans 2×2 (the
//     "hero" slot), remaining 8 tiles 1×1. Fills two rows of 4.
//   * Mobile: clean 3×3 grid. Mosaic on mobile would either shrink
//     the hero to unrecognizable or push the small tiles below the
//     fold.
// Each tile shows a hover overlay with likes/comments/caption
// snippet, a corner badge for videos/reels/carousels, and opens a
// lightbox modal (IgPostModal) on click — no more forced navigation
// to Instagram just to read a caption.

const INSTAGRAM_URL = 'https://www.instagram.com/vero.art.photo';

type IgPost = {
  id?: string;
  url: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
  mediaType?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  isReel?: boolean;
  likeCount?: number | null;
  commentsCount?: number | null;
};

type Photo = {
  url: string;
  alt: string;
  permalink?: string;
  caption?: string;
  timestamp?: string;
  mediaType?: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  isReel?: boolean;
  likeCount?: number | null;
  commentsCount?: number | null;
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
  { url: '/assets/photos/family/four-generations-yellow.webp', alt: 'Four generations of a family in warm yellow tones' },
  { url: '/assets/photos/maternity/pregnant-family-three-bw.webp', alt: 'Black and white maternity portrait of a family of three' },
  { url: '/assets/photos/portraits/sisters-cooking-together.webp', alt: 'Sisters cooking together in a warm kitchen' },
];

// Convert raw counts to "1.2K" / "12.3K" / "1.2M" style.
const formatCount = (n: number): string => {
  if (n < 1000) return n.toString();
  if (n < 10000) return (n / 1000).toFixed(1).replace('.0', '') + 'K';
  if (n < 1000000) return Math.round(n / 1000) + 'K';
  return (n / 1000000).toFixed(1).replace('.0', '') + 'M';
};

// "2 hours ago", "3 days ago", "2 weeks ago", "3 months ago". Cuts
// off at "year" because IG posts we surface are always recent.
const formatRelativeTime = (iso: string): string => {
  const now = Date.now();
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  const diffWk = Math.floor(diffDay / 7);
  if (diffWk < 5) return `${diffWk}w ago`;
  const diffMo = Math.floor(diffDay / 30);
  if (diffMo < 12) return `${diffMo}mo ago`;
  const diffYr = Math.floor(diffDay / 365);
  return `${diffYr}y ago`;
};

const toPhotos = (posts: IgPost[]): Photo[] =>
  posts.map((p) => ({
    url: p.url,
    alt: p.caption ? p.caption.slice(0, 80) : 'Vero Photography on Instagram',
    permalink: p.permalink,
    caption: p.caption,
    timestamp: p.timestamp,
    mediaType: p.mediaType,
    isReel: p.isReel,
    likeCount: p.likeCount ?? null,
    commentsCount: p.commentsCount ?? null,
  }));

const InstagramFeed = () => {
  const [data, setData] = useState<IgData>(instagramData as IgData);
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/instagram-feed');
        if (!res.ok) return;
        const live = (await res.json()) as IgData;
        if (cancelled) return;
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
  // Grid is 3×3 on mobile, mosaic (1 big + 8 small) on desktop → we
  // always want 9 tiles. If the API returned fewer, fall back to the
  // curated bundle so the grid never renders half-empty.
  const PHOTOS: Photo[] = livePhotos.length >= 9 ? livePhotos.slice(0, 9) : FALLBACK_PHOTOS;

  const profile = data.profile ?? {};
  const USERNAME: string = profile.username ?? 'vero.art.photo';
  const DISPLAY_NAME: string = profile.name ?? 'Veronika Gerzon';
  const BIO: string = profile.biography ?? 'Wedding & Portrait Photographer';
  const PROFILE_PIC_URL: string | null = profile.profilePictureUrl ?? null;
  const FOLLOWERS_COUNT: number | null = profile.followersCount ?? null;
  const MEDIA_COUNT: number | null = profile.mediaCount ?? null;

  const openPost = PHOTOS[openIdx ?? -1] as Photo | undefined;

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

      {/*
        Mosaic grid:
        - Desktop (md+): 4 columns. First tile spans 2×2 (hero). Rest 1×1.
          Fills two rows of 4 cells with the hero occupying the top-left
          2×2 block. Total: 1 hero + 8 small = 9 tiles across 8 cells,
          because the hero doubles as 4 cells and 8 more small tiles
          take up the remaining 12 cells... wait — 4 cols × 3 rows = 12
          cells, hero takes 4 cells, 8 small take 8 cells, total 12. ✓
        - Mobile: clean 3×3 (all 1×1). Hero styling turns off — visually
          the mosaic doesn't work at narrow widths (hero shrinks too
          much or pushes everything below fold).
      */}
      <Grid
        maxW="1100px"
        mx="auto"
        templateColumns={{ base: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }}
        gap={{ base: 2, md: 3 }}
      >
        {PHOTOS.map((photo, i) => {
          const isHero = i === 0;
          return (
            <Box
              key={photo.permalink ?? photo.url ?? i}
              gridColumn={isHero ? { base: 'auto', md: 'span 2' } : 'auto'}
              gridRow={isHero ? { base: 'auto', md: 'span 2' } : 'auto'}
              position="relative"
              overflow="hidden"
              cursor="pointer"
              role="group"
              onClick={() => setOpenIdx(i)}
              sx={{
                WebkitTapHighlightColor: 'transparent',
                '& img': {
                  transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
                },
                '&:hover img': { transform: 'scale(1.06)' },
                '&:hover .ig-overlay': { opacity: 1 },
              }}
            >
              <AspectRatio ratio={1}>
                <Image src={photo.url} alt={photo.alt} objectFit="cover" loading="lazy" />
              </AspectRatio>

              {/* Corner badge for videos / reels / carousels. Mirrors
                  Instagram's own convention so users immediately
                  recognize the post type. */}
              <MediaTypeBadge photo={photo} />

              {/* Hover overlay — appears on desktop hover, shows engagement +
                  a caption snippet. Mobile users tap-to-open the modal
                  instead of relying on hover states. */}
              <Flex
                className="ig-overlay"
                position="absolute"
                inset={0}
                bg="linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.75) 100%)"
                opacity={0}
                transition="opacity 0.3s ease"
                display={{ base: 'none', md: 'flex' }}
                direction="column"
                justify="flex-end"
                p={isHero ? 5 : 3}
                pointerEvents="none"
              >
                {(photo.likeCount != null || photo.commentsCount != null) && (
                  <HStack
                    spacing={4}
                    color="white"
                    fontSize={isHero ? 'sm' : 'xs'}
                    fontWeight="500"
                    mb={photo.caption ? 2 : 0}
                  >
                    {photo.likeCount != null && (
                      <HStack spacing={1.5}>
                        <Icon as={FaHeart} boxSize={isHero ? 3.5 : 3} />
                        <Text>{formatCount(photo.likeCount)}</Text>
                      </HStack>
                    )}
                    {photo.commentsCount != null && (
                      <HStack spacing={1.5}>
                        <Icon as={FaRegComment} boxSize={isHero ? 3.5 : 3} />
                        <Text>{formatCount(photo.commentsCount)}</Text>
                      </HStack>
                    )}
                  </HStack>
                )}
                {photo.caption && (
                  <Text
                    color="white"
                    fontSize={isHero ? 'sm' : '2xs'}
                    fontWeight="300"
                    lineHeight="1.5"
                    noOfLines={isHero ? 3 : 2}
                  >
                    {photo.caption}
                  </Text>
                )}
                {photo.timestamp && (
                  <Text
                    color="whiteAlpha.700"
                    fontSize="2xs"
                    fontWeight="300"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                    mt={photo.caption ? 2 : 0}
                  >
                    {formatRelativeTime(photo.timestamp)}
                  </Text>
                )}
              </Flex>
            </Box>
          );
        })}
      </Grid>

      <VStack mt={{ base: 10, md: 12 }}>
        <CTAButton href={INSTAGRAM_URL} icon={FaInstagram}>Follow on Instagram</CTAButton>
      </VStack>

      {/* Post lightbox — opens on tile click, shows full caption +
          engagement + "View on Instagram" CTA. Keeps users on the
          site rather than punting them straight to instagram.com on
          every tap. */}
      {openPost && openIdx !== null && (
        <IgPostModal
          post={toModalShape(openPost)}
          onClose={() => setOpenIdx(null)}
          onPrev={openIdx > 0 ? () => setOpenIdx(openIdx - 1) : undefined}
          onNext={openIdx < PHOTOS.length - 1 ? () => setOpenIdx(openIdx + 1) : undefined}
        />
      )}
    </Box>
  );
};

function toModalShape(photo: Photo): IgPostForModal {
  return {
    url: photo.url,
    caption: photo.caption ?? '',
    permalink: photo.permalink,
    timestamp: photo.timestamp,
    mediaType: photo.mediaType,
    isReel: photo.isReel,
    likeCount: photo.likeCount ?? null,
    commentsCount: photo.commentsCount ?? null,
    alt: photo.alt,
  };
}

/**
 * Corner badge that identifies non-image post types. Instagram's own
 * grid uses these exact icons (top-right corner) so viewers who use
 * the app read the semantics automatically. Kept minimal so it
 * doesn't fight with the photo underneath.
 */
function MediaTypeBadge({ photo }: { photo: Photo }) {
  if (photo.isReel) {
    return (
      <Flex
        position="absolute"
        top={2}
        right={2}
        align="center"
        gap={1}
        bg="rgba(0, 0, 0, 0.55)"
        color="white"
        px={1.5}
        py={0.5}
        borderRadius="sm"
        fontSize="2xs"
        fontWeight="500"
        letterSpacing="0.1em"
        pointerEvents="none"
        backdropFilter="blur(4px)"
      >
        <Icon as={FaFilm} boxSize={2.5} />
        <Text as="span">REEL</Text>
      </Flex>
    );
  }
  if (photo.mediaType === 'VIDEO') {
    return (
      <Flex
        position="absolute"
        top={2}
        right={2}
        align="center"
        justify="center"
        w="24px"
        h="24px"
        bg="rgba(0, 0, 0, 0.55)"
        color="white"
        borderRadius="full"
        pointerEvents="none"
        backdropFilter="blur(4px)"
      >
        <Icon as={FaPlay} boxSize={2.5} ml="1px" />
      </Flex>
    );
  }
  if (photo.mediaType === 'CAROUSEL_ALBUM') {
    return (
      <Flex
        position="absolute"
        top={2}
        right={2}
        align="center"
        justify="center"
        w="24px"
        h="24px"
        bg="rgba(0, 0, 0, 0.55)"
        color="white"
        borderRadius="full"
        pointerEvents="none"
        backdropFilter="blur(4px)"
      >
        <Icon as={FaImages} boxSize={2.5} />
      </Flex>
    );
  }
  return null;
}

export type { IgPost, Photo };
export default InstagramFeed;
