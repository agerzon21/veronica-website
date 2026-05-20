import { Box, VStack, Text, Flex } from '@chakra-ui/react';
import CTAButton from '../components/ui/CTAButton';
import { Helmet } from 'react-helmet-async';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const MotionDiv = motion.div;

const NotFound = () => {
  const contentRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(contentRef, { once: true, amount: 0.15 });

  return (
    <Box minH="100vh" bg="white">
      <Helmet>
        <title>Page Not Found - Vero Photography</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <Flex
        minH="100vh"
        align="center"
        justify="center"
        px={6}
      >
        <Box ref={contentRef} w="100%" maxW="500px">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <VStack spacing={8}>
              <Text
                fontSize={{ base: '6xl', md: '8xl' }}
                fontWeight="100"
                color="gray.200"
                lineHeight="1"
              >
                404
              </Text>

              <VStack spacing={3}>
                <Text
                  fontSize={{ base: 'xl', md: '2xl' }}
                  fontWeight="200"
                  color="gray.800"
                  textTransform="uppercase"
                  letterSpacing="0.3em"
                  textAlign="center"
                >
                  Page Not Found
                </Text>
                <Box w="40px" h="1px" bg="#c9a96e" />
                <Text
                  fontSize={{ base: 'sm', md: 'md' }}
                  color="gray.500"
                  textAlign="center"
                  fontWeight="300"
                  lineHeight="1.9"
                >
                  The page you're looking for doesn't exist or has been moved.
                </Text>
              </VStack>

              <Flex gap={4} direction={{ base: 'column', sm: 'row' }}>
                <CTAButton to="/" variant="solid">Go Home</CTAButton>
                <CTAButton to="/gallery">View Gallery</CTAButton>
              </Flex>
            </VStack>
          </MotionDiv>
        </Box>
      </Flex>
    </Box>
  );
};

export default NotFound;
