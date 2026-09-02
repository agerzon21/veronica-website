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

// --- Fluid desktop nav sizing -------------------------------------------
// The full nav is 541px of links + a 137px Contact button. Together with the
// wordmark and the 32px page gutters that needs ~1011px to sit still, so the
// desktop layout only switches on at `lg` (992px) and has to run at its
// tightest there. Rather than step between two fixed sizes, the wordmark and
// the link gaps interpolate from their floor at 992px to their full size at
// 1200px (where `contentWide` caps the container and extra width stops
// mattering). Measured with the real Jost metrics, not estimated.
//
// Floor at 992px:  34px logo (223px wide) + 16px gaps  -> 52px breathing
// Ceiling at 1200px: 40px logo (263px wide) + 24px gaps
// Below `lg` the burger takes over and the wordmark returns to a full 40px,
// so this floor never reaches phones.
const LOGO_HEIGHT = 'clamp(2.125rem, 5.385px + 2.885vw, 2.5rem)';
const NAV_GAP = 'clamp(1rem, -22.154px + 3.846vw, 1.5rem)';

// Mobile has its own squeeze, and it is much tighter: 16px gutters + the
// 48px burger leave `vw - 80` for the wordmark. A 40px logo is 263px wide,
// which fits every common phone (375px and up) with room to spare but runs
// 23px past a 320px screen and pushes the burger clean off the edge. So the
// wordmark eases from 34px at 320px to its full 40px by 375px and stays
// there. Every mainstream handset keeps the full-size logo.
const LOGO_HEIGHT_MOBILE = 'clamp(2.125rem, -0.909px + 10.909vw, 2.5rem)';

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
          // flexShrink belongs on the flex ITEM (this Link), not the <Image>
          // inside it. But on its own it was actively harmful: while the box
          // still carried 197px of phantom width it froze the logo at 460px
          // and shoved the burger off-screen on every phone. It is only safe
          // paired with the `width: auto` below, which makes the box the ink.
          flexShrink={0}
        >
          <Image
            src="/assets/images/logo.svg"
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
