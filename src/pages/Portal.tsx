import { Box, Flex, VStack, Text, Input, HStack } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion, AnimatePresence } from 'framer-motion';
import CTAButton from '../components/ui/CTAButton';
import ClientGallery, { type DriveFile, type FolderSection } from '../components/ClientGallery';
import ClientPortalView, { type ClientPortalData } from '../components/ClientPortalView';

const MotionDiv = motion.div;

type Tab = 'client' | 'gallery';

type GalleryData = {
  clientName: string | null;
  driveUrl: string;
  rootFiles: DriveFile[];
  sections: FolderSection[];
  warning?: string;
};

// URL is the source of truth for the active tab — so Veronika can send
// a guest a direct link to /portal/pass and they land on the right form
// without having to be told "click the right tab." Switching tabs in
// the UI updates the URL via replaceState, and browser back/forward
// updates the active tab via the effect below.
const tabFromPath = (pathname: string): Tab =>
  pathname === '/portal/pass' ? 'gallery' : 'client';
const pathFromTab = (t: Tab): string => (t === 'gallery' ? '/portal/pass' : '/portal');

const Portal = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => tabFromPath(location.pathname));

  // Keep the active tab in sync with the URL on browser back/forward so a
  // user navigating around with the address bar gets the expected view.
  useEffect(() => {
    const next = tabFromPath(location.pathname);
    setTab((current) => (current === next ? current : next));
  }, [location.pathname]);

  // Form state — shared error/submitting, separate field state per tab
  // so switching tabs doesn't blow away what you typed.
  //
  // Email can be prefilled via ?email= so the welcome → portal handoff
  // doesn't make the client retype it.
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
  const [clientPassword, setClientPassword] = useState('');
  const [galleryPassword, setGalleryPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Post-login state — one of these gets set on a successful auth, which
  // unmounts the form and renders the corresponding view.
  const [clientData, setClientData] = useState<ClientPortalData | null>(null);
  const [galleryData, setGalleryData] = useState<GalleryData | null>(null);

  const switchTab = (next: Tab) => {
    if (next === tab) return;
    setTab(next);
    setError('');
    // replace: true so the back button doesn't have to walk through every
    // tab toggle to leave the page.
    navigate(pathFromTab(next), { replace: true });
  };

  const handleClientSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim() || !clientPassword.trim()) return;
    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/portal/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password: clientPassword.trim(),
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setClientData(data as ClientPortalData);
      } else if (res.status === 401) {
        setError("That email and password didn't match. Double-check and try again.");
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGallerySubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!galleryPassword.trim()) return;
    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/portal/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: galleryPassword.trim() }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        setGalleryData({
          clientName: data.client_name ?? null,
          driveUrl: data.drive_url,
          rootFiles: data.rootFiles ?? [],
          sections: data.sections ?? [],
          warning: data.warning,
        });
      } else if (res.status === 401) {
        setError("That password didn't match. Double-check and try again.");
      } else if (res.status === 410) {
        setError(data.error || 'This gallery has expired.');
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Logged in as full-portal client → render the full client portal view.
  // Pass the credentials through so child sections (e.g. Gallery Pass
  // management) can re-authenticate against the API without us having to
  // mint a session token in this MVP.
  if (clientData) {
    return (
      <>
        <Helmet>
          <title>{clientData.client_name ? `${clientData.client_name} — Portal` : 'Client Portal'} | Vero Photography</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <ClientPortalView
          data={clientData}
          credentials={{ email: email.trim(), password: clientPassword.trim() }}
          onDataUpdate={setClientData}
        />
      </>
    );
  }

  // Logged in via Gallery Pass → render the read-only photo gallery
  if (galleryData) {
    return (
      <>
        <Helmet>
          <title>{galleryData.clientName ? `${galleryData.clientName} — Gallery` : 'Gallery'} | Vero Photography</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <ClientGallery
          clientName={galleryData.clientName}
          driveUrl={galleryData.driveUrl}
          rootFiles={galleryData.rootFiles}
          sections={galleryData.sections}
          warning={galleryData.warning}
        />
      </>
    );
  }

  // Not yet authenticated → tabbed login form
  return (
    <Box position="relative" minH="100vh" overflow="hidden" bg="#0a0a0a">
      <Helmet>
        <title>Portal | Vero Photography</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* Background photo — same treatment as the Contact page so the two
          feel like siblings. */}
      <Box
        position="absolute"
        inset={0}
        backgroundImage="url('/assets/photos/site/client-portal.webp')"
        backgroundSize="cover"
        backgroundPosition={{ base: 'center 30%', md: 'center' }}
        backgroundRepeat="no-repeat"
        filter="brightness(0.6)"
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
        <Box w="100%" maxW="460px">
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
                  Welcome
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
                  Sign In
                </Text>
              </VStack>

              {/* Tabs */}
              <HStack
                spacing={0}
                w="100%"
                borderBottom="1px solid"
                borderColor="whiteAlpha.200"
              >
                {(
                  [
                    { id: 'client' as Tab, label: 'Client Portal' },
                    { id: 'gallery' as Tab, label: 'Gallery Pass' },
                  ]
                ).map((t) => {
                  const active = tab === t.id;
                  return (
                    <Box
                      key={t.id}
                      as="button"
                      type="button"
                      onClick={() => switchTab(t.id)}
                      flex={1}
                      py={3}
                      bg="transparent"
                      border="none"
                      cursor="pointer"
                      position="relative"
                      fontSize="xs"
                      fontWeight="500"
                      letterSpacing="0.2em"
                      textTransform="uppercase"
                      color={active ? '#c9a96e' : 'whiteAlpha.600'}
                      transition="color 0.3s"
                      _hover={{ color: active ? '#c9a96e' : 'whiteAlpha.800' }}
                      sx={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      {t.label}
                      {/* Gold underline indicating the active tab */}
                      {active && (
                        <MotionDiv
                          layoutId="portal-tab-underline"
                          style={{
                            position: 'absolute',
                            bottom: '-1px',
                            left: 0,
                            right: 0,
                            height: '1px',
                            background: '#c9a96e',
                          }}
                        />
                      )}
                    </Box>
                  );
                })}
              </HStack>

              {/* Form card — different fields per tab. AnimatePresence handles
                  the cross-fade so switching tabs feels intentional rather
                  than jarring. */}
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
                <AnimatePresence mode="wait" initial={false}>
                  {tab === 'client' ? (
                    <MotionDiv
                      key="client-form"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                    >
                      <Box as="form" onSubmit={handleClientSubmit} w="100%">
                        <VStack spacing={4} w="100%">
                          <FieldLabel htmlFor="client-email">Email</FieldLabel>
                          <PortalInput
                            id="client-email"
                            name="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            autoFocus
                          />

                          <FieldLabel htmlFor="client-password">Password</FieldLabel>
                          <PortalInput
                            id="client-password"
                            name="password"
                            type="text"
                            value={clientPassword}
                            onChange={(e) => setClientPassword(e.target.value)}
                            placeholder="Enter your password"
                            autoComplete="off"
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck={false}
                          />

                          {error && <ErrorText>{error}</ErrorText>}

                          <CTAButton
                            type="submit"
                            variant="solid"
                            size="lg"
                            fullWidth
                            isLoading={isSubmitting}
                            loadingText="Signing in..."
                          >
                            Sign In
                          </CTAButton>

                          <Text fontSize="xs" color="whiteAlpha.500" textAlign="center" pt={1}>
                            Full access — contract, payments, photos
                          </Text>
                        </VStack>
                      </Box>
                    </MotionDiv>
                  ) : (
                    <MotionDiv
                      key="gallery-form"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.25 }}
                    >
                      <Box as="form" onSubmit={handleGallerySubmit} w="100%">
                        <VStack spacing={4} w="100%">
                          <FieldLabel htmlFor="gallery-password">Password</FieldLabel>
                          <PortalInput
                            id="gallery-password"
                            name="password"
                            type="text"
                            value={galleryPassword}
                            onChange={(e) => setGalleryPassword(e.target.value)}
                            placeholder="Enter the gallery password"
                            autoComplete="off"
                            autoCapitalize="characters"
                            autoCorrect="off"
                            spellCheck={false}
                            autoFocus
                          />

                          {error && <ErrorText>{error}</ErrorText>}

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

                          <Text fontSize="xs" color="whiteAlpha.500" textAlign="center" pt={1}>
                            View photos only — for guests &amp; family
                          </Text>
                        </VStack>
                      </Box>
                    </MotionDiv>
                  )}
                </AnimatePresence>
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

// Small reusable bits — extracted so the JSX above reads as flow, not noise.

const FieldLabel = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
  <Text
    as="label"
    htmlFor={htmlFor}
    display="block"
    w="100%"
    fontSize="2xs"
    fontWeight="500"
    color="#c9a96e"
    letterSpacing="0.2em"
    textTransform="uppercase"
    mb={-2}
  >
    {children}
  </Text>
);

// Omit `size` because HTMLInputElement's numeric `size` collides with
// Chakra's string-union `size` ('sm' | 'md' | 'lg' | 'xs').
const PortalInput = (
  props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> & { id: string },
) => (
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

const ErrorText = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="sm" color="red.300" fontWeight="300" textAlign="center">
    {children}
  </Text>
);

export default Portal;
