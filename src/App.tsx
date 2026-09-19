import { BrowserRouter as Router, Routes, Route, useLocation, useNavigationType } from 'react-router-dom';
import { Box, Spinner } from '@chakra-ui/react';
// ChakraProvider without the toast machinery, composed from Chakra's public
// exports. ChakraProvider always mounts ToastProvider, whose component imports
// framer-motion's full feature set at module scope. The three routes that use
// toasts mount <ToastHost> themselves; see those files.
import AppChakraProvider from './components/ui/AppChakraProvider';
// `m` + LazyMotion instead of `motion`. The full `motion` component statically
// pulls framer-motion's entire feature set, including drag and layout
// projection, which nothing on the public site uses. domAnimation covers
// animation, variants, exit animations and AnimatePresence, which is
// everything the public pages do. Portal loads the full set itself; see there.
import { LazyMotion, domAnimation } from 'framer-motion';
import { lazy, Suspense, useEffect, useRef } from 'react';
import { HelmetProvider } from 'react-helmet-async';
// Home and IndividualPhoto stay EAGER on purpose.
//   Home — the LCP route. Lazying it would add a round trip to the one page
//   the performance audit measures.
//   IndividualPhoto — the prerendered SEO route. The build emits no
//   modulepreload links, so a lazy chunk here costs every indexed /photo/*
//   page an extra RTT for ~14KB. Not worth it.
import Home from './pages/Home';
import IndividualPhoto from './pages/IndividualPhoto';

// Everything below is code-split. Admin alone is ~359KB of the old single
// bundle, Journal ~139KB, Portal ~91KB — none of which a homepage visitor
// should ever download.
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Gallery = lazy(() => import('./pages/Gallery'));
const Weddings = lazy(() => import('./pages/Weddings'));
const Pay = lazy(() => import('./pages/Pay'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ThankYou = lazy(() => import('./pages/ThankYou'));
const Portal = lazy(() => import('./pages/Portal'));
const Welcome = lazy(() => import('./pages/Welcome'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Admin = lazy(() => import('./pages/Admin'));
const Journal = lazy(() => import('./pages/Journal'));
const Privacy = lazy(() => import('./pages/Privacy'));
const Terms = lazy(() => import('./pages/Terms'));

import Navbar from './components/Navbar';
import Footer from './components/Footer';
import SEO from './components/SEO';
// ExitIntentPopup stays eager deliberately: it mounts unconditionally on every
// non-admin route, so a lazy chunk would be requested immediately anyway — and
// splitting it drags icon-button/input/button into their own chunks, costing 6
// extra requests for a ~5KB component.
import ExitIntentPopup from './components/ExitIntentPopup';
import ChunkErrorBoundary, { prefetchChunk } from './components/ChunkErrorBoundary';
import theme from './theme';
import { scheduleAnalytics, trackPageView } from './utils/analytics';

/**
 * Scroll positions per history entry. A plain Map, not state: writing it must
 * never cause a render, and it should die with the tab — these are positions
 * within THIS session's history, not something to persist.
 */
const scrollPositions = new Map<string, number>();

/**
 * Routes that always open at the top.
 *
 * The homepage used to be in here, on the theory that landing inside its 360vh
 * cinematic would look broken. That was wrong: the hero is driven by scroll
 * POSITION, not by elapsed time, so any offset inside it renders exactly the
 * frame you would see having scrolled there by hand. The spring smoothing
 * catches up over a few frames and then it is simply the hero, mid-zoom.
 */
const NO_RESTORE = new Set<string>();

/**
 * How long to keep asking for the saved position while the page fills in.
 * Generous on purpose: a cold lazy chunk plus its data can easily take a
 * second, and being early is the whole failure mode here.
 */
const RESTORE_BUDGET_MS = 1800;

/**
 * Opt-in tracing. `localStorage.setItem('vero_scroll_debug', '1')` then reload,
 * and every save, restore and give-up prints. Off by default so it costs a
 * single property read per navigation in production.
 */
const debugScroll = (...args: unknown[]) => {
  try {
    if (localStorage.getItem('vero_scroll_debug') === '1') {
      console.info('[scroll]', ...args);
    }
  } catch {
    /* private mode — never let tracing break navigation */
  }
};

/**
 * Puts the visitor back where they were when they press Back, instead of at
 * the top of the page they are returning to.
 *
 * We cannot just hand this to the browser. main.tsx sets
 * `history.scrollRestoration = 'manual'` deliberately: the gallery modal opens
 * with a raw `history.pushState` and closes with `history.back()`, and the
 * browser's own restoration was overriding ImageModal's scroll-to-centre work
 * on that pop. So restoration is done here, by history entry.
 *
 * THE KEY GUARD IS NOT OPTIONAL. That same modal close fires a pop which
 * React Router reports as a POP on the SAME entry — same key, same pathname,
 * only `navigationType` flips. Without the guard this effect would re-run and
 * scroll the gallery to the top, which is the exact bug main.tsx is protecting
 * against. Acting only when the entry itself changes leaves the modal alone.
 */
/** Keys that mean "I want to scroll", as opposed to tabbing or typing. */
const SCROLL_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ',
]);

/**
 * How long to let the restore run before user input is allowed to cancel it.
 *
 * This guard used to cancel on ANY wheel or touchstart, which quietly broke
 * the two gestures people actually use to go back. A macOS two-finger
 * swipe-back IS a stream of horizontal wheel events, and an iOS edge-swipe
 * begins with a touchstart — so the very gesture that triggered the back
 * navigation immediately cancelled the restore it triggered. Buttons worked,
 * swipes did not, which is exactly the split Alex reported.
 *
 * Now: nothing can cancel for the first quarter second, and only VERTICAL
 * intent counts afterwards.
 */
const CANCEL_GRACE_MS = 250;

/**
 * How long to keep holding the position after first reaching it. Covers late
 * layout shifts from content above the viewport that would otherwise drag the
 * page somewhere else a beat after it looked correct.
 */
const HOLD_MS = 700;

/**
 * True while restoreTo is driving the window. The scroll sampler checks this
 * so a restore cannot overwrite the very position it is trying to reach.
 */
let restoring = false;

const restoreTo = (top: number) => {
  restoring = true;
  let frames = 0;
  let cancelled = false;
  let armed = false;
  let touchY: number | null = null;

  const stop = () => {
    cancelled = true;
  };

  const onWheel = (e: WheelEvent) => {
    // Horizontal-only deltas are the swipe-back gesture, not a scroll.
    if (armed && Math.abs(e.deltaY) > 0) stop();
  };
  const onTouchStart = (e: TouchEvent) => {
    touchY = e.touches[0]?.clientY ?? null;
  };
  const onTouchMove = (e: TouchEvent) => {
    if (!armed || touchY === null) return;
    const y = e.touches[0]?.clientY;
    if (y != null && Math.abs(y - touchY) > 12) stop();
  };
  const onKey = (e: KeyboardEvent) => {
    if (armed && SCROLL_KEYS.has(e.key)) stop();
  };

  const passive = { passive: true } as const;
  window.addEventListener('wheel', onWheel, passive);
  window.addEventListener('touchstart', onTouchStart, passive);
  window.addEventListener('touchmove', onTouchMove, passive);
  window.addEventListener('keydown', onKey);
  const armTimer = window.setTimeout(() => {
    armed = true;
  }, CANCEL_GRACE_MS);

  // Landing is not the end of it. Anything still resolving ABOVE the viewport
  // — a lazy photograph without reserved height, a font swap, a grid that
  // reflows — changes the height of the document above us afterwards, and
  // Chrome's scroll anchoring then deliberately moves the page to keep its
  // chosen anchor still. On the weddings page at desktop widths that landed
  // people on the FAQ heading instead of where they left, and only when the
  // FAQ was partly on screen, because that is when the anchor gets chosen
  // inside it. `overflow-anchor: none` stops the browser doing it, and holding
  // the number for a beat afterwards catches the rest.
  const root = document.documentElement;
  const priorAnchor = root.style.overflowAnchor;
  root.style.overflowAnchor = 'none';
  const releaseAnchor = () => {
    root.style.overflowAnchor = priorAnchor;
  };

  const cleanup = () => {
    restoring = false;
    releaseAnchor();
    window.clearTimeout(armTimer);
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('keydown', onKey);
  };

  // Pages here finish loading well after mount — lazy route chunks first, then
  // journal lists, Instagram and gallery dimensions — so the document is
  // usually far too short to hold the saved position on the first frame.
  // Bounded by wall-clock rather than a frame count, and it stops the instant
  // the position sticks, so a page that is ready immediately costs one frame.
  const startedAt = performance.now();
  let landedAt = 0;

  const tick = () => {
    if (cancelled) {
      debugScroll('cancelled by the visitor', top);
      return cleanup();
    }
    if (Math.abs(window.scrollY - top) >= 2) window.scrollTo(0, top);
    frames += 1;

    const now = performance.now();
    const onTarget = Math.abs(window.scrollY - top) < 2;

    if (onTarget) {
      if (!landedAt) {
        landedAt = now;
        debugScroll('landed', top, frames + ' frames');
      }
      // Keep watching for a moment in case something above us settles late.
      if (now - landedAt > HOLD_MS) return cleanup();
    } else if (landedAt) {
      debugScroll('drifted, re-asserting', top, 'was ' + window.scrollY);
      landedAt = 0;
    } else if (now - startedAt > RESTORE_BUDGET_MS) {
      debugScroll('gave up short', top, 'reached ' + window.scrollY);
      return cleanup();
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

function ScrollToTop() {
  const { pathname, key, hash } = useLocation();
  const navigationType = useNavigationType();
  const handledKey = useRef<string | null>(null);

  // RESTORE FIRST, SAVE SECOND. This order is load-bearing.
  //
  // Both effects depend on `key`, so on every navigation React runs them in
  // declaration order. When the sampler below was declared first AND seeded
  // itself with `scrollPositions.set(key, window.scrollY)`, that seed ran
  // before this effect and overwrote the stored position with the live scroll
  // — which, one frame after a route swap, is 0. The restore then read back
  // its own zero. The trace said it plainly: "pop with nothing saved ... 0".
  //
  // The seed is gone and this effect now reads before anything can write.
  useEffect(() => {
    // Same history entry as last time — a modal opening or closing, not a
    // navigation. See the note above.
    if (handledKey.current === key) return;
    handledKey.current = key;

    trackPageView(pathname);

    if (navigationType === 'POP' && !NO_RESTORE.has(pathname)) {
      const saved = scrollPositions.get(key);
      if (saved != null && saved > 0) {
        debugScroll('restore', pathname, key, saved);
        restoreTo(saved);
        return;
      }
      debugScroll('pop with nothing saved', pathname, key, saved);
    }

    // A hash deep link, /wedding-photography#packages for one, has to win over
    // the scroll to the top. The browser's own hash scroll has ALREADY failed
    // by the time this runs: every route below is code-split and the
    // prerendered file is an empty <div id="root">, so at the moment the
    // document loads there is no element with that id to scroll to. Nothing
    // retries it, which is why these links have only ever landed at the top of
    // the page. Poll briefly until the element appears.
    //
    // setTimeout rather than requestAnimationFrame: rAF does not fire in
    // headless Chrome, which would make this impossible to test.
    if (hash) {
      const id = decodeURIComponent(hash.slice(1));
      let tries = 0;
      let settled = 0;
      let last = Number.NaN;
      // Finding the element is NOT enough, and scrolling to it once is not
      // either. Photographs above the target finish loading after the scroll
      // and push it down the document: on the live site
      // /wedding-photography#packages landed 237px past the heading on a phone,
      // while a local build landed it exactly. The local build is missing most
      // of the gallery images, so nothing shifted there, which is a good reason
      // not to trust a local build for anchor positions. So re-assert until the
      // target's position stops moving.
      //
      // The corrections are instant on purpose. Repeated smooth scrolls cancel
      // and restart each other's animation and the page visibly stutters.
      const seek = () => {
        const el = document.getElementById(id);
        if (!el) {
          if (tries++ < 40) window.setTimeout(seek, 50);
          return;
        }
        const top = Math.round(el.getBoundingClientRect().top);
        el.scrollIntoView({ block: 'start', behavior: 'auto' });
        settled = Math.abs(top - last) <= 2 ? settled + 1 : 0;
        last = top;
        if (settled < 3 && tries++ < 40) window.setTimeout(seek, 100);
      };
      seek();
      return;
    }

    window.scrollTo(0, 0);
  }, [key, pathname, hash, navigationType]);

  // Record the position CONTINUOUSLY while this entry is on screen.
  //
  // Saving once, in a cleanup, never worked either: a cleanup runs during the
  // commit of the NEXT render, when React has already swapped the old route's
  // DOM for the new one. The document is a different height by then and the
  // browser has clamped window.scrollY. Sampling on scroll means the last
  // value recorded is the real one from just before the navigation.
  useEffect(() => {
    let queued = false;
    const sample = () => {
      // A restore in flight scrolls the window itself, and those events would
      // otherwise write the half-restored position back over the target while
      // the page is still filling in.
      if (restoring || queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (!restoring) scrollPositions.set(key, window.scrollY);
      });
    };
    window.addEventListener('scroll', sample, { passive: true });
    return () => window.removeEventListener('scroll', sample);
  }, [key]);

  return null;
}

/**
 * gtag used to load from module scope, pulling 356KB of transfer / ~1.07MB of
 * uncompressed third-party JS into the window where the page was still trying
 * to paint. scheduleAnalytics defers it — but bypasses the delay entirely for
 * paid clicks and the whole /contact funnel, so ad attribution is never at
 * risk. See src/utils/analytics.ts.
 */
function AnalyticsBoot() {
  useEffect(() => scheduleAnalytics(), []);
  return null;
}

/**
 * Warm the public routes once the page is idle.
 *
 * Code-splitting made navigation cost a chunk fetch, which on a slow
 * connection shows the Suspense spinner where the site used to move instantly.
 * About + Contact + Gallery are ~9KB gzipped combined, so fetching them during
 * idle time buys back instant navigation for the cost of a rounding error.
 *
 * Deliberately excluded: Admin (89KB), Journal (42KB) and Portal (25KB). Those
 * are the whole reason for splitting — a visitor browsing the gallery should
 * never download the admin panel.
 */
function PrefetchPublicRoutes() {
  useEffect(() => {
    const warm = () => {
      prefetchChunk(() => import('./pages/About'));
      prefetchChunk(() => import('./pages/Contact'));
      prefetchChunk(() => import('./pages/Gallery'));
      // Footer links. Tiny (3.5KB gzip each) and reached from every page, so
      // the idle cost is nil and they stop feeling laggy on a cold click.
      prefetchChunk(() => import('./pages/Privacy'));
      prefetchChunk(() => import('./pages/Terms'));
    };
    // ── Warm route chunks on INTENT, not on a timer ──
    //
    // History: this was requestIdleCallback(warm, {timeout: 4000}) on mount. A
    // slow phone is never idle during startup so the timeout fired, at 4s,
    // inside the LCP window, and eleven route chunks downloaded at high
    // priority while the hero photograph crawled at low priority.
    //
    // The fix then was to wait for `load` first, on the assumption that load
    // fires after the hero image. It does not. React inserts that <img> after
    // hydration, so `load` fires BEFORE it exists: measured at 1772-2003 ms
    // against a hero inserted at ~2061 ms. A PageSpeed run confirmed the chunks
    // still landing at 2810-2888 ms with a 3065 ms critical path, against a
    // 3.2 s LCP. Same collision, just moved.
    //
    // So stop guessing when the page is "done" and key off the visitor instead.
    // Any real interaction means they are engaged and a click is plausible, and
    // by definition the first paint is already behind us. The long fallback
    // covers someone who reads without touching anything. Nothing about this is
    // visible: it only changes when already-lazy chunks are fetched, and a
    // click still works whether or not the chunk was warmed.
    let idleId: number | undefined;
    let done = false;

    const run = () => {
      if (done) return;
      done = true;
      const ric = (window as any).requestIdleCallback as
        | ((cb: () => void, opts?: { timeout: number }) => number)
        | undefined;
      // Safari has no requestIdleCallback — a plain timeout is close enough for
      // work this small.
      idleId = ric ? ric(warm, { timeout: 3000 }) : window.setTimeout(warm, 300);
    };

    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, run, { once: true, passive: true }));
    // Scroll is the common one on a phone and is not in the list above because
    // it fires on the document, not the window, in some browsers.
    document.addEventListener('scroll', run, { once: true, passive: true });
    // Well clear of the LCP window on a slow device.
    const fallbackId = window.setTimeout(run, 8000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, run));
      document.removeEventListener('scroll', run);
      clearTimeout(fallbackId);
      if (idleId !== undefined) (window as any).cancelIdleCallback?.(idleId);
    };
  }, []);
  return null;
}

/**
 * Inner shell — lives inside <Router> so it can use useLocation() to
 * gate site-wide chrome per-route.
 *
 * Navbar + Footer are HIDDEN on /admin because the logged-in admin
 * panel provides its own top strip + bottom nav; the public site
 * chrome would eat vertical space and look confusing next to admin
 * nav. The admin LOGIN screen (also at /admin) still needs the
 * site chrome so an unauthenticated visitor has an obvious way
 * back to the public site — that's handled inside Admin.tsx, which
 * renders <Navbar /> + <Footer /> inline on the login branch only.
 *
 * /portal and /portal/pass follow the SAME pattern, for the same
 * reason and with the same catch. A client standing in their portal
 * does not need Gallery / Journal / About / Contact and a link to
 * the Client Portal they are already inside; PortalHeader gives them
 * the logo, their progress and their balance instead. But those two
 * paths serve the LOGIN FORM as well as the logged-in view, and
 * which one you get depends on auth state, not on the URL, so hiding
 * the chrome here would strip it off a genuinely public page.
 * Portal.tsx renders <Navbar /> + <Footer /> inline on its
 * logged-out branch, exactly as Admin.tsx does.
 *
 * /portal/welcome and /portal/reset are deliberately NOT in this
 * check. They are one-off public landing pages with no portal
 * header of their own, so they keep the site chrome.
 *
 * ExitIntentPopup is also skipped on both: that popup targets
 * prospects, not Vero and not a signed client.
 */
function AppShell() {
  const { pathname } = useLocation();
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isPortal = pathname === '/portal' || pathname.startsWith('/portal/');
  const ownChrome = isAdmin || isPortal;
  return (
    <>
      <SEO />
      <ScrollToTop />
      <AnalyticsBoot />
      {!ownChrome && <PrefetchPublicRoutes />}
      {!ownChrome && <Navbar />}
      {/* The fallback reserves a full viewport height on purpose. <Footer />
          renders after <Routes>, so a null or short fallback would paint the
          footer high and then shove it down when the chunk lands — turning a
          perfect CLS of 0 into a visible layout shift. */}
      {/* The site had NO <main> landmark anywhere — Chakra's Box renders a div,
          so every route was an undifferentiated div soup to screen readers and
          to AI agents. Wrapping <Routes> gives exactly one <main> per page,
          outside <Suspense> so it exists even while a lazy chunk is loading. */}
      {/* PINCH ZOOM IS OFF INSIDE THE PORTAL, AND ONLY INSIDE THE PORTAL.
          A client pinching a gallery on a phone was not trying to magnify a
          grid of square thumbnails; there is nothing in that grid worth a
          closer look, so every pinch there was an accident, and an accidental
          zoom leaves a sticky header and a fixed action bar sitting in places
          they were never laid out for. The one thing a client DOES want to
          magnify is an open photograph, and the lightbox now does that
          itself (ImageModal, touch gestures) rather than leaning on the
          browser.

          `pan-x pan-y` and not `none`: the portal is a long scroll with
          horizontal pill strips in it, and both still have to work. It
          refuses the pinch and nothing else.

          NOT done with user-scalable=no or maximum-scale in the viewport
          meta, which was the obvious move and is wrong three times over. It
          is page wide, so it would take zoom off the marketing site and the
          admin panel too; it takes magnification away from people who need it
          to read anything at all; and iOS Safari has largely ignored it since
          iOS 10, so it would be an accessibility harm that does not even
          work. Scoped here, the rest of the site keeps browser zoom intact.

          The lightbox sets its own `touch-action: none` on top of this. Touch
          behaviours intersect down the ancestor chain, so `none` wins there
          and our own handlers get the gesture. */}
      <Box as="main" id="main" sx={isPortal ? { touchAction: 'pan-x pan-y' } : undefined}>
      <Suspense
        fallback={
          <Box minH="100vh" display="flex" alignItems="center" justifyContent="center">
            <Spinner size="lg" thickness="2px" color="gray.400" />
          </Box>
        }
      >
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/contact/thank-you" element={<ThankYou />} />
        <Route path="/wedding-photography" element={<Weddings />} />
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/gallery/:category" element={<Gallery />} />
        <Route path="/photo/:category/:photoId" element={<IndividualPhoto />} />
        <Route path="/pay" element={<Pay />} />
        <Route path="/portal" element={<Portal />} />
        <Route path="/portal/pass" element={<Portal />} />
        <Route path="/portal/welcome" element={<Welcome />} />
        {/* Reached only from an emailed reset link. Inherits noindex from
            vercel.json's /portal/:path* header block. */}
        <Route path="/portal/reset" element={<ResetPassword />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/journal/:slug" element={<Journal />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      </Box>
      {!ownChrome && <Footer />}
      {!ownChrome && <ExitIntentPopup />}
    </>
  );
}

function App() {
  return (
    <HelmetProvider>
      {/* theme={theme} is load-bearing. The previous src/theme/index.ts was
          never passed here, so it silently did nothing for its entire life and
          was eventually deleted as dead code. If tokens ever stop applying,
          check this prop first. */}
      <AppChakraProvider theme={theme}>
        <LazyMotion features={domAnimation} strict>
        {/* Outside <Router> so a chunk failure during the very first route
            resolution is still caught. */}
        <ChunkErrorBoundary>
          <Router>
            <AppShell />
          </Router>
        </ChunkErrorBoundary>
        </LazyMotion>
      </AppChakraProvider>
    </HelmetProvider>
  );
}

export default App; 