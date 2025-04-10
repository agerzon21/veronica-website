import React from 'react';
import { ChakraProvider, Box } from '@chakra-ui/react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Gallery from './pages/Gallery';

function App() {
  return (
    <ChakraProvider>
      <Router>
        <Box minH="100vh">
          <Routes>
            <Route path="/" element={<Gallery />} />
            <Route path="/gallery" element={<Gallery />} />
          </Routes>
        </Box>
      </Router>
    </ChakraProvider>
  );
}

export default App; 