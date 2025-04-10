import React from 'react';
import { Box, Heading, Text, Container, VStack } from '@chakra-ui/react';

const Home: React.FC = () => {
  return (
    <Container maxW="container.xl" py={10}>
      <VStack spacing={8} align="stretch">
        <Box textAlign="center" py={10}>
          <Heading as="h1" size="2xl" mb={4}>
            Welcome to Veronica's Photography
          </Heading>
          <Text fontSize="xl" color="gray.600">
            Capturing life's precious moments through the lens
          </Text>
        </Box>
        
        <Box>
          <Heading as="h2" size="lg" mb={4}>
            Featured Work
          </Heading>
          <Text>
            Explore our gallery to see some of our most recent work and get inspired for your next photo session.
          </Text>
        </Box>
      </VStack>
    </Container>
  );
};

export default Home; 