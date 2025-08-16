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
        // If user cancels share, don't show any error
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        // For other errors, try to copy link but don't show error if it fails
        try {
          await navigator.clipboard.writeText(window.location.href);
          toast({
            title: 'Link copied!',
            description: 'Photo link has been copied to clipboard',
            status: 'success',
            duration: 2000,
            isClosable: true,
          });
        } catch (copyError) {
          // Silently fail if copy also fails
          console.log('Share and copy both failed:', error, copyError);
        }
      }
    } else {
      // If native sharing is not supported, try to copy link
      try {
        await navigator.clipboard.writeText(window.location.href);
        toast({
          title: 'Link copied!',
          description: 'Photo link has been copied to clipboard',
          status: 'success',
          duration: 2000,
          isClosable: true,
        });
      } catch (copyError) {
        // Only show error if copy fails and we're not in a share context
        toast({
          title: 'Share not available',
          description: 'Please copy the link manually',
          status: 'info',
          duration: 2000,
          isClosable: true,
        });
      }
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



  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsFullscreen(false);
      setScale(0.5);
    }
  };

  useEffect(() => {
    if (isFullscreen) {
      window.addEventListener('keydown', handleKeyDown);
      
      // Add CSS rules to completely prevent scrolling
      const style = document.createElement('style');
      style.id = 'fullscreen-scroll-prevention';
      style.textContent = `
        body.fullscreen-open, html.fullscreen-open {
          overflow: hidden !important;
          position: fixed !important;
          width: 100% !important;
          height: 100% !important;
          top: 0 !important;
          left: 0 !important;
          touch-action: none !important;
          -webkit-overflow-scrolling: auto !important;
        }
        body.fullscreen-open *, html.fullscreen-open * {
          overflow: hidden !important;
        }
      `;
      document.head.appendChild(style);
      
      // Add CSS class for additional prevention
      document.body.classList.add('fullscreen-open');
      document.documentElement.classList.add('fullscreen-open');
      
      // Set up proper touch event listeners to avoid passive event listener issues
      const container = scrollContainerRef.current;
      if (container) {
        const touchStartHandler = (e: TouchEvent) => {
          if (e.touches.length === 1) {
            const touch = e.touches[0];
            setIsDragging(true);
            setDragStart({
              x: touch.clientX - position.x,
              y: touch.clientY - position.y
            });
          } else if (e.touches.length === 2) {
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const distance = Math.sqrt(
              Math.pow(touch2.clientX - touch1.clientX, 2) +
              Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            (container as any).initialPinchDistance = distance;
            (container as any).initialScale = scale;
          }
        };
        
        const touchMoveHandler = (e: TouchEvent) => {
          if (e.touches.length === 1 && isDragging) {
            const touch = e.touches[0];
            setPosition({
              x: touch.clientX - dragStart.x,
              y: touch.clientY - dragStart.y
            });
          } else if (e.touches.length === 2) {
            e.preventDefault(); // This will work now since we're using addEventListener
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const currentDistance = Math.sqrt(
              Math.pow(touch2.clientX - touch1.clientX, 2) +
              Math.pow(touch2.clientY - touch1.clientY, 2)
            );
            
            const initialDistance = (container as any).initialPinchDistance;
            const initialScale = (container as any).initialScale;
            
            if (initialDistance && initialScale) {
              const scaleChange = currentDistance / initialDistance;
              const newScale = Math.max(0.1, Math.min(2, initialScale * scaleChange));
              setScale(newScale);
            }
          }
        };
        
        const touchEndHandler = () => {
          setIsDragging(false);
        };
        
        // Add event listeners with proper options
        container.addEventListener('touchstart', touchStartHandler, { passive: false });
        container.addEventListener('touchmove', touchMoveHandler, { passive: false });
        container.addEventListener('touchend', touchEndHandler, { passive: false });
        
        return () => {
          container.removeEventListener('touchstart', touchStartHandler);
          container.removeEventListener('touchmove', touchMoveHandler);
          container.removeEventListener('touchend', touchEndHandler);
        };
      }
      
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        
        // Remove CSS rules
        const existingStyle = document.getElementById('fullscreen-scroll-prevention');
        if (existingStyle) {
          existingStyle.remove();
        }
        
        // Remove CSS classes
        document.body.classList.remove('fullscreen-open');
        document.documentElement.classList.remove('fullscreen-open');
      };
    }
  }, [isFullscreen, position, scale, isDragging, dragStart]);

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
    <PageContainer 
      py={{ base: 24, md: 24 }}
      style={{ 
        overflow: isFullscreen ? 'hidden' : 'auto',
        height: isFullscreen ? '100vh' : 'auto'
      }}
    >
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
            role="group"
          >
            <Box position="relative">
              <Image
                src={photo.url}
                alt={photo.alt}
                width="100%"
                height="auto"
                objectFit="cover"
              />
              
              {/* Clickable Indicator Overlay */}
              <Box
                position="absolute"
                top="50%"
                left="50%"
                transform="translate(-50%, -50%)"
                bg="rgba(0, 0, 0, 0.7)"
                color="white"
                px={4}
                py={2}
                borderRadius="full"
                fontSize="sm"
                fontWeight="medium"
                opacity="0"
                _groupHover={{ opacity: 1 }}
                transition="opacity 0.2s"
                pointerEvents="none"
                zIndex={1}
              >
                <HStack spacing={2} align="center">
                  <Text>Click to view fullscreen</Text>
                  <Box fontSize="lg">↗</Box>
                </HStack>
              </Box>
              
              {/* Always Visible Corner Hint */}
              <Box
                position="absolute"
                top={3}
                right={3}
                bg="rgba(0, 0, 0, 0.6)"
                color="white"
                borderRadius="full"
                p={2}
                fontSize="lg"
                pointerEvents="none"
                zIndex={1}
              >
                ↗
              </Box>
            </Box>
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
          style={{
            overflow: 'hidden',
            touchAction: 'none',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {/* Zoom Slider - Left side on mobile, right side on desktop */}
          <Box
            position="fixed"
            left={{ base: 4, md: "auto" }}
            right={{ base: "auto", md: 4 }}
            top={{ base: 20, md: "50%" }}
            transform={{ base: "none", md: "translateY(-50%)" }}
            zIndex={9999}
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="lg"
            p={3}
            boxShadow="md"
          >
            <VStack spacing={2}>
              
              {/* Mobile Horizontal Slider */}
              <Box display={{ base: "block", md: "none" }}>
                <HStack spacing={3} align="center">
                  <Text fontSize="xs" fontWeight="medium" color="gray.600">
                    Zoom
                  </Text>
                  <Slider
                    orientation="horizontal"
                    min={0.1}
                    max={1.8}
                    step={0.05}
                    value={scale}
                    onChange={(value) => setScale(value)}
                    maxW="160px"
                    minW="160px"
                  >
                    <SliderTrack>
                      <SliderFilledTrack bg="blue.400" />
                    </SliderTrack>
                    <SliderThumb boxSize={3} bg="blue.500" />
                  </Slider>
                  <Text fontSize="xs" color="gray.500" minW="30px" textAlign="right">
                    {Math.round(scale * 100)}%
                  </Text>
                </HStack>
              </Box>
              
              {/* Desktop Vertical Slider */}
              <Box display={{ base: "none", md: "block" }}>
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
              </Box>
              
              {/* Percentage shown inline with mobile slider, below desktop slider */}
              <Box display={{ base: "none", md: "block" }}>
                <Text fontSize="xs" color="gray.500" textAlign="center">
                  {Math.round(scale * 100)}%
                </Text>
              </Box>
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

            sx={{
              WebkitOverflowScrolling: 'touch',
              touchAction: 'none',
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
            bottom={12}
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
