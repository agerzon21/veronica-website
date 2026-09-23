import ToastHost from '../components/ui/ToastHost';
// domAnimation, not domMax. This was domMax for one reason: the tab strip's
// underline used `layoutId="portal-tab-underline"`, and shared-layout
// animation needs layout projection. The tabs are accordion doors now and
// nothing left under this provider animates layout, so the heavier feature
// set is dead weight in Portal's chunk. If a `layout`, `layoutId` or `drag`
// prop ever appears in this subtree, it silently does nothing until this goes
// back to domMax.
import { LazyMotion, domAnimation } from 'framer-motion';
import { Box, Flex, VStack, Text, Input, HStack, InputGroup, InputRightElement, Icon } from '@chakra-ui/react';
import { useEffect, useState, useCallback, useRef } from 'react';
import { Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import FaChevronRight from '../icons/fa/FaChevronRight';
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
import PortalMosaic from '../components/PortalMosaic';
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


/* The tab strip's cross-fade lived here, with MotionDiv and TAB_FADE_SEC.
   Both are gone with it: the two ways in are accordion panels now, and the
   panel animates on its own height in CSS rather than swapping two cards
   through AnimatePresence. prefersReducedMotion is still used further down. */

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


/**
 * What the client sees when Stripe sends them back.
 *
 * _pay-start.ts has always returned them to /portal?paid=1, and the comment
 * above that line claimed "the query flag only decides which message they land
 * on". Nothing read it. Nothing in src/ ever had. So a client paid, landed back
 * on a portal identical to the one they left, and because the browser redirect
 * beats the webhook, the page could still be asking for the money they had
 * just sent. The only reasonable reading is that the payment failed, and the
 * next thing anyone does is pay again.
 *
 * The webhook is still the only thing that records money. This polls the
 * portal until the ledger moves, so the page tells the truth on its own rather
 * than depending on the client thinking to press Refresh Portal.
 *
 * Give up after five tries and say so plainly. A banner that spins forever is
 * a worse lie than the silence it replaced.
 */
function PaymentReturnBanner({
  credentials,
  data,
  onDataUpdate,
}: {
  credentials: { email: string; password: string };
  data: ClientPortalData;
  onDataUpdate: (d: ClientPortalData) => void;
}) {
  // Read the flags ONCE, before the effect below strips them from the URL.
  const [flag] = useState(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('paid'),
  );
  const [isTip] = useState(() =>
    typeof window === 'undefined'
      ? false
      : new URLSearchParams(window.location.search).get('tip') === '1',
  );

  // The numbers as they stood the moment we landed. A ref, because `data`
  // changes under us the instant the poll succeeds and a state copy would
  // then be comparing the new total against itself.
  const baseline = useRef<{ paid: number; tips: number } | null>(null);
  if (baseline.current === null) {
    baseline.current = { paid: data.paid_to_date ?? 0, tips: data.tips_total ?? 0 };
  }

  const [phase, setPhase] = useState<'checking' | 'confirmed' | 'slow' | 'cancelled' | 'none'>(
    flag === '1' ? 'checking' : flag === '0' ? 'cancelled' : 'none',
  );

  // Strip the flags immediately. A reload, a back button, or a URL pasted to
  // somebody else must not replay a payment confirmation.
  useEffect(() => {
    if (flag == null || typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.delete('paid');
    url.searchParams.delete('tip');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }, [flag]);

  /**
   * Put a returning tipper back where they were.
   *
   * Stripe returns to the top of a long page, so somebody who tipped from the
   * bottom of the gallery had to find their place again. _pay-start.ts sends
   * them to #thanks; the browser cannot honour that itself because the portal
   * renders after the navigation, so it is done here once the section exists.
   *
   * Polled rather than fired once: the gallery mounts well after the portal
   * shell, and a single attempt on mount lands before the anchor is in the DOM.
   */
  useEffect(() => {
    if (!isTip || typeof window === 'undefined') return undefined;
    if (window.location.hash !== '#thanks') return undefined;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      const el = document.getElementById('thanks');
      if (el) {
        el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
        window.clearInterval(id);
      } else if (tries > 40) {
        window.clearInterval(id);
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [isTip]);

  useEffect(() => {
    if (phase !== 'checking') return undefined;
    let cancelled = false;
    let tries = 0;
    let timer = 0;

    const moved = (d: ClientPortalData) =>
      isTip
        ? (d.tips_total ?? 0) > (baseline.current?.tips ?? 0)
        : (d.paid_to_date ?? 0) > (baseline.current?.paid ?? 0);

    const tick = async () => {
      tries += 1;
      try {
        const res = await fetch('/api/portal/client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: credentials.email, password: credentials.password }),
        });
        const next = await res.json();
        if (cancelled) return;
        if (res.ok && next.success && moved(next as ClientPortalData)) {
          onDataUpdate(next as ClientPortalData);
          setPhase('confirmed');
          return;
        }
      } catch {
        // A dropped request is not a failed payment. Keep trying.
      }
      if (cancelled) return;
      if (tries >= 5) {
        setPhase('slow');
        return;
      }
      timer = window.setTimeout(tick, 2000);
    };

    timer = window.setTimeout(tick, 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phase, isTip, credentials.email, credentials.password, onDataUpdate]);

  if (phase === 'none') return null;

  const tone =
    phase === 'confirmed'
      ? { bg: 'green.50', border: 'green.200', fg: 'green.800' }
      : phase === 'cancelled'
        ? { bg: 'gray.50', border: 'gray.200', fg: 'gray.700' }
        : { bg: 'brand.surface', border: 'brand.accentBorder', fg: 'gray.800' };

  const noun = isTip ? 'tip' : 'payment';
  const message =
    phase === 'confirmed'
      ? isTip
        ? 'Your tip came through. Thank you, truly.'
        : 'Payment received. Your booking is up to date.'
      : phase === 'cancelled'
        ? `No ${noun} was taken. Nothing has been charged.`
        : phase === 'slow'
          ? `Your ${noun} went through at Stripe. It can take a minute to show here, so tap Refresh Portal below if the figures still look old.`
          : `${isTip ? 'Tip' : 'Payment'} received. Updating your booking...`;

  return (
    /**
     * CLEARS THE STICKY HEADER.
     *
     * The portal header is sticky at the top of the page, and this banner sat
     * directly under it in the document with only 16px of padding, so the
     * header covered almost all of it. Scrolling revealed it for as long as
     * the header was retracted and then hid it again the moment the header
     * snapped back, which is the one moment the message matters.
     *
     * scrollMarginTop does the same job for the anchor a returning tipper
     * lands on.
     */
    <Box
      px={{ base: 4, md: 6 }}
      pt={`calc(${HEADER_CLEARANCE} + 16px)`}
      sx={{ scrollMarginTop: `calc(${HEADER_CLEARANCE} + 16px)` }}
    >
      <Box
        role="status"
        aria-live="polite"
        maxW="720px"
        mx="auto"
        bg={tone.bg}
        border="1px solid"
        borderColor={tone.border}
        borderRadius="md"
        px={5}
        py={4}
      >
        <Text fontSize="sm" color={tone.fg} fontWeight="400" lineHeight="1.6" textAlign="center">
          {message}
        </Text>
      </Box>
    </Box>
  );
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

    const previewToken = (searchParams.get('preview') ?? '').trim();

    try {
      /**
       * The preview token goes in the QUERY STRING, not the body.
       *
       * ?preview= is the admin panel's short lived pass for a gallery that has
       * not been released yet (the link is built at AdminClientDetail.tsx:782).
       * The token has to be forwarded, not just sit in this page's address bar:
       * the server decides whether the photos come back and it cannot see the
       * browser's URL.
       *
       * And it has to go on the URL, because api/portal/_gallery.ts:97 reads it
       * off req.query. Putting it in the POST body compiles, typechecks, ships
       * and does absolutely nothing, which is worse than not sending it: the
       * button looks fixed and still 403s.
       */
      const res = await fetch(
        `/api/portal/gallery${previewToken ? `?preview=${encodeURIComponent(previewToken)}` : ''}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: galleryPassword.trim() }),
        },
      );
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
        <PaymentReturnBanner
          credentials={{ email: email.trim(), password: clientPassword.trim() }}
          data={clientData}
          onDataUpdate={setClientData}
        />
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
    <Box position="relative" minH="100vh" overflow="hidden" bg="brand.surfaceSunken">
      <Helmet>
        <title>Portal | Vero Photography</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      {/* A hundred and twenty photographs drifting behind the form, as one
          sprite sheet. It replaces a single 913 KB photograph and costs about
          220 KB, and it carries its own still fallback for a connection that
          cannot afford it. PortalMosaic has the whole argument. */}
      <PortalMosaic veil={0.62} />

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
              {/* The house header, exactly as PageHeader renders it on
                  Journal, Gallery, Weddings and About: eyebrow, rule, title,
                  lead. It is written out rather than imported because it sits
                  on its own soft spot, which PageHeader has no notion of.

                  THE SOFT SPOT. A gold eyebrow cannot sit on photographs:
                  brand.accentText reaches only 4.58:1 against SOLID cream, so
                  any visible picture behind it puts the label under AA. A
                  uniform veil dark enough to fix that hides the photographs
                  entirely, and lightening the top of the page reads as a
                  spotlight. This is the third answer: a wide, edgeless halo
                  under the words only, which holds the label steady at about
                  4.2:1 instead of letting it swing between 2.5 and 6 as
                  pictures drift past. */}
              <Box position="relative" w="100%">
                <PortalHalo w="1420px" h="800px" />
                <VStack spacing={{ base: 3, md: 4 }} position="relative">
                  <Text textStyle="eyebrow">Client portal</Text>
                  <Box w="40px" h="1px" bg="brand.accent" />
                  <Text
                    as="h1"
                    textStyle="contentTitle"
                    textAlign="center"
                    maxW="26ch"
                    m={0}
                    sx={{ textWrap: 'balance' }}
                  >
                    Everything from your session
                  </Text>
                  <Text textStyle="bodyLead" color="gray.700" textAlign="center" maxW="46ch">
                    Sign in with your email and password to find your contract, your
                    payments and your finished photographs. Given a gallery password
                    instead? Open Gallery pass below.
                  </Text>
                </VStack>
              </Box>

              {/* Two doors, one open.

                  This replaces a tab strip. A tab strip made the two ways in
                  look like two views of one thing; they are not, they are two
                  different people. The one that is open is the one whose
                  question you answered, and each keeps its name and its
                  description visible when closed so nobody has to open a
                  panel to find out what is behind it.

                  `tab` already drives the URL (/portal versus /portal/pass)
                  and the stored-session logic, so opening a door IS switching
                  tab: no second source of truth, and every deep link that
                  worked before still lands on the right panel, now open. */}
              <VStack spacing={3} w="100%">
                <PortalDoor
                  kicker="You booked a session"
                  name="Your account"
                  blurb="Your contract, your payments and your finished photographs, all in one place."
                  open={tab === 'client'}
                  onOpen={() => switchTab('client')}
                  panelId="portal-door-client"
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
                        color="brand.mutedText"
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
                        color="brand.accentText"
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
                  
                    <Text fontSize="xs" color="brand.mutedText" textAlign="center" pt={1}>
                      Full access: contract, payments, photos
                    </Text>
                  </VStack>
                  </Box>
                </PortalDoor>

                <PortalDoor
                  kicker="You were given a password"
                  name="Gallery pass"
                  blurb="One gallery, no account needed. Type the password you were given."
                  open={tab === 'gallery'}
                  onOpen={() => switchTab('gallery')}
                  panelId="portal-door-gallery"
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
                  
                    <Text fontSize="xs" color="brand.mutedText" textAlign="center" pt={1}>
                      View photos only, for guests and family
                    </Text>
                  </VStack>
                  </Box>
                </PortalDoor>
              </VStack>

              {/* The way out, for someone who is not a client at all.

                  The soft spot is the BOX'S OWN BACKGROUND, not a fixed
                  rectangle behind it, so it is exactly as wide as the
                  sentence and no wider. It was a 720px slab under a 440px
                  line, which extended a long way past both ends and looked
                  like a smudge.

                  inline-flex plus a centred parent is what makes it hug: the
                  box shrinks to its content, and the gradient is measured
                  against that box. The plateau runs to 78% so the words sit
                  on the flat part and only the padding does the fading. */}
              <Box pt={2} textAlign="center">
                <Box
                  display="inline-flex"
                  alignItems="baseline"
                  flexWrap="wrap"
                  justifyContent="center"
                  gap={2}
                  px={4}
                  py={1.5}
                  // A SOLID CORE WITH A SOFT GLOW, not a gradient.
                  //
                  // A radial gradient measures distance from its centre on
                  // both axes at once, so a spot sized to hug one line of
                  // text puts the ENDS of that line near a corner, where the
                  // normalised distance is already past the plateau however
                  // wide the plateau is. The arrow and the last word kept
                  // landing at 3:1 while the middle read fine.
                  //
                  // A flat background with a blurred, spread box-shadow in
                  // the same colour gives a core that is even across every
                  // glyph and a falloff that happens entirely OUTSIDE the
                  // box. It also hugs, which is the point: the core is
                  // exactly the sentence plus its padding.
                  bg="rgba(253, 249, 240, 0.95)"
                  boxShadow="0 0 20px 16px rgba(253, 249, 240, 0.95)"
                >
                  <Text fontSize="xs" color="gray.700" fontWeight="300">
                    Not a client? No problem,
                  </Text>
                  {/* Sentence case and underlined, not uppercase with 0.2em
                      tracking. That treatment rendered about 480px wide,
                      which is WIDER than the 460px column this sits in, so
                      the ends of it hung outside the soft spot entirely and
                      measured 2.5:1 against the photographs while the middle
                      read fine. Underline carries "this is a link" without
                      needing the width. */}
                  <Text
                    as={RouterLink}
                    to="/gallery"
                    fontSize="xs"
                    fontWeight="500"
                    color="brand.accentText"
                    textDecoration="underline"
                    textUnderlineOffset="3px"
                    _hover={{ color: 'brand.accent' }}
                    transition="color 0.3s"
                  >
                    Browse the public portfolio →
                  </Text>
                </Box>
              </Box>
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

/**
 * The soft spot behind the header.
 *
 * Edgeless on purpose. A bordered panel and a lightened top band were both
 * tried and both read as an object sitting on the page; this is a wide
 * plateau that fades to nothing long before it reaches anything, so it
 * settles the background under the words without announcing itself.
 *
 * aria-hidden and pointer-events none: it is paper, not content.
 */
const PortalHalo = ({ w, h }: { w: string; h: string }) => (
  <Box
    aria-hidden="true"
    position="absolute"
    left="50%"
    top="50%"
    transform="translate(-50%, -50%)"
    width={w}
    height={h}
    pointerEvents="none"
    sx={{
      background:
        'radial-gradient(ellipse 50% 50% at 50% 50%, rgba(253,249,240,0.93) 0%, rgba(253,249,240,0.902) 42%, rgba(253,249,240,0.512) 64%, rgba(253,249,240,0) 88%)',
    }}
  />
);

/**
 * One of the two ways in.
 *
 * The header is a real <button>, so it is reachable by keyboard and
 * announces its state; a div with an onClick is skipped by Tab, and this is
 * the control the whole screen turns on.
 *
 * The panel animates on `grid-template-rows: 0fr -> 1fr` rather than
 * max-height. A max-height accordion has to guess a number larger than its
 * content, and every pixel of that guess is dead time at the end of the close
 * where nothing appears to happen. 0fr to 1fr is the content's own height, so
 * the curve lands exactly when the panel does.
 *
 * The body stays MOUNTED when closed, clipped to nothing. Unmounting it would
 * throw away whatever the person had typed if they tapped the other door to
 * read it, and would lose the transition. It is hidden from assistive tech
 * and from tab order instead.
 */
function PortalDoor({
  kicker,
  name,
  blurb,
  open,
  onOpen,
  panelId,
  children,
}: {
  kicker: string;
  name: string;
  blurb: string;
  open: boolean;
  onOpen: () => void;
  panelId: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      w="100%"
      // POSITIONED ON PURPOSE. The header above is a positioned element and
      // so is its halo, and positioned elements paint above non-positioned
      // ones whatever the document order says. Without this the halo washed
      // the top of this panel: kicker, name and blurb all came out faded
      // while the fields below them stayed crisp. Being positioned puts this
      // panel in the same layer, where coming later in the document is what
      // decides.
      position="relative"
      border="1px solid"
      borderColor={open ? 'brand.accent' : 'brand.accentBorder'}
      // Solid, not 0.97. Three percent of mosaic showing through was enough
      // to put the gold field labels at 4.46:1, four hundredths under AA,
      // because brand.accentText only reaches 4.58:1 on cream to begin with.
      // The doors are paper; the page behind them is where the photographs
      // belong.
      bg="brand.surface"
      boxShadow={open ? '0 26px 60px -40px rgba(44,41,37,0.5)' : 'none'}
      transition="border-color 0.45s ease, box-shadow 0.45s ease"
      sx={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
    >
      <Box
        as="button"
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        aria-controls={panelId}
        w="100%"
        display="flex"
        alignItems="flex-start"
        gap={4}
        textAlign="left"
        bg="transparent"
        border="none"
        cursor="pointer"
        px={{ base: 5, md: 6 }}
        py={{ base: 4, md: 5 }}
        sx={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Box flexGrow={1} minW={0}>
          <Text
            fontSize="2xs"
            letterSpacing="0.2em"
            textTransform="uppercase"
            color="brand.accentText"
            mb={1.5}
          >
            {kicker}
          </Text>
          <Text textStyle="cardTitle" fontFamily="heading" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="400" m={0}>
            {name}
          </Text>
          <Text fontSize="sm" color="brand.mutedText" mt={1.5} lineHeight="1.55">
            {blurb}
          </Text>
        </Box>
        <Icon
          as={FaChevronRight}
          boxSize={3.5}
          mt={1}
          flexShrink={0}
          color="brand.accentText"
          transform={open ? 'rotate(90deg)' : 'none'}
          transition="transform 0.45s cubic-bezier(.4,0,.2,1)"
          sx={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
        />
      </Box>

      <Box
        id={panelId}
        display="grid"
        gridTemplateRows={open ? '1fr' : '0fr'}
        transition="grid-template-rows 0.5s cubic-bezier(.4,0,.2,1)"
        sx={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
      >
        <Box overflow="hidden" minH={0} aria-hidden={!open} {...(!open && { inert: '' })}>
          <Box
            px={{ base: 5, md: 6 }}
            pb={{ base: 5, md: 6 }}
            opacity={open ? 1 : 0}
            transform={open ? 'none' : 'translateY(-6px)'}
            transition="opacity 0.3s ease 0.05s, transform 0.4s ease 0.05s"
            sx={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
          >
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const FieldLabel = ({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) => (
  <Text
    as="label"
    htmlFor={htmlFor}
    display="block"
    w="100%"
    fontSize="2xs"
    fontWeight="500"
    color="brand.accentText"
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
    bg="white"
    border="1px solid"
    // brand.field, not accentBorder. accentBorder is 1.41:1 on cream and
    // decorative, which is below the 3:1 WCAG 1.4.11 asks of a control's
    // boundary: a field outlined in it is not reliably visible AS a field.
    borderColor="brand.field"
    color="gray.800"
    fontSize="sm"
    fontWeight="300"
    borderRadius="sm"
    _placeholder={{ color: 'gray.500', fontWeight: '300' }}
    _hover={{ borderColor: 'brand.accentText' }}
    _focus={{
      borderColor: 'brand.accent',
      boxShadow: '0 0 0 1px #c9a96e',
      bg: 'white',
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
        bg="white"
        border="1px solid"
        borderColor="brand.field"
        color="gray.800"
        fontSize="sm"
        fontWeight="300"
        borderRadius="sm"
        pr="3.2rem"
        _placeholder={{ color: 'gray.500', fontWeight: '300' }}
        _hover={{ borderColor: 'brand.accentText' }}
        _focus={{
          borderColor: 'brand.accent',
          boxShadow: '0 0 0 1px #c9a96e',
          bg: 'white',
        }}
      />
      <InputRightElement h="48px" pr={2}>
        <Box
          as="button"
          type="button"
          onClick={onToggleShow}
          aria-label={show ? 'Hide password' : 'Show password'}
          color="brand.accentText"
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
      <LazyMotion features={domAnimation} strict>
        <Portal {...props} />
      </LazyMotion>
    </ToastHost>
  );
}
