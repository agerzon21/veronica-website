import { Box, SimpleGrid, Heading, Text, Link as ChakraLink, Container } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const MotionBox = motion(Box);

const categories = [
  {
    id: 'portraits',
    title: 'Portraits',
    description: 'Capturing the essence of individuals',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744418398/_C6C0250_kgvym7.jpg',
  },
  {
    id: 'family',
    title: 'Family',
    description: 'Cherished moments with loved ones',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3710_utj2oy.jpg',
  },
  {
    id: 'weddings',
    title: 'Weddings',
    description: 'Celebrating love and commitment',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310088/IMG_3711_yr6cby.jpg',
  },
  {
    id: 'maternity',
    title: 'Maternity',
    description: 'The beauty of new life',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310086/IMG_3709_w1cvak.jpg',
  },
];

const GalleryCategories = () => {
  return (
    <Container maxW="container.xl" mt={8} mb={16}>
      <SimpleGrid columns={{ base: 1, md: 2 }} spacing={8}>
        {categories.map((category) => (
          <ChakraLink
            as={Link}
            to={`/gallery/${category.id}`}
            key={category.id}
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