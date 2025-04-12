import { Box, Image } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import ImageModal from './ImageModal';
import { useState, useEffect, useRef } from 'react';

interface GalleryGridProps {
  images: Array<{
    url: string;
  }>;
}

const MotionBox = motion(Box);

const GalleryGrid = ({ images }: GalleryGridProps) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(3);

  useEffect(() => {
    const updateColumnCount = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        if (width < 768) setColumnCount(1);
        else if (width < 1024) setColumnCount(2);
        else setColumnCount(3);
      }
    };

    updateColumnCount();
    window.addEventListener('resize', updateColumnCount);
    return () => window.removeEventListener('resize', updateColumnCount);
  }, []);

  const handleImageClick = (index: number) => {
    setSelectedImageIndex(index);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedImageIndex(null);
  };

  const handleNextImage = () => {
    if (selectedImageIndex !== null && selectedImageIndex < images.length - 1) {
      setSelectedImageIndex(selectedImageIndex + 1);
    }
  };

  const handlePreviousImage = () => {
    if (selectedImageIndex !== null && selectedImageIndex > 0) {
      setSelectedImageIndex(selectedImageIndex - 1);
    }
  };

  return (
    <Box 
      ref={containerRef}
      py={8} 
      px={4}
      maxW="1400px"
      mx="auto"
    >
      <Box
        display="grid"
        gridTemplateColumns={`repeat(${columnCount}, 1fr)`}
        gap={4}
      >
        {images.map((image, index) => (
          <MotionBox
            key={index}
            position="relative"
            overflow="hidden"
            borderRadius="lg"
            whileHover={{ scale: 1.02 }}
            transition={{ duration: 0.3 }}
            cursor="pointer"
            onClick={() => handleImageClick(index)}
          >
            <Image
              src={image.url}
              alt={`Gallery image ${index + 1}`}
              width="100%"
              height="100%"
              objectFit="cover"
              transition="all 0.3s ease"
              _hover={{ filter: 'brightness(0.9)' }}
              loading="lazy"
            />
          </MotionBox>
        ))}
      </Box>

      {selectedImageIndex !== null && (
        <ImageModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          imageUrl={images[selectedImageIndex].url}
          imageAlt={`Gallery image ${selectedImageIndex + 1}`}
          onNext={handleNextImage}
          onPrevious={handlePreviousImage}
        />
      )}
    </Box>
  );
};

export default GalleryGrid; 