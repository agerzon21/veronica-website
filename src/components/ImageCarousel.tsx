import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Box, Image, Flex, Text, Button, useBreakpointValue } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';

interface ImageCarouselProps {
  images: Array<{
    url: string;
    position?: string;
    mobileUrl?: string;
    mobilePosition?: string;
    /** If true, this image is excluded from the carousel on mobile viewports. */
    mobileSkip?: boolean;
    /** If true, this image is excluded from the carousel on desktop viewports. */
    desktopSkip?: boolean;
  }>;
  height?: string | { base?: string; sm?: string; md?: string; lg?: string };
  hideDevIndicator?: boolean;
}

// Safe check for development mode
const isDevelopment = process.env.NODE_ENV === 'development';

const ImageCarousel: React.FC<ImageCarouselProps> = ({
  images: initialImages,
  height = '100vh',
  hideDevIndicator = false,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const isMobile = useBreakpointValue({ base: true, md: false });
  const [images, setImages] = useState(initialImages);
  // Portal target only safe after mount (SSR + first-paint guard)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Filter out viewport-specific skipped images, then shuffle. Re-runs if the
  // viewport breakpoint changes between mobile/desktop.
  useEffect(() => {
    const filtered = initialImages.filter((img) => {
      if (isMobile === true && img.mobileSkip) return false;
      if (isMobile === false && img.desktopSkip) return false;
      return true;
    });
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    setImages(shuffled);
    setCurrentIndex(0);
  }, [initialImages, isMobile]);

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
      height={height}
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

      {/* Dev controls — rendered via a Portal to document.body so they escape
          the parent's CSS transform scaling (the camera MotionBox uses scale
          transforms, which would otherwise make these buttons huge or tiny
          depending on scroll position). Fixed-position relative to viewport. */}
      {mounted && isDevelopment && !hideDevIndicator && createPortal(
        <Flex
          position="fixed"
          bottom="16px"
          left="50%"
          transform="translateX(-50%)"
          bg="blackAlpha.800"
          px={3}
          py={2}
          borderRadius="md"
          zIndex={9999}
          gap={2}
          alignItems="center"
        >
          <Text color="white" fontSize="xs" whiteSpace="nowrap">
            {currentIndex + 1} / {images.length}
          </Text>
          <Button
            onClick={() => setCurrentIndex((prev) => (prev - 1 + images.length) % images.length)}
            size="xs"
            colorScheme="whiteAlpha"
          >
            Prev
          </Button>
          <Button
            onClick={() => setCurrentIndex((prev) => (prev + 1) % images.length)}
            size="xs"
            colorScheme="whiteAlpha"
          >
            Next
          </Button>
          <Button
            onClick={() => setIsPaused(!isPaused)}
            size="xs"
            colorScheme={isPaused ? "green" : "red"}
          >
            {isPaused ? "Play" : "Stop"}
          </Button>
        </Flex>,
        document.body,
      )}
    </Box>
  );
};

export default ImageCarousel; 