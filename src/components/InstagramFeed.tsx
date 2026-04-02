import { Box, VStack, Text } from '@chakra-ui/react';

const InstagramFeed = () => {
  return (
    <Box py={16} px={4} bg="white">
      <VStack spacing={6} mb={12}>
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.2em"
          color="#c9a96e"
        >
          Follow Along
        </Text>
        <Box w="35px" h="1px" bg="#c9a96e" />
        <Text
          fontSize={{ base: 'xl', md: '2xl' }}
          fontWeight="200"
          color="gray.700"
        >
          Latest on Instagram
        </Text>
      </VStack>

      <Box
        maxW="1200px"
        mx="auto"
        display="flex"
        justifyContent="center"
        sx={{
          'iframe': {
            border: 'none',
            height: { base: '500px', md: '1050px' },
            width: '100%',
            maxWidth: { base: '650px', md: '1300px' }
          }
        }}
      >
        <Box
          as="iframe"
          src="https://www.instagram.com/vero.art.photo/embed"
          width="100%"
          height="100%"
          scrolling="no"
          allowTransparency={true}
        />
      </Box>
    </Box>
  );
};

export default InstagramFeed;
