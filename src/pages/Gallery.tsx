import { useState } from 'react';
import { Box, SimpleGrid, Image, Spinner, Text, useDisclosure } from '@chakra-ui/react';
import { useGoogleDriveFolder } from '../hooks/useGoogleDriveFolder';
import PageHeader from '../components/PageHeader';
import PageContainer from '../components/PageContainer';
import ImageModal from '../components/ImageModal';

const Gallery = () => {
  const { images, loading, error } = useGoogleDriveFolder();
  const [selectedImage, setSelectedImage] = useState<{ name: string; url: string } | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  if (loading) {
    return (
      <PageContainer textAlign="center">
        <Spinner size="xl" thickness="4px" speed="0.65s" color="gray.500" />
        <Text textStyle="body" mt={4}>Loading images...</Text>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer textAlign="center">
        <Text textStyle="body" color="red.500">{error}</Text>
      </PageContainer>
    );
  }

  if (images.length === 0) {
    return (
      <PageContainer textAlign="center">
        <Text textStyle="body">No images found</Text>
      </PageContainer>
    );
  }

  const handleImageClick = (image: { name: string; url: string }) => {
    setSelectedImage(image);
    onOpen();
  };

  return (
    <PageContainer>
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
              h={{ base: "300px", md: "400px" }}
              objectFit="cover"
              transition="transform 0.3s ease"
              loading="lazy"
              _hover={{
                transform: 'scale(1.1)'
              }}
            />
          </Box>
        ))}
      </SimpleGrid>

      {selectedImage && (
        <ImageModal
          isOpen={isOpen}
          onClose={onClose}
          imageUrl={selectedImage.url}
          imageAlt={selectedImage.name}
        />
      )}
    </PageContainer>
  );
};

export default Gallery; 