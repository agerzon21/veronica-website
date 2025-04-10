import React from 'react';
import { Box, SimpleGrid, Image, Container, Heading, Spinner, Text } from '@chakra-ui/react';
import { useGoogleDriveImages } from '../hooks/useGoogleDriveImages';

const Gallery = () => {
  const { images, loading, error } = useGoogleDriveImages('gallery');

  if (loading) {
    return (
      <Container maxW="1200px" py={12} textAlign="center">
        <Spinner size="xl" />
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

  return (
    <Container maxW="1200px" py={12}>
      <Heading as="h2" size="xl" mb={8} textAlign="center">
        Photo Gallery
      </Heading>

      <SimpleGrid columns={{ base: 1, md: 2, lg: 3 }} spacing={8}>
        {images.map((image) => (
          <Box
            key={image.id}
            overflow="hidden"
            borderRadius="lg"
            boxShadow="lg"
            transition="transform 0.2s"
            _hover={{ transform: 'scale(1.02)' }}
          >
            <Image
              src={image.url}
              alt={image.name}
              w="100%"
              h="300px"
              objectFit="cover"
            />
          </Box>
        ))}
      </SimpleGrid>
    </Container>
  );
};

export default Gallery; 