import { Modal, ModalOverlay, ModalContent, ModalBody, ModalCloseButton, Image, Box } from '@chakra-ui/react';

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  imageAlt: string;
}

const ImageModal = ({ isOpen, onClose, imageUrl, imageAlt }: ImageModalProps) => {
  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      size="full"
      motionPreset="slideInBottom"
      isCentered
    >
      <ModalOverlay bg="blackAlpha.900" />
      <ModalContent 
        bg="transparent" 
        m={0}
        maxW="100vw"
        maxH="100vh"
        position="relative"
        top="80px"
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
          h="calc(100vh - 80px)"
        >
          <Box
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            onClick={onClose}
            cursor="pointer"
          />
          <Image
            src={imageUrl}
            alt={imageAlt}
            maxH="calc(100vh - 100px)"
            maxW="90vw"
            objectFit="contain"
            loading="lazy"
            onClick={(e) => e.stopPropagation()}
          />
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ImageModal; 