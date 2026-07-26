import { Box, VStack, HStack, Text, Flex, Icon } from '@chakra-ui/react';
import { FaBookOpen, FaExternalLinkAlt } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';

/**
 * The "Journal" tab in /admin. Currently a placeholder / spec card.
 *
 * The DB schema (db/migrations/004-journal-posts.sql) is already
 * defined so the full build can proceed in follow-up commits. This
 * component gets replaced with a real post list + editor once the
 * CRUD endpoints and rich-text editor land.
 *
 * Available to BOTH admin and super-admin — journal editing is a
 * Vero-facing task, not a Alex-only infrastructure one.
 */

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  adminPassword: string;
}

const AdminJournal = ({ adminPassword: _adminPassword }: Props) => {
  return (
    <Box maxW="1200px" mx="auto">
      <VStack align="flex-start" spacing={1} mb={8}>
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="#c9a96e"
        >
          Admin
        </Text>
        <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
          Journal
        </Text>
        <Text fontSize="sm" color="gray.500" fontWeight="300">
          Weekly recap posts — photoshoot stories that live on the site forever.
        </Text>
      </VStack>

      <Box
        bg="white"
        border="1px solid"
        borderColor="gray.200"
        borderRadius="sm"
        p={{ base: 6, md: 8 }}
        maxW="720px"
      >
        <Flex align="center" gap={4} mb={5}>
          <Flex
            w="56px"
            h="56px"
            borderRadius="sm"
            bg="#fdf9f0"
            border="1px solid"
            borderColor="#e8d9a8"
            align="center"
            justify="center"
            color="#c9a96e"
            flexShrink={0}
          >
            <Icon as={FaBookOpen} boxSize={6} />
          </Flex>
          <VStack align="flex-start" spacing={0.5}>
            <Text
              fontSize="2xs"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.22em"
              color="#c9a96e"
            >
              Coming soon
            </Text>
            <Text fontSize="md" fontWeight="500" color="gray.800">
              Journal editor + post list
            </Text>
          </VStack>
        </Flex>

        <Text fontSize="sm" color="gray.700" fontWeight="300" lineHeight="1.8" mb={5}>
          The Journal section replaces the weekly Google Business Profile
          post workflow with something we own end-to-end — write once
          here, publish to <Text as="code" fontSize="xs" bg="gray.100" px={1.5} py={0.5} borderRadius="sm">vero.photography/journal</Text>,
          and (once approved) syndicate the same post to your Google
          Business Profile automatically.
        </Text>

        <Box bg="gray.50" border="1px solid" borderColor="gray.200" borderRadius="sm" p={4} mb={5}>
          <Text
            fontSize="2xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.2em"
            color="gray.500"
            mb={3}
          >
            What&rsquo;s in scope
          </Text>
          <VStack align="stretch" spacing={2}>
            <BulletRow>
              <strong>Post editor</strong> — title, description, cover
              image, ordered gallery of 10–15 photos, tags, publish/draft
              toggle
            </BulletRow>
            <BulletRow>
              <strong>Public /journal page</strong> — timeline of
              published posts, card previews, filter by session type
            </BulletRow>
            <BulletRow>
              <strong>Individual post pages</strong> — full narrative +
              photo grid + SEO metadata (title, description, og:image)
            </BulletRow>
            <BulletRow>
              <strong>Later: GBP syndication</strong> — one-click
              copy-for-GBP button while we wait on Google API access;
              full auto-post once approved
            </BulletRow>
          </VStack>
        </Box>

        <HStack spacing={3} wrap="wrap">
          <CTAButton
            href="/journal"
            newTab
            icon={FaExternalLinkAlt}
            variant="outline"
            size="sm"
          >
            View placeholder page
          </CTAButton>
        </HStack>

        <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.6" mt={6} pt={5} borderTop="1px solid" borderColor="gray.100">
          Schema deployed:{' '}
          <Text as="code" fontSize="2xs" bg="gray.100" px={1.5} py={0.5} borderRadius="sm">
            db/migrations/004-journal-posts.sql
          </Text>
          . Editor + API endpoints land in the next iteration.
        </Text>
      </Box>
    </Box>
  );
};

function BulletRow({ children }: { children: React.ReactNode }) {
  return (
    <HStack align="flex-start" spacing={2}>
      <Box
        as="span"
        w="4px"
        h="4px"
        borderRadius="full"
        bg="#c9a96e"
        mt={2}
        flexShrink={0}
      />
      <Text fontSize="sm" color="gray.700" fontWeight="300" lineHeight="1.7">
        {children}
      </Text>
    </HStack>
  );
}

export default AdminJournal;
