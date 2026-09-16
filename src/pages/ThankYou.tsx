import { Box, Flex, Grid, GridItem, Icon, Image, Spinner, Text } from '@chakra-ui/react';
import FaCheckCircle from '../icons/fa/FaCheckCircle';
import FaExclamationCircle from '../icons/fa/FaExclamationCircle';
import FaRegEnvelope from '../icons/fa/FaRegEnvelope';
import { Helmet } from 'react-helmet-async';
import CTAButton from '../components/ui/CTAButton';
import PageHeader from '../components/ui/PageHeader';
import ContactRail, { SectionHead } from '../components/ContactRail';
import { m, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import ReactGA from 'react-ga4';
import { ensureAnalytics, trackAdsLeadConversion, trackContactSubmission } from '../utils/analytics';

const MotionDiv = m.div;

// idle      → direct visit / back-navigation; nothing was submitted here
// sending   → waiting on Resend to confirm the recipient accepted it
// delivered → the recipient's mail server confirmed receipt
// pending   → sent fine, but no delivery confirmation inside our window
// failed    → bounced, rejected, or suppressed
//
// The distinction that matters: "Resend accepted it" is not "it arrived".
// This page promises the customer their confirmation is real, so it waits
// for the actual delivery event rather than assuming.
type AutoReplyStatus = 'idle' | 'sending' | 'delivered' | 'pending' | 'failed';

const LEAD_SENT = (
  <>
    Your message is in. A confirmation is on its way from{' '}
    <Text as="span" color="brand.accentText" fontWeight="400">vero@vero.photography</Text>, and
    I'll personally reply within 24 hours.
  </>
);
// Their message arrived; the confirmation email did not. Promising one that
// bounced sends them watching an inbox for something that is never coming.
const LEAD_FAILED = <>Your message is in. I'll personally reply within 24 hours.</>;
// Nothing was submitted here, so nothing may be claimed.
const LEAD_IDLE = <>If you have already sent a message, I'll personally reply within 24 hours.</>;

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
  //
  // Gated on the submission state ONLY. Never on a motion preference: whether
  // a confirmation arrived is not an animation, and withholding the outcome
  // from someone who asked for less movement leaves them on a frozen spinner
  // with no result at all.
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

  const lead =
    autoReplyStatus === 'idle' ? LEAD_IDLE
    : autoReplyStatus === 'failed' ? LEAD_FAILED
    : LEAD_SENT;

  return (
    <Box position="relative" minH="100vh" bg="brand.surface">
      <Helmet>
        <title>Thank You - Vero Photography</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:image" content="https://vero.photography/assets/photos/site/contact-bg.webp" />
      </Helmet>

      {/* The same hero as /contact, unchanged. The page keeps its identity and
          only the working column changes state; rewriting the hero made the
          whole thing feel like a different site. */}
      <Box position="relative" h={{ base: '45vh', md: '53vh' }} overflow="hidden" bg="#3a342d">
        <Image
          src="/assets/photos/site/contact-bg.webp"
          alt=""
          w="100%"
          h="100%"
          objectFit="cover"
          objectPosition={{ base: '13% 30%', md: 'center 30%' }}
          fetchPriority="high"
        />
        <Box position="absolute" inset={0} bg="rgba(0,0,0,0.45)" />
        <Flex position="absolute" inset={0} align="center" justify="center" px={6} pt={{ base: '64px', md: '72px' }}>
          <Box maxW="46ch">
            <PageHeader
              onDark
              eyebrow="Get in touch"
              title="Book a session"
              lead="Tell me about your vision and let's create something beautiful together."
            />
          </Box>
        </Flex>
      </Box>

      <Box maxW="1120px" mx="auto" px={{ base: 5, md: 10 }} pt={{ base: 12, md: 16 }} pb={{ base: 16, md: '88px' }}>
        <MotionDiv
          ref={contentRef}
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <Grid
            templateColumns={{ base: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 320px' }}
            // 72px explicitly: 18 is not a Chakra spacing token and passes
            // through as a literal 18px. Kept identical to the contact page so
            // the two columns line up across the two routes.
            columnGap={{ lg: '72px' }}
            templateRows={{ lg: 'auto auto 1fr' }}
            templateAreas={{
              base: `"col" "reserve" "reach"`,
              lg: `"col reserve" "col reach" "col ."`,
            }}
          >
            <GridItem area="col" minW={0} alignSelf="start" w="100%" maxW={{ base: '640px', lg: 'none' }} mx="auto">
              <Box mb={7}>
                <Text
                  as="span"
                  display="block"
                  fontSize="0.6875rem"
                  fontWeight="500"
                  letterSpacing="0.32em"
                  textTransform="uppercase"
                  lineHeight="1"
                  color="brand.accentText"
                  mr="-0.32em"
                >
                  {/* Nothing was submitted on a direct visit, so the eyebrow
                      must not announce one. */}
                  {justSubmitted ? 'Sent' : 'Contact'}
                </Text>
                <Box w="40px" h="1px" bg="brand.accent" my={4} />
                <Text
                  as="h2"
                  fontFamily="heading"
                  fontWeight="300"
                  fontSize={{ base: '2.25rem', md: '2.75rem' }}
                  lineHeight="1.05"
                  color="gray.800"
                  m={0}
                >
                  Thank you
                </Text>
                <Text mt={3.5} fontSize={{ base: '1rem', md: '1.0625rem' }} fontWeight="300" lineHeight="1.75" color="brand.mutedText" maxW="46ch">
                  {lead}
                </Text>
              </Box>

              <SectionHead title="Your confirmation" />
              <AutoReplyStatusBlock status={autoReplyStatus} />

              <Box mt={8} maxW="320px" mx="auto">
                <CTAButton to="/" variant="solid" size="lg" fullWidth>
                  Back to home
                </CTAButton>
              </Box>
            </GridItem>

            <ContactRail onChannelClick={trackContactSubmission} />
          </Grid>
        </MotionDiv>
      </Box>
    </Box>
  );
};

/**
 * Four states, not two. A bounced confirmation has to say so: its whole job is
 * to stop someone watching an inbox for mail that will never arrive, and point
 * them at the direct reply instead.
 */
const AutoReplyStatusBlock = ({ status }: { status: AutoReplyStatus }) => {
  const panel = {
    sending: {
      border: 'brand.accent',
      bg: 'brand.surfaceSunken',
      icon: <Spinner size="sm" color="brand.accentText" thickness="2px" speed="0.8s" />,
      title: 'Delivering confirmation…',
      body: <>Waiting for it to reach your inbox, this usually takes a few seconds. Hang tight.</>,
    },
    delivered: {
      border: 'brand.success',
      bg: 'rgba(47, 122, 77, 0.07)',
      icon: <Icon as={FaCheckCircle} color="brand.success" boxSize={4} />,
      title: 'Confirmation sent',
      body: (
        <>
          Look for an email from <Gold>vero@vero.photography</Gold>, it is on its way and can take
          a couple of minutes to arrive. If you don't see it, <Gold>check your Spam or Promotions
          folder</Gold>, and mark it as <Gold>Not Spam</Gold> so my real reply reaches your inbox.
        </>
      ),
    },
    pending: {
      border: 'brand.accent',
      bg: 'brand.surfaceSunken',
      icon: <Icon as={FaRegEnvelope} color="brand.accentText" boxSize={4} />,
      title: 'Confirmation on its way',
      body: (
        <>
          Your confirmation was sent and is taking a little longer than usual to land. Give it a
          minute or two, and <Gold>check your Spam or Promotions folder</Gold> if it is not in
          your inbox.
        </>
      ),
    },
    failed: {
      border: 'brand.caution',
      bg: 'rgba(169, 99, 26, 0.07)',
      icon: <Icon as={FaExclamationCircle} color="brand.caution" boxSize={4} />,
      title: "Confirmation couldn't send",
      body: (
        <>
          No worries, I still got your message and will personally reach out within 24 hours. My
          reply might land in <Gold>Spam</Gold> or <Gold>Promotions</Gold>, so please check there too.
        </>
      ),
    },
    idle: {
      border: 'brand.accent',
      bg: 'brand.surfaceSunken',
      icon: <Icon as={FaExclamationCircle} color="brand.accentText" boxSize={4} />,
      title: 'Heads up',
      body: (
        <>
          If you have already written to me, my reply might land in your <Gold>Spam</Gold> or{' '}
          <Gold>Promotions</Gold> folder, so please check there if you don't see it in your inbox.
        </>
      ),
    },
  }[status];

  return (
    <Box borderLeft="2px solid" borderLeftColor={panel.border} bg={panel.bg} px={5} py="18px" role="status">
      <Flex align="center" gap={3} mb={2.5} minH="18px">
        <Flex align="center" justify="center" flex="none" w="18px" h="18px">
          {panel.icon}
        </Flex>
        <Text fontSize="12px" fontWeight="500" letterSpacing="0.16em" textTransform="uppercase" color="gray.800">
          {panel.title}
        </Text>
      </Flex>
      <Text fontSize="15px" fontWeight="300" lineHeight="1.7" color="gray.700" m={0}>
        {panel.body}
      </Text>
    </Box>
  );
};

const Gold = ({ children }: { children: React.ReactNode }) => (
  <Text as="span" color="brand.accentText" fontWeight="400">
    {children}
  </Text>
);

export default ThankYou;
