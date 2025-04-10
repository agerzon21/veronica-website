import { Box, Container, Heading, Text } from '@chakra-ui/react';

const About = () => {
  return (
    <Container maxW="1200px" py={12}>
      <Heading as="h2" size="xl" mb={8} textAlign="center">
        About Me
      </Heading>
      <Box>
        <Text fontSize="lg" mb={4}>
          Welcome to my photography portfolio! I'm passionate about capturing special moments and creating lasting memories.
        </Text>
        <Text fontSize="lg">
          With years of experience in event photography, I specialize in weddings, corporate events, and special occasions.
        </Text>
      </Box>
    </Container>
  );
};

export default About; 