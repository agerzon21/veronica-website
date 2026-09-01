import {
  Box, VStack, Text, Icon, Flex, Spinner, Image, Grid,
} from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import PageHeader from '../components/ui/PageHeader';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { FaBookOpen } from 'react-icons/fa';
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
        left="22px"
        w="1px"
        bg="rgba(201, 169, 110, 0.35)"
        transform="none"
        zIndex={0}
      />

      {grouped.map(([year, yearPosts]) => (
        <Box key={year} position="relative" pt={{ base: 8, md: 12 }} pb={2}>
          <YearMarker year={year} />
          <VStack spacing={0} align="stretch">
            {yearPosts.map((post, i) => (
              <Box key={post.slug}>
                {/* A hairline between entries, never above the first. It sits
                    inside the content column (pl matches the card) so the rail
                    stays the only thing crossing the left gutter. */}
                {i > 0 && (
                  <Box
                    pl={{ base: '52px', md: '76px' }}
                    my={{ base: 7, md: 10 }}
                  >
                    <Box h="1px" bg="brand.accentBorder" />
                  </Box>
                )}
                <TimelineEntry post={post} />
              </Box>
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
        left={{ base: '22px', md: 'auto' }}
        transform={{ base: 'translateX(-50%)', md: 'none' }}
      >
        <Text textStyle="eyebrow">{year}</Text>
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
  return (
    <Flex position="relative" align="stretch" zIndex={1}>
      {/* A dated marker on the rail, not a 9px dot.
          The dot said "something happened here"; it did not say WHEN, so the
          rail read as decoration rather than a timeline. The day sits in the
          disc and the month above it — the two together are what make the
          spine legible as chronology while scrolling. */}
      <Flex
        position="absolute"
        top={0}
        left="22px"
        transform="translateX(-50%)"
        direction="column"
        align="center"
        zIndex={2}
      >
        <Text
          textStyle="metaCaption"
          color="brand.accentText"
          fontSize="0.5625rem"
          letterSpacing="0.1em"
          mr="-0.1em"
          mb={1}
          bg="white"
          px={1}
        >
          {monthOf(post.published_at)}
        </Text>
        <Flex
          w={{ base: '34px', md: '38px' }}
          h={{ base: '34px', md: '38px' }}
          borderRadius="full"
          bg="white"
          border="1px solid"
          borderColor="brand.accent"
          align="center"
          justify="center"
        >
          <Text
            fontFamily="heading"
            fontSize={{ base: '1rem', md: '1.125rem' }}
            fontWeight="400"
            lineHeight={1}
            color="brand.accentText"
          >
            {dayOf(post.published_at)}
          </Text>
        </Flex>
      </Flex>

      {/* pl clears the 44px marker with a gutter. */}
      <Box w="100%" pl={{ base: '52px', md: '76px' }}>
        <TimelineCard post={post} />
      </Box>
    </Flex>
  );
}
/**
 * One post: a dense cluster of its photographs, then the words.
 *
 * This replaced an accordion. Each post ships FIVE photos in the list payload
 * and the card showed one — the other four sat behind a chevron, so a page
 * about photography displayed six photographs and a lot of cream.
 *
 * The reference site Alex keeps pointing at (jovanarikalo.com) is dense:
 * "minimal spacing between grid items, creating a dense, compact
 * presentation". That is the thing his does that ours did not. Six posts now
 * put thirty photographs on the page at a 2px gutter, which reads as one
 * composed block per post rather than a row of cards floating in space.
 *
 * The accordion is gone entirely. It existed to preview without navigating,
 * but the cluster IS the preview, and the whole block is one link to the post.
 */
function TimelineCard({ post }: { post: PostSummary }) {
  const photos = post.photos ?? [];
  const lead = photos[0];
  // Up to four supporting frames. Fewer is fine — the grid just gets shorter,
  // and a post with a single photo still reads correctly as one image.
  const rest = photos.slice(1, 5);

  return (
    <Box
      as={RouterLink}
      to={`/journal/${post.slug}`}
      display="block"
      textDecoration="none"
      // data-group, NOT role="group": this renders as an <a>, and an
      // explicit ARIA role overrides the implicit link role, dropping every
      // card out of a screen reader's links list. Chakra's _groupHover matches
      // data-group just as well — the pattern already used elsewhere here.
      data-group
      _hover={{ textDecoration: 'none' }}
    >
      {/* The cluster. 2px gutters on purpose: at this spacing the photographs
          read as one object, which is what stops the page feeling scattered. */}
      {lead && (
        <Flex
          gap="2px"
          mb={4}
          align="stretch"
          // Column on phones. Side by side, the four supporting frames would
          // share the 38% left over from the lead — roughly 60px each on a
          // 375px screen, which is a swatch rather than a photograph. Stacked,
          // the lead runs full width and the rest become a strip beneath it at
          // about 85px.
          direction={{ base: 'column', md: 'row' }}
        >
          <Box
            flex={{ base: '1 1 auto', md: rest.length ? '0 0 62%' : '1 1 100%' }}
            overflow="hidden"
            bg="gray.100"
            sx={{ aspectRatio: '4 / 3' }}
          >
            <Image
              src={lead.url}
              alt={lead.alt ?? post.title}
              w="100%"
              h="100%"
              objectFit="cover"
              loading="lazy"
              transition="transform 0.7s ease"
              _groupHover={{ transform: 'scale(1.03)' }}
            />
          </Box>

          {rest.length > 0 && (
            <Grid
              flex="1 1 auto"
              // A strip across the bottom on phones, a block beside the lead
              // from md up. The aspect ratio keeps the strip from collapsing
              // to zero height when the parent is a column.
              templateColumns={{
                base: `repeat(${rest.length}, 1fr)`,
                md: rest.length > 2 ? 'repeat(2, 1fr)' : '1fr',
              }}
              gap="2px"
              sx={{
                '@media (max-width: 47.99em)': {
                  aspectRatio: `${rest.length * 4} / 3`,
                },
              }}
            >
              {rest.map((ph, i) => (
                <Box key={i} overflow="hidden" bg="gray.100" minH={0}>
                  <Image
                    src={ph.url}
                    alt={ph.alt ?? ''}
                    w="100%"
                    h="100%"
                    objectFit="cover"
                    loading="lazy"
                    transition="transform 0.7s ease"
                    _groupHover={{ transform: 'scale(1.03)' }}
                  />
                </Box>
              ))}
            </Grid>
          )}
        </Flex>
      )}

      {/* The words sit under the pictures, held to a readable measure rather
          than stretching the full width of the cluster. */}
      {/* Aligned to the lead frame's 62%, not the 46ch reading measure. At
          46ch the title wrapped with a large blank to its right while the
          photographs above ran much wider, which read as an arbitrary cut. On
          phones the cluster is full width, so this is too. */}
      <Box maxW={{ base: '100%', md: '62%' }}>
        {post.session_type && (
          <Text textStyle="metaCaption" color="brand.accentText" mb={1.5}>
            {post.session_type}
          </Text>
        )}

        <Text
          as="h2"
          textStyle="cardTitle"
          m={0}
          mb={2}
          transition="color 0.3s"
          _groupHover={{ color: 'brand.accentText' }}
        >
          {post.title}
        </Text>

        {/* No clamp on the excerpt. Every one in the database is 126-151
            characters, which fits in two or three lines at this measure — the
            ellipsis was truncating text that had room to finish. */}
        {post.excerpt && (
          <Text textStyle="bodyCopy" mb={3}>
            {post.excerpt}
          </Text>
        )}

        {/* Reads as the whole block's affordance, not a link inside it.
            On a pointer device it is driven by _groupHover on the card
            wrapper, so hovering the photographs — or the title, or anywhere
            else in the entry — slides the arrow in and draws the rule. The
            movement is what says the whole block is the target.
            
            TOUCH HAS NO HOVER, so that reveal never fires on a phone, which
            is exactly where the large tap target matters most. Under
            (hover: none) the arrow and rule are simply drawn at rest instead
            — same affordance, no interaction needed to see it. Querying hover
            capability rather than width is the point: a small laptop window
            still gets the animation, a large tablet still gets the static
            version. */}
        <Flex
          align="center"
          gap={2}
          color="brand.accentText"
          transition="gap 0.3s ease"
          _groupHover={{ gap: 3 }}
          sx={{ '@media (hover: none)': { gap: 'var(--chakra-space-3)' } }}
        >
          <Text textStyle="ctaLabel">Read the post</Text>
          <Box
            h="1px"
            bg="currentColor"
            w={0}
            opacity={0.5}
            transition="width 0.35s ease, opacity 0.35s ease"
            _groupHover={{ w: '38px', opacity: 1 }}
            sx={{ '@media (hover: none)': { width: '28px', opacity: 1 } }}
          />
          <Box
            as="span"
            fontSize="0.7rem"
            lineHeight={1}
            transform="translateX(-4px)"
            opacity={0}
            transition="transform 0.35s ease, opacity 0.35s ease"
            _groupHover={{ transform: 'translateX(0)', opacity: 1 }}
            sx={{ '@media (hover: none)': { transform: 'translateX(0)', opacity: 1 } }}
            aria-hidden
          >
            →
          </Box>
        </Flex>
      </Box>
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

/** "AUG" — the month for the rail marker. */
function monthOf(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
}

/** "9" — the day, set inside the disc. */
function dayOf(iso: string): string {
  return String(new Date(iso).getDate());
}


export default Journal;
