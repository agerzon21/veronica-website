import React, { useEffect, useState, useRef } from 'react';
import {
  Box,
  Container,
  Image,
  Text,
  VStack,
  Flex,
  SimpleGrid,
  Tag,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import { FaRegCopy, FaShareAlt } from 'react-icons/fa';
import { useCopyNotification } from '../components/CopyNotification';
import LoadingImage from '../components/ui/LoadingImage';
import PageHeader from '../components/ui/PageHeader';
import CTAButton from '../components/ui/CTAButton';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';

// Photo shape mirrors what /api/gallery/post returns. Kept local so
// this component doesn't need photos.ts at all (which used to
// import the whole CSV synchronously at module load).
interface Photo {
  id: string;
  slug: string;
  category: 'portraits' | 'weddings' | 'family' | 'maternity';
  url: string;
  originalUrl?: string;
  driveViewUrl?: string;
  alt: string;
  title: string;
  description: string;
  keywords: string[];
  width: number | null;
  height: number | null;
}

const MotionDiv = motion.div;

const IndividualPhoto: React.FC = () => {
  const { category, photoId } = useParams<{ category: string; photoId: string }>();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [relatedPhotos, setRelatedPhotos] = useState<Photo[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dragDistanceRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { show: showCopied, Notification: CopyNotification } = useCopyNotification();

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    if (!isFullscreen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  };

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsFullscreen(false);
      };
      window.addEventListener('keydown', handleKey);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKey);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      setScale((prev) => Math.max(0.1, Math.min(5, prev * delta)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [isFullscreen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragDistanceRef.current = 0;
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      dragDistanceRef.current += Math.abs(e.movementX) + Math.abs(e.movementY);
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDistRef = useRef<number | null>(null);
  const touchDragDistRef = useRef(0);
  const wasPinchingRef = useRef(false);

  const getTouchDist = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && !wasPinchingRef.current) {
      touchDragDistRef.current = 0;
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastPinchDistRef.current = null;
    } else if (e.touches.length === 2) {
      wasPinchingRef.current = true;
      lastTouchRef.current = null;
      lastPinchDistRef.current = getTouchDist(e.touches[0], e.touches[1]);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && lastTouchRef.current && !wasPinchingRef.current) {
      const dx = e.touches[0].clientX - lastTouchRef.current.x;
      const dy = e.touches[0].clientY - lastTouchRef.current.y;
      touchDragDistRef.current += Math.abs(dx) + Math.abs(dy);
      setPosition((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && lastPinchDistRef.current !== null) {
      const newDist = getTouchDist(e.touches[0], e.touches[1]);
      const ratio = newDist / lastPinchDistRef.current;
      setScale((prev) => Math.max(0.1, Math.min(5, prev * ratio)));
      lastPinchDistRef.current = newDist;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      if (touchDragDistRef.current < 10 && !wasPinchingRef.current) {
        toggleFullscreen();
      }
      lastTouchRef.current = null;
      lastPinchDistRef.current = null;
      wasPinchingRef.current = false;
    } else if (e.touches.length === 1) {
      lastTouchRef.current = null;
      lastPinchDistRef.current = null;
    }
  };

  // Fetch the main photo and its related photos in parallel from the
  // gallery API. The related endpoint runs the same keyword-overlap
  // scoring the old client-side findRelatedPhotos did — just on the
  // server, so we don't ship the entire photo set to the browser.
  useEffect(() => {
    if (!category || !photoId) return;
    let cancelled = false;
    setLoading(true);
    setPhoto(null);
    setRelatedPhotos([]);
    (async () => {
      try {
        const [postRes, relatedRes] = await Promise.all([
          fetch(
            `/api/gallery/post?category=${encodeURIComponent(category)}&slug=${encodeURIComponent(photoId)}`,
          ),
          fetch(`/api/gallery/related?slug=${encodeURIComponent(photoId)}&limit=6`),
        ]);
        if (cancelled) return;
        const postData = await postRes.json();
        if (postRes.ok && postData.success) {
          setPhoto(postData.photo);
        } else {
          setPhoto(null);
        }
        if (relatedRes.ok) {
          const relatedData = await relatedRes.json();
          if (relatedData.success) setRelatedPhotos(relatedData.photos);
        }
      } catch {
        // Silent fail — the render below shows a "photo not found"
        // state when `photo` is null after loading.
        if (!cancelled) setPhoto(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, photoId]);

  const handleCopyLink = () => {
    if (photo) {
      navigator.clipboard.writeText(window.location.href).then(() => showCopied());
    }
  };

  const handleShare = async () => {
    if (navigator.share && photo) {
      try {
        await navigator.share({
          title: photo.title,
          text: photo.description,
          url: window.location.href,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        await navigator.clipboard.writeText(window.location.href);
        showCopied();
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      showCopied();
    }
  };

  if (loading) {
    return (
      <Flex minH="100vh" bg="white" align="center" justify="center">
        <Text textStyle="metaCaption">Loading...</Text>
      </Flex>
    );
  }

  if (!photo) {
    return (
      <Box minH="100vh" bg="white">
        <Flex minH="100vh" align="center" justify="center" direction="column" gap={6}>
          <Text as="h1" textStyle="sectionTitle" m={0}>Photo not found</Text>
          <CTAButton to={`/gallery/${category}`} size="sm">
            Back to Gallery
          </CTAButton>
        </Flex>
      </Box>
    );
  }

  const categoryLabel = category ? category.charAt(0).toUpperCase() + category.slice(1) : '';
  const titleNoSuffix = photo.title.replace(' | Vero Photography', '');
  // Build the canonical URL from route params instead of window.location.href
  // so it's stable across SSR/prerender and never includes query strings.
  const photoUrl = `https://vero.photography/photo/${category}/${photoId}`;
  const photoImage = `https://vero.photography${photo.url}`;

  // BreadcrumbList schema — makes the page eligible for breadcrumb rich results
  // and tells Google how the photo fits in the site hierarchy. Helps with
  // indexing thin photo pages by establishing internal-link context.
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://vero.photography' },
      { '@type': 'ListItem', position: 2, name: 'Gallery', item: 'https://vero.photography/gallery' },
      { '@type': 'ListItem', position: 3, name: categoryLabel, item: `https://vero.photography/gallery/${category}` },
      { '@type': 'ListItem', position: 4, name: titleNoSuffix, item: photoUrl },
    ],
  };

  return (
    <>
      <Helmet>
        <title>{photo.title}</title>
        <meta name="description" content={photo.description} />
        <meta property="og:title" content={photo.title} />
        <meta property="og:description" content={photo.description} />
        <meta property="og:image" content={photoImage} />
        <meta property="og:url" content={photoUrl} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={photo.title} />
        <meta name="twitter:description" content={photo.description} />
        <meta name="twitter:image" content={photoImage} />
        <link rel="canonical" href={photoUrl} />
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <Box minH="100vh" bg="white" layerStyle="pageTop">
        {/* Breadcrumb — small, semantic. Real <a href> tags so they're
            crawlable and provide internal links INTO the photo pages from
            the perspective of Googlebot crawling the gallery → category → photo. */}
        <Box
          as="nav"
          aria-label="Breadcrumb"
          px={{ base: 4, md: 8 }}
          py={3}
          maxW="contentWide"
          mx="auto"
        >
          <Flex
            as="ol"
            listStyleType="none"
            gap={2}
            textStyle="metaCaption"
            flexWrap="wrap"
          >
            <Box as="li">
              <Link to="/" style={{ color: 'inherit' }}>Home</Link>
            </Box>
            <Box as="li" aria-hidden="true">/</Box>
            <Box as="li">
              <Link to="/gallery" style={{ color: 'inherit' }}>Gallery</Link>
            </Box>
            <Box as="li" aria-hidden="true">/</Box>
            <Box as="li">
              <Link to={`/gallery/${category}`} style={{ color: 'inherit' }}>{categoryLabel}</Link>
            </Box>
            <Box as="li" aria-hidden="true">/</Box>
            <Box as="li" aria-current="page" color="gray.600">
              {titleNoSuffix}
            </Box>
          </Flex>
        </Box>

        {/* Hero image — full width. Container uses the photo's real
            aspect ratio (from DB, via /api/gallery/post) so it has a
            non-zero height BEFORE the image loads — that's what lets
            the cream placeholder + gold spinner show up while the
            Drive proxy warms its cache. Falls back to 3/2 if the
            aspect isn't known (rare — pre-migration photos might
            lack dims). */}
        <Box
          position="relative"
          w="100%"
          bg="white"
          maxH="80vh"
          sx={{
            aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : '3 / 2',
          }}
        >
          <LoadingImage
            src={photo.url}
            alt={photo.alt}
            title={photo.title}
            w="100%"
            h="100%"
            imgObjectFit="contain"
            spinnerSize="lg"
            loading="eager"
            imgStyle={{ cursor: 'pointer' }}
            onClick={toggleFullscreen}
          />
        </Box>

        {/* Content */}
        <Container maxW="contentNarrow" layerStyle="sectionTight" px={6}>
          <Box>
            <MotionDiv
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <VStack spacing={{ base: 6, md: 8 }} align="center" textAlign="center">
                {/* Eyebrow → rule → h1 → lead. One block, one component. */}
                <PageHeader
                  eyebrow={categoryLabel}
                  title={titleNoSuffix}
                  lead={photo.description}
                  size="content"
                />

                {/* Keyword chips (display-only) */}
                {photo.keywords.length > 0 && (
                  <Wrap spacing={2} justify="center" maxW="measure">
                    {photo.keywords.map((keyword) => (
                      <WrapItem key={keyword}>
                        <Tag
                          size="sm"
                          variant="subtle"
                          textStyle="metaCaption"
                          bg="brand.surface"
                          px={3}
                          py={1}
                          borderRadius="full"
                          border="1px solid"
                          borderColor="brand.accentBorder"
                        >
                          {keyword}
                        </Tag>
                      </WrapItem>
                    ))}
                  </Wrap>
                )}

                {/* Divider */}
                <Box w="100%" maxW="measure" h="1px" bg="brand.accentBorder" />

                {/* Actions */}
                <Flex gap={3} align="center" wrap="wrap" justify="center">
                  <CTAButton
                    onClick={handleCopyLink}
                    icon={FaRegCopy}
                    variant="ghost"
                    size="sm"
                  >
                    Copy Link
                  </CTAButton>
                  <CTAButton
                    onClick={handleShare}
                    icon={FaShareAlt}
                    variant="ghost"
                    size="sm"
                  >
                    Share
                  </CTAButton>
                </Flex>

                {/* Back to gallery */}
                <CTAButton
                  onClick={() => navigate(`/gallery/${category}`)}
                  variant="ghost"
                  size="sm"
                >
                  ← Back to {categoryLabel}
                </CTAButton>
              </VStack>
            </MotionDiv>
          </Box>
        </Container>

        {/* Related photos */}
        {relatedPhotos.length > 0 && (
          <Box bg="brand.surfaceSunken" layerStyle="sectionTight" px={{ base: 4, md: 8 }}>
            <Container maxW="content" px={0}>
              <VStack spacing={{ base: 8, md: 10 }}>
                {/* Same eyebrow → rule → title arrangement as PageHeader, but
                    the heading here is an h2 at sectionTitle — PageHeader only
                    offers pageTitle/contentTitle, so it can't render this one. */}
                <VStack spacing={{ base: 4, md: 5 }}>
                  <Text textStyle="eyebrow">Related</Text>
                  <Box w="40px" h="1px" bg="brand.accent" />
                  <Text as="h2" textStyle="sectionTitle" m={0}>
                    More like this
                  </Text>
                </VStack>

                <SimpleGrid
                  columns={{ base: 2, md: 3 }}
                  spacing={{ base: 1.5, md: 2 }}
                  w="100%"
                >
                  {relatedPhotos.map((rp) => (
                    <Box
                      as={Link}
                      to={`/photo/${rp.category}/${rp.id}`}
                      key={rp.id}
                      position="relative"
                      overflow="hidden"
                      cursor="pointer"
                      data-group
                      bg="white"
                      sx={{
                        // Scoped hover: only the inner img reacts,
                        // not the surrounding container. Keeps the
                        // spinner/placeholder placement stable while
                        // the hover transform runs on the img.
                        '&:hover > div > img': {
                          transform: 'scale(1.03)',
                          filter: 'brightness(0.85)',
                        },
                      }}
                    >
                      <LoadingImage
                        src={rp.url}
                        alt={rp.alt}
                        w="100%"
                        h={{ base: '220px', md: '300px' }}
                        imgObjectFit="cover"
                        spinnerSize="sm"
                        imgStyle={{
                          transition: 'transform 0.5s ease, filter 0.3s ease',
                        }}
                      />
                      <Box
                        position="absolute"
                        inset={0}
                        bgGradient="linear(to-t, rgba(0,0,0,0.55), rgba(0,0,0,0))"
                        opacity={0}
                        transition="opacity 0.3s ease"
                        _groupHover={{ opacity: 1 }}
                        pointerEvents="none"
                      />
                      <Text
                        position="absolute"
                        bottom={3}
                        left={3}
                        right={3}
                        textStyle="metaCaption"
                        color="white"
                        opacity={0}
                        transform="translateY(5px)"
                        transition="all 0.3s ease"
                        _groupHover={{ opacity: 1, transform: 'translateY(0)' }}
                        pointerEvents="none"
                      >
                        {rp.title.replace(' | Vero Photography', '')}
                      </Text>
                    </Box>
                  ))}
                </SimpleGrid>
              </VStack>
            </Container>
          </Box>
        )}

        {/* Fullscreen inspect modal */}
        <AnimatePresence>
          {isFullscreen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2100,
                background: 'rgba(0,0,0,0.95)',
              }}
            >
              <Box
                ref={scrollContainerRef}
                position="absolute"
                inset={0}
                overflow="hidden"
                zIndex={1}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                cursor={isDragging ? 'grabbing' : 'grab'}
                onClick={(e) => { if (e.target === e.currentTarget && dragDistanceRef.current < 5) toggleFullscreen(); }}
                sx={{ touchAction: 'none' }}
              >
                <Image
                  src={photo.url}
                  alt={photo.alt}
                  position="absolute"
                  top="50%"
                  left="50%"
                  transform={`translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${scale})`}
                  maxW="none"
                  maxH="none"
                  draggable={false}
                  userSelect="none"
                  pointerEvents="none"
                />
              </Box>

              <Flex
                as="button"
                position="absolute"
                top={5}
                right={5}
                zIndex={100}
                onClick={toggleFullscreen}
                align="center"
                justify="center"
                w="40px"
                h="40px"
                borderRadius="full"
                bg="rgba(0,0,0,0.6)"
                backdropFilter="blur(8px)"
                border="1px solid rgba(255,255,255,0.15)"
                color="whiteAlpha.900"
                transition="all 0.3s"
                _hover={{ color: 'white', bg: 'rgba(0,0,0,0.8)' }}
              >
                <CloseIcon boxSize={3} />
              </Flex>

              <Flex
                as="button"
                position="absolute"
                bottom={6}
                left="50%"
                transform="translateX(-50%)"
                zIndex={100}
                onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }}
                align="center"
                justify="center"
                borderRadius="full"
                bg="rgba(0,0,0,0.6)"
                backdropFilter="blur(8px)"
                border="1px solid rgba(255,255,255,0.15)"
                px={5}
                py={2}
              >
                <Text
                  textStyle="ctaLabel"
                  color="whiteAlpha.900"
                  transition="color 0.3s"
                  _hover={{ color: 'white' }}
                >
                  Reset View · {Math.round(scale * 100)}%
                </Text>
              </Flex>
            </motion.div>
          )}
        </AnimatePresence>
      </Box>
      <CopyNotification />
    </>
  );
};

export default IndividualPhoto;
