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
  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

      document.body.style.overflow = 'hidden';

      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        document.body.style.removeProperty('overflow');
      };
    }
  }, [isOpen]);

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
  const controlColor = useColorModeValue('gray.600', 'whiteAlpha.700');
  const controlHoverBg = useColorModeValue('gray.100', 'whiteAlpha.200');
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
            <Box>
              {currentIndex !== undefined && totalImages !== undefined && (
                <Text fontSize="lg" fontWeight="medium" color={controlColor} userSelect="none">
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
                    color={controlColor}
                    size="lg"
                    _hover={{ bg: controlHoverBg }}
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
                    color={controlColor}
                    size="lg"
                    _hover={{ bg: controlHoverBg }}
                  />
                </>
              )}
              <IconButton
                aria-label="Toggle zoom"
                icon={isZoomed ? <MinusIcon /> : <AddIcon />}
                onClick={toggleZoom}
                variant="ghost"
                color={controlColor}
                size="lg"
                _hover={{ bg: controlHoverBg }}
              />
              <IconButton
                aria-label="Close modal"
                icon={<CloseIcon />}
                onClick={(e) => { e.stopPropagation(); onClose(); }}
                variant="ghost"
                color={controlColor}
                size="lg"                    
                _hover={{ bg: controlHoverBg }}
              />
            </Flex>
          </Flex>

          {onPrevious && (
            <IconButton
              aria-label="Previous image"
              icon={<ChevronLeftIcon boxSize={8} />}
              onClick={(e) => { e.stopPropagation(); onPrevious(); }}
              variant="ghost"
              color={controlColor}
              size="lg"
              position="absolute"
              left={4}
              top="50%"
              transform="translateY(-50%)"
              zIndex={1450}
              pointerEvents="auto"
            />
          )}

          {onNext && (
            <IconButton
              aria-label="Next image"
              icon={<ChevronRightIcon boxSize={8} />}
              onClick={(e) => { e.stopPropagation(); onNext(); }}
              variant="ghost"
              color={controlColor}
              size="lg"
              position="absolute"
              right={4}
              top="50%"
              transform="translateY(-50%)"
              zIndex={1450}
              pointerEvents="auto"
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