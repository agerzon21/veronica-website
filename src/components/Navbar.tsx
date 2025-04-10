import React from 'react';
import { Box, Flex, Link, Button } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';

const Navbar = () => {
  return (
    <Box bg="white" px={4} shadow="sm">
      <Flex h={16} alignItems="center" justifyContent="space-between" maxW="1200px" mx="auto">
        <Link as={RouterLink} to="/" fontSize="xl" fontWeight="bold">
          Veronica Photography
        </Link>
        <Flex gap={4}>
          <Link as={RouterLink} to="/" _hover={{ textDecoration: 'none' }}>
            Home
          </Link>
          <Link as={RouterLink} to="/gallery" _hover={{ textDecoration: 'none' }}>
            Gallery
          </Link>
          <Link as={RouterLink} to="/about" _hover={{ textDecoration: 'none' }}>
            About
          </Link>
          <Link as={RouterLink} to="/contact" _hover={{ textDecoration: 'none' }}>
            Contact
          </Link>
        </Flex>
      </Flex>
    </Box>
  );
};

export default Navbar; 