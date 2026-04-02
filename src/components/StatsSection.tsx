import { Box, Text, Flex, VStack } from '@chakra-ui/react';
import { motion } from 'framer-motion';

const MotionDiv = motion.div;

const StatsSection = () => {
  return (
    <Box bg="white" py={{ base: 14, md: 16 }} px={8}>
      <MotionDiv
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <VStack spacing={6} mb={10}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.2em"
            color="#c9a96e"
          >
            Veronika Gerzon
          </Text>
          <Box w="35px" h="1px" bg="#c9a96e" />
          <Text
            fontSize={{ base: 'lg', md: 'xl' }}
            fontWeight="200"
            color="gray.500"
            fontStyle="italic"
            letterSpacing="wide"
          >
            Wedding & Portrait Photographer
          </Text>
        </VStack>

        <Flex
          justify="center"
          gap={{ base: 10, md: 20 }}
          direction="row"
          align="center"
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
      </MotionDiv>
    </Box>
  );
};

export default StatsSection;
