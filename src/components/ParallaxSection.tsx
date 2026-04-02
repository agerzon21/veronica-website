import React, { useRef } from 'react';
import { Box, Text, Link, VStack, useBreakpointValue } from '@chakra-ui/react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link as RouterLink } from 'react-router-dom';

interface ParallaxSectionProps {
  imageUrl: string;
  mobileImageUrl?: string;
  imagePosition?: string;
  mobileImagePosition?: string;
}

const ParallaxSection: React.FC<ParallaxSectionProps> = ({
  imageUrl,
  mobileImageUrl,
  imagePosition = 'center',
  mobileImagePosition
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useBreakpointValue({ base: true, md: false });

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 80%", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], ['0%', '25%']);

  const getCurrentPosition = () => {
    return isMobile ? (mobileImagePosition || imagePosition) : imagePosition;
  };

  const getCurrentImageUrl = () => {
    return isMobile ? (mobileImageUrl || imageUrl) : imageUrl;
  };

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
          backgroundImage: `url(${getCurrentImageUrl()})`,
          backgroundSize: 'cover',
          backgroundPosition: getCurrentPosition(),
          filter: 'brightness(0.45) contrast(1.1)',
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
        <VStack spacing={6}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.2em"
            color="#c9a96e"
          >
            Let's Work Together
          </Text>
          <Box w="35px" h="1px" bg="#c9a96e" />
          <Text
            fontSize={{ base: 'xl', md: '2xl', lg: '3xl' }}
            fontWeight="200"
            color="white"
            lineHeight="1.5"
            fontStyle="italic"
            textShadow="0 2px 12px rgba(0,0,0,0.3)"
          >
            Let's create timeless memories together
          </Text>
          <Link
            as={RouterLink}
            to="/contact"
            fontSize="xs"
            fontWeight="400"
            color="white"
            textTransform="uppercase"
            letterSpacing="0.2em"
            display="inline-block"
            px={8}
            py={3}
            border="1px solid rgba(201,169,110,0.5)"
            transition="all 0.4s ease"
            _hover={{
              textDecoration: 'none',
              borderColor: '#c9a96e',
              color: '#c9a96e',
              transform: 'translateY(-2px)',
            }}
          >
            Get in Touch
          </Link>
        </VStack>
      </Box>
    </Box>
  );
};

export default ParallaxSection;
