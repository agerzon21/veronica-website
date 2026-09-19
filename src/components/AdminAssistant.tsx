import SubTabButton from './ui/SubTabButton';
import { Box, Flex, FormControl, FormLabel, Select, Text, VStack } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import FaComments from '../icons/fa/FaComments';
import FaDatabase from '../icons/fa/FaDatabase';
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

/** Only what the picker renders. The endpoint returns a great deal more. */
interface PickerConversation {
  id: string;
  platform: string;
  contact_name: string | null;
  contact_handle: string | null;
  external_user_id: string;
}

const AdminAssistant = ({ adminPassword }: Props) => {
  const { t } = useAdminLang();
  const [subTab, setSubTab] = useState<SubTab>('chat');

  /**
   * Which customer this chat is about, or null for the general thread.
   *
   * This tab used to pass nothing. The assistant builds its customer context
   * block only for a conversation-scoped chat, so on this tab it had no name,
   * no thread digest, no conversation_id and no portal state, and the
   * instruction that tells it what to do with those lives INSIDE the block
   * that did not render. That is why it handed Vero a draft addressed to
   * "[Client's Name]" while the name sat in the conversation she was asking
   * about.
   *
   * Picked explicitly rather than guessed. Inferring the customer from names
   * in her message would sometimes load the wrong person's thread, contract
   * status and portal state, and a confidently wrong draft about someone
   * else's booking is worse than a blank.
   */
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<PickerConversation[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/messages-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword }),
        });
        const data = await res.json();
        // The key is `conversations`, which is what this endpoint has always
        // called it. Anything else means the shape changed, and an empty list
        // is a better failure than a crash: the picker disappears and the
        // general thread still works.
        if (!cancelled) setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
      } catch {
        if (!cancelled) setConversations([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminPassword]);

  const nameOf = (c: PickerConversation) =>
    c.contact_name || c.contact_handle || c.external_user_id;

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
        <>
          {/* Hidden entirely when there is nothing to pick, so a fresh
              install does not show an empty control. */}
          {conversations !== null && conversations.length > 0 && (
            /* Capped rather than full bleed: a 1200px wide dropdown holding one
               name reads as a page header, not as a control. */
            <FormControl mb={{ base: 3, md: 4 }} maxW={{ base: '100%', md: '420px' }}>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                {t.assistant.conversationLabel}
              </FormLabel>
              <Select
                value={conversationId ?? ''}
                onChange={(e) => setConversationId(e.target.value || null)}
                size={{ base: 'md', md: 'sm' } as any}
                fontSize={{ base: 'md', md: 'sm' } as any}
                bg="white"
                aria-label={t.assistant.conversationLabel}
              >
                <option value="">{t.assistant.conversationNone}</option>
                {conversations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {nameOf(c)}
                  </option>
                ))}
              </Select>
              {/* Desktop only. On a phone this wraps to two lines, and the
                  chat plus composer already have to fit above the bottom nav;
                  the control says what it does without the sentence. */}
              <Text
                fontSize="xs"
                color="gray.500"
                fontWeight="300"
                mt={1}
                display={{ base: 'none', md: 'block' }}
              >
                {t.assistant.conversationHint}
              </Text>
            </FormControl>
          )}
          {/* Deliberately NOT keyed on the conversation. The chat already
              handles a scope switch itself: it reloads the transcript on a
              conversationId change and parks the half-typed composer text
              under the scope it was typed in. Remounting would skip that
              parking step and throw her draft away. */}
          <AdminAssistantChat adminPassword={adminPassword} conversationId={conversationId} />
        </>
      ) : (
        <AdminAssistantData adminPassword={adminPassword} />
      )}
    </Box>
  );
};


export default AdminAssistant;
