import {
  Box,
  Flex,
  Text,
  Input,
  VStack,
  Icon,
  IconButton,
} from '@chakra-ui/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloseIcon } from '@chakra-ui/icons';
import { FaCheck } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';

const STORAGE_KEY = 'vero_exit_popup_shown_at';
// Don't re-show the popup within this many days of a previous show.
// 30 days = roughly "you've already seen this, stop bugging them."
const REPEAT_DELAY_DAYS = 30;
// Mobile: no real "exit intent" signal — fall back to time + scroll.
const MOBILE_TIME_THRESHOLD_MS = 45_000;
const MOBILE_SCROLL_THRESHOLD = 0.5; // 50% of page scrolled

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const wasShownRecently = (): boolean => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const shownAt = parseInt(raw, 10);
    if (Number.isNaN(shownAt)) return false;
    const ageMs = Date.now() - shownAt;
    return ageMs < REPEAT_DELAY_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
};

const markShown = () => {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage might be disabled (private browsing on some browsers);
    // ignore and just don't dedupe.
  }
};

const isMobile = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(pointer: coarse)').matches ||
    /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent));

const ExitIntentPopup = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedCode, setSubmittedCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const triggeredRef = useRef(false);

  const close = useCallback(() => {
    setIsOpen(false);
  }, []);

  const trigger = useCallback((opts?: { force?: boolean }) => {
    if (triggeredRef.current) return;
    if (!opts?.force && wasShownRecently()) return;
    triggeredRef.current = true;
    if (!opts?.force) markShown();
    setIsOpen(true);
  }, []);

  // Debug hatch: ?popup=test on any URL forces the popup immediately and
  // ignores the 30-day cap. Useful for verifying the popup works on a preview
  // deploy without aiming a mouse out the top edge of the viewport.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('popup') === 'test') trigger({ force: true });
  }, [trigger]);

  // Desktop: mouse leaves top edge of viewport → likely going to close tab
  // or hit the URL bar. Trigger the popup.
  useEffect(() => {
    if (isMobile()) return;
    const handleMouseLeave = (e: MouseEvent) => {
      // Only count exits toward the TOP of the viewport. Leaving sideways
      // (e.g. to switch monitor) shouldn't trigger.
      if (e.clientY <= 0) trigger();
    };
    document.addEventListener('mouseleave', handleMouseLeave);
    return () => document.removeEventListener('mouseleave', handleMouseLeave);
  }, [trigger]);

  // Mobile fallback: time on page + scroll depth. Either condition fires it,
  // since both indicate "engaged enough to maybe care about a discount."
  useEffect(() => {
    if (!isMobile()) return;

    const timeoutId = window.setTimeout(trigger, MOBILE_TIME_THRESHOLD_MS);

    const handleScroll = () => {
      const scrolled = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      if (maxScroll > 0 && scrolled / maxScroll >= MOBILE_SCROLL_THRESHOLD) {
        trigger();
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [trigger]);

  // Keyboard: escape closes
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, close]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError('Please enter a valid email address.');
      return;
    }
    setIsSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source: 'exit_intent_popup' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Generic success display — we don't reveal the code in-popup, the
        // email does. Keeps the discount valuable (only people who can receive
        // mail at that address get it) and keeps the popup uncluttered.
        setSubmittedCode(data.alreadySubscribed ? 'already' : 'new');
      } else {
        setError(data.error || 'Something went wrong. Try again?');
      }
    } catch {
      setError('Could not reach the server. Try again?');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2200,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={close}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: '460px' }}
          >
            <Box
              position="relative"
              bg="white"
              borderRadius="md"
              p={{ base: 6, md: 8 }}
              boxShadow="0 20px 60px rgba(0,0,0,0.4)"
            >
              {/* Close button */}
              <IconButton
                aria-label="Close"
                icon={<CloseIcon boxSize={3} />}
                onClick={close}
                position="absolute"
                top={3}
                right={3}
                size="sm"
                variant="ghost"
                color="gray.400"
                _hover={{ color: 'gray.700', bg: 'transparent' }}
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              />

              {submittedCode ? (
                <VStack spacing={5} textAlign="center" py={4}>
                  <Box
                    bg="#c9a96e"
                    color="white"
                    w="56px"
                    h="56px"
                    borderRadius="full"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Icon as={FaCheck} boxSize={6} />
                  </Box>
                  <Text
                    fontSize="xs"
                    fontWeight="500"
                    textTransform="uppercase"
                    letterSpacing="0.25em"
                    color="#c9a96e"
                  >
                    {submittedCode === 'already' ? 'Already on the list' : 'You’re in'}
                  </Text>
                  <Text fontSize="xl" fontWeight="200" color="gray.800" lineHeight="1.4">
                    {submittedCode === 'already'
                      ? 'You signed up before — check your inbox for the code.'
                      : 'Check your inbox in a moment.'}
                  </Text>
                  {submittedCode === 'new' && (
                    <Text fontSize="sm" color="gray.500" fontWeight="300" maxW="320px">
                      Your 10% off code is on the way. Just mention it when you book.
                    </Text>
                  )}
                  <CTAButton onClick={close} variant="outline" size="sm">
                    Close
                  </CTAButton>
                </VStack>
              ) : (
                <VStack spacing={5} textAlign="center" pt={3}>
                  <Text
                    fontSize="xs"
                    fontWeight="500"
                    textTransform="uppercase"
                    letterSpacing="0.25em"
                    color="#c9a96e"
                  >
                    Before you go
                  </Text>
                  <Box w="40px" h="1px" bg="#c9a96e" />
                  <Text
                    as="h2"
                    fontSize={{ base: '2xl', md: '3xl' }}
                    fontWeight="200"
                    color="gray.800"
                    lineHeight="1.3"
                    m={0}
                  >
                    Get <Box as="span" color="#c9a96e" fontWeight="400">10% off</Box>
                    <br />
                    your next session
                  </Text>
                  <Text fontSize="sm" color="gray.500" fontWeight="300" maxW="340px" lineHeight="1.7">
                    Pop in your email and I&rsquo;ll send you a code you can mention when you&rsquo;re ready to book.
                  </Text>

                  <Box as="form" onSubmit={handleSubmit} w="100%" pt={2}>
                    <VStack spacing={3}>
                      <Input
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoFocus
                        h="48px"
                        fontSize="sm"
                        fontWeight="300"
                        borderColor="gray.300"
                        bg="white"
                        color="gray.800"
                        _focus={{
                          borderColor: '#c9a96e',
                          boxShadow: '0 0 0 1px #c9a96e',
                        }}
                        textAlign="center"
                      />

                      {error && (
                        <Text fontSize="sm" color="red.500" fontWeight="300">
                          {error}
                        </Text>
                      )}

                      <CTAButton
                        type="submit"
                        variant="solid"
                        size="md"
                        fullWidth
                        isLoading={isSubmitting}
                        loadingText="Sending..."
                      >
                        Send my code
                      </CTAButton>
                    </VStack>
                  </Box>

                  <Flex
                    as="button"
                    type="button"
                    onClick={close}
                    bg="transparent"
                    color="gray.400"
                    fontSize="xs"
                    fontWeight="300"
                    letterSpacing="0.05em"
                    py={1}
                    _hover={{ color: 'gray.600' }}
                    transition="color 0.2s"
                    sx={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    No thanks
                  </Flex>
                </VStack>
              )}
            </Box>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ExitIntentPopup;
