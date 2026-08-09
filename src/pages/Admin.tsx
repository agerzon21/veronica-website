import { Box, Flex, HStack, VStack, Text, Input, Icon } from '@chakra-ui/react';
import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import { FaUsers, FaPlug, FaBookOpen, FaCommentDots, FaRobot, FaImage } from 'react-icons/fa';
import CTAButton from '../components/ui/CTAButton';
import AdminDashboard, { type AdminPortalSummary } from '../components/AdminDashboard';
import AdminNewClient from '../components/AdminNewClient';
import AdminNewGalleryOnly from '../components/AdminNewGalleryOnly';
import AdminModeChooser from '../components/AdminModeChooser';
import AdminClientDetail from '../components/AdminClientDetail';
import AdminIntegrations from '../components/AdminIntegrations';
import AdminJournal from '../components/AdminJournal';
import AdminGallery from '../components/AdminGallery';
import AdminMessages from '../components/AdminMessages';
import AdminAssistant from '../components/AdminAssistant';

const MotionDiv = motion.div;

// Which top-level dashboard tab is active. Only relevant when
// view.kind === 'dashboard'; deeper views (mode-chooser, new-*, detail)
// live outside the tab shell for now — they're modal-ish flows.
type DashTab = 'clients' | 'messages' | 'assistant' | 'journal' | 'gallery' | 'integrations';

type View =
  | { kind: 'dashboard' }
  | { kind: 'mode-chooser' }
  | { kind: 'new-full' }
  | { kind: 'new-gallery' }
  | { kind: 'detail'; id: string };

const Admin = () => {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [portals, setPortals] = useState<AdminPortalSummary[] | null>(null);
  const [adminLevel, setAdminLevel] = useState<'admin' | 'super'>('admin');
  const [view, setView] = useState<View>({ kind: 'dashboard' });
  const [dashTab, setDashTab] = useState<DashTab>('clients');

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
        if (data.level === 'super' || data.level === 'admin') setAdminLevel(data.level);
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
    setView({ kind: 'dashboard' });
    await loadPortals(password);
  };

  // Logged in → dashboard / chooser / new form / detail view
  if (portals) {
    return (
      <>
        <Helmet>
          <title>Admin | Vero Photography</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <Box
          bg="gray.50"
          minH="100vh"
          // Extra bottom padding on mobile so the fixed bottom nav
          // doesn't cover the last row of content. Uses safe-area-inset
          // for notched iPhones so the nav clears the home indicator.
          pt={{ base: 20, md: 24 }}
          pb={{ base: 'calc(80px + env(safe-area-inset-bottom))', md: 20 }}
          px={{ base: 4, md: 8 }}
          // Any single overflowing child would give the whole admin panel
          // a horizontal page scroll — a classic mobile bug. This is a
          // safety net; individual components should still be responsive.
          overflowX="hidden"
        >
          {view.kind === 'dashboard' && (
            <>
              {/* Desktop tab strip. Sits above the active tab body. On
                  mobile we hide this entirely and use the fixed bottom
                  nav below instead — the pill row was overflowing 375px
                  viewports and blowing out the whole page.

                  Integrations tab is superadmin-only — Vero never sees
                  it, so she can't get confused (or worse, accidentally
                  paste something into a token box). */}
              <AdminTabStrip
                active={dashTab}
                onChange={setDashTab}
                showIntegrations={adminLevel === 'super'}
              />
              {dashTab === 'clients' && (
                <AdminDashboard
                  portals={portals}
                  onNewClient={() => setView({ kind: 'mode-chooser' })}
                  onOpenPortal={(id) => setView({ kind: 'detail', id })}
                  onRefresh={handleRefresh}
                />
              )}
              {dashTab === 'messages' && (
                <AdminMessages adminPassword={password} adminLevel={adminLevel} />
              )}
              {dashTab === 'assistant' && (
                <AdminAssistant adminPassword={password} />
              )}
              {dashTab === 'journal' && (
                <AdminJournal adminPassword={password} adminLevel={adminLevel} />
              )}
              {dashTab === 'gallery' && (
                <AdminGallery adminPassword={password} adminLevel={adminLevel} />
              )}
              {dashTab === 'integrations' && adminLevel === 'super' && (
                <AdminIntegrations adminPassword={password} />
              )}
            </>
          )}
          {view.kind === 'mode-chooser' && (
            <AdminModeChooser
              onPick={(mode) =>
                setView(mode === 'full' ? { kind: 'new-full' } : { kind: 'new-gallery' })
              }
              onCancel={() => setView({ kind: 'dashboard' })}
            />
          )}
          {view.kind === 'new-full' && (
            <AdminNewClient
              adminPassword={password}
              onCancel={() => setView({ kind: 'mode-chooser' })}
              onCreated={handleCreated}
            />
          )}
          {view.kind === 'new-gallery' && (
            <AdminNewGalleryOnly
              adminPassword={password}
              onCancel={() => setView({ kind: 'mode-chooser' })}
              onCreated={handleCreated}
            />
          )}
          {view.kind === 'detail' && (
            <AdminClientDetail
              portalId={view.id}
              adminPassword={password}
              adminLevel={adminLevel}
              onBack={async () => {
                setView({ kind: 'dashboard' });
                await loadPortals(password);
              }}
            />
          )}
        </Box>
        {/* Mobile-only bottom nav. Rendered once here at the shell level
            (rather than per-view) so it stays visible while Vero is
            reading a conversation, editing a photo, etc. — the way
            iOS/Android tab bars work. Hidden during drill-in sub-flows
            (mode-chooser / new-client / client-detail) since those
            have their own back navigation. */}
        {view.kind === 'dashboard' && (
          <AdminMobileNav
            active={dashTab}
            onChange={setDashTab}
            showIntegrations={adminLevel === 'super'}
          />
        )}
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

/**
 * Shared tab definitions — used by both the desktop tab strip and
 * the mobile bottom nav so the two nav treatments can't drift.
 */
const TABS: { id: DashTab; label: string; icon: typeof FaUsers }[] = [
  { id: 'clients', label: 'Clients', icon: FaUsers },
  { id: 'messages', label: 'Messages', icon: FaCommentDots },
  { id: 'assistant', label: 'Assistant', icon: FaRobot },
  { id: 'journal', label: 'Journal', icon: FaBookOpen },
  { id: 'gallery', label: 'Gallery', icon: FaImage },
];

function tabsFor(showIntegrations: boolean) {
  return showIntegrations
    ? [...TABS, { id: 'integrations' as DashTab, label: 'Integrations', icon: FaPlug }]
    : TABS;
}

/**
 * DESKTOP tab strip for the admin dashboard. Sits above the active
 * tab's body. Uses the same pill-with-icon shape as PortalTopNav /
 * gallery TopSectionNav so it feels of a piece with the rest of the
 * site's chrome. Hidden on mobile — the bottom nav takes over there.
 * Integrations tab conditionally rendered based on admin level.
 */
function AdminTabStrip({
  active,
  onChange,
  showIntegrations,
}: {
  active: DashTab;
  onChange: (t: DashTab) => void;
  showIntegrations: boolean;
}) {
  const tabs = tabsFor(showIntegrations);
  if (tabs.length < 2) return null;

  return (
    <Box
      maxW="1200px"
      mx="auto"
      mb={6}
      // Hidden on mobile — the fixed bottom nav takes over that job.
      // Keeping the desktop pill strip because it doubles as visual
      // section chrome on wider screens where the bottom nav would
      // be silly.
      display={{ base: 'none', md: 'block' }}
    >
      <HStack spacing={2}>
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <Box
              key={t.id}
              as="button"
              type="button"
              onClick={() => onChange(t.id)}
              display="inline-flex"
              alignItems="center"
              gap={2}
              px={5}
              py={2}
              fontSize="2xs"
              fontWeight="500"
              letterSpacing="0.2em"
              textTransform="uppercase"
              color={isActive ? 'white' : 'gray.700'}
              bg={isActive ? '#c9a96e' : 'transparent'}
              border="1px solid"
              borderColor={isActive ? '#c9a96e' : 'gray.200'}
              borderRadius="full"
              transition="all 0.2s ease"
              cursor="pointer"
              _hover={
                isActive
                  ? { bg: '#b8964f', borderColor: '#b8964f' }
                  : {
                      borderColor: '#c9a96e',
                      color: '#c9a96e',
                      bg: 'rgba(201, 169, 110, 0.06)',
                    }
              }
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon as={t.icon} boxSize={3} />
              <Box as="span">{t.label}</Box>
            </Box>
          );
        })}
      </HStack>
    </Box>
  );
}

/**
 * MOBILE bottom nav for the admin dashboard. Fixed at the bottom of
 * the viewport so it's always thumb-reachable regardless of scroll
 * position. Icon-on-top / label-under, active state = gold everything
 * + a top border. Respects the iOS safe-area-inset so it clears the
 * home indicator on notched devices.
 *
 * When Alex is a superadmin, six tabs would overflow a 375px width in
 * one row — so on that view we collapse Integrations into a "More"
 * cell. But for Vero (5 tabs) they fit exactly with no scroll.
 */
function AdminMobileNav({
  active,
  onChange,
  showIntegrations,
}: {
  active: DashTab;
  onChange: (t: DashTab) => void;
  showIntegrations: boolean;
}) {
  const tabs = tabsFor(showIntegrations);
  return (
    <Box
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      zIndex={30}
      bg="white"
      borderTop="1px solid"
      borderColor="gray.200"
      pb="env(safe-area-inset-bottom)"
      display={{ base: 'block', md: 'none' }}
      boxShadow="0 -2px 12px -6px rgba(0, 0, 0, 0.08)"
    >
      <Flex align="stretch" role="tablist">
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <Box
              key={t.id}
              as="button"
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.id)}
              flex="1"
              minH="60px"
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              gap={1}
              bg="transparent"
              border="none"
              // Top border used as the active indicator — thin gold rule
              // that reads consistently with the rest of the site.
              borderTop="2px solid"
              borderTopColor={isActive ? '#c9a96e' : 'transparent'}
              color={isActive ? '#c9a96e' : 'gray.500'}
              cursor="pointer"
              transition="color 0.15s, background 0.15s"
              _active={{ bg: 'rgba(201, 169, 110, 0.08)' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon as={t.icon} boxSize={5} />
              <Text
                as="span"
                fontSize="10px"
                fontWeight={isActive ? '600' : '500'}
                letterSpacing="0.06em"
                textTransform="uppercase"
                lineHeight="1"
              >
                {t.label}
              </Text>
            </Box>
          );
        })}
      </Flex>
    </Box>
  );
}

export default Admin;
