import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Box, ChakraProvider, Spinner } from '@chakra-ui/react';
import { lazy, Suspense, useEffect } from 'react';
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
const Pay = lazy(() => import('./pages/Pay'));
const NotFound = lazy(() => import('./pages/NotFound'));
const ThankYou = lazy(() => import('./pages/ThankYou'));
const Portal = lazy(() => import('./pages/Portal'));
const Welcome = lazy(() => import('./pages/Welcome'));
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
import { scheduleAnalytics, trackPageView } from './utils/analytics';

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    trackPageView(pathname);
  }, [pathname]);

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
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (ric) {
      const id = ric(warm, { timeout: 4000 });
      return () => (window as any).cancelIdleCallback?.(id);
    }
    // Safari has no requestIdleCallback — a plain timeout is close enough for
    // work this small.
    const t = window.setTimeout(warm, 2500);
    return () => clearTimeout(t);
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
 * ExitIntentPopup is also skipped on /admin — that popup targets
 * prospects, not Vero.
 */
function AppShell() {
  const { pathname } = useLocation();
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  return (
    <>
      <SEO />
      <ScrollToTop />
      <AnalyticsBoot />
      {!isAdmin && <PrefetchPublicRoutes />}
      {!isAdmin && <Navbar />}
      {/* The fallback reserves a full viewport height on purpose. <Footer />
          renders after <Routes>, so a null or short fallback would paint the
          footer high and then shove it down when the chunk lands — turning a
          perfect CLS of 0 into a visible layout shift. */}
      {/* The site had NO <main> landmark anywhere — Chakra's Box renders a div,
          so every route was an undifferentiated div soup to screen readers and
          to AI agents. Wrapping <Routes> gives exactly one <main> per page,
          outside <Suspense> so it exists even while a lazy chunk is loading. */}
      <Box as="main" id="main">
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
        <Route path="/gallery" element={<Gallery />} />
        <Route path="/gallery/:category" element={<Gallery />} />
        <Route path="/photo/:category/:photoId" element={<IndividualPhoto />} />
        <Route path="/pay" element={<Pay />} />
        <Route path="/portal" element={<Portal />} />
        <Route path="/portal/pass" element={<Portal />} />
        <Route path="/portal/welcome" element={<Welcome />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/journal/:slug" element={<Journal />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
      </Box>
      {!isAdmin && <Footer />}
      {!isAdmin && <ExitIntentPopup />}
    </>
  );
}

function App() {
  return (
    <HelmetProvider>
      <ChakraProvider>
        {/* Outside <Router> so a chunk failure during the very first route
            resolution is still caught. */}
        <ChunkErrorBoundary>
          <Router>
            <AppShell />
          </Router>
        </ChunkErrorBoundary>
      </ChakraProvider>
    </HelmetProvider>
  );
}

export default App; 