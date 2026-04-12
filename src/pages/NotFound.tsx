import { Box, VStack, Text, Flex, Button } from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Link } from 'react-router-dom';

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
                <Button
                  as={Link}
                  to="/"
                  bg="#c9a96e"
                  color="white"
                  fontSize="xs"
                  fontWeight="400"
                  letterSpacing="0.2em"
                  textTransform="uppercase"
                  h="48px"
                  px={10}
                  borderRadius="sm"
                  _hover={{ bg: '#d4b87a', transform: 'translateY(-1px)' }}
                  transition="all 0.3s"
                >
                  Go Home
                </Button>
                <Button
                  as={Link}
                  to="/gallery"
                  variant="outline"
                  borderColor="gray.300"
                  color="gray.600"
                  fontSize="xs"
                  fontWeight="300"
                  letterSpacing="0.2em"
                  textTransform="uppercase"
                  h="48px"
                  px={10}
                  borderRadius="sm"
                  _hover={{ borderColor: '#c9a96e', color: '#c9a96e' }}
                  transition="all 0.3s"
                >
                  View Gallery
                </Button>
              </Flex>
            </VStack>
          </MotionDiv>
        </Box>
      </Flex>
    </Box>
  );
};

export default NotFound;
