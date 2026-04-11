import { Box, VStack, Text, Icon, Flex, Input, Textarea, Select, Button } from '@chakra-ui/react';
import { FaWhatsapp, FaInstagram, FaRegEnvelope } from 'react-icons/fa';
import { Helmet } from 'react-helmet-async';
import { motion, useInView } from 'framer-motion';
import { useRef, useState } from 'react';
import { trackContactSubmission } from '../utils/analytics';

const MotionDiv = motion.div;

const WEB3FORMS_KEY = '4cc6342e-8d13-4060-b349-7d4c91fc31fb';

const inputStyles = {
  bg: 'whiteAlpha.100',
  border: '1px solid',
  borderColor: 'whiteAlpha.200',
  color: 'white',
  _placeholder: { color: 'whiteAlpha.500' },
  _hover: { borderColor: 'whiteAlpha.400' },
  _focus: { borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' },
  fontSize: 'sm',
  fontWeight: '300',
  borderRadius: 'sm',
};

const Contact = () => {
  const contentRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(contentRef, { once: true, amount: 0.15 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    formData.append('access_key', WEB3FORMS_KEY);
    formData.append('subject', `New Inquiry — ${formData.get('shoot_type')} Session`);
    formData.append('from_name', 'Vero Photography Website');

    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (data.success) {
        trackContactSubmission('Form');
        setIsSubmitted(true);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        py={{ base: 24, md: 16 }}
      >
        <Box ref={contentRef} w="100%" maxW="520px">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <VStack spacing={10}>
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
                  Book a Session
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
                  Tell me about your vision and let's create something beautiful together.
                </Text>
              </VStack>

              {/* Form or Success State */}
              {isSubmitted ? (
                <VStack spacing={4} py={8}>
                  <Text
                    fontSize={{ base: 'xl', md: '2xl' }}
                    fontWeight="200"
                    color="#c9a96e"
                    textAlign="center"
                    letterSpacing="0.1em"
                  >
                    Thank you!
                  </Text>
                  <Text
                    fontSize="sm"
                    color="whiteAlpha.700"
                    textAlign="center"
                    fontWeight="300"
                    lineHeight="1.8"
                    maxW="350px"
                  >
                    Your inquiry has been sent. I'll get back to you within 24 hours.
                  </Text>
                </VStack>
              ) : (
                <Box as="form" onSubmit={handleSubmit} w="100%">
                  {/* Honeypot for spam */}
                  <input type="hidden" name="botcheck" style={{ display: 'none' }} />

                  <VStack spacing={4} w="100%">
                    <Flex gap={4} w="100%" direction={{ base: 'column', sm: 'row' }}>
                      <Input
                        name="name"
                        placeholder="Your Name"
                        required
                        {...inputStyles}
                        h="48px"
                      />
                      <Input
                        name="email"
                        type="email"
                        placeholder="Your Email"
                        required
                        {...inputStyles}
                        h="48px"
                      />
                    </Flex>

                    <Select
                      name="shoot_type"
                      required
                      {...inputStyles}
                      h="48px"
                      sx={{
                        '& option': { bg: '#1a1a1a', color: 'white' },
                      }}
                    >
                      <option value="" disabled selected hidden>Type of Session</option>
                      <option value="Portrait Session">Portrait Session</option>
                      <option value="Wedding Photography">Wedding Photography</option>
                      <option value="Family Session">Family Session</option>
                      <option value="Maternity Session">Maternity Session</option>
                      <option value="Other">Other</option>
                    </Select>

                    <Textarea
                      name="message"
                      placeholder="Tell me about your project, preferred dates, location..."
                      required
                      {...inputStyles}
                      rows={4}
                      resize="none"
                    />

                    {error && (
                      <Text fontSize="sm" color="red.300" fontWeight="300">
                        {error}
                      </Text>
                    )}

                    <Button
                      type="submit"
                      isLoading={isSubmitting}
                      loadingText="Sending..."
                      w="100%"
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
                      Check Availability
                    </Button>
                  </VStack>
                </Box>
              )}

              {/* Divider with "or" */}
              <Flex align="center" w="100%" gap={4}>
                <Box flex={1} h="1px" bg="whiteAlpha.200" />
                <Text fontSize="xs" color="whiteAlpha.400" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase">
                  or reach out directly
                </Text>
                <Box flex={1} h="1px" bg="whiteAlpha.200" />
              </Flex>

              {/* Secondary contact methods */}
              <Flex
                gap={{ base: 6, md: 16 }}
                direction="row"
                justify="center"
              >
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
                  <Text color="whiteAlpha.600" fontSize="xs" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase"
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
                  <Text color="whiteAlpha.600" fontSize="xs" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase"
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
                  <Text color="whiteAlpha.600" fontSize="xs" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase"
                    _groupHover={{ color: '#c9a96e' }} transition="all 0.4s"
                  >
                    Instagram
                  </Text>
                </VStack>
              </Flex>

              {/* Location */}
              <Text
                fontSize="xs"
                color="whiteAlpha.400"
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
