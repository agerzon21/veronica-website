import { Box, Text, Link as ChakraLink, VStack, Flex } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const MotionDiv = motion.div;

const categories = [
  {
    name: 'portraits',
    title: 'Portraits',
    image: '/assets/photos/765456_mqaert.webp',
    link: '/gallery/portraits',
    backgroundPosition: 'center 50%'
  },
  {
    name: 'weddings',
    title: 'Weddings',
    image: '/assets/photos/05_rfvs8y.webp',
    link: '/gallery/weddings',
    backgroundPosition: 'center 25%'
  },
  {
    name: 'family',
    title: 'Family',
    image: '/assets/photos/_C6C16373_l2cnrk.webp',
    link: '/gallery/family',
    backgroundPosition: 'center 40%'
  },
  {
    name: 'maternity',
    title: 'Maternity',
    image: '/assets/photos/_C6C8862_b8za5r.webp',
    link: '/gallery/maternity',
    backgroundPosition: 'center 35%'
  }
];

const GalleryCategories = () => {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.1 });

  return (
    <Box ref={ref} py={{ base: 10, md: 16 }} px={{ base: 4, md: 8, lg: 12 }}>
      <MotionDiv
        initial={{ opacity: 0, y: 25 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <Flex
          direction={{ base: 'column', md: 'row' }}
          gap={{ base: 4, md: 5 }}
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
                    <Text
                      fontSize={{ base: 'xl', md: 'xl', lg: '2xl' }}
                      fontWeight="200"
                      color="white"
                      textTransform="uppercase"
                      letterSpacing="0.2em"
                      transition="all 0.4s ease"
                      _groupHover={{ letterSpacing: '0.3em' }}
                    >
                      {category.title}
                    </Text>
                    <Box
                      w="30px"
                      h="1px"
                      bg="#c9a96e"
                      transition="all 0.4s ease"
                      _groupHover={{ w: '50px' }}
                    />
                    <Text
                      fontSize="xs"
                      fontWeight="400"
                      color="whiteAlpha.700"
                      letterSpacing="0.15em"
                      textTransform="uppercase"
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
