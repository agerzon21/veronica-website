import {
  Box, HStack, Text, Icon, Flex, Spinner, Image, SimpleGrid, Grid, GridItem, useToast,
} from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import FaArrowLeft from '../icons/fa/FaArrowLeft';
import FaArrowRight from '../icons/fa/FaArrowRight';
import FaBookOpen from '../icons/fa/FaBookOpen';
import FaChevronLeft from '../icons/fa/FaChevronLeft';
import FaChevronRight from '../icons/fa/FaChevronRight';
import FaShareAlt from '../icons/fa/FaShareAlt';
import FaTimes from '../icons/fa/FaTimes';
import ReactMarkdown from 'react-markdown';
import PageHeader from '../components/ui/PageHeader';
import CTAButton from '../components/ui/CTAButton';

/**
 * Individual journal post page — rendered when the URL is
 * /journal/:slug. Fetches the post + its resolved photo list from
 * /api/journal/post, renders the markdown body, hero image, photo
 * gallery, tags, share button, and chronological prev/next post
 * navigation.
 *
 * The first photo in the Drive folder is the cover (rendered as the
 * hero above the body); the gallery below is everything AFTER the
 * cover, so the same image doesn't render twice.
 *
 * Cover is used for og:image so link previews on Instagram / Facebook /
 * iMessage render correctly.
 *
 * LAYOUT: the page column is `content` (1000px). Prose — back link,
 * header, markdown body, tags, share, nav — is constrained to
 * `contentNarrow` (720px) inside it so the reading measure is the
 * site's, while the cover and the photo grid run the full column. The
 * photographs are the point; they get the extra width, not the padding.
 */

interface Photo {
  url: string;
  fullUrl: string;
  alt: string;
  caption?: string;
}

interface PostFull {
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  cover_photo: Photo | null;
  photos: Photo[];               // gallery (does NOT include cover)
  session_type: string | null;
  tags: string[];
  published_at: string;
  updated_at: string;
}

interface SiblingSummary {
  slug: string;
  title: string;
  published_at: string;
  cover_image_url?: string | null;
  cover_image_alt?: string | null;
}

/**
 * Split the markdown body into short chunks so photo bands can be woven
 * between them. Chunk sizes cycle one paragraph, then two — the first
 * photograph arrives after a single paragraph and the page keeps
 * alternating instead of front-loading the words. Headings never end a
 * chunk; they stay attached to the paragraph that follows, so a band
 * can't separate a section title from its first sentence.
 */
function chunkMarkdown(md: string): string[] {
  const blocks = md.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let paragraphs = 0;
  let target = 1;
  for (const block of blocks) {
    current.push(block);
    if (!/^#{1,6}\s/.test(block)) paragraphs++;
    if (paragraphs >= target) {
      chunks.push(current.join('\n\n'));
      current = [];
      paragraphs = 0;
      target = target === 1 ? 2 : 1;
    }
  }
  if (current.length) chunks.push(current.join('\n\n'));
  return chunks;
}

type BandVariant = 'fullbleed' | 'trio' | 'duo' | 'stagger';
const BAND_NEED: Record<BandVariant, number> = {
  fullbleed: 1,
  trio: 3,
  duo: 2,
  stagger: 2,
};

interface BandPlan {
  /** Index into the post's photos array where this band starts. */
  start: number;
  count: number;
  variant: BandVariant;
}

/**
 * Decide which photos get woven into the text and which stay for the
 * closing mosaic. Deliberately deterministic (no randomness — this runs
 * on every render): bands cycle fullbleed → trio → stagger → duo, most
 * of the photo set gets woven, and a fixed reserve keeps the ending a
 * proper wall of photographs. When the remaining budget can't afford the
 * cycle's next shape it downgrades (trio → stagger → fullbleed) rather
 * than stopping early.
 */
function planBands(chunkCount: number, photoCount: number): BandPlan[] {
  const slots = Math.max(0, chunkCount - 1);
  if (slots === 0 || photoCount === 0) return [];
  const reserve =
    photoCount >= 12 ? 6 : photoCount >= 8 ? 4 : photoCount >= 5 ? 3 : photoCount;
  let budget = photoCount - reserve;
  const cycle: BandVariant[] = ['fullbleed', 'trio', 'stagger', 'duo'];
  const plans: BandPlan[] = [];
  let start = 0;
  for (let slot = 0; slot < slots && budget > 0; slot++) {
    let variant = cycle[plans.length % cycle.length];
    if (budget < BAND_NEED[variant]) {
      variant = budget >= 2 ? 'stagger' : 'fullbleed';
    }
    plans.push({ start, count: BAND_NEED[variant], variant });
    start += BAND_NEED[variant];
    budget -= BAND_NEED[variant];
  }
  return plans;
}

const JournalPost = ({ slug }: { slug: string }) => {
  const [post, setPost] = useState<PostFull | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'notfound' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [siblings, setSiblings] = useState<{ prev: SiblingSummary | null; next: SiblingSummary | null }>({
    prev: null,
    next: null,
  });
  // One lightbox for the whole page — bands and the closing grid both open
  // it with a global photo index, so arrow keys walk EVERY photo in order
  // no matter where the visitor clicked in.
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const chunks = useMemo(
    () => (post?.body_markdown ? chunkMarkdown(post.body_markdown) : []),
    [post?.body_markdown],
  );
  const bands = useMemo(
    () => planBands(chunks.length, post?.photos.length ?? 0),
    [chunks.length, post?.photos.length],
  );

  const photoCount = post?.photos.length ?? 0;
  const navLightbox = useCallback(
    (dir: -1 | 1) => {
      setLightboxIdx((i) => {
        if (i === null) return i;
        const n = i + dir;
        if (n < 0) return photoCount - 1;
        if (n >= photoCount) return 0;
        return n;
      });
    },
    [photoCount],
  );

  // Fetch this post
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    (async () => {
      try {
        const res = await fetch(`/api/journal/post?slug=${encodeURIComponent(slug)}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.status === 404) {
          setStatus('notfound');
          return;
        }
        if (res.ok && data.success) {
          setPost(data.post);
          setStatus('loaded');
        } else {
          setErrorMessage(data.error || 'Could not load the post.');
          setStatus('error');
        }
      } catch {
        if (cancelled) return;
        setErrorMessage('Could not reach the server.');
        setStatus('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Fetch the sibling list for prev/next navigation. Done separately
  // (and can fail silently) so a list-fetch hiccup doesn't break the
  // main post render.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/journal/list');
        const data = await res.json();
        if (cancelled || !res.ok || !data.success) return;
        const list = data.posts as SiblingSummary[];
        const idx = list.findIndex((p) => p.slug === slug);
        if (idx === -1) return;
        // List is sorted newest-first: `next` chronologically = older
        // post = idx + 1; `prev` = newer post = idx - 1. We reverse
        // the mental model here so the UI reads "← previous / next →"
        // in reading order rather than in date order.
        setSiblings({
          prev: list[idx - 1] ?? null, // newer post
          next: list[idx + 1] ?? null, // older post
        });
      } catch {
        // ignore — nav is a bonus, not required
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleShare = async () => {
    if (!post) return;
    const url = `${window.location.origin}/journal/${post.slug}`;
    // Prefer the native share sheet on mobile — much nicer than a
    // copy toast when the user is on their phone.
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: post.title,
          text: post.excerpt || post.title,
          url,
        });
        return;
      } catch {
        // User cancelled — fall through to clipboard as a fallback
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: 'Link copied to clipboard',
        status: 'success',
        duration: 2500,
        isClosable: true,
      });
    } catch {
      toast({
        title: `Could not copy — the URL is ${url}`,
        status: 'warning',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  if (status === 'loading') {
    return (
      <>
        <Helmet>
          <title>Loading… | Vero Photography Journal</title>
        </Helmet>
        <Flex minH="80vh" align="center" justify="center">
          <Spinner color="brand.accent" />
        </Flex>
      </>
    );
  }

  if (status === 'notfound') {
    return (
      <>
        <Helmet>
          <title>Post not found | Vero Photography Journal</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <Flex minH="80vh" align="center" justify="center" direction="column" gap={5} px={4}>
          <Icon as={FaBookOpen} boxSize={8} color="brand.accent" />
          <Text textStyle="bodyLead">
            That post doesn't exist (yet).
          </Text>
          <BackToJournalLink />
        </Flex>
      </>
    );
  }

  if (status === 'error' || !post) {
    return (
      <>
        <Helmet>
          <title>Journal | Vero Photography</title>
        </Helmet>
        <Flex minH="80vh" align="center" justify="center" px={4}>
          <Text color="red.500" fontSize="sm">{errorMessage ?? 'Something went wrong.'}</Text>
        </Flex>
      </>
    );
  }

  const dateLabel = formatDate(post.published_at);
  const canonicalUrl = `https://vero.photography/journal/${post.slug}`;
  const coverPhoto = post.cover_photo ?? (post.cover_image_url
    ? {
        url: post.cover_image_url,
        // Stored cover URLs are the w800 thumb. The cover renders at full
        // column width, so derive the w2000 variant the same way the API
        // builds fullUrl for gallery photos.
        fullUrl: post.cover_image_url.replace(/([?&]sz=)w\d+/, '$1w2000'),
        alt: post.cover_image_alt ?? post.title,
      }
    : null);
  const ogImage = coverPhoto?.url ?? '';

  return (
    <>
      <Helmet>
        <title>{post.title} | Vero Photography Journal</title>
        <meta name="description" content={post.excerpt || `${post.title} — a recent recap from behind the lens.`} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:url" content={canonicalUrl} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        <meta property="article:published_time" content={post.published_at} />
        {post.updated_at && post.updated_at !== post.published_at && (
          <meta property="article:modified_time" content={post.updated_at} />
        )}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.excerpt} />
        {ogImage && <meta name="twitter:image" content={ogImage} />}
      </Helmet>

      <ReadingProgress articleRef={articleRef} />

      {/* overflowX clip: the fullbleed bands run w=100vw out of the centered
          column, and 100vw includes the scrollbar — without the clip that's
          a few px of horizontal scroll on every post. */}
      <Box ref={articleRef} bg="white" minH="100vh" layerStyle="pageTop" pb={{ base: '3.5rem', md: '6rem' }} overflowX="clip">
        <Box maxW="content" mx="auto" px={{ base: 4, md: 6 }}>
          {/* Back link + header — held to the reading measure */}
          <Box maxW="contentNarrow" mx="auto">
            <Box mb={{ base: 6, md: 8 }}>
              <BackToJournalLink />
            </Box>

            <Box mb={{ base: 8, md: 12 }}>
              <HStack spacing={3} mb={{ base: 4, md: 5 }}>
                <Text textStyle="metaCaption">{dateLabel}</Text>
                {post.session_type && (
                  <>
                    <Box w="4px" h="4px" borderRadius="full" bg="brand.accent" />
                    <Text textStyle="metaCaption">{post.session_type}</Text>
                  </>
                )}
              </HStack>
              <PageHeader
                title={post.title}
                lead={post.excerpt || undefined}
                align="left"
                size="content"
              />
            </Box>
          </Box>

          {/* Cover image — runs the full page column. fullUrl (w2000), not
              the w800 thumb: this is the largest image on the page, and the
              thumb rendered blurry at column width on retina. Natural aspect
              ratio, no fixed-height crop — a 580px objectFit=cover window
              was decapitating every landscape cover. The grid tiles keep
              their thumbs and crops; they display small. */}
          {coverPhoto && (
            <Box mb={{ base: 8, md: 12 }}>
              <Image
                src={coverPhoto.fullUrl}
                alt={coverPhoto.alt}
                w="100%"
                h="auto"
                borderRadius="sm"
              />
            </Box>
          )}

          {/* Body — text woven with photo bands. Chunks keep the reading
              measure; bands run the full column. Same rule as the cover:
              the photographs get the width, the words get the measure. */}
          {chunks.map((chunk, i) => (
            <Fragment key={i}>
              <Box
                className="journal-body"
                maxW="contentNarrow"
                mx="auto"
                mb={{ base: 8, md: 12 }}
                sx={i === 0 ? DROP_CAP_SX : undefined}
              >
                <ReactMarkdown components={mdComponents}>{chunk}</ReactMarkdown>
              </Box>
              {bands[i] && (
                <PhotoBand photos={post.photos} plan={bands[i]} onOpen={setLightboxIdx} />
              )}
            </Fragment>
          ))}

          {/* Closing grid — every photo the bands didn't use */}
          {post.photos.length > bandPhotoCount(bands) && (
            <PhotoGrid
              photos={post.photos.slice(bandPhotoCount(bands))}
              onOpen={(i) => setLightboxIdx(i + bandPhotoCount(bands))}
            />
          )}

          {/* Footer block — back to the reading measure */}
          <Box maxW="contentNarrow" mx="auto">
            {/* Tags footer */}
            {post.tags.length > 0 && (
              <HStack spacing={2} wrap="wrap" justify="center" mt={{ base: 8, md: 12 }} pt={6} borderTop="1px solid" borderColor="gray.100">
                {post.tags.map((tag) => (
                  <Text
                    key={tag}
                    textStyle="metaCaption"
                    bg="brand.surface"
                    border="1px solid"
                    borderColor="brand.accentBorder"
                    px={2}
                    py={1}
                    borderRadius="sm"
                  >
                    {tag}
                  </Text>
                ))}
              </HStack>
            )}

            {/* Share row */}
            <Flex justify="center" mt={{ base: 6, md: 8 }}>
              <CTAButton onClick={handleShare} icon={FaShareAlt} variant="outline" size="sm">
                Share this post
              </CTAButton>
            </Flex>

            {/* Chronological navigation — prev (newer) + next (older) posts.
                Hidden entirely if neither exists. */}
            {(siblings.prev || siblings.next) && (
              <SimpleGrid
                columns={{ base: 1, md: 2 }}
                spacing={{ base: 3, md: 4 }}
                mt={{ base: 8, md: 12 }}
                pt={6}
                borderTop="1px solid"
                borderColor="gray.100"
              >
                <SiblingNavCard sibling={siblings.prev} direction="prev" />
                <SiblingNavCard sibling={siblings.next} direction="next" />
              </SimpleGrid>
            )}

            {/* Back-to-journal button */}
            <Flex justify="center" mt={{ base: 6, md: 8 }}>
              <CTAButton to="/journal" icon={FaArrowLeft} variant="ghost" size="sm">
                All journal posts
              </CTAButton>
            </Flex>
          </Box>
        </Box>
      </Box>

      {lightboxIdx !== null && post.photos.length > 0 && (
        <Lightbox
          photos={post.photos}
          activeIdx={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
          onNav={navLightbox}
        />
      )}
    </>
  );
};

/** Total photos consumed by the woven bands (the closing grid starts after them). */
function bandPhotoCount(bands: BandPlan[]): number {
  return bands.reduce((n, b) => n + b.count, 0);
}

/**
 * Markdown renderers, hoisted so every text chunk shares one instance.
 * These are stateless — keeping them inline meant a fresh object per
 * render for no benefit once the body split into multiple chunks.
 */
const mdComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <Text as="h2" textStyle="sectionTitle" mt={10} mb={4}>
      {children}
    </Text>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <Text as="h3" textStyle="cardTitle" mt={8} mb={3}>
      {children}
    </Text>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <Text as="h4" textStyle="cardTitle" mt={6} mb={2}>
      {children}
    </Text>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <Text textStyle="bodyCopy" mb={5}>
      {children}
    </Text>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <Box
      as="a"
      href={href}
      color="brand.accentText"
      textDecoration="underline"
      textDecorationColor="brand.accentBorder"
      textUnderlineOffset="3px"
      _hover={{ textDecorationColor: 'brand.accentText' }}
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      {children}
    </Box>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <Box as="em" fontStyle="italic">{children}</Box>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <Box as="strong" fontWeight="600" color="gray.800">{children}</Box>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <Box as="ul" textStyle="bodyCopy" pl={5} mb={5} sx={{ 'li': { mb: 1.5 } }}>
      {children}
    </Box>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <Box as="ol" textStyle="bodyCopy" pl={5} mb={5} sx={{ 'li': { mb: 1.5 } }}>
      {children}
    </Box>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <Box
      as="blockquote"
      borderLeft="3px solid"
      borderColor="brand.accent"
      pl={5}
      py={1}
      my={6}
      fontStyle="italic"
    >
      {children}
    </Box>
  ),
  hr: () => <Box as="hr" my={8} borderColor="gray.200" />,
};

/**
 * Editorial drop cap on the opening paragraph only. The serif initial is
 * the one flourish the text gets — everything else stays the site's
 * reading measure.
 */
const DROP_CAP_SX = {
  '& > p:first-of-type::first-letter': {
    float: 'left',
    fontFamily: 'heading',
    fontSize: { base: '3.3em', md: '3.8em' },
    lineHeight: '0.82',
    pr: '0.13em',
    pt: '0.06em',
    color: 'gray.800',
  },
} as const;

/**
 * The round VP monogram lifted from /assets/images/logo.svg (the circle
 * group, viewBox re-based onto it). Inlined so the reading-progress coin
 * needs no extra network fetch and inherits crispness at any size.
 */
function VPMedallion({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="107 3 64 64" aria-hidden="true" focusable="false">
      <circle cx="139" cy="35" r="29.5" fill="white" stroke="#2d2d2d" strokeOpacity="0.4" strokeWidth="1.2" />
      <path
        d="M136.865 23.0692C140.881 22.7923 144.412 22.6538 147.458 22.6538C156.042 22.6538 160.335 25.6827 160.335 31.7404C160.335 34.5442 159.608 37.0019 158.154 39.1135C157.392 40.2558 156.215 41.1731 154.623 41.8654C153.031 42.5231 151.11 42.8519 148.86 42.8519H141.175V59H136.865V23.0692ZM147.51 23.1731C145.502 23.1731 143.39 23.2942 141.175 23.5365V42.3327H148.86C153.74 42.125 156.181 38.6288 156.181 31.8442C156.181 29.075 155.454 26.9462 154 25.4577C152.546 23.9346 150.383 23.1731 147.51 23.1731Z"
        fill="#7C7C7C"
      />
      <path
        d="M143.321 9.73078C143.979 10.3885 144.308 11.2365 144.308 12.275C144.308 13.1404 144.117 14.0231 143.737 14.9231L130.444 46.0769L129.873 46.3366L116.788 9.73078H121.202L132.054 40.4692L143.113 14.9231C143.494 14.0577 143.685 13.1577 143.685 12.2231C143.685 11.2885 143.425 10.5615 142.906 10.0423L143.321 9.73078Z"
        fill="#0f0f0f"
      />
    </svg>
  );
}

const COIN = 28;
const COIN_MOBILE = 22;

/**
 * Reading progress, in the site's own voice: the VP monogram coin travels
 * a hairline track as you read. Desktop (xl+, where the 1000px column
 * leaves a real gutter): a vertical rail on the right edge, coin sliding
 * downward. Smaller screens: a hairline along the BOTTOM edge with the
 * coin riding its leading tip — the top edge belongs to the fixed navbar.
 *
 * All motion is transform-only, driven by one rAF-throttled passive
 * scroll listener writing directly to refs — no React re-renders, no
 * layout thrash. Bounds are re-measured per frame so images finishing
 * their load (which changes article height) can't leave the coin lying.
 */
function ReadingProgress({ articleRef }: { articleRef: { current: HTMLDivElement | null } }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const deskFillRef = useRef<HTMLDivElement>(null);
  const deskCoinRef = useRef<HTMLDivElement>(null);
  const mobFillRef = useRef<HTMLDivElement>(null);
  const mobCoinRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const el = articleRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const p = total > 80 ? Math.min(1, Math.max(0, -rect.top / total)) : rect.top < 0 ? 1 : 0;
      if (deskFillRef.current) deskFillRef.current.style.transform = `scaleY(${p})`;
      if (deskCoinRef.current && trackRef.current) {
        deskCoinRef.current.style.transform = `translateY(${p * (trackRef.current.clientHeight - COIN)}px)`;
      }
      if (mobFillRef.current) mobFillRef.current.style.transform = `scaleX(${p})`;
      if (mobCoinRef.current) {
        mobCoinRef.current.style.transform = `translateX(${4 + p * (window.innerWidth - COIN_MOBILE - 8)}px)`;
      }
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [articleRef]);

  return (
    <>
      {/* Desktop rail — lives in the right gutter, below the navbar's z-index */}
      <Box
        ref={trackRef}
        position="fixed"
        right={{ xl: '28px', '2xl': '44px' }}
        top="50%"
        transform="translateY(-50%)"
        h="min(44vh, 400px)"
        w={`${COIN}px`}
        zIndex={900}
        display={{ base: 'none', xl: 'block' }}
        pointerEvents="none"
        aria-hidden="true"
      >
        <Box position="absolute" left="50%" top={`${COIN / 2}px`} bottom={`${COIN / 2}px`} w="1px" bg="gray.200" />
        <Box
          ref={deskFillRef}
          position="absolute"
          left="50%"
          top={`${COIN / 2}px`}
          h={`calc(100% - ${COIN}px)`}
          w="1px"
          bg="brand.accent"
          transformOrigin="top"
          transform="scaleY(0)"
        />
        <Box
          ref={deskCoinRef}
          position="absolute"
          top="0"
          left="0"
          w={`${COIN}px`}
          h={`${COIN}px`}
          willChange="transform"
          filter="drop-shadow(0 1px 4px rgba(15, 15, 15, 0.18))"
        >
          <VPMedallion size={COIN} />
        </Box>
      </Box>

      {/* Mobile / tablet — hairline along the bottom edge, coin on its tip */}
      <Box
        position="fixed"
        left="0"
        right="0"
        bottom="0"
        zIndex={1400}
        display={{ base: 'block', xl: 'none' }}
        pointerEvents="none"
        aria-hidden="true"
      >
        <Box
          ref={mobCoinRef}
          position="absolute"
          bottom="7px"
          left="0"
          w={`${COIN_MOBILE}px`}
          h={`${COIN_MOBILE}px`}
          willChange="transform"
          filter="drop-shadow(0 1px 3px rgba(15, 15, 15, 0.22))"
        >
          <VPMedallion size={COIN_MOBILE} />
        </Box>
        <Box h="2.5px" bg="blackAlpha.100">
          <Box
            ref={mobFillRef}
            h="100%"
            w="100%"
            bg="brand.accent"
            transformOrigin="left"
            transform="scaleX(0)"
          />
        </Box>
      </Box>
    </>
  );
}

const BAND_TILE_SX = {
  WebkitTapHighlightColor: 'transparent',
  '& > img': { transition: 'transform 0.5s ease' },
} as const;

/**
 * One clickable photograph. `ratio` crops it to a fixed-shape tile;
 * `cover` fills whatever box the parent grid gives it (trio cells, where
 * the row heights come from the container). Neither → natural shape.
 * `full` requests the w2000 asset — for anything displayed wider than
 * about half the column.
 */
function BandTile({
  photo,
  onClick,
  ratio,
  cover,
  full,
  ...boxProps
}: {
  photo: Photo;
  onClick: () => void;
  ratio?: number;
  cover?: boolean;
  full?: boolean;
} & Record<string, unknown>) {
  const cropped = cover || ratio !== undefined;
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      display="block"
      w="100%"
      h={cover ? '100%' : 'auto'}
      p={0}
      border="none"
      bg="gray.100"
      borderRadius="sm"
      overflow="hidden"
      cursor="zoom-in"
      aspectRatio={ratio}
      sx={BAND_TILE_SX}
      _hover={{ '& > img': { transform: 'scale(1.03)' } }}
      {...boxProps}
    >
      <Image
        src={full || !cropped ? photo.fullUrl : photo.url}
        alt={photo.alt}
        w="100%"
        h={cropped ? '100%' : 'auto'}
        objectFit={cropped ? 'cover' : undefined}
        display="block"
        loading="lazy"
      />
    </Box>
  );
}

/**
 * The edge-to-edge moment: one photograph breaking out of the column to
 * the full viewport width, uncropped. Orientation is only knowable once
 * the image loads — a portrait at 100vw would be one-and-a-half screens
 * tall, so portraits fall back to a centered column presentation
 * instead. Landscapes get the full bleed at their natural shape.
 */
function FullBleedTile({ photo, onClick }: { photo: Photo; onClick: () => void }) {
  const [isPortrait, setIsPortrait] = useState(false);
  if (isPortrait) {
    return (
      <Box maxW="640px" mx="auto">
        <BandTile photo={photo} onClick={onClick} full />
      </Box>
    );
  }
  return (
    <Box w="100vw" ml="calc(50% - 50vw)">
      <Box
        as="button"
        type="button"
        onClick={onClick}
        display="block"
        w="100%"
        p={0}
        border="none"
        bg="gray.100"
        overflow="hidden"
        cursor="zoom-in"
        sx={BAND_TILE_SX}
      >
        <Image
          src={photo.fullUrl}
          alt={photo.alt}
          w="100%"
          h="auto"
          display="block"
          loading="lazy"
          onLoad={(e) => {
            const img = e.target as HTMLImageElement;
            if (img.naturalWidth > 0 && img.naturalWidth / img.naturalHeight < 1.15) {
              setIsPortrait(true);
            }
          }}
        />
      </Box>
    </Box>
  );
}

/**
 * One woven photo band. Four shapes cycle through the article:
 *   fullbleed — one landscape running edge-to-edge across the viewport
 *   trio      — a collage: one tall feature with two squares beside it
 *   stagger   — asymmetric pair, the narrower one dropped a beat lower
 *   duo       — two portrait-cropped tiles side by side
 * Every tile opens the shared lightbox at its global index. Crops only
 * happen at tile sizes — photographs shown big keep their own shape.
 */
function PhotoBand({
  photos,
  plan,
  onOpen,
}: {
  photos: Photo[];
  plan: BandPlan;
  onOpen: (globalIdx: number) => void;
}) {
  const photo = (offset: number) => photos[plan.start + offset];
  const open = (offset: number) => () => onOpen(plan.start + offset);

  if (plan.variant === 'fullbleed') {
    if (!photo(0)) return null;
    return (
      <Box mb={{ base: 8, md: 12 }}>
        <FullBleedTile photo={photo(0)} onClick={open(0)} />
      </Box>
    );
  }

  if (plan.variant === 'trio') {
    if (!photo(0) || !photo(1) || !photo(2)) return null;
    return (
      <Grid
        templateColumns={{ base: '1fr 1fr', md: '2fr 1fr' }}
        templateRows={{ md: '1fr 1fr' }}
        gap={{ base: 3, md: 4 }}
        mb={{ base: 8, md: 12 }}
        aspectRatio={{ md: 3 / 2 }}
      >
        <GridItem colSpan={{ base: 2, md: 1 }} rowSpan={{ base: 1, md: 2 }}>
          <BandTile photo={photo(0)} onClick={open(0)} cover full aspectRatio={{ base: 3 / 2, md: 'auto' }} />
        </GridItem>
        <GridItem>
          <BandTile photo={photo(1)} onClick={open(1)} cover aspectRatio={{ base: 1, md: 'auto' }} />
        </GridItem>
        <GridItem>
          <BandTile photo={photo(2)} onClick={open(2)} cover aspectRatio={{ base: 1, md: 'auto' }} />
        </GridItem>
      </Grid>
    );
  }

  if (plan.variant === 'duo') {
    if (!photo(0) || !photo(1)) return null;
    return (
      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={{ base: 3, md: 4 }} mb={{ base: 8, md: 12 }}>
        <BandTile photo={photo(0)} onClick={open(0)} ratio={4 / 5} />
        <BandTile photo={photo(1)} onClick={open(1)} ratio={4 / 5} />
      </SimpleGrid>
    );
  }

  if (!photo(0) || !photo(1)) return null;
  return (
    <Grid
      templateColumns={{ base: '1fr', sm: '3fr 2fr' }}
      gap={{ base: 3, md: 4 }}
      mb={{ base: 8, md: 12 }}
      alignItems="start"
    >
      <BandTile photo={photo(0)} onClick={open(0)} ratio={3 / 4} />
      <BandTile photo={photo(1)} onClick={open(1)} ratio={4 / 5} mt={{ base: 0, sm: 12 }} />
    </Grid>
  );
}

/**
 * The one "back to the journal" link. It used to exist twice in this
 * file at two different weights, two sizes and two colours — one of
 * them gold-on-white, which fails contrast. One component, one
 * `ctaLabel`, one hover.
 */
function BackToJournalLink() {
  return (
    <RouterLink to="/journal">
      <HStack
        as="span"
        display="inline-flex"
        spacing={2}
        textStyle="ctaLabel"
        color="gray.500"
        _hover={{ color: 'brand.accentText' }}
        transition="color 0.2s"
      >
        <Icon as={FaArrowLeft} boxSize={3} />
        <Text as="span">Back to the journal</Text>
      </HStack>
    </RouterLink>
  );
}

/**
 * One prev/next card in the chronological nav row. If `sibling` is
 * null (no post in that direction), renders a placeholder that keeps
 * the row balanced but reads as "no more" so the user isn't confused.
 */
function SiblingNavCard({
  sibling,
  direction,
}: {
  sibling: SiblingSummary | null;
  direction: 'prev' | 'next';
}) {
  const isNext = direction === 'next';
  const label = isNext ? 'Older post' : 'Newer post';

  if (!sibling) {
    return (
      <Box
        p={{ base: 4, md: 5 }}
        border="1px dashed"
        borderColor="gray.200"
        borderRadius="sm"
        bg="gray.50"
        opacity={0.6}
      >
        <Text textStyle="metaCaption" mb={2}>
          {label}
        </Text>
        <Text textStyle="bodyCopy">
          {isNext ? 'You’ve reached the beginning.' : 'This is the most recent one.'}
        </Text>
      </Box>
    );
  }

  return (
    <RouterLink to={`/journal/${sibling.slug}`}>
      <Box
        role="group"
        position="relative"
        h={{ base: '110px', md: '150px' }}
        borderRadius="sm"
        overflow="hidden"
        bg="brand.surface"
        transition="box-shadow 0.25s"
        _hover={{ boxShadow: '0 10px 28px -12px rgba(15, 15, 15, 0.45)' }}
        cursor="pointer"
      >
        {/* That post's own cover, quietly zooming on hover. The gradient
            keeps white text readable over any photograph. Drive thumbnails
            occasionally rate-limit under a burst (this page loads a lot of
            them) — on error the img hides itself so the card degrades to
            gradient-on-surface instead of a broken-image glyph. */}
        {sibling.cover_image_url && (
          <Image
            src={sibling.cover_image_url}
            alt=""
            position="absolute"
            inset={0}
            w="100%"
            h="100%"
            objectFit="cover"
            transition="transform 0.6s ease"
            _groupHover={{ transform: 'scale(1.05)' }}
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
        <Box
          position="absolute"
          inset={0}
          bg="linear-gradient(180deg, rgba(15,15,15,0.16) 0%, rgba(15,15,15,0.35) 45%, rgba(15,15,15,0.66) 100%)"
        />
        <Flex
          position="relative"
          direction="column"
          justify="space-between"
          h="100%"
          p={{ base: 3.5, md: 4 }}
          textAlign={isNext ? 'right' : 'left'}
        >
          <HStack
            spacing={2}
            justify={isNext ? 'flex-end' : 'flex-start'}
            color="whiteAlpha.900"
          >
            {!isNext && <Icon as={FaArrowLeft} boxSize={2.5} />}
            <Text textStyle="metaCaption" color="whiteAlpha.900">
              {label}
            </Text>
            {isNext && <Icon as={FaArrowRight} boxSize={2.5} />}
          </HStack>
          <Text
            textStyle="cardTitle"
            color="white"
            noOfLines={2}
            textShadow="0 1px 10px rgba(0, 0, 0, 0.45)"
          >
            {sibling.title}
          </Text>
        </Flex>
      </Box>
    </RouterLink>
  );
}

/**
 * Photo gallery grid + lightbox. Lightbox is a custom fixed-position
 * overlay (not a Chakra Modal) so:
 *   - Close button sits above the site nav header, not underneath it
 *   - We control the z-index precisely (2100 = above nav's 1500)
 *   - Prev/next chevrons + keyboard nav are wired in one place
 *   - No modal focus-trap fights with the arrow-key handlers
 *
 * Client-only affordances (download, save-to-Photos, favorites) are
 * intentionally left out — this is a public showcase, not a gallery
 * where visitors need to take files with them.
 */
function PhotoGrid({ photos, onOpen }: { photos: Photo[]; onOpen: (i: number) => void }) {
  // Mosaic, not a uniform grid: every fifth photograph becomes a
  // double-height feature spanning four of the six columns; the rest
  // flow dense around it. Deterministic pattern, no measuring needed —
  // crops happen at tile size where they're invisible.
  return (
    <Grid
      templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(6, 1fr)' }}
      autoRows={{ base: '34vw', md: '220px' }}
      autoFlow="dense"
      gap={{ base: 3, md: 4 }}
    >
      {photos.map((photo, i) => {
        const feature = i % 5 === 0;
        return (
          <GridItem
            key={i}
            colSpan={feature ? { base: 2, md: 4 } : { base: 1, md: 2 }}
            rowSpan={feature ? 2 : 1}
          >
            <BandTile photo={photo} onClick={() => onOpen(i)} cover full={feature} />
          </GridItem>
        );
      })}
    </Grid>
  );
}

function Lightbox({
  photos,
  activeIdx,
  onClose,
  onNav,
}: {
  photos: Photo[];
  activeIdx: number;
  onClose: () => void;
  onNav: (dir: -1 | 1) => void;
}) {
  const photo = photos[activeIdx];

  // Keyboard: ESC to close, arrow keys to navigate. Registered on
  // window so the user doesn't need to click the overlay first for
  // keys to work.
  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') onNav(-1);
      else if (e.key === 'ArrowRight') onNav(1);
    },
    [onClose, onNav],
  );

  // Body scroll lock while lightbox is open + keyboard listener.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [handleKey]);

  if (!photo) return null;

  return (
    <Box
      position="fixed"
      inset={0}
      bg="rgba(15, 15, 15, 0.94)"
      zIndex={2100}
      onClick={onClose}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* Close button — top-right, always above the site header */}
      <Box
        as="button"
        type="button"
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        position="absolute"
        top={{ base: 3, md: 5 }}
        right={{ base: 3, md: 5 }}
        w={{ base: '40px', md: '44px' }}
        h={{ base: '40px', md: '44px' }}
        borderRadius="full"
        bg="rgba(255,255,255,0.1)"
        border="1px solid rgba(255,255,255,0.15)"
        color="white"
        display="flex"
        alignItems="center"
        justifyContent="center"
        cursor="pointer"
        _hover={{ bg: 'rgba(255,255,255,0.2)' }}
        transition="background 0.15s"
        zIndex={2}
      >
        <Icon as={FaTimes} boxSize={4} />
      </Box>

      {/* Prev arrow */}
      {photos.length > 1 && (
        <Box
          as="button"
          type="button"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onNav(-1);
          }}
          aria-label="Previous image"
          position="absolute"
          left={{ base: 2, md: 6 }}
          top="50%"
          transform="translateY(-50%)"
          w={{ base: '40px', md: '52px' }}
          h={{ base: '40px', md: '52px' }}
          borderRadius="full"
          bg="rgba(255,255,255,0.1)"
          border="1px solid rgba(255,255,255,0.15)"
          color="white"
          display="flex"
          alignItems="center"
          justifyContent="center"
          cursor="pointer"
          _hover={{ bg: 'rgba(255,255,255,0.2)' }}
          transition="background 0.15s"
          zIndex={2}
        >
          <Icon as={FaChevronLeft} boxSize={4} />
        </Box>
      )}

      {/* Next arrow */}
      {photos.length > 1 && (
        <Box
          as="button"
          type="button"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onNav(1);
          }}
          aria-label="Next image"
          position="absolute"
          right={{ base: 2, md: 6 }}
          top="50%"
          transform="translateY(-50%)"
          w={{ base: '40px', md: '52px' }}
          h={{ base: '40px', md: '52px' }}
          borderRadius="full"
          bg="rgba(255,255,255,0.1)"
          border="1px solid rgba(255,255,255,0.15)"
          color="white"
          display="flex"
          alignItems="center"
          justifyContent="center"
          cursor="pointer"
          _hover={{ bg: 'rgba(255,255,255,0.2)' }}
          transition="background 0.15s"
          zIndex={2}
        >
          <Icon as={FaChevronRight} boxSize={4} />
        </Box>
      )}

      {/* Image + caption + counter */}
      <Flex
        w="100vw"
        h="100vh"
        align="center"
        justify="center"
        direction="column"
        gap={4}
        p={{ base: 4, md: 8 }}
        onClick={(e) => {
          // Click on empty space closes; click on image itself doesn't.
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <Image
          src={photo.fullUrl}
          alt={photo.alt}
          maxH={{ base: '78vh', md: '85vh' }}
          maxW={{ base: '92vw', md: '85vw' }}
          objectFit="contain"
          onClick={(e) => e.stopPropagation()}
          cursor="default"
        />
        {photo.caption && (
          <Text
            textStyle="bodyCopy"
            color="whiteAlpha.800"
            textAlign="center"
            maxW="measure"
            px={4}
            onClick={(e) => e.stopPropagation()}
          >
            {photo.caption}
          </Text>
        )}
        <Text
          textStyle="metaCaption"
          color="whiteAlpha.600"
          onClick={(e) => e.stopPropagation()}
        >
          {activeIdx + 1} / {photos.length}
        </Text>
      </Flex>
    </Box>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default JournalPost;
