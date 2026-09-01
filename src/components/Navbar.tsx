import { Box, HStack, Link, Image } from '@chakra-ui/react';
import type { LinkProps } from '@chakra-ui/react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import BurgerMenu from './BurgerMenu';
import MobileNav from './MobileNav';
import CTAButton from './ui/CTAButton';

// One nav-link treatment, shared by the main links and the Client Portal
// utility link — and the same `ctaLabel` token MobileNav uses, so the menu
// does not change personality when the viewport narrows.
const navLinkProps: LinkProps = {
  textStyle: 'ctaLabel',
  color: 'gray.700',
  textDecoration: 'none',
  textUnderlineOffset: '6px',
  transition: 'color 0.3s',
  _hover: {
    // Gold TEXT on white must be accentText — the signature accent is 2.24:1
    // and fails AA. The decorative accent stays for rules and borders.
    color: 'brand.accentText',
    textDecoration: 'underline',
    textDecorationColor: 'brand.accentText',
    textDecorationThickness: '1px',
  },
};

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  const menuItems = [
    { name: 'Home', path: '/' },
    { name: 'Gallery', path: '/gallery' },
    { name: 'Weddings', path: '/wedding-photography' },
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
      {/* contentWide is the site's outer container token — the nav now shares
          an edge with the page content instead of running 80px wider. */}
      <HStack justify="space-between" align="center" maxW="contentWide" mx="auto">
        <Link
          as={RouterLink}
          to="/"
          _hover={{ textDecoration: 'none' }}
          zIndex={2000}
          onClick={handleLogoClick}
          // flexShrink belongs HERE, on the flex item. It was previously set
          // on the <Image> inside, where it had no effect at all — the
          // wordmark still collapsed to 45px at 768px, five times worse than
          // before this branch, because the nav group opposite had grown.
          flexShrink={0}
        >
          <Image
            src="/assets/images/logo.svg"
            htmlWidth={460}
            htmlHeight={70}
            // Lighthouse names this as the mobile LCP element; it is preloaded
            // in index.html and this keeps the priority consistent once React
            // renders, so the two do not fight over it.
            fetchPriority="high"
            decoding="async"
            alt="Vero Photography"
            height="40px"
            objectFit="contain"
          />
        </Link>

        {/* Desktop Navigation. Main nav (everything except Client Portal)
            renders first, then a thin gold separator, then Client Portal
            as a utility link — so it reads as "for existing clients"
            rather than another nav peer without losing accessibility.
            Contact is the conversion path and therefore a real CTAButton,
            not a Link wearing a border. Selection is by NAME (not array
            index) so reordering / inserting menu items can't accidentally
            hide the utility link or steal Contact's button treatment. */}
        {/* lg, not md. The nav grew by a link and a real CTA button, and the
            set does not fit beside a 263px wordmark at 768px — that mismatch
            is what was crushing the logo. The burger now holds until 992px,
            and MobileNav carries the same links, so nothing becomes
            unreachable in between. */}
        <HStack spacing={{ lg: 5, xl: 6 }} display={{ base: 'none', lg: 'flex' }}>
          {menuItems
            .filter((item) => item.name !== 'Client Portal')
            .map((item) =>
              item.name === 'Contact' ? (
                <CTAButton key={item.path} to={item.path} variant="outline" size="md">
                  {item.name}
                </CTAButton>
              ) : (
                <Link key={item.path} as={RouterLink} to={item.path} {...navLinkProps}>
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
                  bg="brand.accent"
                  opacity={0.35}
                  aria-hidden="true"
                />
                <Link as={RouterLink} to={portal.path} {...navLinkProps}>
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
