import { Box, Container, Text, IconButton, Flex, Heading } from '@chakra-ui/react';
import { useParams, Link } from 'react-router-dom';
import { ArrowBackIcon } from '@chakra-ui/icons';
import GalleryCategories from '../components/GalleryCategories';
import GalleryGrid from '../components/GalleryGrid';

// Sample images data structure
const sampleImages = {
  portraits: [
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3712_uvjtxr.jpg', width: 1200, height: 800 },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3710_utj2oy.jpg', width: 800, height: 1200 },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310088/IMG_3711_yr6cby.jpg', width: 1200, height: 800 },
  ],
  family: [
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3710_utj2oy.jpg', width: 1200, height: 800 },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310088/IMG_3711_yr6cby.jpg', width: 800, height: 1200 },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310086/IMG_3709_w1cvak.jpg', width: 1200, height: 800 },
  ],
  weddings: [
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310088/IMG_3711_yr6cby.jpg', width: 1200, height: 800 },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310086/IMG_3709_w1cvak.jpg', width: 800, height: 1200 },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3712_uvjtxr.jpg', width: 1200, height: 800 },
  ],
  maternity: [
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310086/IMG_3709_w1cvak.jpg', width: 1200, height: 800 },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3712_uvjtxr.jpg', width: 800, height: 1200 },
    { url: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3710_utj2oy.jpg', width: 1200, height: 800 },
  ],
};

const categoryDetails = {
  portraits: {
    title: 'Portrait Collection',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3712_uvjtxr.jpg',
  },
  family: {
    title: 'Family Collection',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3710_utj2oy.jpg',
  },
  weddings: {
    title: 'Wedding Collection',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310088/IMG_3711_yr6cby.jpg',
  },
  maternity: {
    title: 'Maternity Collection',
    image: 'https://res.cloudinary.com/doj1fanx3/image/upload/v1744310086/IMG_3709_w1cvak.jpg',
  },
};

const Gallery = () => {
  const { category } = useParams();
  
  console.log('Current category:', category);
  console.log('Available categories:', Object.keys(sampleImages));
  
  if (!category) {
    return (
      <Box position="relative" minH="100vh">
        {/* Background wrapper */}
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          height="60vh"
          zIndex={0}
          overflow="hidden"
        >
          {/* Background Image */}
          <Box
            position="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            backgroundImage="url(https://res.cloudinary.com/doj1fanx3/image/upload/v1744310089/IMG_3712_uvjtxr.jpg)"
            backgroundSize="cover"
            backgroundPosition="center"
            backgroundRepeat="no-repeat"
            filter="brightness(0.5)"
          />

          {/* Hero Content */}
          <Box
            position="relative"
            height="100%"
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            zIndex={1}
          >
            <Text
              fontSize={{ base: '4xl', md: '6xl', lg: '7xl' }}
              fontWeight="light"
              color="white"
              textTransform="uppercase"
              letterSpacing="wider"
              textShadow="2px 2px 4px rgba(0,0,0,0.3)"
              mb={4}
            >
              Gallery
            </Text>
            <Text
              fontSize={{ base: 'xl', md: '2xl' }}
              color="white"
              fontStyle="italic"
              textShadow="1px 1px 2px rgba(0,0,0,0.3)"
            >
              A collection of my recent work
            </Text>
          </Box>
        </Box>

        {/* Content Section */}
        <Box 
          position="relative" 
          bg="white"
          marginTop="45vh"
          borderTopRadius="3xl"
          zIndex={2}
          boxShadow="0px -10px 30px rgba(0,0,0,0.2)"
          minH="100vh"
          pb={20}
        >
          <Container maxW="container.xl" py={16}>
            <GalleryCategories />
          </Container>
        </Box>
      </Box>
    );
  }

  const images = sampleImages[category as keyof typeof sampleImages] || [];
  const categoryInfo = categoryDetails[category as keyof typeof categoryDetails];
  
  console.log('Selected category images:', images);
  console.log('Category info:', categoryInfo);

  return (
    <Box position="relative" minH="100vh">
      {/* Category Hero Section */}
      <Box
        position="relative"
        height="50vh"
        width="100%"
        overflow="hidden"
      >
        {/* Background Image */}
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundImage={`url(${categoryInfo.image})`}
          backgroundSize="cover"
          backgroundPosition="center"
          backgroundRepeat="no-repeat"
          filter="brightness(0.5)"
        />

        {/* Category Title */}
        <Flex
          position="absolute"
          bottom={0}
          left={0}
          right={0}
          height="100%"
          alignItems="center"
          justifyContent="center"
          flexDirection="column"
          bg="linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)"
        >
          <Text
            fontSize={{ base: '3xl', md: '5xl', lg: '6xl' }}
            fontWeight="light"
            color="white"
            textTransform="uppercase"
            letterSpacing="wider"
            textShadow="2px 2px 4px rgba(0,0,0,0.3)"
          >
            {categoryInfo.title}
          </Text>

          {/* Mobile Back Button */}
          <Box
            mt={6}
            display={{ base: "block", md: "none" }}
            zIndex={2}
          >
            <Link
              to="/gallery"
              style={{ textDecoration: 'none' }}
            >
              <Box
                bg="blackAlpha.500"
                backdropFilter="blur(8px)"
                rounded="full"
                display="flex"
                alignItems="center"
                py={2}
                px={4}
                _hover={{
                  bg: "blackAlpha.600"
                }}
                cursor="pointer"
              >
                <ArrowBackIcon color="white" />
                <Text
                  color="white"
                  fontSize="sm"
                  fontWeight="medium"
                  ml={2}
                >
                  Back to Gallery
                </Text>
              </Box>
            </Link>
          </Box>
        </Flex>

        {/* Desktop Back Button */}
        <Box
          position="absolute"
          top="50%"
          left={8}
          transform="translateY(-50%)"
          zIndex={2}
          display={{ base: "none", md: "block" }}
        >
          <IconButton
            as={Link}
            to="/gallery"
            icon={<ArrowBackIcon />}
            aria-label="Back to Gallery"
            size="md"
            bg="blackAlpha.400"
            color="white"
            _hover={{
              bg: "blackAlpha.600",
              transform: "translateX(-2px)"
            }}
            transition="all 0.2s"
            rounded="full"
          />
        </Box>
      </Box>

      {/* Images Grid Section */}
      <Box 
        position="relative" 
        bg="white"
        borderTopRadius="3xl"
        marginTop="-2rem"
        zIndex={1}
        minH="50vh"
        pb={20}
      >
        <Container maxW="container.xl" py={16}>
          <GalleryGrid images={images} />
        </Container>
      </Box>
    </Box>
  );
};

export default Gallery; 