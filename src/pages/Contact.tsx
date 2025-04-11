import { Box, VStack, Text, Button, Icon, useColorModeValue } from '@chakra-ui/react';
import { FaWhatsapp } from 'react-icons/fa';
import PageHeader from '../components/PageHeader';
import PageContainer from '../components/PageContainer';

const Contact = () => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const buttonBg = '#25D366'; // WhatsApp brand color

  const handleWhatsAppClick = () => {
    const phoneNumber = '+18493569362'; // Replace with your actual WhatsApp number
    const message = 'Hello Veronica, I would like to discuss a photography project.';
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <PageContainer>
      <PageHeader 
        title="Contact"
        subtitle="Get in touch to discuss your photography needs"
      />
      
      <Box 
        bg={bgColor} 
        p={8} 
        borderRadius="xl" 
        boxShadow="xl"
        maxW="600px"
        mx="auto"
      >
        <VStack spacing={8}>
          <Text
            fontSize={{ base: 'lg', md: 'xl' }}
            textAlign="center"
            color="gray.600"
          >
            I'd love to hear about your photography needs. Whether it's a portrait session, 
            event coverage, or a creative project, let's discuss how we can bring your vision to life.
          </Text>

          <Button
            size="lg"
            leftIcon={<Icon as={FaWhatsapp} boxSize={6} />}
            bg={buttonBg}
            color="white"
            _hover={{ bg: '#128C7E' }}
            _active={{ bg: '#075E54' }}
            px={8}
            py={6}
            fontSize="xl"
            onClick={handleWhatsAppClick}
          >
            Message Me on WhatsApp
          </Button>

          <Text
            fontSize="sm"
            color="gray.500"
            textAlign="center"
          >
            Click the button above to start a conversation on WhatsApp
          </Text>
        </VStack>
      </Box>
    </PageContainer>
  );
};

export default Contact; 