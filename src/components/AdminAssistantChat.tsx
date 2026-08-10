import {
  Box, Flex, Text, HStack, VStack, Textarea, Icon, Spinner, IconButton,
  useToast, Stack,
} from '@chakra-ui/react';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  FaPaperPlane, FaRedo, FaCheck, FaPlus, FaTrash, FaRegLightbulb,
} from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import VoiceInput from './ui/VoiceInput';
import type { ChatLanguage } from './AdminAssistant';

/**
 * "Chat" panel of the Assistant tab.
 *
 * Vero talks to her AI business assistant in Russian by default; the
 * language toggle in the parent tab flips this to English so admins
 * helping her can chat in their own language. The assistant:
 *   - always knows what's in ai_context (loaded server-side each turn
 *     into the system prompt — no history-scrolling required)
 *   - can look up + modify that knowledge base via tool calls
 *   - answers in the current UI language but stores English underneath
 *     for the customer-facing AI reply engine
 *
 * When a tool call writes to the DB, a golden toast pops corner-right
 * summarizing what changed in the current UI language so the user
 * sees the effect without leaving the chat.
 *
 * Voice input: press-and-hold the mic button, speak in the current
 * language, release; the transcript populates the composer. Uses the
 * browser's built-in SpeechRecognition (Chrome/Safari) — no external
 * service. Recognition lang switches with the UI toggle.
 *
 * Chat history is intentionally NOT retranslated when the language
 * flips — previous turns stay in whatever language they were written
 * in. Only NEW turns switch. Keeps things honest about what actually
 * happened + avoids a wonky retranslation UX.
 */

interface Props {
  adminPassword: string;
  language: ChatLanguage;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  // Client-only marker so the "thinking" placeholder disappears
  // cleanly when the real reply lands.
  pending?: boolean;
}

interface DbWrite {
  type: 'created' | 'updated' | 'deleted';
  category: string;
  label: string;
  // The summary the server produced in whatever language the chat
  // was running in when it was made. New backend field name; the
  // old `content_ru` name is kept as a fallback for old rows.
  content_summary?: string;
  content_ru?: string;
}

interface Strings {
  headerHint: string;
  newConversation: string;
  resetConfirm: string;
  resetFailed: string;
  placeholder: string;
  send: string;
  micRecordAria: string;
  micStopAria: string;
  micRecordingHint: string;
  submitHint: string;
  loadingEmpty: string;
  emptyTitle: string;
  emptyDescription: string;
  suggestedPrompts: string[];
  toastLabels: { created: string; updated: string; deleted: string };
  errorReply: (detail: string) => string;
  serverUnreachable: string;
  serverError: string;
  looping: string;
}

const STRINGS: Record<ChatLanguage, Strings> = {
  ru: {
    headerHint: 'Разговор с личным ассистентом. Пиши по-русски.',
    newConversation: 'Новый разговор',
    resetConfirm: 'Стереть весь текущий разговор?',
    resetFailed: 'Не удалось стереть',
    placeholder: 'Напиши сообщение… (например: «Что ты знаешь о моих ценах?»)',
    send: 'Отправить',
    micRecordAria: 'Записать голос',
    micStopAria: 'Остановить запись',
    micRecordingHint: '🎙 Говори… отпусти кнопку, когда закончишь',
    submitHint: '⌘/Ctrl + Enter — отправить · Микрофон — голос',
    loadingEmpty: '',
    emptyTitle: 'Твой личный ассистент готов',
    emptyDescription:
      'Спрашивай о ценах, стиле, услугах, ответах клиентам — что знаешь, чего не знаешь, что добавить. Всё, что мы обсудим, ассистент запомнит.',
    suggestedPrompts: [
      'Что ты знаешь о моих ценах?',
      'Расскажи, какой у меня стиль общения с клиентами',
      'Добавь новую услугу: семейная фотосессия в студии за $400',
      'Ответы AI слишком формальные — сделай их теплее',
    ],
    toastLabels: { created: 'Записал', updated: 'Обновил', deleted: 'Удалил' },
    errorReply: (detail) => `(Что-то пошло не так: ${detail})`,
    serverUnreachable: '(Не удалось связаться с сервером.)',
    serverError: 'ошибка сервера',
    looping: '(Ассистент продолжал вызывать инструменты без ответа. Попробуй перефразировать.)',
  },
  en: {
    headerHint: 'Chatting with your personal assistant. Write in English.',
    newConversation: 'New conversation',
    resetConfirm: 'Erase the entire current conversation?',
    resetFailed: 'Could not reset',
    placeholder: 'Type a message… (e.g. "What do you know about my pricing?")',
    send: 'Send',
    micRecordAria: 'Record voice',
    micStopAria: 'Stop recording',
    micRecordingHint: '🎙 Speaking… release when done',
    submitHint: '⌘/Ctrl + Enter — send · Mic — dictate',
    loadingEmpty: '',
    emptyTitle: 'Your personal assistant is ready',
    emptyDescription:
      'Ask about pricing, style, services, client replies — what you know, what you don\'t, what to add. Anything we discuss, the assistant will remember.',
    suggestedPrompts: [
      'What do you know about my pricing?',
      'Tell me about my client communication style',
      'Add a new service: family studio session for $400',
      'The AI replies feel too formal — make them warmer',
    ],
    toastLabels: { created: 'Saved', updated: 'Updated', deleted: 'Deleted' },
    errorReply: (detail) => `(Something went wrong: ${detail})`,
    serverUnreachable: '(Could not reach the server.)',
    serverError: 'server error',
    looping: '(The assistant kept calling tools without giving a final answer. Try rephrasing.)',
  },
};

const AdminAssistantChat = ({ adminPassword, language }: Props) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const toast = useToast();

  const t = STRINGS[language];

  // Load persisted history on mount so returning to the tab feels
  // continuous. The server returns just the user + assistant text
  // turns (tool calls / tool responses are stripped for display).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/assistant-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: adminPassword, action: 'history' }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success) {
          setMessages(data.messages ?? []);
        }
      } catch {
        // Silent — the empty state UI handles "no messages yet."
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminPassword]);

  // Chat scroll behavior — the first render after history loads
  // should be scrolled to the TOP of whatever exists (so Vero sees
  // the greeting / suggested prompts / start of the conversation
  // instead of the tail end). After that, every new message /
  // pending indicator scrolls to the BOTTOM the way a chat should.
  const initialScrollDoneRef = useRef(false);
  useEffect(() => {
    if (!scrollRef.current) return;
    if (!initialScrollDoneRef.current) {
      // First load — pin to top so the empty state / oldest messages
      // are visible and Vero knows there's context to scroll through.
      scrollRef.current.scrollTop = 0;
      // Only mark first-scroll "done" once the loading spinner has
      // finished and we're rendering real content (either messages
      // or the empty-state prompts). Otherwise a spinner-only paint
      // would satisfy this and the subsequent history render would
      // jump to the bottom.
      if (!loading) initialScrollDoneRef.current = true;
      return;
    }
    // After that: standard "auto-scroll to newest" chat behavior.
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, loading]);

  const showAchievementToast = useCallback(
    (write: DbWrite) => {
      const meta = TOAST_META[write.type];
      const label = t.toastLabels[write.type];
      // Old server rows sent `content_ru`; new ones send
      // `content_summary`. Accept either.
      const summary = write.content_summary ?? write.content_ru ?? write.label;
      toast({
        duration: 4200,
        position: 'bottom-right',
        render: () => (
          <Box
            bg="linear-gradient(135deg, #fdf9f0 0%, #f5efe4 100%)"
            border="1px solid"
            borderColor="#c9a96e"
            borderRadius="md"
            px={4}
            py={3}
            boxShadow="0 8px 24px -8px rgba(201, 169, 110, 0.5)"
            minW="280px"
            maxW="400px"
          >
            <HStack spacing={3} align="flex-start">
              <Flex
                w="32px"
                h="32px"
                borderRadius="full"
                bg="#c9a96e"
                color="white"
                align="center"
                justify="center"
                flexShrink={0}
              >
                <Icon as={meta.icon} boxSize={3.5} />
              </Flex>
              <VStack align="flex-start" spacing={0.5} flex={1} minW={0}>
                <Text
                  fontSize="2xs"
                  fontWeight="600"
                  letterSpacing="0.14em"
                  textTransform="uppercase"
                  color="#8a6e35"
                >
                  {label}
                </Text>
                <Text fontSize="sm" color="gray.800" fontWeight="400" lineHeight="1.4">
                  {summary}
                </Text>
                <Text fontSize="2xs" color="gray.500" fontWeight="300">
                  {write.category} · {write.label}
                </Text>
              </VStack>
            </HStack>
          </Box>
        ),
      });
    },
    [toast, t.toastLabels],
  );

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    // Optimistically show the user's turn + a pending assistant turn
    // so the UI doesn't sit blank while OpenAI is thinking.
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: text },
      { role: 'assistant', content: '', pending: true },
    ]);

    try {
      const res = await fetch('/api/admin/assistant-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminPassword,
          action: 'send',
          message: text,
          // Sent every turn so the server prompt matches whatever
          // language the toggle is on at send time. Language changes
          // mid-thread flip the NEXT reply, not old ones.
          language,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessages((prev) => {
          // Replace the trailing pending assistant turn with the real reply.
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (next[lastIdx]?.pending) {
            next[lastIdx] = { role: 'assistant', content: data.reply };
          } else {
            next.push({ role: 'assistant', content: data.reply });
          }
          return next;
        });
        // One toast per DB write the assistant made this turn.
        for (const write of (data.dbWrites ?? []) as DbWrite[]) {
          showAchievementToast(write);
        }
      } else {
        setMessages((prev) => {
          const next = [...prev];
          const lastIdx = next.length - 1;
          if (next[lastIdx]?.pending) {
            next[lastIdx] = {
              role: 'assistant',
              content: t.errorReply(data.error || t.serverError),
            };
          }
          return next;
        });
      }
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        const lastIdx = next.length - 1;
        if (next[lastIdx]?.pending) {
          next[lastIdx] = { role: 'assistant', content: t.serverUnreachable };
        }
        return next;
      });
    } finally {
      setSending(false);
    }
  };

  const handleReset = async () => {
    if (!confirm(t.resetConfirm)) return;
    try {
      await fetch('/api/admin/assistant-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, action: 'reset' }),
      });
      setMessages([]);
    } catch {
      toast({ title: t.resetFailed, status: 'error', duration: 3000 });
    }
  };

  // Voice input is now delegated to the shared <VoiceInput> component
  // (record via MediaRecorder → POST to /api/admin/transcribe →
  // OpenAI Whisper). The old browser-native SpeechRecognition flow
  // was fundamentally flaky on iOS Safari (per multiple debugging
  // sessions) — Whisper is one HTTP round-trip and always works.
  // Handler just appends the transcript into the composer input.
  const handleTranscript = useCallback((text: string) => {
    setInput((prev) => (prev ? `${prev} ${text}` : text));
  }, []);

  return (
    <Flex
      direction="column"
      // The chat itself is the ONLY thing that scrolls — the outer
      // flex is fixed-height so header + composer stay put on mobile.
      // dvh (dynamic viewport height) plays nicely with iOS Safari's
      // collapsing address bar. minH removed so small phones don't
      // force page-scroll from a mismatched minimum.
      h={{ base: 'calc(100dvh - 260px)', md: '78vh' }}
      maxW="900px"
      mx="auto"
      overflow="hidden"
    >
      {/* Header row — desktop shows the hint text; mobile keeps just
          the reset icon so vertical space is preserved. Reset button
          is an icon-only 36×36 button (with tooltip) to save the
          full-line real estate the old label chip was eating. */}
      <Flex align="center" justify={{ base: 'flex-end', md: 'space-between' }} mb={2} px={1}>
        <HStack spacing={2} display={{ base: 'none', md: 'flex' }}>
          <Icon as={FaRegLightbulb} boxSize={3.5} color="#c9a96e" />
          <Text fontSize="xs" color="gray.500" fontWeight="400" letterSpacing="0.06em">
            {t.headerHint}
          </Text>
        </HStack>
        {messages.length > 0 && (
          <IconButton
            aria-label={t.newConversation}
            title={t.newConversation}
            icon={<Icon as={FaRedo} boxSize={3.5} />}
            onClick={handleReset}
            variant="ghost"
            size="sm"
            minW="36px"
            minH="36px"
            color="gray.400"
            _hover={{ color: '#c9a96e' }}
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          />
        )}
      </Flex>

      {/* Message thread */}
      <Box
        ref={scrollRef}
        flex={1}
        overflowY="auto"
        bg="white"
        border="1px solid"
        borderColor="gray.200"
        borderRadius="md"
        p={{ base: 4, md: 6 }}
      >
        {loading ? (
          <Flex justify="center" py={12}>
            <Spinner size="sm" color="#c9a96e" />
          </Flex>
        ) : messages.length === 0 ? (
          <EmptyState
            title={t.emptyTitle}
            description={t.emptyDescription}
            prompts={t.suggestedPrompts}
            onSuggest={setInput}
          />
        ) : (
          <VStack spacing={4} align="stretch">
            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))}
          </VStack>
        )}
      </Box>

      {/* Composer — textarea gets its own row on mobile so it isn't
          crushed to ~230px alongside the mic + send buttons. Mic is
          rendered as icon-only always; Send is icon-only on mobile
          (to keep the row balanced) and CTA-labeled on desktop. */}
      <Box
        mt={3}
        // Safe-area padding so the composer clears the iOS home
        // indicator when this pane goes edge-to-edge.
        pb={{ base: 'max(env(safe-area-inset-bottom), 0px)', md: 0 }}
      >
        <Stack
          direction={{ base: 'column', md: 'row' }}
          spacing={{ base: 2, md: 2 }}
          align={{ base: 'stretch', md: 'flex-end' }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.placeholder}
            rows={2}
            resize="none"
            // 16px prevents iOS Safari from zooming the whole page in
            // when the textarea gets focused; matches the Messages tab.
            fontSize={{ base: '16px', md: 'sm' }}
            bg="white"
            borderColor="gray.300"
            _hover={{ borderColor: 'gray.400' }}
            _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void handleSend();
              }
            }}
            flex={1}
            isDisabled={sending}
          />
          {/* Mic + send row. Mic uses the shared VoiceInput component
              which records via MediaRecorder and posts to OpenAI
              Whisper on release — much more reliable than the
              browser's SpeechRecognition API on iOS Safari. */}
          <Stack direction="row" spacing={2} justify={{ base: 'stretch', md: 'flex-end' }}>
            <VoiceInput
              adminPassword={adminPassword}
              language={language}
              onTranscript={handleTranscript}
              ariaLabelIdle={t.micRecordAria}
              ariaLabelRecording={t.micStopAria}
              ariaLabelUploading={language === 'ru' ? 'Расшифровываю…' : 'Transcribing…'}
              variant="outline"
              size="lg"
              minW={{ base: '48px', md: 'auto' }}
              minH={{ base: '48px', md: 'auto' }}
              flex="0 0 auto"
            />
            <CTAButton
              onClick={handleSend}
              icon={FaPaperPlane}
              variant="solid"
              size="md"
              // Full-width on mobile so send stretches; hugs on desktop.
              fullWidth={{ base: true, md: false }}
              isLoading={sending}
              loadingText="…"
              isDisabled={!input.trim()}
            >
              {t.send}
            </CTAButton>
          </Stack>
        </Stack>
        <Text
          fontSize={{ base: '2xs', md: '2xs' }}
          color="gray.400"
          mt={1.5}
          px={1}
          textAlign={{ base: 'center', md: 'left' }}
          noOfLines={1}
        >
          {t.submitHint}
        </Text>
      </Box>
    </Flex>
  );
};

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user';
  return (
    <Flex justify={isUser ? 'flex-end' : 'flex-start'}>
      <Box
        maxW={{ base: '90%', md: '75%' }}
        bg={isUser ? '#c9a96e' : '#fdf9f0'}
        color={isUser ? 'white' : 'gray.800'}
        border={isUser ? 'none' : '1px solid'}
        borderColor="rgba(201, 169, 110, 0.3)"
        borderRadius="lg"
        px={{ base: 3.5, md: 4 }}
        py={{ base: 2.5, md: 3 }}
        fontSize="sm"
        lineHeight="1.65"
        whiteSpace="pre-wrap"
        wordBreak="break-word"
      >
        {msg.pending ? <TypingDots /> : msg.content}
      </Box>
    </Flex>
  );
}

/**
 * "…" indicator while the assistant is thinking. Three small dots
 * animating in a wave, matching the site's gold palette.
 */
function TypingDots() {
  return (
    <HStack spacing={1} py={1.5}>
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          w="6px"
          h="6px"
          borderRadius="full"
          bg="#c9a96e"
          sx={{
            animation: `verobounce 1.2s ease-in-out ${i * 0.15}s infinite`,
            '@keyframes verobounce': {
              '0%, 60%, 100%': { opacity: 0.35, transform: 'scale(0.85)' },
              '30%': { opacity: 1, transform: 'scale(1.15)' },
            },
          }}
        />
      ))}
    </HStack>
  );
}

function EmptyState({
  title,
  description,
  prompts,
  onSuggest,
}: {
  title: string;
  description: string;
  prompts: string[];
  onSuggest: (text: string) => void;
}) {
  return (
    <VStack spacing={5} py={{ base: 8, md: 12 }} textAlign="center">
      <Flex
        w="64px"
        h="64px"
        borderRadius="full"
        bg="#fdf9f0"
        border="1px solid"
        borderColor="#e8d9a8"
        align="center"
        justify="center"
        color="#c9a96e"
      >
        <Icon as={FaRegLightbulb} boxSize={6} />
      </Flex>
      <VStack spacing={1.5}>
        <Text fontSize="md" fontWeight="500" color="gray.800">
          {title}
        </Text>
        <Text fontSize="sm" color="gray.500" fontWeight="300" maxW="380px" lineHeight="1.7">
          {description}
        </Text>
      </VStack>
      <VStack spacing={2} pt={2} align="stretch" w="100%" maxW="440px">
        {prompts.map((p) => (
          <Box
            key={p}
            as="button"
            type="button"
            onClick={() => onSuggest(p)}
            fontSize="sm"
            color="gray.700"
            bg="white"
            border="1px solid"
            borderColor="gray.200"
            _hover={{ borderColor: '#c9a96e', bg: '#fdf9f0' }}
            _active={{ borderColor: '#c9a96e', bg: '#f5efe4' }}
            borderRadius="sm"
            px={{ base: 4, md: 3.5 }}
            py={{ base: 3, md: 2.5 }}
            minH={{ base: '44px', md: 'auto' }}
            textAlign="left"
            cursor="pointer"
            transition="all 0.15s"
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          >
            {p}
          </Box>
        ))}
      </VStack>
    </VStack>
  );
}

const TOAST_META: Record<DbWrite['type'], { icon: typeof FaPlus }> = {
  created: { icon: FaPlus },
  updated: { icon: FaCheck },
  deleted: { icon: FaTrash },
};

// (Old Web Speech API type declarations lived here — no longer
// needed now that voice input goes through Whisper via <VoiceInput>.)

export default AdminAssistantChat;
