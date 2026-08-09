import { Box, Flex, HStack, Text, Icon, VStack } from '@chakra-ui/react';
import { useState } from 'react';
import { FaComments, FaDatabase } from 'react-icons/fa';
import AdminAssistantChat from './AdminAssistantChat';
import AdminAssistantData from './AdminAssistantData';

/**
 * "Assistant" tab in /admin — two internal sub-tabs:
 *   1. Chat  — Vero talks to her AI business assistant in Russian.
 *              The assistant reads + writes the ai_context knowledge
 *              base via tool calls, so shaping the customer-facing
 *              reply engine becomes a conversation instead of a
 *              spreadsheet.
 *   2. Data  — the underlying facts, in a card view with search +
 *              inline editing. Useful for quick browsing / manual
 *              cleanup / seeing what the chatbot recently added.
 *
 * The chat is the primary experience; data is the escape hatch.
 * Landing on the Chat tab by default is deliberate.
 */

interface Props {
  adminPassword: string;
}

type SubTab = 'chat' | 'data';

const AdminAssistant = ({ adminPassword }: Props) => {
  const [subTab, setSubTab] = useState<SubTab>('chat');

  return (
    <Box maxW="1200px" mx="auto">
      {/* Tab header */}
      <VStack align="flex-start" spacing={1} mb={4}>
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
          Assistant
        </Text>
        <Text fontSize="sm" color="gray.500" fontWeight="300">
          Talk to your personal AI, or browse what it knows.
        </Text>
      </VStack>

      {/* Sub-tab strip */}
      <Flex borderBottom="1px solid" borderColor="gray.200" mb={6} gap={1}>
        <SubTabButton
          active={subTab === 'chat'}
          icon={FaComments}
          label="Chat"
          onClick={() => setSubTab('chat')}
        />
        <SubTabButton
          active={subTab === 'data'}
          icon={FaDatabase}
          label="Data"
          onClick={() => setSubTab('data')}
        />
      </Flex>

      {subTab === 'chat' ? (
        <AdminAssistantChat adminPassword={adminPassword} />
      ) : (
        <AdminAssistantData adminPassword={adminPassword} />
      )}
    </Box>
  );
};

function SubTabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof FaComments;
  label: string;
  onClick: () => void;
}) {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      px={4}
      py={2.5}
      mb="-1px"
      bg="transparent"
      border="none"
      borderBottom="2px solid"
      borderColor={active ? '#c9a96e' : 'transparent'}
      cursor="pointer"
      transition="all 0.15s"
      sx={{ WebkitTapHighlightColor: 'transparent' }}
      _hover={{ borderColor: active ? '#c9a96e' : 'gray.300' }}
    >
      <HStack spacing={2}>
        <Icon as={icon} boxSize={3} color={active ? '#c9a96e' : 'gray.500'} />
        <Text
          fontSize="xs"
          fontWeight="500"
          letterSpacing="0.14em"
          textTransform="uppercase"
          color={active ? 'gray.800' : 'gray.500'}
        >
          {label}
        </Text>
      </HStack>
    </Box>
  );
}

export default AdminAssistant;
