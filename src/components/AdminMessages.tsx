import { createPortal } from 'react-dom';
import SubTabButton from './ui/SubTabButton';
import {
  Box,
  VStack,
  HStack,
  Text,
  Flex,
  Icon,
  Badge,
  Textarea,
  Spinner,
  useToast,
  Switch,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  Select,
  InputGroup,
  InputRightElement,
  Button,
  IconButton,
  Stack,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  } from '@chakra-ui/react'; import { useEffect,
  useState,
  useCallback,
  useRef } from 'react'; import {   FaInstagram,
  FaRobot,
  FaUser,
  FaSync,
  FaPaperPlane,
  FaPowerOff,
  FaCommentDots,
  FaExclamationTriangle,
  FaTimes,
  FaEnvelope,
  FaClipboardList,
  FaPenNib,
  FaCheckCircle,
  FaTrash,
  FaEye,
  FaEyeSlash,
  FaLanguage,
  FaLightbulb,
  FaChevronDown,
  FaChevronUp,
  FaUserPlus,
  FaExternalLinkAlt,
  FaChevronLeft,
  FaChevronRight,
  FaEraser,
  FaUserFriends,
  FaEllipsisV,
} from 'react-icons/fa';
import AdminAssistantChat from './AdminAssistantChat';
import CTAButton from './ui/CTAButton';
import ConfirmDialog from './ui/ConfirmDialog';
import VoiceInput from './ui/VoiceInput';
import { useAdminLang, type AdminT, type AdminLang } from '../i18n/admin';
import { loadDraft, saveDraft, clearDraft } from './draftStore';

// Vero speaks Russian natively — customer messages (usually English)
// get translated to Russian; her replies get translated to English
// before sending. If we ever localize this UI properly, flip this to
// a per-user setting.
const VERO_LANG = 'ru';

/**
 * On-demand translation of one piece of text.
 *
 * Extracted verbatim out of MessageBubble so the AI draft card can reuse it.
 * The draft card never had any way to translate itself: the Translate chip
 * lived only inside MessageBubble, and the draft is deliberately filtered out
 * of the bubble list, so the one message Vero has to read before approving it
 * was the one message she could not read.
 *
 * `targetLang` is the READER's language, not Vero's. It used to be the module
 * constant VERO_LANG, which is right for translate-on-send (what language the
 * outbound was composed in) and wrong here (what language the person looking
 * at the screen reads).
 */
function useTextTranslation(text: string, adminPassword: string, targetLang: string, t: AdminT) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const translate = async () => {
    if (translation || translating) return;
    setTranslating(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/messages-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, text, targetLang }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTranslation(data.translated);
        setDetectedLang(data.detectedLang || null);
      } else {
        setError(data.error || t.messages.translationFailed);
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setTranslating(false);
    }
  };

  return { translation, detectedLang, translating, error, translate };
}

/** The Translate chip. Same treatment everywhere it appears. */
function TranslateChip({
  translating,
  onClick,
  label,
  busyLabel,
}: {
  translating: boolean;
  onClick: () => void;
  label: string;
  busyLabel: string;
}) {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      display="inline-flex"
      alignItems="center"
      gap={1.5}
      fontSize="xs"
      fontWeight="500"
      color={translating ? 'gray.400' : 'brand.accentText'}
      bg={translating ? 'gray.50' : 'rgba(201, 169, 110, 0.12)'}
      border="1px solid"
      borderColor={translating ? 'gray.200' : 'rgba(201, 169, 110, 0.4)'}
      _hover={translating ? undefined : {
        bg: 'rgba(201, 169, 110, 0.22)',
        borderColor: 'brand.accent',
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
      {translating ? busyLabel : label}
    </Box>
  );
}

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
  /** Switch to the Assistant tab (see ASSISTANT_HANDOFF_KEY). */
  onOpenAssistant?: () => void;
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
  classification?: string | null;
  // null = no opinion, let the AI classification decide.
  is_promotional?: boolean | null;
  is_personal?: boolean;
  has_draft?: boolean;
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
  // Email-only. NULL for Instagram messages. When non-null on an
  // inbound, we show it as a subject line above the body; on an
  // outbound, it's what we sent to the customer as the Subject
  // header (auto-derived from the parent thread with a "Re: " prefix).
  subject?: string | null;
  in_reply_to?: string | null;
  // How THIS message arrived — distinct from the conversation's
  // platform, which is how we reply. A contact-form submission arrives
  // as 'form' inside a conversation whose platform is 'email'.
  channel?: 'instagram' | 'email' | 'form' | 'whatsapp' | 'sms';
  // 'draft' = written by the AI, never delivered, waiting on Vero.
  status?: 'sent' | 'draft' | 'failed';
  // Resend's last_event for outbound email. Absent on Instagram.
  delivery_state?: string | null;
}

export type InquiryClassification =
  | 'booking-inquiry'
  | 'existing-client'
  | 'general-question'
  | 'collaboration-offer'
  // A friend or acquaintance writing to Vero as a person. Deliberately its
  // own category: a bonfire invitation from a friend used to land in
  // spam-or-unrelated, which is both wrong and — because that classification
  // switches AI off for the thread — quietly permanent.
  | 'personal'
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

/** The three AI surfaces, cycled inside one panel per conversation. */
type AiPanelTab = 'summary' | 'reply' | 'assistant';

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

/**
 * Where a conversation parks a question on its way to the Assistant tab.
 *
 * sessionStorage rather than props or a route param because the two tabs
 * are siblings with no shared state, and the handoff is a one-shot
 * message, not app state — the Assistant reads it once on mount and
 * clears it. Survives the remount that switching tabs causes, which is
 * the whole point.
 */
export const ASSISTANT_HANDOFF_KEY = 'assistant-handoff-prompt';

/**
 * Which conversation has an open refine session. Survives a reload.
 * Exported because the Admin shell has to read it before this component
 * mounts: `dashTab` starts at 'clients' on every load, so without that check
 * a refresh would drop her on Clients and the restore below would never run.
 */
export const REFINE_SESSION_KEY = 'vero_refine_session';

const AdminMessages = ({ adminPassword, adminLevel, onOpenAssistant }: Props) => {
  const { t } = useAdminLang();
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null);
  const [globalAiState, setGlobalAiState] = useState<'on' | 'off'>('on');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Left rail fold. Default open; folds to avatars so the thread and the
  // refine panel have room.
  const [listCollapsed, setListCollapsed] = useState(false);
  // Refine panel. Opens as a THIRD column beside the thread rather than
  // navigating to the Assistant tab, which lost the conversation you were
  // reading and wiped anything already typed on the way back.
  //
  // The session is stored as the conversation it belongs to, in localStorage,
  // rather than as a boolean in React state. Vero was mid-refine on her phone,
  // scrolled, triggered a pull-to-refresh, and lost the panel: the transcript
  // itself survives (it lives in assistant_chats server-side) but she landed
  // back in Messages with no way to it except the Assistant tab. Now a reload
  // reopens the same conversation with the panel still up, and switching to
  // another thread and back restores it rather than discarding it. It ends
  // only when she closes it or the reply is sent.
  const [refineFor, setRefineFor] = useState<string | null>(() => {
    try {
      return localStorage.getItem(REFINE_SESSION_KEY);
    } catch {
      return null;
    }
  });
  const refineOpen = refineFor !== null && refineFor === selectedId;
  /**
   * Which AI surface the panel is showing. Summary and the generated reply used
   * to be separate cards stacked down the thread; they are tabs of one panel
   * now, so there is a single place the AI lives.
   */
  const [panelTab, setPanelTab] = useState<AiPanelTab>('summary');
  /**
   * Where ConversationView portals the Summary and Reply tab bodies. State, not
   * a ref, so the portal re-renders once the node exists.
   */
  const [panelBodyEl, setPanelBodyEl] = useState<HTMLDivElement | null>(null);
  /** Only needed for the dot on the Reply tab; the content lives downstream. */
  const [panelHasDraft, setPanelHasDraft] = useState(false);
  // Mobile only: roll the panel down to its header so the conversation behind
  // it is readable, then roll back up and keep typing. Distinct from closing,
  // which throws the chat away.
  const [refineCollapsed, setRefineCollapsed] = useState(false);
  // Restore whatever the rail was before the panel auto-folded it.
  const railBeforeRefine = useRef(false);

  const openRefinePanel = () => {
    if (!selectedId) return;
    railBeforeRefine.current = listCollapsed;
    setListCollapsed(true);
    setRefineCollapsed(false);
    // "Improve with assistant" means the assistant, specifically.
    setPanelTab('assistant');
    setRefineFor(selectedId);
    try {
      localStorage.setItem(REFINE_SESSION_KEY, selectedId);
    } catch {
      // Private browsing. The panel still works for this page view.
    }
  };
  /**
   * A sent reply ends the drafting, not the session. Closing the panel here
   * would throw away the very thing that was asked for: a panel that stays put
   * until it is closed by hand. Fall back to the summary, which is now
   * regenerating against the message that just went out.
   */
  const handleReplySentFromPanel = () => {
    setPanelTab('summary');
  };

  const closeRefinePanel = () => {
    setRefineFor(null);
    setRefineCollapsed(false);
    setListCollapsed(railBeforeRefine.current);
    try {
      localStorage.removeItem(REFINE_SESSION_KEY);
    } catch {
      /* ignore */
    }
  };

  // On a reload, reopen the conversation the refine session belongs to. The
  // panel is bound to that thread, so it does not follow her to a different
  // one — it would be refining the wrong person's draft — but it is waiting
  // when she comes back.
  // Mount only. The comment below used to claim that, but the effect re-ran on
  // every change: pressing back on a phone sets selectedId to null and this
  // instantly re-selected the thread, so the back button did nothing while a
  // refine session was open. Desktop never showed it because there is no back
  // button there. The ref makes the restore a one-shot on first commit, which
  // is all it was ever meant to be.
  const restoredRefineOnce = useRef(false);
  useEffect(() => {
    if (restoredRefineOnce.current) return;
    restoredRefineOnce.current = true;
    if (refineFor && selectedId === null) setSelectedId(refineFor);
  }, [refineFor, selectedId]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Confirm dialog state for the global AI pause. Replaces the old
  // window.confirm() call, which on iOS Safari showed a URL host in
  // the dialog title and truncated the (deliberately long) warning
  // message ugly.
  const [globalToggleConfirmOpen, setGlobalToggleConfirmOpen] = useState(false);
  const [globalToggleLoading, setGlobalToggleLoading] = useState(false);
  // Email signature editor. Lives at the tab level rather than inside a
  // conversation — it applies to every email Vero sends, not to one thread.
  const [signatureOpen, setSignatureOpen] = useState(false);
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
        setError(data.error || t.messages.loadFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setLoading(false);
    }
  }, [adminPassword, t]);

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
          title: t.messages.aiEnabledGlobally(next),
          status: next === 'on' ? 'success' : 'warning',
          duration: 3000,
          isClosable: true,
        });
      } else {
        toast({ title: data.error || t.messages.failedToUpdate, status: 'error', duration: 4000 });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 4000 });
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
          scrolling chase. Desktop always shows it.
          All actions live on the SAME row as the title (AI toggle pill
          + refresh icon) so nothing wraps to a second line. */}
      <Box display={{ base: showThreadOnMobile ? 'none' : 'block', lg: 'block' }}>
        <Flex align="flex-end" justify="space-between" mb={{ base: 4, md: 6 }} gap={2}>
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
              {t.messages.tabTitle}
            </Text>
            <Text fontSize={{ base: 'sm', md: 'sm' }} color="gray.500" fontWeight="300">
              {conversations
                ? t.messages.conversationCount(conversations.length)
                : t.messages.subtitle}
            </Text>
          </VStack>

          {/* Actions row — AI toggle pill (the pill IS the toggle now,
              not a status label + separate button) + refresh icon.
              For non-super admins the pill is a read-only status
              indicator that opens no confirm dialog on tap. */}
          <HStack spacing={2} flexShrink={0}>
            <GlobalAiTogglePill
              state={globalAiState}
              onClick={adminLevel === 'super' ? handleToggleGlobal : undefined}
            />
            <IconButton
              aria-label={t.messages.signatureEdit}
              title={t.messages.signatureEdit}
              icon={<Icon as={FaPenNib} boxSize={3.5} />}
              onClick={() => setSignatureOpen(true)}
              variant="ghost"
              size="md"
              minW="44px"
              minH="44px"
              color="gray.500"
              _hover={{ color: 'brand.accent' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            />
            <IconButton
              aria-label={t.common.refresh}
              icon={<Icon as={FaSync} boxSize={4} />}
              onClick={loadList}
              variant="ghost"
              size="md"
              minW="44px"
              minH="44px"
              color="gray.500"
              _hover={{ color: 'brand.accent' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            />
          </HStack>
        </Flex>

        {error && (
          <Box bg="red.50" border="1px solid" borderColor="red.200" p={3} mb={4} borderRadius="sm">
            <Text fontSize="sm" color="red.700">{error}</Text>
          </Box>
        )}
      </Box>

      {/* Global-AI confirm dialog (used by both Pause and Resume) */}
      <ConfirmDialog
        isOpen={globalToggleConfirmOpen}
        title={globalAiState === 'on' ? t.messages.pauseAll : t.messages.resumeAll}
        body={
          globalAiState === 'on'
            ? t.messages.pauseAllBody
            : t.messages.resumeAllBody
        }
        confirmLabel={globalAiState === 'on' ? t.messages.pauseAiConfirm : t.messages.resumeAiConfirm}
        danger={globalAiState === 'on'}
        isLoading={globalToggleLoading}
        onConfirm={doToggleGlobal}
        onCancel={() => setGlobalToggleConfirmOpen(false)}
      />

      {/* Email signature editor — applies to every email sent from the
          panel, so it lives here rather than inside a conversation. */}
      <SignatureModal
        isOpen={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        adminPassword={adminPassword}
      />

      {/* Two-pane on desktop, drill-down on mobile */}
      {loading ? (
        <Flex justify="center" py={16}>
          <Spinner color="brand.accent" />
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
            flex={{ base: '1', lg: listCollapsed ? '0 0 76px' : '0 0 360px' }}
            transition="flex-basis 0.2s ease"
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            borderRadius="sm"
            overflow={{ base: 'visible', lg: 'auto' }}
            maxH={{ base: 'auto', lg: '100%' }}
            display={{ base: showListOnMobile ? 'block' : 'none', lg: 'block' }}
          >
            {/* Fold control. Desktop only — on mobile the rail and the thread
                are already separate screens, so there is nothing to fold. */}
            <Flex
              display={{ base: 'none', lg: 'flex' }}
              justify={listCollapsed ? 'center' : 'flex-end'}
              align="center"
              px={2}
              py={1.5}
              position="sticky"
              top={0}
              bg="white"
              zIndex={1}
              borderBottom="1px solid"
              borderColor="gray.100"
            >
              <IconButton
                aria-label={listCollapsed ? t.messages.railExpand : t.messages.railCollapse}
                title={listCollapsed ? t.messages.railExpand : t.messages.railCollapse}
                icon={<Icon as={listCollapsed ? FaChevronRight : FaChevronLeft} boxSize={3} />}
                size="xs"
                variant="ghost"
                color="gray.500"
                onClick={() => setListCollapsed((v) => !v)}
              />
            </Flex>
            <ConversationList
              conversations={conversations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              collapsed={listCollapsed}
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
            // Full-screen fixed pane on mobile. NOTE: this sits BELOW the
            // admin bottom nav in stacking order (nav is z-30), so the nav
            // paints over the last ~80px. The composer compensates with
            // bottom padding rather than this pane shrinking, so the
            // message list still uses the full height.
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
                onOpenAssistant={onOpenAssistant}
                onRefine={openRefinePanel}
                onReplySent={closeRefinePanel}
                refineDocked={refineOpen && refineCollapsed}
                panelTab={panelTab}
                panelBodyEl={panelBodyEl}
                onPanelDraftChange={setPanelHasDraft}
                onPanelTabChange={setPanelTab}
              />
            ) : (
              <SelectPrompt />
            )}
          </Box>

          {/* Third column — refine the draft with the assistant WITHOUT
              leaving the thread. Previously this navigated to the Assistant
              tab, which meant losing sight of the conversation you were
              answering, and coming back wiped whatever you had typed. Keyed
              on a nonce so pressing "improve" again starts from the new
              draft; the chat picks up the parked prompt on mount.
              Full-screen on mobile, where a 420px column has nowhere to go. */}
          {refineOpen && (
            <Box
              flex={{ lg: '0 0 420px' }}
              bg="white"
              border={{ base: 'none', lg: '1px solid' }}
              borderColor="gray.200"
              borderRadius={{ base: 0, lg: 'sm' }}
              display="flex"
              flexDirection="column"
              overflow="hidden"
              position={{ base: 'fixed', lg: 'static' }}
              // Rolled down: unpin the top so the box is only as tall as its
              // header and the thread shows through above it.
              top={{ base: refineCollapsed ? 'auto' : 0, lg: 'auto' }}
              left={{ base: 0, lg: 'auto' }}
              right={{ base: 0, lg: 'auto' }}
              // Ends exactly where the admin bottom nav starts instead of
              // running underneath it (the nav is z-30 and paints over this
              // pane). Sitting flush also stops the dead strip that a
              // padding-based clearance leaves behind.
              bottom={{ base: 'calc(80px + env(safe-area-inset-bottom))', lg: 'auto' }}
              // Above the thread pane (25) so it covers it on mobile.
              zIndex={{ base: 26, lg: 'auto' }}
              h={{ base: 'auto', lg: 'auto' }}
              maxH={{ lg: '100%' }}
            >
              <Flex
                align="center"
                justify="space-between"
                px={3}
                py={2}
                borderBottom="1px solid"
                borderColor="gray.100"
                flexShrink={0}
              >
                {/* On mobile this row is the roll-up control: tap to drop the
                    panel to its header and read the thread, tap again to come
                    back to what you were typing. The chat is NOT unmounted, so
                    the draft survives. Inert on desktop, where the panel is a
                    column and nothing is covered. */}
                <HStack
                  as="button"
                  type="button"
                  spacing={2}
                  minW={0}
                  flex={1}
                  bg="transparent"
                  border="none"
                  p={0}
                  textAlign="left"
                  cursor={{ base: 'pointer', lg: 'default' }}
                  onClick={() => setRefineCollapsed((v) => !v)}
                  aria-label={
                    refineCollapsed ? t.messages.refineExpand : t.messages.refineCollapse
                  }
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <Icon as={FaRobot} boxSize={3.5} color="brand.accentText" />
                  <Text
                    fontSize="2xs"
                    fontWeight="600"
                    letterSpacing="0.14em"
                    textTransform="uppercase"
                    color="brand.accentText"
                    noOfLines={1}
                  >
                    {t.messages.refinePanelTitle}
                  </Text>
                  <Icon
                    as={FaChevronDown}
                    boxSize={2.5}
                    color="gray.400"
                    display={{ base: 'block', lg: 'none' }}
                    transform={refineCollapsed ? 'rotate(180deg)' : 'rotate(0deg)'}
                    transition="transform 0.2s ease"
                  />
                </HStack>
                <IconButton
                  aria-label={t.messages.refineClose}
                  title={t.messages.refineClose}
                  icon={<Icon as={FaTimes} boxSize={3} />}
                  size="xs"
                  variant="ghost"
                  color="gray.500"
                  onClick={closeRefinePanel}
                />
              </Flex>
              {/* The segmented control lives INSIDE the collapsible body, not
                  in the header. The composer's mobile clearance math assumes
                  the rolled-down bar is one header tall; a strip in the header
                  would push Send back underneath it. */}
              <Box
                flex="1"
                minH={0}
                overflow="hidden"
                display={{ base: refineCollapsed ? 'none' : 'flex', lg: 'flex' }}
                flexDirection="column"
              >
                <Flex borderBottom="1px solid" borderColor="gray.200" flexShrink={0}>
                  <SubTabButton
                    active={panelTab === 'summary'}
                    icon={FaLightbulb}
                    label={t.messages.aiTabSummary}
                    onClick={() => setPanelTab('summary')}
                  />
                  <SubTabButton
                    active={panelTab === 'reply'}
                    icon={FaPaperPlane}
                    label={t.messages.aiTabReply}
                    onClick={() => setPanelTab('reply')}
                    badge={
                      panelHasDraft ? (
                        <Box w="6px" h="6px" borderRadius="full" bg="brand.accent" flexShrink={0} />
                      ) : undefined
                    }
                  />
                  <SubTabButton
                    active={panelTab === 'assistant'}
                    icon={FaRobot}
                    label={t.messages.aiTabAssistant}
                    onClick={() => setPanelTab('assistant')}
                  />
                </Flex>

                {/* Summary and Reply are rendered by ConversationView, which
                    owns that state, and portalled in here. A portal follows the
                    REACT tree, so context still resolves, while the DOM node
                    stays a sibling of the thread pane — which it has to be:
                    inside the pane it would inherit a fixed, z-25, overflow
                    hidden stacking context and the bottom-clearance math would
                    stop holding. */}
                <Box
                  ref={setPanelBodyEl}
                  flex="1"
                  minH={0}
                  overflowY="auto"
                  display={panelTab === 'assistant' ? 'none' : 'block'}
                />
                {/* The chat stays mounted across tab switches. Unmounting it
                    would throw away whatever was typed, which is the whole
                    thing this panel was failing at. */}
                <Box
                  flex="1"
                  minH={0}
                  overflow="hidden"
                  display={panelTab === 'assistant' ? 'block' : 'none'}
                >
                  <AdminAssistantChat
                    adminPassword={adminPassword}
                    embedded
                    conversationId={selectedId}
                    onReplySent={handleReplySentFromPanel}
                  />
                </Box>
              </Box>
            </Box>
          )}
        </Flex>
      )}
    </Box>
  );
};

/**
 * Global-AI pill in the messages header. Doubles as the toggle button
 * — tap flips AI on/off globally (super-admin only; regular admins
 * see it as a read-only status indicator). Green when on, orange when
 * off; a small dot inside pulses when off to signal that auto-replies
 * are currently silenced.
 *
 * Merged from what used to be TWO elements — a green indicator badge
 * + a separate "Pause AI globally" CTAButton eating a whole row. Alex
 * flagged the two-element pattern as wasteful; the pill IS the toggle.
 */
function GlobalAiTogglePill({
  state,
  onClick,
}: {
  state: 'on' | 'off';
  onClick?: () => void;
}) {
  const { t } = useAdminLang();
  const interactive = Boolean(onClick);
  const config =
    state === 'on'
      ? { bg: 'green.100', color: 'green.700', dot: 'green.500', label: t.messages.aiOn, title: t.messages.tapToPause }
      : { bg: 'orange.100', color: 'orange.700', dot: 'orange.500', label: t.messages.aiPaused, title: t.messages.tapToResume };
  // The dynamic `as` swaps between a real <button> and a <div> based
  // on whether we have an onClick — regular admins get a read-only
  // pill, super gets a clickable toggle. Chakra's polymorphic `as`
  // typing can't narrow this so we cast the props bag; behavior is
  // safe (button-only props are simply ignored on the div path).
  const ButtonOrDiv: any = interactive ? 'button' : 'div';
  return (
    <Box
      as={ButtonOrDiv}
      {...(interactive ? { type: 'button', 'aria-label': config.title, title: config.title } : {})}
      onClick={onClick}
      display="inline-flex"
      alignItems="center"
      gap={2}
      px={{ base: 3, md: 3 }}
      py={{ base: 2, md: 1.5 }}
      minH={{ base: '40px', md: 'auto' }}
      bg={config.bg}
      color={config.color}
      // Interactive pill gets a visible border + shadow so it reads
      // unambiguously as a BUTTON (Alex flagged that the flat pill
      // looked like just a label). Non-interactive stays flat.
      border={interactive ? '1px solid' : 'none'}
      borderColor={
        interactive
          ? state === 'on'
            ? 'green.300'
            : 'orange.300'
          : 'transparent'
      }
      borderRadius="full"
      fontSize={{ base: 'xs', md: '2xs' }}
      fontWeight="600"
      letterSpacing="0.1em"
      textTransform="uppercase"
      cursor={interactive ? 'pointer' : 'default'}
      transition="all 0.15s"
      _hover={interactive ? { filter: 'brightness(0.95)', transform: 'translateY(-1px)' } : {}}
      _active={interactive ? { transform: 'scale(0.96)' } : {}}
      boxShadow={interactive ? '0 1px 3px -1px rgba(0, 0, 0, 0.15)' : 'none'}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Box
        as="span"
        w="6px"
        h="6px"
        borderRadius="full"
        bg={config.dot}
        sx={state === 'off' ? {
          animation: 'veroPulse 1.6s ease-in-out infinite',
          '@keyframes veroPulse': {
            '0%, 100%': { opacity: 1, transform: 'scale(1)' },
            '50%': { opacity: 0.4, transform: 'scale(0.85)' },
          },
        } : {}}
      />
      {config.label}
      {/* Power icon inside the pill so its interactivity is legible
          at a glance — Alex specifically flagged that the plain
          pill "still looks like a label." Only shown for super. */}
      {interactive && (
        <Icon as={FaPowerOff} boxSize={2.5} opacity={0.75} />
      )}
    </Box>
  );
}

function ConversationList({
  conversations,
  selectedId,
  onSelect,
  collapsed = false,
}: {
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Folded rail — drop the section chrome, it cannot fit in 76px. */
  collapsed?: boolean;
}) {
  const { t } = useAdminLang();
  const [showPromotional, setShowPromotional] = useState(false);
  const [showPersonal, setShowPersonal] = useState(false);

  // Marketing mail, cold pitches and review notifications all land in
  // the same inbox as real clients, because filtering them at ingest
  // would mean silently losing anything misclassified — and a lost
  // client is far worse than a visible advert. So they're ingested,
  // classified, and folded out of the way HERE, where a mistake costs
  // one click instead of a booking.
  //
  // A thread Vero has open stays visible regardless, so the list can't
  // yank the conversation she's reading out from under her.
  // Two signals, either one folds. The AI classification only exists for
  // threads that have been opened (summaries are generated on demand), so
  // for the marketing mail Vero never opens — which is most of it — her
  // manual flag is the one that actually does the work.
  // Vero's explicit choice wins; otherwise the AI classification decides.
  // `?? ` rather than `||` matters — an explicit FALSE ("show this") has
  // to beat a spam-or-unrelated classification, which is the whole point
  // of the column being nullable.
  const isPromotional = (c: ConversationSummary) =>
    (c.is_promotional ?? c.classification === 'spam-or-unrelated') && c.id !== selectedId;

  // Personal is checked FIRST and is a plain boolean — no classifier competes
  // with it, so there is no nullable "no opinion" state like is_promotional has.
  // A thread can only be in one bucket; personal wins so a friend who also
  // trips the spam classifier still lands in Personal rather than Promotional.
  const isPersonal = (c: ConversationSummary) => !!c.is_personal && c.id !== selectedId;

  const personal = conversations.filter(isPersonal);
  const primary = conversations.filter((c) => !isPersonal(c) && !isPromotional(c));
  const promotional = conversations.filter((c) => !isPersonal(c) && isPromotional(c));

  if (collapsed) {
    // Personal and promotional stay reachable — they are just not separated
    // by headers, because a 76px rail has nowhere to put them.
    const all = [...primary, ...personal, ...promotional];
    return (
      <VStack spacing={0} align="stretch" divider={<Box h="1px" bg="gray.100" />}>
        {all.map((c) => (
          <ConversationListRow
            key={c.id}
            conv={c}
            isSelected={c.id === selectedId}
            onClick={() => onSelect(c.id)}
            compact
          />
        ))}
      </VStack>
    );
  }

  return (
    <VStack spacing={0} align="stretch" divider={<Box h="1px" bg="gray.100" />}>
      {primary.map((c) => (
        <ConversationListRow
          key={c.id}
          conv={c}
          isSelected={c.id === selectedId}
          onClick={() => onSelect(c.id)}
        />
      ))}

      {personal.length > 0 && (
        <Box
          as="button"
          onClick={() => setShowPersonal((v) => !v)}
          py={2.5}
          px={4}
          textAlign="left"
          bg="gray.50"
          _hover={{ bg: 'gray.100' }}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Text fontSize="xs" color="gray.500" fontWeight="500">
            {showPersonal ? t.messages.hidePersonal : t.messages.showPersonal(personal.length)}
          </Text>
        </Box>
      )}

      {showPersonal &&
        personal.map((c) => (
          <ConversationListRow
            key={c.id}
            conv={c}
            isSelected={c.id === selectedId}
            onClick={() => onSelect(c.id)}
          />
        ))}

      {promotional.length > 0 && (
        <Box
          as="button"
          onClick={() => setShowPromotional((v) => !v)}
          py={2.5}
          px={4}
          textAlign="left"
          bg="gray.50"
          _hover={{ bg: 'gray.100' }}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          <Text fontSize="xs" color="gray.500" fontWeight="500">
            {showPromotional
              ? t.messages.hidePromotional
              : t.messages.showPromotional(promotional.length)}
          </Text>
        </Box>
      )}

      {showPromotional &&
        promotional.map((c) => (
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
  compact = false,
}: {
  conv: ConversationSummary;
  isSelected: boolean;
  onClick: () => void;
  /** Rail is folded: avatar only, so the thread gets the width back. */
  compact?: boolean;
}) {
  const { t } = useAdminLang();
  const displayName =
    conv.contact_name ||
    conv.contact_handle ||
    conv.linked_client_display_name ||
    (conv.platform === 'email'
      ? t.messages.emailSenderFallback(conv.external_user_id)
      : t.messages.instagramUserFallback(conv.external_user_id.slice(-6)));

  if (compact) {
    // Folded rail. Avatar plus an unread dot is enough to find a thread you
    // were just in; the name and preview come back when it unfolds.
    return (
      <Box
        as="button"
        type="button"
        onClick={onClick}
        w="100%"
        py={2.5}
        display="flex"
        justifyContent="center"
        position="relative"
        title={displayName}
        aria-label={displayName}
        bg={isSelected ? 'rgba(201, 169, 110, 0.08)' : 'transparent'}
        borderLeft="3px solid"
        borderLeftColor={isSelected ? 'brand.accent' : 'transparent'}
        _hover={isSelected ? {} : { bg: 'gray.50' }}
        cursor="pointer"
        sx={{ WebkitTapHighlightColor: 'transparent' }}
        transition="background 0.15s"
      >
        <PlatformAvatar
          platform={conv.platform}
          profilePicUrl={conv.contact_profile_pic_url}
          displayName={displayName}
        />
        {conv.unread_count > 0 && (
          <Box
            position="absolute"
            top="6px"
            right="10px"
            w="9px"
            h="9px"
            borderRadius="full"
            bg="brand.accent"
            border="2px solid white"
          />
        )}
      </Box>
    );
  }

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
      borderLeftColor={isSelected ? 'brand.accent' : 'transparent'}
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
                {formatRelative(conv.last_message_at, t)}
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
              ? formatPreview(conv, t)
              : t.messages.noMessagesYet}
          </Text>
          <HStack spacing={2} wrap="wrap" mt={0.5}>
            {/* The field was already on the type and already returned by
                _messages-list; nothing rendered it, so a waiting draft was
                invisible from the inbox and you had to open each thread to
                find one. */}
            {conv.has_draft && (
              <Badge
                bg="brand.accent"
                color="white"
                fontSize={{ base: 'xs', md: '2xs' }}
                fontWeight="500"
                letterSpacing="0.08em"
                textTransform="uppercase"
                px={1.5}
                py={0}
                borderRadius="sm"
              >
                {t.messages.aiDraftWaiting}
              </Badge>
            )}
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
                {t.messages.needsVero}
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
                {t.messages.clientBadge}
              </Badge>
            )}
            {conv.unread_count > 0 && (
              <Badge
                bg="brand.accent"
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
  // Platform-specific badge shown as a small corner sticker on the
  // conversation avatar. IG uses the Instagram brand gradient;
  // email uses the muted gold that matches the rest of admin
  // (envelope glyph); anything else falls back to a neutral gray
  // chat bubble so a new platform still renders sensibly before
  // we've styled it.
  const platformIcon =
    platform === 'instagram' ? FaInstagram
      : platform === 'email' ? FaEnvelope
      : FaCommentDots;
  const platformGradient =
    platform === 'instagram'
      ? 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)'
      : platform === 'email'
        ? 'linear-gradient(135deg, #c9a96e, #b8964f)'
        : 'linear-gradient(135deg, #4a5568, #718096)';
  return (
    <Box position="relative" flexShrink={0}>
      <Box
        // position: the <img> below is absolutely positioned to cover this
        // circle exactly. Without this it would anchor to the outer relative
        // Box, which also contains the corner platform badge.
        position="relative"
        w="44px"
        h="44px"
        borderRadius="full"
        overflow="hidden"
        // Always the dark fill, never gray.100. The initials sit underneath the
        // image now, so a light background would render white-on-light the
        // moment a broken avatar reveals them. When the image loads it covers
        // this completely (objectFit cover at 100%/100%), so the fill is only
        // ever visible when there is no usable image — which is exactly when
        // the initials need contrast.
        bg="gray.700"
        display="flex"
        alignItems="center"
        justifyContent="center"
        color="white"
        fontWeight="500"
        fontSize="sm"
      >
        {/* Initials are rendered underneath, always. The <img> sits on top and
            simply removes ITSELF on error, revealing them.

            Instagram pre-signs these cdninstagram URLs and they expire in
            24-72h (as little as 1-3h during a CDN rotation). A daily cron now
            refreshes them, but a URL can still die between runs — and with no
            onError this rendered as a broken-image glyph, which is what Vero
            was seeing across the whole inbox.

            Done by mutating the DOM node rather than with useState so this
            component stays hook-free (it is rendered inside two different list
            maps), matching the handleTileError pattern already used in
            InstagramFeed. No dep array means no exhaustive-deps risk, and
            `npm run lint` runs with --max-warnings 0. */}
        {initials(displayName)}
        {profilePicUrl ? (
          <Box
            as="img"
            src={profilePicUrl}
            alt={displayName}
            w="100%"
            h="100%"
            objectFit="cover"
            position="absolute"
            inset={0}
            onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : null}
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
  onOpenAssistant,
  onRefine,
  onReplySent,
  refineDocked = false,
  panelTab = 'summary',
  panelBodyEl = null,
  onPanelDraftChange,
  onPanelTabChange,
}: {
  summary: ConversationSummary;
  adminPassword: string;
  onRefreshList: () => void;
  /** Open the refine panel beside this thread (desktop) instead of
   *  navigating away to the Assistant tab. */
  onRefine?: () => void;
  /** A reply actually went out — the refine panel has served its purpose. */
  onReplySent?: () => void;
  /** The refine panel is rolled down to its bar, which sits over this pane. */
  refineDocked?: boolean;
  /** Which AI tab the panel is showing. Drives what gets portalled. */
  panelTab?: AiPanelTab;
  /** Portal target inside the panel, owned by the parent. */
  panelBodyEl?: HTMLDivElement | null;
  /** Lets the parent put a dot on the Reply tab without owning the draft. */
  onPanelDraftChange?: (hasDraft: boolean) => void;
  onPanelTabChange?: (tab: AiPanelTab) => void;
  // Mobile back-navigation. On desktop this is unused (SelectPrompt
  // handles the "no thread open" state), but on mobile the parent
  // uses it to close the drill-down.
  onBack?: () => void;
  onOpenAssistant?: () => void;
}) {
  const { t, lang: adminLang } = useAdminLang();
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Restored per conversation. ConversationView is already keyed by
  // conversation, so this remounts on every thread switch and the scoping
  // falls out of that for free.
  const [replyText, setReplyText] = useState(() => loadDraft('reply', summary.id));

  useEffect(() => {
    const id = window.setTimeout(() => saveDraft('reply', summary.id, replyText), 400);
    return () => window.clearTimeout(id);
  }, [replyText, summary.id]);

  const replyTextRef = useRef(replyText);
  replyTextRef.current = replyText;
  useEffect(() => {
    const flush = () => saveDraft('reply', summary.id, replyTextRef.current);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [summary.id]);
  const [discardingDraft, setDiscardingDraft] = useState(false);
  // Text the server flagged as a repeat, held while Vero decides.
  const [duplicateText, setDuplicateText] = useState<string | null>(null);

  // The AI's unsent suggestion, if it left one. Only ever present on
  // non-Instagram channels — see the dispatch in api/_ai-reply.ts.
  const pendingDraft = messages.find((m) => m.status === 'draft') ?? null;
  // Keyed on the draft body via the hook's own state: a new draft arrives as a
  // different ConversationView render, and discarding clears the card entirely.
  const {
    translation: draftTranslation,
    translating: draftTranslating,
    error: draftTranslateError,
    translate: translateDraft,
  } = useTextTranslation(pendingDraft?.body ?? '', adminPassword, adminLang, t);

  useEffect(() => {
    onPanelDraftChange?.(!!pendingDraft);
  }, [pendingDraft, onPanelDraftChange]);

  // "This draft isn't right" → hand the whole situation to the Assistant.
  //
  // The prompt names the person and quotes the draft, so Vero doesn't have
  // to re-explain which thread she means or paste anything. The assistant
  // already has list_conversations / read_thread / send_reply, so it can
  // pull the real history, revise with her, and send when she approves —
  // the loop she currently does by pasting into ChatGPT.
  const handleRefineWithAssistant = () => {
    const who = displayName;
    const draft = pendingDraft?.body ?? '';
    sessionStorage.setItem(
      ASSISTANT_HANDOFF_KEY,
      `Help me improve the reply to ${who}. Read the conversation first. Here's the draft I have:\n\n${draft}\n\nWhat I'd change: `,
    );
    // Prefer the in-place panel; fall back to the Assistant tab only if the
    // parent did not provide one.
    if (onRefine) onRefine();
    else onOpenAssistant?.();
  };

  // Is this thread currently folded out of the inbox — for EITHER reason?
  // The button used to reflect only the manual flag, so an
  // auto-classified thread showed "hide" while already hidden, and
  // pressing it appeared to do nothing.
  const isHidden =
    detail?.is_promotional ?? summary.classification === 'spam-or-unrelated';

  const handleTogglePromotional = async () => {
    const next = !isHidden;
    try {
      const res = await fetch('/api/admin/messages-mark-promotional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          conversationId: summary.id,
          promotional: next,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: next ? t.messages.markedPromotional : t.messages.unmarkedPromotional,
          status: 'success',
          duration: 3000,
        });
        await loadDetail();
        onRefreshList();
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 3000 });
    }
  };

  // Personal is a plain boolean with one writer, so unlike isHidden there is no
  // classifier to fall back to — detail?.is_personal is the whole truth.
  const isPersonalThread = !!detail?.is_personal;

  const handleTogglePersonal = async () => {
    const next = !isPersonalThread;
    try {
      const res = await fetch('/api/admin/messages-mark-personal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          conversationId: summary.id,
          personal: next,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: next ? t.messages.markedPersonal : t.messages.unmarkedPersonal,
          status: 'success',
          duration: 3000,
        });
        await loadDetail();
        onRefreshList();
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 3000 });
    }
  };

  const handleDiscardDraft = async () => {
    setDiscardingDraft(true);
    try {
      const res = await fetch('/api/admin/messages-draft-discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, conversationId: summary.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t.messages.draftDiscarded, status: 'success', duration: 2000 });
        await loadDetail();
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 3000 });
    } finally {
      setDiscardingDraft(false);
    }
  };
  const [sending, setSending] = useState(false);
  const [aiToggleLoading, setAiToggleLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [aiSummaryLoading, setAiSummaryLoading] = useState(false);
  const [aiSummaryError, setAiSummaryError] = useState<string | null>(null);
  // Translate-before-sending defaults to ON. Vero speaks Russian
  // natively; if the toggle were OFF by default and she typed in
  // Russian, her reply would ship to an English-speaking customer
  // untranslated — the worst-case failure. With it ON by default,
  // the worst case is she types in English and the translate step
  // is a no-op (English → English, ignored server-side). Alex's
  // ask, explicitly.
  const [translateOnSend, setTranslateOnSend] = useState(true);
  const [createClientOpen, setCreateClientOpen] = useState(false);
  // Summary is EXPANDED by default when a conversation opens (per
  // Alex's ask — the summary is the first thing you want to see, not
  // the chat scroll). Vero taps the collapse chevron to reveal the
  // chat + composer. On mobile this drives "focus mode": when
  // expanded, the chat + composer are hidden entirely so the summary
  // gets the full viewport.
  // Collapsed on open. Expanded, the summary card owned most of the pane and
  // pushed the actual conversation below the fold — the thread is what you
  // came to read. The header row stays visible with the one-line "asking"
  // gist, so nothing is hidden, just folded.

  // Summary language toggle. Defaults to Russian since Vero speaks
  // Russian — but the toggle lets an admin flip to English when
  // helping her out. Persisted per-browser (localStorage) so the
  // choice sticks across sessions.
  // Follows the global admin language unless she has explicitly overridden it
  // for the summary content. It used to default to a hardcoded 'ru' AND persist
  // on mount, so the key was populated on the very first render and the
  // "nothing stored, follow the global language" path could never run.
  // Persisting now happens in the change handler, not on mount.
  const [summaryLang, setSummaryLang] = useState<SummaryLang>(() => {
    if (typeof window === 'undefined') return adminLang;
    const stored = window.localStorage.getItem('vero_summary_lang');
    return stored === 'ru' || stored === 'en' ? stored : adminLang;
  });
  const changeSummaryLang = (l: SummaryLang) => {
    setSummaryLang(l);
    try {
      window.localStorage.setItem('vero_summary_lang', l);
    } catch {
      /* private mode */
    }
  };
  // AI-off banner dismiss state — the banner auto-opens whenever a
  // conversation with AI disabled is opened, but Vero can dismiss it
  // for the current session (state resets when the ConversationView
  // remounts on selecting a different thread) so it stops eating
  // vertical space once she's acknowledged it.
  const [aiOffBannerDismissed, setAiOffBannerDismissed] = useState(false);
  // "Wipe conversation" test-reset (super-only). Confirm-dialog open
  // state + in-flight flag for the button spinner. Separate from other
  // destructive flows in this pane so the copy + confirm are specific.
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
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
          setAiSummaryError(data.error || t.messages.summaryNone);
        }
      } catch {
        setAiSummaryError(t.common.couldNotReach);
      } finally {
        setAiSummaryLoading(false);
      }
    },
    [adminPassword, summary.id, t],
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
        setError(data.error || t.messages.loadFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setLoading(false);
    }
  }, [adminPassword, summary.id, t]);

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

  // Refresh the OPEN thread when new mail lands in it.
  //
  // The effect above only fires on summary.id, so a message arriving in
  // the conversation Vero is currently reading was invisible until she
  // clicked away and back — the rail showed the unread badge while the
  // thread beside it sat frozen.
  //
  // This rides the list's existing 30s poll (POLL_INTERVAL_MS) rather
  // than adding a second timer: that poll already refreshes
  // summary.last_message_at, so a change in it is exactly the signal
  // "this thread has something new."
  //
  // The ref is keyed on id|timestamp so switching conversations does not
  // masquerade as new mail — that case is already handled above, and
  // double-fetching would race the two loads.
  const lastSeenRef = useRef<string>(`${summary.id}|${summary.last_message_at ?? ''}`);
  useEffect(() => {
    const key = `${summary.id}|${summary.last_message_at ?? ''}`;
    if (key === lastSeenRef.current) return;
    const sameConversation = lastSeenRef.current.startsWith(`${summary.id}|`);
    lastSeenRef.current = key;
    if (!sameConversation) return;

    void loadDetail();
    // She is looking at the thread, so the message is read the moment it
    // renders. Without this the badge would sit there while she reads it.
    (async () => {
      try {
        await fetch('/api/admin/messages-mark-read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword, conversationId: summary.id }),
        });
        onRefreshList();
      } catch {
        // silent — a stale badge is not worth surfacing an error for
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.id, summary.last_message_at]);

  // Auto-scroll to bottom on new messages / initial load.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // NOTE: `handleRefreshProfile` used to live here — see git history.
  // Removed because profile refresh is a per-conversation nicety that
  // Vero would use approximately never (IG names/pfps rarely change),
  // and its icon looked like all the other refresh-y icons in the
  // header. Auto-fetch on webhook creation covers the common case.
  // The admin endpoint /api/admin/_messages-refresh-profile.ts is
  // also gone.

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
        toast({ title: data.error || t.messages.failedToUpdate, status: 'error', duration: 3000 });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 3000 });
    } finally {
      setAiToggleLoading(false);
    }
  };

  // "Wipe conversation" — super-admin test-reset. Deletes every
  // message on this thread and clears the AI summary cache, but leaves
  // the conversation row intact (external_user_id, contact_name, etc.)
  // so the next inbound DM from the same account lands right back here
  // and the AI reads a truly-fresh thread. Alex uses this to test the
  // assistant as if the customer just messaged for the first time.
  // Remove the conversation entirely. The eraser beside this only wipes
  // MESSAGES and keeps the row — deliberate, so a re-test lands back in
  // the same thread — but that leaves dead empty rows in the inbox with
  // no way to clear them. This is the way out.
  const doDelete = async () => {
    setDeleteLoading(true);
    try {
      const res = await fetch('/api/admin/messages-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, conversationId: summary.id }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t.messages.deleted, status: 'success', duration: 3000 });
        setDeleteConfirmOpen(false);
        // The thread we're looking at no longer exists — go back to the
        // list before refreshing it, or the detail pane renders a 404.
        // onBack is optional (desktop passes nothing; SelectPrompt takes
        // over there once the list no longer contains this id).
        onBack?.();
        onRefreshList();
      } else {
        toast({
          title: data.error || t.messages.deleteFailed,
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 3000 });
    } finally {
      setDeleteLoading(false);
    }
  };

  const doReset = async () => {
    setResetLoading(true);
    try {
      const res = await fetch('/api/admin/messages-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          conversationId: summary.id,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Local state clear so the UI reflects the wipe immediately
        // without waiting on a re-fetch.
        setMessages([]);
        setAiSummary(null);
        setAiSummaryError(null);
        toast({
          title: t.messages.resetSuccess(data.deletedMessages ?? 0),
          status: 'success',
          duration: 4000,
          isClosable: true,
        });
        onRefreshList();
      } else {
        toast({
          title: data.error || t.messages.resetFailed,
          status: 'error',
          duration: 4000,
          isClosable: true,
        });
      }
    } catch {
      toast({ title: t.common.couldNotReach, status: 'error', duration: 4000 });
    } finally {
      setResetLoading(false);
      setResetConfirmOpen(false);
    }
  };

  // Re-send a message that bounced.
  //
  // Goes back through the normal send path rather than "un-bouncing" the
  // old row: it creates a fresh attempt with its own delivery tracking,
  // so the thread honestly shows one failed and one successful send
  // rather than a row that silently changes its mind.
  //
  // Translation is skipped — the stored body is already in the
  // customer's language (it was translated on the first attempt), and
  // running it through again would translate a translation. The
  // signature is already on the stored text and appendSignatureText is
  // idempotent, so it isn't doubled.
  const handleRetrySend = async (text: string) => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/messages-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          conversationId: summary.id,
          text,
          // The whole point of a retry is to send the same words again.
          allowDuplicate: true,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Same post-send bookkeeping as handleSend. Without it a confirmed
        // duplicate shipped the message but left the text sitting in the
        // composer and the panel open, which reads as "it did not send" —
        // and with translate-on-send the composer holds the UNtranslated
        // text, so sending again produces a fresh translation that the
        // server-side duplicate check will not recognise.
        setReplyText('');
        clearDraft('reply', summary.id);
        await loadDetail();
        onRefreshList();
        onReplySent?.();
      } else {
        toast({
          title: data.error || t.messages.sendFailed,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch {
      await loadDetail();
      toast({
        title: t.common.couldNotReach,
        description: t.messages.sendFailedCheckThread,
        status: 'warning',
        duration: 8000,
      });
    } finally {
      setSending(false);
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
                title: tData.error || t.messages.translationFailedSending,
                status: 'warning',
                duration: 4000,
              });
            }
          } catch {
            toast({
              title: t.messages.translationUnreachableSending,
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
        clearDraft('reply', summary.id);
        await loadDetail();
        onRefreshList();
        // The draft is out the door; the refine panel has nothing left to do.
        onReplySent?.();
      } else if (res.status === 409) {
        // Not an error — the server noticed this repeats something just
        // sent. Ask rather than refuse; she may well mean it.
        setDuplicateText(outbound);
      } else {
        toast({
          title: data.error || t.messages.sendFailed,
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    } catch {
      // A network error here does NOT mean the message wasn't sent — the
      // request may have gone through and only the response been lost on
      // bad wifi or a backgrounded phone. Telling her "failed" would make
      // her re-send and the client receive it twice. Reload and let the
      // thread answer the question.
      await loadDetail();
      toast({
        title: t.common.couldNotReach,
        description: t.messages.sendFailedCheckThread,
        status: 'warning',
        duration: 8000,
        isClosable: true,
      });
    } finally {
      setSending(false);
    }
  };

  // Ask Resend what became of the emails in this thread.
  //
  // "It's in the thread" only proves Resend ACCEPTED it. A wrong address
  // or a full mailbox bounces afterwards and looks identical to success
  // without this. Fires once per thread open; the endpoint caches
  // terminal outcomes so it isn't a Resend call per render forever.
  // Keyed on the NEWEST outbound email, not on messages.length.
  //
  // Sending a reply while a draft is pending DELETES the draft row and
  // INSERTS the sent one, so the array length is identical before and
  // after — the effect never re-ran, no poll ever started for the message
  // just sent, and the badge sat on "Sent" until switching conversations
  // remounted the component. Which looked exactly like "it only updates
  // when I navigate away and back".
  //
  // This changes precisely when there is a new outbound to track, and
  // deliberately NOT when delivery_state updates — that would restart the
  // poll on its own output.
  const newestOutboundEmailId =
    [...messages]
      .reverse()
      .find((m) => m.direction === 'outbound' && m.channel === 'email')?.id ?? null;

  useEffect(() => {
    if (detail?.platform !== 'email') return;

    // Delivery resolves in seconds, not instantly, so a single check on
    // open would almost always catch it mid-flight and leave a spinner
    // that never settles. Re-check on a short interval until every
    // message reaches a terminal state, then stop — the endpoint caches
    // terminal outcomes, so this cannot become a permanent poll.
    // 3s matches the thank-you page, which feels immediate. 5s felt
    // noticeably laggy against mail that had visibly already arrived.
    const POLL_MS = 3000;
    const MAX_WAIT_MS = 90_000;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();

    const check = async () => {
      if (cancelled) return;
      try {
        const res = await fetch('/api/admin/messages-delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword, conversationId: summary.id }),
        });
        const data = await res.json();
        if (cancelled || !data?.success || !data.states) return;
        setMessages((prev) =>
          prev.map((m) =>
            data.states[m.id] ? { ...m, delivery_state: data.states[m.id] } : m,
          ),
        );
        // NOTE: [].every() is true, so an empty result would read as
        // "everything settled" and stop the loop on its first tick —
        // which is exactly the case right after a send, before the
        // delivery id has been written. Require at least one known state
        // before believing we're done.
        const states = Object.values(data.states) as string[];
        const settled =
          states.length > 0 && states.every((v) => DELIVERY_TERMINAL.includes(v));
        if (settled || Date.now() - startedAt >= MAX_WAIT_MS) return;
      } catch {
        // Silent — a missing delivery badge is not worth an error toast.
      }
      timer = setTimeout(check, POLL_MS);
    };

    void check();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary.id, detail?.platform, newestOutboundEmailId]);

  if (loading) {
    return (
      <Flex flex={1} justify="center" align="center">
        <Spinner color="brand.accent" />
      </Flex>
    );
  }

  if (error || !detail) {
    return (
      <Flex flex={1} justify="center" align="center" p={6}>
        <Text color="red.500" fontSize="sm">{error || t.messages.couldNotLoad}</Text>
      </Flex>
    );
  }

  const displayName =
    detail.contact_name ||
    detail.contact_handle ||
    detail.linked_client_display_name ||
    (detail.platform === 'email'
      ? t.messages.emailSenderFallback(detail.external_user_id)
      : t.messages.instagramUserFallback(detail.external_user_id.slice(-6)));

  // The address / handle to show under the name.
  //
  // For email, external_user_id IS the address — that's how the thread is
  // keyed. For Instagram it's the IGSID, an opaque number that means
  // nothing to Vero, so we use the handle and fall back to showing the
  // channel name rather than a meaningless id.
  //
  // Skipped entirely when it would just repeat the heading — an email
  // thread with no contact_name already displays the address as its
  // title, and printing it twice looks like a bug.
  const rawIdentifier =
    detail.platform === 'email'
      ? detail.external_user_id
      : detail.contact_handle
      ? `@${detail.contact_handle.replace(/^@/, '')}`
      : null;
  const contactIdentifier =
    rawIdentifier && rawIdentifier !== displayName ? rawIdentifier : null;

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
              aria-label={t.messages.backToConversations}
              icon={<Icon as={FaChevronLeft} boxSize={4} />}
              onClick={onBack}
              variant="ghost"
              size="md"
              minW="44px"
              minH="44px"
              color="gray.500"
              _hover={{ color: 'brand.accent' }}
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
              <HStack spacing={1} align="center" minW={0} w="100%">
                <Text
                  fontSize={{ base: 'sm', md: 'sm' }}
                  fontWeight="500"
                  color="gray.800"
                  noOfLines={1}
                  minW={0}
                >
                  {displayName}
                </Text>
                {/* NOTE: manual "refresh profile from Instagram"
                    button was here in earlier commits — removed
                    because names/pfps rarely change, the webhook
                    already auto-fetches on new conversations, and
                    the backfill script covers existing rows. Too
                    many refresh-icons in the header made it hard
                    to tell them apart. If a truly stale name ever
                    matters, add it back or (better) refresh
                    opportunistically in the webhook on every N-th
                    message. */}
              </HStack>
              <HStack spacing={2} minW={0}>
                {/* The actual identifier, not just the channel name.
                    "Email" under a display name tells Vero nothing she
                    can act on — she needs to see WHICH address, because
                    display names repeat, get spoofed, and a client
                    writing from a work vs personal address is a
                    different thread. Instagram shows @handle; email
                    shows the address. Falls back to the channel name
                    when Instagram never gave us a handle. */}
                <Text
                  fontSize={{ base: 'xs', md: '2xs' }}
                  color="gray.500"
                  textTransform={contactIdentifier ? 'none' : 'capitalize'}
                  noOfLines={1}
                  title={contactIdentifier ?? detail.platform}
                >
                  {contactIdentifier ?? detail.platform}
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
                    {t.messages.clientBadge}
                  </Badge>
                )}
              </HStack>
            </VStack>
          </HStack>

          {/* Right side of the header: Create-client icon (or "Linked
              client" badge if already linked) + AI toggle. Everything
              lives on the top row now — the old second row was eating
              vertical space in the drill-down for a single button. */}
          <HStack spacing={2} flexShrink={0}>
            {detail.linked_client_portal_id ? (
              <Box
                title={t.messages.linkedToPortal}
                aria-label={t.messages.linkedToPortal}
                w="32px"
                h="32px"
                borderRadius="full"
                bg="green.100"
                color="green.700"
                display="inline-flex"
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
              >
                <Icon as={FaExternalLinkAlt} boxSize={3} />
              </Box>
            ) : (
              // Small circular + user icon — replaces the old chunky
              // "Create Client" pill that took up its own line in the
              // header. Same click target size (44×44) with a subtle
              // gold-tinted background so it reads as an action.
              <IconButton
                aria-label={t.messages.createClientFromThread}
                icon={<Icon as={FaUserPlus} boxSize={4} />}
                onClick={() => setCreateClientOpen(true)}
                variant="ghost"
                size="md"
                minW="44px"
                minH="44px"
                bg="rgba(201, 169, 110, 0.12)"
                color="brand.accentText"
                _hover={{ bg: 'rgba(201, 169, 110, 0.22)' }}
                _active={{ bg: 'rgba(201, 169, 110, 0.28)' }}
                borderRadius="full"
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              />
            )}
            {/* "Wipe conversation" — super-admin test-reset button.
                Sits to the LEFT of the AI toggle. Red-tint hover
                distinguishes it as destructive; the equally-red
                confirm dialog + explicit copy (message count + contact
                name) make the consequence unmistakable, so accidental
                taps get caught by the confirm modal.
                Icon is an ERASER (FaEraser), not a refresh — Alex
                flagged that a "reset" that looked like every other
                refresh icon in the header was ambiguous. Eraser is
                the unambiguous "wipe/clean" metaphor. Baseline color
                is red (not gray) so it reads as destructive at a
                glance without needing hover.
                Available to BOTH admin and super — Vero uses this
                heavily to reset test conversations while she's tuning
                the AI assistant (she wants a clean slate without
                needing a second IG test account). */}
            {/* Delete beside the eraser. Two destructive controls sit
                together, so they are visually distinct and separately
                labelled: ERASER wipes the messages but keeps the thread
                (so a re-test lands back in it), TRASH removes the thread
                entirely. Without the second one, every reset left a dead
                empty row in the inbox permanently. */}
            {/* Fold this sender out of the inbox. Not a delete — mail
                from a marketing sender is occasionally worth reading, so
                a mistaken tap should cost a click to undo. Because email
                threads are keyed on the sender's address, this covers
                everything they send from now on. */}
            {/* Secondary actions. On desktop they sit inline; on mobile they
                move into the overflow menu below, because five icon buttons
                plus the AI switch overflowed the row and squeezed the contact
                name down to two characters. */}
            <HStack spacing={1} display={{ base: 'none', md: 'inline-flex' }}>
            {/* Personal — friends & family. Distinct from the eye beside it:
                that one folds away marketing noise, this one says "not work",
                which is what actually stops the assistant replying (see the
                is_personal gate in api/_ai-reply.ts). Gold when active so it
                reads as a deliberate state rather than a hidden thread. */}
            <IconButton
              aria-label={isPersonalThread ? t.messages.unmarkPersonal : t.messages.markPersonal}
              title={isPersonalThread ? t.messages.unmarkPersonal : t.messages.markPersonal}
              icon={<Icon as={FaUserFriends} boxSize={3.5} />}
              onClick={handleTogglePersonal}
              size="sm"
              variant="ghost"
              color={isPersonalThread ? 'brand.accentText' : 'gray.400'}
              bg={isPersonalThread ? 'brand.surface' : 'transparent'}
              _hover={{ color: 'brand.accentText', bg: 'brand.surface' }}
              borderRadius="full"
            />
            <IconButton
              aria-label={isHidden ? t.messages.unmarkPromotional : t.messages.markPromotional}
              title={isHidden ? t.messages.unmarkPromotional : t.messages.markPromotional}
              icon={<Icon as={isHidden ? FaEye : FaEyeSlash} boxSize={3.5} />}
              onClick={handleTogglePromotional}
              variant="ghost"
              size="md"
              w="36px"
              h="36px"
              minW="36px"
              color={isHidden ? 'brand.accentText' : 'gray.400'}
              _hover={{ color: 'brand.accent' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            />
            <IconButton
              aria-label={t.messages.deleteConversation}
              title={t.messages.deleteConversation}
              icon={<Icon as={FaTrash} boxSize={3.5} />}
              onClick={() => setDeleteConfirmOpen(true)}
              variant="ghost"
              size="md"
              w="36px"
              h="36px"
              minW="36px"
              color="red.500"
              _hover={{ bg: 'red.50' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            />
            <IconButton
              aria-label={t.messages.resetConversation}
              title={t.messages.resetConversationTooltip}
              icon={<Icon as={FaEraser} boxSize={3.5} />}
              onClick={() => setResetConfirmOpen(true)}
              variant="ghost"
              size="md"
              w="36px"
              h="36px"
              minW="36px"
              minH="36px"
              color="red.500"
              bg="red.50"
              _hover={{ bg: 'red.100', color: 'red.600' }}
              _active={{ bg: 'red.200' }}
              borderRadius="full"
              flexShrink={0}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            />
            </HStack>

            {/* Mobile overflow. Same actions, one 44px target. */}
            <Menu placement="bottom-end" autoSelect={false}>
              <MenuButton
                as={IconButton}
                aria-label={t.messages.moreActions}
                icon={<Icon as={FaEllipsisV} boxSize={3.5} />}
                size="sm"
                variant="ghost"
                color="gray.500"
                w="36px"
                h="36px"
                minW="36px"
                borderRadius="full"
                display={{ base: 'inline-flex', md: 'none' }}
                flexShrink={0}
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              />
              <MenuList minW="220px" zIndex={20}>
                <MenuItem
                  icon={<Icon as={FaUserFriends} boxSize={3.5} />}
                  onClick={handleTogglePersonal}
                >
                  {isPersonalThread ? t.messages.unmarkPersonal : t.messages.markPersonal}
                </MenuItem>
                <MenuItem
                  icon={<Icon as={isHidden ? FaEye : FaEyeSlash} boxSize={3.5} />}
                  onClick={handleTogglePromotional}
                >
                  {isHidden ? t.messages.unmarkPromotional : t.messages.markPromotional}
                </MenuItem>
                <MenuItem
                  icon={<Icon as={FaEraser} boxSize={3.5} />}
                  onClick={() => setResetConfirmOpen(true)}
                >
                  {t.messages.resetConversation}
                </MenuItem>
                <MenuItem
                  icon={<Icon as={FaTrash} boxSize={3.5} />}
                  color="red.500"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  {t.messages.deleteConversation}
                </MenuItem>
              </MenuList>
            </Menu>

            {/* AI toggle — only wired for Instagram today. Email
                conversations don't have an AI-reply pipeline yet
                (deferred; the receiving side ships in this PR but
                auto-reply-for-email is future work), so we HIDE
                the toggle entirely on email conversations to avoid
                the confusing "I flipped it and nothing happened"
                UX. When email AI eventually lands, remove this
                platform check. */}
            {detail.platform !== 'email' && (
              <>
                <Icon as={FaRobot} boxSize={3.5} color={detail.ai_enabled ? 'brand.accent' : 'gray.400'} />
                <Switch
                  isChecked={detail.ai_enabled}
                  onChange={handleToggleAi}
                  isDisabled={aiToggleLoading}
                  colorScheme="yellow"
                  size={{ base: 'md', md: 'sm' } as any}
                />
              </>
            )}
          </HStack>
        </Flex>

        {/* The old second-row Create-client / Linked-client block is
            gone — those two controls now live in the top header row
            above, saving a full row of vertical space on mobile. */}
      </VStack>

      {/* "Wipe conversation" confirm dialog — Vero's testing loop
          resets a conversation to a clean slate mid-tuning-session.
          Available to both admin + super. The safeguard is the
          per-invocation confirm modal with the specific contact
          name + message count inlined, not a role gate. */}
      <ConfirmDialog
        isOpen={resetConfirmOpen}
        title={t.messages.resetConfirmTitle}
        // Body includes the CONTACT NAME + MESSAGE COUNT so accidental
        // clicks can't confirm without seeing exactly what they're
        // about to erase — the primary safeguard for an in-list
        // destructive action that regular admins (not just super)
        // can trigger.
        body={t.messages.resetConfirmBody(displayName, messages.length)}
        confirmLabel={t.messages.resetConfirmButton}
        danger
        isLoading={resetLoading}
        onConfirm={doReset}
        onCancel={() => setResetConfirmOpen(false)}
      />

      {/* Duplicate-send confirmation. Deliberately a question, not a
          block — repeating yourself is occasionally correct (a nudge, a
          resend after a bounce), and refusing outright would be worse
          than the duplicate. */}
      <ConfirmDialog
        isOpen={duplicateText !== null}
        title={t.messages.duplicateConfirmTitle}
        body={t.messages.duplicateConfirmBody}
        confirmLabel={t.messages.duplicateConfirmButton}
        isLoading={sending}
        onConfirm={() => {
          const text = duplicateText;
          setDuplicateText(null);
          if (text) void handleRetrySend(text);
        }}
        onCancel={() => setDuplicateText(null)}
      />

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title={t.messages.deleteConfirmTitle}
        // Names the contact and the message count for the same reason the
        // reset dialog does: this is destructive, admin-level, and one tap
        // away in the header.
        body={t.messages.deleteConfirmBody(displayName, messages.length)}
        confirmLabel={t.messages.deleteConfirmButton}
        danger
        isLoading={deleteLoading}
        onConfirm={doDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

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
            title: t.messages.clientPortalCreated,
            status: 'success',
            duration: 4000,
            isClosable: true,
          });
        }}
      />

      {/* Not-in-AI notice — one-line dismissible banner. Auto-opens
          for any conversation with AI disabled; Vero can close it
          for the current session (state resets on remount when she
          picks a different thread) so it stops occupying screen
          space once she's acknowledged it.
          Suppressed for email conversations — email doesn't have an
          AI reply pipeline yet, so a "AI is off" banner would be
          misleading (implies it could be on). */}
      {detail.platform !== 'email' && !detail.ai_enabled && !aiOffBannerDismissed && (
        <Flex
          bg="orange.50"
          borderBottom="1px solid"
          borderColor="orange.100"
          px={{ base: 3, md: 4 }}
          py={{ base: 2, md: 2 }}
          gap={2}
          align="center"
          justify="space-between"
          flexShrink={0}
        >
          <Flex align="center" gap={2} minW={0} flex={1}>
            <Icon as={FaExclamationTriangle} color="orange.500" boxSize={3.5} flexShrink={0} />
            <Text fontSize="xs" color="orange.700" fontWeight="500" noOfLines={1}>
              {t.messages.aiOffBanner}
            </Text>
          </Flex>
          <IconButton
            aria-label={t.messages.dismissAiOffNotice}
            icon={<Icon as={FaTimes} boxSize={3} />}
            onClick={() => setAiOffBannerDismissed(true)}
            variant="ghost"
            size="xs"
            minW="32px"
            minH="32px"
            color="orange.600"
            _hover={{ bg: 'orange.100' }}
            flexShrink={0}
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          />
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
      {/* Summary and the generated reply now live in the AI panel, which is a
          sibling of this pane rather than a child. They are rendered here,
          where their state already is, and portalled there. Portals follow the
          React tree, so useAdminLang and the Chakra theme still resolve. */}
      {panelBodyEl &&
        createPortal(
          panelTab === 'summary' ? (
            <SummaryCard
              summary={aiSummary}
              loading={aiSummaryLoading}
              error={aiSummaryError}
              // The panel owns collapsing now, so the card is always open
              // inside it and its own collapse affordance is gone.
              collapsed={false}
              onToggleCollapsed={() => {}}
              inPanel
              language={summaryLang}
              onChangeLanguage={changeSummaryLang}
              // Force=true so the Regenerate button always bypasses
              // the server-side cache. The initial auto-load on
              // conversation open (loadAiSummary() with no args) uses
              // the cached summary whenever it's still valid.
              onRegenerate={() => loadAiSummary({ force: true })}
            />
          ) : (
            <DraftPanel
              draft={pendingDraft}
              t={t}
              translation={draftTranslation}
              translating={draftTranslating}
              translateError={draftTranslateError}
              onTranslate={translateDraft}
              onUse={() => {
                setReplyText(pendingDraft?.body ?? '');
                onPanelTabChange?.('summary');
              }}
              onRefine={handleRefineWithAssistant}
              onDiscard={handleDiscardDraft}
              discarding={discardingDraft}
            />
          ),
          panelBodyEl,
        )}

      {/* Message history — hidden on mobile when the summary is
          expanded (focus mode). On desktop it always renders. */}
      <Box
        ref={scrollRef}
        flex={1}
        overflowY="auto"
        p={{ base: 4, md: 6 }}
        bg="gray.50"
      >
        <VStack spacing={3} align="stretch">
          {/* Email conversations get a small Gmail-style subject
              header at the top of the thread so Vero can see what
              the email is about at a glance without scrolling
              through the body. Uses the OLDEST message's subject
              (the original thread starter) — subsequent replies'
              subjects just chain "Re: " prefixes and would be
              noise. IG conversations skip this entirely (no
              subjects). */}
          {detail.platform === 'email' && messages.length > 0 && (() => {
            const firstWithSubject = messages.find((m) => m.subject && m.subject.trim());
            if (!firstWithSubject?.subject) return null;
            return (
              <Box
                bg="white"
                border="1px solid"
                borderColor="gray.200"
                borderRadius="md"
                px={4}
                py={3}
                mb={1}
              >
                <Text
                  fontSize="xs"
                  fontWeight="500"
                  color="gray.500"
                  textTransform="uppercase"
                  letterSpacing="0.08em"
                  mb={1}
                >
                  Subject
                </Text>
                <Text fontSize="sm" fontWeight="500" color="gray.800">
                  {firstWithSubject.subject}
                </Text>
              </Box>
            );
          })()}
          {messages
            // A draft is a suggestion, not something the customer
            // received. Rendering it as an ordinary outbound bubble would
            // read as "already replied" — the exact wrong impression.
            // It surfaces in the banner above the composer instead.
            .filter((m) => m.status !== 'draft')
            .map((m) => (
              <MessageBubble
                key={m.id}
                msg={m}
                adminPassword={adminPassword}
                onRetry={handleRetrySend}
                retrying={sending}
              />
            ))}
        </VStack>
      </Box>

      {/* Composer — sticky at the bottom of the pane on mobile so it
          stays above the OS keyboard. Safe-area padding clears the iOS
          home indicator. Hidden on mobile when the summary is expanded
          (focus mode) — the collapse affordance is Vero's way back to
          the composer. */}
      {/* One AI entry point per conversation, in the slot the draft card used
          to occupy: directly above the composer, where she is already looking
          when deciding what to send. The classification badge stays on this row
          rather than moving inside the panel, because it is the at-a-glance
          spam-versus-booking read and burying it behind a tap loses it. */}
      <Flex
        as="button"
        type="button"
        onClick={() => { onPanelTabChange?.('summary'); onRefine?.(); }}
        aria-label={t.messages.aiPanelOpen}
        align="center"
        gap={2}
        w="100%"
        textAlign="left"
        bg="brand.surface"
        borderTop="1px solid"
        borderColor="#e8d9b8"
        px={{ base: 3, md: 4 }}
        py={2.5}
        minH="44px"
        flexShrink={0}
        cursor="pointer"
        _hover={{ bg: 'rgba(201, 169, 110, 0.16)' }}
        sx={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Icon as={FaLightbulb} boxSize={3.5} color="brand.accentText" flexShrink={0} />
        <Text
          fontSize="2xs"
          fontWeight="600"
          letterSpacing="0.14em"
          textTransform="uppercase"
          color="brand.accentText"
          flexShrink={0}
        >
          {t.messages.refinePanelTitle}
        </Text>
        {aiSummary && (
          <Badge
            flexShrink={0}
            fontSize="2xs"
            textTransform="uppercase"
            letterSpacing="0.08em"
            px={2}
            py={0.5}
            borderRadius="sm"
            bg={(CLASSIFICATION_STYLE[aiSummary.classification] ?? CLASSIFICATION_STYLE.unclear).bg}
            color={(CLASSIFICATION_STYLE[aiSummary.classification] ?? CLASSIFICATION_STYLE.unclear).color}
          >
            {t.messages.classification[aiSummary.classification]}
          </Badge>
        )}
        {pendingDraft && (
          <Badge
            flexShrink={0}
            fontSize="2xs"
            textTransform="uppercase"
            letterSpacing="0.08em"
            px={2}
            py={0.5}
            borderRadius="sm"
            bg="brand.accent"
            color="white"
          >
            {t.messages.aiDraftWaiting}
          </Badge>
        )}
        <Text fontSize="xs" color="gray.600" noOfLines={1} flex="1" minW={0}>
          {readSummaryLocale(aiSummary, summaryLang)?.asking ?? ''}
        </Text>
        <Icon as={FaChevronDown} boxSize={2.5} color="gray.400" flexShrink={0} transform="rotate(-90deg)" />
      </Flex>


      <Box
        p={{ base: 3, md: 4 }}
        // Clear the FIXED bottom nav, not just the iOS home indicator.
        //
        // On mobile this pane is position:fixed at h=100dvh / bottom=0 with
        // z-index 25, and the admin bottom nav is z-index 30 at bottom=0 —
        // so the nav paints over the last ~80px of the pane. That is
        // exactly where the Send button sits, so Vero could type a reply
        // and have nowhere to tap. Matches the clearance the main admin
        // container already uses (src/pages/Admin.tsx).
        // Clears the fixed bottom nav (80px). When the refine panel is rolled
        // DOWN it parks its own 44px bar directly above that nav, on top of
        // this composer — so the reply button needs to move up by that much
        // too, or the thing you rolled the panel down to reach is covered.
        pb={{
          base: refineDocked
            ? 'calc(124px + env(safe-area-inset-bottom))'
            : 'calc(80px + env(safe-area-inset-bottom))',
          md: 4,
        }}
        borderTop="1px solid"
        borderColor="gray.100"
        bg="white"
        flexShrink={0}
      >
        <Textarea
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          placeholder={t.messages.replyPlaceholder}
          rows={3}
          resize="vertical"
          // 16px on mobile prevents iOS Safari from zooming the whole
          // page in on focus. Regular sm on desktop.
          fontSize={{ base: '16px', md: 'sm' }}
          bg="white"
          borderColor="gray.300"
          _hover={{ borderColor: 'gray.400' }}
          _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
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
              <Icon as={FaLanguage} boxSize={3.5} color={translateOnSend ? 'brand.accent' : 'gray.400'} />
              <Text
                fontSize={{ base: 'xs', md: '2xs' }}
                color={translateOnSend ? 'brand.accentText' : 'gray.500'}
                fontWeight="500"
              >
                {t.messages.translateBeforeSending}
              </Text>
            </HStack>
            <Text fontSize={{ base: 'xs', md: '2xs' }} color="gray.400" display={{ base: 'none', md: 'block' }}>
              {t.messages.ctrlEnterSend}
            </Text>
          </VStack>
          {/* Mic + send row. Same shared VoiceInput as the Assistant
              chat — records via MediaRecorder, transcribes with Whisper,
              appends the result to the current reply text. Vero can
              dictate a reply in Russian and let the translate-before-
              sending toggle ship it in English. */}
          <Stack direction="row" spacing={2} justify={{ base: 'stretch', md: 'flex-end' }}>
            <VoiceInput
              adminPassword={adminPassword}
              // Vero speaks Russian; hint Whisper accordingly. On
              // English-typing days the translate step still runs.
              language="ru"
              uiLang={adminLang}
              onTranscript={(text) => setReplyText((prev) => (prev ? `${prev} ${text}` : text))}
              ariaLabelIdle={t.messages.micRecordReply}
              ariaLabelRecording={t.messages.micReleaseStop}
              ariaLabelUploading={t.messages.micTranscribing}
              variant="outline"
              size="lg"
              minW={{ base: '48px', md: 'auto' }}
              minH={{ base: '48px', md: 'auto' }}
              flex="0 0 auto"
              isDisabled={sending}
            />
            <CTAButton
              onClick={handleSend}
              icon={FaPaperPlane}
              variant="solid"
              size="md"
              // Full-width primary CTA on mobile so the composer's send
              // action is thumb-obvious; hugs content on desktop.
              fullWidth={{ base: true, md: false }}
              isLoading={sending}
              loadingText={translateOnSend ? t.messages.translating : t.common.sending}
              isDisabled={!replyText.trim()}
            >
              {translateOnSend ? t.messages.translateAndSend : t.messages.send}
            </CTAButton>
          </Stack>
        </Stack>
      </Box>
    </>
  );
}

/**
 * Delivery badge for outbound email.
 *
 * Instagram needs nothing here — Vero can open the app and see the
 * message. Email is opaque: the composer clears and she has to trust it
 * went. Worse, "Resend accepted it" and "the client received it" are
 * different facts, and a bounce is exactly the case where she needs to
 * know and would otherwise never find out.
 */
const DELIVERY_TERMINAL = ['delivered', 'bounced', 'complained', 'failed', 'canceled'];

function DeliveryBadge({
  state,
  onRetry,
  retrying,
}: {
  state: string | null | undefined;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { t } = useAdminLang();
  if (!state) return null;

  const failed =
    state === 'bounced' || state === 'complained' || state === 'failed' || state === 'canceled';
  const delivered = state === 'delivered';
  const inFlight = !DELIVERY_TERMINAL.includes(state);

  return (
    <Flex align="center" gap={1} justify="flex-end" mt={1}>
      {/* In-flight gets a spinner rather than a static icon: the state is
          genuinely still resolving, and a motionless "Sent" reads as the
          final answer. Sized to the text so it's a hint, not a widget. */}
      {inFlight ? (
        <Spinner size="xs" boxSize={2.5} thickness="1.5px" speed="0.9s" color="gray.400" />
      ) : (
        <Icon
          as={delivered ? FaCheckCircle : FaExclamationTriangle}
          boxSize={2.5}
          color={delivered ? 'green.500' : 'red.500'}
        />
      )}
      <Text
        fontSize="2xs"
        color={failed ? 'red.600' : delivered ? 'green.600' : 'gray.500'}
        fontWeight={failed ? '500' : '400'}
        // A bounce is the one state that needs Vero to DO something, and
        // retrying is usually futile — a hard bounce means the address
        // doesn't accept mail, and Resend suppresses it after one.
        title={failed ? t.messages.deliveryBouncedHelp : undefined}
      >
        {failed
          ? t.messages.deliveryBounced
          : delivered
          ? t.messages.deliveryDelivered
          : t.messages.deliverySent}
      </Text>
      {/* Retry only on failure, and only because the common bounce here
          is TRANSIENT — a busy or filtering receiver, or a shared
          sending IP briefly on a blocklist. Those clear on their own,
          so a second attempt genuinely works. Re-sends the same text
          through the normal send path, so it picks up whatever IP the
          pool hands out next. */}
      {failed && onRetry && (
        <Box
          as="button"
          type="button"
          onClick={onRetry}
          disabled={retrying}
          ml={1}
          fontSize="2xs"
          fontWeight="500"
          color="brand.accentText"
          textDecoration="underline"
          sx={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {retrying ? t.common.sending : t.messages.deliveryBouncedRetry}
        </Box>
      )}
    </Flex>
  );
}

function MessageBubble({
  msg,
  adminPassword,
  onRetry,
  retrying,
}: {
  msg: Message;
  adminPassword: string;
  onRetry?: (text: string) => void;
  retrying?: boolean;
}) {
  const { t, lang } = useAdminLang();
  const isInbound = msg.direction === 'inbound';
  const isAi = msg.sender === 'ai';

  const bg = isInbound ? 'white' : isAi ? '#fdf9f0' : '#c9a96e';
  const color = isInbound || isAi ? 'gray.800' : 'white';
  // The inbound eyebrow names the channel rather than always saying
  // "They said" — that phrasing suits a DM but reads wrong on a formal
  // email, and a contact-form submission was never "said" at all.
  const senderLabel = isInbound
    ? msg.channel === 'form'
      ? t.messages.senderForm
      : msg.channel === 'email'
      ? t.messages.senderEmail
      : t.messages.senderThey
    : isAi
    ? t.messages.senderAI
    : t.messages.senderYou;
  const senderColor = isInbound
    ? 'gray.500'
    : isAi
    ? '#8a6e35'
    : '#8a6e35';
  const senderIcon = isInbound
    ? msg.channel === 'form'
      ? FaClipboardList
      : msg.channel === 'email'
      ? FaEnvelope
      : FaUser
    : isAi
    ? FaRobot
    : FaUser;

  // Targets the admin's reading language. This was VERO_LANG, so an English
  // admin pressing Translate on a Russian message got Russian back.
  const {
    translation,
    detectedLang,
    translating,
    error: translateError,
    translate: handleTranslate,
  } = useTextTranslation(msg.body, adminPassword, lang, t);

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
                <HStack spacing={1.5} mb={0.5} color="brand.accentText">
                  <Icon as={FaLanguage} boxSize={2.5} />
                  <Text fontSize={{ base: 'xs', md: '2xs' }} fontWeight="500" letterSpacing="0.08em" textTransform="uppercase">
                    {t.messages.translatedFrom(detectedLang)}
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
            <TranslateChip
              translating={translating}
              onClick={handleTranslate}
              label={t.messages.translateAction}
              busyLabel={t.messages.translating}
            />
          )}
          <Text
            fontSize={{ base: 'xs', md: '2xs' }}
            color="gray.400"
            textAlign={isInbound ? 'left' : 'right'}
          >
            {formatFullTime(msg.sent_at, lang)}
            {msg.ai_model && ` · ${msg.ai_model}`}
          </Text>
        </Flex>
        {/* Outbound email only — Instagram doesn't need it and inbound
            has nothing to report. */}
        {!isInbound && msg.channel === 'email' && (
          <DeliveryBadge
            state={msg.delivery_state}
            retrying={retrying}
            onRetry={onRetry ? () => onRetry(msg.body) : undefined}
          />
        )}
      </Box>
    </Flex>
  );
}

function SelectPrompt() {
  const { t } = useAdminLang();
  return (
    <Flex flex={1} justify="center" align="center" p={8} direction="column" gap={3} color="gray.400">
      <Icon as={FaCommentDots} boxSize={10} />
      <Text fontSize="sm" fontWeight="300" textAlign="center">
        {t.messages.selectPrompt}
      </Text>
    </Flex>
  );
}

function EmptyState() {
  const { t } = useAdminLang();
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
        bg="brand.surface"
        border="1px solid"
        borderColor="brand.accentBorder"
        align="center"
        justify="center"
        color="brand.accentText"
        mb={5}
      >
        <Icon as={FaCommentDots} boxSize={7} />
      </Flex>
      <Text fontSize="md" fontWeight="500" color="gray.800" mb={2}>
        {t.messages.noConversationsYetTitle}
      </Text>
      <Text fontSize="sm" color="gray.500" fontWeight="300" maxW="380px" mx="auto" lineHeight="1.7">
        {t.messages.emptyStateBody}
      </Text>
    </Box>
  );
}

/**
 * The Reply tab: the AI's generated draft and what to do with it.
 *
 * This is the old inline draft card, moved into the panel. Same actions, same
 * translate affordance, but it no longer sits between the conversation and the
 * composer competing for the screen.
 */
function DraftPanel({
  draft,
  t,
  translation,
  translating,
  translateError,
  onTranslate,
  onUse,
  onRefine,
  onDiscard,
  discarding,
}: {
  draft: Message | null;
  t: AdminT;
  translation: string | null;
  translating: boolean;
  translateError: string | null;
  onTranslate: () => void;
  onUse: () => void;
  onRefine: () => void;
  onDiscard: () => void;
  discarding: boolean;
}) {
  if (!draft) {
    return (
      <Flex direction="column" align="center" justify="center" h="100%" px={6} py={10}>
        <Icon as={FaRobot} boxSize={5} color="gray.300" mb={3} />
        <Text fontSize="sm" color="gray.500" textAlign="center" lineHeight="1.6">
          {t.messages.aiNoDraft}
        </Text>
      </Flex>
    );
  }

  return (
    <Box px={4} py={4}>
      <Text fontSize="sm" color="gray.700" lineHeight="1.6" whiteSpace="pre-wrap" mb={3}>
        {draft.body}
      </Text>

      {/* The draft is written in the CUSTOMER's language, so this is the one
          message that has to be understood before it is approved. */}
      {translation && (
        <Box mb={3} pl={3} borderLeft="2px solid" borderColor="rgba(201, 169, 110, 0.5)">
          <Text fontSize="sm" color="gray.700" lineHeight="1.6" whiteSpace="pre-wrap">
            {translation}
          </Text>
        </Box>
      )}
      {translateError && (
        <Text fontSize="2xs" color="red.500" mb={2}>
          {translateError}
        </Text>
      )}
      {!translation && (
        <Box mb={3}>
          <TranslateChip
            translating={translating}
            onClick={onTranslate}
            label={t.messages.translateAction}
            busyLabel={t.messages.translating}
          />
        </Box>
      )}

      <Text fontSize="2xs" color="gray.500" mb={3}>
        {t.messages.draftHelp}
      </Text>

      {/* Stacked: the panel column is ~420px on desktop and full width on a
          phone, so one action per row reads cleanly at both. */}
      <Stack direction="column" spacing={2} align="stretch">
        <CTAButton onClick={onUse} variant="solid" size="sm" icon={FaPaperPlane} fullWidth>
          {t.messages.draftUse}
        </CTAButton>
        <Button
          variant="outline"
          size="sm"
          minH="40px"
          borderColor="#e8d9b8"
          color="brand.accentText"
          bg="white"
          _hover={{ bg: 'brand.surface', borderColor: 'brand.accent' }}
          leftIcon={<Icon as={FaRobot} boxSize={3} />}
          onClick={onRefine}
        >
          {t.messages.draftRefine}
        </Button>
        <Button
          variant="outline"
          size="sm"
          minH="40px"
          borderColor="gray.300"
          color="gray.600"
          bg="white"
          _hover={{ bg: 'gray.50' }}
          onClick={onDiscard}
          isLoading={discarding}
        >
          {t.messages.draftDiscard}
        </Button>
      </Stack>
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
  inPanel = false,
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
  /** Rendered inside the AI panel, which owns opening and closing. */
  inPanel?: boolean;
}) {
  const { t } = useAdminLang();
  const classification = summary?.classification ?? 'unclear';
  const classStyle = CLASSIFICATION_STYLE[classification] ?? CLASSIFICATION_STYLE.unclear;
  // The classification pill label follows the ADMIN panel language
  // (chrome), not the summary content language toggle.
  const classLabel = t.messages.classification[classification];
  const localized = readSummaryLocale(summary, language);

  // These are CHROME, so they follow the admin panel language like every other
  // label. They used to be indexed by `language`, the summary CONTENT toggle,
  // which is why an English admin saw "СВОДКА" and "ОТКРЫТЬ СВОДКУ" sitting
  // next to an English BOOKING INQUIRY badge inside the same card. The summary
  // text itself still follows the content toggle; only the labels moved.
  const strings = {
    header: t.messages.summaryTitle,
    asking: t.messages.summaryAsking,
    gathered: t.messages.summaryGathered,
    nextStep: t.messages.summaryNextStep,
    tone: t.messages.summaryTone,
    expandCta: t.messages.closeSummaryOpenChat,
    collapseCta: t.messages.openSummary,
    hideCta: t.messages.hideSummary,
    loadingLabel: t.messages.summaryLoading,
    noSummary: t.messages.summaryNone,
  };

  return (
    <Box
      bg="white"
      borderLeft="3px solid"
      borderLeftColor={classStyle.borderColor}
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
          <Icon as={FaLightbulb} boxSize={3.5} color="brand.accentText" flexShrink={0} />
          <Text
            fontSize={{ base: 'xs', md: '2xs' }}
            fontWeight="600"
            letterSpacing={{ base: '0.12em', md: '0.14em' }}
            textTransform="uppercase"
            color="brand.accentText"
            flexShrink={0}
          >
            {strings.header}
          </Text>
          {summary && (
            <Badge
              bg={classStyle.bg}
              color={classStyle.color}
              fontSize={{ base: 'xs', md: '2xs' }}
              fontWeight="600"
              letterSpacing="0.08em"
              textTransform="uppercase"
              px={2}
              py={0.5}
              borderRadius="sm"
              flexShrink={0}
            >
              {classLabel}
            </Badge>
          )}
          {collapsed && localized.asking && (
            <Text fontSize="xs" color="gray.500" noOfLines={1} minW={0}>
              — {formatPhoneNumbersInText(localized.asking)}
            </Text>
          )}
          {/* The row was clickable with nothing to say so. A rotating chevron
              plus a verb is the whole affordance: it reads as a control when
              open AND when closed, which the bare row did not. */}
          {/* Inside the AI panel the card is always open and the panel owns
              closing, so its own collapse affordance would be a control that
              does nothing. */}
          <Flex align="center" gap={1} ml="auto" flexShrink={0} pl={2} display={inPanel ? 'none' : 'flex'}>
            <Text
              fontSize="2xs"
              fontWeight="500"
              letterSpacing="0.08em"
              textTransform="uppercase"
              color="gray.500"
              display={{ base: 'none', md: 'block' }}
            >
              {collapsed ? strings.collapseCta : strings.hideCta}
            </Text>
            <Icon
              as={FaChevronDown}
              boxSize={3}
              color="gray.500"
              transform={collapsed ? 'rotate(0deg)' : 'rotate(180deg)'}
              transition="transform 0.2s ease"
            />
          </Flex>
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
            aria-label={t.messages.summaryLangAria}
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
                  bg={active ? 'brand.accent' : 'transparent'}
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
          aria-label={t.messages.regenerateSummary}
          icon={<Icon as={FaSync} boxSize={3.5} />}
          onClick={onRegenerate}
          isLoading={loading}
          variant="ghost"
          size="sm"
          minW="44px"
          minH="44px"
          color="gray.500"
          _hover={{ color: 'brand.accent' }}
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
              <Spinner size="xs" color="brand.accent" />
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
                        <Text fontSize="sm" color="brand.accent" lineHeight="1.5">•</Text>
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
                    color="brand.accentText"
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
          color={collapsed ? 'white' : 'brand.accentText'}
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
// and softer neutrals for everything in between. Labels live in the
// i18n dict (t.messages.classification.*) and are looked up at
// render time so RU/EN can switch without touching this table.
const CLASSIFICATION_STYLE: Record<
  InquiryClassification,
  { bg: string; color: string; borderColor: string }
> = {
  'booking-inquiry': {
    bg: 'green.100',
    color: 'green.800',
    borderColor: '#38A169',
  },
  'existing-client': {
    bg: 'purple.100',
    color: 'purple.800',
    borderColor: '#805AD5',
  },
  // Warm neutral — a friend is neither a lead nor spam, and the badge should
  // not make Vero think either.
  personal: {
    bg: 'orange.100',
    color: 'orange.800',
    borderColor: '#DD6B20',
  },
  'general-question': {
    bg: 'blue.50',
    color: 'blue.700',
    borderColor: '#4299E1',
  },
  'collaboration-offer': {
    bg: 'yellow.100',
    color: 'yellow.800',
    borderColor: '#D69E2E',
  },
  'spam-or-unrelated': {
    bg: 'red.100',
    color: 'red.700',
    borderColor: '#E53E3E',
  },
  unclear: {
    bg: 'gray.100',
    color: 'gray.700',
    borderColor: 'brand.accent',
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
  const { t, lang } = useAdminLang();
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
        setError(data.error || t.messages.createFailed(res.status));
      }
    } catch {
      setError(t.common.couldNotReach);
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
          {t.messages.convertToClient}
        </ModalHeader>
        <ModalCloseButton
          size={{ base: 'lg', md: 'md' } as any}
          top={{ base: 3, md: 2 }}
          right={{ base: 3, md: 2 }}
        />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <Text fontSize="xs" color="gray.500" lineHeight="1.6">
              {t.messages.convertDisclaimer}
            </Text>

            <FormControl>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                {t.messages.sessionTypeLabel}
              </FormLabel>
              <Select
                value={sessionType}
                onChange={(e) => setSessionType(e.target.value)}
                size={{ base: 'md', md: 'sm' }}
                fontSize={{ base: 'md', md: 'sm' }}
                bg="white"
              >
                {/* Option values stay English — session_type is a wire
                    value the API stores in the DB. Labels come from
                    the dict. */}
                <option value="portrait">{t.messages.sessionOptions.portrait}</option>
                <option value="wedding">{t.messages.sessionOptions.wedding}</option>
                <option value="family">{t.messages.sessionOptions.family}</option>
                <option value="maternity">{t.messages.sessionOptions.maternity}</option>
                <option value="engagement">{t.messages.sessionOptions.engagement}</option>
                <option value="newborn">{t.messages.sessionOptions.newborn}</option>
                <option value="other">{t.messages.sessionOptions.other}</option>
              </Select>
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                {t.messages.clientDisplayName}
              </FormLabel>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t.messages.clientNamePlaceholder}
                size={{ base: 'md', md: 'sm' }}
                fontSize={{ base: 'md', md: 'sm' }}
                bg="white"
              />
            </FormControl>

            <FormControl>
              <FormLabel fontSize="xs" fontWeight="500" color="gray.700" mb={1}>
                {t.messages.galleryPasswordLabel}
              </FormLabel>
              <InputGroup size={{ base: 'md', md: 'sm' }}>
                <Input
                  value={galleryPassword}
                  onChange={(e) => setGalleryPassword(e.target.value)}
                  placeholder={t.messages.autogenerated}
                  fontSize={{ base: 'md', md: 'sm' }}
                  bg="white"
                  pr="4.5rem"
                />
                <InputRightElement width="4.5rem">
                  <Button
                    h="1.5rem"
                    size="xs"
                    variant="ghost"
                    color="brand.accentText"
                    onClick={() => setGalleryPassword(generateGalleryPassword())}
                  >
                    {t.messages.generateNewPassword}
                  </Button>
                </InputRightElement>
              </InputGroup>
              <Text fontSize="2xs" color="gray.400" mt={1}>
                {t.messages.galleryPasswordHint}
              </Text>
            </FormControl>

            {(() => {
              // Show the gathered facts in whichever language the admin
              // panel is currently in — matches the surrounding modal
              // copy so both read as one language.
              const gathered = aiSummary ? readSummaryLocale(aiSummary, lang).gathered : [];
              return gathered.length > 0 ? (
                <Box
                  bg="rgba(201, 169, 110, 0.06)"
                  border="1px solid"
                  borderColor="rgba(201, 169, 110, 0.3)"
                  borderRadius="sm"
                  p={3}
                >
                  <Text fontSize="2xs" color="brand.accentText" fontWeight="600" letterSpacing="0.08em" textTransform="uppercase" mb={1.5}>
                    {t.messages.fromThisConversation}
                  </Text>
                  <VStack align="stretch" spacing={0.5}>
                    {gathered.map((fact, i) => (
                      <Flex key={i} gap={2} align="flex-start">
                        <Text fontSize="xs" color="brand.accent">•</Text>
                        <Text fontSize="xs" color="gray.700" lineHeight="1.5">
                          {formatPhoneNumbersInText(fact)}
                        </Text>
                      </Flex>
                    ))}
                  </VStack>
                  <Text fontSize="2xs" color="gray.500" mt={2} lineHeight="1.5">
                    {t.messages.addTheseToPortal}
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
              {t.common.cancel}
            </Button>
            <CTAButton
              onClick={handleSubmit}
              icon={FaUserPlus}
              variant="solid"
              size="sm"
              isLoading={submitting}
              loadingText={t.messages.creating}
              isDisabled={!canSubmit}
            >
              {t.messages.createClientCta}
            </CTAButton>
          </Stack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/**
 * Editor for the signature appended to every email sent from this panel.
 *
 * Two fields because email is two formats: nearly every client renders
 * the HTML version, but the plaintext one still matters for the rare
 * text-only reader and — more practically — it's what gets quoted back
 * in reply chains. Keeping them in sync is Vero's call; we don't
 * generate one from the other, because guessing at her formatting is
 * worse than letting her write both.
 *
 * Instagram messages never get a signature; signing a DM reads as
 * automated and the handle is already visible.
 */
function SignatureModal({
  isOpen,
  onClose,
  adminPassword,
}: {
  isOpen: boolean;
  onClose: () => void;
  adminPassword: string;
}) {
  const { t } = useAdminLang();
  const toast = useToast();
  const [text, setText] = useState('');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/admin/messages-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: adminPassword }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.success) {
          setText(data.signatureText ?? '');
          setHtml(data.signatureHtml ?? '');
        } else {
          setError(data.error || t.messages.couldNotLoad);
        }
      })
      .catch(() => {
        if (!cancelled) setError(t.common.couldNotReach);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, adminPassword, t]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/messages-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          save: true,
          signatureText: text,
          signatureHtml: html,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({ title: t.messages.signatureSaved, status: 'success', duration: 2500 });
        onClose();
      } else {
        setError(data.error || t.messages.signatureSaveFailed);
      }
    } catch {
      setError(t.common.couldNotReach);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size={{ base: 'full', md: 'lg' } as any}
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
          {t.messages.signatureTitle}
        </ModalHeader>
        <ModalCloseButton
          size={{ base: 'lg', md: 'md' } as any}
          top={{ base: 3, md: 2 }}
          right={{ base: 3, md: 2 }}
        />
        <ModalBody>
          {loading ? (
            <Flex justify="center" py={8}>
              <Spinner size="sm" color="brand.accent" />
            </Flex>
          ) : (
            <VStack spacing={4} align="stretch">
              <Text fontSize="xs" color="gray.500" lineHeight="1.6">
                {t.messages.signatureHelp}
              </Text>

              <Box>
                <Text fontSize="xs" fontWeight="500" color="gray.600" mb={1.5}>
                  {t.messages.signatureTextLabel}
                </Text>
                <Textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={4}
                  fontSize="sm"
                  fontFamily="mono"
                  resize="vertical"
                />
              </Box>

              <Box>
                <Text fontSize="xs" fontWeight="500" color="gray.600" mb={1}>
                  {t.messages.signatureHtmlLabel}
                </Text>
                <Text fontSize="2xs" color="gray.400" mb={1.5}>
                  {t.messages.signatureHtmlHelp}
                </Text>
                <Textarea
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  rows={5}
                  fontSize="xs"
                  fontFamily="mono"
                  resize="vertical"
                />
              </Box>

              <Box>
                <Text
                  fontSize="2xs"
                  fontWeight="500"
                  color="gray.500"
                  textTransform="uppercase"
                  letterSpacing="0.08em"
                  mb={1.5}
                >
                  {t.messages.signaturePreview}
                </Text>
                <Box
                  bg="white"
                  border="1px solid"
                  borderColor="gray.200"
                  borderRadius="md"
                  px={4}
                  py={3}
                  fontSize="sm"
                  // The server rejects scripts/handlers on save, but this
                  // preview renders UNSAVED input — so strip here too.
                  // Otherwise pasting a signature from a generator could
                  // execute its tracking script inside the admin panel
                  // before validation ever sees it.
                  dangerouslySetInnerHTML={{ __html: sanitizeSignaturePreview(html) }}
                />
              </Box>

              {error && (
                <Text fontSize="xs" color="red.600">
                  {error}
                </Text>
              )}
            </VStack>
          )}
        </ModalBody>
        <ModalFooter gap={2} pb={{ base: 'max(env(safe-area-inset-bottom), 16px)', md: 4 }}>
          <Stack direction={{ base: 'column-reverse', md: 'row' }} spacing={2} w="100%">
            <Button variant="ghost" size="sm" onClick={onClose} isDisabled={saving}>
              {t.common.cancel}
            </Button>
            <CTAButton
              onClick={handleSave}
              icon={FaPenNib}
              variant="solid"
              size="sm"
              isLoading={saving}
              isDisabled={loading}
            >
              {t.common.save}
            </CTAButton>
          </Stack>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/**
 * Strip the constructs the server also rejects, so the live preview of
 * unsaved signature HTML can't execute anything. Deliberately mirrors
 * the UNSAFE_HTML list in api/admin/_messages-settings.ts — if you add a
 * rule there, add it here.
 */
function sanitizeSignaturePreview(html: string): string {
  return html
    .replace(/<\s*(script|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed)\b[^>]*\/?>/gi, '')
    // `[\s/]` not `\s` — HTML accepts a slash as an attribute separator,
    // so `<img src=x/onerror=…>` slips past a whitespace-only guard.
    // Replaced with a space so the separator isn't lost, which would
    // glue two attributes together.
    .replace(/[\s/]on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, ' ')
    .replace(/javascript\s*:/gi, '');
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

function formatPreview(conv: ConversationSummary, t: AdminT): string {
  const preview = conv.last_message_preview ?? '';
  if (conv.last_message_direction === 'inbound') return preview;
  const prefix = conv.last_message_sender === 'ai'
    ? t.messages.previewPrefixAi
    : t.messages.previewPrefixYou;
  return prefix + preview;
}

function formatRelative(iso: string, t: AdminT): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return t.messages.relativeNow;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t.messages.relativeMinutes(diffMin);
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t.messages.relativeHours(diffHr);
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return t.messages.relativeDays(diffDay);
  const diffWk = Math.floor(diffDay / 7);
  if (diffWk < 5) return t.messages.relativeWeeks(diffWk);
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatFullTime(iso: string, lang: AdminLang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Use the matching BCP-47 locale so month names and time formatting
  // (12h vs 24h) match the admin panel language.
  const locale = lang === 'ru' ? 'ru-RU' : 'en-US';
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleString(locale, {
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
