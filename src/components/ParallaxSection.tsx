import React, { useRef } from 'react';
import { Box, Text, Link } from '@chakra-ui/react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link as RouterLink } from 'react-router-dom';

interface ParallaxSectionProps {
  imageUrl: string;
  imagePosition?: string;
}

const ParallaxSection: React.FC<ParallaxSectionProps> = ({ 
  imageUrl,
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
          fontSize={{ base: '2xl', md: '3xl', lg: '4xl' }}
          fontWeight="light"
          color="white"
          textTransform="uppercase"
          letterSpacing="widest"
          textShadow="2px 2px 4px rgba(0,0,0,0.3)"
          mb={6}
          fontStyle="italic"
        >
          Let's Create Timeless Memories Together
        </Text>
        <Link
          as={RouterLink}
          to="/contact"
          fontSize={{ base: 'sm', md: 'md' }}
          fontWeight="medium"
          color="white"
          textTransform="uppercase"
          letterSpacing="widest"
          position="relative"
          display="inline-block"
          px={6}
          py={2}
          border="1px solid rgba(255,255,255,0.3)"
          borderRadius="full"
          transition="all 0.3s ease"
          _hover={{
            textDecoration: 'none',
            borderColor: 'white',
            transform: 'translateY(-2px)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          Let's Discuss Your Vision
        </Link>
      </Box>
    </Box>
  );
};

export default ParallaxSection; 