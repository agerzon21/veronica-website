import React from 'react';
import { Box, Heading, Text, Container, VStack, Image } from '@chakra-ui/react';

const About: React.FC = () => {
  return (
    <Container maxW="container.xl" py={10}>
      <VStack spacing={8} align="stretch">
        <Box textAlign="center" py={10}>
          <Heading as="h1" size="2xl" mb={4}>
            About Veronica
          </Heading>
        </Box>
        
        <Box>
          <Heading as="h2" size="lg" mb={4}>
            My Story
          </Heading>
          <Text mb={4}>
            With over 10 years of experience in photography, I specialize in capturing the essence of special moments. 
            My passion for photography began when I received my first camera as a gift, and since then, I've dedicated 
            myself to perfecting the art of visual storytelling.
          </Text>
          <Text mb={4}>
            I believe that every photograph should tell a story and evoke emotions. Whether it's a wedding, a family 
            portrait, or a special event, I strive to create images that will be cherished for generations.
          </Text>
        </Box>
        
        <Box>
          <Heading as="h2" size="lg" mb={4}>
            My Approach
          </Heading>
          <Text>
            I work closely with my clients to understand their vision and bring it to life through my lens. 
            My style is a blend of classic elegance and modern creativity, ensuring that each photo session 
            is unique and memorable.
          </Text>
        </Box>
      </VStack>
    </Container>
  );
};

export default About; 