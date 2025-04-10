import React, { useState } from 'react';
import { Box, Heading, Text, Image, Spinner } from '@chakra-ui/react';
import { useCloudinaryImages } from '../hooks/useCloudinaryImages';
import PageHeader from '../components/PageHeader';
import PageContainer from '../components/PageContainer';
import ImageModal from '../components/ImageModal';
import { useDisclosure } from '@chakra-ui/react';

const Home: React.FC = () => {
  const { images, loading, error } = useCloudinaryImages('home');
  const [selectedImage, setSelectedImage] = useState<{ name: string; url: string } | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const handleImageClick = (image: { name: string; url: string }) => {
    setSelectedImage(image);
    onOpen();
  };

  return (
    <PageContainer>
      <PageHeader 
        title="Veronica Photography"
        subtitle="Capturing Life's Special Moments"
      />
        
      <Box>
        <Heading 
          as="h2" 
          size={{ base: "md", md: "lg" }}
          mb={{ base: 3, md: 4 }}
          textAlign={{ base: "center", md: "left" }}
        >
          Featured Work
        </Heading>
        {loading ? (
          <Box textAlign="center" py={8}>
            <Spinner size="xl" />
            <Text textStyle="body" mt={4}>Loading featured image...</Text>
          </Box>
        ) : error ? (
          <Text textStyle="body" color="red.500">{error}</Text>
        ) : images.length > 0 ? (
          <Box
            overflow="hidden"
            borderRadius="lg"
            boxShadow="lg"
            mb={{ base: 4, md: 6 }}
            onClick={() => handleImageClick(images[0])}
            cursor="pointer"
            transition="transform 0.2s"
            _hover={{ transform: 'scale(1.02)' }}
          >
            <Image
              src={images[0].url}
              alt={images[0].name}
              w="100%"
              h={{ base: "300px", md: "400px" }}
              objectFit="cover"
              bg="gray.100"
              loading="lazy"
            />
          </Box>
        ) : (
          <Text textStyle="body">No featured images available</Text>
        )}
        <Text 
          textStyle="body"
          mt={4}
          textAlign={{ base: "center", md: "left" }}
        >
          Explore our gallery to see some of our most recent work and get inspired for your next photo session.
        </Text>
      </Box>

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

export default Home; 