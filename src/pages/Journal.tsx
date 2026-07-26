import { Box, VStack, Text, Icon, Flex } from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import { FaBookOpen } from 'react-icons/fa';
import CTAButton from '../components/ui/CTAButton';

/**
 * Journal — Vero's weekly-ish long-form recaps of recent photoshoots
 * (10-15 photos + narrative description). Currently a placeholder;
 * the full implementation will land in follow-up commits. This route
 * exists now so we can:
 *   - Reserve the URL for future SEO
 *   - Give admin a target to publish drafts against
 *   - Show visitors "hey, journal is coming"
 *
 * The DB schema is already in place (see db/migrations/004-journal-posts.sql).
 * Once the admin editor + list/detail views land, this page will
 * render the actual published posts.
 */

const Journal = () => {
  return (
    <>
      <Helmet>
        <title>Journal | Vero Photography</title>
        <meta
          name="description"
          content="Weekly-ish recaps from behind the lens — recent portrait, wedding, family, and maternity sessions with the stories that made them."
        />
        {/* No index yet — the section is a placeholder. Flip to
            index once real content is here so Google doesn't
            surface an empty page. */}
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <Box bg="white" minH="100vh" pt={{ base: 20, md: 28 }} pb={{ base: 20, md: 28 }} px={4}>
        <VStack maxW="620px" mx="auto" spacing={6} textAlign="center">
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.3em"
            color="#c9a96e"
          >
            Journal
          </Text>
          <Box w="40px" h="1px" bg="#c9a96e" />

          <Flex
            w="72px"
            h="72px"
            borderRadius="full"
            bg="#fdf9f0"
            border="1px solid"
            borderColor="#e8d9a8"
            align="center"
            justify="center"
            color="#c9a96e"
          >
            <Icon as={FaBookOpen} boxSize={7} />
          </Flex>

          <Text
            as="h1"
            fontSize={{ base: '2xl', md: '4xl' }}
            fontWeight="200"
            color="gray.800"
            letterSpacing="0.02em"
            lineHeight="1.2"
            m={0}
          >
            The journal is on its way
          </Text>

          <Text
            fontSize={{ base: 'sm', md: 'md' }}
            color="gray.600"
            fontWeight="300"
            lineHeight="1.8"
            maxW="500px"
          >
            Weekly recaps from behind the lens — recent sessions with
            the stories, favorite frames, and small moments that made
            them. New entries land here soon.
          </Text>

          <Box pt={4}>
            <CTAButton to="/gallery" variant="outline" size="md">
              Browse the Gallery
            </CTAButton>
          </Box>
        </VStack>
      </Box>
    </>
  );
};

export default Journal;
