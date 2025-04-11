import { Box, VStack, Text, Button, Icon, useColorModeValue, Container, HStack } from '@chakra-ui/react';
import { FaWhatsapp, FaInstagram } from 'react-icons/fa';
import { motion, useScroll, useInView } from 'framer-motion';
import { useRef } from 'react';
import { keyframes } from '@emotion/react';
import { ChevronDownIcon } from '@chakra-ui/icons';

const scrollAnimation = keyframes`
  0% { transform: translateY(0); opacity: 1; }
  50% { transform: translateY(10px); opacity: 0.7; }
  100% { transform: translateY(0); opacity: 1; }
`;

const Contact = () => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const textColor = useColorModeValue('gray.600', 'gray.300');
  const formRef = useRef<HTMLDivElement>(null);
  const isFormInView = useInView(formRef, { margin: "-100px" });
  const { scrollY } = useScroll();

  const handleWhatsAppClick = () => {
    const phoneNumber = '+18493569362';
    const message = 'Hello Veronica, I would like to discuss a photography project.';
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleInstagramClick = () => {
    window.open('https://www.instagram.com/vero.kz', '_blank');
  };

  return (
    <Box position="relative" minH="100vh">
      {/* Background wrapper */}
      <Box
        position="fixed"
        top={0}
        left={0}
        right={0}
        height="100vh"
        zIndex={0}
        overflow="hidden"
      >
        {/* Background Image */}
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundImage="url('https://res.cloudinary.com/doj1fanx3/image/upload/v1744350443/%D0%A4%D0%BE%D1%82%D0%BE_%D0%A2%D0%A4%D0%9F_%D0%9B%D0%B8%D0%B7%D0%B0_879_gr9dpv.jpg')"
          backgroundSize="cover"
          backgroundPosition="center"
          filter="brightness(0.7)"
          style={{
            transform: `translateY(${scrollY.get() * 0.5}px)`,
            transition: 'transform 0.1s ease-out',
          }}
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

        {/* Hero Content */}
        <Box
          position="relative"
          height="100%"
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          zIndex={1}
        >
          <VStack spacing={8} maxW="800px" px={8} textAlign="center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.2 }}
            >
              <Text
                fontSize={{ base: '4xl', md: '6xl', lg: '7xl' }}
                fontWeight="light"
                color="white"
                textTransform="uppercase"
                letterSpacing="wider"
                textShadow="2px 2px 4px rgba(0,0,0,0.3)"
              >
                Let's Connect
              </Text>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.4 }}
            >
              <Text
                fontSize={{ base: 'xl', md: '2xl' }}
                color="white"
                fontStyle="italic"
                textShadow="1px 1px 2px rgba(0,0,0,0.3)"
              >
                Turn your vision into reality
              </Text>
            </motion.div>
          </VStack>

          {/* Scroll Indicator */}
          <Box
            position="absolute"
            bottom="140px"
            left="0"
            right="0"
            display="flex"
            flexDirection="column"
            alignItems="center"
            animation={`${scrollAnimation} 2s ease-in-out infinite`}
            zIndex={3}
          >
            <Text color="white" fontSize="sm" mb={3} textShadow="1px 1px 2px rgba(0,0,0,0.5)">
              Scroll to connect
            </Text>
            <ChevronDownIcon color="white" boxSize={8} filter="drop-shadow(1px 1px 2px rgba(0,0,0,0.5))" />
          </Box>
        </Box>
      </Box>

      {/* Content Section */}
      <Box 
        position="relative" 
        bg={bgColor}
        marginTop="87vh"
        borderTopRadius="3xl"
        zIndex={2}
        boxShadow="0px -10px 30px rgba(0,0,0,0.2)"
        minH="100vh"
        pb={20}
      >
        <Container maxW="800px" py={20}>
          <motion.div
            ref={formRef}
            animate={{ 
              opacity: isFormInView ? 1 : 0,
              y: isFormInView ? 0 : 50,
            }}
            transition={{ duration: 0.6 }}
          >
            <VStack spacing={12} align="stretch">
              <Text
                fontSize={{ base: 'lg', md: 'xl' }}
                textAlign="center"
                color={textColor}
                lineHeight="tall"
              >
                I'd love to hear about your photography needs. Whether it's a portrait session, 
                event coverage, or a creative project, let's discuss how we can bring your vision to life.
              </Text>

              <HStack spacing={8} justify="center" wrap="wrap" gap={4}>
                <Button
                  size="lg"
                  leftIcon={<Icon as={FaWhatsapp} boxSize={6} />}
                  position="relative"
                  overflow="hidden"
                  bg="rgba(37, 211, 102, 0.9)"
                  backdropFilter="blur(10px)"
                  border="1px solid rgba(255, 255, 255, 0.1)"
                  color="white"
                  _before={{
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    bg: 'linear-gradient(45deg, rgba(37, 211, 102, 0.5), rgba(18, 140, 126, 0.5))',
                    opacity: 0,
                    transition: 'opacity 0.3s ease',
                  }}
                  _hover={{
                    transform: 'translateY(-3px) scale(1.02)',
                    boxShadow: '0 10px 20px rgba(37, 211, 102, 0.2)',
                    _before: {
                      opacity: 1,
                    }
                  }}
                  _active={{
                    transform: 'translateY(-1px)',
                    boxShadow: '0 5px 10px rgba(37, 211, 102, 0.2)',
                  }}
                  px={10}
                  py={7}
                  fontSize="xl"
                  fontWeight="medium"
                  onClick={handleWhatsAppClick}
                  transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                  boxShadow="0 5px 15px rgba(37, 211, 102, 0.15)"
                  borderRadius="2xl"
                >
                  <Box as="span" position="relative" zIndex={1}>
                    WhatsApp
                  </Box>
                </Button>

                <Button
                  size="lg"
                  leftIcon={<Icon as={FaInstagram} boxSize={6} />}
                  position="relative"
                  overflow="hidden"
                  bg="linear-gradient(45deg, rgba(240, 148, 51, 0.9), rgba(230, 104, 60, 0.9), rgba(220, 39, 67, 0.9), rgba(204, 35, 102, 0.9), rgba(188, 24, 136, 0.9))"
                  backdropFilter="blur(10px)"
                  border="1px solid rgba(255, 255, 255, 0.1)"
                  color="white"
                  _before={{
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    bg: 'linear-gradient(45deg, rgba(240, 148, 51, 0.8), rgba(220, 39, 67, 0.8), rgba(188, 24, 136, 0.8))',
                    opacity: 0,
                    transition: 'opacity 0.3s ease',
                  }}
                  _hover={{
                    transform: 'translateY(-3px) scale(1.02)',
                    boxShadow: '0 10px 20px rgba(220, 39, 67, 0.2)',
                    _before: {
                      opacity: 1,
                    }
                  }}
                  _active={{
                    transform: 'translateY(-1px)',
                    boxShadow: '0 5px 10px rgba(220, 39, 67, 0.2)',
                  }}
                  px={10}
                  py={7}
                  fontSize="xl"
                  fontWeight="medium"
                  onClick={handleInstagramClick}
                  transition="all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
                  boxShadow="0 5px 15px rgba(220, 39, 67, 0.15)"
                  borderRadius="2xl"
                >
                  <Box as="span" position="relative" zIndex={1}>
                    Instagram
                  </Box>
                </Button>
              </HStack>

              <Text
                fontSize="sm"
                color="gray.500"
                textAlign="center"
              >
                Choose your preferred way to connect
              </Text>
            </VStack>
          </motion.div>
        </Container>
      </Box>
    </Box>
  );
};

export default Contact; 