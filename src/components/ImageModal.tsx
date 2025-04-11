import { Modal, ModalOverlay, ModalContent, ModalBody, ModalCloseButton, Image, Box } from '@chakra-ui/react';

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageAlt?: string;
}

const ImageModal = ({ isOpen, onClose, imageUrl, imageAlt = 'Gallery image' }: ImageModalProps) => {
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      size="full"
      motionPreset="slideInBottom"
      isCentered
    >
      <ModalOverlay bg="blackAlpha.900" onClick={onClose} />
      <ModalContent 
        bg="transparent" 
        m={0}
        maxW="100vw"
        maxH="100vh"
        position="relative"
        top="120px"
      >
        <ModalCloseButton 
          color="white" 
          size="lg"
          top={4}
          right={4}
          zIndex={2}
          _hover={{ bg: 'whiteAlpha.200' }}
        />
        <ModalBody 
          p={0} 
          display="flex" 
          alignItems="center" 
          justifyContent="center"
          position="relative"
          onClick={onClose}
          h="calc(100vh - 120px)"
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
            minH="calc(100vh - 120px)"
            display="flex"
            alignItems="center"
            justifyContent="center"
            py={8}
          >
            <Image
              src={imageUrl}
              alt={imageAlt}
              maxH="calc(100vh - 160px)"
              maxW="90vw"
              objectFit="contain"
              loading="lazy"
              draggable={false}
              onClick={(e) => e.stopPropagation()}
            />
          </Box>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ImageModal; 