import { Modal, ModalOverlay, ModalContent, ModalBody, Image, Box, IconButton, Text, Flex } from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon, AddIcon, MinusIcon, CloseIcon } from '@chakra-ui/icons';
import { useState, useEffect } from 'react';

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageAlt?: string;
  onNext?: () => void;
  onPrevious?: () => void;
}

const ImageModal = ({ isOpen, onClose, imageUrl, imageAlt = 'Gallery image', onNext, onPrevious }: ImageModalProps) => {
  const [scale, setScale] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' && onPrevious) onPrevious();
    if (e.key === 'ArrowRight' && onNext) onNext();
    if (e.key === 'Escape') onClose();
    if (e.key === '+') setScale(prev => Math.min(prev + 0.1, 3));
    if (e.key === '-') setScale(prev => Math.max(prev - 0.1, 0.5));
  };

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onNext, onPrevious]);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      size="full"
      motionPreset="slideInBottom"
      isCentered
    >
      <ModalOverlay bg="blackAlpha.900" onClick={onClose} />
      
      {/* Controls Container - Fixed Position */}
      <Box
        position="fixed"
        top={0}
        left={0}
        right={0}
        bottom={0}
        zIndex={9999}
        pointerEvents="none"
      >
        {/* Close Button */}
        <IconButton
          aria-label="Close modal"
          icon={<CloseIcon />}
          onClick={onClose}
          color="white"
          size="lg"
          position="absolute"
          top="80px"
          right="24px"
          bg="blackAlpha.700"
          borderRadius="full"
          p={3}
          w="48px"
          h="48px"
          pointerEvents="auto"
          _hover={{ bg: 'whiteAlpha.200' }}
        />

        {/* Navigation Buttons */}
        {onPrevious && (
          <IconButton
            aria-label="Previous image"
            icon={<ChevronLeftIcon />}
            onClick={(e) => {
              e.stopPropagation();
              onPrevious();
            }}
            colorScheme="whiteAlpha"
            size="lg"
            position="absolute"
            left={4}
            top="50%"
            transform="translateY(-50%)"
            pointerEvents="auto"
          />
        )}

        {onNext && (
          <IconButton
            aria-label="Next image"
            icon={<ChevronRightIcon />}
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            colorScheme="whiteAlpha"
            size="lg"
            position="absolute"
            right={4}
            top="50%"
            transform="translateY(-50%)"
            pointerEvents="auto"
          />
        )}

        {/* Zoom Controls */}
        <Flex
          position="absolute"
          bottom={4}
          left="50%"
          transform="translateX(-50%)"
          gap={4}
          bg="blackAlpha.700"
          p={2}
          borderRadius="md"
          pointerEvents="auto"
        >
          <IconButton
            aria-label="Zoom out"
            icon={<MinusIcon />}
            onClick={(e) => {
              e.stopPropagation();
              setScale(prev => Math.max(prev - 0.1, 0.5));
            }}
            colorScheme="whiteAlpha"
            size="lg"
          />
          <IconButton
            aria-label="Zoom in"
            icon={<AddIcon />}
            onClick={(e) => {
              e.stopPropagation();
              setScale(prev => Math.min(prev + 0.1, 3));
            }}
            colorScheme="whiteAlpha"
            size="lg"
          />
        </Flex>
      </Box>

      {/* Image Content */}
      <ModalContent 
        bg="transparent" 
        m={0}
        maxW="100vw"
        maxH="100vh"
        position="relative"
        top="80px"
      >
        <ModalBody 
          p={0} 
          display="flex" 
          alignItems="center" 
          justifyContent="center"
          position="relative"
          onClick={onClose}
          h="calc(100vh - 80px)"
          overflowY="auto"
          css={{
            '&::-webkit-scrollbar': {
              width: '4px',
            },
            '&::-webkit-scrollbar-track': {
              background: 'transparent',
            },
            '&::-webkit-scrollbar-thumb': {
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '2px',
            },
          }}
        >
          <Box
            position="relative"
            minH="calc(100vh - 80px)"
            display="flex"
            alignItems="center"
            justifyContent="center"
            py={8}
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={imageUrl}
              alt={imageAlt}
              maxH="calc(100vh - 120px)"
              maxW="90vw"
              objectFit="contain"
              loading="lazy"
              draggable={false}
              transform={`scale(${scale})`}
              transition="transform 0.2s ease-in-out"
              cursor={isZoomed ? 'zoom-out' : 'zoom-in'}
              onClick={() => {
                if (isZoomed) {
                  setScale(1);
                  setIsZoomed(false);
                } else {
                  setScale(1.5);
                  setIsZoomed(true);
                }
              }}
            />
          </Box>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ImageModal; 