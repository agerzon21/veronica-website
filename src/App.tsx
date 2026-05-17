import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { useEffect, useRef } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import Lenis from 'lenis';
import Home from './pages/Home';
import About from './pages/About';
import Contact from './pages/Contact';
import Gallery from './pages/Gallery';
import IndividualPhoto from './pages/IndividualPhoto';
import Pay from './pages/Pay';
import NotFound from './pages/NotFound';
import ThankYou from './pages/ThankYou';
import Navbar from './components/Navbar';
import PullToRefresh from './components/PullToRefresh';
import SEO from './components/SEO';
import { initGA, trackPageView } from './utils/analytics';

// Initialize Google Analytics
// TODO: Replace 'G-XXXXXXXXXX' with your actual GA4 Measurement ID
// You can find this in your Google Analytics account under:
// Admin > Data Streams > Web > Measurement ID
initGA('G-T769KRMR0E');

/**
 * Lenis is alive for the entire home page (where the cinematic lives) and
 * not mounted at all on other routes. Within the home page we DON'T destroy
 * at the hero/non-hero boundary — destroying mid-scroll kills Lenis's
 * built-up velocity, and native scroll picks up with zero momentum, which
 * felt like a "scroll barrier" right past the cinematic.
 *
 * Instead, we keep Lenis running and dynamically push its smoothing
 * parameters to 1.0 ("instant") once the user is past the hero. With
 * lerp = 1, current scroll matches target every frame — no smoothing, no
 * lag, finger maps 1:1 to scroll. Inside the hero we use the tight values
 * (0.18 wheel, 0.08 touch) that make the cinematic feel buttery.
 */
function useScopedLenis() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname !== '/') return;

    const SMOOTH_WHEEL_LERP = 0.18;
    const SMOOTH_TOUCH_LERP = 0.08;

    const lenis = new Lenis({
      lerp: SMOOTH_WHEEL_LERP,
      smoothWheel: true,
      wheelMultiplier: 0.8,
      // syncTouch lets Lenis smooth touch scrolls too (it ignores them by
      // default). Past the hero we set syncTouchLerp = 1 to neutralize it
      // back to native-feeling touch without removing Lenis entirely.
      syncTouch: true,
      syncTouchLerp: SMOOTH_TOUCH_LERP,
      touchInertiaExponent: 1.6,
    });

    let rafId: number | null = null;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    // Past hero, push smoothing to 1.0 so Lenis acts as a passthrough.
    // No destroy = no momentum cliff at the boundary; Lenis just stops
    // applying meaningful lerp and the user gets near-native scroll feel.
    const updateSmoothing = () => {
      const heroPx = window.innerHeight * 2.0;
      const pastHero = window.scrollY > heroPx;
      // Lenis reads these per-frame, so mutation takes effect immediately.
      // Cast through any because the option types are marked as readonly
      // on the public interface even though the runtime accepts updates.
      (lenis.options as any).lerp = pastHero ? 1.0 : SMOOTH_WHEEL_LERP;
      (lenis.options as any).syncTouchLerp = pastHero ? 1.0 : SMOOTH_TOUCH_LERP;
    };

    updateSmoothing();
    window.addEventListener('scroll', updateSmoothing, { passive: true });
    window.addEventListener('resize', updateSmoothing);

    return () => {
      window.removeEventListener('scroll', updateSmoothing);
      window.removeEventListener('resize', updateSmoothing);
      if (rafId != null) cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, [pathname]);
}

function LenisHost() {
  useScopedLenis();
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    trackPageView(pathname);
  }, [pathname]);

  return null;
}


function TitleUpdater() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    let title = 'Vero Photography';

    switch (path) {
      case '/about':
        title = 'About - Vero Photography';
        break;
      case '/contact':
        title = 'Contact - Vero Photography';
        break;
      case '/gallery':
        title = 'Gallery - Vero Photography';
        break;
      default:
        title = 'Vero Photography';
    }

    document.title = title;
  }, [location]);

  return null;
}

function AppShell() {
  // Pull-to-refresh translates this container down with the gesture while
  // the Navbar (outside the ref) stays anchored — so a real gap opens
  // between the header and the page content, GTA6-style.
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <LenisHost />
      <PullToRefresh contentRef={contentRef} />
      <SEO />
      <ScrollToTop />
      <TitleUpdater />
      <Navbar />
      <div ref={contentRef}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/contact/thank-you" element={<ThankYou />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/gallery/:category" element={<Gallery />} />
          <Route path="/photo/:category/:photoId" element={<IndividualPhoto />} />
          <Route path="/pay" element={<Pay />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </>
  );
}

function App() {
  return (
    <HelmetProvider>
      <ChakraProvider>
        <Router>
          <AppShell />
        </Router>
      </ChakraProvider>
    </HelmetProvider>
  );
}

export default App; 