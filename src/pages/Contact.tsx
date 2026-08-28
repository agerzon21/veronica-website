import { Box, VStack, Text, Icon, Flex, Input, Textarea, Select } from '@chakra-ui/react';
import CTAButton from '../components/ui/CTAButton';
import { FaWhatsapp, FaInstagram, FaRegEnvelope } from 'react-icons/fa';
import { Helmet } from 'react-helmet-async';
import { motion, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trackContactSubmission } from '../utils/analytics';
import { prefetchChunk } from '../components/ChunkErrorBoundary';

const MotionDiv = motion.div;

const inputStyles = {
  // Higher-contrast fields. The old whiteAlpha.100/200 combo blended into any
  // bright spots on the background photo — boundaries vanished. Going darker
  // + more opaque so the field is a clearly defined container regardless of
  // what's behind it.
  bg: 'blackAlpha.500',
  border: '1px solid',
  borderColor: 'whiteAlpha.300',
  color: 'white',
  _placeholder: { color: 'whiteAlpha.500', fontWeight: '300' },
  _hover: { borderColor: 'whiteAlpha.500' },
  _focus: {
    borderColor: '#c9a96e',
    boxShadow: '0 0 0 1px #c9a96e',
    bg: 'blackAlpha.600',
  },
  fontSize: 'sm',
  fontWeight: '300',
  borderRadius: 'sm',
};

const labelStyles = {
  fontSize: '2xs',
  fontWeight: '500',
  color: '#c9a96e',
  letterSpacing: '0.2em',
  textTransform: 'uppercase' as const,
  mb: 1.5,
};

const Contact = () => {
  const contentRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(contentRef, { once: true, amount: 0.15 });
  const navigate = useNavigate();

  // ThankYou is a lazy route now, so submitting would otherwise trigger a
  // chunk fetch between the POST and the Google Ads conversion firing. Warm it
  // as soon as someone lands on /contact — by the time they finish typing it
  // is already in memory, and submit -> conversion has no network gap.
  useEffect(() => {
    prefetchChunk(() => import('./ThankYou'));
  }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    const formData = new FormData(e.currentTarget);

    // date + location are optional, so they may be empty strings — that's
    // fine, the auto-reply template skips empty fields.
    const payload = {
      name: String(formData.get('name') || ''),
      email: String(formData.get('email') || ''),
      shoot_type: String(formData.get('shoot_type') || ''),
      date: String(formData.get('date') || ''),
      location: String(formData.get('location') || ''),
      message: String(formData.get('message') || ''),
      botcheck: String(formData.get('botcheck') || ''),
    };

    try {
      // Submit and WAIT before navigating.
      //
      // This used to POST to Web3Forms here and let the thank-you page fire
      // /api/contact from a useEffect after the route changed. That window
      // was a real hole: closing the tab, backgrounding on mobile, or a
      // flaky connection during the navigation aborted the request, and the
      // lead vanished from our side — no database row, no notification to
      // Vero, no conversation in the inbox — while Web3Forms had already
      // emailed her. Awaiting it here closes that.
      //
      // The cost is a slightly longer spinner, since this one request does
      // the database write, the customer's auto-reply, Vero's notification,
      // and the inbox thread. Worth it: a failure now keeps the user on the
      // form with their answers intact and lets them retry, instead of
      // stranding them on a thank-you page with an error and no data.
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({ success: false }));

      if (response.ok && data.success) {
        // submissionId only dedupes the analytics conversion event on a
        // back-navigation now — there is no longer a network side effect on
        // the thank-you page to guard.
        const submissionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        // emailId is Resend's id for the auto-reply. The thank-you page
        // polls it so the confirmation reflects ACTUAL delivery to the
        // customer's mail server, not a timer.
        navigate('/contact/thank-you', {
          state: { submissionId, emailId: data.emailId ?? null },
        });
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
    <Box position="relative" minH="100vh" overflow="hidden" bg="#0a0a0a">
      <Helmet>
        <meta property="og:image" content="https://vero.photography/assets/photos/site/contact-bg.webp" />
      </Helmet>
      {/* Full background photo. `cover` + `no-repeat` is critical here — the
          form makes the page taller than the image's natural rendered height
          on mobile, and without no-repeat the image was tiling vertically,
          creating a visible "stitched" line between the legs and torsos of
          the couple. bg="#0a0a0a" on the parent is a safety net so any area
          the image doesn't cover stays dark instead of going white. */}
      <Box
        position="absolute"
        inset={0}
        backgroundImage="url('/assets/photos/site/contact-bg.webp')"
        backgroundSize="cover"
        backgroundPosition={{ base: '13% 30%', md: 'center' }}
        backgroundRepeat="no-repeat"
        filter="brightness(0.4)"
      />
      {/* Soft top gradient so the heading text is always readable regardless
          of which slice of the photo is showing through. */}
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        h={{ base: '40vh', md: '30vh' }}
        bgGradient="linear(to-b, rgba(0,0,0,0.55), rgba(0,0,0,0))"
        pointerEvents="none"
      />

      {/* Content — centered */}
      <Flex
        position="relative"
        zIndex={2}
        minH="100vh"
        align="flex-start"
        justify="center"
        px={6}
        pt={{ base: 28, md: 28 }}
        pb={{ base: 24, md: 16 }}
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
                  as="h1"
                  fontSize={{ base: '3xl', md: '4xl' }}
                  fontWeight="200"
                  color="white"
                  textTransform="uppercase"
                  letterSpacing="0.3em"
                  textAlign="center"
                  m={0}
                >
                  Book a Session
                </Text>
                <Box w="40px" h="1px" bg="#c9a96e" />
                <Text
                  fontSize={{ base: 'sm', md: 'md' }}
                  color="whiteAlpha.900"
                  textAlign="center"
                  fontWeight="300"
                  lineHeight="1.9"
                  maxW="400px"
                >
                  Tell me about your vision and let's create something beautiful together.
                </Text>
              </VStack>

              {/* Form — wrapped in a dark backdrop card so fields read consistently
                  regardless of what's behind on the photo. Padded, subtle border
                  + backdrop blur for the glass effect that stays consistent with
                  the rest of the site. */}
              <Box
                as="form"
                onSubmit={handleSubmit}
                w="100%"
                bg="rgba(0, 0, 0, 0.55)"
                border="1px solid"
                borderColor="whiteAlpha.200"
                borderRadius="sm"
                px={{ base: 5, md: 8 }}
                py={{ base: 6, md: 8 }}
                backdropFilter="blur(8px)"
              >
                  {/* Honeypot for spam */}
                  <input type="hidden" name="botcheck" style={{ display: 'none' }} />

                  <VStack spacing={4} w="100%">
                    {/* Row 1: Name + Email */}
                    <Flex gap={4} w="100%" direction={{ base: 'column', sm: 'row' }}>
                      <Box w="100%">
                        <Text as="label" htmlFor="name" {...labelStyles} display="block">Name *</Text>
                        <Input
                          id="name"
                          name="name"
                          placeholder="Your name"
                          required
                          {...inputStyles}
                          h="48px"
                        />
                      </Box>
                      <Box w="100%">
                        <Text as="label" htmlFor="email" {...labelStyles} display="block">Email *</Text>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          placeholder="you@example.com"
                          required
                          {...inputStyles}
                          h="48px"
                        />
                      </Box>
                    </Flex>

                    {/* Row 2: Type + Date + Location. Three columns on tablet+,
                        stacked on mobile. Date uses native HTML5 picker — the
                        color-scheme: dark hint makes the calendar icon visible
                        on the dark form. */}
                    <Flex gap={4} w="100%" direction={{ base: 'column', md: 'row' }}>
                      <Box w="100%">
                        <Text as="label" htmlFor="shoot_type" {...labelStyles} display="block">Type *</Text>
                        <Select
                          id="shoot_type"
                          name="shoot_type"
                          required
                          defaultValue=""
                          {...inputStyles}
                          h="48px"
                          sx={{
                            '& option': { bg: '#1a1a1a', color: 'white' },
                          }}
                        >
                          <option value="" disabled hidden>Choose one</option>
                          <option value="Portrait Session">Portrait</option>
                          <option value="Wedding Photography">Wedding</option>
                          <option value="Family Session">Family</option>
                          <option value="Maternity Session">Maternity</option>
                          <option value="Other">Other</option>
                        </Select>
                      </Box>
                      <Box w="100%">
                        <Text as="label" htmlFor="date" {...labelStyles} display="block">Preferred date</Text>
                        <Input
                          id="date"
                          name="date"
                          type="date"
                          {...inputStyles}
                          h="48px"
                          sx={{
                            colorScheme: 'dark',
                            '&::-webkit-calendar-picker-indicator': {
                              filter: 'invert(0.7) sepia(1) saturate(3) hue-rotate(5deg)',
                              cursor: 'pointer',
                            },
                          }}
                        />
                      </Box>
                      <Box w="100%">
                        <Text as="label" htmlFor="location" {...labelStyles} display="block">Location</Text>
                        <Input
                          id="location"
                          name="location"
                          placeholder="e.g. Scranton, Punta Cana"
                          {...inputStyles}
                          h="48px"
                        />
                      </Box>
                    </Flex>

                    {/* Row 3: Message */}
                    <Box w="100%">
                      <Text as="label" htmlFor="message" {...labelStyles} display="block">Message *</Text>
                      <Textarea
                        id="message"
                        name="message"
                        placeholder="Tell me about your project, your vision, anything else I should know..."
                        required
                        {...inputStyles}
                        rows={3}
                        resize="none"
                      />
                    </Box>

                    {error && (
                      <Text fontSize="sm" color="red.300" fontWeight="300">
                        {error}
                      </Text>
                    )}

                    <CTAButton
                      type="submit"
                      variant="solid"
                      size="lg"
                      fullWidth
                      isLoading={isSubmitting}
                      loadingText="Sending..."
                    >
                      Check Availability
                    </CTAButton>
                  </VStack>
                </Box>

              {/* Divider with "or" */}
              <Flex align="center" w="100%" gap={4}>
                <Box flex={1} h="1px" bg="whiteAlpha.400" />
                <Text fontSize="xs" color="whiteAlpha.900" fontWeight="400" letterSpacing="0.2em" textTransform="uppercase">
                  or reach out directly
                </Text>
                <Box flex={1} h="1px" bg="whiteAlpha.400" />
              </Flex>

              {/* Secondary contact methods — each is now a distinct card with a
                  bigger icon AND the actual contact value visible, so users
                  don't have to click to find out what they're getting. */}
              <Flex
                gap={{ base: 3, md: 4 }}
                direction={{ base: 'column', md: 'row' }}
                w="100%"
                justify="center"
              >
                {[
                  { icon: FaRegEnvelope, label: 'Email', value: 'vero@vero.photography', iconSize: 6, onClick: handleEmailClick },
                  { icon: FaWhatsapp, label: 'WhatsApp', value: '+1 (570) 909-5707', iconSize: 7, onClick: handleWhatsAppClick },
                  { icon: FaInstagram, label: 'Instagram', value: '@vero.art.photo', iconSize: 7, onClick: handleInstagramClick },
                ].map((method) => (
                  <Flex
                    key={method.label}
                    as="button"
                    type="button"
                    onClick={method.onClick}
                    direction={{ base: 'row', md: 'column' }}
                    align="center"
                    justify="center"
                    gap={{ base: 4, md: 2 }}
                    flex={1}
                    bg="rgba(0, 0, 0, 0.45)"
                    border="1px solid"
                    borderColor="whiteAlpha.300"
                    backdropFilter="blur(8px)"
                    px={{ base: 4, md: 5 }}
                    py={{ base: 3.5, md: 5 }}
                    cursor="pointer"
                    transition="all 0.3s"
                    _hover={{
                      borderColor: '#c9a96e',
                      bg: 'rgba(201, 169, 110, 0.12)',
                      transform: 'translateY(-2px)',
                    }}
                    sx={{ WebkitTapHighlightColor: 'transparent' }}
                    role="group"
                  >
                    <Icon
                      as={method.icon}
                      color="#c9a96e"
                      boxSize={method.iconSize}
                      transition="all 0.3s"
                      flexShrink={0}
                    />
                    <VStack spacing={0.5} align={{ base: 'flex-start', md: 'center' }}>
                      <Text
                        color="#c9a96e"
                        fontSize="2xs"
                        fontWeight="500"
                        letterSpacing="0.2em"
                        textTransform="uppercase"
                      >
                        {method.label}
                      </Text>
                      <Text
                        color="whiteAlpha.900"
                        fontSize="xs"
                        fontWeight="300"
                        letterSpacing="0.02em"
                        _groupHover={{ color: 'white' }}
                        transition="color 0.3s"
                      >
                        {method.value}
                      </Text>
                    </VStack>
                  </Flex>
                ))}
              </Flex>

              {/* Location */}
              <Text
                fontSize="xs"
                color="whiteAlpha.900"
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
