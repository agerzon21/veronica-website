import { Box, SimpleGrid, Heading, Text, Link as ChakraLink, Container } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const MotionBox = motion(Box);

const categories = [
  {
    name: 'portraits',
    title: 'Portraits',
    description: 'Capturing the essence of individuals through stunning portrait photography.',
    image: '/assets/photos/765456_mqaert.webp',
    link: '/gallery/portraits',
    backgroundPosition: 'center 50%'
  },
  {
    name: 'weddings',
    title: 'Weddings',
    description: 'Documenting your special day with beautiful and timeless wedding photography.',
    image: '/assets/photos/05_rfvs8y.webp',
    link: '/gallery/weddings',
    backgroundPosition: 'center 25%'
  },
  {
    name: 'family',
    title: 'Family',
    description: 'Preserving precious family moments with heartfelt photography sessions.',
    image: '/assets/photos/_C6C16373_l2cnrk.webp',
    link: '/gallery/family',
    backgroundPosition: 'center 40%'
  },
  {
    name: 'maternity',
    title: 'Maternity',
    description: 'Celebrating the beauty of pregnancy with elegant maternity photography.',
    image: '/assets/photos/_C6C8862_b8za5r.webp',
    link: '/gallery/maternity',
    backgroundPosition: 'center 35%'
  }
];

const GalleryCategories = () => {
  return (
    <Container maxW="full" mt={8} mb={16}>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={8}>
        {categories.map((category) => (
          <ChakraLink
            as={Link}
            to={category.link}
            key={category.title}
            _hover={{ textDecoration: 'none' }}
          >
            <MotionBox
              position="relative"
              borderRadius="xl"
              overflow="hidden"
              boxShadow="xl"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.3 }}
            >
              <Box
                height="300px"
                backgroundImage={`url(${category.image})`}
                backgroundSize="cover"
                backgroundPosition={category.backgroundPosition}
                filter="brightness(0.7)"
              />
              <Box
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                bgGradient="linear(to-b, transparent, blackAlpha.800)"
                display="flex"
                flexDirection="column"
                justifyContent="flex-end"
                p={6}
              >
                <Heading
                  as="h2"
                  size="lg"
                  color="white"
                  mb={2}
                  textTransform="capitalize"
                >
                  {category.title}
                </Heading>
                <Text color="whiteAlpha.900" fontSize="sm">
                  {category.description}
                </Text>
              </Box>
            </MotionBox>
          </ChakraLink>
        ))}
      </SimpleGrid>
    </Container>
  );
};

export default GalleryCategories; 