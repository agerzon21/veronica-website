import { Box, HStack, Link, Image } from '@chakra-ui/react';
import type { LinkProps } from '@chakra-ui/react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useState } from 'react';
import BurgerMenu from './BurgerMenu';
import MobileNav from './MobileNav';
import CTAButton from './ui/CTAButton';
import { SITE_LOGO_H, SITE_LOGO_H_MOBILE } from './siteHeader';

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

// --- Fluid desktop nav sizing -------------------------------------------
// The wordmark's two clamps now live in siteHeader.ts, unchanged, because the
// client portal's header wears the same logo at the same size and the two
// headers have to be the same height. The reasoning behind the numbers moved
// with them; the link gap below is the public nav's alone and stays here.
//
// Floor at 992px:  34px logo (223px wide) + 16px gaps  -> 52px breathing
// Ceiling at 1200px: 40px logo (263px wide) + 24px gaps
const LOGO_HEIGHT = SITE_LOGO_H;
const NAV_GAP = 'clamp(1rem, -22.154px + 3.846vw, 1.5rem)';

const LOGO_HEIGHT_MOBILE = SITE_LOGO_H_MOBILE;

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  // No Home entry: the logo is the home link on every page, which is the
  // convention everyone already knows, and the row earned more useful
  // destinations than it has room for.
  const menuItems = [
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
          // flexShrink belongs on the flex ITEM (this Link), not the <Image>
          // inside it. But on its own it was actively harmful: while the box
          // still carried 197px of phantom width it froze the logo at 460px
          // and shoved the burger off-screen on every phone. It is only safe
          // paired with the `width: auto` below, which makes the box the ink.
          flexShrink={0}
        >
          <Image
            // The wordmark's "Vero" is pure black, which disappears against the
            // gray.900 mobile menu behind it. logo-light.svg is the same file
            // with only the two dark inks lifted — the grey disc and the white
            // monogram are untouched, so it is the same mark, not a restyle.
            src={isOpen ? '/assets/images/logo-light.svg' : '/assets/images/logo.svg'}
            // The width/height ATTRIBUTES stay: they hand the browser the
            // aspect ratio before the SVG lands, which is what stops the nav
            // reflowing. But `width` is ALSO a presentational hint, so with no
            // CSS width the box computed to 460px around a 263px wordmark and
            // `contain` centred it inside ~98px of dead space per side. That
            // phantom 197px — not the breakpoint — is what pushed Client
            // Portal off the right edge. `width: auto` derives the box from
            // height x ratio, so the box is now exactly the ink.
            htmlWidth={460}
            htmlHeight={70}
            width="auto"
            // Lighthouse names this as the mobile LCP element; it is preloaded
            // in index.html and this keeps the priority consistent once React
            // renders, so the two do not fight over it.
            fetchPriority="high"
            decoding="async"
            alt="Vero Photography"
            height={{ base: LOGO_HEIGHT_MOBILE, lg: LOGO_HEIGHT }}
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
        {/* lg, not md. Measured, not guessed: 541px of links + a 137px Contact
            button + the wordmark + 64px of gutters needs ~1011px at full size,
            so this set genuinely cannot sit beside the logo at 768px. 992px is
            the narrowest width where it all fits with real breathing room
            (52px), which is why the switch lives here and the sizes above
            interpolate rather than step. BurgerMenu and MobileNav are both
            `lg` too — moving only this one would leave 768-991px with no
            navigation at all. */}
        <HStack spacing={NAV_GAP} display={{ base: 'none', lg: 'flex' }}>
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
