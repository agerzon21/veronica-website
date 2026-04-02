import { Box, VStack, Text, Flex, Image } from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const MotionDiv = motion.div;

const About = () => {
  const heroRef = useRef<HTMLDivElement>(null);
  const isHeroInView = useInView(heroRef, { once: true, amount: 0.15 });
  const approachRef = useRef<HTMLDivElement>(null);
  const isApproachInView = useInView(approachRef, { once: true, amount: 0.15 });
  const storyRef = useRef<HTMLDivElement>(null);
  const isStoryInView = useInView(storyRef, { once: true, amount: 0.15 });

  return (
    <Box minH="100vh">
      <Helmet>
        <meta property="og:image" content="https://vero.photography/assets/photos/about-bg.webp" />
      </Helmet>
      {/* ─── Mobile: stacked hero ─── */}
      <Box display={{ base: 'block', lg: 'none' }}>
        <Box position="relative" h="60vh" overflow="hidden">
          <Image
            src="/assets/photos/about-bg.webp"
            alt="Veronika Gerzon — Photographer at work"
            objectFit="cover"
            objectPosition="center 0%"
            w="100%"
            h="100%"
          />
          <Box position="absolute" inset={0} bg="rgba(0,0,0,0.45)" />
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
                  About Me
                </Text>
                <Box w="35px" h="1px" bg="#c9a96e" />
                <Text
                  fontSize="2xl"
                  fontWeight="200"
                  color="white"
                  lineHeight="1.4"
                >
                  Creating images that feel as
                  <br />
                  natural as the moment itself.
                </Text>
              </VStack>
            </MotionDiv>
          </Flex>
        </Box>

        {/* Mobile: My Approach */}
        <Box bg="white" py={16} px={8}>
          <Flex justify="center">
            <Box maxW="600px" ref={approachRef}>
              <MotionDiv
                initial={{ opacity: 0, y: 25 }}
                animate={isApproachInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.8, ease: "easeOut" }}
              >
              <VStack spacing={6} textAlign="center">
                <Text
                  fontSize="xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.2em"
                  color="#c9a96e"
                >
                  My Approach
                </Text>
                <Box w="35px" h="1px" bg="#c9a96e" />
                <VStack spacing={4}>
                  <Text fontSize="sm" color="gray.500" lineHeight="2" fontWeight="300" textAlign="center">
                    Every session starts with understanding your vision. I believe the best photos come
                    from a comfortable, collaborative environment — not stiff poses or forced smiles.
                  </Text>
                  <Text fontSize="sm" color="gray.500" lineHeight="2" fontWeight="300" textAlign="center">
                    Whether it's a wedding, portrait, editorial, or commercial project, I focus on
                    capturing authentic moments and genuine emotion. My goal is for you to look at
                    your photos and feel exactly what you felt that day.
                  </Text>
                  <Text fontSize="sm" color="gray.500" lineHeight="2" fontWeight="300" textAlign="center">
                    I bring patience, attention to detail, and a dedication to making every client
                    feel confident and beautiful in front of the camera.
                  </Text>
                </VStack>
              </VStack>
              </MotionDiv>
            </Box>
          </Flex>
        </Box>
      </Box>

      {/* ─── Desktop: side-by-side photo + text ─── */}
      <Flex
        display={{ base: 'none', lg: 'flex' }}
        h="calc(100vh - 72px + 10vh)"
        direction="row"
      >
        {/* Left: photo with dark overlay */}
        <Box position="relative" w="55%" h="100%" overflow="hidden">
          <Image
            src="/assets/photos/about-bg.webp"
            alt="Veronika Gerzon — Photographer at work"
            objectFit="cover"
            objectPosition="center 70%"
            w="100%"
            h="100%"
          />
          <Box position="absolute" inset={0} bg="rgba(0,0,0,0.4)" />
          <Flex
            position="absolute"
            inset={0}
            align="center"
            justify="center"
            ref={heroRef}
          >
            <MotionDiv
              initial={{ opacity: 0, y: 20 }}
              animate={isHeroInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <VStack spacing={4} textAlign="center" px={10}>
                <Text
                  fontSize="xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.2em"
                  color="#c9a96e"
                >
                  About Me
                </Text>
                <Box w="35px" h="1px" bg="#c9a96e" />
                <Text
                  fontSize={{ lg: '3xl', xl: '4xl' }}
                  fontWeight="200"
                  color="white"
                  lineHeight="1.4"
                >
                  Creating images that feel as
                  <br />
                  natural as the moment itself.
                </Text>
              </VStack>
            </MotionDiv>
          </Flex>
        </Box>

        {/* Right: text content on white */}
        <Flex
          w="45%"
          h="100%"
          bg="white"
          align="center"
          justify="center"
          px={{ lg: 12, xl: 20 }}
        >
          <Box maxW="480px">
            <MotionDiv
              initial={{ opacity: 0, y: 25 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
            <VStack spacing={6} textAlign="center">
              <Text
                fontSize="xs"
                fontWeight="500"
                textTransform="uppercase"
                letterSpacing="0.2em"
                color="#c9a96e"
              >
                My Approach
              </Text>
              <Box w="35px" h="1px" bg="#c9a96e" />
              <VStack spacing={4}>
                <Text fontSize="sm" color="gray.500" lineHeight="2" fontWeight="300" textAlign="center">
                  Every session starts with understanding your vision. I believe the best photos come
                  from a comfortable, collaborative environment — not stiff poses or forced smiles.
                </Text>
                <Text fontSize="sm" color="gray.500" lineHeight="2" fontWeight="300" textAlign="center">
                  Whether it's a wedding, portrait, editorial, or commercial project, I focus on
                  capturing authentic moments and genuine emotion. My goal is for you to look at
                  your photos and feel exactly what you felt that day.
                </Text>
                <Text fontSize="sm" color="gray.500" lineHeight="2" fontWeight="300" textAlign="center">
                  I bring patience, attention to detail, and a dedication to making every client
                  feel confident and beautiful in front of the camera.
                </Text>
              </VStack>
            </VStack>
            </MotionDiv>
          </Box>
        </Flex>
      </Flex>

      {/* ─── A Unique Perspective — dark section ─── */}
      <Box
        bg="gray.900"
        py={{ base: 20, md: 24 }}
        px={{ base: 8, md: 12 }}
      >
        <Flex justify="center">
          <Box maxW="600px" ref={storyRef}>
            <MotionDiv
              initial={{ opacity: 0, y: 25 }}
              animate={isStoryInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <Text
                fontSize="xs"
                fontWeight="500"
                textTransform="uppercase"
                letterSpacing="0.2em"
                color="#c9a96e"
                mb={4}
                textAlign="center"
              >
                A Unique Perspective
              </Text>

              <Box w="35px" h="1px" bg="#c9a96e" mx="auto" mb={8} />

              <Text
                fontSize={{ base: 'lg', md: 'xl' }}
                fontWeight="200"
                color="white"
                textAlign="center"
                lineHeight="2"
                fontStyle="italic"
                mb={6}
              >
                "Having been on both sides of the camera gives me
                an understanding that most photographers simply don't have."
              </Text>

              <VStack spacing={4}>
                <Text fontSize="sm" color="whiteAlpha.600" lineHeight="2" fontWeight="300" textAlign="center">
                  Before picking up a camera, I spent years working as a model. That experience
                  taught me how it feels to be directed, what makes a subject comfortable, and
                  how small adjustments in posing and light can completely transform an image.
                </Text>
                <Text fontSize="sm" color="whiteAlpha.600" lineHeight="2" fontWeight="300" textAlign="center">
                  This dual perspective is my edge — I know how to guide you naturally because
                  I've been in your shoes. The result is photography that feels effortless, authentic,
                  and truly you.
                </Text>
              </VStack>
            </MotionDiv>
          </Box>
        </Flex>
      </Box>

      {/* ─── Details bar ─── */}
      <Box bg="white" py={{ base: 14, md: 16 }}>
        <Flex
          justify="center"
          gap={{ base: 10, md: 20 }}
          direction={{ base: 'column', md: 'row' }}
          align="center"
          px={8}
        >
          {[
            { label: 'Based in', value: 'Scranton, PA' },
            { label: 'Experience', value: '12+ Years' },
            { label: 'Available', value: 'Worldwide' },
          ].map((stat) => (
            <VStack key={stat.label} spacing={1.5}>
              <Text
                fontSize="10px"
                fontWeight="500"
                textTransform="uppercase"
                letterSpacing="0.2em"
                color="#c9a96e"
              >
                {stat.label}
              </Text>
              <Text
                fontSize="md"
                fontWeight="200"
                color="gray.700"
                letterSpacing="0.05em"
              >
                {stat.value}
              </Text>
            </VStack>
          ))}
        </Flex>
      </Box>
    </Box>
  );
};

export default About;
