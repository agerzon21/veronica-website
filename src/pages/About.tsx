import { Box, Text } from '@chakra-ui/react';
import PageHeader from '../components/PageHeader';
import PageContainer from '../components/PageContainer';

const About = () => {
  return (
    <PageContainer>
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
        <Text textStyle="body" mb={6}>
          Welcome to my photography portfolio! I'm passionate about capturing special moments and creating lasting memories.
        </Text>
        <Text textStyle="body">
          With years of experience in event photography, I specialize in weddings, corporate events, and special occasions.
        </Text>
      </Box>
    </PageContainer>
  );
};

export default About; 