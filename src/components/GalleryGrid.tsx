import { Box, Image, SimpleGrid } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import ImageModal from './ImageModal';
import { useState } from 'react';

interface GalleryGridProps {
  images: Array<{
    url: string;
    width: number;
    height: number;
  }>;
}

const MotionBox = motion(Box);

const GalleryGrid = ({ images }: GalleryGridProps) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleImageClick = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedImage(null);
  };

  // Calculate the aspect ratio for each image
  const getAspectRatio = (width: number, height: number) => {
    return width / height;
  };

  // Determine the grid column span based on aspect ratio
  const getColumnSpan = (aspectRatio: number) => {
    if (aspectRatio > 1.5) return 2;
    return 1;
  };

  return (
    <Box py={8} px={4}>
      <SimpleGrid
        columns={{ base: 1, md: 2, lg: 3 }}
        spacing={4}
        maxW="1400px"
        mx="auto"
      >
        {images.map((image, index) => (
          <MotionBox
            key={index}
            gridColumn={{
              base: 'auto',
              md: `span ${getColumnSpan(getAspectRatio(image.width, image.height))}`
            }}
            position="relative"
            overflow="hidden"
            borderRadius="lg"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.3 }}
            cursor="pointer"
            onClick={() => handleImageClick(image.url)}
          >
            <Image
              src={image.url}
              alt={`Gallery image ${index + 1}`}
              width="100%"
              height="auto"
              objectFit="cover"
              transition="all 0.3s ease"
              _hover={{ filter: 'brightness(0.9)' }}
            />
          </MotionBox>
        ))}
      </SimpleGrid>

      {selectedImage && (
        <ImageModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          imageUrl={selectedImage}
          imageAlt="Gallery image"
        />
      )}
    </Box>
  );
};

export default GalleryGrid; 