import { Box, Flex, Link, useColorModeValue } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';

const Navbar = () => {
  const bgColor = useColorModeValue('rgba(255, 255, 255, 0.8)', 'rgba(26, 32, 44, 0.8)');
  const textColor = useColorModeValue('gray.800', 'white');
  const hoverColor = useColorModeValue('gray.600', 'gray.200');

  return (
    <Box 
      position="fixed" 
      w="100%" 
      zIndex={1000}
      backdropFilter="blur(10px)"
      bg={bgColor}
    >
      <Flex 
        h={20} 
        alignItems="center" 
        justifyContent="space-between" 
        maxW="1200px" 
        mx="auto"
        px={8}
      >
        <Link 
          as={RouterLink} 
          to="/" 
          fontSize="2xl" 
          fontWeight="bold"
          color={textColor}
          _hover={{ 
            textDecoration: 'none',
            color: hoverColor,
            transform: 'scale(1.05)',
            transition: 'all 0.2s'
          }}
        >
          Veronica Photography
        </Link>
        <Flex gap={8}>
          <Link 
            as={RouterLink} 
            to="/" 
            color={textColor}
            _hover={{ 
              textDecoration: 'none',
              color: hoverColor,
              transform: 'translateY(-2px)',
              transition: 'all 0.2s'
            }}
          >
            Home
          </Link>
          <Link 
            as={RouterLink} 
            to="/gallery" 
            color={textColor}
            _hover={{ 
              textDecoration: 'none',
              color: hoverColor,
              transform: 'translateY(-2px)',
              transition: 'all 0.2s'
            }}
          >
            Gallery
          </Link>
          <Link 
            as={RouterLink} 
            to="/about" 
            color={textColor}
            _hover={{ 
              textDecoration: 'none',
              color: hoverColor,
              transform: 'translateY(-2px)',
              transition: 'all 0.2s'
            }}
          >
            About
          </Link>
          <Link 
            as={RouterLink} 
            to="/contact" 
            color={textColor}
            _hover={{ 
              textDecoration: 'none',
              color: hoverColor,
              transform: 'translateY(-2px)',
              transition: 'all 0.2s'
            }}
          >
            Contact
          </Link>
        </Flex>
      </Flex>
    </Box>
  );
};

export default Navbar; 