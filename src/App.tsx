import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { useEffect } from 'react';
import Home from './pages/Home';
import About from './pages/About';
import Contact from './pages/Contact';
import Gallery from './pages/Gallery';
import Navbar from './components/Navbar';

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
    <ChakraProvider>
      <Router>
        <TitleUpdater />
        <Navbar />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/gallery" element={<Gallery />} />
        </Routes>
      </Router>
    </ChakraProvider>
  );
}

export default App; 