import React, { useEffect, useState, useRef } from 'react';
import {
  Box,
  Container,
  Image,
  Text,
  VStack,
  Flex,
} from '@chakra-ui/react';
import { CopyIcon, ExternalLinkIcon, CloseIcon } from '@chakra-ui/icons';
import { useCopyNotification } from '../components/CopyNotification';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';

// Import the sampleImages data from Gallery.tsx
import { sampleImages } from './Gallery';

interface Photo {
  id?: string;
  url: string;
  alt: string;
  title: string;
  description: string;
}

const MotionDiv = motion.div;

const IndividualPhoto: React.FC = () => {
  const { category, photoId } = useParams<{ category: string; photoId: string }>();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
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

  // Wheel handler is attached via useEffect with { passive: false }
  // so that preventDefault actually blocks browser zoom
  useEffect(() => {
    if (!isFullscreen) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      setScale((prev) => Math.max(0.5, Math.min(3, prev * delta)));
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

  // Touch handling for mobile: single-finger pan + two-finger pinch-to-zoom
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDistRef = useRef<number | null>(null);
  const touchDragDistRef = useRef(0);

  const getTouchDist = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchDragDistRef.current = 0;
    if (e.touches.length === 1) {
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastPinchDistRef.current = null;
    } else if (e.touches.length === 2) {
      lastTouchRef.current = null;
      lastPinchDistRef.current = getTouchDist(e.touches[0], e.touches[1]);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && lastTouchRef.current) {
      const dx = e.touches[0].clientX - lastTouchRef.current.x;
      const dy = e.touches[0].clientY - lastTouchRef.current.y;
      touchDragDistRef.current += Math.abs(dx) + Math.abs(dy);
      setPosition((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && lastPinchDistRef.current !== null) {
      const newDist = getTouchDist(e.touches[0], e.touches[1]);
      const ratio = newDist / lastPinchDistRef.current;
      setScale((prev) => Math.max(0.5, Math.min(3, prev * ratio)));
      lastPinchDistRef.current = newDist;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      // If barely moved, treat as tap to close
      if (touchDragDistRef.current < 10 && lastPinchDistRef.current === null) {
        toggleFullscreen();
      }
      lastTouchRef.current = null;
      lastPinchDistRef.current = null;
    } else if (e.touches.length === 1) {
      // Went from pinch to single finger — start panning
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastPinchDistRef.current = null;
    }
  };

  useEffect(() => {
    if (category && photoId) {
      const categoryImages = sampleImages[category as keyof typeof sampleImages];
      if (categoryImages) {
        const foundPhoto = categoryImages.find((img: any) => img.id === photoId);
        if (foundPhoto) {
          setPhoto(foundPhoto);
        }
      }
      setLoading(false);
    }
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
        <Text color="gray.500" fontWeight="300">Loading...</Text>
      </Flex>
    );
  }

  if (!photo) {
    return (
      <Box minH="100vh" bg="white">
        <Flex minH="100vh" align="center" justify="center" direction="column" gap={6}>
          <Text fontSize="xl" fontWeight="200" color="gray.700">Photo not found</Text>
          <Text
            as={Link as any}
            to={`/gallery/${category}`}
            fontSize="xs"
            fontWeight="400"
            textTransform="uppercase"
            letterSpacing="0.2em"
            color="#c9a96e"
            _hover={{ color: 'gray.700' }}
            transition="color 0.3s"
          >
            Back to Gallery
          </Text>
        </Flex>
      </Box>
    );
  }

  const categoryLabel = category ? category.charAt(0).toUpperCase() + category.slice(1) : '';

  return (
    <>
      <Helmet>
        <title>{photo.title}</title>
        <meta name="description" content={photo.description} />
        <meta property="og:title" content={photo.title} />
        <meta property="og:description" content={photo.description} />
        <meta property="og:image" content={`https://vero.photography${photo.url}`} />
        <meta property="og:url" content={window.location.href} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={photo.title} />
        <meta name="twitter:description" content={photo.description} />
        <meta name="twitter:image" content={`https://vero.photography${photo.url}`} />
        <link rel="canonical" href={window.location.href} />
      </Helmet>

      <Box minH="100vh" bg="white" pt="72px">
        {/* Hero image — full width */}
        <Box position="relative" w="100%" bg="white">
          <Image
            src={photo.url}
            alt={photo.alt}
            w="100%"
            maxH="80vh"
            objectFit="contain"
            cursor="pointer"
            onClick={toggleFullscreen}
            _hover={{ opacity: 0.95 }}
            transition="opacity 0.2s"
          />
        </Box>

        {/* Content */}
        <Container maxW="container.md" py={{ base: 12, md: 16 }} px={6}>
          <Box>
            <MotionDiv
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <VStack spacing={8} align="center" textAlign="center">
                {/* Category label */}
                <Text
                  fontSize="xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.2em"
                  color="#c9a96e"
                >
                  {categoryLabel}
                </Text>
                <Box w="35px" h="1px" bg="#c9a96e" />

                {/* Title */}
                <Text
                  fontSize={{ base: 'xl', md: '2xl' }}
                  fontWeight="200"
                  color="gray.800"
                  lineHeight="1.5"
                >
                  {photo.title.replace(' | Vero Photography', '')}
                </Text>

                {/* Description */}
                <Text
                  fontSize="sm"
                  color="gray.500"
                  lineHeight="2"
                  fontWeight="300"
                  maxW="500px"
                >
                  {photo.description}
                </Text>

                {/* Divider */}
                <Box w="100%" maxW="400px" h="1px" bg="gray.200" />

                {/* Actions */}
                <Flex gap={8} align="center">
                  <Flex
                    as="button"
                    align="center"
                    gap={2}
                    onClick={handleCopyLink}
                    color="gray.400"
                    transition="color 0.3s"
                    _hover={{ color: '#c9a96e' }}
                    sx={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <CopyIcon boxSize={3.5} />
                    <Text fontSize="xs" fontWeight="400" textTransform="uppercase" letterSpacing="0.15em">
                      Copy Link
                    </Text>
                  </Flex>
                  <Flex
                    as="button"
                    align="center"
                    gap={2}
                    onClick={handleShare}
                    color="gray.400"
                    transition="color 0.3s"
                    _hover={{ color: '#c9a96e' }}
                    sx={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    <ExternalLinkIcon boxSize={3.5} />
                    <Text fontSize="xs" fontWeight="400" textTransform="uppercase" letterSpacing="0.15em">
                      Share
                    </Text>
                  </Flex>
                </Flex>

                {/* Back to gallery */}
                <Text
                  as="button"
                  onClick={() => navigate(`/gallery/${category}`)}
                  fontSize="xs"
                  fontWeight="400"
                  textTransform="uppercase"
                  letterSpacing="0.2em"
                  color="gray.400"
                  transition="color 0.3s"
                  _hover={{ color: '#c9a96e' }}
                  mt={4}
                >
                  ← Back to {categoryLabel}
                </Text>
              </VStack>
            </MotionDiv>
          </Box>
        </Container>

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
              {/* Zoomable image container — lowest layer */}
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

              {/* UI layer — always on top of image, never affected by zoom */}
              {/* Close button */}
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

              {/* Reset button */}
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
                  fontSize="xs"
                  color="whiteAlpha.900"
                  letterSpacing="0.15em"
                  textTransform="uppercase"
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
