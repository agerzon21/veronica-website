import { Box, VStack, Text, HStack, useColorModeValue, Container } from '@chakra-ui/react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';
import PageHeader from '../components/PageHeader';
import PageContainer from '../components/PageContainer';

const About = () => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const textColor = useColorModeValue('gray.600', 'gray.300');
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('down');
  const [lastScrollY, setLastScrollY] = useState(0);

  const { scrollY } = useScroll();

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      setScrollDirection(currentScrollY > lastScrollY ? 'down' : 'up');
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  return (
    <Box position="relative" minH="100vh" bg={bgColor}>
      <Box position="relative" h="100vh" w="100%" overflow="hidden">
        {/* Hero Image with Parallax */}
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundImage="url('https://res.cloudinary.com/doj1fanx3/image/upload/v1744340476/%D0%A4%D0%BE%D1%82%D0%BE_%D0%A2%D0%A4%D0%9F_%D0%9B%D0%B8%D0%B7%D0%B0_1491_apmb9t.jpg')"
          backgroundSize="cover"
          backgroundPosition="center"
          filter="brightness(0.7)"
          style={{
            transform: `translateY(${scrollY.get() * 0.5}px)`,
            transition: 'transform 0.1s ease-out',
          }}
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
        
        {/* Overlay Content */}
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
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
        </Box>
      </Box>

      {/* Content Section */}
      <Box py={20} position="relative" ref={contentRef} bg={bgColor} minH="100vh">
        <Container maxW="1200px" position="relative">
          <HStack spacing={12} align="start">
            <motion.div
              initial={{ opacity: 0, x: -100 }}
              whileInView={{ 
                opacity: scrollDirection === 'down' ? 1 : 0, 
                x: scrollDirection === 'down' ? 0 : -100,
                transition: { duration: 0.4 }
              }}
              viewport={{ once: false, margin: "-100px" }}
              style={{ flex: 1, width: '100%' }}
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
                <VStack spacing={6} align="start">
                  <Text fontSize="lg" color={textColor} lineHeight="tall">
                    As both a model and photographer, I bring a unique perspective to every project. 
                    Having experienced both sides of the camera, I understand the nuances of creating 
                    powerful imagery that tells a story.
                  </Text>
                  <Text fontSize="lg" color={textColor} lineHeight="tall">
                    My journey in photography began through my experiences as a model, where I developed 
                    a deep appreciation for the art of capturing moments. This dual perspective allows 
                    me to create images that are not just technically proficient, but emotionally resonant.
                  </Text>
                  <Text fontSize="lg" color={textColor} lineHeight="tall">
                    Whether I'm behind the lens or in front of it, my goal is always the same: to create 
                    authentic, compelling imagery that captures the essence of the moment and the beauty 
                    of the subject.
                  </Text>
                </VStack>
              </Box>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0, x: 100 }}
              whileInView={{ 
                opacity: scrollDirection === 'down' ? 1 : 0, 
                x: scrollDirection === 'down' ? 0 : 100,
                transition: { duration: 0.4 }
              }}
              viewport={{ once: false, margin: "-100px" }}
              style={{ flex: 1, width: '100%' }}
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
                <VStack spacing={6} align="start">
                  <Text fontSize="lg" color={textColor} lineHeight="tall">
                    I believe in creating a comfortable, collaborative environment where creativity 
                    can flourish. My experience as a model helps me guide my subjects to their most 
                    authentic selves, while my technical expertise ensures we capture those moments 
                    perfectly.
                  </Text>
                  <Text fontSize="lg" color={textColor} lineHeight="tall">
                    Every shoot is a unique journey, and I'm passionate about helping my clients 
                    discover their vision and bring it to life. Whether it's a fashion editorial, 
                    portrait session, or commercial project, I bring the same level of dedication 
                    and artistry to every assignment.
                  </Text>
                </VStack>
              </Box>
            </motion.div>
          </HStack>
        </Container>
      </Box>
    </Box>
  );
};

export default About; 