import React, { useState, useEffect } from 'react';
import { Box, Image } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageCarouselProps {
  images: Array<{
    url: string;
    position?: string; // Optional position for each image
  }>;
}

const ImageCarousel: React.FC<ImageCarouselProps> = ({ images }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
    }, 5000); // Change image every 5 seconds

    return () => clearInterval(interval);
  }, [images.length]);

  const variants = {
    enter: {
      opacity: 0
    },
    center: {
      opacity: 1
    },
    exit: {
      opacity: 0
    }
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
          transition={{
            opacity: { duration: 1 }
          }}
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
          }}
        >
          <Image
            src={images[currentIndex].url}
            alt={`Slide ${currentIndex + 1}`}
            objectFit="cover"
            width="100%"
            height="100%"
            objectPosition={images[currentIndex].position || 'center'} // Use position if provided, default to center
          />
        </motion.div>
      </AnimatePresence>
    </Box>
  );
};

export default ImageCarousel; 