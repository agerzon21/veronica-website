import { Box, Text, Flex, VStack, Image } from '@chakra-ui/react';
import { useParams, Link } from 'react-router-dom';
import { ArrowBackIcon } from '@chakra-ui/icons';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import GalleryCategories from '../components/GalleryCategories';
import GalleryGrid from '../components/GalleryGrid';
import { photosByCategory, type Category } from '../data/photos';

const MotionDiv = motion.div;

const GALLERY_HERO_IMAGE = '/assets/photos/portraits/sunset-sunflower-field-joy.webp';

export const categoryDetails: Record<Category, {
  title: string;
  description: string;
  image: string;
  backgroundPosition: string;
}> = {
  portraits: {
    title: 'Portraits',
    description: 'Capturing the essence of individuals through stunning portrait photography.',
    image: '/assets/photos/portraits/shadow-play-portrait.webp',
    backgroundPosition: 'center 50%',
  },
  weddings: {
    title: 'Weddings',
    description: 'Documenting your special day with beautiful and timeless wedding photography.',
    image: '/assets/photos/weddings/newlyweds-running-sea.webp',
    backgroundPosition: 'center 25%',
  },
  family: {
    title: 'Family',
    description: 'Preserving precious family moments with heartfelt photography sessions.',
    image: '/assets/photos/family/elegant-family-studio-portrait-black.webp',
    backgroundPosition: 'center 40%',
  },
  maternity: {
    title: 'Maternity',
    description: 'Celebrating the beauty of pregnancy with elegant maternity photography.',
    image: '/assets/photos/maternity/couples-beach-baby-bump-moment.webp',
    backgroundPosition: 'center 35%',
  },
};

const Gallery = () => {
  const { category } = useParams();

  if (!category) {
    return (
      <Box minH="100vh" bg="white">
        <Helmet>
          <meta property="og:image" content={`https://vero.photography${GALLERY_HERO_IMAGE}`} />
        </Helmet>
        {/* Hero */}
        <Box position="relative" h={{ base: '45vh', lg: '50vh' }} overflow="hidden">
          <Image
            src={GALLERY_HERO_IMAGE}
            alt="Gallery"
            objectFit="cover"
            objectPosition="center 15%"
            w="100%"
            h="100%"
          />
          <Box position="absolute" inset={0} bg="rgba(0,0,0,0.5)" />
          <Flex
            position="absolute"
            inset={0}
            align="center"
            justify="center"
          >
            <MotionDiv
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <VStack spacing={4} textAlign="center" px={6}>
                <Text
                  fontSize="xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.2em"
                  color="#c9a96e"
                >
                  Portfolio
                </Text>
                <Box w="35px" h="1px" bg="#c9a96e" />
                <Text
                  as="h1"
                  fontSize={{ base: '2xl', md: '3xl', lg: '4xl' }}
                  fontWeight="200"
                  color="white"
                  lineHeight="1.4"
                  m={0}
                >
                  A collection of my recent work
                </Text>
              </VStack>
            </MotionDiv>
          </Flex>
        </Box>

        {/* Categories */}
        <GalleryCategories />
      </Box>
    );
  }

  const images = photosByCategory[category as Category] || [];
  const categoryInfo = categoryDetails[category as Category];

  if (!categoryInfo) {
    return null;
  }

  // Randomize the order of images
  const randomizedImages = [...images].sort(() => Math.random() - 0.5);

  return (
    <Box minH="100vh" bg="white">
      <Helmet>
        <meta property="og:image" content={`https://vero.photography${categoryInfo.image}`} />
      </Helmet>
      {/* Category Hero */}
      <Box position="relative" h={{ base: '40vh', lg: '45vh' }} overflow="hidden">
        <Image
          src={categoryInfo.image}
          alt={categoryInfo.title}
          objectFit="cover"
          objectPosition={categoryInfo.backgroundPosition}
          w="100%"
          h="100%"
        />
        <Box position="absolute" inset={0} bg="rgba(0,0,0,0.5)" />
        <Flex
          position="absolute"
          inset={0}
          pt="36px"
          align="center"
          justify="center"
        >
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <VStack spacing={4} textAlign="center" px={6}>
              <Text
                fontSize="xs"
                fontWeight="500"
                textTransform="uppercase"
                letterSpacing="0.2em"
                color="#c9a96e"
              >
                Gallery
              </Text>
              <Box w="35px" h="1px" bg="#c9a96e" />
              <Text
                as="h1"
                fontSize={{ base: '2xl', md: '3xl', lg: '4xl' }}
                fontWeight="200"
                color="white"
                lineHeight="1.4"
                m={0}
              >
                {categoryInfo.title}
              </Text>
            </VStack>
          </MotionDiv>
        </Flex>

        {/* Back Button */}
        <Box
          position="absolute"
          top="calc(50% + 18px)"
          left={{ base: 4, md: 8 }}
          transform="translateY(-50%)"
          zIndex={2}
        >
          <Link to="/gallery" style={{ textDecoration: 'none' }}>
            <Flex
              align="center"
              color="whiteAlpha.800"
              transition="all 0.3s"
              _hover={{ color: '#c9a96e' }}
              cursor="pointer"
              gap={2}
            >
              <ArrowBackIcon />
              <Text
                fontSize="xs"
                fontWeight="400"
                letterSpacing="0.15em"
                textTransform="uppercase"
              >
                Back
              </Text>
            </Flex>
          </Link>
        </Box>
      </Box>

      {/* Images Grid */}
      <Box py={{ base: 6, md: 10 }} px={{ base: 4, md: 12 }}>
        <GalleryGrid images={randomizedImages} category={category} />
      </Box>
    </Box>
  );
};

export default Gallery;
