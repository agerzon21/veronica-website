import { Box, VStack, Text, HStack, Icon, Link, Image } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { FaInstagram, FaWhatsapp, FaRegEnvelope } from 'react-icons/fa';

// Light footer using the same logo + gold accent palette as the rest of the
// site. Three quiet bands — logo → connect → meta — separated by whitespace
// rather than dark color blocks, so the footer reads as a natural extension
// of the page above instead of an abrupt dark slab.

const SOCIALS = [
  { label: 'Instagram', href: 'https://www.instagram.com/vero.art.photo', icon: FaInstagram, external: true },
  { label: 'WhatsApp', href: 'https://wa.me/15709095707', icon: FaWhatsapp, external: true },
  { label: 'Email', href: 'mailto:vero@vero.photography', icon: FaRegEnvelope, external: false },
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
                color="#c9a96e"
                transition="all 0.3s"
                _hover={{ bg: '#c9a96e', color: 'white', textDecoration: 'none' }}
              >
                <Icon as={s.icon} boxSize={{ base: 4, md: '18px' }} />
              </Link>
            ))}
          </HStack>

          {/* Meta — location + copyright, very quiet typographic weight */}
          <VStack spacing={1.5} pt={{ base: 2, md: 3 }}>
            <Text
              fontSize="2xs"
              fontWeight="500"
              color="gray.500"
              textTransform="uppercase"
              letterSpacing="0.25em"
              textAlign="center"
            >
              Scranton, PA · Available Worldwide
            </Text>
            <Text
              fontSize="2xs"
              color="gray.400"
              fontWeight="300"
              letterSpacing="0.1em"
            >
              © {year} Vero Photography
            </Text>
          </VStack>
        </VStack>
      </Box>
    </Box>
  );
};

export default Footer;
