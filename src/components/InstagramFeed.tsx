import { Box, VStack, Text } from '@chakra-ui/react';

const InstagramFeed = () => {
  return (
    <Box py={{ base: 14, md: 16 }} px={4} bg="white">
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
            maxWidth: { base: '650px', md: '1300px' },
          },
          // Chakra's `md` breakpoint is width-only, so landscape phones (wide
          // but very short) were getting the 1050px iframe on a ~393px
          // viewport — Instagram's actual content only fills ~400-500px, so
          // the rest was a huge blank space before Google Reviews. Cap the
          // iframe to viewport height on short screens only, leaving portrait
          // and desktop sizing untouched.
          '@media (max-height: 500px)': {
            'iframe': {
              height: 'calc(100vh - 40px)',
            },
          },
        }}
      >
        <Box
          as="iframe"
          src="https://www.instagram.com/vero.art.photo/embed"
          width="100%"
          height="100%"
          scrolling="no"
        />
      </Box>
    </Box>
  );
};

export default InstagramFeed;
