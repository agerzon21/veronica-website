import { Box, VStack, Text, Flex, Icon, Spinner } from '@chakra-ui/react';
import { FaWhatsapp, FaInstagram, FaRegEnvelope, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';
import { Helmet } from 'react-helmet-async';
import CTAButton from '../components/ui/CTAButton';
import { motion, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4';
import { ensureAnalytics, trackAdsLeadConversion, trackContactSubmission } from '../utils/analytics';

const MotionDiv = motion.div;

// idle      → direct visit / back-navigation; nothing was submitted here
// sending   → waiting on Resend to confirm the recipient accepted it
// delivered → the recipient's mail server confirmed receipt (green)
// pending   → sent fine, but no delivery confirmation inside our window
// failed    → bounced, rejected, or suppressed
//
// The distinction that matters: "Resend accepted it" is not "it arrived".
// This page promises the customer their confirmation is real, so it waits
// for the actual delivery event rather than assuming.
type AutoReplyStatus = 'idle' | 'sending' | 'delivered' | 'pending' | 'failed';

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
  const [{ justSubmitted, emailId }] = useState<{
    justSubmitted: boolean;
    emailId: string | null;
  }>(() => {
    const navState = location.state as
      | { submissionId?: string; emailId?: string | null }
      | null;
    const subId = navState?.submissionId ?? null;
    if (!subId || typeof window === 'undefined') {
      return { justSubmitted: false, emailId: null };
    }
    if (sessionStorage.getItem(`submitted:${subId}`) !== null) {
      return { justSubmitted: false, emailId: null };
    }
    sessionStorage.setItem(`submitted:${subId}`, '1');
    return { justSubmitted: true, emailId: navState?.emailId ?? null };
  });

  const [autoReplyStatus, setAutoReplyStatus] = useState<AutoReplyStatus>(
    justSubmitted ? (emailId ? 'sending' : 'pending') : 'idle',
  );

  // Poll Resend until the recipient's mail server actually accepts the
  // message. Restored from commit a0014d6 — it was disabled the day it
  // shipped because RESEND_API_KEY was sending-access and every read
  // returned a permission error, so the page fell back to a 10-second
  // timer and told customers "Confirmation Sent" on faith. The key is
  // full-access now, so the promise can be real again.
  useEffect(() => {
    if (!justSubmitted || !emailId) return;

    const POLL_INTERVAL_MS = 3000;
    const MAX_WAIT_MS = 60000;
    const TERMINAL_FAILURES = ['bounced', 'complained', 'failed', 'canceled', 'suppressed'];

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const poll = async () => {
      if (cancelled) return;
      let status: string | undefined;
      try {
        const res = await fetch(`/api/email-status?id=${encodeURIComponent(emailId)}`);
        const data = await res.json().catch(() => ({ status: 'unknown' }));
        status = data?.status;
      } catch {
        status = 'unknown';
      }
      if (cancelled) return;

      if (status === 'delivered') return setAutoReplyStatus('delivered');
      if (status && TERMINAL_FAILURES.includes(status)) return setAutoReplyStatus('failed');
      // queued / sent / delayed / unknown — still in transit. After the
      // window, stop waiting and say so honestly rather than showing a
      // green state we haven't earned.
      if (Date.now() - startedAt >= MAX_WAIT_MS) return setAutoReplyStatus('pending');
      timer = setTimeout(poll, POLL_INTERVAL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [justSubmitted, emailId]);

  useEffect(() => {
    // Only fire conversion signals on an actual fresh submission.
    // justSubmitted is false for direct visits, back-navigations, and page
    // refreshes (guarded by the sessionStorage dedup in the useState
    // initializer above), so this check prevents inflating Google Ads
    // conversion counts with people just landing on the URL.
    if (!justSubmitted) return;
    // gtag is deferred site-wide now, and this component reaches past the
    // analytics wrappers to ReactGA/window.gtag directly. Boot it first or
    // these three sends can land before the GA4 and Ads configs and be
    // silently discarded. Idempotent; a no-op when gtag is already up.
    ensureAnalytics();
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
                <Text as="h1" textStyle="pageTitle" color="white" textAlign="center" m={0}>
                  Thank you
                </Text>
                <Box w="40px" h="1px" bg="brand.accent" />
                <Text
                  textStyle="bodyLead"
                  color="whiteAlpha.800"
                  textAlign="center"
                  lineHeight="1.9"
                  maxW="440px"
                >
                  {justSubmitted ? (
                    <>
                      Your message is in. A confirmation is on its way from{' '}
                      <Text as="span" color="brand.accent">vero@vero.photography</Text> — and I'll personally reply within 24 hours.
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
                    My reply might land in your <Text as="span" color="brand.accentText" fontWeight="400">Spam</Text> or <Text as="span" color="brand.accentText" fontWeight="400">Promotions</Text> folder — please check there if you don't see it in your inbox.
                  </Text>
                </Box>
              )}

              <Box w="100%" maxW="320px">
                <CTAButton to="/" variant="solid" size="lg" fullWidth>
                  Back to home
                </CTAButton>
              </Box>

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
    data-group
  >
    <Flex h="24px" align="center"><Icon as={icon} color="brand.accent" boxSize={iconSize} transition="all 0.4s" /></Flex>
    <Text color="whiteAlpha.800" fontSize="xs" fontWeight="300" letterSpacing="0.15em" textTransform="uppercase"
      _groupHover={{ color: 'brand.accent' }} transition="all 0.4s"
    >
      {label}
    </Text>
  </VStack>
);

const AutoReplyStatusBlock = ({ status }: { status: AutoReplyStatus }) => {
  if (status === 'sending') {
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
          <Spinner size="sm" color="brand.accentText" thickness="2px" speed="0.8s" />
          <Text
            fontSize="xs"
            color="whiteAlpha.900"
            fontWeight="500"
            letterSpacing="0.1em"
            textTransform="uppercase"
          >
            Delivering Confirmation…
          </Text>
        </Flex>
        <Text fontSize="sm" color="whiteAlpha.700" fontWeight="300" lineHeight="1.7">
          Waiting for it to reach your inbox — this usually takes a few seconds. Hang tight.
        </Text>
      </Box>
    );
  }

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
            Look for an email from <Text as="span" color="brand.accent" fontWeight="400">vero@vero.photography</Text> — it's on its way and can take a couple of minutes to arrive. If you don't see it, <Text as="span" color="brand.accent" fontWeight="400">check your Spam or Promotions folder</Text>, and mark it as <Text as="span" color="brand.accent" fontWeight="400">Not Spam</Text> so my real reply reaches your inbox.
          </Text>
        </Box>
      </MotionDiv>
    );
  }

  if (status === 'pending') {
    return (
      <MotionDiv
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        style={{ width: '100%', maxWidth: '460px' }}
      >
        <Box
          bg="rgba(201, 169, 110, 0.08)"
          borderLeft="2px solid #c9a96e"
          px={5}
          py={4}
        >
          <Flex align="center" gap={3} mb={2}>
            <Icon as={FaRegEnvelope} color="brand.accentText" boxSize={4} />
            <Text
              fontSize="xs"
              color="whiteAlpha.900"
              fontWeight="500"
              letterSpacing="0.1em"
              textTransform="uppercase"
            >
              Confirmation On Its Way
            </Text>
          </Flex>
          <Text fontSize="sm" color="whiteAlpha.800" fontWeight="300" lineHeight="1.7">
            Your confirmation was sent and is taking a little longer than usual to land. Give it a minute or two, and <Text as="span" color="brand.accentText" fontWeight="400">check your Spam or Promotions folder</Text> if it's not in your inbox.
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
            No worries — I still got your message and will personally reach out within 24 hours. My reply might land in <Text as="span" color="brand.accent" fontWeight="400">Spam</Text> or <Text as="span" color="brand.accent" fontWeight="400">Promotions</Text>, so please check there too.
          </Text>
        </Box>
      </MotionDiv>
    );
  }

  return null;
};

export default ThankYou;
