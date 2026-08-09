import {
  Box, Flex, Text, HStack, VStack, Textarea, Icon, Spinner, IconButton,
  useToast,
} from '@chakra-ui/react';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  FaPaperPlane, FaMicrophone, FaRedo, FaCheck, FaPlus, FaTrash, FaRegLightbulb,
} from 'react-icons/fa';
import CTAButton from './ui/CTAButton';

/**
 * "Chat" panel of the Assistant tab.
 *
 * Vero talks to her AI business assistant in Russian. The assistant:
 *   - always knows what's in ai_context (loaded server-side each turn
 *     into the system prompt — no history-scrolling required)
 *   - can look up + modify that knowledge base via tool calls
 *   - answers in Russian but stores English underneath for the
 *     customer-facing AI reply engine
 *
 * When a tool call writes to the DB, a golden toast pops corner-right
 * summarizing what changed IN RUSSIAN so Vero sees the effect
 * without leaving the chat.
 *
 * Voice input: press-and-hold the mic button, speak in Russian,
 * release; the transcript populates the composer. Uses the browser's
 * built-in SpeechRecognition (Chrome/Safari) — no external service.
 */

interface Props {
  adminPassword: string;
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
  content_ru: string;
}

const AdminAssistantChat = ({ adminPassword }: Props) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [micActive, setMicActive] = useState(false);
  const [micUnavailable, setMicUnavailable] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const toast = useToast();

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

  // Auto-scroll to bottom on new messages / thinking indicator.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  const showAchievementToast = useCallback(
    (write: DbWrite) => {
      const meta = TOAST_META[write.type];
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
                  {meta.label}
                </Text>
                <Text fontSize="sm" color="gray.800" fontWeight="400" lineHeight="1.4">
                  {write.content_ru}
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
    [toast],
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
        body: JSON.stringify({ password: adminPassword, action: 'send', message: text }),
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
              content: `(Что-то пошло не так: ${data.error || 'ошибка сервера'})`,
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
          next[lastIdx] = { role: 'assistant', content: '(Не удалось связаться с сервером.)' };
        }
        return next;
      });
    } finally {
      setSending(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Стереть весь текущий разговор?')) return;
    try {
      await fetch('/api/admin/assistant-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword, action: 'reset' }),
      });
      setMessages([]);
    } catch {
      toast({ title: 'Не удалось стереть', status: 'error', duration: 3000 });
    }
  };

  // ── Web Speech API: press-and-hold mic to dictate in Russian ──
  useEffect(() => {
    const SpeechRecognitionCtor =
      (window as unknown as { SpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setMicUnavailable(true);
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'ru-RU';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      if (transcript) {
        setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
      }
    };
    recognition.onend = () => setMicActive(false);
    recognition.onerror = () => setMicActive(false);
    recognitionRef.current = recognition;
    return () => {
      recognition.abort();
    };
  }, []);

  const startMic = () => {
    if (!recognitionRef.current || micActive) return;
    try {
      recognitionRef.current.start();
      setMicActive(true);
    } catch {
      // Some browsers throw if start() is called too quickly after end.
      setMicActive(false);
    }
  };
  const stopMic = () => {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      // ignore
    }
    setMicActive(false);
  };

  return (
    <Flex direction="column" h={{ base: '75vh', md: '78vh' }} maxW="900px" mx="auto">
      {/* Header row */}
      <Flex align="center" justify="space-between" mb={3} px={1}>
        <HStack spacing={2}>
          <Icon as={FaRegLightbulb} boxSize={3.5} color="#c9a96e" />
          <Text fontSize="xs" color="gray.500" fontWeight="400" letterSpacing="0.06em">
            Разговор с личным ассистентом. Пиши по-русски.
          </Text>
        </HStack>
        {messages.length > 0 && (
          <Box
            as="button"
            type="button"
            onClick={handleReset}
            display="inline-flex"
            alignItems="center"
            gap={1.5}
            fontSize="2xs"
            color="gray.400"
            _hover={{ color: '#c9a96e' }}
            bg="transparent"
            border="none"
            cursor="pointer"
            px={2}
            py={1}
          >
            <Icon as={FaRedo} boxSize={2.5} />
            Новый разговор
          </Box>
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
          <EmptyState onSuggest={setInput} />
        ) : (
          <VStack spacing={4} align="stretch">
            {messages.map((m, i) => (
              <MessageBubble key={i} msg={m} />
            ))}
          </VStack>
        )}
      </Box>

      {/* Composer */}
      <Box mt={3}>
        <Flex gap={2} align="flex-end">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Напиши сообщение… (например: «Что ты знаешь о моих ценах?»)"
            rows={2}
            resize="none"
            fontSize="sm"
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
          {!micUnavailable && (
            <IconButton
              aria-label={micActive ? 'Остановить запись' : 'Записать голос'}
              icon={<Icon as={FaMicrophone} boxSize={4} />}
              onMouseDown={startMic}
              onMouseUp={stopMic}
              onMouseLeave={stopMic}
              onTouchStart={startMic}
              onTouchEnd={stopMic}
              variant="outline"
              size="lg"
              bg={micActive ? '#c9a96e' : 'white'}
              color={micActive ? 'white' : '#8a6e35'}
              borderColor={micActive ? '#c9a96e' : 'gray.300'}
              _hover={{ bg: micActive ? '#b8964f' : 'gray.50' }}
              isDisabled={sending}
            />
          )}
          <CTAButton
            onClick={handleSend}
            icon={FaPaperPlane}
            variant="solid"
            size="md"
            isLoading={sending}
            loadingText="…"
            isDisabled={!input.trim()}
          >
            Отправить
          </CTAButton>
        </Flex>
        <Text fontSize="2xs" color="gray.400" mt={1.5} px={1}>
          {micActive
            ? '🎙 Говори по-русски… отпусти кнопку, когда закончишь'
            : '⌘/Ctrl + Enter чтобы отправить · Удерживай микрофон для голоса'}
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

function EmptyState({ onSuggest }: { onSuggest: (text: string) => void }) {
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
          Твой личный ассистент готов
        </Text>
        <Text fontSize="sm" color="gray.500" fontWeight="300" maxW="380px" lineHeight="1.7">
          Спрашивай о ценах, стиле, услугах, ответах клиентам — что знаешь, чего
          не знаешь, что добавить. Всё, что мы обсудим, ассистент запомнит.
        </Text>
      </VStack>
      <VStack spacing={2} pt={2} align="stretch" w="100%" maxW="440px">
        {SUGGESTED_PROMPTS.map((p) => (
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
            borderRadius="sm"
            px={3.5}
            py={2.5}
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

const SUGGESTED_PROMPTS = [
  'Что ты знаешь о моих ценах?',
  'Расскажи, какой у меня стиль общения с клиентами',
  'Добавь новую услугу: семейная фотосессия в студии за $400',
  'Ответы AI слишком формальные — сделай их теплее',
];

const TOAST_META: Record<DbWrite['type'], { icon: typeof FaPlus; label: string }> = {
  created: { icon: FaPlus, label: 'Записал' },
  updated: { icon: FaCheck, label: 'Обновил' },
  deleted: { icon: FaTrash, label: 'Удалил' },
};

// Minimal type declarations for the browser SpeechRecognition APIs
// (not in @types/react by default; both prefixed and unprefixed
// variants exist on Safari + Chromium).
interface SpeechRecognition extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognition, ev: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface SpeechRecognitionEvent extends Event {
  results: {
    length: number;
    [index: number]: {
      [index: number]: { transcript: string };
    };
  };
}
declare const SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

export default AdminAssistantChat;
