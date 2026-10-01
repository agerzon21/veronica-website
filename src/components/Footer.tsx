import { Box, Flex, Text, Link } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';

/**
 * The footer is one sheet of paper, folded once, and the monogram is the seal
 * that closes it.
 *
 * WHY THERE IS NO WORDMARK HERE. There used to be, at the same size as the one
 * in the header. The header is STICKY, so it is on screen the entire time the
 * page is scrolled, and a second copy of it at the bottom read as a duplicate
 * rather than as a sign-off. The monogram alone does the job of saying whose
 * page this was, and it is a real link to "/".
 *
 * WHY THERE ARE NO CONTACT ICONS. There were three: Instagram, WhatsApp, email.
 * The site already has a Contact page that lists every way to reach her, linked
 * from the header as a button and from this footer as text. Repeating the three
 * channels here was clutter competing with the thing it sat next to.
 *
 * THE SEAL STRADDLES THE CREASE. The same mark is drawn twice, at the same
 * horizontal position and unmirrored, so the two halves are ONE continuous
 * object interrupted only by the fold. What flips at the crease is the disc
 * behind the glyphs, warm above the white and plain white below the cream; the
 * ink itself stays constant, which is what keeps it reading as one seal rather
 * than two halves in different colours.
 *
 * WHY THE LINK IS A SEPARATE ABSOLUTE ELEMENT. Both bands are overflow:hidden,
 * which is what clips the seal into halves. An anchor inside either band would
 * be clipped the same way, so only half of it would be clickable. It therefore
 * lives in the footer's own stacking context, over the crease, as one 56px
 * round target.
 *
 * VERTICAL BALANCE was a specific complaint about the previous version, where
 * the mark's bottom sat flush with the footer's edge and looked cut off. Here
 * the seal clears the top by 36px and the bottom by 39px, measured in Chrome.
 */

const SEAL = 48; // px
const FACE = 60; // px, the white band above the crease
const FOLD = 1; // px, the crease itself
const PAD_BOTTOM = 18; // px, what stops the seal looking snug against the edge

/**
 * Both footer sizes used to sit BELOW the type scale: links at 10.5px and the
 * copyright at 9px, where the theme's smallest token is 0.6875rem (11px), used
 * by eyebrow, metaCaption and formLabel.
 *
 * They now scale between the floor and the ctaLabel size rather than taking one
 * value, because the whole row has to fit one line of a phone: two links, the
 * seal's column, two more. Collaborate and Contact are the wider pair, 114px of
 * words at 13px, and Chakra has no breakpoint between 320 and 480 to switch at.
 * So everything from about 406px up gets the full 13px, and below that the
 * links shrink with the screen, to 10.2px at 320.
 */

// Seal tints. The ink is brand.accentText and the ring brand.accent in every
// case; only the disc behind them changes across the crease, which is the whole
// inversion. Kept local because they are one composition's decision, not a
// palette other components should reach for.
const DISC_FACE = '#f8f1e0';
const DISC_UNDER = '#ffffff';

const SealHalf = ({ face }: { face: boolean }) => (
  <Box
    as="span"
    aria-hidden="true"
    position="absolute"
    left="50%"
    transform="translateX(-50%)"
    top={face ? `${FACE - SEAL / 2}px` : `-${SEAL / 2 + FOLD}px`}
    w={`${SEAL}px`}
    h={`${SEAL}px`}
    pointerEvents="none"
  >
    <svg width={SEAL} height={SEAL} viewBox="109 5 60 60" fill="none" focusable="false" style={{ display: 'block' }}>
      <path d="M169 35C169 51.5685 155.569 65 139 65C122.431 65 109 51.5685 109 35C109 18.4314 122.431 5 139 5C155.569 5 169 18.4314 169 35Z" fill={face ? DISC_FACE : DISC_UNDER} />
      <path d="M168.423 35C168.423 51.2499 155.25 64.4231 139 64.4231C122.75 64.4231 109.577 51.2499 109.577 35C109.577 18.7501 122.75 5.57692 139 5.57692C155.25 5.57692 168.423 18.7501 168.423 35Z" stroke="#c9a96e" strokeWidth="1.15385" />
      <path d="M136.865 23.0692C140.881 22.7923 144.412 22.6538 147.458 22.6538C156.042 22.6538 160.335 25.6827 160.335 31.7404C160.335 34.5442 159.608 37.0019 158.154 39.1135C157.392 40.2558 156.215 41.1731 154.623 41.8654C153.031 42.5231 151.11 42.8519 148.86 42.8519H141.175V59H136.865V23.0692ZM147.51 23.1731C145.502 23.1731 143.39 23.2942 141.175 23.5365V42.3327H148.86C153.74 42.125 156.181 38.6288 156.181 31.8442C156.181 29.075 155.454 26.9462 154 25.4577C152.546 23.9346 150.383 23.1731 147.51 23.1731Z" fill="#8a6e35" />
      <path d="M143.321 9.73078C143.979 10.3885 144.308 11.2365 144.308 12.275C144.308 13.1404 144.117 14.0231 143.737 14.9231L130.444 46.0769L129.873 46.3366L116.788 9.73078H121.202L132.054 40.4692L143.113 14.9231C143.494 14.0577 143.685 13.1577 143.685 12.2231C143.685 11.2885 143.425 10.5615 142.906 10.0423L143.321 9.73078Z" fill="#8a6e35" />
    </svg>
  </Box>
);

const FootLink = ({ to, children }: { to: string; children: React.ReactNode }) => (
  <Link
    as={RouterLink}
    to={to}
    display="flex"
    alignItems="flex-start"
    justifyContent="center"
    pt="6px"
    h="44px"
    px="clamp(4px, 1.55vw, 6px)"
    fontSize="clamp(0.625rem, 3.2vw, 0.8125rem)"
    lineHeight="12px"
    letterSpacing="0.04em"
    whiteSpace="nowrap"
    _hover={{ color: 'brand.accentText', textDecoration: 'none' }}
    transition="color 0.3s"
  >
    {children}
  </Link>
);

const Tick = () => (
  <Box aria-hidden="true" w="1px" h="9px" bg="brand.accent" opacity={0.55} />
);

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <Box as="footer" position="relative" bg="white">
      {/* The face. Empty but for the seal's upper half, which is the point:
          the white above the crease is what gives the seal room to sit in. */}
      <Box position="relative" overflow="hidden" bg="white" h={`${FACE}px`}>
        <SealHalf face />
      </Box>

      {/* The crease */}
      <Box aria-hidden="true" h={`${FOLD}px`} bg="brand.accent" />

      {/* The underside. Two links flank the seal on each side and the copyright
          sits under it. Gallery and Portal used to be here as well, and both
          are in the sticky header on every public page, so the footer keeps
          what the header does not carry, plus Contact. */}
      <Box position="relative" overflow="hidden" bg="brand.surfaceFold" pb={`${PAD_BOTTOM}px`}>
        <SealHalf face={false} />
        <Flex position="relative" align="flex-start">
          {/* ONE ROW AT EVERY WIDTH. The two side columns split whatever the
              seal's column leaves EQUALLY (flex 1 1 0), which is what holds the
              seal in the centre: the width cannot follow the words or the seal
              drifts with them. Each pair hugs the seal.

              Wrapping is not an option: a wrapped pair strands a tick at the
              end of a line, which is what the six link version did on every
              phone. Instead the type, the padding and the tick gaps shrink
              together below about 406px, and the seal's column narrows with
              them, but never below 56px, its round link's width, so a tap
              beside the seal still lands on the word it was aimed at. */}
          <Flex flex="1 1 0" minW={0} align="flex-start" justify="flex-end" columnGap="clamp(4px, 1.9vw, 7px)">
            <FootLink to="/privacy">Privacy</FootLink>
            <Tick />
            <FootLink to="/terms">Terms</FootLink>
          </Flex>
          {/* On a phone the copyright is wider than the seal's column, so it is
              centred and allowed to run under the inner links' 44px targets,
              below their words. pointerEvents none hands those taps through to
              the links instead of swallowing them. */}
          <Flex direction="column" align="center" justify="flex-end" flexShrink={0} w="clamp(56px, 19vw, 146px)" h="44px">
            <Text m={0} pointerEvents="none" textAlign="center" whiteSpace="nowrap" fontSize="clamp(0.625rem, 2.9vw, 0.6875rem)" lineHeight="14px" letterSpacing="0.06em" color="brand.mutedText">
              © {year} Vero Photography
            </Text>
          </Flex>
          <Flex flex="1 1 0" minW={0} align="flex-start" justify="flex-start" columnGap="clamp(4px, 1.9vw, 7px)">
            <FootLink to="/collaborate">Collaborate</FootLink>
            <Tick />
            <FootLink to="/contact">Contact</FootLink>
          </Flex>
        </Flex>
      </Box>

      {/* The seal as one link. Outside both bands because they clip. */}
      <Link
        as={RouterLink}
        to="/"
        aria-label="Vero Photography, home"
        /* The one hook anything outside this file needs: the top of this box is
           where the footer starts DRAWING. Everything above it is the empty
           white of the face, which the gallery's floating action bar is allowed
           to hang into (see GalleryActionBar in ClientGallery). It reads the
           attribute rather than "the footer's first anchor", so adding a band
           or a link up here cannot silently move the limit. */
        data-footer-seal=""
        position="absolute"
        left="50%"
        transform="translateX(-50%)"
        top={`${FACE - 28}px`}
        w="56px"
        h="56px"
        borderRadius="full"
        _hover={{ opacity: 0.8 }}
        transition="opacity 0.3s"
      />
    </Box>
  );
};

export default Footer;
