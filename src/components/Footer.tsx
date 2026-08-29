import { Box, VStack, Text, HStack, Icon, Link, Image } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { FaInstagram, FaWhatsapp, FaRegEnvelope } from 'react-icons/fa';

// Light footer using the same logo + gold accent palette as the rest of the
// site. Four quiet bands — logo → connect → legal → meta — separated by
// whitespace rather than dark color blocks, so the footer reads as a
// natural extension of the page above instead of an abrupt dark slab.

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

      <Box py={{ base: 10, md: 14 }} px={6}>
        <VStack spacing={{ base: 6, md: 7 }} maxW="container.md" mx="auto">
          {/* Logo — same SVG mark as the navbar, slightly smaller. Clicking
              it returns to home. */}
          <Link as={RouterLink} to="/" _hover={{ opacity: 0.85 }} transition="opacity 0.3s">
            <Image
              src="/assets/images/logo.svg"
              htmlWidth={460}
              htmlHeight={70}
              alt="Vero Photography"
              h={{ base: '36px', md: '44px' }}
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
                border="1px solid #c9a96e"
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
            pt={{ base: 1, md: 2 }}
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
                fontSize="2xs"
                fontWeight="400"
                color="gray.600"
                letterSpacing="0.15em"
                textTransform="uppercase"
                _hover={{ color: 'brand.accent', textDecoration: 'none' }}
                transition="color 0.3s"
              >
                {l.label}
              </Link>
            ))}
          </HStack>

          {/* Meta — location + copyright, very quiet typographic weight */}
          <VStack spacing={1.5} pt={{ base: 2, md: 3 }}>
            <Text
              fontSize="2xs"
              fontWeight="500"
              color="gray.600"
              textTransform="uppercase"
              letterSpacing="0.25em"
              textAlign="center"
            >
              Scranton, PA · Available Worldwide
            </Text>
            <Text
              fontSize="2xs"
              color="gray.600"
              fontWeight="300"
              letterSpacing="0.1em"
            >
              © {year} Vero Photography · Photographs © Veronika Gerzon
            </Text>
          </VStack>
        </VStack>
      </Box>
    </Box>
  );
};

export default Footer;
