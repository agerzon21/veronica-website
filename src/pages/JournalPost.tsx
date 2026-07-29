import {
  Box, VStack, HStack, Text, Icon, Flex, Spinner, Image, SimpleGrid, useToast,
} from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import { useEffect, useState, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { FaArrowLeft, FaArrowRight, FaBookOpen, FaShareAlt, FaChevronLeft, FaChevronRight, FaTimes } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';

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
}

const JournalPost = ({ slug }: { slug: string }) => {
  const [post, setPost] = useState<PostFull | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'notfound' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [siblings, setSiblings] = useState<{ prev: SiblingSummary | null; next: SiblingSummary | null }>({
    prev: null,
    next: null,
  });
  const toast = useToast();

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
          <Spinner color="#c9a96e" />
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
        <Flex minH="80vh" align="center" justify="center" direction="column" gap={4} px={4}>
          <Icon as={FaBookOpen} boxSize={8} color="#c9a96e" />
          <Text fontSize="lg" color="gray.700" fontWeight="300">
            That post doesn't exist (yet).
          </Text>
          <RouterLink to="/journal">
            <Text fontSize="xs" letterSpacing="0.2em" textTransform="uppercase" color="#c9a96e">
              ← Back to the journal
            </Text>
          </RouterLink>
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
    ? { url: post.cover_image_url, fullUrl: post.cover_image_url, alt: post.cover_image_alt ?? post.title }
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

      <Box bg="white" minH="100vh" pt={{ base: 20, md: 24 }} pb={{ base: 16, md: 24 }}>
        <Box maxW="820px" mx="auto" px={{ base: 4, md: 6 }}>
          {/* Back link */}
          <RouterLink to="/journal">
            <HStack
              spacing={2}
              color="gray.500"
              _hover={{ color: '#c9a96e' }}
              fontSize="xs"
              fontWeight="500"
              letterSpacing="0.2em"
              textTransform="uppercase"
              mb={{ base: 6, md: 8 }}
            >
              <Icon as={FaArrowLeft} boxSize={3} />
              <Text>Back to the journal</Text>
            </HStack>
          </RouterLink>

          {/* Header */}
          <VStack align="stretch" spacing={4} mb={{ base: 8, md: 12 }}>
            <HStack spacing={3}>
              <Text
                fontSize="2xs"
                fontWeight="500"
                letterSpacing="0.2em"
                textTransform="uppercase"
                color="#c9a96e"
              >
                {dateLabel}
              </Text>
              {post.session_type && (
                <>
                  <Box w="4px" h="4px" borderRadius="full" bg="#c9a96e" />
                  <Text
                    fontSize="2xs"
                    fontWeight="500"
                    letterSpacing="0.2em"
                    textTransform="uppercase"
                    color="gray.500"
                  >
                    {post.session_type}
                  </Text>
                </>
              )}
            </HStack>
            <Text
              as="h1"
              fontSize={{ base: '3xl', md: '5xl' }}
              fontWeight="200"
              color="gray.800"
              letterSpacing="0.01em"
              lineHeight="1.15"
              m={0}
            >
              {post.title}
            </Text>
            {post.excerpt && (
              <Text
                fontSize={{ base: 'md', md: 'lg' }}
                color="gray.600"
                fontWeight="300"
                lineHeight="1.7"
              >
                {post.excerpt}
              </Text>
            )}
          </VStack>

          {/* Cover image */}
          {coverPhoto && (
            <Box mb={{ base: 8, md: 12 }}>
              <Image
                src={coverPhoto.url}
                alt={coverPhoto.alt}
                w="100%"
                h={{ base: '260px', md: '520px' }}
                objectFit="cover"
                borderRadius="sm"
              />
            </Box>
          )}

          {/* Markdown body */}
          {post.body_markdown && (
            <Box className="journal-body" mb={{ base: 10, md: 14 }}>
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <Text as="h2" fontSize={{ base: '2xl', md: '3xl' }} fontWeight="300" color="gray.800" mt={10} mb={4} lineHeight="1.2">
                      {children}
                    </Text>
                  ),
                  h2: ({ children }) => (
                    <Text as="h3" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="400" color="gray.800" mt={8} mb={3} lineHeight="1.3">
                      {children}
                    </Text>
                  ),
                  h3: ({ children }) => (
                    <Text as="h4" fontSize={{ base: 'lg', md: 'xl' }} fontWeight="500" color="gray.800" mt={6} mb={2}>
                      {children}
                    </Text>
                  ),
                  p: ({ children }) => (
                    <Text fontSize={{ base: 'md', md: 'lg' }} color="gray.700" fontWeight="300" lineHeight="1.85" mb={5}>
                      {children}
                    </Text>
                  ),
                  a: ({ children, href }) => (
                    <Box
                      as="a"
                      href={href}
                      color="#c9a96e"
                      textDecoration="underline"
                      textDecorationColor="rgba(201, 169, 110, 0.4)"
                      textUnderlineOffset="3px"
                      _hover={{ color: '#8a6e35', textDecorationColor: '#8a6e35' }}
                      target={href?.startsWith('http') ? '_blank' : undefined}
                      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                    >
                      {children}
                    </Box>
                  ),
                  em: ({ children }) => <Box as="em" fontStyle="italic">{children}</Box>,
                  strong: ({ children }) => <Box as="strong" fontWeight="600" color="gray.800">{children}</Box>,
                  ul: ({ children }) => (
                    <Box as="ul" pl={5} mb={5} sx={{ 'li': { fontSize: { base: 'md', md: 'lg' }, color: 'gray.700', fontWeight: 300, lineHeight: '1.8', mb: 1.5 } }}>
                      {children}
                    </Box>
                  ),
                  ol: ({ children }) => (
                    <Box as="ol" pl={5} mb={5} sx={{ 'li': { fontSize: { base: 'md', md: 'lg' }, color: 'gray.700', fontWeight: 300, lineHeight: '1.8', mb: 1.5 } }}>
                      {children}
                    </Box>
                  ),
                  blockquote: ({ children }) => (
                    <Box
                      as="blockquote"
                      borderLeft="3px solid"
                      borderColor="#c9a96e"
                      pl={5}
                      py={1}
                      my={6}
                      color="gray.600"
                      fontStyle="italic"
                    >
                      {children}
                    </Box>
                  ),
                  hr: () => <Box as="hr" my={8} borderColor="gray.200" />,
                }}
              >
                {post.body_markdown}
              </ReactMarkdown>
            </Box>
          )}

          {/* Photo gallery */}
          {post.photos.length > 0 && <PhotoGrid photos={post.photos} />}

          {/* Tags footer */}
          {post.tags.length > 0 && (
            <HStack spacing={2} wrap="wrap" mt={{ base: 10, md: 14 }} pt={6} borderTop="1px solid" borderColor="gray.100">
              {post.tags.map((tag) => (
                <Text
                  key={tag}
                  fontSize="2xs"
                  fontWeight="500"
                  letterSpacing="0.1em"
                  textTransform="lowercase"
                  color="#8a6e35"
                  bg="#fdf9f0"
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

          {/* Share row */}
          <Flex justify="center" mt={{ base: 8, md: 10 }}>
            <Box
              as="button"
              type="button"
              onClick={handleShare}
              display="inline-flex"
              alignItems="center"
              gap={2}
              fontSize="xs"
              fontWeight="500"
              letterSpacing="0.16em"
              textTransform="uppercase"
              color="#8a6e35"
              bg="rgba(201, 169, 110, 0.1)"
              border="1px solid"
              borderColor="rgba(201, 169, 110, 0.4)"
              _hover={{ bg: 'rgba(201, 169, 110, 0.2)', borderColor: '#c9a96e', color: '#6b5424' }}
              px={5}
              py={2.5}
              borderRadius="sm"
              cursor="pointer"
              transition="all 0.2s"
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon as={FaShareAlt} boxSize={3} />
              Share this post
            </Box>
          </Flex>

          {/* Chronological navigation — prev (newer) + next (older) posts.
              Hidden entirely if neither exists. */}
          {(siblings.prev || siblings.next) && (
            <SimpleGrid
              columns={{ base: 1, md: 2 }}
              spacing={{ base: 3, md: 4 }}
              mt={{ base: 10, md: 14 }}
              pt={6}
              borderTop="1px solid"
              borderColor="gray.100"
            >
              <SiblingNavCard sibling={siblings.prev} direction="prev" />
              <SiblingNavCard sibling={siblings.next} direction="next" />
            </SimpleGrid>
          )}

          {/* Back-to-journal button */}
          <Flex justify="center" mt={{ base: 8, md: 10 }}>
            <RouterLink to="/journal">
              <Box
                as="span"
                display="inline-flex"
                alignItems="center"
                gap={2}
                fontSize="xs"
                fontWeight="500"
                letterSpacing="0.16em"
                textTransform="uppercase"
                color="gray.700"
                bg="white"
                border="1px solid"
                borderColor="gray.300"
                _hover={{ borderColor: '#c9a96e', color: '#8a6e35' }}
                px={5}
                py={2.5}
                borderRadius="sm"
                cursor="pointer"
                transition="all 0.2s"
              >
                <Icon as={FaArrowLeft} boxSize={2.5} />
                All journal posts
              </Box>
            </RouterLink>
          </Flex>
        </Box>
      </Box>
    </>
  );
};

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
        <Text fontSize="2xs" fontWeight="500" letterSpacing="0.14em" textTransform="uppercase" color="gray.400" mb={1}>
          {label}
        </Text>
        <Text fontSize="sm" color="gray.400" fontWeight="300">
          {isNext ? 'You’ve reached the beginning.' : 'This is the most recent one.'}
        </Text>
      </Box>
    );
  }

  return (
    <RouterLink to={`/journal/${sibling.slug}`}>
      <Box
        p={{ base: 4, md: 5 }}
        border="1px solid"
        borderColor="gray.200"
        borderRadius="sm"
        bg="white"
        transition="all 0.2s"
        _hover={{
          borderColor: '#c9a96e',
          bg: '#fdf9f0',
          transform: 'translateY(-1px)',
          boxShadow: '0 4px 12px -6px rgba(201, 169, 110, 0.35)',
        }}
        cursor="pointer"
        textAlign={isNext ? 'right' : 'left'}
      >
        <HStack
          spacing={2}
          justify={isNext ? 'flex-end' : 'flex-start'}
          color="#8a6e35"
          mb={1.5}
        >
          {!isNext && <Icon as={FaArrowLeft} boxSize={2.5} />}
          <Text fontSize="2xs" fontWeight="500" letterSpacing="0.14em" textTransform="uppercase">
            {label}
          </Text>
          {isNext && <Icon as={FaArrowRight} boxSize={2.5} />}
        </HStack>
        <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="400" color="gray.800" noOfLines={2} lineHeight="1.4">
          {sibling.title}
        </Text>
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
function PhotoGrid({ photos }: { photos: Photo[] }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const openAt = (i: number) => setActiveIdx(i);
  const close = () => setActiveIdx(null);
  const nav = (dir: -1 | 1) => {
    setActiveIdx((i) => {
      if (i === null) return i;
      const next = i + dir;
      if (next < 0) return photos.length - 1;
      if (next >= photos.length) return 0;
      return next;
    });
  };

  return (
    <>
      <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={{ base: 3, md: 4 }}>
        {photos.map((photo, i) => (
          <Box
            key={i}
            as="button"
            type="button"
            onClick={() => openAt(i)}
            bg="gray.100"
            overflow="hidden"
            borderRadius="sm"
            aspectRatio={4 / 3}
            position="relative"
            border="none"
            p={0}
            cursor="pointer"
            sx={{
              WebkitTapHighlightColor: 'transparent',
              '& > img': { transition: 'transform 0.5s ease' },
            }}
            _hover={{ '& > img': { transform: 'scale(1.03)' } }}
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
        ))}
      </SimpleGrid>

      {activeIdx !== null && (
        <Lightbox
          photos={photos}
          activeIdx={activeIdx}
          onClose={close}
          onNav={nav}
        />
      )}
    </>
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
            color="whiteAlpha.800"
            fontSize="sm"
            fontWeight="300"
            textAlign="center"
            maxW="600px"
            px={4}
            onClick={(e) => e.stopPropagation()}
          >
            {photo.caption}
          </Text>
        )}
        <Text
          color="whiteAlpha.600"
          fontSize="2xs"
          letterSpacing="0.2em"
          textTransform="uppercase"
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
