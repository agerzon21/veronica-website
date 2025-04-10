import React, { useState } from 'react';
import { Box, Heading, Text, Container, VStack, Image, Spinner, Modal, ModalOverlay, ModalContent, ModalBody, ModalCloseButton, useDisclosure } from '@chakra-ui/react';
import { useGoogleDriveFolder } from '../hooks/useGoogleDriveFolder';

const Home: React.FC = () => {
  const { images, loading, error } = useGoogleDriveFolder();
  const [selectedImage, setSelectedImage] = useState<{ name: string; url: string } | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  console.log('Home state:', { images, loading, error });

  const handleImageClick = (image: { name: string; url: string }) => {
    setSelectedImage(image);
    onOpen();
  };

  return (
    <Container maxW="container.xl" py={10}>
      <VStack spacing={8} align="stretch">
        <Box textAlign="center" py={10}>
          <Heading as="h1" size="2xl" mb={4}>
            Welcome to Veronica's Photography
          </Heading>
          <Text fontSize="xl" color="gray.600">
            Capturing life's precious moments through the lens
          </Text>
        </Box>
        
        <Box>
          <Heading as="h2" size="lg" mb={4}>
            Featured Work
          </Heading>
          {loading ? (
            <Box textAlign="center" py={8}>
              <Spinner size="xl" />
              <Text mt={4}>Loading featured image...</Text>
            </Box>
          ) : error ? (
            <Text color="red.500">{error}</Text>
          ) : images.length > 0 ? (
            <Box
              overflow="hidden"
              borderRadius="lg"
              boxShadow="lg"
              mb={6}
              onClick={() => handleImageClick(images[0])}
              cursor="pointer"
              transition="transform 0.2s"
              _hover={{ transform: 'scale(1.02)' }}
            >
              <Image
                src={images[0].url}
                alt={images[0].name}
                w="100%"
                h="400px"
                objectFit="contain"
                bg="gray.100"
              />
            </Box>
          ) : (
            <Text>No featured images available</Text>
          )}
          <Text mt={4}>
            Explore our gallery to see some of our most recent work and get inspired for your next photo session.
          </Text>
        </Box>
      </VStack>

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

export default Home; 