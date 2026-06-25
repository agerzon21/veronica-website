import { Box, Flex, VStack, Text, Input } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import CTAButton from '../components/ui/CTAButton';

const MotionDiv = motion.div;

interface WelcomeSummary {
  client_display_name: string | null;
  client_email: string;
  session_type: string | null;
  event_date: string | null;
  contract_total_amount: number | null;
  contract_retainer_amount: number | null;
}

const Welcome = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [summary, setSummary] = useState<WelcomeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoadError('This link is missing its setup token. Reach out to Veronika for a new one.');
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/portal/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setSummary(data);
        } else {
          setLoadError(data.error || 'This link is no longer valid.');
        }
      } catch {
        setLoadError('Could not reach the server. Please try again.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError('');
    if (password.length < 6) {
      setSubmitError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/portal/welcome-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDone(true);
        // Brief pause so the success state is visible, then push to /portal
        // with the email prefilled. The client will still need to type their
        // password — we deliberately do NOT auto-login because the password
        // they just chose isn't held in any session yet.
        setTimeout(() => {
          navigate(`/portal?email=${encodeURIComponent(data.email)}`);
        }, 1200);
      } else {
        setSubmitError(data.error || 'Could not save. Please try again.');
      }
    } catch {
      setSubmitError('Could not reach the server. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box position="relative" minH="100vh" overflow="hidden" bg="#0a0a0a">
      <Helmet>
        <title>Welcome | Vero Photography</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <Box
        position="absolute"
        inset={0}
        backgroundImage="url('/assets/photos/site/client-portal.webp')"
        backgroundSize="cover"
        backgroundPosition={{ base: 'center 30%', md: 'center' }}
        backgroundRepeat="no-repeat"
        filter="brightness(0.5)"
      />
      <Box position="absolute" inset={0} bgGradient="linear(to-b, rgba(0,0,0,0.55), rgba(0,0,0,0.75))" pointerEvents="none" />

      <Flex
        position="relative"
        zIndex={2}
        minH="100vh"
        align="center"
        justify="center"
        px={6}
        pt={{ base: 24, md: 20 }}
        pb={{ base: 16, md: 12 }}
      >
        <Box w="100%" maxW="500px">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <VStack spacing={8}>
              <VStack spacing={4}>
                <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="#c9a96e">
                  Welcome
                </Text>
                <Box w="40px" h="1px" bg="#c9a96e" />
                <Text
                  as="h1"
                  fontSize={{ base: '2xl', md: '3xl' }}
                  fontWeight="200"
                  color="white"
                  textAlign="center"
                  letterSpacing="0.02em"
                  m={0}
                >
                  {loading ? 'Loading…' : summary?.client_display_name ? `Hi ${summary.client_display_name.split(/[&,]/)[0].trim()}` : 'Let’s get you set up'}
                </Text>
              </VStack>

              {loading && (
                <Text color="whiteAlpha.600" fontSize="sm">Looking up your portal…</Text>
              )}

              {loadError && (
                <Box
                  w="100%"
                  bg="rgba(0, 0, 0, 0.55)"
                  border="1px solid"
                  borderColor="whiteAlpha.200"
                  borderRadius="sm"
                  px={6}
                  py={6}
                  backdropFilter="blur(8px)"
                >
                  <Text color="red.300" fontSize="sm" textAlign="center" fontWeight="300">
                    {loadError}
                  </Text>
                </Box>
              )}

              {summary && !done && (
                <Box
                  w="100%"
                  bg="rgba(0, 0, 0, 0.55)"
                  border="1px solid"
                  borderColor="whiteAlpha.200"
                  borderRadius="sm"
                  px={{ base: 5, md: 7 }}
                  py={{ base: 6, md: 7 }}
                  backdropFilter="blur(8px)"
                >
                  <VStack align="stretch" spacing={5}>
                    <Box>
                      <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.2em" color="#c9a96e" mb={3}>
                        Your Booking
                      </Text>
                      <VStack align="stretch" spacing={2}>
                        <SummaryLine label="Email" value={summary.client_email} />
                        {summary.session_type && <SummaryLine label="Type" value={summary.session_type} />}
                        {summary.event_date && <SummaryLine label="Date" value={fmtDate(summary.event_date)} />}
                        {summary.contract_total_amount !== null && (
                          <SummaryLine label="Total" value={`$${summary.contract_total_amount.toFixed(0)}`} />
                        )}
                        {summary.contract_retainer_amount !== null && (
                          <SummaryLine label="Retainer" value={`$${summary.contract_retainer_amount.toFixed(0)}`} />
                        )}
                      </VStack>
                      <Text fontSize="xs" color="whiteAlpha.600" mt={4} fontWeight="300">
                        If anything looks wrong, reach out to Veronika before continuing.
                      </Text>
                    </Box>

                    <Box as="form" onSubmit={handleSubmit}>
                      <VStack spacing={4} align="stretch">
                        <Box>
                          <Text
                            as="label"
                            display="block"
                            fontSize="2xs"
                            fontWeight="500"
                            color="#c9a96e"
                            letterSpacing="0.2em"
                            textTransform="uppercase"
                            mb={2}
                          >
                            Choose a Password
                          </Text>
                          <WelcomeInput
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="At least 6 characters"
                            autoFocus
                          />
                        </Box>
                        <Box>
                          <Text
                            as="label"
                            display="block"
                            fontSize="2xs"
                            fontWeight="500"
                            color="#c9a96e"
                            letterSpacing="0.2em"
                            textTransform="uppercase"
                            mb={2}
                          >
                            Confirm Password
                          </Text>
                          <WelcomeInput
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Repeat your password"
                          />
                        </Box>
                        {submitError && (
                          <Text fontSize="sm" color="red.300" fontWeight="300" textAlign="center">
                            {submitError}
                          </Text>
                        )}
                        <CTAButton
                          type="submit"
                          variant="solid"
                          size="lg"
                          fullWidth
                          isLoading={submitting}
                          loadingText="Saving..."
                        >
                          Finish Setup
                        </CTAButton>
                      </VStack>
                    </Box>
                  </VStack>
                </Box>
              )}

              {done && (
                <Box
                  w="100%"
                  bg="rgba(0, 0, 0, 0.55)"
                  border="1px solid"
                  borderColor="whiteAlpha.200"
                  borderRadius="sm"
                  px={6}
                  py={8}
                  backdropFilter="blur(8px)"
                  textAlign="center"
                >
                  <Text fontSize="lg" color="white" fontWeight="300" mb={2}>
                    You're all set ✓
                  </Text>
                  <Text fontSize="sm" color="whiteAlpha.700">
                    Redirecting you to sign in…
                  </Text>
                </Box>
              )}
            </VStack>
          </MotionDiv>
        </Box>
      </Flex>
    </Box>
  );
};

const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
};

const SummaryLine = ({ label, value }: { label: string; value: string }) => (
  <Flex justify="space-between" gap={4}>
    <Text fontSize="xs" color="whiteAlpha.600" letterSpacing="0.15em" textTransform="uppercase">
      {label}
    </Text>
    <Text fontSize="sm" color="white" fontWeight="300" textAlign="right">
      {value}
    </Text>
  </Flex>
);

const WelcomeInput = (props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>) => (
  <Input
    {...props}
    h="48px"
    bg="blackAlpha.500"
    border="1px solid"
    borderColor="whiteAlpha.300"
    color="white"
    fontSize="sm"
    fontWeight="300"
    borderRadius="sm"
    _placeholder={{ color: 'whiteAlpha.500', fontWeight: '300' }}
    _hover={{ borderColor: 'whiteAlpha.500' }}
    _focus={{
      borderColor: '#c9a96e',
      boxShadow: '0 0 0 1px #c9a96e',
      bg: 'blackAlpha.600',
    }}
  />
);

export default Welcome;
