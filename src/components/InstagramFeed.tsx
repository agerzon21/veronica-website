import { Box, VStack, Text } from '@chakra-ui/react';

const InstagramFeed = () => {
  return (
    <Box py={16} px={4} bg="white">
      <VStack spacing={8} mb={12}>
        <Text
          fontSize={{ base: '2xl', md: '3xl', lg: '4xl' }}
          fontWeight="light"
          textTransform="uppercase"
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
            borderRadius: 'lg',
            boxShadow: 'lg',
          }
        }}
      >
        <Box
          as="iframe"
          src="https://www.instagram.com/vero.kz/embed"
          width="100%"
          height="1025px"
          scrolling="no"
          allowTransparency={true}
        />
      </Box>
    </Box>
  );
};

export default InstagramFeed; 