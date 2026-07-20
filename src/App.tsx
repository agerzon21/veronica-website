import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { useEffect } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import Home from './pages/Home';
import About from './pages/About';
import Contact from './pages/Contact';
import Gallery from './pages/Gallery';
import IndividualPhoto from './pages/IndividualPhoto';
import Pay from './pages/Pay';
import NotFound from './pages/NotFound';
import ThankYou from './pages/ThankYou';
import Portal from './pages/Portal';
import Welcome from './pages/Welcome';
import Admin from './pages/Admin';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import SEO from './components/SEO';
import ExitIntentPopup from './components/ExitIntentPopup';
import { initGA, initGoogleAds, trackPageView } from './utils/analytics';

// Initialize Google Analytics (GA4)
initGA('G-T769KRMR0E');
// Register the Google Ads account against the same gtag instance so
// conversion events attributed to this account (e.g. the lead-form
// conversion fired from /contact/thank-you) can report correctly.
initGoogleAds('AW-18082198928');

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    trackPageView(pathname);
  }, [pathname]);

  return null;
}

function App() {
  return (
    <HelmetProvider>
      <ChakraProvider>
        <Router>
          <SEO />
          <ScrollToTop />
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
            <Route path="/portal" element={<Portal />} />
            <Route path="/portal/pass" element={<Portal />} />
            <Route path="/portal/welcome" element={<Welcome />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Footer />
          <ExitIntentPopup />
        </Router>
      </ChakraProvider>
    </HelmetProvider>
  );
}

export default App; 