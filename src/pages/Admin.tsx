import { Box, Flex, VStack, Text, Input } from '@chakra-ui/react';
import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import CTAButton from '../components/ui/CTAButton';
import AdminDashboard, { type AdminPortalSummary } from '../components/AdminDashboard';
import AdminNewClient from '../components/AdminNewClient';

const MotionDiv = motion.div;

type View = 'dashboard' | 'new';

const Admin = () => {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [portals, setPortals] = useState<AdminPortalSummary[] | null>(null);
  const [view, setView] = useState<View>('dashboard');

  const loadPortals = async (pwd: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/admin/portals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPortals(data.portals);
        return { ok: true };
      }
      return { ok: false, error: data.error || `Server error (${res.status})` };
    } catch {
      return { ok: false, error: 'Could not reach the server.' };
    }
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password.trim()) return;
    setSubmitting(true);
    setError('');
    const r = await loadPortals(password.trim());
    setSubmitting(false);
    if (!r.ok) setError(r.error || 'Sign in failed.');
  };

  const handleRefresh = async () => {
    await loadPortals(password);
  };

  const handleCreated = async () => {
    setView('dashboard');
    await loadPortals(password);
  };

  // Logged in → dashboard or new-client form
  if (portals) {
    return (
      <>
        <Helmet>
          <title>Admin | Vero Photography</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <Box bg="gray.50" minH="100vh" pt={{ base: 20, md: 24 }} pb={{ base: 16, md: 20 }} px={{ base: 4, md: 8 }}>
          {view === 'dashboard' ? (
            <AdminDashboard
              portals={portals}
              onNewClient={() => setView('new')}
              onRefresh={handleRefresh}
            />
          ) : (
            <AdminNewClient
              adminPassword={password}
              onCancel={() => setView('dashboard')}
              onCreated={handleCreated}
            />
          )}
        </Box>
      </>
    );
  }

  // Login screen — matches the Portal dark style
  return (
    <Box position="relative" minH="100vh" overflow="hidden" bg="#0a0a0a">
      <Helmet>
        <title>Admin | Vero Photography</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <Box
        position="absolute"
        inset={0}
        backgroundImage="url('/assets/photos/site/client-portal.webp')"
        backgroundSize="cover"
        backgroundPosition={{ base: 'center 30%', md: 'center' }}
        backgroundRepeat="no-repeat"
        filter="brightness(0.45)"
      />
      <Box position="absolute" inset={0} bgGradient="linear(to-b, rgba(0,0,0,0.6), rgba(0,0,0,0.8))" pointerEvents="none" />

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
        <Box w="100%" maxW="420px">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <VStack spacing={8}>
              <VStack spacing={4}>
                <Text
                  fontSize="xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.25em"
                  color="#c9a96e"
                >
                  Admin
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
                  Sign In
                </Text>
              </VStack>

              <Box
                as="form"
                onSubmit={handleLogin}
                w="100%"
                bg="rgba(0, 0, 0, 0.55)"
                border="1px solid"
                borderColor="whiteAlpha.200"
                borderRadius="sm"
                px={{ base: 5, md: 7 }}
                py={{ base: 6, md: 7 }}
                backdropFilter="blur(8px)"
              >
                <VStack spacing={4} w="100%">
                  <Text
                    as="label"
                    htmlFor="admin-password"
                    display="block"
                    w="100%"
                    fontSize="2xs"
                    fontWeight="500"
                    color="#c9a96e"
                    letterSpacing="0.2em"
                    textTransform="uppercase"
                    mb={-2}
                  >
                    Password
                  </Text>
                  <Input
                    id="admin-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter admin password"
                    autoFocus
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
                  {error && (
                    <Text fontSize="sm" color="red.300" fontWeight="300" textAlign="center">
                      {error}
                    </Text>
                  )}
                  <CTAButton
                    type="submit"
                    variant="solid"
                    size="lg"
                    fullWidth
                    isLoading={submitting}
                    loadingText="Signing in..."
                  >
                    Sign In
                  </CTAButton>
                </VStack>
              </Box>
            </VStack>
          </MotionDiv>
        </Box>
      </Flex>
    </Box>
  );
};

export default Admin;
