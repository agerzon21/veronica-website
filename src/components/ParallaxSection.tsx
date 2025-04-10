import React, { useRef } from 'react';
import { Box, Text } from '@chakra-ui/react';
import { motion, useScroll, useTransform } from 'framer-motion';

interface ParallaxSectionProps {
  imageUrl: string;
  text: string;
  imagePosition?: string;
}

const ParallaxSection: React.FC<ParallaxSectionProps> = ({ 
  imageUrl, 
  text,
  imagePosition = 'center'
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 80%", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], ['0%', '25%']);

  return (
    <Box
      ref={ref}
      position="relative"
      height="100vh"
      overflow="hidden"
      mt={0}
    >
      <motion.div
        style={{
          position: 'absolute',
          top: '-20vh',
          left: 0,
          right: 0,
          bottom: '-20vh',
          y,
          backgroundImage: `url(${imageUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: imagePosition,
          filter: 'brightness(0.7) contrast(1.1)',
          willChange: 'transform'
        }}
      />
      <Box
        position="absolute"
        top="55%"
        left="50%"
        transform="translate(-50%, -50%)"
        zIndex={1}
        width="90%"
        maxWidth="800px"
        textAlign="center"
      >
        <Text
          fontSize={{ base: '2xl', md: '4xl', lg: '5xl' }}
          fontWeight="bold"
          color="white"
          textShadow="2px 2px 4px rgba(0,0,0,0.5)"
        >
          {text}
        </Text>
      </Box>
    </Box>
  );
};

export default ParallaxSection; 