import { Box, Text, Flex, VStack, HStack } from '@chakra-ui/react';
import { motion } from 'framer-motion';

const MotionBox = motion(Box);
const MotionText = motion(Text);

const StatsSection = () => {
  return (
    <Box 
      bg="white" 
      py={12}
      px={4}
      position="relative"
    >
      <Flex
        maxW="1200px"
        mx="auto"
        direction={{ base: 'column', md: 'row' }}
        justify="space-between"
        align="center"
        gap={12}
      >
        <VStack 
          align={{ base: 'center', md: 'flex-start' }}
          spacing={4}
          flex={1}
          position="relative"
        >
          <Box
            position="absolute"
            left="-40px"
            top="50%"
            transform="translateY(-50%)"
            width="1px"
            height="100px"
            bg="gray.200"
            display={{ base: 'none', md: 'block' }}
          />
          
          <MotionBox
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Text
              fontSize={{ base: '2xl', md: '3xl', lg: '4xl' }}
              fontWeight="light"
              textTransform="uppercase"
              letterSpacing="widest"
              color="gray.800"
            >
              VERONIKA GERZON
            </Text>
          </MotionBox>
          
          <MotionBox
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <Text
              fontSize={{ base: 'lg', md: 'xl' }}
              color="gray.600"
              fontStyle="italic"
              letterSpacing="wide"
            >
              Wedding & Portrait Photographer
            </Text>
          </MotionBox>
        </VStack>

        <HStack 
          spacing={8} 
          align="flex-start"
          flex={1}
          justify={{ base: 'center', md: 'flex-end' }}
          wrap="wrap"
        >
          <VStack align="flex-start" spacing={2}>
            <MotionText
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.4 }}
              fontWeight="medium"
              fontSize="xs"
              letterSpacing="widest"
              color="gray.500"
              textTransform="uppercase"
            >
              BASED IN
            </MotionText>
            <MotionText
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.5 }}
              color="gray.700"
              fontSize="sm"
              letterSpacing="wide"
            >
              Scranton, Pennsylvania, USA
            </MotionText>
          </VStack>

          <VStack align="flex-start" spacing={2}>
            <MotionText
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.6 }}
              fontWeight="medium"
              fontSize="xs"
              letterSpacing="widest"
              color="gray.500"
              textTransform="uppercase"
            >
              AVAILABLE FOR
            </MotionText>
            <MotionText
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.7 }}
              color="gray.700"
              fontSize="sm"
              letterSpacing="wide"
            >
              Worldwide Travel
            </MotionText>
          </VStack>

          <VStack align="flex-start" spacing={2}>
            <MotionText
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.8 }}
              fontWeight="medium"
              fontSize="xs"
              letterSpacing="widest"
              color="gray.500"
              textTransform="uppercase"
            >
              EXPERIENCE
            </MotionText>
            <MotionText
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.9 }}
              color="gray.700"
              fontSize="sm"
              letterSpacing="wide"
            >
              12+ Years of Excellence
            </MotionText>
          </VStack>
        </HStack>
      </Flex>
    </Box>
  );
};

export default StatsSection; 