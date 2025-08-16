import { Box, VStack, Text, Button, Icon, Container, HStack } from '@chakra-ui/react';
import { FaWhatsapp, FaInstagram } from 'react-icons/fa';
import { motion } from 'framer-motion';
import { trackContactSubmission } from '../utils/analytics';

const Contact = () => {
  const handleWhatsAppClick = () => {
    const phoneNumber = '+15709095707';
    const message = 'Hello Veronika, I would like to discuss a photography project.';
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    trackContactSubmission('WhatsApp');
    window.open(whatsappUrl, '_blank');
  };

  const handleInstagramClick = () => {
    trackContactSubmission('Instagram');
    window.open('https://www.instagram.com/vero.art.photo', '_blank');
  };

  return (
    <Box 
      position="relative" 
      minH="100vh"
      display="flex"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
    >
      {/* Background Image */}
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        backgroundImage="url('/assets/photos/Фото_ТФП_Лиза_879_gr9dpv.webp')"
        backgroundSize="cover"
        backgroundPosition="center"
        filter="brightness(0.7)"
      />

      {/* Gradient Overlay */}
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        bottom={0}
        bgGradient="linear(to-b, blackAlpha.600, blackAlpha.800)"
        opacity={0.8}
      />

      {/* Content */}
      <Container maxW="800px" position="relative" zIndex={2}>
        <VStack spacing={12} align="center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
          >
            <VStack spacing={6}>
              <Text
                fontSize={{ base: '4xl', md: '6xl', lg: '7xl' }}
                fontWeight="light"
                color="white"
                textTransform="uppercase"
                letterSpacing="wider"
                textShadow="2px 2px 4px rgba(0,0,0,0.3)"
                textAlign="center"
              >
                Let's Connect
              </Text>
              <Text
                fontSize={{ base: 'lg', md: 'xl' }}
                color="white"
                textAlign="center"
                maxW="600px"
                lineHeight="tall"
                textShadow="1px 1px 2px rgba(0,0,0,0.3)"
              >
                I'd love to hear about your photography needs. Whether it's a portrait session, 
                event coverage, or a creative project, let's bring your vision to life.
              </Text>
            </VStack>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.3 }}
          >
            <HStack spacing={8} justify="center" wrap="wrap" gap={4}>
              <Button
                size="lg"
                leftIcon={<Icon as={FaWhatsapp} boxSize={6} />}
                bg="rgba(37, 211, 102, 0.9)"
                color="white"
                _hover={{
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(37, 211, 102, 0.4)',
                }}
                _active={{
                  transform: 'translateY(0)',
                }}
                px={10}
                py={7}
                fontSize="xl"
                fontWeight="medium"
                onClick={handleWhatsAppClick}
                transition="all 0.2s ease"
                borderRadius="xl"
              >
                WhatsApp
              </Button>

              <Button
                size="lg"
                leftIcon={<Icon as={FaInstagram} boxSize={6} />}
                bg="linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)"
                color="white"
                _hover={{
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 12px rgba(220, 39, 67, 0.4)',
                }}
                _active={{
                  transform: 'translateY(0)',
                }}
                px={10}
                py={7}
                fontSize="xl"
                fontWeight="medium"
                onClick={handleInstagramClick}
                transition="all 0.2s ease"
                borderRadius="xl"
              >
                Instagram
              </Button>
            </HStack>
          </motion.div>
        </VStack>
      </Container>
    </Box>
  );
};

export default Contact; 