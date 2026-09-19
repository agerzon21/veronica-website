import { Box, Text, Link as ChakraLink, VStack, Flex } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import Reveal, { useReveal } from './ui/Reveal';

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
  // One observer for all five reveals, on the same Box it has always watched.
  // The four cards have to arrive as one staggered run; giving each its own
  // observer would start them separately as they scrolled past and turn the
  // stagger into five unrelated fades.
  const { ref, shown } = useReveal({ amount: 0.1 });

  return (
    <Box ref={ref} layerStyle="sectionTight" px={{ base: 4, md: 8, lg: 12 }}>
      <Reveal shown={shown} from={{ opacity: 0, y: 25 }} duration={0.8}>
        <Flex
          direction={{ base: 'column', md: 'row' }}
          // Near-flush, deliberately. The reference the owner keeps citing
          // runs "minimal spacing between grid items, creating a dense,
          // compact presentation" — at 16/20px these read as four detached
          // cards; at 2px they read as one band of work.
          gap={{ base: 2, md: 3 }}
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
              <Reveal
                shown={shown}
                from={{ opacity: 0, y: 20 }}
                duration={0.6}
                delay={index * 0.1}
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
                      // Touch never fires hover, so on a phone this tile
                      // showed a name and a rule with nothing saying it was a
                      // link. Drawn at rest where hover is unavailable.
                      sx={{
                        '@media (hover: none)': {
                          opacity: 1,
                          transform: 'translateY(0)',
                        },
                      }}
                    >
                      View Gallery
                    </Text>
                  </VStack>
                </Box>
              </Reveal>
            </ChakraLink>
          ))}
        </Flex>
      </Reveal>
    </Box>
  );
};

export default GalleryCategories;
