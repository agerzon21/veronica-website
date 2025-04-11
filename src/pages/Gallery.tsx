import { useState, useRef } from 'react';
import { Box, SimpleGrid, Image, Spinner, Text, useDisclosure, Container, VStack, HStack, useColorModeValue } from '@chakra-ui/react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { useCloudinaryImages } from '../hooks/useCloudinaryImages';
import PageContainer from '../components/PageContainer';
import ImageModal from '../components/ImageModal';
import { ChevronDownIcon } from '@chakra-ui/icons';
import { keyframes } from '@emotion/react';

const Gallery = () => {
  const { images, loading, error } = useCloudinaryImages('gallery');
  const [selectedImage, setSelectedImage] = useState<{ name: string; url: string } | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 80%", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], ['0%', '25%']);

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

  if (loading) {
    return (
      <PageContainer textAlign="center">
        <Spinner size="xl" thickness="4px" speed="0.65s" color="gray.500" />
        <Text textStyle="body" mt={4}>Loading images...</Text>
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer textAlign="center">
        <Text textStyle="body" color="red.500">{error}</Text>
      </PageContainer>
    );
  }

  if (images.length === 0) {
    return (
      <PageContainer textAlign="center">
        <Text textStyle="body">No images found</Text>
      </PageContainer>
    );
  }

  const handleImageClick = (image: { name: string; url: string }) => {
    setSelectedImage(image);
    onOpen();
  };

  return (
    <Box position="relative" minH="100vh">
      {/* Hero Section */}
      <Box
        position="relative"
        height="60vh"
        overflow="hidden"
      >
        <motion.div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            y,
            backgroundImage: `url(${images[0]?.url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'brightness(0.7) contrast(1.1)',
            willChange: 'transform'
          }}
        />
        <Box
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bgGradient="linear(to-b, blackAlpha.600, blackAlpha.800)"
          opacity={0.8}
        />
        <Container
          position="relative"
          height="100%"
          display="flex"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          zIndex={1}
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
          >
            <Text
              fontSize={{ base: '4xl', md: '6xl', lg: '7xl' }}
              fontWeight="light"
              color="white"
              textTransform="uppercase"
              letterSpacing="wider"
              textShadow="2px 2px 4px rgba(0,0,0,0.3)"
              textAlign="center"
            >
              Gallery
            </Text>
            <Text
              fontSize={{ base: 'lg', md: 'xl' }}
              color="white"
              textAlign="center"
              maxW="600px"
              mx="auto"
              mt={4}
              textShadow="1px 1px 2px rgba(0,0,0,0.3)"
            >
              A collection of my recent work
            </Text>
          </motion.div>
        </Container>
      </Box>

      {/* Gallery Grid */}
      <Box
        ref={ref}
        position="relative"
        bg="white"
        mt={-20}
        borderTopRadius="3xl"
        zIndex={2}
        boxShadow="0px -10px 30px rgba(0,0,0,0.2)"
        pb={20}
      >
        <Container maxW="container.xl" py={20}>
          <SimpleGrid 
            columns={{ base: 1, md: 2, lg: 3 }} 
            spacing={8}
          >
            {images.map((image) => (
              <motion.div
                key={image.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                viewport={{ once: true }}
              >
                <Box
                  overflow="hidden"
                  borderRadius="xl"
                  boxShadow="xl"
                  transition="all 0.3s ease"
                  _hover={{ 
                    transform: 'scale(1.02)',
                    cursor: 'pointer',
                    boxShadow: '2xl'
                  }}
                  onClick={() => handleImageClick(image)}
                >
                  <Image
                    src={image.url}
                    alt={image.name}
                    w="100%"
                    h={{ base: "300px", md: "400px" }}
                    objectFit="cover"
                    transition="transform 0.3s ease"
                    loading="lazy"
                    _hover={{
                      transform: 'scale(1.1)'
                    }}
                  />
                </Box>
              </motion.div>
            ))}
          </SimpleGrid>
        </Container>
      </Box>

      {selectedImage && (
        <ImageModal
          isOpen={isOpen}
          onClose={onClose}
          imageUrl={selectedImage.url}
          imageAlt={selectedImage.name}
        />
      )}
    </Box>
  );
};

export default Gallery; 