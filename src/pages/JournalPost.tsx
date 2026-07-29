import {
  Box, VStack, HStack, Text, Icon, Flex, Spinner, Image, SimpleGrid, Modal, ModalOverlay, ModalContent, ModalCloseButton, useDisclosure,
} from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { FaArrowLeft, FaBookOpen } from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';

/**
 * Individual journal post page — rendered when the URL is
 * /journal/:slug. Fetches the post + its resolved photo list from
 * /api/journal/post, renders the markdown body, and lays out the
 * photos in a masonry-ish grid. Clicking a photo opens a lightbox
 * with the larger view.
 *
 * The post's `cover_image_url` is used for og:image so link previews
 * on Instagram / Facebook / iMessage look right. Title + excerpt
 * power the meta tags.
 */

interface PostFull {
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  cover_image_url: string | null;
  cover_image_alt: string | null;
  photos: Photo[];
  session_type: string | null;
  tags: string[];
  published_at: string;
  updated_at: string;
}

interface Photo {
  url: string;
  fullUrl: string;
  alt: string;
  caption?: string;
}

const JournalPost = ({ slug }: { slug: string }) => {
  const [post, setPost] = useState<PostFull | null>(null);
  const [status, setStatus] = useState<'loading' | 'loaded' | 'notfound' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
  const ogImage = post.cover_image_url ?? post.photos[0]?.fullUrl ?? '';

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
          {post.cover_image_url && (
            <Box mb={{ base: 8, md: 12 }}>
              <Image
                src={post.cover_image_url}
                alt={post.cover_image_alt ?? post.title}
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

          {/* Back-to-journal footer link */}
          <Flex justify="center" mt={{ base: 12, md: 16 }}>
            <RouterLink to="/journal">
              <HStack
                spacing={2}
                color="gray.500"
                _hover={{ color: '#c9a96e' }}
                fontSize="xs"
                fontWeight="500"
                letterSpacing="0.2em"
                textTransform="uppercase"
              >
                <Icon as={FaArrowLeft} boxSize={3} />
                <Text>More from the journal</Text>
              </HStack>
            </RouterLink>
          </Flex>
        </Box>
      </Box>
    </>
  );
};

/**
 * Photo grid with lightbox. Uses a simple 2-column grid on desktop
 * so the images stay big (5–15 photos in a post — not a thumbnail
 * gallery), single column on mobile. Click opens a lightbox with
 * the full-size view.
 */
function PhotoGrid({ photos }: { photos: Photo[] }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const openAt = (idx: number) => {
    setActiveIdx(idx);
    onOpen();
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
            sx={{ WebkitTapHighlightColor: 'transparent' }}
            _hover={{
              '& > img': { transform: 'scale(1.03)' },
            }}
          >
            <Image
              src={photo.url}
              alt={photo.alt}
              w="100%"
              h="100%"
              objectFit="cover"
              transition="transform 0.5s ease"
              loading="lazy"
            />
          </Box>
        ))}
      </SimpleGrid>

      {/* Lightbox modal — full-viewport background, image centered, caption overlay */}
      <Modal isOpen={isOpen} onClose={onClose} size="full" isCentered>
        <ModalOverlay bg="rgba(15, 15, 15, 0.94)" />
        <ModalContent bg="transparent" boxShadow="none" m={0}>
          <ModalCloseButton color="white" size="lg" top={4} right={4} zIndex={10} />
          {activeIdx !== null && photos[activeIdx] && (
            <Flex
              w="100vw"
              h="100vh"
              align="center"
              justify="center"
              direction="column"
              gap={4}
              p={{ base: 4, md: 8 }}
              onClick={onClose}
            >
              <Image
                src={photos[activeIdx].fullUrl}
                alt={photos[activeIdx].alt}
                maxH="88vh"
                maxW="100%"
                objectFit="contain"
                onClick={(e) => e.stopPropagation()}
                cursor="default"
              />
              {photos[activeIdx].caption && (
                <Text
                  color="whiteAlpha.800"
                  fontSize="sm"
                  fontWeight="300"
                  textAlign="center"
                  maxW="600px"
                  px={4}
                >
                  {photos[activeIdx].caption}
                </Text>
              )}
              <Text color="whiteAlpha.500" fontSize="2xs" letterSpacing="0.2em" textTransform="uppercase">
                {activeIdx + 1} / {photos.length}
              </Text>
            </Flex>
          )}
        </ModalContent>
      </Modal>
    </>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default JournalPost;
