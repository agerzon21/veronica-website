import {
  Box, Flex, HStack, VStack, Text, Input, Icon,
  Drawer, DrawerBody, DrawerContent, DrawerOverlay, DrawerCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';
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

// (GROUP_DEFAULT_TAB was used by the old auto-navigate-on-group-tap
// behavior. Now that tapping a group only OPENS the sub-menu — the
// user picks the sub-tab explicitly — no default is needed. Kept as
// a comment for the archaeology.)

const MotionBox = motion(Box);

type View =
  | { kind: 'dashboard' }
  | { kind: 'mode-chooser' }
  | { kind: 'new-full' }
  | { kind: 'new-gallery' }
  | { kind: 'detail'; id: string };

const Admin = () => {
  const [email, setEmail] = useState('');
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

  // Two-form fetcher. On INITIAL login (`credentials` includes email),
  // the endpoint validates the email+password pair — this is what makes
  // brute-force so much harder now. On subsequent REFRESH calls we send
  // password alone (bearer token pattern), no email.
  const loadPortals = async (
    credentials: { email?: string; password: string },
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/admin/portals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
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
    if (!email.trim() || !password.trim()) return;
    setSubmitting(true);
    setError('');
    const r = await loadPortals({ email: email.trim(), password: password.trim() });
    setSubmitting(false);
    if (!r.ok) setError(r.error || 'Sign in failed.');
  };

  const handleRefresh = async () => {
    await loadPortals({ password });
  };

  const handleCreated = async () => {
    setView({ kind: 'dashboard' });
    await loadPortals({ password });
  };

  /**
   * Sign out of the admin panel. Not a real "session" — the password
   * lives in component state until reload — but this gives Vero a
   * clean way to lock the panel back down (e.g. handing her laptop
   * to a client mid-session) without needing to close the browser.
   * Clears state + navigates to the public home page (NOT back to
   * /admin's login form — Alex flagged that as a security concern
   * since it advertises the admin URL after logout).
   */
  const handleSignOut = () => {
    setPortals(null);
    setEmail('');
    setPassword('');
    setError('');
    setView({ kind: 'dashboard' });
    setDashTab('clients');
    setAdminLevel('admin');
    menuDisclosure.onClose();
    // Bounce to the marketing home. If someone else picks up the
    // laptop, there's nothing on-screen telling them the URL that
    // reveals the sign-in form.
    window.location.href = '/';
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
          // Top gap clears the fixed site Navbar (~80px). Bottom gap
          // clears our fixed bottom-nav bar + iOS home indicator.
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
                await loadPortals({ password });
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
                    htmlFor="admin-email"
                    display="block"
                    w="100%"
                    fontSize="2xs"
                    fontWeight="500"
                    color="#c9a96e"
                    letterSpacing="0.2em"
                    textTransform="uppercase"
                    mb={-2}
                  >
                    Email
                  </Text>
                  <Input
                    id="admin-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoFocus
                    autoComplete="email"
                    h="48px"
                    bg="blackAlpha.500"
                    border="1px solid"
                    borderColor="whiteAlpha.300"
                    color="white"
                    // 16px keeps iOS Safari from zooming the whole page in
                    // when the field gets focus.
                    fontSize={{ base: '16px', md: 'sm' }}
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
                    placeholder="Enter password"
                    autoComplete="current-password"
                    h="48px"
                    bg="blackAlpha.500"
                    border="1px solid"
                    borderColor="whiteAlpha.300"
                    color="white"
                    fontSize={{ base: '16px', md: 'sm' }}
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
 * MOBILE bottom nav — 4 groups (Clients / Inbox / Studio / Menu). The
 * sub-nav (Table/Calendar, Messages/Assistant, Journal/Gallery) is
 * TAP-TO-OPEN and appears above the bar with a spring animation.
 * Tap anywhere outside the nav to close. Tapping a sub-tab navigates
 * AND closes the strip.
 *
 * A small chevron above each group icon signals that tapping opens
 * a sub-menu, so it doesn't look like a normal one-tap tab.
 *
 * Fixed to the bottom of the viewport, respects safe-area-inset so
 * it clears the iOS home indicator, always thumb-reachable.
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
  // Which group's sub-menu is currently open. Null = collapsed.
  // Tapping a group opens its sub-menu; tapping the same group again
  // closes it; tapping a sub-tab navigates and closes.
  const [openGroup, setOpenGroup] = useState<Exclude<NavGroup, 'menu'> | null>(null);
  const navRef = useRef<HTMLDivElement | null>(null);

  // Close the sub-menu when the user taps anywhere OUTSIDE the nav
  // (chat, header, sub-tab strip). Sub-tab clicks themselves navigate
  // + close via their own handler before this fires.
  useEffect(() => {
    if (!openGroup) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (!navRef.current) return;
      if (navRef.current.contains(e.target as Node)) return;
      setOpenGroup(null);
    };
    // pointerdown fires before click, so submenu closes before other
    // handlers see the tap — feels snappier than click.
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [openGroup]);

  // iOS Safari keeps position:fixed elements pinned to the LAYOUT
  // viewport, which does NOT shrink when the software keyboard opens.
  // Result: while a textarea is focused (e.g. the Assistant chat
  // composer), the entire mobile nav is parked BEHIND the keyboard —
  // taps on where the nav LOOKS to be actually hit the keyboard and
  // do nothing. This was the "Assistant page nav is broken" bug.
  // The visualViewport API measures the visible portion, so we can
  // translate the nav up by exactly the keyboard's height and it
  // re-enters the visible viewport.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const apply = () => {
      if (!navRef.current) return;
      const bottomInset = window.innerHeight - vv.height - vv.offsetTop;
      navRef.current.style.transform =
        bottomInset > 1 ? `translateY(-${bottomInset}px)` : '';
    };
    vv.addEventListener('resize', apply);
    vv.addEventListener('scroll', apply);
    apply();
    return () => {
      vv.removeEventListener('resize', apply);
      vv.removeEventListener('scroll', apply);
    };
  }, []);

  // Also close on route change (safety net — if something outside
  // this component changes activeTab, don't leave a stale panel open).
  useEffect(() => {
    setOpenGroup(null);
  }, [activeTab, clientsView]);

  // Derive the currently-active group purely for visual highlighting
  // (which tab in the bottom bar looks selected). Independent of
  // openGroup — the sub-menu can be open on Inbox while the active
  // group is Studio.
  const activeGroup: NavGroup =
    activeTab === 'integrations' ? 'menu' : TAB_TO_GROUP[activeTab];

  // Sub-nav pill lookup for the open group. Menu never has one
  // (it opens a drawer instead).
  const subNav: Array<{ id: string; label: string; isActive: boolean; onClick: () => void }> =
    openGroup === 'clients'
      ? [
          { id: 'table', label: 'Table', isActive: clientsView === 'table', onClick: () => { onChangeClientsView('table'); if (activeGroup !== 'clients') onChangeTab('clients'); setOpenGroup(null); } },
          { id: 'calendar', label: 'Calendar', isActive: clientsView === 'calendar', onClick: () => { onChangeClientsView('calendar'); if (activeGroup !== 'clients') onChangeTab('clients'); setOpenGroup(null); } },
        ]
      : openGroup === 'inbox'
      ? [
          { id: 'messages', label: 'Messages', isActive: activeTab === 'messages', onClick: () => { onChangeTab('messages'); setOpenGroup(null); } },
          { id: 'assistant', label: 'Assistant', isActive: activeTab === 'assistant', onClick: () => { onChangeTab('assistant'); setOpenGroup(null); } },
        ]
      : openGroup === 'studio'
      ? [
          { id: 'journal', label: 'Journal', isActive: activeTab === 'journal', onClick: () => { onChangeTab('journal'); setOpenGroup(null); } },
          { id: 'gallery', label: 'Gallery', isActive: activeTab === 'gallery', onClick: () => { onChangeTab('gallery'); setOpenGroup(null); } },
        ]
      : [];

  const toggleGroup = (g: Exclude<NavGroup, 'menu'>) => {
    setOpenGroup((cur) => (cur === g ? null : g));
  };

  const groups: Array<{ id: NavGroup; label: string; icon: typeof FaUsers; onClick: () => void; hasSubmenu: boolean }> = [
    { id: 'clients', label: 'Clients', icon: FaUsers, onClick: () => toggleGroup('clients'), hasSubmenu: true },
    { id: 'inbox', label: 'Inbox', icon: FaInbox, onClick: () => toggleGroup('inbox'), hasSubmenu: true },
    { id: 'studio', label: 'Studio', icon: FaFolder, onClick: () => toggleGroup('studio'), hasSubmenu: true },
    { id: 'menu', label: 'Menu', icon: FaBars, onClick: () => { setOpenGroup(null); onOpenMenu(); }, hasSubmenu: false },
  ];

  return (
    <Box
      ref={navRef}
      position="fixed"
      bottom={0}
      left={0}
      right={0}
      zIndex={30}
      display={{ base: 'block', md: 'none' }}
      pointerEvents="none"
    >
      {/* Sub-nav pill strip — appears ABOVE the bottom bar when a
          group's sub-menu is open. Cute spring animation (y +12→0
          with a slight scale bump) so it feels tappable, not just
          faded in. Pointer-events re-enabled on the pill itself so
          taps register but the surrounding padding doesn't intercept
          the outside-click close handler. */}
      <AnimatePresence initial={false} mode="wait">
        {subNav.length > 1 && (
          <MotionBox
            key={openGroup}
            initial={{ opacity: 0, y: 16, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 380, damping: 26, mass: 0.6 }}
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
              borderColor="rgba(201, 169, 110, 0.35)"
              borderRadius="full"
              p="4px"
              boxShadow="0 8px 24px -8px rgba(201, 169, 110, 0.35), 0 2px 6px -2px rgba(0, 0, 0, 0.08)"
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

      {/* Bottom nav bar — 4 groups, always visible. Chevron above the
          icon signals "tap opens a sub-menu"; the chevron rotates
          180° when its group's sub-menu is open. */}
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
            const isOpen = openGroup === g.id;
            return (
              <Box
                key={g.id}
                as="button"
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-expanded={g.hasSubmenu ? isOpen : undefined}
                // Blur any focused input on pointerdown so the tap
                // reliably registers on iOS Safari — otherwise the
                // keyboard dismissal reflow can eat the synthesized
                // click. Complements the visualViewport translation.
                onPointerDown={() => {
                  const el = document.activeElement;
                  if (el instanceof HTMLElement && el !== document.body) el.blur();
                }}
                onClick={g.onClick}
                flex="1"
                minH="60px"
                position="relative"
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
                {/* Chevron affordance — signals the tab opens a submenu.
                    Small enough to not compete with the icon; rotates
                    when the submenu is open. */}
                {g.hasSubmenu && (
                  <Box
                    position="absolute"
                    top="4px"
                    left="50%"
                    transform={`translateX(-50%) rotate(${isOpen ? 180 : 0}deg)`}
                    transition="transform 0.2s ease"
                    color={isActive ? '#c9a96e' : 'gray.300'}
                    fontSize="8px"
                    lineHeight="1"
                    pointerEvents="none"
                    aria-hidden
                  >
                    ▲
                  </Box>
                )}
                <Icon as={g.icon} boxSize={5} mt={g.hasSubmenu ? '4px' : 0} />
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
