import { Box, VStack, Text, HStack, useColorModeValue, Container } from '@chakra-ui/react';
import { motion, useScroll, useInView } from 'framer-motion';
import { useRef } from 'react';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { keyframes } from '@emotion/react';

const scrollAnimation = keyframes`
  0% { transform: translateY(0); opacity: 1; }
  50% { transform: translateY(10px); opacity: 0.7; }
  100% { transform: translateY(0); opacity: 1; }
`;

const About = () => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const textColor = useColorModeValue('gray.600', 'gray.300');
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const rightColumnRef = useRef<HTMLDivElement>(null);
  const isLeftInView = useInView(leftColumnRef, { 
    margin: "-100px",
    once: true
  });
  const isRightInView = useInView(rightColumnRef, { 
    margin: "-100px",
    once: true
  });

  const { scrollY } = useScroll();

  return (
    <Box position="relative" minH="100vh">
      {/* Background wrapper */}
      <Box
        position="fixed"
        top={0}
        left={0}
        right={0}
        height="100vh"
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
          backgroundImage="url('https://res.cloudinary.com/doj1fanx3/image/upload/v1744340476/%D0%A4%D0%BE%D1%82%D0%BE_%D0%A2%D0%A4%D0%9F_%D0%9B%D0%B8%D0%B7%D0%B0_1491_apmb9t.jpg')"
          backgroundSize="cover"
          backgroundPosition="center"
          backgroundAttachment="fixed"
          filter="brightness(0.7)"
        />

        {/* Gradient Overlay */}
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bgGradient="linear(to-b, blackAlpha.600, blackAlpha.800)"
          opacity={0.8}
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
          <VStack spacing={8} maxW="800px" px={8} textAlign="center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.2 }}
            >
              <Text
                fontSize={{ base: '4xl', md: '6xl', lg: '7xl' }}
                fontWeight="light"
                color="white"
                textTransform="uppercase"
                letterSpacing="wider"
                textShadow="2px 2px 4px rgba(0,0,0,0.3)"
              >
                Veronica
              </Text>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.4 }}
            >
              <Text
                fontSize={{ base: 'xl', md: '2xl' }}
                color="white"
                fontStyle="italic"
                textShadow="1px 1px 2px rgba(0,0,0,0.3)"
              >
                Through the lens of both model and photographer
              </Text>
            </motion.div>
          </VStack>
          
          {/* Scroll Indicator */}
          <Box
            position="absolute"
            bottom="140px"
            left="0"
            right="0"
            display="flex"
            flexDirection="column"
            alignItems="center"
            animation={`${scrollAnimation} 2s ease-in-out infinite`}
            zIndex={3}
          >
            <Text color="white" fontSize="sm" mb={3} textShadow="1px 1px 2px rgba(0,0,0,0.5)">
              Scroll to explore
            </Text>
            <ChevronDownIcon color="white" boxSize={8} filter="drop-shadow(1px 1px 2px rgba(0,0,0,0.5))" />
          </Box>
        </Box>
      </Box>

      {/* Content Section */}
      <Box 
        position="relative" 
        bg={bgColor}
        marginTop="87vh"
        borderTopRadius="3xl"
        zIndex={2}
        boxShadow="0px -10px 30px rgba(0,0,0,0.2)"
        minH="100vh"
        pb={20}
      >
        <Container maxW="1200px" py={20}>
          <HStack spacing={12} align="start" direction={{ base: 'column', md: 'row' }}>
            <Box
              ref={leftColumnRef}
              style={{ flex: 1, width: '100%' }}
              sx={{
                '@media (min-width: 768px)': {
                  opacity: isLeftInView ? 1 : 0,
                  transform: isLeftInView ? 'translateX(0)' : 'translateX(-100px)',
                  transition: 'opacity 0.6s, transform 0.6s',
                }
              }}
            >
              <Box>
                <Text
                  fontSize={{ base: '2xl', md: '3xl' }}
                  fontWeight="light"
                  mb={8}
                  textTransform="uppercase"
                  position="relative"
                  _after={{
                    content: '""',
                    position: 'absolute',
                    bottom: '-10px',
                    left: '0',
                    width: '60px',
                    height: '2px',
                    bg: 'currentColor',
                  }}
                >
                  About Me
                </Text>
                <Text
                  fontSize={{ base: 'md', md: 'lg' }}
                  color={textColor}
                  lineHeight="tall"
                >
                  As both a model and photographer, I bring a unique perspective to every project. 
                  Having experienced both sides of the camera, I understand the nuances of creating 
                  powerful imagery that tells a story.
                </Text>
                <Text
                  fontSize={{ base: 'md', md: 'lg' }}
                  color={textColor}
                  lineHeight="tall"
                  mt={6}
                >
                  My journey in photography began through my experiences as a model, where I developed 
                  a deep appreciation for the art of capturing moments. This dual perspective allows 
                  me to create images that are not just technically proficient, but emotionally resonant.
                </Text>
                <Text
                  fontSize={{ base: 'md', md: 'lg' }}
                  color={textColor}
                  lineHeight="tall"
                  mt={6}
                >
                  Whether I'm behind the lens or in front of it, my goal is always the same: to create 
                  authentic, compelling imagery that captures the essence of the moment and the beauty 
                  of the subject.
                </Text>
              </Box>
            </Box>

            <Box
              ref={rightColumnRef}
              style={{ flex: 1, width: '100%' }}
              sx={{
                '@media (min-width: 768px)': {
                  opacity: isRightInView ? 1 : 0,
                  transform: isRightInView ? 'translateX(0)' : 'translateX(100px)',
                  transition: 'opacity 0.6s, transform 0.6s',
                }
              }}
            >
              <Box>
                <Text
                  fontSize={{ base: '2xl', md: '3xl' }}
                  fontWeight="light"
                  mb={8}
                  textTransform="uppercase"
                  position="relative"
                  _after={{
                    content: '""',
                    position: 'absolute',
                    bottom: '-10px',
                    left: '0',
                    width: '60px',
                    height: '2px',
                    bg: 'currentColor',
                  }}
                >
                  My Approach
                </Text>
                <Text
                  fontSize={{ base: 'md', md: 'lg' }}
                  color={textColor}
                  lineHeight="tall"
                >
                  I believe in creating a comfortable, collaborative environment where creativity 
                  can flourish. My experience as a model helps me guide my subjects to their most 
                  authentic selves, while my technical expertise ensures we capture those moments 
                  perfectly.
                </Text>
                <Text
                  fontSize={{ base: 'md', md: 'lg' }}
                  color={textColor}
                  lineHeight="tall"
                  mt={6}
                >
                  Every shoot is a unique journey, and I'm passionate about helping my clients 
                  discover their vision and bring it to life. Whether it's a fashion editorial, 
                  portrait session, or commercial project, I bring the same level of dedication 
                  and artistry to every assignment.
                </Text>
              </Box>
            </Box>
          </HStack>
        </Container>
      </Box>
    </Box>
  );
};

export default About; 