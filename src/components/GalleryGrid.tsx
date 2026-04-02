import { Box } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import ImageModal from './ImageModal';
import { useState, useEffect, useRef, useCallback } from 'react';

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

const GalleryGrid = ({ images, category }: GalleryGridProps) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [originRect, setOriginRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<(HTMLDivElement | null)[]>([]);
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

  useEffect(() => {
    imageRefs.current = imageRefs.current.slice(0, images.length);
  }, [images.length]);

  const handleImageClick = (index: number) => {
    // Capture the bounding rect of the clicked thumbnail before opening the modal
    const el = imageRefs.current[index];
    if (el) {
      const rect = el.getBoundingClientRect();
      setOriginRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    } else {
      setOriginRect(null);
    }
    setSelectedImageIndex(index);
    setIsModalOpen(true);
  };

  const getImageRect = useCallback((index: number) => {
    const el = imageRefs.current[index];
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  }, []);

  const handleModalClose = useCallback((_finalIndex: number) => {
    // Modal already scrolled the page to the right spot before animating closed
    setIsModalOpen(false);
    setSelectedImageIndex(null);
    setOriginRect(null);
  }, []);

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
        gap={4}
      >
        {images.map((image, index) => (
          <MotionBox
            key={image.id || index}
            ref={(el: HTMLDivElement | null) => { imageRefs.current[index] = el; }}
            position="relative"
            overflow="hidden"
            cursor="pointer"
            onClick={() => handleImageClick(index)}
            whileHover={{ scale: 1.01 }}
            transition={{ duration: 0.3 }}
          >
            <img
              src={image.url}
              alt={image.alt}
              title={image.title}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
              loading="lazy"
            />
          </MotionBox>
        ))}
      </Box>

      {selectedImageIndex !== null && isModalOpen && (
        <ImageModal
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
          originRect={originRect}
          getImageRect={getImageRect}
        />
      )}
    </Box>
  );
};

export default GalleryGrid;
