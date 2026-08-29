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
    { name: 'Journal', path: '/journal' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
    { name: 'Client Portal', path: '/portal' },
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
            htmlWidth={460}
            htmlHeight={70}
            alt="Vero Photography" 
            height="40px"
            objectFit="contain"
          />
        </Link>

        {/* Desktop Navigation. Main nav (everything except Client Portal)
            renders first, then a thin gold separator, then Client Portal
            as a utility link — so it reads as "for existing clients"
            rather than another nav peer without losing accessibility.
            Contact gets a subtle gold pill outline to mark it as the
            conversion path. Selection is by NAME (not array index) so
            reordering / inserting menu items can't accidentally hide the
            utility link or steal Contact's pill treatment. */}
        <HStack spacing={{ base: 5, md: 6 }} display={{ base: 'none', md: 'flex' }}>
          {menuItems
            .filter((item) => item.name !== 'Client Portal')
            .map((item) =>
              item.name === 'Contact' ? (
                <Link
                  key={item.path}
                  as={RouterLink}
                  to={item.path}
                  fontSize="md"
                  fontWeight="light"
                  color="gray.800"
                  textDecoration="none"
                  border="1px solid #c9a96e"
                  borderRadius="sm"
                  px={4}
                  py={1.5}
                  transition="all 0.3s"
                  _hover={{
                    color: 'white',
                    bg: 'brand.accent',
                    textDecoration: 'none',
                  }}
                >
                  {item.name}
                </Link>
              ) : (
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
                    color: 'brand.accent',
                    textDecoration: 'underline',
                    textDecorationColor: 'brand.accent',
                    textDecorationThickness: '1px',
                  }}
                >
                  {item.name}
                </Link>
              ),
            )}
          {(() => {
            const portal = menuItems.find((i) => i.name === 'Client Portal');
            if (!portal) return null;
            return (
              <>
                <Box
                  w="1px"
                  h="16px"
                  bg="rgba(201, 169, 110, 0.35)"
                  aria-hidden="true"
                />
                <Link
                  as={RouterLink}
                  to={portal.path}
                  fontSize="md"
                  fontWeight="light"
                  color="gray.800"
                  textDecoration="none"
                  textUnderlineOffset="6px"
                  transition="color 0.3s"
                  _hover={{
                    color: 'brand.accent',
                    textDecoration: 'underline',
                    textDecorationColor: 'brand.accent',
                    textDecorationThickness: '1px',
                  }}
                >
                  {portal.name}
                </Link>
              </>
            );
          })()}
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