import { Box, VStack, Link } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { Link as RouterLink } from 'react-router-dom';

const MotionBox = motion(Box);

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
}

const MobileNav = ({ isOpen, onClose }: MobileNavProps) => {
  const menuItems = [
    { name: 'Home', path: '/' },
    { name: 'Gallery', path: '/gallery' },
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
      <VStack spacing={8}>
        {menuItems.map((item) =>
          item.name === 'Contact' ? (
            // Contact gets the same gold-pill treatment as the desktop nav so
            // the conversion path is consistent across breakpoints.
            <Link
              key={item.path}
              as={RouterLink}
              to={item.path}
              fontSize="2xl"
              fontWeight="light"
              color="white"
              border="1px solid #c9a96e"
              borderRadius="sm"
              px={8}
              py={2}
              transition="all 0.3s"
              _hover={{ color: 'gray.900', bg: '#c9a96e' }}
              textTransform="uppercase"
              letterSpacing="wide"
              onClick={onClose}
            >
              {item.name}
            </Link>
          ) : (
            <Link
              key={item.path}
              as={RouterLink}
              to={item.path}
              fontSize="2xl"
              fontWeight="light"
              color="white"
              _hover={{ color: 'gray.300' }}
              textTransform="uppercase"
              letterSpacing="wide"
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