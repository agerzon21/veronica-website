import { Box, VStack, Link } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { Link as RouterLink } from 'react-router-dom';
import CTAButton from './ui/CTAButton';

const MotionBox = motion(Box);

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

const MobileNav = ({ isOpen, onClose }: MobileNavProps) => {
  const menuItems = [
    { name: 'Home', path: '/' },
    { name: 'Gallery', path: '/gallery' },
    { name: 'Weddings', path: '/wedding-photography' },
    { name: 'Journal', path: '/journal' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
    { name: 'Client Portal', path: '/portal' },
  ];

  return (
    <MotionBox
      position="fixed"
      top="0"
      left="0"
      right="0"
      bottom="0"
      bg="gray.900"
      zIndex={1000}
      display={{ base: 'flex', md: 'none' }}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      initial={{ opacity: 0 }}
      animate={{
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
      }}
      transition={{ duration: 0.3 }}
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
    </MotionBox>
  );
};

export default MobileNav;
