import React from 'react';
import { Box, Flex, Link, Container, useColorModeValue } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';

const Navigation: React.FC = () => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  return (
    <Box
      as="nav"
      position="sticky"
      top="0"
      zIndex="sticky"
      bg={bgColor}
      borderBottom="1px"
      borderColor={borderColor}
      py={4}
    >
      <Container maxW="container.xl">
        <Flex justify="space-between" align="center">
          <Link
            as={RouterLink}
            to="/"
            fontSize="xl"
            fontWeight="bold"
            _hover={{ textDecoration: 'none' }}
          >
            Veronica's Photography
          </Link>
          
          <Flex gap={6}>
            <Link
              as={RouterLink}
              to="/"
              _hover={{ textDecoration: 'none', color: 'blue.500' }}
            >
              Home
            </Link>
            <Link
              as={RouterLink}
              to="/gallery"
              _hover={{ textDecoration: 'none', color: 'blue.500' }}
            >
              Gallery
            </Link>
            <Link
              as={RouterLink}
              to="/about"
              _hover={{ textDecoration: 'none', color: 'blue.500' }}
            >
              About
            </Link>
            <Link
              as={RouterLink}
              to="/contact"
              _hover={{ textDecoration: 'none', color: 'blue.500' }}
            >
              Contact
            </Link>
          </Flex>
        </Flex>
      </Container>
    </Box>
  );
};

export default Navigation; 