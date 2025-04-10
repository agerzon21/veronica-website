import React from 'react';
import { useState } from 'react';
import { Box, SimpleGrid, Image, Container, Heading, Spinner, Text, Code, Modal, ModalOverlay, ModalContent, ModalBody, ModalCloseButton, useDisclosure } from '@chakra-ui/react';
import { useGoogleDriveFolder } from '../hooks/useGoogleDriveFolder';

const Gallery = () => {
  DELIBERATE_ERROR_HERE;  // This should cause a different error if the changes are being picked up
  const { images, loading, error } = useGoogleDriveFolder();
  const [selectedImage, setSelectedImage] = useState<{ name: string; url: string } | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  console.log('Gallery state:', { images, loading, error });

  if (loading) {
    return (
      <Container maxW="1200px" py={12} textAlign="center">
        <Spinner size="xl" />
        <Text mt={4}>Loading images...</Text>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxW="1200px" py={12} textAlign="center">
        <Text color="red.500">{error}</Text>
      </Container>
    );
  }

  if (images.length === 0) {
    return (
      <Container maxW="1200px" py={12} textAlign="center">
        <Text>No images found</Text>
        <Code mt={4} p={2} bg="gray.100">
          {JSON.stringify({ images, loading, error }, null, 2)}
        </Code>
      </Container>
    );
  }

  const handleImageClick = (image: { name: string; url: string }) => {
    setSelectedImage(image);
    onOpen();
  };

  return (
    <Container maxW="1200px" py={12}>
      <Heading as="h2" size="xl" mb={8} textAlign="center">
        Events Gallery
      </Heading>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={8}>
        {images.map((image) => (
          <Box
            key={image.name}
            overflow="hidden"
            borderRadius="lg"
            boxShadow="lg"
            transition="transform 0.2s"
            _hover={{ transform: 'scale(1.02)', cursor: 'pointer' }}
            onClick={() => handleImageClick(image)}
          >
            <Image
              src={image.url}
              alt={image.name}
              w="100%"
              h="300px"
              objectFit="contain"
              bg="gray.100"
            />
          </Box>
        ))}
      </SimpleGrid>

      <Modal isOpen={isOpen} onClose={onClose} size="full">
        <ModalOverlay />
        <ModalContent>
          <ModalCloseButton />
          <ModalBody p={0} display="flex" alignItems="center" justifyContent="center">
            {selectedImage && (
              <Image
                src={selectedImage.url}
                alt={selectedImage.name}
                maxH="90vh"
                maxW="90vw"
                objectFit="contain"
              />
            )}
          </ModalBody>
        </ModalContent>
      </Modal>
    </Container>
  );
};

export default Gallery; 