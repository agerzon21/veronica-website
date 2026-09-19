import ToastHost from '../components/ui/ToastHost';
// domMax, not domAnimation: the tab underline at `layoutId="portal-tab-underline"`
// needs layout projection, which the light feature set does not include. This
// nests inside the app's LazyMotion and wins for this subtree. Because Portal is
// code-split, the extra features land in Portal's chunk, not the homepage's.
import { LazyMotion, domMax } from 'framer-motion';
import { Box, Flex, VStack, Text, Input, HStack, InputGroup, InputRightElement, Icon } from '@chakra-ui/react';
import { useEffect, useState, useCallback } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { m, AnimatePresence } from 'framer-motion';
import FaEye from '../icons/fa/FaEye';
import FaEyeSlash from '../icons/fa/FaEyeSlash';
import FaSignOutAlt from '../icons/fa/FaSignOutAlt';
import CTAButton from '../components/ui/CTAButton';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import PortalHeader from '../components/PortalHeader';
import { HEADER_CLEARANCE, portalChrome } from '../components/portalLayout';
import ReadingProgress from '../components/ReadingProgress';
import ClientGallery, {
  useGalleryNav,
  type DriveFile,
  type FolderSection,
} from '../components/ClientGallery';
import ClientPortalView, { type ClientPortalData } from '../components/ClientPortalView';
import Reveal from '../components/ui/Reveal';
import { prefersReducedMotion } from '../utils/motion';

/**
 * The portal session, kept for the length of the browser tab.
 *
 * Until now the credentials lived in React state and nowhere else, so ANY
 * reload signed the client out. That was mostly invisible, until it was not:
 * the chunk error boundary reloads the page by design when a lazily loaded
 * route fails, which on a phone with a flaky connection happens when you tap a
 * photo and the lightbox chunk does not arrive. The client was then dumped at
 * the login form mid gallery with no explanation, which is what was reported
 * as "it randomly logs me out".
 *
 * sessionStorage rather than localStorage on purpose: it is scoped to this tab
 * and dies when the tab closes, so a shared or borrowed phone does not keep a
 * client signed in. It does mean the portal password sits in tab storage for
 * the length of the visit. That is a real trade off, and the right one here:
 * every call this page makes already re-sends the same credential, the gallery
 * password is by design a bearer token in a shareable link, and anything able
 * to read sessionStorage on this origin could read the page itself anyway.
 */
const SESSION_KEY = 'vg:portalSession';

type StoredSession =
  | { kind: 'client'; email: string; password: string }
  | { kind: 'gallery'; password: string };

function storeSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private mode can throw. The visit still works, it just will not
    // survive a reload, which is exactly the old behaviour.
  }
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed?.kind === 'client' && parsed.email && parsed.password) return parsed;
    if (parsed?.kind === 'gallery' && parsed.password) return parsed;
    return null;
  } catch {
    return null;
  }
}

function clearStoredSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to do */
  }
}


const MotionDiv = m.div;

/**
 * The tab panel cross-fade, in seconds, zeroed for a visitor who asked for
 * reduced motion. Read at module scope rather than per render because it runs
 * on a tab switch and the preference cannot change between the read and the
 * frame that uses it.
 *
 * The card's own entrance fade used to sit beside this as REVEAL_SEC. It now
 * comes from <Reveal>, which answers the same query per instance and also
 * gates taps on the card's live opacity.
 */
const TAB_FADE_SEC = prefersReducedMotion() ? 0 : 0.25;

type Tab = 'client' | 'gallery';

type GalleryData = {
  clientName: string | null;
  driveUrl: string;
  rootFiles: DriveFile[];
  sections: FolderSection[];
  warning?: string;
  // ISO timestamp for when the gallery access expires. Surfaced in the
  // gallery-only route as an "available until" notice so guests know
  // when the link will stop working (and to nudge them to save copies).
  expiresAt: string | null;
};

// URL is the source of truth for the active tab — so Veronika can send
// a guest a direct link to /portal/pass and they land on the right form
// without having to be told "click the right tab." Switching tabs in
// the UI updates the URL via replaceState, and browser back/forward
// updates the active tab via the effect below.
const tabFromPath = (pathname: string): Tab =>
  pathname === '/portal/pass' ? 'gallery' : 'client';
const pathFromTab = (t: Tab): string => (t === 'gallery' ? '/portal/pass' : '/portal');

/**
 * The stored session this URL is allowed to reopen, if any.
 *
 * /portal and /portal/pass are two different doors, and the session above
 * shipped without knowing the difference: it restored whatever was in tab
 * storage on whichever of the two you arrived at. That turned a single gallery
 * link into a trap. A guest who had opened a gallery once got that gallery
 * back on /portal for the life of the tab, so the CLIENT ACCOUNT login was
 * unreachable, and so was any other gallery. The logo is deliberately plain
 * navigation, so going home and coming back is exactly the walk that hit it,
 * and short of clearing site data there was no way out. Reported as "it
 * automatically takes me to that last client gallery I was in".
 *
 * So a session only reopens the door it was created at: a gallery session on
 * /portal/pass, a client session on /portal. What it must NOT do is clear
 * itself on the way past the other door. Going home and coming back to
 * /portal/pass has to land a guest back in their photos, because surviving a
 * page load is the entire reason the session exists.
 *
 * A ?password= in the URL outranks a stored gallery password, and that is not
 * a nicety either. The delivery link IS the client's way in and it survives a
 * cache busting reload on purpose, so opening a SECOND gallery's link in a tab
 * that already remembers the first has to land in the second. Without this,
 * the stored password and the link's password both fetch on mount and
 * whichever answered last decided which gallery you were looking at.
 *
 * This is deliberately read ONCE, on mount, and not again when the login form's
 * tabs are switched. Someone standing at a login form and tapping "Gallery
 * Pass" is asking for that form, very often because they want to type a
 * DIFFERENT password. Reopening the remembered gallery under them there would
 * rebuild the same trap one room over.
 */
function restorableSession(pathname: string, search: string): StoredSession | null {
  const stored = readStoredSession();
  if (!stored) return null;
  const door = tabFromPath(pathname);
  if (stored.kind === 'client') return door === 'client' ? stored : null;
  if (door !== 'gallery') return null;
  const linkPassword = new URLSearchParams(search).get('password') ?? '';
  return linkPassword.trim() ? null : stored;
}

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
  //
  // On the gallery tab, ?password= ALSO pre-fills and auto-submits — that
  // lets us send "one-click" gallery links in the delivery email. Same
  // security model as before: anyone with the URL has access, same as
  // anyone with the password did. We deliberately do NOT support
  // ?password= on the client tab (full-portal login) — typing the
  // password is the friction we want there.
  const [email, setEmail] = useState(() => searchParams.get('email') ?? '');
  const [clientPassword, setClientPassword] = useState('');
  const [galleryPassword, setGalleryPassword] = useState(
    () => (tabFromPath(location.pathname) === 'gallery' ? searchParams.get('password') ?? '' : ''),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [autoSubmittedGallery, setAutoSubmittedGallery] = useState(false);
  const [showClientPassword, setShowClientPassword] = useState(false);

  // Forgot-password. This only became necessary once passwords were hashed —
  // before that Vero could read a client's password in the admin panel and just
  // tell them. Now nobody can, and the only other recovery is her manually
  // overriding it, which requires the client to reach her first.
  const [resetRequested, setResetRequested] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [showGalleryPassword, setShowGalleryPassword] = useState(false);

  // Post-login state — one of these gets set on a successful auth, which
  // unmounts the form and renders the corresponding view.
  const handleForgotPassword = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Enter your email address first, then tap this again.');
      return;
    }
    setResetSending(true);
    setError('');
    try {
      await fetch('/api/portal/request-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
    } catch {
      // Swallowed on purpose. The endpoint always returns a uniform 200 so it
      // cannot be used to test whether an address belongs to a client, and
      // surfacing a network error here would undo that: "error" vs "sent" would
      // become the very signal the uniform response exists to remove.
    } finally {
      setResetSending(false);
      setResetRequested(true);
    }
  };

  const [clientData, setClientData] = useState<ClientPortalData | null>(null);
  const [galleryData, setGalleryData] = useState<GalleryData | null>(null);
  /**
   * True while we are trying a stored session, so the login form does not
   * flash before we know whether the client is still signed in.
   */
  const [restoring, setRestoring] = useState(
    () => restorableSession(location.pathname, location.search) !== null,
  );
  /** The gallery only route's Sign Out confirmation, see handleGalleryLogout. */
  const [gallerySignOutOpen, setGallerySignOutOpen] = useState(false);

  /**
   * Sign out.
   *
   * There is no session to end. The credentials live in this component's React
   * state and nowhere else, which is why a refresh already drops a client back
   * to the login form. So signing out is: forget the data, forget the
   * password, land back on the login form at the top of the page.
   *
   * The email stays filled in. It is not the secret, and retyping it is the
   * kind of small rudeness that makes people avoid signing out on a shared
   * laptop, which is the one place it matters.
   */
  /**
   * Put the client back where they were after a reload.
   *
   * Runs once on mount. A stored session that no longer authenticates is
   * dropped silently and the login form shows, which covers a rotated
   * password, a deleted portal, and a session copied between tabs.
   *
   * restorableSession, not readStoredSession: see its comment above for why a
   * remembered gallery must stay out of /portal, and why a ?password= link
   * outranks it on /portal/pass.
   */
  useEffect(() => {
    const stored = restorableSession(location.pathname, location.search);
    if (!stored) return;
    let cancelled = false;
    (async () => {
      try {
        const endpoint = stored.kind === 'client' ? '/api/portal/client' : '/api/portal/gallery';
        const body =
          stored.kind === 'client'
            ? { email: stored.email, password: stored.password }
            : { password: stored.password };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success) {
          if (stored.kind === 'client') {
            setEmail(stored.email);
            setClientPassword(stored.password);
            setClientData(data as ClientPortalData);
          } else {
            setGalleryPassword(stored.password);
            setGalleryData({
              clientName: data.client_name ?? null,
              driveUrl: data.drive_url,
              rootFiles: data.rootFiles ?? [],
              sections: data.sections ?? [],
              warning: data.warning,
              expiresAt: data.gallery_expires_at ?? null,
            });
          }
        } else {
          clearStoredSession();
        }
      } catch {
        // Offline on reload. Keep the stored session: the next load can still
        // restore it, and clearing here would punish a dropped connection by
        // making them sign in again.
      } finally {
        if (!cancelled) setRestoring(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Once, on mount. Deliberately not reactive: the URL it reads is the one
    // this visit arrived at, and re-running on a tab switch is the very thing
    // restorableSession's comment rules out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    clearStoredSession();
    setClientData(null);
    setClientPassword('');
    setError('');
    setTab('client');
    if (location.pathname !== '/portal') {
      navigate('/portal', { replace: true });
    } else {
      // Same route, so the app's ScrollToTop will not fire.
      window.scrollTo({ top: 0 });
    }
  };

  /**
   * Sign out of a shared gallery.
   *
   * The full portal has had a Sign Out since it had anything to sign out of.
   * The gallery only route never got one, because for most of its life there
   * was genuinely nothing to end: the password lived in React state and any
   * reload dropped it. Persisting it fixed the reload and left a guest with no
   * door out at all, which is the bug this pairs with restorableSession above.
   *
   * Lands on the gallery password form rather than the client login, because
   * that is what somebody leaving a gallery is most likely to want next: the
   * reported case is wanting to open a DIFFERENT gallery in the same tab.
   *
   * Two things come off in that one navigation. The password is dropped out of
   * the address bar, where a delivery link leaves it, which matters on a
   * borrowed phone whose history the next person can read. And it disarms the
   * auto submit: a reload with ?password= still in the URL would hand the guest
   * straight back into the gallery they just closed, and Sign Out would look
   * broken rather than look like a link doing its job.
   */
  const handleGalleryLogout = () => {
    clearStoredSession();
    setGalleryData(null);
    setGalleryPassword('');
    setError('');
    setTab('gallery');
    navigate('/portal/pass', { replace: true });
    // Only the query changed, so the app's ScrollToTop will not fire and the
    // form would otherwise open somewhere down the old gallery's scroll.
    window.scrollTo({ top: 0 });
  };

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
        storeSession({ kind: 'client', email: email.trim(), password: clientPassword.trim() });
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

  const handleGallerySubmit = async (e?: React.FormEvent<HTMLFormElement>) => {
    if (e) e.preventDefault();
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
        // The same store the client login does, and for the same reason: a
        // chunk recovery reload is exactly what happens when a guest taps a
        // photo on a flaky connection, and without this the reload drops them
        // back at the password form. A link carrying ?password= survives on
        // its own, because the recovery preserves the query and the auto
        // submit runs again, so ONLY the typed login was losing its session.
        // That is the narrower half of the bug, and it is still the half a
        // guest hits after the link has been used once.
        storeSession({ kind: 'gallery', password: galleryPassword.trim() });
        setGalleryData({
          clientName: data.client_name ?? null,
          driveUrl: data.drive_url,
          rootFiles: data.rootFiles ?? [],
          sections: data.sections ?? [],
          warning: data.warning,
          expiresAt: data.gallery_expires_at ?? null,
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

  // One-shot auto-submit when the URL carries ?password= on the gallery
  // tab. We only fire once (autoSubmittedGallery guards re-runs after
  // failed submits or tab switches) so the user can correct a bad
  // password without it auto-trying every render.
  useEffect(() => {
    if (autoSubmittedGallery) return;
    if (tab !== 'gallery') return;
    const pwFromUrl = searchParams.get('password');
    if (!pwFromUrl) return;
    if (!galleryPassword.trim()) return;
    setAutoSubmittedGallery(true);
    void handleGallerySubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, galleryPassword, autoSubmittedGallery]);

  // Logged in as full-portal client → render the full client portal view.
  // Pass the credentials through so child sections (e.g. Gallery Pass
  // management) can re-authenticate against the API without us having to
  // mint a session token in this MVP.
  // The gallery's own nav, lifted so the header can carry it on the
  // gallery-only route. Built here rather than inside ClientGallery because
  // the header is a sibling, not a child. Safe to call unconditionally: with
  // no sections it simply returns a one-item list and the header's own
  // length check hides the strip.
  const galleryNav = useGalleryNav({
    sections: galleryData?.sections ?? [],
    // One row of chrome here, not two: the nav is IN the header on this route,
    // so there is nothing pinned under it. Passing the full portal's two-row
    // chrome is what used to land every section heading a whole nav row too
    // low, and left the scan calling a section current 48px before it was.
    chrome: portalChrome(false),
    enabled: !!galleryData,
  });
  const onGallerySelect = useCallback(
    (id: string) => {
      const item = galleryNav.items.find((i) => i.id === id);
      if (!item || item.disabled) return;
      galleryNav.setActiveId(id);
      item.scrollTo();
    },
    [galleryNav],
  );

  if (clientData) {
    return (
      <>
        <Helmet>
          <title>{clientData.client_name ? `${clientData.client_name}, Portal` : 'Client Portal'} | Vero Photography</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <ClientPortalView
          data={clientData}
          credentials={{ email: email.trim(), password: clientPassword.trim() }}
          onDataUpdate={setClientData}
          // Keep the cached credentials in sync when the client changes
          // their password from the Account section. Without this, the
          // next mutating API call (rotate gallery pass, sign contract,
          // etc.) would 401 because we'd still be sending the old one.
          onPasswordChanged={(newPassword) => setClientPassword(newPassword)}
          onLogout={handleLogout}
        />
        {/* Only the NAVBAR was the problem here: it offered a signed-in client
            a link to the Client Portal they were already standing in. The
            footer carries contact and privacy, which a client has more reason
            to want, not less, so it stays. */}
        <Footer />
      </>
    );
  }

  // Logged in via Gallery Pass → render the read-only photo gallery
  if (galleryData) {
    return (
      <>
        <Helmet>
          <title>{galleryData.clientName ? `${galleryData.clientName}, Gallery` : 'Gallery'} | Vero Photography</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        {/* A guest on a shared gallery link has no contract and no balance,
            so the header shows no progress and no money. What it DOES carry is
            the gallery's own navigation, because here that is the only
            navigation there is: Info plus one item per folder. Favourites is
            absent by construction, since this route passes no favourite
            handler and useGalleryNav only includes it when one exists.

            Passing sectionNavInHeader stops ClientGallery rendering its own
            sticky strip, so the guest gets one bar rather than two. Nothing
            passes portalNavRow either, and the two together are how the
            gallery knows its headings have one row of chrome to clear here
            rather than the full portal's two.

            The padding clears that fixed header. ClientGallery does not pad
            for it itself, so the same component can be embedded inside
            ClientPortalView (where the portal wrapper already handles the
            clearance) without doubling up. */}
        {/* The same travelling coin the full portal and a journal post carry.
            A shared gallery is the longest scroll on the site, so if anywhere
            wants a way to jump half way down it by hand, it is here. */}
        <ReadingProgress rail="always" bottomBar={false} autoHide scrub />
        <PortalHeader
          // The gallery's sections, which the header draws as the photo bar at
          // every width. There is nothing to hand off to here, so the bar
          // simply owns the slot: `inPhotos` is not passed because on this
          // route the whole page IS the photos.
          //
          // No accountNav goes with it, and that is the whole reason a guest
          // on a shared link gets no account bar and no burger: there is no
          // account here to open a menu onto.
          sectionNav={{
            items: galleryNav.items,
            activeId: galleryNav.activeId,
            onSelect: onGallerySelect,
          }}
        />
        <Box pt={HEADER_CLEARANCE}>
          <ClientGallery
            clientName={galleryData.clientName}
            driveUrl={galleryData.driveUrl}
            rootFiles={galleryData.rootFiles}
            sections={galleryData.sections}
            warning={galleryData.warning}
            galleryPassword={galleryPassword.trim()}
            expiresAt={galleryData.expiresAt}
            sectionNavInHeader
          />
          {/* The way out.
              Placed at the very end of the gallery, under the share section
              and above the footer, for two reasons. There is nowhere else: the
              header on this route is the logo plus the photo bar and carries no
              burger, by construction, because a guest on a shared link has no
              account to open a menu onto. And anywhere higher would put an exit
              beside the photos, which is the one thing a gallery page should
              not do. Someone scrolling to the end of their photos reaches it
              without hunting, and nobody else ever has to look at it.

              The treatment is the full portal's Refresh and Sign Out pair,
              lifted whole: the same centred CTAButton row, the same outlined
              danger variant (a hairline that only fills on hover, the quiet end
              of the scale), and the same ConfirmDialog behind it. One button
              rather than two, because a guest has nothing here to refresh.
              The line above it is doing the work the full portal's dialog copy
              does: saying what signing out costs before anyone taps it. */}
          <Box
            as="section"
            px={{ base: 4, md: 8 }}
            pt={{ base: 8, md: 10 }}
            pb={{ base: 10, md: 12 }}
            textAlign="center"
            borderTop="1px solid"
            borderColor="brand.accentBorder"
          >
            <Text
              fontSize="sm"
              color="gray.600"
              fontWeight="300"
              lineHeight="1.7"
              maxW="460px"
              mx="auto"
            >
              Finished looking? Signing out closes these photos on this phone or
              computer. You will need the link or the password to open them again.
            </Text>
            <HStack mt={6} spacing={3} justify="center" flexWrap="wrap">
              <CTAButton
                onClick={() => setGallerySignOutOpen(true)}
                icon={FaSignOutAlt}
                variant="danger"
                size="sm"
              >
                Sign Out
              </CTAButton>
            </HStack>
          </Box>
        </Box>
        {/* Asks first, exactly as the full portal's does. Nothing is lost by
            signing out, but a guest who taps it by accident has to find the
            link again, and on a phone that is a real errand. */}
        <ConfirmDialog
          isOpen={gallerySignOutOpen}
          title="Sign out of this gallery?"
          body="You will need the link or the password to open these photos again."
          confirmLabel="Sign Out"
          cancelLabel="Keep Looking"
          danger
          onConfirm={() => {
            setGallerySignOutOpen(false);
            handleGalleryLogout();
          }}
          onCancel={() => setGallerySignOutOpen(false)}
        />
        <Footer />
      </>
    );
  }

  // Trying a stored session. Showing the login form here would flash it at a
  // client who IS signed in, and worse, invite them to type a password they
  // did not need to, so hold a quiet placeholder until we know.
  if (restoring) {
    return (
      <>
        <Helmet>
          <title>Client Portal | Vero Photography</title>
          <meta name="robots" content="noindex, nofollow" />
        </Helmet>
        <Navbar />
        <Flex minH="60vh" align="center" justify="center" pt={{ base: 24, md: 20 }}>
          <Text fontSize="sm" color="gray.400" fontWeight="300" letterSpacing="0.1em">
            Opening your portal...
          </Text>
        </Flex>
        <Footer />
      </>
    );
  }

  // Not yet authenticated → tabbed login form.
  //
  // Renders the site Navbar + Footer inline. Both /portal and /portal/pass
  // serve this form as well as the logged-in view, so App.tsx cannot tell the
  // two apart by path and hides the global chrome for the whole route. The
  // login form IS a public page and keeps its way back to the site, so it
  // brings its own, exactly as the admin login screen does. The pt below
  // assumes the Navbar is here; do not remove one without the other.
  return (
    <>
    <Navbar />
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
          {/* Fades in, does not slide in.
              This used to come up 20px over 600ms, and the tab panels below
              used to do the same 8px. It looks nice and it is a trap: every
              tap target on a sign-in form spends the first half second
              travelling, so a finger already on its way to the password box
              lands wherever that box WAS. A control that moves while you are
              reaching for it is a bug even when nothing else goes wrong, and
              here something else did go wrong (see MobileNav). Opacity alone
              keeps the arrival without moving anything, which is why `from`
              names opacity and nothing else.
              Reveal answers the reduced-motion query itself, so the local
              REVEAL_SEC this used to take its duration from is gone. It also
              gates taps on the live opacity: every control in this card, the
              password box included, used to be hit-testable while the card
              was still invisible. */}
          <Reveal immediate from={{ opacity: 0 }} duration={0.6}>
            <VStack spacing={8}>
              {/* Heading */}
              <VStack spacing={4}>
                <Text
                  fontSize="xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.25em"
                  color="brand.accent"
                >
                  Welcome
                </Text>
                <Box w="40px" h="1px" bg="brand.accent" />
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
                      color={active ? 'brand.accent' : 'whiteAlpha.600'}
                      transition="color 0.3s"
                      _hover={{ color: active ? 'brand.accent' : 'whiteAlpha.800' }}
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
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: TAB_FADE_SEC }}
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
                          <PortalPasswordInput
                            id="client-password"
                            value={clientPassword}
                            onChange={setClientPassword}
                            placeholder="Enter your password"
                            show={showClientPassword}
                            onToggleShow={() => setShowClientPassword((s) => !s)}
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

                          {/* Deliberately understated — it should be findable
                              when needed without competing with Sign In. */}
                          {resetRequested ? (
                            <Text
                              fontSize="xs"
                              color="whiteAlpha.700"
                              textAlign="center"
                              pt={1}
                              lineHeight="1.6"
                            >
                              If that email is on file, a reset link is on its way.
                              It works for one hour.
                            </Text>
                          ) : (
                            <Text
                              as="button"
                              type="button"
                              onClick={handleForgotPassword}
                              fontSize="xs"
                              color="whiteAlpha.600"
                              textAlign="center"
                              pt={1}
                              alignSelf="center"
                              bg="transparent"
                              _hover={{ color: 'brand.accent' }}
                              transition="color 0.2s"
                              sx={{ WebkitTapHighlightColor: 'transparent' }}
                            >
                              {resetSending ? 'Sending…' : 'Forgot your password?'}
                            </Text>
                          )}

                          <Text fontSize="xs" color="whiteAlpha.500" textAlign="center" pt={1}>
                            Full access: contract, payments, photos
                          </Text>
                        </VStack>
                      </Box>
                    </MotionDiv>
                  ) : (
                    <MotionDiv
                      key="gallery-form"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: TAB_FADE_SEC }}
                    >
                      <Box as="form" onSubmit={handleGallerySubmit} w="100%">
                        <VStack spacing={4} w="100%">
                          <FieldLabel htmlFor="gallery-password">Password</FieldLabel>
                          <PortalPasswordInput
                            id="gallery-password"
                            value={galleryPassword}
                            onChange={setGalleryPassword}
                            placeholder="Enter the gallery password"
                            show={showGalleryPassword}
                            onToggleShow={() => setShowGalleryPassword((s) => !s)}
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
                            View photos only, for guests and family
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
                  Not a client? No problem,
                </Text>
                <Text
                  as={RouterLink}
                  to="/gallery"
                  fontSize="xs"
                  fontWeight="500"
                  color="brand.accent"
                  letterSpacing="0.2em"
                  textTransform="uppercase"
                  _hover={{ color: 'brand.accentSoft' }}
                  transition="color 0.3s"
                >
                  Browse the public portfolio →
                </Text>
              </VStack>
            </VStack>
          </Reveal>
        </Box>
      </Flex>
    </Box>
    <Footer />
    </>
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
    color="brand.accent"
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
      borderColor: 'brand.accent',
      boxShadow: '0 0 0 1px #c9a96e',
      bg: 'blackAlpha.600',
    }}
  />
);

// Password input with an eye toggle. We use this for both the client
// portal login password and the gallery pass, so users can verify what
// they're typing without exposing it to anyone watching the screen.
function PortalPasswordInput({
  id,
  value,
  onChange,
  placeholder,
  show,
  onToggleShow,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  show: boolean;
  onToggleShow: () => void;
  autoFocus?: boolean;
}) {
  return (
    <InputGroup>
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        h="48px"
        bg="blackAlpha.500"
        border="1px solid"
        borderColor="whiteAlpha.300"
        color="white"
        fontSize="sm"
        fontWeight="300"
        borderRadius="sm"
        pr="3.2rem"
        _placeholder={{ color: 'whiteAlpha.500', fontWeight: '300' }}
        _hover={{ borderColor: 'whiteAlpha.500' }}
        _focus={{
          borderColor: 'brand.accent',
          boxShadow: '0 0 0 1px #c9a96e',
          bg: 'blackAlpha.600',
        }}
      />
      <InputRightElement h="48px" pr={2}>
        <Box
          as="button"
          type="button"
          onClick={onToggleShow}
          aria-label={show ? 'Hide password' : 'Show password'}
          color="whiteAlpha.600"
          _hover={{ color: 'brand.accent' }}
          bg="transparent"
          border="none"
          cursor="pointer"
          p={2}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Icon as={show ? FaEyeSlash : FaEye} boxSize={3.5} />
        </Box>
      </InputRightElement>
    </InputGroup>
  );
}

const ErrorText = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize="sm" color="red.300" fontWeight="300" textAlign="center">
    {children}
  </Text>
);

/**
 * Wrapped so anything in this route can raise a toast. The app root uses
 * Chakra's toast-free provider to keep the toast component's framer-motion
 * import off the public bundle, so each route that needs toasts mounts the
 * machinery itself. Without this, useToast here would silently render nothing.
 */
export default function PortalWithToasts(props: Record<string, never>) {
  return (
    <ToastHost>
      <LazyMotion features={domMax} strict>
        <Portal {...props} />
      </LazyMotion>
    </ToastHost>
  );
}
