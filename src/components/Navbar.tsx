import { Box, HStack, Link, Image } from '@chakra-ui/react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import BurgerMenu from './BurgerMenu';
import MobileNav from './MobileNav';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const menuItems = [
    { name: 'Home', path: '/' },
    { name: 'Gallery', path: '/gallery' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
  ];

  const handleToggle = () => setIsOpen(!isOpen);
  const handleClose = () => setIsOpen(false);

  // Logo click: from any other route, RouterLink takes you home. But when
  // already on `/`, RouterLink is a no-op — feels broken. Force a reload so
  // the click always does something visible (resets scroll + replays the
  // hero cinematic from the top), matching the "click logo to go home"
  // expectation visitors have on every site.
  const handleLogoClick = (e: React.MouseEvent) => {
    handleClose();
    if (location.pathname === '/') {
      e.preventDefault();
      window.location.reload();
    }
  };

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
          _hover={{ textDecoration: 'none' }}
          zIndex={2000}
          onClick={handleLogoClick}
        >
          <Image 
            src="/assets/images/logo.svg" 
            alt="Vero Photography" 
            height="40px"
            objectFit="contain"
          />
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
              textDecoration="none"
              textUnderlineOffset="6px"
              transition="color 0.3s"
              _hover={{
                color: '#c9a96e',
                textDecoration: 'underline',
                textDecorationColor: '#c9a96e',
                textDecorationThickness: '1px',
              }}
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