import { Box, VStack, Text, Flex, Button, Icon, Spinner } from '@chakra-ui/react';
import { FaWhatsapp, FaInstagram, FaRegEnvelope, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';
import { Helmet } from 'react-helmet-async';
import { motion, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4';
import { trackContactSubmission } from '../utils/analytics';

const MotionDiv = motion.div;

interface AutoReplyPayload {
  name: string;
  email: string;
  shoot_type: string;
  message: string;
  botcheck: string;
}

type AutoReplyStatus = 'idle' | 'loading' | 'success' | 'failed';

const ThankYou = () => {
  const contentRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(contentRef, { once: true, amount: 0.15 });

  const location = useLocation();
  const autoReplyPayload =
    (location.state as { autoReplyPayload?: AutoReplyPayload } | null)?.autoReplyPayload ?? null;
  const [autoReplyStatus, setAutoReplyStatus] = useState<AutoReplyStatus>(
    autoReplyPayload ? 'loading' : 'idle'
  );

  useEffect(() => {
    ReactGA.event('generate_lead', {
      event_category: 'Contact',
      event_label: 'Contact Form',
    });
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'conversion_event_submit_lead_form_1', {});
    }
  }, []);

  // Fire the auto-reply request once on mount if we have a payload
  useEffect(() => {
    if (!autoReplyPayload) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(autoReplyPayload),
        });
        const data = await res.json().catch(() => ({ success: false }));
        if (cancelled) return;
        setAutoReplyStatus(data?.success ? 'success' : 'failed');
      } catch {
        if (cancelled) return;
        setAutoReplyStatus('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoReplyPayload]);

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
                  {autoReplyPayload ? (
                    <>
                      Your message is in. I'm sending you a quick confirmation from{' '}
                      <Text as="span" color="#c9a96e">vero@vero.photography</Text> right now — and I'll personally reply within 24 hours.
                    </>
                  ) : (
                    <>Your message is in. I'll personally reply within 24 hours.</>
                  )}
                </Text>
              </VStack>

              {/* Auto-reply status block */}
              {autoReplyPayload && (
                <AutoReplyStatusBlock status={autoReplyStatus} />
              )}

              {/* Generic spam warning for users who land here without submitting */}
              {!autoReplyPayload && (
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
  if (status === 'loading') {
    return (
      <Box
        w="100%"
        maxW="460px"
        bg="rgba(201, 169, 110, 0.08)"
        borderLeft="2px solid #c9a96e"
        px={5}
        py={4}
      >
        <Flex align="center" gap={3} mb={2}>
          <Spinner size="sm" color="#c9a96e" thickness="2px" speed="0.8s" />
          <Text
            fontSize="xs"
            color="whiteAlpha.900"
            fontWeight="500"
            letterSpacing="0.1em"
            textTransform="uppercase"
          >
            Sending Confirmation Email…
          </Text>
        </Flex>
        <Text fontSize="sm" color="whiteAlpha.700" fontWeight="300" lineHeight="1.7">
          This usually takes a few seconds. Hang tight.
        </Text>
      </Box>
    );
  }

  if (status === 'success') {
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
            Check your inbox now. If it landed in <Text as="span" color="#c9a96e" fontWeight="400">Spam</Text> or <Text as="span" color="#c9a96e" fontWeight="400">Promotions</Text>, please mark it as <Text as="span" color="#c9a96e" fontWeight="400">Not Spam</Text> — that way my real reply lands in your inbox.
          </Text>
        </Box>
      </MotionDiv>
    );
  }

  if (status === 'failed') {
    return (
      <MotionDiv
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{ width: '100%', maxWidth: '460px' }}
      >
        <Box
          bg="rgba(246, 173, 85, 0.08)"
          borderLeft="2px solid #f6ad55"
          px={5}
          py={4}
        >
          <Flex align="center" gap={3} mb={2}>
            <Icon as={FaExclamationCircle} color="#f6ad55" boxSize={4} />
            <Text
              fontSize="xs"
              color="whiteAlpha.900"
              fontWeight="500"
              letterSpacing="0.1em"
              textTransform="uppercase"
            >
              Confirmation Couldn't Send
            </Text>
          </Flex>
          <Text fontSize="sm" color="whiteAlpha.800" fontWeight="300" lineHeight="1.7">
            No worries — I still got your message and will personally reach out within 24 hours. My reply might land in <Text as="span" color="#c9a96e" fontWeight="400">Spam</Text> or <Text as="span" color="#c9a96e" fontWeight="400">Promotions</Text>, so please check there too.
          </Text>
        </Box>
      </MotionDiv>
    );
  }

  return null;
};

export default ThankYou;
