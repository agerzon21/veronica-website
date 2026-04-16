import { Box, VStack, Text, Flex, Button, Icon } from '@chakra-ui/react';
import { FaWhatsapp, FaInstagram, FaRegEnvelope } from 'react-icons/fa';
import { Helmet } from 'react-helmet-async';
import { motion, useInView } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import ReactGA from 'react-ga4';
import { trackContactSubmission } from '../utils/analytics';

const MotionDiv = motion.div;

const ThankYou = () => {
  const contentRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(contentRef, { once: true, amount: 0.15 });

  useEffect(() => {
    ReactGA.event('generate_lead', {
      event_category: 'Contact',
      event_label: 'Contact Form',
    });
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'conversion_event_submit_lead_form_1', {});
    }
  }, []);

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
        <title>Thank You - Vero Photography</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:image" content="https://vero.photography/assets/photos/contact-bg.webp" />
      </Helmet>

      <Box
        position="absolute"
        inset={0}
        backgroundImage="url('/assets/photos/contact-bg.webp')"
        backgroundSize={{ base: '300%', md: 'cover' }}
        backgroundPosition={{ base: '25% center', md: 'center' }}
        filter="brightness(0.4)"
      />

      <Flex
        position="relative"
        zIndex={2}
        minH="100vh"
        align="center"
        justify="center"
        px={6}
        py={{ base: 24, md: 16 }}
      >
        <Box ref={contentRef} w="100%" maxW="520px">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <VStack spacing={10}>
              <VStack spacing={4}>
                <Text
                  fontSize={{ base: '3xl', md: '4xl' }}
                  fontWeight="200"
                  color="white"
                  textTransform="uppercase"
                  letterSpacing="0.3em"
                  textAlign="center"
                >
                  Thank You
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
                  Your inquiry has been sent. I'll get back to you within 24 hours.
                </Text>
              </VStack>

              <Button
                as={Link}
                to="/"
                w="100%"
                maxW="320px"
                h="52px"
                bg="#c9a96e"
                color="white"
                fontSize="sm"
                fontWeight="400"
                letterSpacing="0.2em"
                textTransform="uppercase"
                borderRadius="sm"
                _hover={{ bg: '#d4b87a', transform: 'translateY(-1px)' }}
                _active={{ bg: '#b8964f', transform: 'translateY(0)' }}
                transition="all 0.3s"
              >
                Back to Home
              </Button>

              {/* Divider with "or" */}
              <Flex align="center" w="100%" gap={4}>
                <Box flex={1} h="1px" bg="whiteAlpha.200" />
                <Text fontSize="xs" color="whiteAlpha.700" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase">
                  need a faster reply?
                </Text>
                <Box flex={1} h="1px" bg="whiteAlpha.200" />
              </Flex>

              {/* Secondary contact methods */}
              <Flex gap={{ base: 6, md: 16 }} direction="row" justify="center">
                <VStack
                  as="button"
                  type="button"
                  onClick={handleEmailClick}
                  cursor="pointer"
                  spacing={2}
                  transition="all 0.4s"
                  _hover={{ transform: 'translateY(-3px)', '& svg': { color: 'white' } }}
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                  role="group"
                >
                  <Flex h="24px" align="center"><Icon as={FaRegEnvelope} color="#c9a96e" boxSize={5} transition="all 0.4s" /></Flex>
                  <Text color="whiteAlpha.800" fontSize="xs" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase"
                    _groupHover={{ color: '#c9a96e' }} transition="all 0.4s"
                    textIndent="0.15em"
                  >
                    Email
                  </Text>
                </VStack>

                <VStack
                  as="button"
                  type="button"
                  onClick={handleWhatsAppClick}
                  cursor="pointer"
                  spacing={2}
                  transition="all 0.4s"
                  _hover={{ transform: 'translateY(-3px)', '& svg': { color: 'white' } }}
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                  role="group"
                >
                  <Flex h="24px" align="center"><Icon as={FaWhatsapp} color="#c9a96e" boxSize={6} transition="all 0.4s" /></Flex>
                  <Text color="whiteAlpha.800" fontSize="xs" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase"
                    _groupHover={{ color: '#c9a96e' }} transition="all 0.4s"
                  >
                    WhatsApp
                  </Text>
                </VStack>

                <VStack
                  as="button"
                  type="button"
                  onClick={handleInstagramClick}
                  cursor="pointer"
                  spacing={2}
                  transition="all 0.4s"
                  _hover={{ transform: 'translateY(-3px)', '& svg': { color: 'white' } }}
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                  role="group"
                >
                  <Flex h="24px" align="center"><Icon as={FaInstagram} color="#c9a96e" boxSize={6} transition="all 0.4s" /></Flex>
                  <Text color="whiteAlpha.800" fontSize="xs" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase"
                    _groupHover={{ color: '#c9a96e' }} transition="all 0.4s"
                  >
                    Instagram
                  </Text>
                </VStack>
              </Flex>
            </VStack>
          </MotionDiv>
        </Box>
      </Flex>
    </Box>
  );
};

export default ThankYou;
