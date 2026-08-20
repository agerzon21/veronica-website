import { Box, VStack, Text, Flex, Button, Icon } from '@chakra-ui/react';
import { FaWhatsapp, FaInstagram, FaRegEnvelope, FaCheckCircle } from 'react-icons/fa';
import { Helmet } from 'react-helmet-async';
import { motion, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4';
import { trackAdsLeadConversion, trackContactSubmission } from '../utils/analytics';

const MotionDiv = motion.div;

// idle      → direct visit / back-navigation; nothing was submitted here
// delivered → the submission (and its auto-reply) already completed
//
// 'sending' / 'pending' / 'failed' are gone: this page no longer performs
// the submission. Contact.tsx awaits /api/contact before navigating, so by
// the time we render, the work is done — and a failure never gets here at
// all, it keeps the user on the form with their answers intact.
type AutoReplyStatus = 'idle' | 'delivered';

const ThankYou = () => {
  const contentRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(contentRef, { once: true, amount: 0.15 });

  const location = useLocation();

  // Did the user actually just submit the form, or did they land here
  // directly / navigate back?
  //
  // Resolved ONCE on mount via useState's lazy initializer so later renders
  // can't flip the answer out from under the rendered content.
  //
  // The sessionStorage marker no longer guards a network call — Contact.tsx
  // performs the submission before navigating here. It exists purely so a
  // back-navigation doesn't re-fire the Google Ads conversion event and
  // inflate lead counts.
  const [justSubmitted] = useState<boolean>(() => {
    const navState = location.state as { submissionId?: string } | null;
    const subId = navState?.submissionId ?? null;
    if (!subId) return false;
    if (typeof window === 'undefined') return false;
    if (sessionStorage.getItem(`submitted:${subId}`) !== null) return false;
    sessionStorage.setItem(`submitted:${subId}`, '1');
    return true;
  });

  const autoReplyStatus: AutoReplyStatus = justSubmitted ? 'delivered' : 'idle';

  useEffect(() => {
    // Only fire conversion signals on an actual fresh submission.
    // justSubmitted is false for direct visits, back-navigations, and page
    // refreshes (guarded by the sessionStorage dedup in the useState
    // initializer above), so this check prevents inflating Google Ads
    // conversion counts with people just landing on the URL.
    if (!justSubmitted) return;
    ReactGA.event('generate_lead', {
      event_category: 'Contact',
      event_label: 'Contact Form',
    });
    // Kept the older generic event alongside the new attributed one in
    // case any existing GA4 report keys off the custom name.
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'conversion_event_submit_lead_form_1', {});
    }
    // Google Ads lead-form conversion. Reports to AW-18082198928.
    trackAdsLeadConversion();
  }, [justSubmitted]);


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
        <meta property="og:image" content="https://vero.photography/assets/photos/site/contact-bg.webp" />
      </Helmet>

      <Box
        position="absolute"
        inset={0}
        backgroundImage="url('/assets/photos/site/contact-bg.webp')"
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
              {/* Header */}
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
                  color="whiteAlpha.800"
                  textAlign="center"
                  fontWeight="300"
                  lineHeight="1.9"
                  maxW="440px"
                >
                  {justSubmitted ? (
                    <>
                      Your message is in. A confirmation is on its way from{' '}
                      <Text as="span" color="#c9a96e">vero@vero.photography</Text> — and I'll personally reply within 24 hours.
                    </>
                  ) : (
                    <>Your message is in. I'll personally reply within 24 hours.</>
                  )}
                </Text>
              </VStack>

              {/* Auto-reply status block */}
              {justSubmitted && (
                <AutoReplyStatusBlock status={autoReplyStatus} />
              )}

              {/* Generic spam warning for users who land here without submitting */}
              {!justSubmitted && (
                <Box
                  w="100%"
                  maxW="460px"
                  bg="rgba(201, 169, 110, 0.08)"
                  borderLeft="2px solid #c9a96e"
                  px={5}
                  py={4}
                >
                  <Text fontSize="xs" color="whiteAlpha.900" fontWeight="500" letterSpacing="0.1em" textTransform="uppercase" mb={2}>
                    Heads up
                  </Text>
                  <Text fontSize="sm" color="whiteAlpha.800" fontWeight="300" lineHeight="1.7">
                    My reply might land in your <Text as="span" color="#c9a96e" fontWeight="400">Spam</Text> or <Text as="span" color="#c9a96e" fontWeight="400">Promotions</Text> folder — please check there if you don't see it in your inbox.
                  </Text>
                </Box>
              )}

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

              <Flex align="center" w="100%" gap={4}>
                <Box flex={1} h="1px" bg="whiteAlpha.200" />
                <Text fontSize="xs" color="whiteAlpha.700" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase">
                  or message me directly
                </Text>
                <Box flex={1} h="1px" bg="whiteAlpha.200" />
              </Flex>

              <Flex gap={{ base: 6, md: 16 }} direction="row" justify="center">
                <ContactPill icon={FaWhatsapp} label="WhatsApp" iconSize={6} onClick={handleWhatsAppClick} />
                <ContactPill icon={FaInstagram} label="Instagram" iconSize={6} onClick={handleInstagramClick} />
                <ContactPill icon={FaRegEnvelope} label="Email" iconSize={5} onClick={handleEmailClick} />
              </Flex>
            </VStack>
          </MotionDiv>
        </Box>
      </Flex>
    </Box>
  );
};

interface ContactPillProps {
  icon: React.ElementType;
  label: string;
  iconSize: number;
  onClick: () => void;
}

const ContactPill = ({ icon, label, iconSize, onClick }: ContactPillProps) => (
  <VStack
    as="button"
    type="button"
    onClick={onClick}
    cursor="pointer"
    spacing={2}
    transition="all 0.4s"
    _hover={{ transform: 'translateY(-3px)', '& svg': { color: 'white' } }}
    sx={{ WebkitTapHighlightColor: 'transparent' }}
    role="group"
  >
    <Flex h="24px" align="center"><Icon as={icon} color="#c9a96e" boxSize={iconSize} transition="all 0.4s" /></Flex>
    <Text color="whiteAlpha.800" fontSize="xs" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase"
      _groupHover={{ color: '#c9a96e' }} transition="all 0.4s"
    >
      {label}
    </Text>
  </VStack>
);

const AutoReplyStatusBlock = ({ status }: { status: AutoReplyStatus }) => {
  if (status === 'delivered') {
    return (
      <MotionDiv
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{ width: '100%', maxWidth: '460px' }}
      >
        <Box
          bg="rgba(104, 211, 145, 0.08)"
          borderLeft="2px solid #68d391"
          px={5}
          py={4}
        >
          <Flex align="center" gap={3} mb={2}>
            <Icon as={FaCheckCircle} color="#68d391" boxSize={4} />
            <Text
              fontSize="xs"
              color="whiteAlpha.900"
              fontWeight="500"
              letterSpacing="0.1em"
              textTransform="uppercase"
            >
              Confirmation Sent
            </Text>
          </Flex>
          <Text fontSize="sm" color="whiteAlpha.800" fontWeight="300" lineHeight="1.7">
            Look for an email from <Text as="span" color="#c9a96e" fontWeight="400">vero@vero.photography</Text> — it's on its way and can take a couple of minutes to arrive. If you don't see it, <Text as="span" color="#c9a96e" fontWeight="400">check your Spam or Promotions folder</Text>, and mark it as <Text as="span" color="#c9a96e" fontWeight="400">Not Spam</Text> so my real reply reaches your inbox.
          </Text>
        </Box>
      </MotionDiv>
    );
  }

  return null;
};

export default ThankYou;
