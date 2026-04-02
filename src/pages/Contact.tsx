import { Box, VStack, Text, Icon, Flex } from '@chakra-ui/react';
import { FaWhatsapp, FaInstagram, FaRegEnvelope } from 'react-icons/fa';
import { Helmet } from 'react-helmet-async';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { trackContactSubmission } from '../utils/analytics';

const MotionDiv = motion.div;

const Contact = () => {
  const contentRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(contentRef, { once: true, amount: 0.15 });

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

  const handleEmailClick = () => {
    trackContactSubmission('Email');
    window.location.href = 'mailto:vero@vero.photography?subject=Photography%20Inquiry';
  };

  return (
    <Box position="relative" minH="100vh" overflow="hidden">
      <Helmet>
        <meta property="og:image" content="https://vero.photography/assets/photos/contact-bg.webp" />
      </Helmet>
      {/* Full background photo */}
      <Box
        position="absolute"
        inset={0}
        backgroundImage="url('/assets/photos/contact-bg.webp')"
        backgroundSize={{ base: '300%', md: 'cover' }}
        backgroundPosition={{ base: '25% center', md: 'center' }}
        filter="brightness(0.4)"
      />

      {/* Content — centered */}
      <Flex
        position="relative"
        zIndex={2}
        minH="100vh"
        align="center"
        justify="center"
        px={6}
      >
        <Box ref={contentRef} w="100%" maxW="700px">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <VStack spacing={12}>
              {/* Heading */}
              <VStack spacing={4}>
                <Text
                  fontSize={{ base: '3xl', md: '4xl' }}
                  fontWeight="200"
                  color="white"
                  textTransform="uppercase"
                  letterSpacing="0.3em"
                  textAlign="center"
                >
                  Get in Touch
                </Text>
                <Box w="40px" h="1px" bg="#c9a96e" />
                <Text
                  fontSize={{ base: 'sm', md: 'md' }}
                  color="whiteAlpha.700"
                  textAlign="center"
                  fontWeight="300"
                  lineHeight="1.9"
                  maxW="400px"
                >
                  I'd love to hear about your vision. Let's create something beautiful together.
                </Text>
              </VStack>

              {/* Contact methods — equal width, spaced out */}
              <Flex
                gap={{ base: 6, md: 16 }}
                direction={{ base: 'column', sm: 'row' }}
                w="100%"
                justify="center"
              >
                <VStack
                  as="button"
                  onClick={handleEmailClick}
                  cursor="pointer"
                  spacing={3}
                  w={{ sm: '140px' }}
                  transition="all 0.4s"
                  _hover={{ transform: 'translateY(-3px)', '& svg': { color: 'white' } }}
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                  role="group"
                >
                  <Icon as={FaRegEnvelope} color="#c9a96e" boxSize={6} transition="all 0.4s" />
                  <Text color="whiteAlpha.800" fontSize="xs" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase"
                    _groupHover={{ color: '#c9a96e' }} transition="all 0.4s"
                    textIndent="0.15em"
                  >
                    Email
                  </Text>
                </VStack>

                <VStack
                  as="button"
                  onClick={handleWhatsAppClick}
                  cursor="pointer"
                  spacing={3}
                  w={{ sm: '140px' }}
                  transition="all 0.4s"
                  _hover={{ transform: 'translateY(-3px)', '& svg': { color: 'white' } }}
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                  role="group"
                >
                  <Icon as={FaWhatsapp} color="#c9a96e" boxSize={7} transition="all 0.4s" />
                  <Text color="whiteAlpha.800" fontSize="xs" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase"
                    _groupHover={{ color: '#c9a96e' }} transition="all 0.4s"
                  >
                    WhatsApp
                  </Text>
                </VStack>

                <VStack
                  as="button"
                  onClick={handleInstagramClick}
                  cursor="pointer"
                  spacing={3}
                  w={{ sm: '140px' }}
                  transition="all 0.4s"
                  _hover={{ transform: 'translateY(-3px)', '& svg': { color: 'white' } }}
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                  role="group"
                >
                  <Icon as={FaInstagram} color="#c9a96e" boxSize={7} transition="all 0.4s" />
                  <Text color="whiteAlpha.800" fontSize="xs" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase"
                    _groupHover={{ color: '#c9a96e' }} transition="all 0.4s"
                  >
                    Instagram
                  </Text>
                </VStack>
              </Flex>

              {/* Location */}
              <Text
                fontSize="xs"
                color="whiteAlpha.600"
                fontWeight="300"
                letterSpacing="0.15em"
                textTransform="uppercase"
                textAlign="center"
              >
                Scranton, PA · Available Worldwide
              </Text>
            </VStack>
          </MotionDiv>
        </Box>
      </Flex>
    </Box>
  );
};

export default Contact;
