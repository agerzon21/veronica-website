import { Box, Container, Text } from '@chakra-ui/react';
import PageHeader from '../components/PageHeader';

const About = () => {
  return (
    <Container maxW="1200px" py={32}>
      <PageHeader 
        title="About"
        subtitle="Get to know me and my photography journey"
      />
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