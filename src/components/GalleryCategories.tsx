import { Box, Text, Link as ChakraLink, VStack, Flex } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const MotionDiv = motion.div;

const categories = [
  {
    name: 'portraits',
    title: 'Portraits',
    image: '/assets/photos/portraits/shadow-play-portrait.webp',
    link: '/gallery/portraits',
    backgroundPosition: 'center 50%'
  },
  {
    name: 'weddings',
    title: 'Weddings',
    image: '/assets/photos/weddings/newlyweds-running-sea.webp',
    link: '/gallery/weddings',
    backgroundPosition: 'center 25%'
  },
  {
    name: 'family',
    title: 'Family',
    image: '/assets/photos/family/elegant-family-studio-portrait-black.webp',
    link: '/gallery/family',
    backgroundPosition: 'center 40%'
  },
  {
    name: 'maternity',
    title: 'Maternity',
    image: '/assets/photos/maternity/couples-beach-baby-bump-moment.webp',
    link: '/gallery/maternity',
    backgroundPosition: 'center 35%'
  }
];

const GalleryCategories = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <Box ref={ref} layerStyle="sectionTight" px={{ base: 4, md: 8, lg: 12 }}>
      <MotionDiv
        initial={{ opacity: 0, y: 25 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <Flex
          direction={{ base: 'column', md: 'row' }}
          // Near-flush, deliberately. The reference the owner keeps citing
          // runs "minimal spacing between grid items, creating a dense,
          // compact presentation" — at 16/20px these read as four detached
          // cards; at 2px they read as one band of work.
          gap="2px"
          justify="center"
        >
          {categories.map((category, index) => (
            <ChakraLink
              as={Link}
              to={category.link}
              key={category.name}
              _hover={{ textDecoration: 'none' }}
              flex="1"
            >
              <MotionDiv
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, ease: "easeOut", delay: index * 0.1 }}
                style={{ height: '100%' }}
              >
                <Box
                  position="relative"
                  h={{ base: '250px', md: '65vh' }}
                  overflow="hidden"
                  cursor="pointer"
                  role="group"
                >
                  <Box
                    position="absolute"
                    inset={0}
                    backgroundImage={`url(${category.image})`}
                    backgroundSize="cover"
                    backgroundPosition={category.backgroundPosition}
                    transition="all 0.6s ease"
                    _groupHover={{ transform: 'scale(1.05)', filter: 'brightness(0.4)' }}
                    filter="brightness(0.6)"
                  />
                  <VStack
                    position="absolute"
                    inset={0}
                    justify="center"
                    align="center"
                    spacing={3}
                    zIndex={1}
                  >
                    {/* These tiles are 65vh panels, not cards in a grid — the
                        title carries the whole section, so it takes the
                        sectionTitle ramp. Colour is the only override.
                        The old hover animated letterSpacing 0.2em → 0.3em,
                        which interpolated straight through the tracking values
                        the label system is built on and left the type at a
                        value no token defines for the length of the
                        transition. The lift does the same job without
                        touching the type. */}
                    <Text
                      textStyle="sectionTitle"
                      color="white"
                      textAlign="center"
                      transition="transform 0.4s ease"
                      _groupHover={{ transform: 'translateY(-4px)' }}
                    >
                      {category.title}
                    </Text>
                    {/* 40px is the site's rule width (see PageHeader). It was
                        animating 30px → 50px, so the resting state matched
                        nothing and the "correct" width existed only mid-
                        transition. Fixed width, opacity does the hover. */}
                    <Box
                      w="40px"
                      h="1px"
                      bg="brand.accent"
                      opacity={0.8}
                      transition="opacity 0.4s ease"
                      _groupHover={{ opacity: 1 }}
                    />
                    <Text
                      textStyle="ctaLabel"
                      color="whiteAlpha.800"
                      opacity={0}
                      transform="translateY(5px)"
                      transition="all 0.4s ease"
                      _groupHover={{ opacity: 1, transform: 'translateY(0)' }}
                    >
                      View Gallery
                    </Text>
                  </VStack>
                </Box>
              </MotionDiv>
            </ChakraLink>
          ))}
        </Flex>
      </MotionDiv>
    </Box>
  );
};

export default GalleryCategories;
