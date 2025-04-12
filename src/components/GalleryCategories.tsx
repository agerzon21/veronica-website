import { Box, SimpleGrid, Heading, Text, Link as ChakraLink, Container } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const MotionBox = motion(Box);

const categories = [
  {
    title: 'Portraits',
    description: 'Capturing the essence of individuals through stunning portrait photography.',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418398/_C6C0250_kgvym7.jpg',
    link: '/gallery/portraits'
  },
  {
    title: 'Weddings',
    description: 'Documenting your special day with beautiful and timeless wedding photography.',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744415004/05_rfvs8y.jpg',
    link: '/gallery/weddings'
  },
  {
    title: 'Family',
    description: 'Preserving precious family moments with heartfelt photography sessions.',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744318392/IMG_3712_uvjtxr.jpg',
    link: '/gallery/family'
  },
  {
    title: 'Maternity',
    description: 'Celebrating the beauty of pregnancy with elegant maternity photography.',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744318392/IMG_3712_uvjtxr.jpg',
    link: '/gallery/maternity'
  }
];

const GalleryCategories = () => {
  return (
    <Container maxW="container.xl" mt={8} mb={16}>
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
                backgroundPosition="center"
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