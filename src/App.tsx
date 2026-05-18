import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { useEffect } from 'react';
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
import SEO from './components/SEO';
import { initGA, trackPageView } from './utils/analytics';

// Initialize Google Analytics
// TODO: Replace 'G-XXXXXXXXXX' with your actual GA4 Measurement ID
// You can find this in your Google Analytics account under:
// Admin > Data Streams > Web > Measurement ID
initGA('G-T769KRMR0E');

/**
 * Lenis runs globally for desktop WHEEL smoothing only (syncTouch is left at
 * its default `false`). This is the architecturally-correct way to use Lenis
 * on a site with heavy content underneath the cinematic:
 *
 *   - iOS native touch scroll uses the COMPOSITOR thread — zero main-thread
 *     latency between finger and screen. Lenis with syncTouch:true intercepts
 *     touch into the main thread and routes it through a rAF lerp, which adds
 *     >= 1 frame of lag per touch event. That lag is what reads as "stops me
 *     from scrolling" / "have to scroll more to get through less" on heavy
 *     pages — the Instagram embed runs its own scroll handlers, the main
 *     thread gets busy, Lenis's rAF can't keep up, frames drop.
 *
 *   - Native iOS scroll doesn't have this problem because the compositor
 *     handles it independently of main-thread work.
 *
 * So: native touch everywhere (instant feel on iOS), Lenis-smoothed wheel on
 * desktop (where there's no equivalent compositor optimization). The hero
 * cinematic gets its smoothing from a useSpring wrapper on scrollYProgress
 * inside HeroSection — same mathematical lerp, but applied to the *animation
 * value* instead of the scroll position. Free smoothing for the animation,
 * native scroll feel for the page.
 */
function useGlobalLenis() {
  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.12,
      smoothWheel: true,
      wheelMultiplier: 1,
      // syncTouch left at default (false) — mobile uses native scroll.
    });

    let rafId: number | null = null;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);
}

function LenisHost() {
  useGlobalLenis();
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

function App() {
  return (
    <HelmetProvider>
      <ChakraProvider>
        <Router>
          <LenisHost />
          <SEO />
          <ScrollToTop />
          <TitleUpdater />
          <Navbar />
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
        </Router>
      </ChakraProvider>
    </HelmetProvider>
  );
}

export default App; 