import { Box, HStack, Link } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { useState } from 'react';
import BurgerMenu from './BurgerMenu';
import MobileNav from './MobileNav';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { name: 'Home', path: '/' },
    { name: 'Gallery', path: '/gallery' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
  ];

  const handleToggle = () => setIsOpen(!isOpen);
  const handleClose = () => setIsOpen(false);

  return (
    <Box 
      as="nav" 
      position="fixed" 
      top="0" 
      left="0" 
      right="0" 
      bg="white" 
      zIndex={1500}
      px={{ base: 4, md: 8 }}
      py={4}
      boxShadow="sm"
    >
      <HStack justify="space-between" align="center" maxW="container.xl" mx="auto">
        <Link
          as={RouterLink}
          to="/"
          fontSize={{ base: "xl", md: "2xl" }}
          fontWeight="light"
          color={isOpen ? "white" : "gray.800"}
          _hover={{ textDecoration: 'none' }}
          zIndex={2000}
          onClick={handleClose}
        >
          Veronica Photography
        </Link>

        {/* Desktop Navigation */}
        <HStack spacing={8} display={{ base: 'none', md: 'flex' }}>
          {menuItems.map((item) => (
            <Link
              key={item.path}
              as={RouterLink}
              to={item.path}
              fontSize="md"
              fontWeight="light"
              color="gray.800"
              _hover={{ color: 'gray.600' }}
            >
              {item.name}
            </Link>
          ))}
        </HStack>

        {/* Burger Menu Button */}
        <BurgerMenu isOpen={isOpen} onClick={handleToggle} />

        {/* Mobile Navigation */}
        <MobileNav isOpen={isOpen} onClose={handleClose} />
      </HStack>
    </Box>
  );
};

export default Navbar; 