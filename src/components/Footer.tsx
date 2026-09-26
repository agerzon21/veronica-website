import { Box, Flex, Text, Icon, Link, Image } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import FaInstagram from '../icons/fa/FaInstagram';
import FaRegEnvelope from '../icons/fa/FaRegEnvelope';
import FaWhatsapp from '../icons/fa/FaWhatsapp';
import { SITE_LOGO_H } from './siteHeader';

/**
 * The footer is one sheet of paper, folded once.
 *
 * Above the fold is the face: the wordmark and the three ways to reach her.
 * Below it is the underside, carrying the small print that runs the other way
 * round. A single hairline is the crease.
 *
 * THE MONOGRAM STRADDLES THE CREASE, and that is the whole idea. The same mark
 * is drawn twice, at the same horizontal position, unmirrored, so the two halves
 * form ONE continuous object interrupted only by the fold. What flips at the
 * crease is not the shape but the POLARITY: above, the mark is warmer than the
 * white it sits on; below, it is lighter than the cream. That is what "seen from
 * behind" means here, and mirroring it (an earlier attempt) destroyed it, because
 * the halves stopped lining up and the V read as a stray diagonal.
 *
 * WHY IT IS 101px. The previous footer stacked logo, then icons, then legal, then
 * copyright, inside `layerStyle="sectionTight"` (64px of padding top and bottom on
 * desktop), which came to roughly 340px of mostly empty vertical space. This runs
 * side to side instead, and the height is set by the 44px tap targets and nothing
 * else.
 *
 * WHY THE DISC IS SMALLER THAN THE TAP TARGET. Each contact link is a full 44px
 * square, but the visible ring inside it is 30px and sits at the BOTTOM of that
 * square. That is what lets the circles drop onto the crease and align with the
 * wordmark's baseline without the touch area shrinking below 44px.
 */

// Watermark tints. Decorative only, aria-hidden, never text, so they are exempt
// from the contrast floor and do not belong in the theme: they exist to be
// almost invisible, which is the opposite of what every brand token is for.
const FACE = { disc: '#f8f1e0', ring: '#d8c49c', p: '#e2d4b4', v: '#dccca4' };
const UNDER = { disc: '#f9f4ea', ring: '#ffffff', p: '#fdfbf6', v: '#ffffff' };

/**
 * On a phone the footer has to fit the wordmark AND three 44px contacts, which
 * the header does not (it carries a 48px hamburger). At 390px that leaves about
 * 226px for the wordmark, and 34px of height is 223px of ink, so this is the
 * largest it can be without flex squashing it. 34px is also the bottom of
 * SITE_LOGO_H's own clamp, so header and footer read as the same size.
 */
const LOGO_H_MOBILE = '34px';

/**
 * The watermark is smaller on a phone. At header scale the wordmark and the
 * three 44px contacts fill the width, leaving roughly 11px of gap, so a 92px
 * mark would sit squarely behind the wordmark and cost it legibility. 68px
 * still straddles the crease and still reads as a watermark.
 */
const MARK = { base: 68, md: 92 };
const BAND = 56; // px, the face
const FOLD = 1; // px, the crease

/**
 * The real monogram from public/assets/images/logo-mark.svg, inlined rather than
 * <img src> because each of its four paths has to be recoloured independently.
 *
 * It centres itself: the three 44px circles come to 144px against the wordmark's
 * 140px, so the true centre of the gap between them sits exactly 2px left of the
 * container centre, at every width. Hence the calc. Measured at 320 through
 * 1440px; only 320 drifts, by 2px, where the wordmark itself starts shrinking.
 */
const FooterMark = ({ tone, face }: { tone: typeof FACE; face: boolean }) => (
  <Box
    as="span"
    aria-hidden="true"
    position="absolute"
    left="50%"
    transform="translateX(calc(-50% - 2px))"
    top={{
      base: face ? `${BAND - MARK.base / 2}px` : `-${MARK.base / 2 + FOLD}px`,
      md: face ? `${BAND - MARK.md / 2}px` : `-${MARK.md / 2 + FOLD}px`,
    }}
    w={{ base: `${MARK.base}px`, md: `${MARK.md}px` }}
    h={{ base: `${MARK.base}px`, md: `${MARK.md}px` }}
    pointerEvents="none"
  >
    <svg width="100%" height="100%" viewBox="109 5 60 60" fill="none" focusable="false" style={{ display: 'block' }}>
      <path d="M169 35C169 51.5685 155.569 65 139 65C122.431 65 109 51.5685 109 35C109 18.4314 122.431 5 139 5C155.569 5 169 18.4314 169 35Z" fill={tone.disc} />
      <path d="M168.423 35C168.423 51.2499 155.25 64.4231 139 64.4231C122.75 64.4231 109.577 51.2499 109.577 35C109.577 18.7501 122.75 5.57692 139 5.57692C155.25 5.57692 168.423 18.7501 168.423 35Z" stroke={tone.ring} strokeWidth="1.15385" />
      <path d="M136.865 23.0692C140.881 22.7923 144.412 22.6538 147.458 22.6538C156.042 22.6538 160.335 25.6827 160.335 31.7404C160.335 34.5442 159.608 37.0019 158.154 39.1135C157.392 40.2558 156.215 41.1731 154.623 41.8654C153.031 42.5231 151.11 42.8519 148.86 42.8519H141.175V59H136.865V23.0692ZM147.51 23.1731C145.502 23.1731 143.39 23.2942 141.175 23.5365V42.3327H148.86C153.74 42.125 156.181 38.6288 156.181 31.8442C156.181 29.075 155.454 26.9462 154 25.4577C152.546 23.9346 150.383 23.1731 147.51 23.1731Z" fill={tone.p} />
      <path d="M143.321 9.73078C143.979 10.3885 144.308 11.2365 144.308 12.275C144.308 13.1404 144.117 14.0231 143.737 14.9231L130.444 46.0769L129.873 46.3366L116.788 9.73078H121.202L132.054 40.4692L143.113 14.9231C143.494 14.0577 143.685 13.1577 143.685 12.2231C143.685 11.2885 143.425 10.5615 142.906 10.0423L143.321 9.73078Z" fill={tone.v} />
    </svg>
  </Box>
);

const SOCIALS = [
  { label: 'Instagram', href: 'https://www.instagram.com/vero.art.photo', icon: FaInstagram, external: true },
  { label: 'WhatsApp', href: 'https://wa.me/15709095707', icon: FaWhatsapp, external: true },
  { label: 'Email', href: 'mailto:vero@vero.photography', icon: FaRegEnvelope, external: false },
] as const;

// Portal is here deliberately. Of 21 peer photographers surveyed, not one links
// a client gallery from the footer; returning clients get emailed a bare URL.
const LEGAL = [
  { label: 'Privacy', to: '/privacy' },
  { label: 'Terms', to: '/terms' },
  { label: 'Contact', to: '/contact' },
  { label: 'Portal', to: '/portal' },
] as const;

// Both bands clip the monogram. The content inside each sits in the same
// contentNarrow column the rest of the site uses, while the band backgrounds
// bleed the full width — without that, a 1440px viewport strands the wordmark
// and the icons at opposite edges with a void between them.
const Band = ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
  <Box position="relative" overflow="hidden" w="100%" {...rest}>
    <Box position="relative" maxW="contentNarrow" mx="auto">
      {children}
    </Box>
  </Box>
);

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <Box as="footer" bg="white">
      {/* The face */}
      <Band h={`${BAND}px`} bg="white">
        <FooterMark tone={FACE} face />
        <Flex position="relative" align="flex-end" w="100%" h={`${BAND}px`} px={{ base: 3, md: 4 }} pb="5px">
          <Link as={RouterLink} to="/" display="flex" alignItems="flex-end" flex="0 1 auto" minW={0} h="44px" _hover={{ opacity: 0.85 }} transition="opacity 0.3s">
            <Image
              src="/assets/images/logo.svg"
              htmlWidth={460}
              htmlHeight={70}
              alt="Vero Photography"
              width="auto"
              objectFit="contain"
              objectPosition="left bottom"
              h={{ base: LOGO_H_MOBILE, lg: SITE_LOGO_H }}
            />
          </Link>
          <Box aria-hidden="true" flex="1 1 auto" minW="8px" />
          <Flex flex="0 0 auto" align="center" gap={{ base: 0, md: "6px" }}>
            {SOCIALS.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                isExternal={s.external}
                aria-label={s.label}
                display="flex"
                alignItems="flex-end"
                justifyContent="center"
                w="44px"
                h="44px"
                _hover={{ textDecoration: 'none', '& > span': { bg: 'brand.accent' }, '& svg': { color: 'white' } }}
              >
                <Box
                  as="span"
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  w="30px"
                  h="30px"
                  border="1px solid"
                  borderColor="brand.accent"
                  borderRadius="full"
                  bg="white"
                  transition="background 0.3s"
                >
                  <Icon as={s.icon} boxSize="15px" color="brand.accentText" transition="color 0.3s" />
                </Box>
              </Link>
            ))}
          </Flex>
        </Flex>
      </Band>

      {/* The crease */}
      <Box aria-hidden="true" w="100%" h={`${FOLD}px`} bg="brand.accent" />

      {/* The underside. Legal left, copyright right: the reverse of the face. */}
      <Band bg="brand.surfaceFold">
        <FooterMark tone={UNDER} face={false} />
        <Flex position="relative" align="center" justify="space-between" wrap="wrap" w="100%" minH="44px" px={{ base: 3, md: 4 }}>
          <Flex flex="0 1 auto" minW={0} align="center">
            {LEGAL.map((l, i) => (
              <Flex key={l.to} align="center">
                {i > 0 && <Box aria-hidden="true" w="1px" h="9px" bg="brand.accent" opacity={0.55} />}
                <Link
                  as={RouterLink}
                  to={l.to}
                  display="flex"
                  alignItems="center"
                  h="44px"
                  px="5px"
                  fontSize="10.5px"
                  lineHeight={1}
                  whiteSpace="nowrap"
                  _hover={{ color: 'brand.accentText', textDecoration: 'none' }}
                  transition="color 0.3s"
                >
                  {l.label}
                </Link>
              </Flex>
            ))}
          </Flex>
          <Text flex="0 0 auto" fontSize="9px" lineHeight="14px" letterSpacing="0.06em" color="brand.mutedText" whiteSpace="nowrap">
            © {year} Vero Photography
          </Text>
        </Flex>
      </Band>
    </Box>
  );
};

export default Footer;
