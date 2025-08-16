import React, { useEffect, useState, useRef } from 'react';
import {
  Box,
  Container,
  Image,
  Text,
  VStack,
  HStack,
  Button,
  useToast,
  Heading,
  Badge,
  Flex,
  useColorModeValue,
  IconButton,
  Slider,
  SliderTrack,
  SliderFilledTrack,
  SliderThumb,
} from '@chakra-ui/react';
import { CopyIcon, ExternalLinkIcon, CloseIcon } from '@chakra-ui/icons';
import { useParams, useNavigate } from 'react-router-dom';
import PageContainer from '../components/PageContainer';

// Import the sampleImages data from Gallery.tsx
import { sampleImages } from './Gallery';

interface Photo {
  id?: string;
  url: string;
  alt: string;
  title: string;
  description: string;
}

const IndividualPhoto: React.FC = () => {
  const { category, photoId } = useParams<{ category: string; photoId: string }>();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scale, setScale] = useState(() => {
    // More zoomed out on mobile for better initial view
    return window.innerWidth < 768 ? 0.3 : 0.5;
  });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [showGuide, setShowGuide] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const toast = useToast();

  const bgColor = useColorModeValue('white', 'gray.800');
  const textColor = useColorModeValue('gray.800', 'white');
  const borderColor = useColorModeValue('gray.200', 'gray.600');

  useEffect(() => {
    if (category && photoId) {
      // Find the photo in the sampleImages data
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
      const currentUrl = window.location.href;
      navigator.clipboard.writeText(currentUrl).then(() => {
        toast({
          title: 'Link copied!',
          description: 'Photo link has been copied to clipboard',
          status: 'success',
          duration: 2000,
          isClosable: true,
        });
      }).catch(() => {
        toast({
          title: 'Copy failed',
          description: 'Please copy the link manually',
          status: 'error',
          duration: 2000,
          isClosable: true,
        });
      });
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
        // Fallback to copy link if sharing fails
        handleCopyLink();
      }
    } else {
      // Fallback to copy link if native sharing is not supported
      handleCopyLink();
    }
  };

  const handleBackToGallery = () => {
    navigate(`/gallery?category=${category}`);
  };

  const toggleFullscreen = () => {
    console.log('toggleFullscreen called, current state:', isFullscreen);
    const newFullscreenState = !isFullscreen;
    setIsFullscreen(newFullscreenState);
    
    if (newFullscreenState) {
      // Start with a more reasonable zoom
      setScale(0.5);
      setPosition({ x: 0, y: 0 });
      
      // Show guide only if user hasn't seen it before
      const hasSeenGuide = localStorage.getItem('vero-photo-guide-seen');
      if (!hasSeenGuide) {
        setShowGuide(true);
      }
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    // Much less sensitive zoom - smaller delta for smoother control
    const delta = e.deltaY > 0 ? 0.95 : 1.05;
    // Allow lower zoom on mobile
    const isMobile = window.innerWidth < 768;
    const minScale = isMobile ? 0.1 : 0.3;
    const newScale = Math.max(minScale, Math.min(1.8, scale * delta));
    
    // Debug logging to see what's happening
    console.log('Zoom attempt:', { currentScale: scale, delta, newScale, clamped: Math.max(0.3, Math.min(2, scale * delta)) });
    
    // Zoom towards mouse position
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const scaleChange = newScale / scale;
    setPosition(prev => ({
      x: mouseX - (mouseX - prev.x) * scaleChange,
      y: mouseY - (mouseY - prev.y) * scaleChange
    }));
    
    setScale(newScale);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      // Single touch - start dragging
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({
        x: touch.clientX - position.x,
        y: touch.clientY - position.y
      });
    } else if (e.touches.length === 2) {
      // Two touches - start pinch gesture
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      // Store initial distance for pinch calculations
      (e.currentTarget as any).initialPinchDistance = distance;
      (e.currentTarget as any).initialScale = scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      // Single touch - continue dragging
      const touch = e.touches[0];
      setPosition({
        x: touch.clientX - dragStart.x,
        y: touch.clientY - dragStart.y
      });
    } else if (e.touches.length === 2) {
      // Two touches - handle pinch to zoom
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const currentDistance = Math.sqrt(
        Math.pow(touch2.clientX - touch1.clientX, 2) +
        Math.pow(touch2.clientY - touch1.clientY, 2)
      );
      
      const initialDistance = (e.currentTarget as any).initialPinchDistance;
      const initialScale = (e.currentTarget as any).initialScale;
      
      if (initialDistance && initialScale) {
        const scaleChange = currentDistance / initialDistance;
        const newScale = Math.max(0.1, Math.min(2, initialScale * scaleChange));
        setScale(newScale);
      }
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsFullscreen(false);
      setScale(0.5);
    }
  };

  useEffect(() => {
    if (isFullscreen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.removeProperty('overflow');
      };
    }
  }, [isFullscreen]);

  // Ensure scale never exceeds our limits
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    const minScale = isMobile ? 0.1 : 0.3; // Allow lower zoom on mobile
    
    if (scale > 1.8) {
      console.log('Scale exceeded limit, clamping to 1.8');
      setScale(1.8);
    } else if (scale < minScale) {
      console.log(`Scale below limit, clamping to ${minScale} (mobile: ${isMobile})`);
      setScale(minScale);
    }
  }, [scale]);

  // Auto-reset scale when fullscreen is first opened
  useEffect(() => {
    if (isFullscreen) {
      // Small delay to ensure everything is rendered
      const timer = setTimeout(() => {
        const isMobile = window.innerWidth < 768;
        const newScale = isMobile ? 0.2 : 0.5;
        console.log('🚀 Auto-reset on fullscreen open:', { isMobile, newScale });
        setScale(newScale);
        setPosition({ x: 0, y: 0 });
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isFullscreen]);

  if (loading) {
    return (
      <PageContainer>
        <Container maxW="container.lg" py={8}>
          <Text>Loading...</Text>
        </Container>
      </PageContainer>
    );
  }

  if (!photo) {
    return (
      <PageContainer>
        <Container maxW="container.lg" py={8}>
          <VStack spacing={6}>
            <Heading size="lg" color={textColor}>Photo not found</Heading>
            <Text color={textColor}>The photo you're looking for doesn't exist.</Text>
            <Button onClick={handleBackToGallery} colorScheme="blue">
              Back to Gallery
            </Button>
          </VStack>
        </Container>
      </PageContainer>
    );
  }

  return (
    <PageContainer py={{ base: 24, md: 24 }}>
      <Container maxW="container.lg">
        <VStack spacing={6} align="stretch">
          {/* Photo */}
          <Box
            borderRadius="lg"
            overflow="hidden"
            boxShadow="xl"
            bg={bgColor}
            border="1px solid"
            borderColor={borderColor}
            cursor="pointer"
            onClick={toggleFullscreen}
            _hover={{ transform: 'scale(1.02)', transition: 'transform 0.2s' }}
          >
            <Image
              src={photo.url}
              alt={photo.alt}
              width="100%"
              height="auto"
              objectFit="cover"
            />
          </Box>

          {/* Photo Info */}
          <VStack spacing={4} align="stretch">
            {/* Title and Category */}
            <VStack spacing={2} align="start">
              <Heading size="lg" color={textColor}>
                {photo.title}
              </Heading>
                              <Badge colorScheme="blue" fontSize="md" px={3} py={1}>
                  {category ? category.charAt(0).toUpperCase() + category.slice(1) : ''}
                </Badge>
            </VStack>

            {/* Description */}
            <Box>
              <Text fontSize="lg" color={textColor} lineHeight="tall">
                {photo.description}
              </Text>
            </Box>

            {/* Share Section */}
            <Box
              pt={8}
              borderTop="1px solid"
              borderColor={borderColor}
            >
              <VStack spacing={6} align="stretch">
                {/* URL Display - Stylized */}
                <Box
                  position="relative"
                  bg={useColorModeValue('gray.50', 'gray.700')}
                  borderRadius="xl"
                  p={4}
                  border="1px solid"
                  borderColor={useColorModeValue('gray.200', 'gray.600')}
                  _before={{
                    content: '""',
                    position: 'absolute',
                    top: '-1px',
                    left: '-1px',
                    right: '-1px',
                    bottom: '-1px',
                    borderRadius: 'xl',
                    background: 'linear-gradient(45deg, #3182ce, #63b3ed, #90cdf4)',
                    zIndex: -1,
                    opacity: 0.3,
                  }}
                >
                  <Text 
                    fontSize="xs" 
                    fontWeight="medium" 
                    color={useColorModeValue('gray.600', 'gray.300')}
                    mb={2}
                    textTransform="uppercase"
                    letterSpacing="wide"
                  >
                    Photo Link
                  </Text>
                  <Text 
                    fontSize="sm" 
                    color={textColor} 
                    fontFamily="mono" 
                    wordBreak="break-all"
                    bg={bgColor}
                    p={3}
                    borderRadius="md"
                    border="1px solid"
                    borderColor={useColorModeValue('gray.200', 'gray.600')}
                  >
                    {window.location.href}
                  </Text>
                </Box>

                {/* Action Buttons - Stylized */}
                <HStack spacing={4} justify="center">
                  <Button
                    leftIcon={<CopyIcon />}
                    onClick={handleCopyLink}
                    variant="outline"
                    size="md"
                    fontSize="sm"
                    colorScheme="blue"
                    borderRadius="full"
                    px={6}
                    _hover={{ 
                      transform: 'translateY(-2px)',
                      boxShadow: 'lg',
                      bg: 'blue.50'
                    }}
                    transition="all 0.2s"
                  >
                    Copy Link
                  </Button>
                  <Button
                    leftIcon={<ExternalLinkIcon />}
                    onClick={handleShare}
                    variant="solid"
                    size="md"
                    fontSize="sm"
                    colorScheme="blue"
                    borderRadius="full"
                    px={6}
                    _hover={{ 
                      transform: 'translateY(-2px)',
                      boxShadow: 'lg'
                    }}
                    transition="all 0.2s"
                  >
                    Share
                  </Button>
                </HStack>

                {/* Back to Gallery - Stylized */}
                <Flex justify="center">
                  <Button 
                    onClick={handleBackToGallery} 
                    variant="ghost"
                    size="md"
                    fontSize="sm"
                    color={textColor}
                    borderRadius="full"
                    px={6}
                    _hover={{ 
                      bg: useColorModeValue('gray.100', 'gray.600'),
                      transform: 'translateY(-1px)'
                    }}
                    transition="all 0.2s"
                  >
                    ← Back to Gallery
                  </Button>
                </Flex>
              </VStack>
            </Box>
          </VStack>
        </VStack>
      </Container>

      {/* Fullscreen Modal */}
      {isFullscreen && (
        <Box
          position="fixed"
          inset="0"
          zIndex={1000}
          bg="white"
        >
          {/* Zoom Slider - Hidden on Mobile */}
          <Box
            position="fixed"
            right={4}
            top="50%"
            transform="translateY(-50%)"
            zIndex={9999}
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="lg"
            p={3}
            boxShadow="md"
            display={{ base: 'none', md: 'block' }}
          >
            <VStack spacing={2}>
              <Text fontSize="xs" fontWeight="medium" color="gray.600" textAlign="center">
                Zoom
              </Text>
              <Slider
                orientation="vertical"
                min={0.1}
                max={1.8}
                step={0.05}
                value={scale}
                onChange={(value) => setScale(value)}
                minH="160px"
                maxW="40px"
              >
                <SliderTrack>
                  <SliderFilledTrack bg="blue.400" />
                </SliderTrack>
                <SliderThumb boxSize={4} bg="blue.500" />
              </Slider>
              <Text fontSize="xs" color="gray.500" textAlign="center">
                {Math.round(scale * 100)}%
              </Text>
            </VStack>
          </Box>

          {/* Close Button */}
          <IconButton
            aria-label="Close fullscreen"
            icon={<CloseIcon />}
            onClick={(e) => {
              e.stopPropagation();
              console.log('Close button clicked');
              toggleFullscreen();
            }}
            position="fixed"
            top={20}
            right={4}
            zIndex={9999}
            variant="ghost"
            color="black"
            size="lg"
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            _hover={{ bg: 'gray.50' }}
          />

          {/* Background Click Area */}
          <Box
            position="absolute"
            inset="0"
            onClick={toggleFullscreen}
            zIndex={1400}
            pointerEvents="auto"
          />

          {/* Image Container */}
          <Box
            ref={scrollContainerRef}
            position="absolute"
            inset="0"
            overflow="hidden"
            zIndex={1401}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            sx={{
              WebkitOverflowScrolling: 'touch',
              touchAction: 'manipulation',
            }}
            pointerEvents="auto"
          >
            <Image
              src={photo.url}
              alt={photo.alt}
              position="absolute"
              top="50%"
              left="50%"
              transform={`translate(-50%, -50%) scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`}
              maxW="none"
              maxH="none"
              width="auto"
              height="auto"
              objectFit="contain"
              draggable={false}
              style={{
                cursor: isDragging ? 'grabbing' : 'grab',
                userSelect: 'none',
              }}
              onClick={(e) => e.stopPropagation()}
            />
          </Box>



          {/* Reset Button */}
          <Button
            size="sm"
            variant="ghost"
            color="gray.700"
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="lg"
            px={4}
            py={2}
            _hover={{ bg: 'gray.50' }}
            onClick={() => {
              // Reset to mobile-appropriate scale
              const isMobile = window.innerWidth < 768;
              setScale(isMobile ? 0.2 : 0.5);
              setPosition({ x: 0, y: 0 });
            }}
            position="fixed"
            bottom={4}
            left="50%"
            transform="translateX(-50%)"
            zIndex={9999}
          >
            Reset View
          </Button>

          {/* Helpful Guide */}
          {showGuide && (
            <Box
              position="fixed"
              bottom={24}
              left="50%"
              transform="translateX(-50%)"
              zIndex={9999}
              bg="white"
              color="gray.800"
              px={5}
              py={4}
              borderRadius="xl"
              maxW="320px"
              textAlign="center"
              boxShadow="2xl"
              border="1px solid"
              borderColor="gray.200"
            >
              <VStack spacing={3}>
                <Text fontSize="sm" fontWeight="semibold" color="gray.700">
                  Navigation Tips
                </Text>
                <VStack spacing={1.5} fontSize="xs" color="gray.600">
                  <Text><strong>Trackpad:</strong> Pinch/spread to zoom, drag to pan</Text>
                  <Text><strong>Mouse:</strong> Scroll to zoom, drag to move</Text>
                  <Text><strong>Touch:</strong> Pinch to zoom, drag to pan</Text>
                </VStack>
                <Button
                  size="sm"
                  variant="solid"
                  colorScheme="blue"
                  borderRadius="full"
                  px={6}
                  py={2}
                  fontSize="sm"
                  fontWeight="medium"
                  _hover={{ transform: 'translateY(-1px)', boxShadow: 'md' }}
                  transition="all 0.2s"
                  onClick={() => {
                    setShowGuide(false);
                    localStorage.setItem('vero-photo-guide-seen', 'true');
                  }}
                >
                  Got it!
                </Button>
              </VStack>
            </Box>
          )}
        </Box>
      )}
    </PageContainer>
  );
};

export default IndividualPhoto;
