import { Box, Image, useColorModeValue } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import ImageModal from './ImageModal';
import { useState, useEffect, useRef } from 'react';

interface GalleryGridProps {
  images: Array<{
    id?: string;
    url: string;
    alt: string;
    title: string;
    description: string;
  }>;
  category?: string;
}

const MotionBox = motion(Box);
const MotionImage = motion(Image);

const GalleryGrid = ({ images, category }: GalleryGridProps) => {
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
      px={0}
    >
      <Box
        display="grid"
        gridTemplateColumns={`repeat(${columnCount}, 1fr)`}
        gap={8}
      >
        {images.map((image, index) => (
          <MotionBox
            key={index}
            layout
            layoutId={`box-${image.url}`}
            position="relative"
            bg={useColorModeValue('gray.100', 'gray.700')}
            whileHover={{ scale: 1.02 }}
            cursor="pointer"
            onClick={() => handleImageClick(index)}
          >
            <MotionImage
              layout
              layoutId={`image-${image.url}`}
              src={image.url}
              alt={image.alt}
              title={image.title}
              width="100%"
              height="100%"
              objectFit="cover"
              _hover={{ filter: 'brightness(0.9)' }}
              loading="lazy"
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            />
          </MotionBox>
        ))}
      </Box>

      <AnimatePresence>
        {selectedImageIndex !== null && (
          <ImageModal
            key={`modal-${images[selectedImageIndex].url}`}
            isOpen={isModalOpen}
            onClose={handleModalClose}
            imageUrl={images[selectedImageIndex].url}
            imageAlt={images[selectedImageIndex].alt}
            onNext={handleNextImage}
            onPrevious={handlePreviousImage}
            currentIndex={selectedImageIndex}
            totalImages={images.length}
            photoData={images[selectedImageIndex]}
            category={category}
          />
        )}
      </AnimatePresence>
    </Box>
  );
};

export default GalleryGrid; 