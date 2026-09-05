import {
  Box, Flex, Text, HStack, VStack, Textarea, Icon, Spinner, IconButton,
  Menu, MenuButton, MenuList, MenuItem, MenuDivider,
  useToast, Stack,
} from '@chakra-ui/react';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  FaPaperPlane, FaRedo, FaCheck, FaPlus, FaTrash, FaRegLightbulb, FaChevronDown, FaLanguage,
} from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import { ASSISTANT_HANDOFF_KEY } from './AdminMessages';
import { loadDraft, saveDraft, clearDraft, sweepDrafts } from './draftStore';
import { translationTargetFor, shouldAutoTranslate } from './translationDirection';
import VoiceInput from './ui/VoiceInput';
import { useAdminLang, type AdminLang } from '../i18n/admin';

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
  /**
   * Rendered inside the Messages refine panel rather than as its own tab.
   * The standalone sizing (78vh tall, 900px wide, centred) is right for a
   * full page and wrong for a 420px column, so embedded mode just fills
   * whatever box it is given.
   */
  embedded?: boolean;
  /**
   * Which conversation this panel is refining. Scopes the unsent-text draft,
   * so switching threads and coming back restores the right one.
   */
  conversationId?: string | null;
  /**
   * Fired when the assistant sends the reply itself, via its `send_reply`
   * tool, rather than Vero sending from the draft card. Same end state — the
   * message is out the door — so the refine session should end either way.
   */
  onReplySent?: () => void;
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
  translateOn: string;
  translateOff: string;
  translatingTurn: string;
  headerHint: string;
  newConversation: string;
  resetConfirm: string;
  resetFailed: string;
  placeholder: string;
  send: string;
  micRecordAria: string;
  micStopAria: string;
  micRecordingHint: string;
  loadingEmpty: string;
  emptyTitle: string;
  emptyDescription: string;
  suggestedPrompts: string[];
  quickActionsLabel: string;
  quickActions: Array<{ label: string; prompt: string }>;
  toastLabels: { created: string; updated: string; deleted: string };
  errorReply: (detail: string) => string;
  serverUnreachable: string;
  serverError: string;
  looping: string;
}

/** Whether the refine panel shows a translation under each assistant turn. */
const TRANSLATE_KEY = 'vero_refine_translate';

const STRINGS: Record<AdminLang, Strings> = {
  ru: {
    translateOn: 'Показывать перевод',
    translateOff: 'Скрыть перевод',
    translatingTurn: 'Перевожу…',
    headerHint: 'Разговор с личным ассистентом. Пиши по-русски.',
    newConversation: 'Новый разговор',
    resetConfirm: 'Стереть весь текущий разговор?',
    resetFailed: 'Не удалось стереть',
    placeholder: 'Напиши сообщение… (например: «Что ты знаешь о моих ценах?»)',
    send: 'Отправить',
    micRecordAria: 'Записать голос',
    micStopAria: 'Остановить запись',
    micRecordingHint: '🎙 Говори… отпусти кнопку, когда закончишь',
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
    quickActionsLabel: 'С чем помочь?',
    quickActions: [
      {
        label: 'Помоги ответить клиенту',
        prompt: 'Помоги мне ответить на одно из моих сообщений. Покажи последние несколько диалогов, и я выберу.',
      },
      {
        label: 'Что ждёт моего ответа?',
        prompt: 'Какие диалоги ждут моего ответа прямо сейчас? Покажи коротко, что там происходит.',
      },
      {
        label: 'Вопрос по админке или сайту',
        prompt: 'У меня вопрос по админ-панели: ',
      },
      {
        label: 'Изменить, как AI отвечает клиентам',
        prompt: 'Хочу поменять то, как AI отвечает клиентам. Вот что мне не нравится: ',
      },
      {
        label: 'Добавить или обновить информацию',
        prompt: 'Запиши, пожалуйста: ',
      },
    ],
    toastLabels: { created: 'Записал', updated: 'Обновил', deleted: 'Удалил' },
    errorReply: (detail) => `(Что-то пошло не так: ${detail})`,
    serverUnreachable: '(Не удалось связаться с сервером.)',
    serverError: 'ошибка сервера',
    looping: '(Ассистент продолжал вызывать инструменты без ответа. Попробуй перефразировать.)',
  },
  en: {
    translateOn: 'Show translation',
    translateOff: 'Hide translation',
    translatingTurn: 'Translating…',
    headerHint: 'Chatting with your personal assistant. Write in English.',
    newConversation: 'New conversation',
    resetConfirm: 'Erase the entire current conversation?',
    resetFailed: 'Could not reset',
    placeholder: 'Type a message… (e.g. "What do you know about my pricing?")',
    send: 'Send',
    micRecordAria: 'Record voice',
    micStopAria: 'Stop recording',
    micRecordingHint: '🎙 Speaking… release when done',
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
    quickActionsLabel: 'What do you need?',
    quickActions: [
      {
        label: 'Help me reply to a customer',
        prompt: 'Help me reply to one of my conversations. Show me the last few and I\'ll pick one.',
      },
      {
        label: "What's waiting on me?",
        prompt: 'Which conversations are waiting on my reply right now? Give me a short rundown.',
      },
      {
        label: 'Question about the panel or site',
        prompt: 'I have a question about the admin panel: ',
      },
      {
        label: 'Change how the AI replies',
        prompt: "I want to change how the AI replies to customers. Here's what I don't like: ",
      },
      {
        label: 'Add or update something you know',
        prompt: 'Please make a note of this: ',
      },
    ],
    toastLabels: { created: 'Saved', updated: 'Updated', deleted: 'Deleted' },
    errorReply: (detail) => `(Something went wrong: ${detail})`,
    serverUnreachable: '(Could not reach the server.)',
    serverError: 'server error',
    looping: '(The assistant kept calling tools without giving a final answer. Try rephrasing.)',
  },
};

const AdminAssistantChat = ({ adminPassword, embedded = false, conversationId = null, onReplySent }: Props) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // A conversation can hand a question over — "this draft isn't right,
  // help me fix it" — by parking a prompt in sessionStorage and switching
  // tabs. Read once on mount and clear, so it can't reappear later.
  // Prefills rather than sends: the prompt ends mid-sentence on purpose,
  // waiting for Vero to say what she'd change.
  const draftScope = conversationId ?? 'general';
  const [input, setInput] = useState(() => loadDraft('assistant', draftScope));

  // The parked handoff prompt is consumed in an effect, not in the useState
  // initializer above. StrictMode double-invokes initializers: the first call
  // read the key and removed it, and the second call — whose return value React
  // actually keeps — found nothing, so the prompt silently vanished. An effect
  // runs after the state is settled, and a StrictMode re-run finds the key
  // already gone and no-ops.
  //
  // A fresh handoff is an explicit "refine THIS draft" and outranks whatever
  // was left in the composer, which is what makes a second Improve press reset
  // rather than restore stale text.
  useEffect(() => {
    let parked: string | null = null;
    try {
      parked = sessionStorage.getItem(ASSISTANT_HANDOFF_KEY);
      if (parked) sessionStorage.removeItem(ASSISTANT_HANDOFF_KEY);
    } catch {
      return;
    }
    if (parked) setInput(parked);
    // Mount only; a handoff is parked immediately before this panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  // Debounced so typing does not hit localStorage on every keystroke.
  useEffect(() => {
    const id = window.setTimeout(() => saveDraft('assistant', draftScope, input), 400);
    return () => window.clearTimeout(id);
  }, [input, draftScope]);

  // A pull-to-refresh does not reliably fire `beforeunload` on iOS Safari,
  // which is exactly how this was lost. `pagehide` and `visibilitychange` do.
  useEffect(() => {
    const flush = () => saveDraft('assistant', draftScope, inputRef.current);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [draftScope]);

  useEffect(() => {
    sweepDrafts();
  }, []);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // The pagehide listener is registered once; without this it would flush
  // whatever `input` was when it was registered.
  const inputRef = useRef(input);
  inputRef.current = input;
  const toast = useToast();

  // Indexed by the GLOBAL admin language. It used to be indexed by a separate
  // `vero_assistant_lang` key that defaulted to 'ru' and could only be changed
  // from a toggle on the Assistant tab, so every string here stayed Russian for
  // an English admin who had never visited that tab.
  const { lang } = useAdminLang();
  const t = STRINGS[lang];

  // Vero reads Russian; the drafts are written in the CUSTOMER's language,
  // usually English. She cannot improve a reply she cannot read, and asking
  // her to hit Translate on every revision would be a click per version. So
  // inside the refine panel each assistant turn carries its translation
  // underneath, and she sees both the version that will be sent and what it
  // says. Off by default in English, and switchable either way, because for
  // an English-speaking admin it is pure noise.
  const [showTranslations, setShowTranslations] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(TRANSLATE_KEY);
      if (stored !== null) return stored === '1';
    } catch {
      /* private browsing */
    }
    return embedded;
  });
  const [translations, setTranslations] = useState<Record<number, string>>({});
  // Indices already translated or in flight. A ref, not state, so the effect
  // below can consult it without listing it as a dependency.
  const translatedTurns = useRef<Set<number>>(new Set());
  const [translatingTurn, setTranslatingTurn] = useState<number | null>(null);

  // One routine, used by both the automatic pass and the per-turn button, so
  // they cannot drift apart. `force` skips the already-claimed check because a
  // manual press is an explicit retry.
  const translateTurn = useCallback(
    async (i: number, text: string, force = false) => {
      if (!force && translatedTurns.current.has(i)) return;
      translatedTurns.current.add(i);
      if (force) setTranslatingTurn(i);
      try {
        const res = await fetch('/api/admin/messages-translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Direction comes from the text, not the panel language, so a
          // generated English reply always renders in Russian for Vero rather
          // than being "translated" into the language it is already in.
          body: JSON.stringify({ password: adminPassword, text, targetLang: translationTargetFor(text) }),
        });
        const data = await res.json();
        if (res.ok && data.success && typeof data.translated === 'string') {
          setTranslations((prev) => ({ ...prev, [i]: data.translated }));
        } else {
          translatedTurns.current.delete(i);
        }
      } catch {
        translatedTurns.current.delete(i);
      } finally {
        if (force) setTranslatingTurn(null);
      }
    },
    [adminPassword],
  );

  const toggleTranslations = () => {
    setShowTranslations((v) => {
      const next = !v;
      try {
        localStorage.setItem(TRANSLATE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Translate assistant turns as they arrive. Skips anything already mostly in
  // the target script, so a Russian reply is not round-tripped through a
  // translator for no reason.
  useEffect(() => {
    if (!embedded || !showTranslations) return;
    // Auto-translate only English content; see translationDirection.ts for why
    // the test counts characters instead of asking whether the turn is purely
    // one script.
    (async () => {
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m.role !== 'assistant' || m.pending) continue;
        if (!shouldAutoTranslate(m.content)) continue;
        await translateTurn(i, m.content);
      }
    })();
    // `translations` is deliberately NOT a dependency. It was, and since this
    // effect SETS it, every success re-ran the loop from index 0 and abandoned
    // the in-flight fetch — each turn costing several duplicate paid calls. The
    // already-done set lives in a ref precisely so it can be read here without
    // retriggering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, showTranslations, embedded, translateTurn]);


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
          body: JSON.stringify({ password: adminPassword, action: 'history', conversationId }),
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
    // conversationId is a dependency now that transcripts are per-conversation:
    // without it, opening the panel on a second thread would keep showing the
    // first thread's history. Translations are keyed by array index, so they
    // have to be dropped with it or they would caption the wrong turns.
  }, [adminPassword, conversationId]);

  useEffect(() => {
    setMessages([]);
    setTranslations({});
    translatedTurns.current.clear();
    setLoading(true);
  }, [conversationId]);

  // Chat scroll behavior — the first render after history loads
  // should be scrolled to the TOP of whatever exists (so Vero sees
  // the greeting / suggested prompts / start of the conversation
  // instead of the tail end). After that, every new message /
  // pending indicator scrolls to the BOTTOM the way a chat should.
  const initialScrollDoneRef = useRef(false);
  useEffect(() => {
    if (!scrollRef.current) return;
    if (!initialScrollDoneRef.current) {
      // Land on the NEWEST message, not the oldest.
      //
      // This used to pin to the top on first load, on the theory that
      // seeing old context tells you there's history to scroll through.
      // In practice it means every visit to the tab opens on a
      // conversation from days ago and you have to scroll to find where
      // you left off. Chats open at the bottom; that's the convention
      // for a reason.
      if (!loading) initialScrollDoneRef.current = true;
    }
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
            borderColor="brand.accent"
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
                bg="brand.accent"
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
                  color="brand.accentText"
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
    clearDraft('assistant', draftScope);
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
          conversationId,
          message: text,
          // Sent every turn so the server prompt matches whatever
          // language the toggle is on at send time. Language changes
          // mid-thread flip the NEXT reply, not old ones.
          language: lang,
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
        const writes = (data.dbWrites ?? []) as DbWrite[];
        for (const write of writes) {
          showAchievementToast(write);
        }
        // The assistant can send the reply itself. When it does, the refine
        // session is finished for the same reason it is when she sends from
        // the draft card, so let the parent close the panel.
        if (writes.some((w) => w.label === 'Reply sent')) onReplySent?.();
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
      // The network never carried it, so nothing was persisted server-side and
      // giving the words back is safe. Only on the catch: a non-ok RESPONSE may
      // mean the turn was already stored, and restoring there would invite a
      // duplicate. She types offline, sends, and gets her message back.
      setInput(text);
      saveDraft('assistant', draftScope, text);
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
        body: JSON.stringify({ password: adminPassword, action: 'reset', conversationId }),
      });
      setMessages([]);
      // Keyed by array index, so without this the old turn 0's translation
      // reappears under whatever the new turn 0 turns out to be.
      setTranslations({});
      translatedTurns.current.clear();
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
      h={embedded ? '100%' : { base: 'calc(100dvh - 260px)', md: '78vh' }}
      maxW={embedded ? 'none' : '900px'}
      mx={embedded ? 0 : 'auto'}
      px={embedded ? 2 : 0}
      overflow="hidden"
    >
      {/* Header row — desktop shows the hint text; mobile keeps just
          the reset icon so vertical space is preserved. Reset button
          is an icon-only 36×36 button (with tooltip) to save the
          full-line real estate the old label chip was eating. */}
      <Flex align="center" justify="space-between" mb={2} px={1} gap={2}>
        {/* Quick actions + the hint share the left side, so on mobile —
            where the hint is hidden and this row held nothing but the
            right-aligned reset — the menu costs no extra vertical space.
            It used to sit on its own line above the composer, which on a
            phone was a whole row spent on one chip. */}
        <HStack spacing={3} minW={0}>
          {/* Translation toggle. Only in the refine panel, and only an icon:
              the header is already busy, and this is a preference she sets
              once rather than a control she works. */}
          {embedded && (
            <IconButton
              aria-label={showTranslations ? t.translateOff : t.translateOn}
              title={showTranslations ? t.translateOff : t.translateOn}
              icon={<Icon as={FaLanguage} boxSize={4} />}
              size="xs"
              variant={showTranslations ? 'solid' : 'ghost'}
              bg={showTranslations ? 'brand.surface' : 'transparent'}
              color={showTranslations ? 'brand.accentText' : 'gray.400'}
              onClick={toggleTranslations}
              flexShrink={0}
            />
          )}
  <Menu placement="bottom-start" autoSelect={false}>
            <MenuButton
              as={Box}
              role="button"
              display="inline-flex"
              alignItems="center"
              gap={1.5}
              cursor="pointer"
              fontSize="xs"
              fontWeight="500"
              color="gray.600"
              bg="white"
              border="1px solid"
              borderColor="gray.200"
              borderRadius="full"
              px={3}
              py={1.5}
              minH="32px"
              whiteSpace="nowrap"
              _hover={{ borderColor: 'brand.accent', color: 'brand.accentText' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon as={FaRegLightbulb} boxSize={3} />
              {t.quickActionsLabel}
              <Icon as={FaChevronDown} boxSize={2.5} />
            </MenuButton>
            <MenuList fontSize="sm" minW="280px" zIndex={20}>
              {t.quickActions.map((a, i) => (
                <Box key={a.label}>
                  {i === 2 && <MenuDivider />}
                  <MenuItem
                    onClick={() => setInput(a.prompt)}
                    _hover={{ bg: 'brand.surface' }}
                    _focus={{ bg: 'brand.surface' }}
                  >
                    {a.label}
                  </MenuItem>
                </Box>
              ))}
            </MenuList>
          </Menu>
          {/* Standalone tab only. Chakra breakpoints measure the VIEWPORT, not
              this column, so on a 1440px screen the `lg` hint still rendered
              inside a ~370px panel and shoved the quick-actions chip onto two
              lines. The hint is redundant there anyway — the panel header
              already says what the panel is. */}
          {!embedded && (
            <Text
              fontSize="xs"
              color="gray.500"
              fontWeight="400"
              letterSpacing="0.06em"
              display={{ base: 'none', lg: 'block' }}
              noOfLines={1}
            >
              {t.headerHint}
            </Text>
          )}
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
            _hover={{ color: 'brand.accent' }}
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
            <Spinner size="sm" color="brand.accentText" />
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
              <MessageBubble
                key={i}
                msg={m}
                // Gated on showTranslations, not just on `embedded`: the cache
                // is kept across a toggle so flipping back is instant, which
                // means the render has to be what hides them. Without this the
                // "hide" button only stopped fetching NEW ones and left every
                // translation already on screen sitting there.
                translation={embedded && showTranslations ? translations[i] : undefined}
                onTranslate={
                  embedded && m.role === 'assistant'
                    ? () => translateTurn(i, m.content, true)
                    : undefined
                }
                translating={translatingTurn === i}
                translateLabel={t.translateOn}
                translatingLabel={t.translatingTurn}
              />
            ))}
          </VStack>
        )}
      </Box>

      {/* Composer — textarea gets its own row on mobile so it isn't
          crushed to ~230px alongside the mic + send buttons. Mic is
          rendered as icon-only always; Send is icon-only on mobile
          (to keep the row balanced) and CTA-labeled on desktop. */}
      <Box
        mt={{ base: 2, md: 3 }}
        // Safe-area padding so the composer clears the iOS home
        // indicator when this pane goes edge-to-edge. The admin
        // container already clears the fixed bottom nav.
        pb={{ base: 'max(env(safe-area-inset-bottom), 0px)', md: 0 }}
      >
        {/* Chakra breakpoints measure the VIEWPORT, not this container — so
            inside the 420px refine panel on a 1440px screen the composer was
            still using the desktop ROW layout and the textarea collapsed to
            181px (measured). Embedded always stacks, so the field gets the
            panel's full width. */}
        {/* Embedded from lg up: field on the left, send stacked over mic in a
            narrow right column. The previous shape — field, then a button row
            beneath it — left that whole row mostly empty however the button
            was sized, which is the "wasted space" this replaces. Below lg the
            panel is full-screen and the stacked shape is right. */}
        <Stack
          direction={embedded ? { base: 'column', lg: 'row' } : { base: 'column', md: 'row' }}
          spacing={2}
          align={embedded ? { base: 'stretch', lg: 'stretch' } : { base: 'stretch', md: 'flex-end' }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.placeholder}
            // Was rows={2}: about two lines visible, which is unusable when
            // drafting a client reply. Height is driven by minH rather than
            // rows so the two viewports can differ — the chat root is a FIXED
            // height on mobile (calc(100dvh - 260px)), so every pixel the
            // composer takes comes straight out of the message list. Desktop
            // has the room; a phone does not.
            rows={3}
            resize="vertical"
            minH={embedded ? { base: '112px', md: '148px' } : { base: '112px', md: '132px' }}
            maxH={{ base: '40vh', md: '50vh' }}
            // 16px prevents iOS Safari from zooming the whole page in
            // when the textarea gets focused; matches the Messages tab.
            fontSize={{ base: '16px', md: 'sm' }}
            bg="white"
            borderColor="gray.300"
            _hover={{ borderColor: 'gray.400' }}
            _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
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
          {/* alignSelf, not just justify: the parent column stack stretches its
              children, so this row filled the panel and the send button grew
              with it (measured 303px). Shrinking the ROW to its content is what
              actually makes the button hug. */}
          {/* Embedded on a phone: the row spans the panel and send fills
              whatever the mic does not, because a hugging button left two
              thirds of the row as dead space. From lg up the panel is a
              420px column beside the thread, where a full-width send button
              is the thing that looks wrong — so it hugs there instead. */}
          {/* Desktop panel: a narrow icon column beside the field — send on the
              top two thirds, mic on the bottom third, both icon-only. A labelled
              send button was long and thin while the mic looked oversized for
              something rarely used on a keyboard; dropping the labels gives the
              field ~5/6 of the width. column-reverse keeps SEND on top without
              reordering the JSX, so the mic stays first in tab order. */}
          <Stack
            direction={embedded ? { base: 'row', lg: 'column-reverse' } : 'row'}
            spacing={2}
            justify={embedded ? { base: 'flex-start', lg: 'flex-start' } : { base: 'stretch', md: 'flex-end' }}
            w={embedded ? { base: '100%', lg: '68px' } : undefined}
            flex={embedded ? { lg: '0 0 68px' } : undefined}
            alignSelf={embedded ? { lg: 'stretch' } : undefined}
          >
            <VoiceInput
              adminPassword={adminPassword}
              language={lang}
              onTranscript={handleTranscript}
              ariaLabelIdle={t.micRecordAria}
              ariaLabelRecording={t.micStopAria}
              ariaLabelUploading={lang === 'ru' ? 'Расшифровываю…' : 'Transcribing…'}
              variant="outline"
              size="lg"
              minW={embedded ? { base: '48px', lg: '100%' } : { base: '48px', md: 'auto' }}
              minH={{ base: '48px', md: 'auto' }}
              // Bottom third of the icon column on desktop.
              w={embedded ? { lg: '100%' } : undefined}
              h={embedded ? { lg: '100%' } : undefined}
              flex={embedded ? { base: '0 0 auto', lg: '1 1 0' } : '0 0 auto'}
            />
            <CTAButton
              onClick={handleSend}
              icon={FaPaperPlane}
              variant="solid"
              size={embedded ? 'sm' : 'md'}
              fullWidth={embedded ? true : { base: true, md: false }}
              // Top two thirds of the icon column on desktop.
              h={embedded ? { lg: '100%' } : undefined}
              flex={embedded ? { base: '1 1 auto', lg: '2 1 0' } : undefined}
              aria-label={t.send}
              isLoading={sending}
              loadingText="…"
              isDisabled={!input.trim()}
            >
              {/* Label on the phone row; icon-only in the desktop column. */}
              <Box as="span" display={embedded ? { base: 'inline', lg: 'none' } : 'inline'}>
                {t.send}
              </Box>
            </CTAButton>
          </Stack>
        </Stack>
        {/* The ⌘+Enter hint is gone. Two attempts to hide it by breakpoint
            still left it on screen, and it was never worth a row directly
            above the send button: it documented a shortcut that does not
            exist on a phone and that nobody needs told twice on a desktop.
            The shortcut itself still works — see the Textarea's onKeyDown. */}
      </Box>
    </Flex>
  );
};

function MessageBubble({
  msg,
  translation,
  onTranslate,
  translating,
  translateLabel,
  translatingLabel,
}: {
  msg: ChatMessage;
  /** Shown beneath the original, so both the sendable text and its meaning
   *  are visible at once. */
  translation?: string;
  /**
   * Manual trigger. The automatic pass uses a script heuristic, and a
   * heuristic can always be wrong about one turn; this makes "translate this"
   * reachable regardless, which is what was missing.
   */
  onTranslate?: () => void;
  translating?: boolean;
  translateLabel?: string;
  translatingLabel?: string;
}) {
  const isUser = msg.role === 'user';
  return (
    <Flex justify={isUser ? 'flex-end' : 'flex-start'}>
      <Box
        maxW={{ base: '90%', md: '75%' }}
        bg={isUser ? 'brand.accent' : 'brand.surface'}
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
        {translation && !msg.pending && (
          <Box
            mt={2.5}
            pt={2.5}
            borderTop="1px solid"
            borderColor="rgba(201, 169, 110, 0.35)"
            fontSize="xs"
            color="gray.600"
            fontStyle="italic"
          >
            {translation}
          </Box>
        )}
        {!translation && !msg.pending && onTranslate && (
          <Box
            as="button"
            type="button"
            onClick={onTranslate}
            disabled={translating}
            mt={2}
            // The bubble is whiteSpace:pre-wrap, so an inline-flex chip flows
            // straight after the last word of the message. It needs its own row.
            display="flex"
            width="fit-content"
            alignItems="center"
            gap={1.5}
            fontSize="2xs"
            fontWeight="500"
            color={translating ? 'gray.400' : 'brand.accentText'}
            opacity={0.85}
            _hover={translating ? undefined : { opacity: 1, textDecoration: 'underline' }}
            cursor={translating ? 'default' : 'pointer'}
            minH={{ base: '32px', md: 'auto' }}
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Icon as={FaLanguage} boxSize={2.5} />
            {translating ? translatingLabel : translateLabel}
          </Box>
        )}
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
          bg="brand.accent"
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
        bg="brand.surface"
        border="1px solid"
        borderColor="brand.accentBorder"
        align="center"
        justify="center"
        color="brand.accentText"
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
            _hover={{ borderColor: 'brand.accent', bg: 'brand.surface' }}
            _active={{ borderColor: 'brand.accent', bg: 'brand.surfaceSunken' }}
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
