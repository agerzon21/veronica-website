import { Box, Flex, VStack, Text, Input } from '@chakra-ui/react';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import CTAButton from '../components/ui/CTAButton';
import ClientGallery, { type DriveFile } from '../components/ClientGallery';

const MotionDiv = motion.div;

type GalleryData = {
  clientName: string | null;
  driveUrl: string;
  files: DriveFile[];
  warning?: string;
};

const Portal = () => {
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [gallery, setGallery] = useState<GalleryData | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!password.trim()) return;
    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setGallery({
          clientName: data.client_name ?? null,
          driveUrl: data.drive_url,
          files: data.files ?? [],
          warning: data.warning,
        });
      } else if (res.status === 401) {
        setError("That password didn't match. Double-check and try again.");
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // After successful login → render the gallery
  if (gallery) {
    return (
      <>
        <Helmet>
          <title>{gallery.clientName ? `${gallery.clientName} — Gallery` : 'Client Gallery'} | Vero Photography</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <ClientGallery
          clientName={gallery.clientName}
          driveUrl={gallery.driveUrl}
          files={gallery.files}
          warning={gallery.warning}
        />
      </>
    );
  }

  // Password gate
  return (
    <Box position="relative" minH="100vh" overflow="hidden" bg="#0a0a0a">
      <Helmet>
        <title>Client Portal | Vero Photography</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Background — soft gradient matching the site's dark feel */}
      <Box
        position="absolute"
        inset={0}
        backgroundImage="url('/assets/photos/site/contact-bg.webp')"
        backgroundSize="cover"
        backgroundPosition={{ base: 'center 30%', md: 'center' }}
        backgroundRepeat="no-repeat"
        filter="brightness(0.3)"
      />
      <Box
        position="absolute"
        inset={0}
        bgGradient="linear(to-b, rgba(0,0,0,0.5), rgba(0,0,0,0.7))"
        pointerEvents="none"
      />

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
        <Box w="100%" maxW="440px">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <VStack spacing={8}>
              {/* Heading */}
              <VStack spacing={4}>
                <Text
                  fontSize="xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.25em"
                  color="#c9a96e"
                >
                  Client Portal
                </Text>
                <Box w="40px" h="1px" bg="#c9a96e" />
                <Text
                  as="h1"
                  fontSize={{ base: '2xl', md: '3xl' }}
                  fontWeight="200"
                  color="white"
                  textAlign="center"
                  lineHeight="1.4"
                  m={0}
                  letterSpacing="0.02em"
                >
                  View your private gallery
                </Text>
                <Text
                  fontSize="sm"
                  color="whiteAlpha.800"
                  textAlign="center"
                  fontWeight="300"
                  lineHeight="1.7"
                  maxW="360px"
                >
                  Enter the password Veronika sent you to access your photos.
                </Text>
              </VStack>

              {/* Form card */}
              <Box
                as="form"
                onSubmit={handleSubmit}
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
                  <Box w="100%">
                    <Text
                      as="label"
                      htmlFor="password"
                      display="block"
                      fontSize="2xs"
                      fontWeight="500"
                      color="#c9a96e"
                      letterSpacing="0.2em"
                      textTransform="uppercase"
                      mb={1.5}
                    >
                      Password
                    </Text>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
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
                  </Box>

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
                    isLoading={isSubmitting}
                    loadingText="Checking..."
                  >
                    View Gallery
                  </CTAButton>
                </VStack>
              </Box>

              {/* Graceful offramp */}
              <VStack spacing={3} pt={2}>
                <Text fontSize="xs" color="whiteAlpha.600" fontWeight="300" textAlign="center">
                  Not a client? No problem —
                </Text>
                <Text
                  as={RouterLink}
                  to="/gallery"
                  fontSize="xs"
                  fontWeight="500"
                  color="#c9a96e"
                  letterSpacing="0.2em"
                  textTransform="uppercase"
                  _hover={{ color: '#d4b87a' }}
                  transition="color 0.3s"
                >
                  Browse the public portfolio →
                </Text>
              </VStack>
            </VStack>
          </MotionDiv>
        </Box>
      </Flex>
    </Box>
  );
};

export default Portal;
