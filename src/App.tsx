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
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import SEO from './components/SEO';
import ExitIntentPopup from './components/ExitIntentPopup';
import { initGA, trackPageView } from './utils/analytics';

// Initialize Google Analytics
// TODO: Replace 'G-XXXXXXXXXX' with your actual GA4 Measurement ID
// You can find this in your Google Analytics account under:
// Admin > Data Streams > Web > Measurement ID
initGA('G-T769KRMR0E');

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