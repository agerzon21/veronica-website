import {
  Box, VStack, HStack, Text, Flex, Icon, Badge, Textarea, Spinner, useToast, Switch,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalBody, ModalFooter, ModalCloseButton,
  FormControl, FormLabel, Input, Select, InputGroup, InputRightElement, Button, IconButton,
  Stack,
} from '@chakra-ui/react';
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  FaInstagram, FaRobot, FaUser, FaSync, FaPaperPlane, FaPowerOff, FaCommentDots, FaExclamationTriangle,
  FaLanguage, FaLightbulb, FaChevronDown, FaChevronUp, FaUserPlus, FaExternalLinkAlt, FaChevronLeft,
} from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import ConfirmDialog from './ui/ConfirmDialog';

// Vero speaks Russian natively — customer messages (usually English)
// get translated to Russian; her replies get translated to English
// before sending. If we ever localize this UI properly, flip this to
// a per-user setting.
const VERO_LANG = 'ru';

/**
 * "Messages" tab in /admin — the unified inbox for Instagram DMs
 * (WhatsApp / SMS to slot into the same UI later via the `platform`
 * column on conversations).
 *
 * Two-pane layout:
 *   - Left rail: conversation list, sorted by most recent activity,
 *     unread badge, contact name/handle, last-message preview.
 *   - Right pane: selected conversation. Message history rendered
 *     chat-app style (contact bubbles left/gray, our replies right/
 *     gold), with AI vs Vero replies visually distinguished. Reply
 *     composer + per-convo AI toggle live in the header of the pane.
 *
 * Top of the tab: global AI kill switch (super-only), refresh button,
 * conversation count.
 *
 * Auto-polls every 30s while the tab is visible so Vero sees new
 * messages without manual refresh.
 *
 * Both admin (Vero) and super (Alex) see this tab — messaging is a
 * Vero-facing tool. Global kill switch is super-only (UI hides the
 * button for admin level; endpoint enforces server-side too).
 */

interface Props {
  adminPassword: string;
  adminLevel: 'admin' | 'super';
}

export interface ConversationSummary {
  id: string;
  platform: string;
  external_user_id: string;
  contact_name: string | null;
  contact_handle: string | null;
  contact_profile_pic_url: string | null;
  ai_enabled: boolean;
  last_message_at: string | null;
  unread_count: number;
  linked_client_portal_id: string | null;
  linked_client_display_name: string | null;
  created_at: string;
  last_message_direction: 'inbound' | 'outbound' | null;
  last_message_sender: 'contact' | 'ai' | 'human' | null;
  last_message_preview: string | null;
}

export interface ConversationDetail extends ConversationSummary {
  notes: string;
}

export interface Message {
  id: string;
  direction: 'inbound' | 'outbound';
  sender: 'contact' | 'ai' | 'human';
  body: string;
  external_message_id: string | null;
  sent_at: string;
  ai_model: string | null;
}

export type InquiryClassification =
  | 'booking-inquiry'
  | 'existing-client'
  | 'general-question'
  | 'collaboration-offer'
  | 'spam-or-unrelated'
  | 'unclear';

interface LocalizedSummary {
  asking: string;
  gathered: string[];
  nextStep: string;
}

export interface AiSummary {
  classification: InquiryClassification;
  tone: string;
  // New bilingual shape — always populated on fresh summaries.
  en?: LocalizedSummary;
  ru?: LocalizedSummary;
  // Legacy flat fields — old cached summaries only have these,
  // no `en`/`ru`. Kept as fallbacks so old rows still render until
  // they get regenerated on the next new message.
  asking?: string;
  gathered?: string[];
  nextStep?: string;
}

type SummaryLang = 'ru' | 'en';

/**
 * Read the localized asking/gathered/nextStep for a given language,
 * falling back through: requested lang → other lang → legacy flat.
 * Never returns undefined fields so the render code doesn't need
 * a bunch of `?? ''` boilerplate.
 */
function readSummaryLocale(s: AiSummary | null, lang: SummaryLang): LocalizedSummary {
  if (!s) return { asking: '', gathered: [], nextStep: '' };
  const primary = s[lang];
  const other = s[lang === 'ru' ? 'en' : 'ru'];
  return {
    asking: primary?.asking ?? other?.asking ?? s.asking ?? '',
    gathered: primary?.gathered ?? other?.gathered ?? s.gathered ?? [],
    nextStep: primary?.nextStep ?? other?.nextStep ?? s.nextStep ?? '',
  };
}

/**
 * Format US-style phone numbers inside AI-gathered facts. The model is
 * asked to format these, but if it slips ("Phone: 5595997511") we
 * still want the display to be readable. Matches 10/11-digit
 * sequences and rewrites them as (555) 599-7511.
 */
function formatPhoneNumbersInText(text: string): string {
  return text.replace(/\b(\d{10}|1\d{10})\b/g, (match) => {
    const digits = match.length === 11 ? match.slice(1) : match;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  });
}

const POLL_INTERVAL_MS = 30_000;

const AdminMessages = ({ adminPassword, adminLevel }: Props) => {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [globalAiState, setGlobalAiState] = useState<'on' | 'off'>('on');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Confirm dialog state for the global AI pause. Replaces the old
  // window.confirm() call, which on iOS Safari showed a URL host in
  // the dialog title and truncated the (deliberately long) warning
  // message ugly.
  const [globalToggleConfirmOpen, setGlobalToggleConfirmOpen] = useState(false);
  const [globalToggleLoading, setGlobalToggleLoading] = useState(false);
  const toast = useToast();

  const loadList = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/messages-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setConversations(data.conversations);
        setGlobalAiState(data.globalAiState);
        setError(null);
      } else {
        setError(data.error || `Load failed (${res.status})`);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [adminPassword]);

  // Initial load + polling. Cleanup on unmount.
  useEffect(() => {
    void loadList();
    const interval = setInterval(() => void loadList(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadList]);

  // Click-handler that just opens the confirm dialog. The actual
  // network call runs from `doToggleGlobal` when the user confirms.
  const handleToggleGlobal = () => setGlobalToggleConfirmOpen(true);

  const doToggleGlobal = async () => {
    const next = globalAiState === 'on' ? 'off' : 'on';
    setGlobalToggleLoading(true);
    try {
      const res = await fetch('/api/admin/messages-toggle-global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, state: next }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGlobalAiState(data.globalAiState);
        toast({
          title: `AI ${next === 'on' ? 'enabled' : 'paused'} globally`,
          status: next === 'on' ? 'success' : 'warning',
          duration: 3000,
          isClosable: true,
        });
      } else {
        toast({ title: data.error || 'Failed to update', status: 'error', duration: 4000 });
      }
    } catch {
      toast({ title: 'Could not reach the server', status: 'error', duration: 4000 });
    } finally {
      setGlobalToggleLoading(false);
      setGlobalToggleConfirmOpen(false);
    }
  };

  const selected = conversations?.find((c) => c.id === selectedId) ?? null;
  // Mobile drill-down: when a conversation is selected on a phone, we
  // want the ConversationView to take over the whole screen (edge-to-
  // edge, with a back chevron), NOT stack under the conversation list.
  // The old vertical stack was Alex's #2 complaint — you'd click a
  // thread and the chat rendered "at the bottom of the screen below
  // everything" (his words), invisible without scrolling.
  const showListOnMobile = !selected;
  const showThreadOnMobile = Boolean(selected);

  return (
    <Box maxW="1400px" mx="auto" px={{ base: 0, md: 0 }}>
      {/* Tab header — hidden on mobile when a conversation is open so
          the drill-down feels like a real screen switch, not a
          scrolling chase. Desktop always shows it. */}
      <Box display={{ base: showThreadOnMobile ? 'none' : 'block', lg: 'block' }}>
        <Stack
          direction={{ base: 'column', md: 'row' }}
          align={{ base: 'flex-start', md: 'flex-end' }}
          justify="space-between"
          mb={{ base: 4, md: 6 }}
          spacing={{ base: 3, md: 4 }}
        >
          <VStack align="flex-start" spacing={1}>
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
              Messages
            </Text>
            <Text fontSize={{ base: 'sm', md: 'sm' }} color="gray.500" fontWeight="300">
              {conversations
                ? `${conversations.length} ${conversations.length === 1 ? 'conversation' : 'conversations'}`
                : 'Unified inbox for Instagram DMs.'}
            </Text>
          </VStack>

          {/* Header actions — stack cleanly on mobile so nothing orphans.
              GlobalAiIndicator + Pause button flow full-width; Refresh
              becomes an icon-only round button so it's 44×44 tappable. */}
          <Stack
            direction={{ base: 'row', md: 'row' }}
            spacing={2}
            align="center"
            wrap="wrap"
            w={{ base: '100%', md: 'auto' }}
            justify={{ base: 'flex-start', md: 'flex-end' }}
          >
            <GlobalAiIndicator state={globalAiState} />
            {adminLevel === 'super' && (
              <CTAButton
                onClick={handleToggleGlobal}
                icon={FaPowerOff}
                variant={globalAiState === 'off' ? 'solid' : 'outline'}
                size="sm"
              >
                {/* Shorter label on mobile so it fits next to the pill */}
                <Box as="span" display={{ base: 'inline', md: 'none' }}>
                  {globalAiState === 'on' ? 'Pause AI' : 'Resume AI'}
                </Box>
                <Box as="span" display={{ base: 'none', md: 'inline' }}>
                  {globalAiState === 'on' ? 'Pause AI globally' : 'Resume AI globally'}
                </Box>
              </CTAButton>
            )}
            <IconButton
              aria-label="Refresh conversations"
              icon={<Icon as={FaSync} boxSize={4} />}
              onClick={loadList}
              variant="ghost"
              size="md"
              minW="44px"
              minH="44px"
              color="gray.500"
              _hover={{ color: '#c9a96e' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            />
          </Stack>
        </Stack>

        {error && (
          <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} mb={4} borderRadius="sm">
            <Text fontSize="sm" color="red.700">{error}</Text>
          </Box>
        )}
      </Box>

      {/* Global-AI confirm dialog (used by both Pause and Resume) */}
      <ConfirmDialog
        isOpen={globalToggleConfirmOpen}
        title={globalAiState === 'on' ? 'Pause AI for everyone?' : 'Resume AI for everyone?'}
        body={
          globalAiState === 'on'
            ? 'Silence AI replies for ALL conversations? Real customers won’t get automated replies until you turn it back on.'
            : 'Re-enable AI replies for all conversations?'
        }
        confirmLabel={globalAiState === 'on' ? 'Pause AI' : 'Resume AI'}
        danger={globalAiState === 'on'}
        isLoading={globalToggleLoading}
        onConfirm={doToggleGlobal}
        onCancel={() => setGlobalToggleConfirmOpen(false)}
      />

      {/* Two-pane on desktop, drill-down on mobile */}
      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner color="#c9a96e" />
        </Flex>
      ) : !conversations || conversations.length === 0 ? (
        <EmptyState />
      ) : (
        <Flex
          gap={{ base: 0, lg: 4 }}
          direction={{ base: 'column', lg: 'row' }}
          minH={{ lg: '75vh' }}
          maxH={{ lg: '85vh' }}
        >
          {/* Left rail — conversation list. Hidden on mobile when a
              thread is open so it doesn't stack awkwardly under the
              chat view. */}
          <Box
            flex={{ base: '1', lg: '0 0 360px' }}
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="sm"
            overflow={{ base: 'visible', lg: 'auto' }}
            maxH={{ base: 'auto', lg: '100%' }}
            display={{ base: showListOnMobile ? 'block' : 'none', lg: 'block' }}
          >
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </Box>

          {/* Right pane — selected conversation or empty prompt.
              On mobile when a thread is open, this Box becomes
              full-viewport (position fixed, inset 0, above the
              bottom nav) so the composer never gets buried below
              anything and the keyboard scrolls the thread, not the
              whole page. */}
          <Box
            flex="1"
            bg="white"
            border={{ base: 'none', lg: '1px solid' }}
            borderColor="gray.200"
            borderRadius={{ base: 0, lg: 'sm' }}
            display={{
              base: showThreadOnMobile ? 'flex' : 'none',
              lg: 'flex',
            }}
            flexDirection="column"
            minH={{ base: 'auto', lg: 'auto' }}
            overflow="hidden"
            // Mobile drill-down: pin to viewport so the composer stays
            // at the bottom (above the OS keyboard) and the whole
            // conversation feels like its own screen. zIndex=25 sits
            // above page content but below the bottom nav (30) so nav
            // stays reachable; but nav is also hidden when a chat is
            // open (we render it above the pane via top: 0 rather than
            // covering nav) — actually we set top to admin header
            // start so the composer clears the bottom nav safely.
            position={{ base: 'fixed', lg: 'static' }}
            top={{ base: 0, lg: 'auto' }}
            left={{ base: 0, lg: 'auto' }}
            right={{ base: 0, lg: 'auto' }}
            bottom={{ base: 0, lg: 'auto' }}
            zIndex={{ base: 25, lg: 'auto' }}
            h={{ base: '100dvh', lg: 'auto' }}
          >
            {selected ? (
              <ConversationView
                key={selected.id}
                summary={selected}
                adminPassword={adminPassword}
                // Mobile back: unset selection to return to the list.
                // Desktop-only: unused — SelectPrompt shows when null.
                onBack={() => setSelectedId(null)}
                onRefreshList={loadList}
              />
            ) : (
              <SelectPrompt />
            )}
          </Box>
        </Flex>
      )}
    </Box>
  );
};

/**
 * Small pill indicator in the header showing the global AI state at
 * a glance. Green for on, amber for off. Redundant with the toggle
 * button below on super-admin, but always visible on admin-level
 * where the toggle button is hidden.
 */
function GlobalAiIndicator({ state }: { state: 'on' | 'off' }) {
  const config =
    state === 'on'
      ? { bg: 'green.100', color: 'green.700', label: 'AI: On' }
      : { bg: 'orange.100', color: 'orange.700', label: 'AI: Paused' };
  return (
    <Badge
      bg={config.bg}
      color={config.color}
      fontSize={{ base: 'xs', md: '2xs' }}
      fontWeight="500"
      letterSpacing="0.1em"
      textTransform="uppercase"
      px={2.5}
      py={1}
      borderRadius="sm"
      display="inline-flex"
      alignItems="center"
      gap={1.5}
    >
      <Box as="span" w="6px" h="6px" borderRadius="full" bg={state === 'on' ? 'green.500' : 'orange.500'} />
      {config.label}
    </Badge>
  );
}

function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: {
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <VStack spacing={0} align="stretch" divider={<Box h="1px" bg="gray.100" />}>
      {conversations.map((c) => (
        <ConversationListRow
          key={c.id}
          conv={c}
          isSelected={c.id === selectedId}
          onClick={() => onSelect(c.id)}
        />
      ))}
    </VStack>
  );
}

function ConversationListRow({
  conv,
  isSelected,
  onClick,
}: {
  conv: ConversationSummary;
  isSelected: boolean;
  onClick: () => void;
}) {
  const displayName =
    conv.contact_name ||
    conv.contact_handle ||
    conv.linked_client_display_name ||
    `Instagram user ${conv.external_user_id.slice(-6)}`;

  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      w="100%"
      textAlign="left"
      p={4}
      bg={isSelected ? 'rgba(201, 169, 110, 0.08)' : 'transparent'}
      borderLeft="3px solid"
      borderLeftColor={isSelected ? '#c9a96e' : 'transparent'}
      _hover={isSelected ? {} : { bg: 'gray.50' }}
      cursor="pointer"
      sx={{ WebkitTapHighlightColor: 'transparent' }}
      transition="background 0.15s"
    >
      <Flex gap={3} align="flex-start">
        <PlatformAvatar
          platform={conv.platform}
          profilePicUrl={conv.contact_profile_pic_url}
          displayName={displayName}
        />
        <VStack align="flex-start" spacing={1} flex={1} minW={0}>
          <Flex w="100%" justify="space-between" align="baseline" gap={2}>
            <Text
              fontSize="sm"
              fontWeight={conv.unread_count > 0 ? '600' : '400'}
              color="gray.800"
              noOfLines={1}
              flex="1"
              minW={0}
            >
              {displayName}
            </Text>
            {conv.last_message_at && (
              <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" fontWeight="300" flexShrink={0}>
                {formatRelative(conv.last_message_at)}
              </Text>
            )}
          </Flex>
          <Text
            fontSize="xs"
            color={conv.unread_count > 0 ? 'gray.700' : 'gray.500'}
            fontWeight={conv.unread_count > 0 ? '400' : '300'}
            noOfLines={2}
            w="100%"
          >
            {conv.last_message_preview
              ? formatPreview(conv)
              : 'No messages yet'}
          </Text>
          <HStack spacing={2} wrap="wrap" mt={0.5}>
            {!conv.ai_enabled && (
              <Badge
                bg="orange.100"
                color="orange.700"
                fontSize={{ base: 'xs', md: '2xs' }}
                fontWeight="500"
                letterSpacing="0.08em"
                textTransform="uppercase"
                px={1.5}
                py={0}
                borderRadius="sm"
              >
                Needs Vero
              </Badge>
            )}
            {conv.linked_client_portal_id && (
              <Badge
                bg="green.100"
                color="green.700"
                fontSize={{ base: 'xs', md: '2xs' }}
                fontWeight="500"
                letterSpacing="0.08em"
                textTransform="uppercase"
                px={1.5}
                py={0}
                borderRadius="sm"
              >
                Client
              </Badge>
            )}
            {conv.unread_count > 0 && (
              <Badge
                bg="#c9a96e"
                color="white"
                fontSize={{ base: 'xs', md: '2xs' }}
                fontWeight="600"
                px={1.5}
                py={0}
                borderRadius="full"
              >
                {conv.unread_count}
              </Badge>
            )}
          </HStack>
        </VStack>
      </Flex>
    </Box>
  );
}

function PlatformAvatar({
  platform,
  profilePicUrl,
  displayName,
}: {
  platform: string;
  profilePicUrl: string | null;
  displayName: string;
}) {
  const platformIcon = platform === 'instagram' ? FaInstagram : FaCommentDots;
  const platformGradient =
    platform === 'instagram'
      ? 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)'
      : 'linear-gradient(135deg, #4a5568, #718096)';
  return (
    <Box position="relative" flexShrink={0}>
      <Box
        w="44px"
        h="44px"
        borderRadius="full"
        overflow="hidden"
        bg={profilePicUrl ? 'gray.100' : 'gray.700'}
        display="flex"
        alignItems="center"
        justifyContent="center"
        color="white"
        fontWeight="500"
        fontSize="sm"
      >
        {profilePicUrl ? (
          <Box as="img" src={profilePicUrl} alt={displayName} w="100%" h="100%" objectFit="cover" />
        ) : (
          initials(displayName)
        )}
      </Box>
      {/* Small platform badge in the corner */}
      <Flex
        position="absolute"
        bottom={-1}
        right={-1}
        w="18px"
        h="18px"
        borderRadius="full"
        bg={platformGradient}
        border="2px solid white"
        align="center"
        justify="center"
        color="white"
      >
        <Icon as={platformIcon} boxSize={2} />
      </Flex>
    </Box>
  );
}

function ConversationView({
  summary,
  adminPassword,
  onRefreshList,
  onBack,
}: {
  summary: ConversationSummary;
  adminPassword: string;
  onRefreshList: () => void;
  // Mobile back-navigation. On desktop this is unused (SelectPrompt
  // handles the "no thread open" state), but on mobile the parent
  // uses it to close the drill-down.
  onBack?: () => void;
}) {
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [aiToggleLoading, setAiToggleLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);
  const [translateOnSend, setTranslateOnSend] = useState(false);
  const [createClientOpen, setCreateClientOpen] = useState(false);
  // Summary is EXPANDED by default when a conversation opens (per
  // Alex's ask — the summary is the first thing you want to see, not
  // the chat scroll). Vero taps the collapse chevron to reveal the
  // chat + composer. On mobile this drives "focus mode": when
  // expanded, the chat + composer are hidden entirely so the summary
  // gets the full viewport.
  const [summaryCollapsed, setSummaryCollapsed] = useState(false);
  // Summary language toggle. Defaults to Russian since Vero speaks
  // Russian — but the toggle lets an admin flip to English when
  // helping her out. Persisted per-browser (localStorage) so the
  // choice sticks across sessions.
  const [summaryLang, setSummaryLang] = useState<SummaryLang>(() => {
    if (typeof window === 'undefined') return 'ru';
    return (window.localStorage.getItem('vero_summary_lang') as SummaryLang) || 'ru';
  });
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('vero_summary_lang', summaryLang);
    }
  }, [summaryLang]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const toast = useToast();

  const loadAiSummary = useCallback(
    // Pass force=true from the Regenerate button so the server
    // bypasses its cache and always makes a fresh OpenAI call.
    // The default (no arg / force=false) uses the cached summary
    // whenever no new messages have arrived since it was made —
    // makes conversation-open snappy instead of a 1-3s wait.
    async (opts?: { force?: boolean }): Promise<void> => {
      setAiSummaryLoading(true);
      setAiSummaryError(null);
      try {
        const res = await fetch('/api/admin/messages-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password: adminPassword,
            conversationId: summary.id,
            force: opts?.force ?? false,
          }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setAiSummary(data.summary);
        } else {
          setAiSummaryError(data.error || 'Could not generate summary');
        }
      } catch {
        setAiSummaryError('Could not reach the server');
      } finally {
        setAiSummaryLoading(false);
      }
    },
    [adminPassword, summary.id],
  );

  const loadDetail = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch('/api/admin/messages-detail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, conversationId: summary.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDetail(data.conversation);
        setMessages(data.messages);
        setError(null);
      } else {
        setError(data.error || `Load failed (${res.status})`);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [adminPassword, summary.id]);

  // Load on mount + when selected conversation changes. Also mark
  // as read so the unread badge clears, and kick off the AI summary
  // in parallel so Vero can catch up on the thread at a glance.
  useEffect(() => {
    void loadDetail();
    void loadAiSummary();
    // Fire-and-forget the read-mark; if it fails the unread stays,
    // no big deal. Reload the sidebar afterwards so the badge clears
    // in the list too.
    (async () => {
      try {
        await fetch('/api/admin/messages-mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword, conversationId: summary.id }),
        });
        onRefreshList();
      } catch {
        // silent
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.id]);

  // Auto-scroll to bottom on new messages / initial load.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleToggleAi = async () => {
    if (!detail) return;
    setAiToggleLoading(true);
    try {
      const res = await fetch('/api/admin/messages-toggle-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          conversationId: summary.id,
          enabled: !detail.ai_enabled,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setDetail((d) => (d ? { ...d, ai_enabled: data.ai_enabled } : d));
        onRefreshList();
      } else {
        toast({ title: data.error || 'Failed to update', status: 'error', duration: 3000 });
      }
    } catch {
      toast({ title: 'Could not reach the server', status: 'error', duration: 3000 });
    } finally {
      setAiToggleLoading(false);
    }
  };

  const handleSend = async () => {
    const raw = replyText.trim();
    if (!raw) return;
    setSending(true);
    try {
      // If translate-on-send is on, ask the backend to translate
      // Vero's Russian text into the customer's language before
      // sending. We infer target from the last inbound message —
      // its detected language is more reliable than a guess.
      let outbound = raw;
      if (translateOnSend) {
        const targetLang = await inferCustomerLang(adminPassword, messages);
        if (targetLang && targetLang !== VERO_LANG) {
          try {
            const tRes = await fetch('/api/admin/messages-translate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                password: adminPassword,
                text: raw,
                targetLang,
              }),
            });
            const tData = await tRes.json();
            if (tRes.ok && tData.success && typeof tData.translated === 'string') {
              outbound = tData.translated;
            } else {
              toast({
                title: tData.error || 'Translation failed — sending original text',
                status: 'warning',
                duration: 4000,
              });
            }
          } catch {
            toast({
              title: 'Translation unreachable — sending original text',
              status: 'warning',
              duration: 4000,
            });
          }
        }
      }

      const res = await fetch('/api/admin/messages-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          conversationId: summary.id,
          text: outbound,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setReplyText('');
        await loadDetail();
        onRefreshList();
      } else {
        toast({
          title: data.error || 'Send failed',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch {
      toast({ title: 'Could not reach the server', status: 'error', duration: 3000 });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <Flex flex={1} justify="center" align="center">
        <Spinner color="#c9a96e" />
      </Flex>
    );
  }

  if (error || !detail) {
    return (
      <Flex flex={1} justify="center" align="center" p={6}>
        <Text color="red.500" fontSize="sm">{error || 'Could not load conversation.'}</Text>
      </Flex>
    );
  }

  const displayName =
    detail.contact_name ||
    detail.contact_handle ||
    detail.linked_client_display_name ||
    `Instagram user ${detail.external_user_id.slice(-6)}`;

  return (
    <>
      {/* Thread header — contact identity + per-convo AI toggle + Create client.
          Mobile: back button on the left (drill-down close), identity in the
          middle, AI switch on the right. Create-client + Linked-client status
          drops to a second row below so nothing gets squeezed off-screen. */}
      <VStack
        spacing={0}
        align="stretch"
        borderBottom="1px solid"
        borderColor="gray.100"
        flexShrink={0}
      >
        <Flex
          p={{ base: 3, md: 4 }}
          align="center"
          justify="space-between"
          gap={2}
        >
          {/* Mobile-only back chevron. 44×44 tap target, gold on active. */}
          {onBack && (
            <IconButton
              aria-label="Back to conversations"
              icon={<Icon as={FaChevronLeft} boxSize={4} />}
              onClick={onBack}
              variant="ghost"
              size="md"
              minW="44px"
              minH="44px"
              color="gray.500"
              _hover={{ color: '#c9a96e' }}
              display={{ base: 'inline-flex', lg: 'none' }}
              flexShrink={0}
              ml={-2}
            />
          )}
          <HStack spacing={3} minW={0} flex={1}>
            <PlatformAvatar
              platform={detail.platform}
              profilePicUrl={detail.contact_profile_pic_url}
              displayName={displayName}
            />
            <VStack align="flex-start" spacing={0} minW={0} flex={1}>
              <Text fontSize={{ base: 'sm', md: 'sm' }} fontWeight="500" color="gray.800" noOfLines={1}>
                {displayName}
              </Text>
              <HStack spacing={2}>
                <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" textTransform="capitalize">
                  {detail.platform}
                </Text>
                {detail.linked_client_display_name && (
                  <Badge
                    bg="green.100"
                    color="green.700"
                    fontSize={{ base: 'xs', md: '2xs' }}
                    fontWeight="500"
                    letterSpacing="0.08em"
                    textTransform="uppercase"
                    px={1.5}
                    py={0}
                    borderRadius="sm"
                  >
                    Client
                  </Badge>
                )}
              </HStack>
            </VStack>
          </HStack>

          {/* AI toggle stays in the top row on all breakpoints — it's the
              most-used control in this header. */}
          <HStack spacing={2} flexShrink={0}>
            <Icon as={FaRobot} boxSize={3.5} color={detail.ai_enabled ? '#c9a96e' : 'gray.400'} />
            <Text fontSize="xs" color="gray.600" fontWeight="500" display={{ base: 'none', sm: 'inline' }}>
              AI
            </Text>
            <Switch
              isChecked={detail.ai_enabled}
              onChange={handleToggleAi}
              isDisabled={aiToggleLoading}
              colorScheme="yellow"
              size={{ base: 'md', md: 'sm' } as any}
            />
          </HStack>
        </Flex>

        {/* Second row: Create-client / Linked-client status. Hidden on
            mobile in focus mode (summary expanded) — nothing should
            sit between the header and the summary body when Vero is
            reading. Compact text-icon button so it doesn't dominate
            the row on mobile the way the old chunky pill did. */}
        <Flex
          px={{ base: 3, md: 4 }}
          pb={{ base: 2, md: 3 }}
          pt={0}
          justify="flex-start"
          align="center"
          gap={2}
          display={{ base: summaryCollapsed ? 'flex' : 'none', lg: 'flex' }}
        >
          {detail.linked_client_portal_id ? (
            <Badge
              bg="green.50"
              color="green.700"
              border="1px solid"
              borderColor="green.200"
              fontSize={{ base: 'xs', md: '2xs' }}
              fontWeight="600"
              letterSpacing="0.06em"
              textTransform="uppercase"
              px={2}
              py={1}
              borderRadius="sm"
              display="inline-flex"
              alignItems="center"
              gap={1.5}
            >
              <Icon as={FaExternalLinkAlt} boxSize={2.5} />
              Linked client
            </Badge>
          ) : (
            <CTAButton
              onClick={() => setCreateClientOpen(true)}
              icon={FaUserPlus}
              variant="outline"
              size="sm"
            >
              Create client
            </CTAButton>
          )}
        </Flex>
      </VStack>

      {/* Create-client modal — prefills from IG contact + AI summary */}
      <CreateClientModal
        isOpen={createClientOpen}
        onClose={() => setCreateClientOpen(false)}
        adminPassword={adminPassword}
        conversationId={summary.id}
        defaultDisplayName={displayName}
        aiSummary={aiSummary}
        onCreated={async () => {
          setCreateClientOpen(false);
          await loadDetail();
          onRefreshList();
          toast({
            title: 'Client portal created and linked to this conversation.',
            status: 'success',
            duration: 4000,
            isClosable: true,
          });
        }}
      />

      {/* Not-in-AI notice — small banner when AI is off for this convo */}
      {!detail.ai_enabled && (
        <Flex
          bg="orange.50"
          borderBottom="1px solid"
          borderColor="orange.100"
          px={4}
          py={2}
          gap={2}
          align="center"
          flexShrink={0}
        >
          <Icon as={FaExclamationTriangle} color="orange.500" boxSize={3} />
          <Text fontSize="xs" color="orange.700" fontWeight="400">
            AI is off for this conversation — replies are 100% you. Toggle above to re-enable.
          </Text>
        </Flex>
      )}

      {/* Pinned AI summary — sits above the scroll area on desktop
          so it stays visible while Vero reads through the thread. On
          mobile, when expanded, it enters FOCUS MODE and takes over
          the viewport (chat + composer render only when collapsed) so
          Vero can read the summary comfortably without half of it
          being off-screen. When collapsed, only the header row shows
          and the chat + composer become visible — a big obvious
          "Show summary" button doubles as the collapse affordance. */}
      <Box
        flex={{ base: summaryCollapsed ? '0 0 auto' : '1 1 auto', lg: '0 0 auto' }}
        overflowY={{ base: summaryCollapsed ? 'visible' : 'auto', lg: 'visible' }}
        borderBottom="1px solid"
        borderColor="gray.100"
        bg="white"
      >
        <SummaryCard
          summary={aiSummary}
          loading={aiSummaryLoading}
          error={aiSummaryError}
          collapsed={summaryCollapsed}
          onToggleCollapsed={() => setSummaryCollapsed((c) => !c)}
          language={summaryLang}
          onChangeLanguage={setSummaryLang}
          // Force=true so the Regenerate button always bypasses
          // the server-side cache. The initial auto-load on
          // conversation open (loadAiSummary() with no args) uses
          // the cached summary whenever it's still valid.
          onRegenerate={() => loadAiSummary({ force: true })}
        />
      </Box>

      {/* Message history — hidden on mobile when the summary is
          expanded (focus mode). On desktop it always renders. */}
      <Box
        ref={scrollRef}
        flex={1}
        overflowY="auto"
        p={{ base: 4, md: 6 }}
        bg="gray.50"
        display={{ base: summaryCollapsed ? 'block' : 'none', lg: 'block' }}
      >
        <VStack spacing={3} align="stretch">
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} adminPassword={adminPassword} />
          ))}
        </VStack>
      </Box>

      {/* Composer — sticky at the bottom of the pane on mobile so it
          stays above the OS keyboard. Safe-area padding clears the iOS
          home indicator. Hidden on mobile when the summary is expanded
          (focus mode) — the collapse affordance is Vero's way back to
          the composer. */}
      <Box
        p={{ base: 3, md: 4 }}
        pb={{ base: 'max(env(safe-area-inset-bottom), 12px)', md: 4 }}
        borderTop="1px solid"
        borderColor="gray.100"
        bg="white"
        flexShrink={0}
        display={{ base: summaryCollapsed ? 'block' : 'none', lg: 'block' }}
      >
        <Textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder="Type a reply as Vero..."
          rows={3}
          resize="vertical"
          // 16px on mobile prevents iOS Safari from zooming the whole
          // page in on focus. Regular sm on desktop.
          fontSize={{ base: '16px', md: 'sm' }}
          bg="white"
          borderColor="gray.300"
          _hover={{ borderColor: 'gray.400' }}
          _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter to send
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        {/* Footer row: translate toggle + hint on the left, send on the
            right. Stacks on mobile so nothing gets pushed off the
            viewport and Send stays a full-width primary action. */}
        <Stack
          direction={{ base: 'column', md: 'row' }}
          justify="space-between"
          align={{ base: 'stretch', md: 'center' }}
          mt={3}
          spacing={3}
        >
          <VStack align="flex-start" spacing={1} flex={1} minW={0}>
            <HStack spacing={2}>
              <Switch
                isChecked={translateOnSend}
                onChange={(e) => setTranslateOnSend(e.target.checked)}
                colorScheme="yellow"
                size={{ base: 'md', md: 'sm' } as any}
              />
              <Icon as={FaLanguage} boxSize={3.5} color={translateOnSend ? '#c9a96e' : 'gray.400'} />
              <Text
                fontSize={{ base: 'xs', md: '2xs' }}
                color={translateOnSend ? '#8a6e35' : 'gray.500'}
                fontWeight="500"
              >
                Translate before sending
              </Text>
            </HStack>
            <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.400" display={{ base: 'none', md: 'block' }}>
              ⌘/Ctrl + Enter to send · Replies from you sent as human (not AI)
            </Text>
          </VStack>
          <CTAButton
            onClick={handleSend}
            icon={FaPaperPlane}
            variant="solid"
            size="md"
            // Full-width primary CTA on mobile so the composer's send
            // action is thumb-obvious; hugs content on desktop.
            fullWidth={{ base: true, md: false }}
            isLoading={sending}
            loadingText={translateOnSend ? 'Translating…' : 'Sending…'}
            isDisabled={!replyText.trim()}
          >
            {translateOnSend ? 'Translate & Send' : 'Send'}
          </CTAButton>
        </Stack>
      </Box>
    </>
  );
}

function MessageBubble({ msg, adminPassword }: { msg: Message; adminPassword: string }) {
  const isInbound = msg.direction === 'inbound';
  const isAi = msg.sender === 'ai';

  const bg = isInbound ? 'white' : isAi ? '#fdf9f0' : '#c9a96e';
  const color = isInbound || isAi ? 'gray.800' : 'white';
  const senderLabel = isInbound
    ? 'They said'
    : isAi
    ? 'AI Assistant'
    : 'You (Vero)';
  const senderColor = isInbound
    ? 'gray.500'
    : isAi
    ? '#8a6e35'
    : '#8a6e35';
  const senderIcon = isInbound ? FaUser : isAi ? FaRobot : FaUser;

  const [translation, setTranslation] = useState<string | null>(null);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  const handleTranslate = async () => {
    if (translation || translating) return;
    setTranslating(true);
    setTranslateError(null);
    try {
      const res = await fetch('/api/admin/messages-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          text: msg.body,
          targetLang: VERO_LANG,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTranslation(data.translated);
        setDetectedLang(data.detectedLang || null);
      } else {
        setTranslateError(data.error || 'Translation failed');
      }
    } catch {
      setTranslateError('Could not reach the server');
    } finally {
      setTranslating(false);
    }
  };

  return (
    <Flex justify={isInbound ? 'flex-start' : 'flex-end'}>
      <Box maxW={{ base: '85%', md: '70%' }}>
        <Flex
          align="center"
          gap={1.5}
          mb={1}
          justify={isInbound ? 'flex-start' : 'flex-end'}
          color={senderColor}
        >
          <Icon as={senderIcon} boxSize={2.5} />
          <Text fontSize={{ base: 'xs', md: '2xs' }} fontWeight="500" letterSpacing="0.08em" textTransform="uppercase">
            {senderLabel}
          </Text>
        </Flex>
        <Box
          bg={bg}
          color={color}
          border={isInbound ? '1px solid' : 'none'}
          borderColor="gray.200"
          borderRadius="lg"
          px={{ base: 3.5, md: 4 }}
          py={{ base: 2.5, md: 3 }}
          fontSize="sm"
          lineHeight="1.6"
          whiteSpace="pre-wrap"
          wordBreak="break-word"
        >
          {msg.body}
        </Box>

        {/* Translation panel — only shown once Vero clicks Translate */}
        {(translation || translateError) && (
          <Box
            mt={1.5}
            bg="rgba(201, 169, 110, 0.06)"
            border="1px solid"
            borderColor="rgba(201, 169, 110, 0.3)"
            borderRadius="md"
            px={{ base: 3.5, md: 4 }}
            py={{ base: 2, md: 2.5 }}
          >
            {translation ? (
              <>
                <HStack spacing={1.5} mb={0.5} color="#8a6e35">
                  <Icon as={FaLanguage} boxSize={2.5} />
                  <Text fontSize={{ base: 'xs', md: '2xs' }} fontWeight="500" letterSpacing="0.08em" textTransform="uppercase">
                    Translated{detectedLang && detectedLang !== 'unknown' ? ` from ${detectedLang.toUpperCase()}` : ''}
                  </Text>
                </HStack>
                <Text
                  fontSize="sm"
                  color="gray.700"
                  lineHeight="1.6"
                  whiteSpace="pre-wrap"
                  wordBreak="break-word"
                >
                  {translation}
                </Text>
              </>
            ) : (
              <Text fontSize="xs" color="red.600">{translateError}</Text>
            )}
          </Box>
        )}

        <Flex
          mt={1.5}
          justify={isInbound ? 'space-between' : 'flex-end'}
          align="center"
          gap={2}
          direction={isInbound ? 'row' : 'row-reverse'}
        >
          {!translation && (
            <Box
              as="button"
              type="button"
              onClick={handleTranslate}
              display="inline-flex"
              alignItems="center"
              gap={1.5}
              fontSize="xs"
              fontWeight="500"
              color={translating ? 'gray.400' : '#8a6e35'}
              bg={translating ? 'gray.50' : 'rgba(201, 169, 110, 0.12)'}
              border="1px solid"
              borderColor={translating ? 'gray.200' : 'rgba(201, 169, 110, 0.4)'}
              _hover={translating ? undefined : {
                bg: 'rgba(201, 169, 110, 0.22)',
                borderColor: '#c9a96e',
                color: '#6b5424',
              }}
              cursor={translating ? 'default' : 'pointer'}
              // Mobile: taller + roomier so it actually clears the
              // 40px tap-target floor without ballooning on desktop.
              minH={{ base: '40px', md: 'auto' }}
              px={{ base: 3, md: 2.5 }}
              py={{ base: 1.5, md: 1 }}
              borderRadius="sm"
              disabled={translating}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon as={FaLanguage} boxSize={3} />
              {translating ? 'Translating…' : 'Translate'}
            </Box>
          )}
          <Text
            fontSize={{ base: 'xs', md: '2xs' }}
            color="gray.400"
            textAlign={isInbound ? 'left' : 'right'}
          >
            {formatFullTime(msg.sent_at)}
            {msg.ai_model && ` · ${msg.ai_model}`}
          </Text>
        </Flex>
      </Box>
    </Flex>
  );
}

function SelectPrompt() {
  return (
    <Flex flex={1} justify="center" align="center" p={8} direction="column" gap={3} color="gray.400">
      <Icon as={FaCommentDots} boxSize={10} />
      <Text fontSize="sm" fontWeight="300" textAlign="center">
        Select a conversation from the left to view messages.
      </Text>
    </Flex>
  );
}

function EmptyState() {
  return (
    <Box
      bg="white"
      border="1px dashed"
      borderColor="gray.300"
      borderRadius="sm"
      py={16}
      px={6}
      textAlign="center"
    >
      <Flex
        w="72px"
        h="72px"
        mx="auto"
        borderRadius="full"
        bg="#fdf9f0"
        border="1px solid"
        borderColor="#e8d9a8"
        align="center"
        justify="center"
        color="#c9a96e"
        mb={5}
      >
        <Icon as={FaCommentDots} boxSize={7} />
      </Flex>
      <Text fontSize="md" fontWeight="500" color="gray.800" mb={2}>
        No conversations yet
      </Text>
      <Text fontSize="sm" color="gray.500" fontWeight="300" maxW="380px" mx="auto" lineHeight="1.7">
        As soon as someone DMs @vero.art.photo, the conversation will
        appear here. The AI assistant will handle the first response
        automatically unless you pause it above.
      </Text>
    </Box>
  );
}

/**
 * AI-generated summary of the conversation so far — pinned above the
 * message thread so Vero can see what the customer wants, what
 * she's gathered, what to do next, and (critically) whether it's
 * actually worth her time (booking vs. spam solicitation) at a
 * glance. Collapsible so she can reclaim the vertical space once
 * she's read it.
 */
function SummaryCard({
  summary,
  loading,
  error,
  collapsed,
  onToggleCollapsed,
  language,
  onChangeLanguage,
  onRegenerate,
}: {
  summary: AiSummary | null;
  loading: boolean;
  error: string | null;
  // Collapse state is lifted so the parent can react (focus mode).
  collapsed: boolean;
  onToggleCollapsed: () => void;
  language: SummaryLang;
  onChangeLanguage: (l: SummaryLang) => void;
  onRegenerate: () => void;
}) {
  const classification = summary?.classification ?? 'unclear';
  const classMeta = CLASSIFICATION_META[classification] ?? CLASSIFICATION_META.unclear;
  const localized = readSummaryLocale(summary, language);

  // Label copy that changes with the language so the affordances read
  // naturally on both sides of the toggle.
  const strings = language === 'ru'
    ? { header: 'Сводка', asking: 'Спрашивает', gathered: 'Собрали', nextStep: 'Далее', tone: 'Тон',
        expandCta: 'Закрыть сводку — открыть чат', collapseCta: 'Открыть сводку',
        loadingLabel: 'Читаю переписку…', noSummary: 'Сводки пока нет.' }
    : { header: 'Thread summary', asking: 'Asking', gathered: 'Gathered', nextStep: 'Next step', tone: 'Tone',
        expandCta: 'Close summary — open chat', collapseCta: 'Open summary',
        loadingLabel: 'Reading the thread…', noSummary: 'No summary yet.' };

  return (
    <Box
      bg="white"
      borderLeft="3px solid"
      borderLeftColor={classMeta.borderColor}
      px={{ base: 3.5, md: 4 }}
      py={{ base: 2.5, md: 3 }}
      // In focus mode (expanded on mobile) the card takes the full
      // remaining viewport height so the body has room to breathe.
      minH={{ base: collapsed ? 'auto' : 'auto', lg: 'auto' }}
    >
      {/* Header row — always visible. Tap anywhere on the row to
          toggle collapse; the chevron and the label both grow on
          mobile so the affordance is obvious. */}
      <Flex justify="space-between" align="center" gap={2}>
        <Flex
          as="button"
          type="button"
          onClick={onToggleCollapsed}
          align="center"
          gap={2}
          flex={1}
          minW={0}
          bg="transparent"
          border="none"
          p={0}
          textAlign="left"
          cursor="pointer"
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Icon as={FaLightbulb} boxSize={3.5} color="#8a6e35" flexShrink={0} />
          <Text
            fontSize={{ base: 'xs', md: '2xs' }}
            fontWeight="600"
            letterSpacing={{ base: '0.12em', md: '0.14em' }}
            textTransform="uppercase"
            color="#8a6e35"
            flexShrink={0}
          >
            {strings.header}
          </Text>
          {summary && (
            <Badge
              bg={classMeta.bg}
              color={classMeta.color}
              fontSize={{ base: 'xs', md: '2xs' }}
              fontWeight="600"
              letterSpacing="0.08em"
              textTransform="uppercase"
              px={2}
              py={0.5}
              borderRadius="sm"
              flexShrink={0}
            >
              {classMeta.label}
            </Badge>
          )}
          {collapsed && localized.asking && (
            <Text fontSize="xs" color="gray.500" noOfLines={1} minW={0}>
              — {formatPhoneNumbersInText(localized.asking)}
            </Text>
          )}
        </Flex>

        {/* RU/EN pill toggle — only visible when the summary is
            expanded (in collapsed state the header row needs to stay
            compact). Small enough to sit inline. */}
        {!collapsed && (
          <HStack
            spacing={0}
            bg="gray.100"
            borderRadius="full"
            p="2px"
            flexShrink={0}
            aria-label="Summary language"
          >
            {(['ru', 'en'] as const).map((lang) => {
              const active = language === lang;
              return (
                <Box
                  key={lang}
                  as="button"
                  type="button"
                  onClick={() => onChangeLanguage(lang)}
                  px={2.5}
                  py={1}
                  minH="28px"
                  minW="34px"
                  fontSize="2xs"
                  fontWeight="600"
                  letterSpacing="0.1em"
                  color={active ? 'white' : 'gray.500'}
                  bg={active ? '#c9a96e' : 'transparent'}
                  borderRadius="full"
                  border="none"
                  cursor="pointer"
                  transition="all 0.15s"
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  {lang.toUpperCase()}
                </Box>
              );
            })}
          </HStack>
        )}

        {/* Regenerate — 44×44 tap target. */}
        <IconButton
          aria-label="Regenerate summary"
          icon={<Icon as={FaSync} boxSize={3.5} />}
          onClick={onRegenerate}
          isLoading={loading}
          variant="ghost"
          size="sm"
          minW="44px"
          minH="44px"
          color="gray.500"
          _hover={{ color: '#c9a96e' }}
          isDisabled={loading}
          flexShrink={0}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        />
      </Flex>

      {/* Body — hidden when collapsed */}
      {!collapsed && (
        <Box mt={3}>
          {loading && !summary ? (
            <Flex align="center" gap={2} py={2}>
              <Spinner size="xs" color="#c9a96e" />
              <Text fontSize="xs" color="gray.500">{strings.loadingLabel}</Text>
            </Flex>
          ) : error && !summary ? (
            <Text fontSize="xs" color="red.600">{error}</Text>
          ) : summary ? (
            <VStack align="stretch" spacing={2.5}>
              <Box>
                <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" letterSpacing="0.08em" textTransform="uppercase" mb={0.5}>
                  {strings.asking}
                </Text>
                <Text fontSize="sm" color="gray.800" lineHeight="1.5">
                  {formatPhoneNumbersInText(localized.asking)}
                </Text>
              </Box>

              {localized.gathered.length > 0 && (
                <Box>
                  <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" letterSpacing="0.08em" textTransform="uppercase" mb={1}>
                    {strings.gathered}
                  </Text>
                  <VStack align="stretch" spacing={0.5}>
                    {localized.gathered.map((fact, i) => (
                      <Flex key={i} gap={2} align="flex-start">
                        <Text fontSize="sm" color="#c9a96e" lineHeight="1.5">•</Text>
                        <Text fontSize="sm" color="gray.700" lineHeight="1.5">
                          {formatPhoneNumbersInText(fact)}
                        </Text>
                      </Flex>
                    ))}
                  </VStack>
                </Box>
              )}

              <Box>
                <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" letterSpacing="0.08em" textTransform="uppercase" mb={0.5}>
                  {strings.nextStep}
                </Text>
                <Text fontSize="sm" color="gray.800" lineHeight="1.5">
                  {formatPhoneNumbersInText(localized.nextStep)}
                </Text>
              </Box>

              {summary.tone && (
                <HStack spacing={2}>
                  <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.500" letterSpacing="0.08em" textTransform="uppercase">
                    {strings.tone}
                  </Text>
                  <Badge
                    bg="rgba(201, 169, 110, 0.15)"
                    color="#8a6e35"
                    fontSize={{ base: 'xs', md: '2xs' }}
                    fontWeight="500"
                    letterSpacing="0.05em"
                    textTransform="lowercase"
                    px={2}
                    py={0.5}
                    borderRadius="sm"
                  >
                    {summary.tone}
                  </Badge>
                </HStack>
              )}
            </VStack>
          ) : (
            <Text fontSize="xs" color="gray.500">{strings.noSummary}</Text>
          )}
        </Box>
      )}

      {/* Big obvious toggle CTA — always visible below the body so
          Vero can never miss the way back to (or into) the chat.
          When expanded on mobile: "Close summary — open chat".
          When collapsed: "Open summary".
          On desktop the summary is a companion above the chat so the
          "close for chat" affordance would be misleading — hide it
          there and let the chevron alone drive collapse. */}
      <Box
        mt={collapsed ? 2 : 3}
        display={{ base: 'block', lg: 'none' }}
      >
        <Box
          as="button"
          type="button"
          onClick={onToggleCollapsed}
          w="100%"
          bg={collapsed ? '#c9a96e' : 'rgba(201, 169, 110, 0.12)'}
          color={collapsed ? 'white' : '#8a6e35'}
          border="1px solid"
          borderColor={collapsed ? '#c9a96e' : 'rgba(201, 169, 110, 0.4)'}
          borderRadius="sm"
          px={4}
          py={3}
          minH="44px"
          fontSize="xs"
          fontWeight="600"
          letterSpacing="0.12em"
          textTransform="uppercase"
          cursor="pointer"
          transition="all 0.15s"
          _active={{ bg: collapsed ? '#b8964f' : 'rgba(201, 169, 110, 0.22)' }}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          gap={2}
        >
          <Icon as={collapsed ? FaChevronDown : FaChevronUp} boxSize={3} />
          {collapsed ? strings.collapseCta : strings.expandCta}
        </Box>
      </Box>
    </Box>
  );
}

// Visual treatment for each inquiry classification. Colors chosen so
// spam pops red (skip it), booking pops green (Vero should engage),
// and softer neutrals for everything in between.
const CLASSIFICATION_META: Record<
  InquiryClassification,
  { label: string; bg: string; color: string; borderColor: string }
> = {
  'booking-inquiry': {
    label: 'Booking inquiry',
    bg: 'green.100',
    color: 'green.800',
    borderColor: '#38A169',
  },
  'existing-client': {
    label: 'Existing client',
    bg: 'purple.100',
    color: 'purple.800',
    borderColor: '#805AD5',
  },
  'general-question': {
    label: 'General question',
    bg: 'blue.50',
    color: 'blue.700',
    borderColor: '#4299E1',
  },
  'collaboration-offer': {
    label: 'Collab offer',
    bg: 'yellow.100',
    color: 'yellow.800',
    borderColor: '#D69E2E',
  },
  'spam-or-unrelated': {
    label: 'Spam / unrelated',
    bg: 'red.100',
    color: 'red.700',
    borderColor: '#E53E3E',
  },
  unclear: {
    label: 'Unclear',
    bg: 'gray.100',
    color: 'gray.700',
    borderColor: '#c9a96e',
  },
};

/**
 * Modal for converting an IG DM conversation into a client portal.
 * Deliberately minimal: just the fields needed to create a simple-mode
 * portal (session type, display name, gallery password). Vero fills in
 * the rest — email, event date, contract, drive URL — later from the
 * Portals tab. This form is optimized for the first-touch moment where
 * she says "OK this is a real client, let me claim them" without
 * making her fill out a wall of fields she doesn't have answers to
 * yet.
 *
 * On create, the backend also flips conversations.linked_client_portal_id
 * so the inbox shows "Linked client" and the "Client" badge in the
 * sidebar row.
 */
function CreateClientModal({
  isOpen,
  onClose,
  adminPassword,
  conversationId,
  defaultDisplayName,
  aiSummary,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  adminPassword: string;
  conversationId: string;
  defaultDisplayName: string;
  aiSummary: AiSummary | null;
  onCreated: () => void | Promise<void>;
}) {
  const [sessionType, setSessionType] = useState<string>(
    () => inferSessionType(aiSummary) ?? 'portrait',
  );
  const [displayName, setDisplayName] = useState<string>(defaultDisplayName);
  const [galleryPassword, setGalleryPassword] = useState<string>(() => generateGalleryPassword());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the form each time the modal opens — a stale previous entry
  // (from a different conversation Vero cancelled out of) would be
  // confusing here.
  useEffect(() => {
    if (isOpen) {
      setSessionType(inferSessionType(aiSummary) ?? 'portrait');
      setDisplayName(defaultDisplayName);
      setGalleryPassword(generateGalleryPassword());
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const canSubmit =
    !submitting &&
    sessionType.trim().length > 0 &&
    displayName.trim().length > 0 &&
    galleryPassword.trim().length >= 4;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/portals-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          mode: 'simple',
          session_type: sessionType.trim(),
          client_display_name: displayName.trim(),
          gallery_password: galleryPassword.trim(),
          link_to_conversation_id: conversationId,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await onCreated();
      } else {
        setError(data.error || `Create failed (${res.status})`);
      }
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size={{ base: 'full', md: 'md' } as any}
      isCentered={{ base: false, md: true } as any}
      motionPreset="slideInBottom"
    >
      <ModalOverlay />
      <ModalContent
        borderRadius={{ base: 0, md: 'md' }}
        maxH={{ base: '100dvh', md: 'auto' }}
        mx={{ base: 0, md: 4 }}
      >
        <ModalHeader fontSize="md" fontWeight="500" color="gray.800">
          Convert to client
        </ModalHeader>
        <ModalCloseButton
          size={{ base: 'lg', md: 'md' } as any}
          top={{ base: 3, md: 2 }}
          right={{ base: 3, md: 2 }}
        />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <Text fontSize="xs" color="gray.500" lineHeight="1.6">
              Creates a simple-mode portal (gallery password only) and links it
              to this conversation. You can fill in email, event date, contract,
              and gallery URL later from the Portals tab.
            </Text>

            <FormControl>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                Session type
              </FormLabel>
              <Select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
                size={{ base: 'md', md: 'sm' }}
                fontSize={{ base: 'md', md: 'sm' }}
                bg="white"
              >
                <option value="portrait">Portrait</option>
                <option value="wedding">Wedding</option>
                <option value="family">Family</option>
                <option value="maternity">Maternity</option>
                <option value="engagement">Engagement</option>
                <option value="newborn">Newborn</option>
                <option value="other">Other</option>
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                Client display name
              </FormLabel>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Anna Petrova"
                size={{ base: 'md', md: 'sm' }}
                fontSize={{ base: 'md', md: 'sm' }}
                bg="white"
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                Gallery password
              </FormLabel>
              <InputGroup size={{ base: 'md', md: 'sm' }}>
                <Input
                  value={galleryPassword}
                  onChange={(e) => setGalleryPassword(e.target.value)}
                  placeholder="autogenerated"
                  fontSize={{ base: 'md', md: 'sm' }}
                  bg="white"
                  pr="4.5rem"
                />
                <InputRightElement width="4.5rem">
                  <Button
                    h="1.5rem"
                    size="xs"
                    variant="ghost"
                    color="#8a6e35"
                    onClick={() => setGalleryPassword(generateGalleryPassword())}
                  >
                    New
                  </Button>
                </InputRightElement>
              </InputGroup>
              <Text fontSize="2xs" color="gray.400" mt={1}>
                4+ characters. Client uses this to open their gallery once you deliver it.
              </Text>
            </FormControl>

            {(() => {
              // Prefer the English gathered facts for admin-facing display
              // in the CreateClient modal — the labels/copy around it are
              // English, so keeping them all in one language reads cleaner.
              const gathered = aiSummary ? readSummaryLocale(aiSummary, 'en').gathered : [];
              return gathered.length > 0 ? (
                <Box
                  bg="rgba(201, 169, 110, 0.06)"
                  border="1px solid"
                  borderColor="rgba(201, 169, 110, 0.3)"
                  borderRadius="sm"
                  p={3}
                >
                  <Text fontSize="2xs" color="#8a6e35" fontWeight="600" letterSpacing="0.08em" textTransform="uppercase" mb={1.5}>
                    From this conversation
                  </Text>
                  <VStack align="stretch" spacing={0.5}>
                    {gathered.map((fact, i) => (
                      <Flex key={i} gap={2} align="flex-start">
                        <Text fontSize="xs" color="#c9a96e">•</Text>
                        <Text fontSize="xs" color="gray.700" lineHeight="1.5">
                          {formatPhoneNumbersInText(fact)}
                        </Text>
                      </Flex>
                    ))}
                  </VStack>
                  <Text fontSize="2xs" color="gray.500" mt={2} lineHeight="1.5">
                    Add these to the portal (event date, email, etc.) from the
                    Portals tab after creating.
                  </Text>
                </Box>
              ) : null;
            })()}

            {error && (
              <Text fontSize="xs" color="red.600">{error}</Text>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter
          gap={2}
          pb={{ base: 'max(env(safe-area-inset-bottom), 16px)', md: 4 }}
        >
          <Stack direction={{ base: 'column-reverse', md: 'row' }} spacing={2} w="100%">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              isDisabled={submitting}
            >
              Cancel
            </Button>
            <CTAButton
              onClick={handleSubmit}
              icon={FaUserPlus}
              variant="solid"
              size="sm"
              isLoading={submitting}
              loadingText="Creating…"
              isDisabled={!canSubmit}
            >
              Create client
            </CTAButton>
          </Stack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/**
 * Best-effort session-type inference from the AI summary's `gathered`
 * facts. If the customer mentioned "wedding", "maternity", etc., we
 * preselect that value in the dropdown so Vero doesn't have to
 * re-read the thread to pick. Falls back to null → caller defaults
 * to portrait.
 */
function inferSessionType(summary: AiSummary | null): string | null {
  if (!summary) return null;
  // Use whichever locale has content — the inference regexes below
  // cover both English and Russian keywords so either language works.
  const en = readSummaryLocale(summary, 'en');
  const ru = readSummaryLocale(summary, 'ru');
  const blob = [en.asking, ...en.gathered, ru.asking, ...ru.gathered]
    .join(' ')
    .toLowerCase();
  if (/\bwedding|bride|groom|ceremony|reception|свадьб/.test(blob)) return 'wedding';
  if (/\bmatern|pregnan|belly|беремен/.test(blob)) return 'maternity';
  if (/\bnewborn|infant|baby (photo|shoot|session)|новорожд/.test(blob)) return 'newborn';
  if (/\bengagement|proposal|помолвк/.test(blob)) return 'engagement';
  if (/\bfamily|kids|children|дет|семейн/.test(blob)) return 'family';
  if (/\bportrait|headshot|individual|портрет/.test(blob)) return 'portrait';
  return null;
}

/**
 * Generate a short, memorable-ish gallery password. Format:
 *   <adjective><Noun><2 digits>
 * e.g. "goldenLight42", "warmForest17". Client will get this in the
 * gallery-ready email later; short enough to type on a phone.
 */
function generateGalleryPassword(): string {
  const adjs = ['golden', 'warm', 'soft', 'quiet', 'gentle', 'bright', 'wild', 'still', 'calm', 'amber'];
  const nouns = ['Light', 'Forest', 'Ocean', 'Meadow', 'Bloom', 'Dawn', 'Shore', 'Sky', 'Fern', 'Stone'];
  const adj = adjs[Math.floor(Math.random() * adjs.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 90 + 10);
  return `${adj}${noun}${num}`;
}

/**
 * Ask the backend to detect the language of the customer's most
 * recent inbound message. Used by translate-on-send to pick the
 * target language — more reliable than guessing from prior state
 * since customers can and do switch languages mid-thread.
 * Returns null if detection fails or there's no inbound to sample.
 */
async function inferCustomerLang(
  adminPassword: string,
  messages: Message[],
): Promise<string | null> {
  const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound');
  if (!lastInbound) return null;
  try {
    const res = await fetch('/api/admin/messages-translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        password: adminPassword,
        text: lastInbound.body,
        targetLang: VERO_LANG,
      }),
    });
    const data = await res.json();
    if (res.ok && data.success && typeof data.detectedLang === 'string' && data.detectedLang !== 'unknown') {
      return data.detectedLang;
    }
  } catch {
    // fall through
  }
  return null;
}

// ── Formatters ────────────────────────────────────────────────

function formatPreview(conv: ConversationSummary): string {
  const preview = conv.last_message_preview ?? '';
  if (conv.last_message_direction === 'inbound') return preview;
  const prefix = conv.last_message_sender === 'ai' ? 'AI: ' : 'You: ';
  return prefix + preview;
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;
  const diffWk = Math.floor(diffDay / 7);
  if (diffWk < 5) return `${diffWk}w`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default AdminMessages;
