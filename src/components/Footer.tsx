import { Box, VStack, Text, HStack, Icon, Link, Image } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { FaInstagram, FaWhatsapp, FaRegEnvelope } from 'react-icons/fa';

// Light footer using the same logo + gold accent palette as the rest of the
// site. Four quiet bands — logo → connect → legal → meta — separated by
// whitespace rather than dark color blocks, so the footer reads as a
// natural extension of the page above instead of an abrupt dark slab.
//
// Every piece of text below is micro-metadata, so all of it is one token:
// `metaCaption`. It used to be three near-identical treatments stacked
// within fifteen lines (2xs/400/0.15em/uppercase, 2xs/500/0.25em/uppercase,
// 2xs/300/0.1em/sentence case), which read as three accidents rather than
// one deliberate register.

const SOCIALS = [
  { label: 'Instagram', href: 'https://www.instagram.com/vero.art.photo', icon: FaInstagram, external: true },
  { label: 'WhatsApp', href: 'https://wa.me/15709095707', icon: FaWhatsapp, external: true },
  { label: 'Email', href: 'mailto:vero@vero.photography', icon: FaRegEnvelope, external: false },
] as const;

// Legal / policy links. Small, quiet, but present — every real business
// site has these and Meta's app registration requires them (Privacy
// Policy URL + User Agreement URL fields).
const LEGAL_LINKS = [
  { label: 'Privacy Policy', to: '/privacy' },
  { label: 'Terms of Service', to: '/terms' },
  { label: 'Contact', to: '/contact' },
] as const;

const Footer = () => {
  const year = new Date().getFullYear();

  return (
    <Box as="footer" bg="white" position="relative">
      {/* Hairline separator from page content — single thin gray line.
          Matches the visual weight of the other section dividers on the site. */}
      <Box h="1px" bg="gray.100" />

      {/* One rhythm token instead of a per-footer padding pair. */}
      <Box layerStyle="sectionTight" px={6}>
        {/* A single VStack spacing governs every gap in the footer. The old
            version layered ad-hoc pt values on top of the stack spacing, so
            no two bands were the same distance apart. */}
        <VStack spacing={{ base: 6, md: 8 }} maxW="contentNarrow" mx="auto">
          {/* Logo — same SVG mark as the navbar. It is the footer's only
              focal point, so it carries the size rather than leaning on
              extra whitespace around it. Clicking it returns to home. */}
          <Link as={RouterLink} to="/" _hover={{ opacity: 0.85 }} transition="opacity 0.3s">
            <Image
              src="/assets/images/logo.svg"
              htmlWidth={460}
              htmlHeight={70}
              alt="Vero Photography"
              h={{ base: '40px', md: '48px' }}
              objectFit="contain"
            />
          </Link>

          {/* Social icons — gold-bordered round buttons so the contact paths
              read as the primary thing in the footer. Hover fills with gold. */}
          <HStack spacing={{ base: 3, md: 4 }}>
            {SOCIALS.map((s) => (
              <Link
                key={s.label}
                href={s.href}
                isExternal={s.external}
                aria-label={s.label}
                w={{ base: '42px', md: '44px' }}
                h={{ base: '42px', md: '44px' }}
                border="1px solid"
                borderColor="brand.accent"
                borderRadius="full"
                display="flex"
                alignItems="center"
                justifyContent="center"
                color="brand.accent"
                transition="all 0.3s"
                _hover={{ bg: 'brand.accent', color: 'white', textDecoration: 'none' }}
              >
                <Icon as={s.icon} boxSize={{ base: 4, md: '18px' }} />
              </Link>
            ))}
          </HStack>

          {/* Legal / policy links — quiet middle-gray text-only links,
              separated by dots. Positioned above the copyright line so
              the copyright reads as the final closing beat of the page. */}
          <HStack
            spacing={{ base: 3, md: 4 }}
            wrap="wrap"
            justify="center"
            divider={
              <Box
                as="span"
                w="3px"
                h="3px"
                borderRadius="full"
                bg="gray.300"
                border="none"
                sx={{ alignSelf: 'center', mx: { base: 3, md: 4 } }}
              />
            }
          >
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.to}
                as={RouterLink}
                to={l.to}
                textStyle="metaCaption"
                _hover={{ color: 'brand.accentText', textDecoration: 'none' }}
                transition="color 0.3s"
              >
                {l.label}
              </Link>
            ))}
          </HStack>

          {/* Meta — location + copyright, same register as the legal row. */}
          <VStack spacing={2}>
            <Text textStyle="metaCaption" textAlign="center">
              Scranton, PA · Available Worldwide
            </Text>
            <Text textStyle="metaCaption" textAlign="center">
              © {year} Vero Photography · Photographs © Veronika Gerzon
            </Text>
          </VStack>
        </VStack>
      </Box>
    </Box>
  );
};

export default Footer;
