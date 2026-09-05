import { Box, Flex, HStack, Text, Icon, VStack } from '@chakra-ui/react';
import { useState } from 'react';
import { FaComments, FaDatabase } from 'react-icons/fa';
import AdminAssistantChat from './AdminAssistantChat';
import AdminAssistantData from './AdminAssistantData';
import { useAdminLang } from '../i18n/admin';

/**
 * "Assistant" tab in /admin — two internal sub-tabs:
 *   1. Chat  — Vero talks to her AI business assistant in her chosen
 *              language (Russian by default; togglable to English so
 *              admins helping her can chat in their own language).
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
 *
 * Language is persisted per-browser via localStorage so Vero's phone
 * stays RU and an admin's laptop can stay EN independently.
 */

interface Props {
  adminPassword: string;
}

type SubTab = 'chat' | 'data';



const AdminAssistant = ({ adminPassword }: Props) => {
  const { t } = useAdminLang();
  const [subTab, setSubTab] = useState<SubTab>('chat');

  return (
    <Box maxW="1200px" mx="auto">
      {/* Tab header — title + language toggle. Stack on mobile so
          the toggle doesn't orphan to a second wrapped row. */}
      <Flex
        direction={{ base: 'row', md: 'row' }}
        align={{ base: 'flex-start', md: 'flex-start' }}
        justify="space-between"
        gap={{ base: 3, md: 4 }}
        mb={{ base: 4, md: 4 }}
      >
        <VStack align="flex-start" spacing={1} minW={0}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="brand.accent"
          >
            {t.common.adminKicker}
          </Text>
          <Text as="h1" fontSize={{ base: 'xl', md: '2xl' }} fontWeight="300" color="gray.800" m={0}>
            {t.assistant.tabTitle}
          </Text>
          {/* Concise subtitle that stays on one line at 375px so the
              header doesn't eat two extra rows of vertical space on
              mobile — every pixel matters when the chat + composer
              need to fit above the bottom nav. */}
          <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.500" fontWeight="300" noOfLines={1}>
            {t.assistant.subtitle}
          </Text>
        </VStack>
      </Flex>

      {/* Sub-tab strip. Full-width flex on mobile so each tab gets an
          equal (bigger) tap target and thumbs don't need to aim at a
          text label. */}
      <Flex borderBottom="1px solid" borderColor="gray.200" mb={{ base: 4, md: 6 }} gap={1}>
        <SubTabButton
          active={subTab === 'chat'}
          icon={FaComments}
          label={t.assistant.subtabChat}
          onClick={() => setSubTab('chat')}
        />
        <SubTabButton
          active={subTab === 'data'}
          icon={FaDatabase}
          label={t.assistant.subtabData}
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
      px={{ base: 5, md: 4 }}
      py={{ base: 3.5, md: 2.5 }}
      minH={{ base: '48px', md: 'auto' }}
      flex={{ base: '1', md: 'none' }}
      mb="-1px"
      bg="transparent"
      border="none"
      borderBottom="2px solid"
      borderColor={active ? 'brand.accent' : 'transparent'}
      cursor="pointer"
      transition="all 0.15s"
      sx={{ WebkitTapHighlightColor: 'transparent' }}
      _hover={{ borderColor: active ? 'brand.accent' : 'gray.300' }}
      _active={{ bg: 'rgba(201, 169, 110, 0.06)' }}
    >
      <HStack spacing={2} justify="center">
        <Icon as={icon} boxSize={{ base: 3.5, md: 3 }} color={active ? 'brand.accent' : 'gray.500'} />
        <Text
          fontSize={{ base: 'xs', md: 'xs' }}
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
