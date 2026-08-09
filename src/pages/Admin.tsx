import {
  Box, Flex, HStack, VStack, Text, Input, Icon,
  Drawer, DrawerBody, DrawerContent, DrawerOverlay, DrawerCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { AnimatePresence, motion } from 'framer-motion';
import {
  FaUsers, FaPlug, FaBookOpen, FaCommentDots, FaRobot, FaImage,
  FaInbox, FaFolder, FaBars, FaSignOutAlt, FaHome, FaExternalLinkAlt,
} from 'react-icons/fa';
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

// Sub-tab for the Clients group (Table / Calendar). Moved up here from
// AdminDashboard so the mobile bottom-nav sub-strip can drive it directly
// instead of having a duplicate toggle live inside the tab body.
type ClientsView = 'table' | 'calendar';

// Bottom-nav grouping used on mobile. Desktop keeps the flat 6-tab
// pill strip; mobile collapses the 6 tabs into 3 groups + a Menu
// button. Each group with >1 sub-tab shows a small pill strip
// directly above the bottom nav so switching between sub-tabs
// doesn't require opening a submenu.
type NavGroup = 'clients' | 'inbox' | 'studio' | 'menu';

const TAB_TO_GROUP: Record<Exclude<DashTab, 'integrations'>, Exclude<NavGroup, 'menu'>> = {
  clients: 'clients',
  messages: 'inbox',
  assistant: 'inbox',
  journal: 'studio',
  gallery: 'studio',
};

// Which tab each group defaults to when the user first taps it.
const GROUP_DEFAULT_TAB: Record<Exclude<NavGroup, 'menu'>, DashTab> = {
  clients: 'clients',
  inbox: 'messages',
  studio: 'journal',
};

const MotionBox = motion(Box);

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
  // Clients sub-view (Table / Calendar) lives at the shell level so
  // the mobile sub-nav strip can toggle it. AdminDashboard reads it
  // as a prop instead of owning its own internal state.
  const [clientsView, setClientsView] = useState<ClientsView>('table');
  // Menu drawer (mobile + desktop). Opens when the user taps the
  // Menu button in the bottom nav (mobile) or the Menu icon in the
  // desktop tab strip. Contents: sign out, jump to public site,
  // integrations for super-admin.
  const menuDisclosure = useDisclosure();

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

  /**
   * Sign out of the admin panel. Not a real "session" — the password
   * lives in component state until reload — but this gives Vero a
   * clean way to lock the panel back down (e.g. handing her laptop
   * to a client mid-session) without needing to close the browser.
   * Clears state + returns to the login screen.
   */
  const handleSignOut = () => {
    setPortals(null);
    setPassword('');
    setError('');
    setView({ kind: 'dashboard' });
    setDashTab('clients');
    setAdminLevel('admin');
    menuDisclosure.onClose();
  };

  // When we transition from the login screen to the dashboard, scroll
  // to the very top of the page — the user just tapped Sign In in the
  // middle of the viewport, and without this the browser retains
  // whatever scroll position the login page had (which was often
  // scrolled down because the login card is centered vertically).
  // Also scroll to top on tab switch so each tab starts at its header.
  useEffect(() => {
    if (portals) window.scrollTo(0, 0);
  }, [portals]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [dashTab, view.kind]);

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
          // Admin now hides the site-wide Navbar/Footer, so we no longer
          // need to leave a huge top gap for a fixed navbar. Small top
          // safe-area on mobile (notch) + generous bottom padding so the
          // fixed bottom nav doesn't cover the last row of content.
          pt={{ base: 'calc(env(safe-area-inset-top) + 12px)', md: 8 }}
          pb={{ base: 'calc(80px + env(safe-area-inset-bottom))', md: 12 }}
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
                onOpenMenu={menuDisclosure.onOpen}
              />
              {dashTab === 'clients' && (
                <AdminDashboard
                  portals={portals}
                  onNewClient={() => setView({ kind: 'mode-chooser' })}
                  onOpenPortal={(id) => setView({ kind: 'detail', id })}
                  onRefresh={handleRefresh}
                  viewMode={clientsView}
                  onChangeViewMode={setClientsView}
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
        {/* Mobile-only bottom nav + sub-nav strip. Rendered once here
            at the shell level so it stays visible while Vero is
            reading a conversation, editing a photo, etc. — the way
            iOS/Android tab bars work. Hidden during drill-in sub-flows
            (mode-chooser / new-client / client-detail) since those
            have their own back navigation. */}
        {view.kind === 'dashboard' && (
          <AdminMobileNav
            activeTab={dashTab}
            clientsView={clientsView}
            onChangeTab={setDashTab}
            onChangeClientsView={setClientsView}
            onOpenMenu={menuDisclosure.onOpen}
          />
        )}

        {/* Menu drawer — the "More" panel behind the Menu bottom-nav
            slot. Sign out, public-site links, home, integrations for
            super. Reused on desktop via the Menu button in the top
            pill strip. */}
        <AdminMenuDrawer
          isOpen={menuDisclosure.isOpen}
          onClose={menuDisclosure.onClose}
          adminLevel={adminLevel}
          onSignOut={handleSignOut}
          onGoIntegrations={() => {
            setDashTab('integrations');
            menuDisclosure.onClose();
          }}
        />
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
        // Site navbar no longer renders on /admin, so the login card
        // sits centered without needing to leave room for it.
        pt={{ base: 'calc(env(safe-area-inset-top) + 24px)', md: 12 }}
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
 * DESKTOP tab strip. Same flat 6-tab pill row as before + a Menu
 * button on the right that opens the same drawer the mobile Menu
 * bottom-nav slot opens. Hidden on mobile — bottom nav takes over.
 */
function AdminTabStrip({
  active,
  onChange,
  showIntegrations,
  onOpenMenu,
}: {
  active: DashTab;
  onChange: (t: DashTab) => void;
  showIntegrations: boolean;
  onOpenMenu: () => void;
}) {
  const tabs = tabsFor(showIntegrations);
  if (tabs.length < 2) return null;

  return (
    <Box maxW="1200px" mx="auto" mb={6} display={{ base: 'none', md: 'block' }}>
      <Flex align="center" justify="space-between" gap={4}>
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
        {/* Menu on the far right — sign out + public-site jumps. */}
        <Box
          as="button"
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          display="inline-flex"
          alignItems="center"
          gap={2}
          px={4}
          py={2}
          fontSize="2xs"
          fontWeight="500"
          letterSpacing="0.2em"
          textTransform="uppercase"
          color="gray.500"
          bg="transparent"
          border="1px solid"
          borderColor="gray.200"
          borderRadius="full"
          cursor="pointer"
          transition="all 0.2s ease"
          _hover={{ borderColor: '#c9a96e', color: '#c9a96e' }}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Icon as={FaBars} boxSize={3} />
          <Box as="span">Menu</Box>
        </Box>
      </Flex>
    </Box>
  );
}

/**
 * MOBILE bottom nav — 4 groups (Clients / Inbox / Studio / Menu) plus
 * a sub-nav pill strip that appears directly above the bar when the
 * active group has multiple sub-tabs. The pill strip animates in/out
 * per Framer Motion so tapping between groups feels responsive.
 *
 * Fixed to the bottom of the viewport, respects safe-area-inset so it
 * clears the iOS home indicator, always thumb-reachable regardless of
 * scroll position.
 */
function AdminMobileNav({
  activeTab,
  clientsView,
  onChangeTab,
  onChangeClientsView,
  onOpenMenu,
}: {
  activeTab: DashTab;
  clientsView: ClientsView;
  onChangeTab: (t: DashTab) => void;
  onChangeClientsView: (v: ClientsView) => void;
  onOpenMenu: () => void;
}) {
  // Derive the active group from the active tab. Integrations lives
  // inside the Menu drawer, so if that's somehow active we treat the
  // group as 'menu' visually.
  const activeGroup: NavGroup =
    activeTab === 'integrations' ? 'menu' : TAB_TO_GROUP[activeTab];

  // What sub-tab pills belong under each group. Menu has none (it
  // opens a drawer instead of switching content).
  const subNav: Array<{ id: string; label: string; isActive: boolean; onClick: () => void }> =
    activeGroup === 'clients'
      ? [
          { id: 'table', label: 'Table', isActive: clientsView === 'table', onClick: () => onChangeClientsView('table') },
          { id: 'calendar', label: 'Calendar', isActive: clientsView === 'calendar', onClick: () => onChangeClientsView('calendar') },
        ]
      : activeGroup === 'inbox'
      ? [
          { id: 'messages', label: 'Messages', isActive: activeTab === 'messages', onClick: () => onChangeTab('messages') },
          { id: 'assistant', label: 'Assistant', isActive: activeTab === 'assistant', onClick: () => onChangeTab('assistant') },
        ]
      : activeGroup === 'studio'
      ? [
          { id: 'journal', label: 'Journal', isActive: activeTab === 'journal', onClick: () => onChangeTab('journal') },
          { id: 'gallery', label: 'Gallery', isActive: activeTab === 'gallery', onClick: () => onChangeTab('gallery') },
        ]
      : [];

  const groups: Array<{ id: NavGroup; label: string; icon: typeof FaUsers; onClick: () => void }> = [
    {
      id: 'clients',
      label: 'Clients',
      icon: FaUsers,
      // Tapping Clients while already in a clients group is a no-op;
      // tapping from another group jumps to the default clients tab.
      onClick: () => onChangeTab('clients'),
    },
    {
      id: 'inbox',
      label: 'Inbox',
      icon: FaInbox,
      onClick: () => {
        if (activeGroup !== 'inbox') onChangeTab(GROUP_DEFAULT_TAB.inbox);
      },
    },
    {
      id: 'studio',
      label: 'Studio',
      icon: FaFolder,
      onClick: () => {
        if (activeGroup !== 'studio') onChangeTab(GROUP_DEFAULT_TAB.studio);
      },
    },
    { id: 'menu', label: 'Menu', icon: FaBars, onClick: onOpenMenu },
  ];

  return (
    <Box
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      zIndex={30}
      display={{ base: 'block', md: 'none' }}
      pointerEvents="none"
    >
      {/* Sub-nav pill strip — appears ABOVE the bottom bar when the
          active group has 2+ tabs. Animated in/out per group change.
          Pointer-events re-enabled here so taps register. */}
      <AnimatePresence initial={false} mode="wait">
        {subNav.length > 1 && (
          <MotionBox
            key={activeGroup}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            display="flex"
            justifyContent="center"
            px={3}
            mb={2}
            pointerEvents="none"
          >
            <HStack
              spacing={1}
              bg="white"
              border="1px solid"
              borderColor="gray.200"
              borderRadius="full"
              p="4px"
              boxShadow="0 4px 16px -6px rgba(0, 0, 0, 0.12)"
              pointerEvents="auto"
            >
              {subNav.map((s) => (
                <Box
                  key={s.id}
                  as="button"
                  type="button"
                  onClick={s.onClick}
                  aria-pressed={s.isActive}
                  px={4}
                  py={2}
                  minH="36px"
                  fontSize="xs"
                  fontWeight="600"
                  letterSpacing="0.12em"
                  textTransform="uppercase"
                  color={s.isActive ? 'white' : 'gray.600'}
                  bg={s.isActive ? '#c9a96e' : 'transparent'}
                  borderRadius="full"
                  border="none"
                  cursor="pointer"
                  transition="all 0.15s"
                  _active={s.isActive ? { bg: '#b8964f' } : { bg: 'rgba(201, 169, 110, 0.08)' }}
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {s.label}
                </Box>
              ))}
            </HStack>
          </MotionBox>
        )}
      </AnimatePresence>

      {/* Bottom nav bar — 4 groups, always visible. */}
      <Box
        bg="white"
        borderTop="1px solid"
        borderColor="gray.200"
        pb="env(safe-area-inset-bottom)"
        boxShadow="0 -2px 12px -6px rgba(0, 0, 0, 0.08)"
        pointerEvents="auto"
      >
        <Flex align="stretch" role="tablist">
          {groups.map((g) => {
            const isActive = activeGroup === g.id;
            return (
              <Box
                key={g.id}
                as="button"
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={g.onClick}
                flex="1"
                minH="60px"
                display="flex"
                flexDirection="column"
                alignItems="center"
                justifyContent="center"
                gap={1}
                bg="transparent"
                border="none"
                borderTop="2px solid"
                borderTopColor={isActive && g.id !== 'menu' ? '#c9a96e' : 'transparent'}
                color={isActive && g.id !== 'menu' ? '#c9a96e' : 'gray.500'}
                cursor="pointer"
                transition="color 0.15s, background 0.15s"
                _active={{ bg: 'rgba(201, 169, 110, 0.08)' }}
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Icon as={g.icon} boxSize={5} />
                <Text
                  as="span"
                  fontSize="10px"
                  fontWeight={isActive ? '600' : '500'}
                  letterSpacing="0.06em"
                  textTransform="uppercase"
                  lineHeight="1"
                >
                  {g.label}
                </Text>
              </Box>
            );
          })}
        </Flex>
      </Box>
    </Box>
  );
}

/**
 * Menu drawer — the "More" panel behind the Menu bottom-nav slot.
 * Slides in from the right on both mobile + desktop (Chakra's default
 * for Drawer placement="right"). Holds the meta-actions that don't
 * belong in a tab: sign out, jump-to-public-site links, and (for
 * super only) a shortcut to the Integrations tab.
 *
 * Deliberately a Drawer rather than an inline dropdown so it can hold
 * arbitrarily many items in future without eating bottom-nav space.
 */
function AdminMenuDrawer({
  isOpen,
  onClose,
  adminLevel,
  onSignOut,
  onGoIntegrations,
}: {
  isOpen: boolean;
  onClose: () => void;
  adminLevel: 'admin' | 'super';
  onSignOut: () => void;
  onGoIntegrations: () => void;
}) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} placement="right" size="xs">
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton size="lg" top={3} right={3} />
        <Box px={6} pt={6} pb={2}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="#c9a96e"
          >
            Admin
          </Text>
          <Text as="h2" fontSize="xl" fontWeight="300" color="gray.800" mt={1}>
            Menu
          </Text>
        </Box>
        <DrawerBody
          pb="max(env(safe-area-inset-bottom), 24px)"
          px={0}
        >
          <VStack align="stretch" spacing={0} mt={4}>
            {/* Public site jumps — Vero's own website links so she
                can preview what she's building. Opens in a new tab
                so the admin session stays intact. */}
            <MenuSectionLabel>Public site</MenuSectionLabel>
            <MenuLink href="/" icon={FaHome} label="Home" newTab />
            <MenuLink href="/gallery" icon={FaImage} label="Gallery" newTab />
            <MenuLink href="/journal" icon={FaBookOpen} label="Journal" newTab />
            <MenuLink href="/portal" icon={FaExternalLinkAlt} label="Client Portal" newTab />

            {adminLevel === 'super' && (
              <>
                <MenuSectionLabel>Super</MenuSectionLabel>
                <MenuButton icon={FaPlug} label="Integrations" onClick={onGoIntegrations} />
              </>
            )}

            <MenuSectionLabel>Session</MenuSectionLabel>
            <MenuButton icon={FaSignOutAlt} label="Sign out" onClick={onSignOut} danger />
          </VStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

function MenuSectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      fontSize="2xs"
      fontWeight="600"
      letterSpacing="0.2em"
      textTransform="uppercase"
      color="gray.400"
      px={6}
      pt={4}
      pb={2}
    >
      {children}
    </Text>
  );
}

function MenuLink({
  href,
  icon,
  label,
  newTab,
}: {
  href: string;
  icon: typeof FaHome;
  label: string;
  newTab?: boolean;
}) {
  return (
    <Box
      as="a"
      href={href}
      target={newTab ? '_blank' : undefined}
      rel={newTab ? 'noopener noreferrer' : undefined}
      display="flex"
      alignItems="center"
      gap={3}
      px={6}
      py={3.5}
      minH="52px"
      color="gray.700"
      textDecoration="none"
      transition="background 0.15s"
      _hover={{ bg: 'rgba(201, 169, 110, 0.06)', color: '#c9a96e' }}
      _active={{ bg: 'rgba(201, 169, 110, 0.12)' }}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Icon as={icon} boxSize={4} color="#c9a96e" />
      <Text fontSize="sm" fontWeight="400">{label}</Text>
      {newTab && <Icon as={FaExternalLinkAlt} boxSize={2.5} color="gray.400" ml="auto" />}
    </Box>
  );
}

function MenuButton({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: typeof FaHome;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      display="flex"
      alignItems="center"
      gap={3}
      w="100%"
      textAlign="left"
      px={6}
      py={3.5}
      minH="52px"
      color={danger ? 'red.600' : 'gray.700'}
      bg="transparent"
      border="none"
      cursor="pointer"
      transition="background 0.15s"
      _hover={{ bg: danger ? 'red.50' : 'rgba(201, 169, 110, 0.06)' }}
      _active={{ bg: danger ? 'red.100' : 'rgba(201, 169, 110, 0.12)' }}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Icon as={icon} boxSize={4} color={danger ? 'red.500' : '#c9a96e'} />
      <Text fontSize="sm" fontWeight="400">{label}</Text>
    </Box>
  );
}

export default Admin;
