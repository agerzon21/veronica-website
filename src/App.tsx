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
 * Drives Lenis imperatively, creating + destroying the instance based on
 * route AND scroll position. Even with `prevent`, just having Lenis mounted
 * patches global CSS (overflow, scroll-behavior, scroll-padding) on <html>
 * that affects the feel of native scroll for everything underneath — so for
 * heavy content like the Instagram iframe, having Lenis in the tree is bad
 * even when it's not actively smoothing.
 *
 * Lifecycle:
 *   - Off route ≠ '/': no Lenis at all (native scroll everywhere).
 *   - On '/', scrollY < hero region: Lenis active (cinematic gets lerped
 *     smoothing).
 *   - On '/', scrollY >= hero region: Lenis fully destroyed, native scroll
 *     resumes (Instagram/Reviews are unaffected).
 *
 * The boundary scroll listener uses a small hysteresis so we don't thrash
 * create/destroy if the user hovers right at the threshold.
 */
function useScopedLenis() {
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname !== '/') return;

    let lenis: Lenis | null = null;
    let rafId: number | null = null;

    const startLenis = () => {
      if (lenis) return;
      lenis = new Lenis({
        lerp: 0.18,
        smoothWheel: true,
        wheelMultiplier: 0.8,
      });
      const raf = (time: number) => {
        lenis?.raf(time);
        rafId = requestAnimationFrame(raf);
      };
      rafId = requestAnimationFrame(raf);
    };

    const stopLenis = () => {
      if (rafId != null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (lenis) {
        lenis.destroy();
        lenis = null;
      }
    };

    const HERO_PX = () => window.innerHeight * 2.0;
    const HYSTERESIS = 40;

    const evaluate = () => {
      const heroPx = HERO_PX();
      const y = window.scrollY;
      if (!lenis && y < heroPx - HYSTERESIS) {
        startLenis();
      } else if (lenis && y > heroPx + HYSTERESIS) {
        stopLenis();
      }
    };

    evaluate();
    window.addEventListener('scroll', evaluate, { passive: true });
    window.addEventListener('resize', evaluate);

    return () => {
      window.removeEventListener('scroll', evaluate);
      window.removeEventListener('resize', evaluate);
      stopLenis();
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