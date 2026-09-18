import { Box, type BoxProps } from '@chakra-ui/react';
import { m } from 'framer-motion';

const MotionBox = m(Box);

/**
 * The site's burger, and now the client portal's too.
 *
 * Three 24x2 bars in a 24x20 box, morphing to a cross over 0.3s on the
 * standard cubic-bezier(0.4, 0, 0.2, 1). That morph is the site's, and the
 * portal header reuses THIS component rather than growing a second one: two
 * hand-rolled burgers would drift apart on the first tweak to either, and a
 * client crossing from the public site into their portal would feel it.
 *
 * Everything the portal needed is an OPTIONAL prop with today's value as its
 * default, so Navbar.tsx is untouched by its existence:
 *
 *   - `barColor` / `barColorOpen` for a portal burger that stays dark when
 *     open, because it opens an anchored white panel rather than the site's
 *     full screen gray.900 overlay, where white bars are the only readable
 *     choice.
 *   - `frame` for the button itself, which the portal makes a bordered 40px
 *     square and shows at a different breakpoint (the site hands over to its
 *     desktop nav at `lg`, the portal header at `md`).
 */
interface BurgerMenuProps {
  isOpen: boolean;
  onClick: () => void;
  /** Bar colour while the menu is closed. Default: the site navbar's. */
  barColor?: string;
  /** Bar colour while it is open. Default: white, for the dark site overlay. */
  barColorOpen?: string;
  /**
   * Merged onto the button, after the defaults, so a caller can restyle the
   * frame the bars sit in (size, border, breakpoint, aria-label) without
   * touching the bars or the morph.
   */
  frame?: BoxProps;
}

const BurgerMenu = ({
  isOpen,
  onClick,
  barColor = 'gray.800',
  barColorOpen = 'white',
  frame,
}: BurgerMenuProps) => {
  const transition = {
    duration: 0.3,
    ease: [0.4, 0, 0.2, 1]
  };
  const bar = isOpen ? barColorOpen : barColor;

  return (
    <Box
      as="button"
      type="button"
      aria-label={isOpen ? 'Close menu' : 'Open menu'}
      aria-expanded={isOpen}
      display={{ base: 'block', lg: 'none' }}
      onClick={onClick}
      cursor="pointer"
      zIndex={2000}
      p={2}
      position="relative"
      bg="transparent"
      border="none"
      {...frame}
    >
      <Box position="relative" w="24px" h="20px">
        <MotionBox
          position="absolute"
          w="24px"
          h="2px"
          bg={bar}
          initial={false}
          animate={{
            top: isOpen ? "50%" : "0%",
            transform: isOpen ? "translateY(-50%) rotate(45deg)" : "none",
          }}
          transition={transition}
          transformOrigin="center"
        />
        <MotionBox
          position="absolute"
          w="24px"
          h="2px"
          bg={bar}
          top="50%"
          initial={false}
          animate={{
            opacity: isOpen ? 0 : 1,
            transform: isOpen ? "translateY(-50%) scaleX(0)" : "translateY(-50%)",
          }}
          transition={transition}
          transformOrigin="center"
        />
        <MotionBox
          position="absolute"
          w="24px"
          h="2px"
          bg={bar}
          initial={false}
          animate={{
            bottom: isOpen ? "50%" : "0%",
            transform: isOpen ? "translateY(50%) rotate(-45deg)" : "none",
          }}
          transition={transition}
          transformOrigin="center"
        />
      </Box>
    </Box>
  );
};

export default BurgerMenu;
