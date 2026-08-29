import { useState } from 'react';
import { Box, Flex, VStack, Text, Input } from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CTAButton from '../components/ui/CTAButton';

/**
 * /portal/reset?token=… — set a new portal password from an emailed link.
 *
 * Deliberately NOT built on Welcome.tsx, despite the visual similarity. Welcome
 * does a mandatory pre-flight POST to /api/portal/welcome to validate its
 * setup_token before rendering the form, and there is no equivalent lookup for
 * a reset token — adding one would mean a third endpoint whose only job is to
 * confirm a token exists, which also hands an attacker a free oracle for
 * testing tokens. Here the token is validated once, on submit, by the endpoint
 * that actually uses it.
 *
 * The route is covered by vercel.json's X-Robots-Tag noindex on /portal/:path*.
 */

const MIN_PASSWORD_LENGTH = 6;

const ResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/portal/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDone(true);
        // Straight to the login with the email prefilled — she has just proved
        // control of that address, so making her retype it is pure friction.
        setTimeout(() => {
          navigate(`/portal?email=${encodeURIComponent(data.email ?? '')}`);
        }, 1800);
      } else {
        setError(data.error || 'Could not reset the password.');
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box position="relative" minH="100vh" bg="#0a0a0a">
      <Helmet>
        <title>Reset your password | Vero Photography</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <Flex minH="100vh" align="center" justify="center" px={6} py={{ base: 24, md: 16 }}>
        <Box w="100%" maxW="420px">
          <VStack spacing={6} align="stretch">
            <VStack spacing={2}>
              <Text
                fontSize="xs"
                letterSpacing="0.3em"
                textTransform="uppercase"
                color="brand.accent"
                fontWeight="500"
              >
                Client Portal
              </Text>
              <Text fontSize="2xl" color="white" fontWeight="300">
                {done ? 'Password updated' : 'Set a new password'}
              </Text>
            </VStack>

            {!token ? (
              <VStack spacing={4}>
                <Text fontSize="sm" color="whiteAlpha.700" textAlign="center" lineHeight="1.7">
                  This link is missing its token. Request a new reset link from the sign-in page.
                </Text>
                <CTAButton to="/portal" variant="outline" size="sm">
                  Back to sign in
                </CTAButton>
              </VStack>
            ) : done ? (
              <Text fontSize="sm" color="whiteAlpha.700" textAlign="center" lineHeight="1.7">
                You can sign in with your new password now. Taking you there…
              </Text>
            ) : (
              <Box as="form" onSubmit={handleSubmit}>
                <VStack spacing={4} align="stretch">
                  <Box>
                    <Text
                      fontSize="2xs"
                      letterSpacing="0.2em"
                      textTransform="uppercase"
                      color="brand.accent"
                      mb={2}
                    >
                      New password
                    </Text>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="new-password"
                      bg="whiteAlpha.50"
                      border="1px solid"
                      borderColor="whiteAlpha.300"
                      color="white"
                      _focus={{ borderColor: 'brand.accent', boxShadow: 'none' }}
                      size="lg"
                    />
                  </Box>

                  <Box>
                    <Text
                      fontSize="2xs"
                      letterSpacing="0.2em"
                      textTransform="uppercase"
                      color="brand.accent"
                      mb={2}
                    >
                      Confirm password
                    </Text>
                    <Input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      autoComplete="new-password"
                      bg="whiteAlpha.50"
                      border="1px solid"
                      borderColor="whiteAlpha.300"
                      color="white"
                      _focus={{ borderColor: 'brand.accent', boxShadow: 'none' }}
                      size="lg"
                    />
                  </Box>

                  {error && (
                    <Text fontSize="sm" color="#ff4c68">
                      {error}
                    </Text>
                  )}

                  <CTAButton
                    type="submit"
                    variant="solid"
                    size="lg"
                    fullWidth
                    isLoading={submitting}
                    loadingText="Saving…"
                  >
                    Save new password
                  </CTAButton>
                </VStack>
              </Box>
            )}
          </VStack>
        </Box>
      </Flex>
    </Box>
  );
};

export default ResetPassword;
