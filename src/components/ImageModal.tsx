import { Modal, ModalOverlay, ModalContent, ModalBody, ModalCloseButton, Image } from '@chakra-ui/react';

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
    >
      <ModalOverlay bg="blackAlpha.900" />
      <ModalContent bg="transparent" m={0}>
        <ModalCloseButton 
          color="white" 
          size="lg"
          top={4}
          right={4}
        />
        <ModalBody 
          p={0} 
          display="flex" 
          alignItems="center" 
          justifyContent="center"
        >
          <Image
            src={imageUrl}
            alt={imageAlt}
            maxH="90vh"
            w="100%"
            objectFit="contain"
            loading="lazy"
          />
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default ImageModal; 