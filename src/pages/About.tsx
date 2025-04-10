import { Box, Container, Heading, Text, VStack } from '@chakra-ui/react';

const About = () => {
  return (
    <Container maxW="1200px" py={32}>
      <VStack spacing={8} align="stretch" mb={16}>
        <Heading 
          as="h1" 
          size="2xl" 
          textAlign="center"
          fontWeight="light"
          letterSpacing="tight"
        >
          About
        </Heading>
        <Text 
          fontSize="xl" 
          textAlign="center" 
          color="gray.600"
        >
          Get to know me and my photography journey
        </Text>
      </VStack>
      <Box 
        bg="white" 
        p={8} 
        borderRadius="xl" 
        boxShadow="xl"
      >
        <Text fontSize="xl" mb={6} color="gray.700">
          Welcome to my photography portfolio! I'm passionate about capturing special moments and creating lasting memories.
        </Text>
        <Text fontSize="xl" color="gray.700">
          With years of experience in event photography, I specialize in weddings, corporate events, and special occasions.
        </Text>
      </Box>
    </Container>
  );
};

export default About; 