import React, { useState, useEffect } from 'react';
import { Box, Image, Flex, Text, Button, useBreakpointValue } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageCarouselProps {
  images: Array<{
    url: string;
    position?: string;
    mobileUrl?: string;
    mobilePosition?: string;
  }>;
}

// Safe check for development mode
const isDevelopment = process.env.NODE_ENV === 'development';

const ImageCarousel: React.FC<ImageCarouselProps> = ({ images: initialImages }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const isMobile = useBreakpointValue({ base: true, md: false });
  const [images, setImages] = useState(initialImages);

  // Shuffle images on component mount
  useEffect(() => {
    const shuffledImages = [...initialImages].sort(() => Math.random() - 0.5);
    setImages(shuffledImages);
  }, [initialImages]);

  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [images.length, isPaused]);

  const getCurrentPosition = () => {
    const currentImage = images[currentIndex];
    return isMobile && currentImage.mobilePosition 
      ? currentImage.mobilePosition 
      : currentImage.position || 'center 0%';
  };

  const getCurrentImage = () => {
    const currentImage = images[currentIndex];
    return isMobile && currentImage.mobileUrl ? currentImage.mobileUrl : currentImage.url;
  };

  const variants = {
    enter: { opacity: 0 },
    center: { opacity: 1 },
    exit: { opacity: 0 }
  };

  return (
    <Box
      position="relative"
      width="100%"
      height="100vh"
      overflow="hidden"
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={currentIndex}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ opacity: { duration: 1 } }}
          style={{ position: 'absolute', width: '100%', height: '100%' }}
        >
          <Image
            src={getCurrentImage()}
            alt={`Slide ${currentIndex + 1}`}
            objectFit="cover"
            width="100%"
            height="100%"
            objectPosition={getCurrentPosition()}
          />
        </motion.div>
      </AnimatePresence>

      {isDevelopment && (
        <Flex
          position="absolute"
          bottom="20px"
          left="50%"
          transform="translateX(-50%)"
          bg="blackAlpha.700"
          p={4}
          borderRadius="md"
          zIndex={10}
          gap={4}
          alignItems="center"
        >
          <Text color="white">Image {currentIndex + 1} of {images.length}</Text>
          <Button
            onClick={() => setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)}
            size="sm"
            colorScheme="whiteAlpha"
          >
            Previous
          </Button>
          <Button
            onClick={() => setCurrentIndex((prev) => (prev + 1) % images.length)}
            size="sm"
            colorScheme="whiteAlpha"
          >
            Next
          </Button>
          <Button
            onClick={() => setIsPaused(!isPaused)}
            size="sm"
            colorScheme={isPaused ? "green" : "red"}
          >
            {isPaused ? "Resume" : "Pause"}
          </Button>
        </Flex>
      )}
    </Box>
  );
};

export default ImageCarousel; 