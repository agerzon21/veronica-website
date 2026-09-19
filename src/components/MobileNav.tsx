import { Box, VStack, Link } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import CTAButton from './ui/CTAButton';

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

const MobileNav = ({ isOpen, onClose }: MobileNavProps) => {
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

  return (
    /**
     * A closed menu is not "an overlay at opacity 0". It has to be gone.
     *
     * This used to fade with framer-motion and switch itself off with
     * `animate={{ pointerEvents: isOpen ? 'auto' : 'none' }}`, which has two
     * problems. The small one: framer cannot tween a keyword, so it sets it
     * through the animation pipeline, and the write lands on the next frame
     * rather than in the same commit as the state change. That is a couple of
     * frames on an idle desktop and longer on a phone mid route change, all of
     * them frames where an invisible full-screen overlay is still taking taps.
     *
     * The large one: `pointer-events: none` is INHERITED, so any descendant
     * that sets `auto` climbs straight back out of it. CTAButton did exactly
     * that, which left the menu's Contact button live and invisible over the
     * middle of every phone screen. On the gallery login it lands on the
     * password box, because iOS lays a fixed overlay out against the visible
     * viewport (~664px with Safari's chrome) while the page underneath is
     * still centred against `100vh` (844px), which slides the menu's contents
     * ~90px up relative to the form. That is the 100% repro: tap Gallery Pass,
     * tap the password box, land on /contact.
     *
     * So: plain CSS, same idiom as PortalHeader's dropdown. `pointerEvents`
     * lands synchronously with the state change, and `visibility`, which
     * inherits and which nothing here overrides, takes the whole subtree out
     * of hit testing, the tab order and the a11y tree once the fade is done.
     * Transitioning visibility is what keeps the fade visible on the way out:
     * a discrete property flips at the END of its transition when going to
     * `hidden`, and at the START when coming back to `visible`.
     */
    <Box
      position="fixed"
      top="0"
      left="0"
      right="0"
      bottom="0"
      bg="gray.900"
      zIndex={1000}
      display={{ base: 'flex', lg: 'none' }}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      opacity={isOpen ? 1 : 0}
      visibility={isOpen ? 'visible' : 'hidden'}
      pointerEvents={isOpen ? 'auto' : 'none'}
      aria-hidden={isOpen ? undefined : true}
      transition="opacity 0.3s ease, visibility 0.3s ease"
      sx={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
    >
      <VStack spacing={7}>
        {menuItems.map((item) =>
          item.name === 'Contact' ? (
            // Contact is the conversion path and uses the same CTAButton as the
            // desktop nav. CTAButton's `to` branch renders a RouterLink and does
            // not forward onClick, so the wrapper catches the bubbled click and
            // still closes the overlay behind the navigation.
            <Box key={item.path} onClick={onClose}>
              <CTAButton to={item.path} variant="outline" tone="dark" size="md">
                {item.name}
              </CTAButton>
            </Box>
          ) : (
            <Link
              key={item.path}
              as={RouterLink}
              to={item.path}
              // menuLink, not ctaLabel: this is a full-screen overlay, and a
              // 13px navbar label inside it is both hard to read and — with no
              // padding — a ~13px tap target. py gets it past 44px.
              textStyle="menuLink"
              color="white"
              py={3}
              textDecoration="none"
              transition="color 0.3s"
              _hover={{ color: 'brand.accent', textDecoration: 'none' }}
              onClick={onClose}
            >
              {item.name}
            </Link>
          ),
        )}
      </VStack>
    </Box>
  );
};

export default MobileNav;
