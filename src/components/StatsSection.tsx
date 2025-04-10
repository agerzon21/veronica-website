import { Box, Text, Flex, VStack, HStack } from '@chakra-ui/react';

const StatsSection = () => {
  return (
    <Box 
      bg="white" 
      py={12}
      px={4}
    >
      <Flex
        maxW="1200px"
        mx="auto"
        direction={{ base: 'column', md: 'row' }}
        justify="space-between"
        align="center"
        gap={8}
      >
        <VStack 
          align={{ base: 'center', md: 'flex-start' }}
          spacing={4}
          flex={1}
        >
          <Text
            fontSize={{ base: '2xl', md: '3xl', lg: '4xl' }}
            fontWeight="light"
            textTransform="uppercase"
          >
            VERONICA POLBINA
          </Text>
          <Text
            fontSize={{ base: 'md', md: 'lg' }}
            color="gray.600"
          >
            Wedding & Portrait Photographer
          </Text>
        </VStack>

        <HStack 
          spacing={8} 
          align="flex-start"
          flex={1}
          justify={{ base: 'center', md: 'flex-end' }}
          wrap="wrap"
        >
          <VStack align="flex-start" spacing={1}>
            <Text fontWeight="bold">BASED IN</Text>
            <Text color="gray.600">Punta Cana, Dominican Republic</Text>
          </VStack>
          <VStack align="flex-start" spacing={1}>
            <Text fontWeight="bold">AVAILABLE FOR</Text>
            <Text color="gray.600">Worldwide Travel</Text>
          </VStack>
        </HStack>
      </Flex>
    </Box>
  );
};

export default StatsSection; 