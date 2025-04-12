import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { useEffect } from 'react';
import { HelmetProvider } from 'react-helmet-async';
import Home from './pages/Home';
import About from './pages/About';
import Contact from './pages/Contact';
import Gallery from './pages/Gallery';
import Navbar from './components/Navbar';
import SEO from './components/SEO';
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
          <SEO />
          <ScrollToTop />
          <TitleUpdater />
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/gallery/:category" element={<Gallery />} />
          </Routes>
        </Router>
      </ChakraProvider>
    </HelmetProvider>
  );
}

export default App; 