import { useState } from 'react';
import { Box, SimpleGrid, Image, Container, Spinner, Text, Modal, ModalOverlay, ModalContent, ModalBody, ModalCloseButton, useDisclosure } from '@chakra-ui/react';
import { useGoogleDriveFolder } from '../hooks/useGoogleDriveFolder';
import PageHeader from '../components/PageHeader';

const Gallery = () => {
  const { images, loading, error } = useGoogleDriveFolder();
  const [selectedImage, setSelectedImage] = useState<{ name: string; url: string } | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  if (loading) {
    return (
      <Container maxW="1200px" py={32} textAlign="center">
        <Spinner size="xl" thickness="4px" speed="0.65s" color="gray.500" />
        <Text mt={4} fontSize="lg" color="gray.600">Loading images...</Text>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxW="1200px" py={32} textAlign="center">
        <Text color="red.500" fontSize="lg">{error}</Text>
      </Container>
    );
  }

  if (images.length === 0) {
    return (
      <Container maxW="1200px" py={32} textAlign="center">
        <Text fontSize="lg" color="gray.600">No images found</Text>
      </Container>
    );
  }

  const handleImageClick = (image: { name: string; url: string }) => {
    setSelectedImage(image);
    onOpen();
  };

  return (
    <Container maxW="1400px" py={32}>
      <PageHeader 
        title="Gallery"
        subtitle="A collection of my recent work"
      />

      <SimpleGrid 
        columns={{ base: 1, md: 2, lg: 3 }} 
        spacing={8}
      >
        {images.map((image) => (
          <Box
            key={image.name}
            overflow="hidden"
            borderRadius="xl"
            boxShadow="xl"
            transition="all 0.3s ease"
            _hover={{ 
              transform: 'scale(1.02)',
              cursor: 'pointer',
              boxShadow: '2xl'
            }}
            onClick={() => handleImageClick(image)}
          >
            <Image
              src={image.url}
              alt={image.name}
              w="100%"
              h="400px"
              objectFit="cover"
              transition="transform 0.3s ease"
              _hover={{
                transform: 'scale(1.1)'
              }}
            />
          </Box>
        ))}
      </SimpleGrid>

      <Modal 
        isOpen={isOpen} 
        onClose={onClose} 
        size="full"
        motionPreset="scale"
      >
        <ModalOverlay bg="blackAlpha.800" />
        <ModalContent 
          bg="transparent"
          boxShadow="none"
        >
          <ModalCloseButton 
            color="white" 
            size="lg"
            _hover={{ bg: 'whiteAlpha.200' }}
          />
          <ModalBody 
            p={0} 
            display="flex" 
            alignItems="center" 
            justifyContent="center"
          >
            {selectedImage && (
              <Image
                src={selectedImage.url}
                alt={selectedImage.name}
                maxH="90vh"
                maxW="90vw"
                objectFit="contain"
                borderRadius="lg"
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Container>
  );
};

export default Gallery; 