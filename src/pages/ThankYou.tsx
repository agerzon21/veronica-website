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

// sending  → request in flight / waiting on delivery confirmation (spinner)
// delivered → recipient mail server confirmed receipt (green)
// pending  → sent OK but delivery not confirmed within our wait window
// failed   → the send itself failed, or the message bounced
type AutoReplyStatus = 'idle' | 'sending' | 'delivered' | 'pending' | 'failed';

const ThankYou = () => {
  const contentRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(contentRef, { once: true, amount: 0.15 });

  const location = useLocation();

  // Read the nav state and apply dedup ONCE on mount via useState's lazy
  // initializer. We can't recompute on every render because the useEffect
  // below sets a sessionStorage marker as soon as the fetch starts —
  // re-evaluating on later renders would flip the dedup decision and hide
  // the success/failed status block we just rendered.
  //
  // On a fresh form submit: marker is absent → autoReplyPayload is the real
  //   payload → spinner shows → fetch fires → status updates → status block
  //   stays visible because this useState value doesn't change.
  // On back-navigation re-mount: marker is present → autoReplyPayload is
  //   null on first render → renders the direct-visit variant, no re-fire.
  const [{ autoReplyPayload, submissionId }] = useState<{
    autoReplyPayload: AutoReplyPayload | null;
    submissionId: string | null;
  }>(() => {
    const navState = location.state as
      | { autoReplyPayload?: AutoReplyPayload; submissionId?: string }
      | null;
    const rawPayload = navState?.autoReplyPayload ?? null;
    const subId = navState?.submissionId ?? null;
    if (!rawPayload || !subId) {
      return { autoReplyPayload: null, submissionId: subId };
    }
    if (
      typeof window !== 'undefined' &&
      sessionStorage.getItem(`auto-reply-sent:${subId}`) !== null
    ) {
      return { autoReplyPayload: null, submissionId: subId };
    }
    return { autoReplyPayload: rawPayload, submissionId: subId };
  });

  const [autoReplyStatus, setAutoReplyStatus] = useState<AutoReplyStatus>(
    autoReplyPayload ? 'sending' : 'idle'
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

  // Fire the auto-reply request once on mount if we have a payload, then poll
  // Resend for the delivery status. We only flip to the green "delivered" state
  // once the recipient's mail server has actually accepted the message — not
  // when Resend merely queued it (which lands seconds before real delivery).
  useEffect(() => {
    if (!autoReplyPayload || !submissionId) return;
    // Mark this submission as processed BEFORE the fetch resolves, so a
    // back-navigation that re-mounts the component doesn't re-fire it.
    sessionStorage.setItem(`auto-reply-sent:${submissionId}`, '1');

    const POLL_INTERVAL_MS = 3000;
    const MAX_WAIT_MS = 60000;
    // Resend events that mean we're done waiting, one way or the other.
    const DELIVERED = 'delivered';
    const TERMINAL_FAILURES = ['bounced', 'complained', 'failed', 'canceled', 'suppressed'];

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const poll = async (emailId: string) => {
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

      if (status === DELIVERED) {
        setAutoReplyStatus('delivered');
        return;
      }
      if (status && TERMINAL_FAILURES.includes(status)) {
        setAutoReplyStatus('failed');
        return;
      }
      // queued / sent / delivery_delayed / unknown → still in transit. Give up
      // waiting after the window and show the soft "on its way" state; the
      // email was sent, we just haven't seen the delivery confirmation yet.
      if (Date.now() - startedAt >= MAX_WAIT_MS) {
        setAutoReplyStatus('pending');
        return;
      }
      timer = setTimeout(() => poll(emailId), POLL_INTERVAL_MS);
    };

    (async () => {
      try {
        const res = await fetch('/api/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(autoReplyPayload),
        });
        const data = await res.json().catch(() => ({ success: false }));
        if (cancelled) return;
        if (data?.success && data?.emailId) {
          poll(data.emailId);
        } else if (data?.success) {
          // Sent, but no id to track delivery against — can't poll, so show the
          // soft "on its way" state rather than a misleading green.
          setAutoReplyStatus('pending');
        } else {
          setAutoReplyStatus('failed');
        }
      } catch {
        if (cancelled) return;
        setAutoReplyStatus('failed');
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [autoReplyPayload, submissionId]);

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
          <Spinner size="sm" color="#c9a96e" thickness="2px" speed="0.8s" />
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
              Confirmation Delivered
            </Text>
          </Flex>
          <Text fontSize="sm" color="whiteAlpha.800" fontWeight="300" lineHeight="1.7">
            It just arrived from <Text as="span" color="#c9a96e" fontWeight="400">vero@vero.photography</Text>. If you don't see it in your inbox, <Text as="span" color="#c9a96e" fontWeight="400">check your Spam or Promotions folder</Text> — and mark it as <Text as="span" color="#c9a96e" fontWeight="400">Not Spam</Text> so my real reply reaches your inbox.
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
            <Icon as={FaRegEnvelope} color="#c9a96e" boxSize={4} />
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
            Your confirmation was sent and is taking a little longer than usual to land. Give it a minute or two, and <Text as="span" color="#c9a96e" fontWeight="400">check your Spam or Promotions folder</Text> if it's not in your inbox.
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
