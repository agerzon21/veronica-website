import {
  Box, VStack, HStack, Text, Icon, Flex, Spinner, Image, Collapse, SimpleGrid,
} from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import PageHeader from '../components/ui/PageHeader';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { FaBookOpen, FaChevronDown, FaChevronUp, FaArrowRight } from 'react-icons/fa';
import CTAButton from '../components/ui/CTAButton';
import JournalPost from './JournalPost';

/**
 * Journal — Vero's periodic long-form recaps of recent photoshoots
 * (5–15 photos + narrative). Two routes share this component:
 *
 *   /journal          → the timeline index (this file's default)
 *   /journal/:slug    → the individual post (delegates to JournalPost)
 *
 * The timeline is a vertical center-rail on desktop with year markers
 * and cards alternating left/right off the rail — feels editorial and
 * distinctive, matches the site's understated gold-on-white palette.
 * On mobile it collapses to a single-column left-rail so the cards
 * get the full width instead of trying to squeeze into a half.
 *
 * Clicking a card inline-expands to reveal the excerpt + a
 * "Read full post →" link that navigates to /journal/:slug.
 */

interface PreviewPhoto {
  url: string;
  fullUrl: string;
  alt: string;
}

interface PostSummary {
  slug: string;
  title: string;
  excerpt: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  // Up to 5 photos from the Drive folder. First one is also the
  // cover (repeated in cover_image_url as a convenience so the
  // small header thumb doesn't have to reach into the array).
  photos: PreviewPhoto[];
  session_type: string | null;
  tags: string[];
  published_at: string;
}

const Journal = () => {
  const { slug } = useParams<{ slug?: string }>();

  // Single component, two behaviors. When a slug is in the URL, defer
  // entirely to JournalPost — it fetches its own data + owns its SEO.
  if (slug) {
    return <JournalPost slug={slug} />;
  }
  return <JournalIndex />;
};

function JournalIndex() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/journal/list');
        const data = await res.json();
        if (res.ok && data.success) {
          setPosts(data.posts);
        } else {
          setError(data.error || 'Could not load posts.');
        }
      } catch {
        setError('Could not reach the server.');
      }
    })();
  }, []);

  const grouped = groupByYear(posts ?? []);

  return (
    <>
      <Helmet>
        <title>Journal | Vero Photography</title>
        <meta
          name="description"
          content="Long-form recaps from behind the lens — recent portrait, wedding, family, and maternity sessions with the stories, favorite frames, and small moments that made them."
        />
        <meta property="og:title" content="Journal | Vero Photography" />
        <meta property="og:description" content="Long-form recaps from behind the lens." />
        <meta property="og:type" content="website" />
      </Helmet>

      <Box bg="white" minH="100vh" pt={{ base: 20, md: 28 }} pb={{ base: 20, md: 24 }} px={4}>
        {/* Page header */}
        <Box maxW="46ch" mx="auto" mb={{ base: 10, md: 14 }}>
          <PageHeader
            eyebrow="Journal"
            title="Behind the lens"
            lead="Stories from recent sessions, and the occasional thought about photographing people."
          />
        </Box>

        {/* Timeline body */}
        <Box maxW="1000px" mx="auto">
          {error ? (
            <ErrorState message={error} />
          ) : posts === null ? (
            <Flex justify="center" py={16}>
              <Spinner color="brand.accent" />
            </Flex>
          ) : posts.length === 0 ? (
            <EmptyState />
          ) : (
            <Timeline grouped={grouped} />
          )}
        </Box>
      </Box>
    </>
  );
}

/**
 * The vertical center-rail timeline. Desktop: rail down the middle
 * with cards alternating left/right. Mobile: rail on the left with
 * everything to the right (single column).
 */
function Timeline({ grouped }: { grouped: Array<[number, PostSummary[]]> }) {
  // Rail lives at 12px from the container's left edge on mobile and
  // dead-center on desktop. Children (dots, year markers, cards) all
  // position against this same origin — so no `pl` on the container,
  // otherwise absolute-positioned children inside child Flexes end up
  // shifted right by that padding and drift off the rail.
  return (
    <Box position="relative">
      {/* The rail itself. Absolutely positioned so cards can flow past
          it without disturbing layout. */}
      <Box
        position="absolute"
        top={0}
        bottom={0}
        left="12px"
        w="1px"
        bg="rgba(201, 169, 110, 0.35)"
        transform="none"
        zIndex={0}
      />

      {grouped.map(([year, yearPosts]) => (
        <Box key={year} position="relative" pt={{ base: 8, md: 12 }} pb={2}>
          <YearMarker year={year} />
          <VStack spacing={{ base: 6, md: 8 }} align="stretch">
            {yearPosts.map((post) => (
              <TimelineEntry key={post.slug} post={post} />
            ))}
          </VStack>
        </Box>
      ))}
    </Box>
  );
}

function YearMarker({ year }: { year: number }) {
  // On mobile the badge sits centered ON the rail (at x=12px) so the
  // rail visually threads through it. Absolute positioning + a -50%
  // translate keeps the badge center pinned to the rail even as the
  // badge width changes with year length ("2026" vs "2025", etc.).
  // Desktop keeps the older flex-center behavior — the rail is at
  // 50% and the badge naturally centers over it.
  return (
    <Flex
      position="relative"
      justify={{ base: 'flex-start', md: 'center' }}
      mb={{ base: 6, md: 8 }}
      align="center"
      zIndex={1}
      minH="28px"
    >
      <Box
        bg="white"
        border="1px solid"
        borderColor="rgba(201, 169, 110, 0.5)"
        px={{ base: 3, md: 5 }}
        py={{ base: 1, md: 1.5 }}
        borderRadius="full"
        position={{ base: 'absolute', md: 'static' }}
        left={{ base: '12px', md: 'auto' }}
        transform={{ base: 'translateX(-50%)', md: 'none' }}
      >
        <Text
          fontSize={{ base: 'xs', md: 'sm' }}
          fontWeight="500"
          letterSpacing="0.2em"
          color="brand.accentText"
        >
          {year}
        </Text>
      </Box>
    </Flex>
  );
}

/**
 * A single post on the rail.
 *
 * This used to be a CENTRE-rail timeline with entries alternating left and
 * right at w="50%". That is the right shape for a company history or a CV —
 * many short entries, where the alternation carries the eye. For six
 * photograph-led posts it meant half the page was blank on every row, by
 * construction, which is why the journal read as empty no matter how much the
 * spacing was tuned.
 *
 * The rail now runs down the left on every breakpoint and each entry takes the
 * full column, so the covers get roughly twice the width they had. The rail,
 * the dots and the year markers stay — that was the characterful part; the
 * alternation was the part costing half the canvas.
 */
function TimelineEntry({ post }: { post: PostSummary }) {
  const [expanded, setExpanded] = useState(false);
  const dateLabel = formatDate(post.published_at);

  return (
    <Flex position="relative" align="stretch" zIndex={1}>
      {/* Dot on the rail — anchors the entry visually */}
      <Box
        position="absolute"
        top={{ base: '18px', md: '24px' }}
        left="12px"
        transform="translateX(-50%)"
        w="9px"
        h="9px"
        borderRadius="full"
        bg="brand.accent"
        border="2px solid white"
        boxShadow="0 0 0 1px rgba(201, 169, 110, 0.4)"
        zIndex={2}
      />

      {/* The card itself. Mobile pl clears the rail (at 12px) with a
          comfortable gap; desktop pl/pr pushes the card away from the
          center rail on the appropriate side. */}
      <Box w="100%" pl={{ base: '40px', md: '56px' }}>
        <TimelineCard
          post={post}
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          // On mobile the date lives inside the card since the opposite
          // side is off-screen.
          showInlineDate={dateLabel}
        />
      </Box>
    </Flex>
  );
}

function TimelineCard({
  post,
  expanded,
  onToggle,
  showInlineDate,
}: {
  post: PostSummary;
  expanded: boolean;
  onToggle: () => void;
  showInlineDate: string;
}) {
  return (
    <Box
      bg="white"
      border="1px solid"
      borderColor={expanded ? 'rgba(201, 169, 110, 0.5)' : 'gray.200'}
      borderRadius="sm"
      overflow="hidden"
      transition="all 0.25s ease"
      _hover={{ borderColor: 'rgba(201, 169, 110, 0.7)', transform: 'translateY(-1px)' }}
      boxShadow={expanded ? '0 4px 20px -8px rgba(201, 169, 110, 0.3)' : '0 1px 3px rgba(0,0,0,0.03)'}
    >
      {/* Clickable summary strip — cover thumb + title + date + chevron */}
      <Flex
        as="button"
        type="button"
        onClick={onToggle}
        w="100%"
        align="stretch"
        textAlign="left"
        bg="transparent"
        border="none"
        p={0}
        cursor="pointer"
        _hover={{ bg: 'rgba(201, 169, 110, 0.04)' }}
        sx={{ WebkitTapHighlightColor: 'transparent' }}
      >
        {/* Cover thumbnail — square, left side */}
        {post.cover_image_url ? (
          <Box
            w={{ base: '128px', md: '38%' }}
            flexShrink={0}
            bg="gray.100"
            overflow="hidden"
            sx={{ aspectRatio: '4 / 3' }}
          >
            <Image
              src={post.cover_image_url}
              alt={post.cover_image_alt ?? post.title}
              w="100%"
              h="100%"
              objectFit="cover"
              loading="lazy"
            />
          </Box>
        ) : (
          <Flex
            w={{ base: '128px', md: '38%' }}
            flexShrink={0}
            bg="brand.surface"
            align="center"
            justify="center"
            sx={{ aspectRatio: '4 / 3' }}
            color="brand.accentText"
          >
            <Icon as={FaBookOpen} boxSize={5} />
          </Flex>
        )}

        {/* Title + meta */}
        <VStack
          flex={1}
          align="flex-start"
          spacing={1.5}
          p={{ base: 3, md: 4 }}
          justify="center"
          minW={0}
        >
          <Text textStyle="metaCaption">{showInlineDate}</Text>
          <Text
            as="h2"
            textStyle="cardTitle"
            m={0}
            noOfLines={2}
          >
            {post.title}
          </Text>
          {post.session_type && (
            <Text
              fontSize="2xs"
              fontWeight="500"
              letterSpacing="0.14em"
              textTransform="uppercase"
              color="brand.accentText"
            >
              {post.session_type}
            </Text>
          )}
        </VStack>

        {/* Chevron */}
        <Flex
          w={{ base: '36px', md: '44px' }}
          flexShrink={0}
          align="center"
          justify="center"
          color={expanded ? 'brand.accent' : 'gray.400'}
        >
          <Icon as={expanded ? FaChevronUp : FaChevronDown} boxSize={3} />
        </Flex>
      </Flex>

      {/* Expanded body — excerpt + preview photo grid + tags + read link.
          Preview shows up to 4 photos (skipping index 0 which is already
          the header thumb) so people get a taste without clicking through. */}
      <Collapse in={expanded} animateOpacity>
        <Box
          borderTop="1px solid"
          borderColor="gray.100"
          bg="brand.surface"
          px={{ base: 4, md: 5 }}
          py={{ base: 4, md: 5 }}
        >
          {post.excerpt && (
            <Text
              fontSize={{ base: 'sm', md: 'md' }}
              color="gray.700"
              fontWeight="300"
              lineHeight="1.8"
              mb={4}
            >
              {post.excerpt}
            </Text>
          )}

          {post.photos.length > 1 && (
            <SimpleGrid
              columns={{ base: 2, sm: 3, md: 4 }}
              spacing={{ base: 2, md: 2.5 }}
              mb={4}
            >
              {post.photos.slice(1, 5).map((photo, i) => (
                <RouterLink key={i} to={`/journal/${post.slug}`}>
                  <Box
                    aspectRatio={1}
                    bg="gray.100"
                    overflow="hidden"
                    borderRadius="sm"
                    position="relative"
                    sx={{
                      '& > img': { transition: 'transform 0.4s ease' },
                    }}
                    _hover={{ '& > img': { transform: 'scale(1.05)' } }}
                  >
                    <Image
                      src={photo.url}
                      alt={photo.alt}
                      w="100%"
                      h="100%"
                      objectFit="cover"
                      loading="lazy"
                    />
                  </Box>
                </RouterLink>
              ))}
            </SimpleGrid>
          )}

          {post.tags.length > 0 && (
            <HStack spacing={2} wrap="wrap" mb={4}>
              {post.tags.slice(0, 6).map((tag) => (
                <Text
                  key={tag}
                  fontSize="2xs"
                  fontWeight="500"
                  letterSpacing="0.08em"
                  textTransform="lowercase"
                  color="brand.accentText"
                  bg="white"
                  border="1px solid"
                  borderColor="rgba(201, 169, 110, 0.35)"
                  px={2}
                  py={0.5}
                  borderRadius="sm"
                >
                  {tag}
                </Text>
              ))}
            </HStack>
          )}

          <RouterLink to={`/journal/${post.slug}`}>
            <Box
              as="span"
              display="inline-flex"
              alignItems="center"
              gap={2}
              fontSize="xs"
              fontWeight="500"
              letterSpacing="0.14em"
              textTransform="uppercase"
              color="brand.accent"
              _hover={{ color: 'brand.accentText' }}
              transition="color 0.15s"
            >
              See the full post
              <Icon as={FaArrowRight} boxSize={2.5} />
            </Box>
          </RouterLink>
        </Box>
      </Collapse>
    </Box>
  );
}

function EmptyState() {
  return (
    <Box
      bg="white"
      border="1px dashed"
      borderColor="gray.300"
      borderRadius="sm"
      py={16}
      px={6}
      textAlign="center"
      maxW="500px"
      mx="auto"
    >
      <Flex
        w="72px"
        h="72px"
        mx="auto"
        borderRadius="full"
        bg="brand.surface"
        border="1px solid"
        borderColor="brand.accentBorder"
        align="center"
        justify="center"
        color="brand.accentText"
        mb={5}
      >
        <Icon as={FaBookOpen} boxSize={7} />
      </Flex>
      <Text as="h2" fontSize="md" fontWeight="500" color="gray.800" mb={2}>
        The journal is on its way
      </Text>
      <Text fontSize="sm" color="gray.500" fontWeight="300" maxW="380px" mx="auto" lineHeight="1.7">
        Vero is preparing the first recaps. Check back soon, or browse
        the gallery in the meantime.
      </Text>
      <Box pt={5}>
        <CTAButton to="/gallery" variant="outline" size="sm">
          Browse the Gallery
        </CTAButton>
      </Box>
    </Box>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Box maxW="500px" mx="auto" py={12} textAlign="center">
      <Text color="red.500" fontSize="sm">{message}</Text>
    </Box>
  );
}

// ── helpers ────────────────────────────────────────────────

/**
 * Group posts by year, preserving newest-first order within each
 * year (posts come in sorted DESC from the endpoint).
 */
function groupByYear(posts: PostSummary[]): Array<[number, PostSummary[]]> {
  const map = new Map<number, PostSummary[]>();
  for (const p of posts) {
    const year = new Date(p.published_at).getFullYear();
    if (!Number.isFinite(year)) continue;
    if (!map.has(year)) map.set(year, []);
    map.get(year)!.push(p);
  }
  // Years descending — newest year first.
  return [...map.entries()].sort((a, b) => b[0] - a[0]);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default Journal;
