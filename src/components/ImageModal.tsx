import {
  Image,
  Box,
  IconButton,
  Text,
  useColorModeValue,
  Flex,
  useBreakpointValue,
  useToast,
} from '@chakra-ui/react';
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon, MinusIcon, AddIcon, ExternalLinkIcon, ViewIcon } from '@chakra-ui/icons';
import { useState, useEffect, useRef } from 'react';
import React from 'react';

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageAlt?: string;
  onNext?: () => void;
  onPrevious?: () => void;
  currentIndex?: number;
  totalImages?: number;
  photoData?: {
    id?: string;
    url: string;
    alt: string;
    title: string;
    description: string;
  };
  category?: string;
}

const ImageModal = ({ 
  isOpen, 
  onClose, 
  imageUrl, 
  imageAlt = 'Gallery image', 
  onNext, 
  onPrevious,
  currentIndex,
  totalImages,
  photoData,
  category
}: ImageModalProps) => {
  const [scale, setScale] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0 });
  const [touchEnd, setTouchEnd] = useState({ x: 0, y: 0 });
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Function to reapply scrolling prevention styles
  const reapplyScrollingPrevention = () => {
    if (isOpen) {
      // Reapply all the important styles to prevent scrolling
      document.body.style.setProperty('overflow', 'hidden', 'important');
      document.body.style.setProperty('position', 'fixed', 'important');
      document.body.style.setProperty('width', '100%', 'important');
      document.body.style.setProperty('height', '100%', 'important');
      document.body.style.setProperty('top', '0', 'important');
      document.body.style.setProperty('left', '0', 'important');
      
      document.documentElement.style.setProperty('overflow', 'hidden', 'important');
      document.documentElement.style.setProperty('position', 'fixed', 'important');
      document.documentElement.style.setProperty('width', '100%', 'important');
      document.documentElement.style.setProperty('height', '100%', 'important');
      document.documentElement.style.setProperty('top', '0', 'important');
      document.documentElement.style.setProperty('left', '0', 'important');
    }
  };

  const toggleZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    const newZoomState = !isZoomed;
    setIsZoomed(newZoomState);
    setScale(newZoomState ? 1.5 : 1);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && onPrevious) onPrevious();
    if (e.key === 'ArrowRight' && onNext) onNext();
    if (e.key === 'Escape') onClose();
  };

  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setIsZoomed(false);
      window.addEventListener('keydown', handleKeyDown);

      // Add CSS class and set styles directly to prevent scrolling
      document.body.classList.add('fullscreen-open');
      document.documentElement.classList.add('fullscreen-open');
      
      // Set styles directly on body and html elements
      document.body.style.setProperty('overflow', 'hidden', 'important');
      document.body.style.setProperty('position', 'fixed', 'important');
      document.body.style.setProperty('width', '100%', 'important');
      document.body.style.setProperty('height', '100%', 'important');
      document.body.style.setProperty('top', '0', 'important');
      document.body.style.setProperty('left', '0', 'important');
      
      document.documentElement.style.setProperty('overflow', 'hidden', 'important');
      document.documentElement.style.setProperty('position', 'fixed', 'important');
      document.documentElement.style.setProperty('width', '100%', 'important');
      document.documentElement.style.setProperty('height', '100%', 'important');
      document.documentElement.style.setProperty('top', '0', 'important');
      document.documentElement.style.setProperty('left', '0', 'important');

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        
        // Remove CSS classes
        document.body.classList.remove('fullscreen-open');
        document.documentElement.classList.remove('fullscreen-open');
        
        // Remove all the important styles we set
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('position');
        document.body.style.removeProperty('width');
        document.body.style.removeProperty('height');
        document.body.style.removeProperty('top');
        document.body.style.removeProperty('left');
        
        document.documentElement.style.removeProperty('overflow');
        document.documentElement.style.removeProperty('position');
        document.documentElement.style.removeProperty('width');
        document.documentElement.style.removeProperty('height');
        document.documentElement.style.removeProperty('top');
        document.documentElement.style.removeProperty('left');
        
        // Force restore scrolling by explicitly setting overflow back to auto
        document.body.style.overflow = 'auto';
        document.body.style.position = 'static';
        document.body.style.width = 'auto';
        document.body.style.height = 'auto';
        document.documentElement.style.overflow = 'auto';
        document.documentElement.style.position = 'static';
        document.documentElement.style.width = 'auto';
        document.documentElement.style.height = 'auto';
      };
    }
  }, [isOpen, imageUrl]);

  // Cleanup effect when component unmounts
  useEffect(() => {
    return () => {
      // Ensure all fullscreen styles are cleaned up when component unmounts
      document.body.classList.remove('fullscreen-open');
      document.documentElement.classList.remove('fullscreen-open');
      
      // Remove all the important styles we set
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('width');
      document.body.style.removeProperty('height');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('left');
      
      document.documentElement.style.removeProperty('overflow');
      document.documentElement.style.removeProperty('position');
      document.documentElement.style.removeProperty('width');
      document.documentElement.style.removeProperty('height');
      document.documentElement.style.removeProperty('top');
      document.documentElement.style.removeProperty('left');
      
      // Force restore scrolling
      document.body.style.overflow = 'auto';
      document.body.style.position = 'static';
      document.body.style.width = 'auto';
      document.body.style.height = 'auto';
      document.documentElement.style.overflow = 'auto';
      document.documentElement.style.position = 'static';
      document.documentElement.style.width = 'auto';
      document.documentElement.style.height = 'auto';
    };
  }, []);

  // Effect to maintain scrolling prevention when navigating between images
  useEffect(() => {
    if (isOpen) {
      // Ensure scrolling prevention is maintained when image changes
      reapplyScrollingPrevention();
    }
  }, [imageUrl, isOpen, reapplyScrollingPrevention]);

  useEffect(() => {
    if (isZoomed && scrollContainerRef.current) {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          const container = scrollContainerRef.current;
          const targetScrollLeft = (container.scrollWidth - container.clientWidth) / 2;
          container.scrollLeft = targetScrollLeft;
          const targetScrollTop = (container.scrollHeight - container.clientHeight) / 2;
          container.scrollTop = targetScrollTop;
        }
      });
    } else if (!isZoomed && scrollContainerRef.current) {
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollLeft = 0;
          scrollContainerRef.current.scrollTop = 0;
        }
      });
    }
  }, [isZoomed]);

  const bgColor = useColorModeValue('white', 'gray.800');
  const overlayBg = useColorModeValue('rgba(0,0,0,0.6)', 'rgba(0,0,0,0.9)');
  const toast = useToast();

  const handleShare = () => {
    if (photoData && category) {
      const shareUrl = `/photo/${category}/${photoData.id}`;
      const fullUrl = `${window.location.origin}${shareUrl}`;
      
      if (navigator.share) {
        navigator.share({
          title: 'Vero Photography',
          text: 'Check out this beautiful photo from Vero Photography',
          url: fullUrl,
        });
      } else {
        // Copy to clipboard
        navigator.clipboard.writeText(fullUrl).then(() => {
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
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only handle touch gestures on mobile devices
    if (window.innerWidth >= 768) return;
    
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    // Only handle touch gestures on mobile devices
    if (window.innerWidth >= 768) return;
    
    const touch = e.touches[0];
    setTouchEnd({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = () => {
    // Only handle touch gestures on mobile devices
    if (window.innerWidth >= 768) return;
    
    if (!touchStart.x || !touchEnd.x) return;
    
    const distance = touchStart.x - touchEnd.x;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    
    if (isLeftSwipe && onNext) {
      onNext();
      // Reapply scrolling prevention after navigation
      setTimeout(() => reapplyScrollingPrevention(), 0);
    } else if (isRightSwipe && onPrevious) {
      onPrevious();
      // Reapply scrolling prevention after navigation
      setTimeout(() => reapplyScrollingPrevention(), 0);
    }
    
    // Reset touch positions
    setTouchStart({ x: 0, y: 0 });
    setTouchEnd({ x: 0, y: 0 });
  };



  // Define padding based on breakpoint and zoom state
  const paddingTop = useBreakpointValue({
    base: isZoomed ? "0px" : "0px", // Mobile zoomed/default
    md: isZoomed ? "80px" : "100px",   // Desktop zoomed/default
  });
  const paddingBottom = useBreakpointValue({
    base: isZoomed ? "120px" : "0px", // Mobile zoomed/default
    md: isZoomed ? "350px" : "20px",   // Desktop zoomed/default
  });
  const paddingLeft = useBreakpointValue({
    base: isZoomed ? "225px" : 0,    // Mobile zoomed/default
    md: isZoomed ? "100px" : 0,      // Desktop zoomed/default (symmetrical w/ right)
  });
   const paddingRight = useBreakpointValue({
    base: isZoomed ? "100px" : 0,    // Mobile zoomed/default
    md: isZoomed ? "100px" : 0,      // Desktop zoomed/default (symmetrical w/ left)
  });

  if (!isOpen) return null;

  return (
    <React.Fragment>
      <Box 
        key="modal-wrapper-static"
        position="fixed"
        inset="0"
        zIndex={1300}
      >
        <Box
          position="absolute"
          inset="0"
          bg={overlayBg}
          onClick={onClose}
          zIndex={1350}
        />

        <Box
          position="absolute"
          inset="0"
          display="flex"
          alignItems="center"
          justifyContent="center"
          pointerEvents="none"
          zIndex={1400}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <Box 
            position="absolute"
            inset="0"
            bg={bgColor} 
          />

          <Flex
            position="absolute"
            top="80px"
            left={0}
            right={0}
            px={4}
            justifyContent="space-between"
            alignItems="center"
            zIndex={1450}
            pointerEvents="auto"
          >
            <Box
              bg="white"
              border="1px solid"
              borderColor="gray.200"
              borderRadius="lg"
              px={3}
              py={2}
            >
              {currentIndex !== undefined && totalImages !== undefined && (
                <Text fontSize="lg" fontWeight="medium" color="black" userSelect="none">
                  {currentIndex + 1} / {totalImages}
                </Text>
              )}
            </Box>
                        <Flex gap={2}>
              {photoData && (
                <>
                  <IconButton
                    aria-label="Share photo"
                    icon={<ExternalLinkIcon />}
                    onClick={handleShare}
                    variant="ghost"
                    color="black"
                    size="lg"
                    bg="white"
                    border="1px solid"
                    borderColor="gray.200"
                    _hover={{ bg: 'gray.50' }}
                    userSelect="none"
                    sx={{ WebkitTapHighlightColor: 'transparent' }}
                  />
                  <IconButton
                    aria-label="Open in new tab"
                    icon={<ViewIcon />}
                    onClick={() => {
                      if (photoData && category) {
                        const shareUrl = `/photo/${category}/${photoData.id}`;
                        const fullUrl = `${window.location.origin}${shareUrl}`;
                        window.open(fullUrl, '_blank');
                      }
                    }}
                    variant="ghost"
                    color="black"
                    size="lg"
                    bg="white"
                    border="1px solid"
                    borderColor="gray.200"
                    _hover={{ bg: 'gray.50' }}
                    userSelect="none"
                    sx={{ WebkitTapHighlightColor: 'transparent' }}
                  />
                </>
              )}
              <IconButton
                aria-label="Toggle zoom"
                icon={isZoomed ? <MinusIcon /> : <AddIcon />}
                onClick={toggleZoom}
                variant="ghost"
                color="black"
                size="lg"
                bg="white"
                border="1px solid"
                borderColor="gray.200"
                _hover={{ bg: 'gray.50' }}
                userSelect="none"
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              />
              <IconButton
                aria-label="Close modal"
                icon={<CloseIcon />}
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                variant="ghost"
                color="black"
                size="lg"
                bg="white"
                border="1px solid"
                borderColor="gray.200"
                _hover={{ bg: 'gray.50' }}
                userSelect="none"
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              />
            </Flex>
          </Flex>

          {onPrevious && (
            <IconButton
              aria-label="Previous image"
              icon={<ChevronLeftIcon boxSize={8} />}
              onClick={(e) => { 
                e.stopPropagation(); 
                onPrevious(); 
                // Reapply scrolling prevention after navigation
                setTimeout(() => reapplyScrollingPrevention(), 0);
              }}
              variant="ghost"
              color="black"
              size="lg"
              bg="white"
              border="1px solid"
              borderColor="gray.200"
              _hover={{ bg: 'gray.50' }}
              position="absolute"
              left={4}
              top="50%"
              transform="translateY(-50%)"
              zIndex={1450}
              pointerEvents="auto"
              userSelect="none"
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            />
          )}

          {onNext && (
            <IconButton
              aria-label="Next image"
              icon={<ChevronRightIcon boxSize={8} />}
              onClick={(e) => { 
                e.stopPropagation(); 
                onNext(); 
                // Reapply scrolling prevention after navigation
                setTimeout(() => reapplyScrollingPrevention(), 0);
              }}
              variant="ghost"
              color="black"
              size="lg"
              bg="white"
              border="1px solid"
              borderColor="gray.200"
              _hover={{ bg: 'gray.50' }}
              position="absolute"
              right={4}
              top="50%"
              transform="translateY(-50%)"
              zIndex={1450}
              pointerEvents="auto"
              userSelect="none"
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            />
          )}

          <Box
            ref={scrollContainerRef}
            width="100%"
            height="100%"
            display="flex"
            alignItems="center"
            justifyContent="center"
            overflow="scroll"
            zIndex={1400}
            paddingTop={paddingTop}
            paddingBottom={paddingBottom}
            paddingLeft={paddingLeft}
            paddingRight={paddingRight}
            sx={{
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-x pan-y',
            }}
          >
            <Image
              key={imageUrl}
              src={imageUrl}
              alt={imageAlt}
              bg={bgColor} 
              maxH="calc(100vh - 160px)" 
              maxW="calc(100vw - 80px)"
              objectFit="contain"
              loading="lazy"
              draggable={false}
              pointerEvents="auto" 
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              style={{ 
                transformOrigin: 'top center',
                transform: `scale(${scale})`,
                margin: isZoomed ? 'auto' : undefined 
              }}
            />
          </Box>
        </Box>
      </Box>
    </React.Fragment>
  );
};

export default ImageModal; 