import {
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  Box,
  Flex,
  Text,
  VStack,
  Spinner,
} from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { useAdminLang } from '../i18n/admin';
import type { Message } from './AdminMessages';

/**
 * Read-only peek at the conversation a portal is being created from.
 *
 * WHY A DRAWER AND NOT NAVIGATION
 *
 * The new-client form is long and half of it is typed by hand. Navigating
 * back to the inbox to re-read what the customer actually said unmounts the
 * form and loses every keystroke, which meant the only safe way to check a
 * detail was to not check it. A drawer leaves the form mounted underneath, so
 * looking something up costs nothing.
 *
 * MOBILE
 *
 * Full-screen on a phone and a right-hand panel on a desktop, which is the
 * same gesture in both places: it covers the thing you were doing, you read,
 * you dismiss, you are exactly where you left off. Swipe-to-dismiss comes free
 * with Chakra's overlay, and the close button is a 44px target in the corner
 * where a thumb already is.
 */
export default function ConversationPeek({
  isOpen,
  onClose,
  adminPassword,
  conversationId,
  contactName,
}: {
  isOpen: boolean;
  onClose: () => void;
  adminPassword: string;
  conversationId: string;
  contactName: string;
}) {
  const { t } = useAdminLang();
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch on first open only. The thread is not going to change while she is
  // filling in a form about it, and a refetch on every open would flash the
  // spinner over content she is using as a reference.
  useEffect(() => {
    if (!isOpen || messages !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/messages-detail', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword, conversationId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success) setMessages(data.messages ?? []);
        else setError(data.error || t.messages.loadFailed(res.status));
      } catch {
        if (!cancelled) setError(t.common.couldNotReach);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, messages, adminPassword, conversationId, t]);

  // Drafts the AI wrote but Vero never sent are not part of the conversation
  // and must not be read as something the customer was told.
  const shown = (messages ?? []).filter((m) => m.status !== 'draft');

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      placement="right"
      size={{ base: 'full', md: 'md' } as never}
    >
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton size="lg" minW="44px" minH="44px" top={2} right={2} />
        <DrawerHeader fontSize="md" fontWeight="500" color="gray.800" pr="56px">
          {contactName}
          <Text fontSize="xs" color="gray.500" fontWeight="400" mt={0.5}>
            {t.newClient.peekSubtitle}
          </Text>
        </DrawerHeader>
        <DrawerBody px={{ base: 3, md: 4 }} pb="max(env(safe-area-inset-bottom), 16px)">
          {error && (
            <Text fontSize="sm" color="red.600">
              {error}
            </Text>
          )}
          {!error && messages === null && (
            <Flex justify="center" py={10}>
              <Spinner size="sm" color="brand.accent" />
            </Flex>
          )}
          {messages !== null && shown.length === 0 && !error && (
            <Text fontSize="sm" color="gray.500">
              {t.newClient.peekEmpty}
            </Text>
          )}
          <VStack align="stretch" spacing={3}>
            {shown.map((m) => {
              const inbound = m.direction === 'inbound';
              return (
                <Flex key={m.id} justify={inbound ? 'flex-start' : 'flex-end'}>
                  <Box
                    maxW="85%"
                    bg={inbound ? 'gray.100' : 'brand.accentSoft'}
                    borderRadius="md"
                    px={3}
                    py={2}
                  >
                    {m.subject && (
                      <Text fontSize="2xs" color="gray.500" fontWeight="600" mb={1}>
                        {m.subject}
                      </Text>
                    )}
                    <Text fontSize="sm" color="gray.800" lineHeight="1.55" whiteSpace="pre-wrap">
                      {m.body}
                    </Text>
                    <Text fontSize="2xs" color="gray.400" mt={1}>
                      {new Date(m.sent_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </Text>
                  </Box>
                </Flex>
              );
            })}
          </VStack>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}
