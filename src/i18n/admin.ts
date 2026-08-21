/**
 * Admin-panel i18n dictionary + hook.
 *
 * How this is structured:
 *   - `dict` is the ONE source of truth, keyed by section (auth,
 *     common, nav, messages, assistant, clients, ...) then by
 *     specific key. Each leaf is `{ en: string, ru: string }`.
 *   - `useAdminLang()` returns { lang, setLang, t } where `t` is
 *     the current-language projection of the whole dict — so
 *     callers write `t.common.save` and get a plain string. No
 *     lookups by key, no missing-key surprises: TypeScript flags
 *     any typo at build time.
 *   - Language defaults per admin level: 'admin' (Vero) → RU,
 *     'super' (Alex) → EN. The user can override via the toggle
 *     in the Menu drawer; the override is persisted per-browser.
 *
 * How to add a string:
 *   1. Add the leaf to `dict` here (both `en` and `ru`).
 *   2. Reference it in your component via `t.section.key`.
 *   Rules of the road:
 *   - Keep interpolations simple. If you need dynamic values
 *     inside a translated string, use a function leaf
 *     `(name: string) => \`Hello, \${name}\`` — see `.dynamic` examples.
 *   - Don't put user data in the dict — this is UI copy only.
 *   - When Russian conveys the same idea with a different sentence
 *     structure, translate for meaning, not word-for-word.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createElement } from 'react';

export type AdminLang = 'ru' | 'en';
export type AdminLevel = 'admin' | 'super';

// ─── Dictionary ──────────────────────────────────────────────────
//
// Structure: `dict[section][key] = { en, ru }` for static strings,
// or `dict[section][key] = { en: (arg) => string, ru: (arg) => string }`
// for dynamic ones. The `Translated<T>` helper below projects the
// whole tree into the current-language shape.

type StaticLeaf = { en: string; ru: string };
type FnLeaf<A extends any[]> = { en: (...args: A) => string; ru: (...args: A) => string };
type Leaf = StaticLeaf | FnLeaf<any>;

const dict = {
  common: {
    save: { en: 'Save', ru: 'Сохранить' },
    cancel: { en: 'Cancel', ru: 'Отмена' },
    delete: { en: 'Delete', ru: 'Удалить' },
    edit: { en: 'Edit', ru: 'Редактировать' },
    close: { en: 'Close', ru: 'Закрыть' },
    back: { en: 'Back', ru: 'Назад' },
    refresh: { en: 'Refresh', ru: 'Обновить' },
    new: { en: 'New', ru: 'Новое' },
    loading: { en: 'Loading…', ru: 'Загрузка…' },
    saving: { en: 'Saving…', ru: 'Сохраняю…' },
    sending: { en: 'Sending…', ru: 'Отправка…' },
    error: { en: 'Error', ru: 'Ошибка' },
    serverError: { en: 'Server error', ru: 'Ошибка сервера' },
    couldNotReach: { en: 'Could not reach the server.', ru: 'Не удалось связаться с сервером.' },
    confirm: { en: 'Confirm', ru: 'Подтвердить' },
    yes: { en: 'Yes', ru: 'Да' },
    no: { en: 'No', ru: 'Нет' },
    saved: { en: 'Saved', ru: 'Сохранено' },
    deleted: { en: 'Deleted', ru: 'Удалено' },
    add: { en: 'Add', ru: 'Добавить' },
    adminKicker: { en: 'Admin', ru: 'Панель' },
    optional: { en: 'optional', ru: 'необязательно' },
    required: { en: 'required', ru: 'обязательно' },
    copy: { en: 'Copy', ru: 'Копировать' },
    copied: { en: 'Copied!', ru: 'Скопировано!' },
    open: { en: 'Open', ru: 'Открыть' },
    orLabel: { en: 'or', ru: 'или' },
  },

  auth: {
    signInTitle: { en: 'Sign In', ru: 'Вход' },
    emailLabel: { en: 'Email', ru: 'Email' },
    emailPlaceholder: { en: 'you@example.com', ru: 'you@example.com' },
    passwordLabel: { en: 'Password', ru: 'Пароль' },
    passwordPlaceholder: { en: 'Enter password', ru: 'Введи пароль' },
    signInCta: { en: 'Sign In', ru: 'Войти' },
    signingIn: { en: 'Signing in...', ru: 'Вход...' },
    signInFailed: { en: 'Sign in failed.', ru: 'Не удалось войти.' },
  },

  nav: {
    // Bottom-nav group labels (mobile) + desktop tab-strip labels
    clients: { en: 'Clients', ru: 'Клиенты' },
    inbox: { en: 'Inbox', ru: 'Входящие' },
    studio: { en: 'Studio', ru: 'Студия' },
    menu: { en: 'Menu', ru: 'Меню' },
    messages: { en: 'Messages', ru: 'Сообщения' },
    leads: { en: 'Leads', ru: 'Лиды' },
    assistant: { en: 'Assistant', ru: 'Ассистент' },
    journal: { en: 'Journal', ru: 'Дневник' },
    gallery: { en: 'Gallery', ru: 'Галерея' },
    reviews: { en: 'Reviews', ru: 'Отзывы' },
    integrations: { en: 'Integrations', ru: 'Интеграции' },
    crons: { en: 'Crons', ru: 'Задачи' },
    table: { en: 'Table', ru: 'Таблица' },
    calendar: { en: 'Calendar', ru: 'Календарь' },
  },

  menuDrawer: {
    title: { en: 'Menu', ru: 'Меню' },
    publicSite: { en: 'Public site', ru: 'Сайт' },
    home: { en: 'Home', ru: 'Главная' },
    clientPortal: { en: 'Client Portal', ru: 'Портал клиента' },
    super: { en: 'Super', ru: 'Супер' },
    session: { en: 'Session', ru: 'Сессия' },
    signOut: { en: 'Sign out', ru: 'Выйти' },
    language: { en: 'Language', ru: 'Язык' },
  },

  clients: {
    tabTitle: { en: 'Clients', ru: 'Клиенты' },
    portalCount: {
      en: (n: number) => `${n} portal${n === 1 ? '' : 's'}`,
      ru: (n: number) => `${n} ${n === 1 ? 'портал' : n < 5 ? 'портала' : 'порталов'}`,
    },
    newClient: { en: 'New', ru: 'Новый' },
    emptyState: {
      en: 'No portals yet. Tap "+ New" above to create the first one.',
      ru: 'Пока нет порталов. Нажми «+ Новый» вверху, чтобы создать первый.',
    },
    // Fallback name shown when a portal has neither a display name nor
    // an email address to fall back on.
    unnamed: { en: '(unnamed)', ru: '(без имени)' },
    // Formatted balance-paid pill (e.g. "Paid $1500" / "Оплачено $1500").
    // Amount comes in already-formatted with its currency symbol.
    balancePaid: {
      en: (amount: string) => `Paid ${amount}`,
      ru: (amount: string) => `Оплачено ${amount}`,
    },
    tableHeaders: {
      client: { en: 'Client', ru: 'Клиент' },
      session: { en: 'Session', ru: 'Съёмка' },
      eventDate: { en: 'Event date', ru: 'Дата события' },
      contract: { en: 'Contract', ru: 'Контракт' },
      balance: { en: 'Balance', ru: 'Баланс' },
      gallery: { en: 'Gallery', ru: 'Галерея' },
    },
    status: {
      pendingInvite: { en: 'Pending invite', ru: 'Приглашение отправлено' },
      // Badge on portals created via the "Gallery only" flow (no
      // contract, just a password-protected gallery).
      galleryOnly: { en: 'Gallery-only', ru: 'Только галерея' },
      contract: {
        none: { en: 'No contract', ru: 'Нет контракта' },
        pending: { en: 'Pending', ru: 'Ожидается' },
        signed: { en: 'Signed', ru: 'Подписан' },
        void: { en: 'Void', ru: 'Аннулирован' },
      },
      gallery: {
        notDelivered: { en: 'Not delivered', ru: 'Не отправлена' },
        delivered: { en: 'Delivered', ru: 'Отправлена' },
        expired: { en: 'Expired', ru: 'Истекла' },
        // Gallery has photos uploaded to Drive but hasn't been sent
        // to the client yet.
        ready: { en: 'Ready', ru: 'Готова' },
        // Gallery hasn't been created at all yet.
        notStarted: { en: 'Not started', ru: 'Не начата' },
        // Countdown pill next to "Delivered" — days until the gallery
        // link expires. Russian plural rules: 1 день (nom.sg), 2/3/4
        // дня (gen.sg), 5+ дней (gen.pl); the teen range 11–14 always
        // takes gen.pl regardless of last digit.
        daysLeft: {
          en: (n: number) => `${n}d left`,
          ru: (n: number) => {
            const abs = Math.abs(n) % 100;
            const last = abs % 10;
            let word = 'дней';
            if (abs < 11 || abs > 14) {
              if (last === 1) word = 'день';
              else if (last >= 2 && last <= 4) word = 'дня';
            }
            return `${n} ${word} осталось`;
          },
        },
      },
    },
  },

  modeChooser: {
    // Small uppercase kicker above the H1
    kicker: { en: 'New Client', ru: 'Новый клиент' },
    title: { en: 'What kind of booking?', ru: 'Что за съёмка?' },
    fullTitle: { en: 'Full Portal', ru: 'Полный портал' },
    fullDescription: {
      en: 'A new booking with a contract to sign, payment tracking, onboarding email, and photo delivery later. Use this for weddings and most paid shoots.',
      // Split into two shorter sentences — the English one runs long
      // and reads awkwardly translated as a single Russian clause.
      ru: 'Новая съёмка с контрактом на подпись, отслеживанием оплаты, приветственным письмом и передачей фото потом. Подходит для свадеб и большинства платных съёмок.',
    },
    galleryOnlyTitle: { en: 'Gallery Only', ru: 'Только галерея' },
    galleryOnlyDescription: {
      en: "Just share a Google Drive gallery with a password. No contract, no email, no login — replaces the manual photo handoffs. Use this after a shoot when there's no portal flow.",
      // "manual photo handoffs" → «ручной передачи фото» keeps the
      // specific technical meaning; the em-dash carries over cleanly.
      ru: 'Просто отправить галерею в Google Drive с паролем. Без контракта, без письма, без входа — заменяет ручную передачу фото. Подходит для съёмок, где полный портал не нужен.',
    },
  },

  messages: {
    tabTitle: { en: 'Messages', ru: 'Сообщения' },
    subtitle: { en: 'Unified inbox for Instagram DMs and email.', ru: 'Единый ящик для Instagram-сообщений и почты.' },
    conversationCount: {
      en: (n: number) => `${n} ${n === 1 ? 'conversation' : 'conversations'}`,
      // Russian plural rules: 1 диалог, 2/3/4 диалога, 5+ диалогов
      ru: (n: number) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return `${n} диалог`;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} диалога`;
        return `${n} диалогов`;
      },
    },
    aiOn: { en: 'AI: On', ru: 'AI: Вкл' },
    aiPaused: { en: 'AI: Paused', ru: 'AI: Пауза' },
    tapToPause: { en: 'Tap to pause AI globally', ru: 'Нажми, чтобы отключить AI везде' },
    tapToResume: { en: 'Tap to resume AI globally', ru: 'Нажми, чтобы включить AI везде' },
    pauseAll: { en: 'Pause AI for everyone?', ru: 'Отключить AI для всех?' },
    resumeAll: { en: 'Resume AI for everyone?', ru: 'Включить AI для всех?' },
    pauseAllBody: {
      en: "Silence AI replies for ALL conversations? Real customers won't get automated replies until you turn it back on.",
      ru: 'Отключить AI-ответы для ВСЕХ диалогов? Реальные клиенты не будут получать автоматические ответы, пока ты не включишь обратно.',
    },
    resumeAllBody: {
      en: 'Re-enable AI replies for all conversations?',
      ru: 'Включить AI-ответы для всех диалогов?',
    },
    pauseAiConfirm: { en: 'Pause AI', ru: 'Отключить AI' },
    resumeAiConfirm: { en: 'Resume AI', ru: 'Включить AI' },
    aiEnabledGlobally: {
      en: (state: 'on' | 'off') => `AI ${state === 'on' ? 'enabled' : 'paused'} globally`,
      ru: (state: 'on' | 'off') => `AI ${state === 'on' ? 'включён' : 'отключён'} везде`,
    },
    failedToUpdate: { en: 'Failed to update', ru: 'Не удалось обновить' },
    loadFailed: {
      en: (status: number) => `Load failed (${status})`,
      ru: (status: number) => `Не удалось загрузить (${status})`,
    },
    // Individual conversation
    aiOffBanner: { en: 'AI is off — replies are 100% you.', ru: 'AI отключён — отвечаешь ты сама.' },
    // "Refresh profile" button next to the contact name in the
    // conversation header. Manually re-fetches name / handle / avatar
    // from Instagram via /api/admin/messages-refresh-profile.
    refreshProfile: {
      en: 'Refresh profile from Instagram',
      ru: 'Обновить профиль из Instagram',
    },
    profileRefreshed: { en: 'Profile updated', ru: 'Профиль обновлён' },
    profileRefreshFailed: {
      en: 'Could not refresh profile',
      ru: 'Не удалось обновить профиль',
    },
    createClientFromThread: { en: 'Create client from this thread', ru: 'Создать клиента из этого диалога' },
    linkedClient: { en: 'Linked client', ru: 'Связан с клиентом' },
    linkedToPortal: { en: 'Linked to a client portal', ru: 'Связан с порталом клиента' },
    backToConversations: { en: 'Back to conversations', ru: 'К списку диалогов' },
    noConversationSelected: { en: 'Pick a conversation to see it.', ru: 'Выбери диалог, чтобы посмотреть его.' },
    noConversations: { en: 'No conversations yet.', ru: 'Пока нет диалогов.' },
    dismissAiOffNotice: { en: 'Dismiss AI-off notice', ru: 'Скрыть уведомление об отключённом AI' },
    couldNotLoad: { en: 'Could not load conversation.', ru: 'Не удалось загрузить диалог.' },
    // Conversation list — fallback labels when contact_name/handle
    // are both null. Instagram falls back to a masked ID suffix
    // ("Instagram user 234..."). Email falls back to the sender's
    // email address itself (which is the external_user_id).
    instagramUserFallback: {
      en: (suffix: string) => `Instagram user ${suffix}`,
      ru: (suffix: string) => `Instagram-пользователь ${suffix}`,
    },
    emailSenderFallback: {
      en: (address: string) => address,
      ru: (address: string) => address,
    },
    noMessagesYet: { en: 'No messages yet', ru: 'Пока нет сообщений' },
    needsVero: { en: 'Needs Vero', ru: 'Нужна Веро' },
    clientBadge: { en: 'Client', ru: 'Клиент' },
    // Last-message preview prefixes shown in the sidebar
    previewPrefixAi: { en: 'AI: ', ru: 'AI: ' },
    previewPrefixYou: { en: 'You: ', ru: 'Ты: ' },
    // Compact relative-time units for the conversation list.
    relativeNow: { en: 'now', ru: 'сейчас' },
    relativeMinutes: { en: (n: number) => `${n}m`, ru: (n: number) => `${n} мин` },
    relativeHours: { en: (n: number) => `${n}h`, ru: (n: number) => `${n} ч` },
    relativeDays: { en: (n: number) => `${n}d`, ru: (n: number) => `${n} д` },
    relativeWeeks: { en: (n: number) => `${n}w`, ru: (n: number) => `${n} нед` },
    // Sending / translation flow
    translationFailedSending: {
      en: 'Translation failed — sending original text',
      ru: 'Перевод не удался — отправляю оригинал',
    },
    translationUnreachableSending: {
      en: 'Translation unreachable — sending original text',
      ru: 'Перевод недоступен — отправляю оригинал',
    },
    sendFailed: { en: 'Send failed', ru: 'Не удалось отправить' },
    clientPortalCreated: {
      en: 'Client portal created and linked to this conversation.',
      ru: 'Портал клиента создан и связан с этим диалогом.',
    },
    // Voice / mic labels for VoiceInput
    micReleaseStop: { en: 'Release to stop', ru: 'Отпусти, чтобы остановить' },
    micTranscribing: { en: 'Transcribing…', ru: 'Расшифровываю…' },
    // Message-bubble sender labels
    senderThey: { en: 'They said', ru: 'Они пишут' },
    senderAI: { en: 'AI Assistant', ru: 'AI-ассистент' },
    senderYou: { en: 'You (Vero)', ru: 'Ты (Веро)' },
    // Inbound eyebrow varies by how the message arrived. "They said"
    // reads fine on a DM but oddly on a formal email, and a contact-form
    // submission isn't something anyone "said" at all.
    senderForm: { en: 'Contact form', ru: 'Форма на сайте' },
    senderEmail: { en: 'Email', ru: 'Письмо' },

    // ── Delete a conversation ────────────────────────────────────
    deleteConversation: { en: 'Delete conversation', ru: 'Удалить диалог' },
    deleteConfirmTitle: { en: 'Delete this conversation?', ru: 'Удалить этот диалог?' },
    deleteConfirmBody: {
      en: (name: string, n: number) =>
        `This permanently removes the conversation with ${name} and its ${n} message${n === 1 ? '' : 's'}. If they were a contact-form lead, the lead record itself is kept. This cannot be undone.`,
      ru: (name: string, n: number) =>
        `Диалог с ${name} и ${n} сообщени${n === 1 ? 'е' : 'й'} будут удалены навсегда. Если это была заявка с сайта, сама заявка сохранится. Отменить нельзя.`,
    },
    deleteConfirmButton: { en: 'Delete', ru: 'Удалить' },
    deleted: { en: 'Conversation deleted', ru: 'Диалог удалён' },
    deleteFailed: { en: 'Could not delete', ru: 'Не удалось удалить' },

    // ── Email delivery state ─────────────────────────────────────
    deliverySent: { en: 'Sent', ru: 'Отправлено' },
    deliveryDelivered: { en: 'Delivered', ru: 'Доставлено' },
    deliveryBounced: { en: "Didn't arrive", ru: 'Не доставлено' },
    deliveryPending: { en: 'Sending…', ru: 'Отправляется…' },
    deliveryBouncedHelp: {
      en: 'The address rejected it — check it and try again.',
      ru: 'Адрес отклонил письмо — проверь его и попробуй снова.',
    },
    sendFailedCheckThread: {
      en: "If your message isn't in the thread, it didn't send. Refresh before sending again.",
      ru: 'Если сообщения нет в переписке — оно не отправилось. Обнови перед повторной отправкой.',
    },

    // ── AI draft awaiting review (email only) ────────────────────
    draftTitle: { en: 'AI wrote a reply', ru: 'AI написал ответ' },
    draftHelp: {
      en: "It hasn't been sent. Edit it below if you want, then send — or discard it.",
      ru: 'Оно не отправлено. Отредактируй ниже, если нужно, потом отправь — или удали.',
    },
    draftUse: { en: 'Use this draft', ru: 'Взять черновик' },
    draftRefine: { en: 'Improve with assistant', ru: 'Доработать с ассистентом' },
    draftDiscard: { en: 'Discard', ru: 'Удалить' },
    draftDiscarded: { en: 'Draft discarded', ru: 'Черновик удалён' },

    // ── Promotional / unrelated threads ──────────────────────────
    showPromotional: {
      en: (n: number) => `Show ${n} promotional`,
      ru: (n: number) => `Показать рекламные (${n})`,
    },
    hidePromotional: { en: 'Hide promotional', ru: 'Скрыть рекламные' },

    // ── Signature editor ─────────────────────────────────────────
    signatureTitle: { en: 'Email signature', ru: 'Подпись в письмах' },
    signatureEdit: { en: 'Edit email signature', ru: 'Изменить подпись' },
    signatureHelp: {
      en: 'Added to the end of every email you send from here. Not used for Instagram messages.',
      ru: 'Добавляется в конец каждого письма, отправленного отсюда. В Instagram не используется.',
    },
    signatureTextLabel: { en: 'Plain text version', ru: 'Текстовая версия' },
    signatureHtmlLabel: { en: 'Formatted (HTML) version', ru: 'Оформленная версия (HTML)' },
    signatureHtmlHelp: {
      en: 'Most people see this one. Leave it alone unless you know HTML.',
      ru: 'Большинство увидит именно её. Не трогай, если не знаешь HTML.',
    },
    signaturePreview: { en: 'Preview', ru: 'Предпросмотр' },
    signatureSaved: { en: 'Signature saved', ru: 'Подпись сохранена' },
    signatureSaveFailed: { en: 'Could not save signature', ru: 'Не удалось сохранить подпись' },
    // Per-message translate panel
    translatedFrom: {
      en: (fromLang: string | null) =>
        fromLang && fromLang !== 'unknown' ? `Translated from ${fromLang.toUpperCase()}` : 'Translated',
      ru: (fromLang: string | null) =>
        fromLang && fromLang !== 'unknown' ? `Перевод с ${fromLang.toUpperCase()}` : 'Перевод',
    },
    translationFailed: { en: 'Translation failed', ru: 'Не удалось перевести' },
    translateAction: { en: 'Translate', ru: 'Перевести' },
    // Empty / select prompts
    selectPrompt: {
      en: 'Select a conversation from the left to view messages.',
      ru: 'Выбери диалог слева, чтобы увидеть сообщения.',
    },
    noConversationsYetTitle: { en: 'No conversations yet', ru: 'Пока нет диалогов' },
    emptyStateBody: {
      en: 'As soon as someone DMs @vero.art.photo or emails you, the conversation will appear here. Instagram DMs get a first response from the AI assistant unless you pause it; email conversations are always manual for now.',
      ru: 'Как только кто-то напишет @vero.art.photo или отправит email, диалог появится здесь. На Instagram-сообщения AI-ассистент ответит первым, если не поставить его на паузу; email пока требует ручного ответа.',
    },
    // Summary card
    summaryTitle: { en: 'Thread summary', ru: 'Сводка' },
    summaryAsking: { en: 'Asking', ru: 'Спрашивает' },
    summaryGathered: { en: 'Gathered', ru: 'Собрали' },
    summaryNextStep: { en: 'Next step', ru: 'Далее' },
    summaryTone: { en: 'Tone', ru: 'Тон' },
    summaryLoading: { en: 'Reading the thread…', ru: 'Читаю переписку…' },
    summaryNone: { en: 'No summary yet.', ru: 'Сводки пока нет.' },
    summaryLangAria: { en: 'Summary language', ru: 'Язык сводки' },
    openSummary: { en: 'Open summary', ru: 'Открыть сводку' },
    closeSummaryOpenChat: { en: 'Close summary — open chat', ru: 'Закрыть сводку — открыть чат' },
    regenerateSummary: { en: 'Regenerate summary', ru: 'Пересчитать сводку' },
    // "Wipe conversation" test-reset action (super only). Deletes all
    // messages + clears the AI summary cache so the AI reads a fresh
    // thread on the next inbound. The conversation record itself
    // stays put so the sidebar entry survives and future DMs from the
    // same account land back into the same row.
    resetConversation: { en: 'Reset conversation', ru: 'Сбросить диалог' },
    resetConversationTooltip: {
      en: 'Reset — clears all messages + AI memory',
      ru: 'Сброс — очищает все сообщения и память AI',
    },
    resetConfirmTitle: { en: 'Reset this conversation?', ru: 'Сбросить этот диалог?' },
    // Dynamic body — shows the contact name + message count so an
    // accidental click can't confirm without SEEING what's about to
    // be deleted. Cheap accident-protection without a "type YES to
    // confirm" flow. Russian plurals match the pattern used elsewhere
    // in the dict (1 сообщение / 2-4 сообщения / 5+ сообщений).
    resetConfirmBody: {
      en: (name: string, n: number) =>
        `About to reset conversation with ${name} — this permanently deletes ${n} message${n === 1 ? '' : 's'} and the AI's memory of this thread. The conversation record stays so future messages will still land here. This can't be undone.`,
      ru: (name: string, n: number) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        let msgs: string;
        if (mod10 === 1 && mod100 !== 11) msgs = `${n} сообщение`;
        else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) msgs = `${n} сообщения`;
        else msgs = `${n} сообщений`;
        return `Сейчас будет сброшен диалог с ${name} — безвозвратно удалятся ${msgs} и вся память AI по этой переписке. Запись диалога сохранится, так что будущие сообщения по-прежнему попадут сюда. Отменить нельзя.`;
      },
    },
    resetConfirmButton: { en: 'Reset', ru: 'Сбросить' },
    resetSuccess: {
      en: (n: number) => `Conversation reset — ${n} message${n === 1 ? '' : 's'} deleted`,
      // Russian plural: 1 сообщение, 2/3/4 сообщения, 5+ сообщений
      ru: (n: number) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        let word = 'сообщений';
        if (mod10 === 1 && mod100 !== 11) word = 'сообщение';
        else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) word = 'сообщения';
        return `Диалог сброшен — удалено ${n} ${word}`;
      },
    },
    resetFailed: { en: 'Reset failed', ru: 'Не удалось сбросить' },
    // Composer
    replyPlaceholder: { en: 'Type a reply as Vero...', ru: 'Напиши ответ от имени Веро...' },
    translateBeforeSending: { en: 'Translate before sending', ru: 'Перевести перед отправкой' },
    ctrlEnterSend: { en: '⌘/Ctrl + Enter to send · Replies from you sent as human (not AI)', ru: '⌘/Ctrl + Enter — отправить · Твои ответы уходят как от человека (не AI)' },
    send: { en: 'Send', ru: 'Отправить' },
    translateAndSend: { en: 'Translate & Send', ru: 'Перевести и отправить' },
    translating: { en: 'Translating…', ru: 'Перевожу…' },
    micRecordReply: { en: 'Record voice reply', ru: 'Записать голосовой ответ' },
    // Classification pills
    classification: {
      'booking-inquiry': { en: 'Booking inquiry', ru: 'Запрос на бронь' },
      'existing-client': { en: 'Existing client', ru: 'Постоянный клиент' },
      'general-question': { en: 'General question', ru: 'Общий вопрос' },
      'collaboration-offer': { en: 'Collab offer', ru: 'Предложение коллаба' },
      'spam-or-unrelated': { en: 'Spam / unrelated', ru: 'Спам' },
      unclear: { en: 'Unclear', ru: 'Непонятно' },
    },
    // Create-client modal
    convertToClient: { en: 'Convert to client', ru: 'Сделать клиентом' },
    // Long disclaimer — split into 2 sentences in RU for readability.
    convertDisclaimer: {
      en: 'Creates a simple-mode portal (gallery password only) and links it to this conversation. You can fill in email, event date, contract, and gallery URL later from the Portals tab.',
      ru: 'Создаст упрощённый портал (только с паролем от галереи) и свяжет его с этим диалогом. Email, дату события, контракт и ссылку на галерею можно добавить позже во вкладке «Клиенты».',
    },
    sessionTypeLabel: { en: 'Session type', ru: 'Тип съёмки' },
    // Session-type dropdown options. Keys match the option values sent
    // to the API (must stay English on the wire).
    sessionOptions: {
      portrait: { en: 'Portrait', ru: 'Портретная' },
      wedding: { en: 'Wedding', ru: 'Свадебная' },
      family: { en: 'Family', ru: 'Семейная' },
      maternity: { en: 'Maternity', ru: 'Беременность' },
      engagement: { en: 'Engagement', ru: 'Помолвка' },
      newborn: { en: 'Newborn', ru: 'Новорождённый' },
      other: { en: 'Other', ru: 'Другое' },
    },
    clientDisplayName: { en: 'Client display name', ru: 'Имя клиента' },
    clientNamePlaceholder: { en: 'e.g. Anna Petrova', ru: 'например, Анна Петрова' },
    galleryPasswordLabel: { en: 'Gallery password', ru: 'Пароль от галереи' },
    autogenerated: { en: 'autogenerated', ru: 'сгенерирован' },
    generateNewPassword: { en: 'New', ru: 'Новый' },
    galleryPasswordHint: {
      en: '4+ characters. Client uses this to open their gallery once you deliver it.',
      ru: 'От 4 символов. Клиент введёт его, чтобы открыть галерею после отправки.',
    },
    fromThisConversation: { en: 'From this conversation', ru: 'Из этого диалога' },
    addTheseToPortal: {
      en: 'Add these to the portal (event date, email, etc.) from the Portals tab after creating.',
      ru: 'После создания добавь эти данные (дату, email и т.д.) в портал во вкладке «Клиенты».',
    },
    createClientCta: { en: 'Create client', ru: 'Создать клиента' },
    creating: { en: 'Creating…', ru: 'Создаю…' },
    createFailed: {
      en: (status: number) => `Create failed (${status})`,
      ru: (status: number) => `Не удалось создать (${status})`,
    },
  },

  assistant: {
    tabTitle: { en: 'Assistant', ru: 'Ассистент' },
    subtitle: { en: 'Chat with your AI or browse its data.', ru: 'Общайся с AI или смотри, что он знает.' },
    subtabChat: { en: 'Chat', ru: 'Чат' },
    subtabData: { en: 'Data', ru: 'Данные' },
    // Aria label on the RU/EN pill toggle. The pill LABELS themselves
    // ("RU"/"EN") stay untranslated — they name the chat language, not
    // the admin UI language.
    chatLanguageAria: { en: 'Chat language', ru: 'Язык чата' },
  },

  assistantData: {
    // Toolbar
    searchPlaceholder: {
      en: 'Search facts by keyword…',
      ru: 'Поиск по ключевому слову…',
    },
    addFact: { en: 'Add fact', ru: 'Добавить факт' },
    addYourFirstFact: { en: 'Add your first fact', ru: 'Добавь первый факт' },

    // Meta strip counts (Russian plural: 1 факт / 2-4 факта / 5+ фактов)
    factsCount: {
      en: (n: number) => `${n} fact${n === 1 ? '' : 's'}`,
      ru: (n: number) => `${n} ${n === 1 ? 'факт' : n < 5 ? 'факта' : 'фактов'}`,
    },
    // "n added by chatbot" — rephrased in RU for a more natural flow.
    chatbotAddedCount: {
      en: (n: number) => `${n} added by chatbot`,
      ru: (n: number) => `${n} от ассистента`,
    },

    // Load / search-empty states
    loadFailed: {
      en: (status: number) => `Load failed (${status})`,
      ru: (status: number) => `Не удалось загрузить (${status})`,
    },
    noSearchMatch: {
      en: (query: string) => `No facts match "${query}".`,
      ru: (query: string) => `По запросу «${query}» ничего не найдено.`,
    },

    // Card badges
    chatbotBadge: { en: 'Chatbot', ru: 'Ассистент' },
    inactiveBadge: { en: 'Inactive', ru: 'Отключён' },

    // Edit modal
    addFactModalTitle: { en: 'Add a fact', ru: 'Новый факт' },
    editFactModalTitle: { en: 'Edit fact', ru: 'Редактировать факт' },
    categoryLabel: { en: 'Category', ru: 'Категория' },
    labelLabel: { en: 'Label', ru: 'Название' },
    contentLabel: { en: 'Content', ru: 'Содержание' },
    labelPlaceholder: {
      en: 'Short name for this fact',
      ru: 'Короткое название для этого факта',
    },
    contentPlaceholder: {
      // Kept the "English" hint on purpose — DB stores facts in English so
      // the customer-reply engine works regardless of the chat language.
      en: 'The actual fact / rule / info. English.',
      ru: 'Сам факт, правило или информация. По-английски.',
    },
    // Machine-format hint; identical in both languages on purpose.
    newCategoryPlaceholder: { en: 'new_category_name', ru: 'new_category_name' },
    pickExisting: { en: 'Pick existing', ru: 'Выбрать существующую' },
    newCategoryButton: { en: 'New category', ru: 'Новая категория' },
    activeLabel: { en: 'Active', ru: 'Активен' },
    usedByReplies: {
      en: 'Used by customer replies',
      ru: 'AI использует его в ответах клиентам',
    },
    hiddenFromReplies: {
      en: 'Hidden from customer replies',
      ru: 'Скрыт от ответов клиентам',
    },
    allFieldsRequired: {
      en: 'Category, label, and content are all required.',
      ru: 'Заполни категорию, название и содержание — все три обязательны.',
    },
    saveFailed: {
      en: (status: number) => `Save failed (${status})`,
      ru: (status: number) => `Не удалось сохранить (${status})`,
    },
    deleteConfirm: {
      en: (label: string) => `Delete "${label}"?`,
      ru: (label: string) => `Удалить «${label}»?`,
    },
    deleteFailed: { en: 'Delete failed', ru: 'Не удалось удалить' },

    // Built-in behavior card
    builtInBehaviorHeader: { en: 'Built-in Behavior', ru: 'Встроенное поведение' },
    notEditable: { en: 'Not editable', ru: 'Не редактируется' },
    // Bulleted facts. Arrays land here as leaves because the projector
    // treats any node with { en, ru } as a leaf and returns the value
    // verbatim — arrays included.
    builtInFacts: {
      en: [
        "Assistant is Vero's personal AI, focused on her photography business (portraits, weddings, families, maternity)",
        'Replies in whichever language you have the toggle set to (Russian or English) — even if you type in the other language',
        'Stores all knowledge base entries in English underneath, so the customer-facing AI reply engine works correctly regardless of the chat language',
        'Double-checks big value changes (>50% deviation from existing value) before writing — protects against typos',
        'Only deletes entries when you ask explicitly — never on its own',
        'Reads the current knowledge base below on every turn, so you don\'t have to remind it what it knows',
      ],
      ru: [
        'Ассистент — твой личный AI, заточенный под твой фотобизнес (портреты, свадьбы, семьи, беременность)',
        'Отвечает на том языке, который выбран в переключателе (русский или английский) — даже если ты пишешь на другом',
        'Хранит все факты в базе по-английски, чтобы AI-ответы клиентам работали корректно вне зависимости от языка чата',
        'Перепроверяет крупные изменения (отклонение больше 50% от текущего значения) перед записью — защита от опечаток',
        'Удаляет записи только по твоему явному запросу — никогда сам',
        'Читает базу знаний ниже перед каждым ответом, чтобы тебе не нужно было напоминать, что он знает',
      ],
    },
    builtInFooter: {
      en: 'These behaviors are wired into the code. Everything else the AI knows lives in the editable facts below.',
      ru: 'Это поведение зашито в коде. Всё остальное, что знает AI, — в редактируемых фактах ниже.',
    },

    // Empty state
    emptyTitle: { en: 'The knowledge base is empty', ru: 'База знаний пуста' },
    emptyDescription: {
      en: 'Facts you add here are what the customer-facing AI uses to reply to DMs. Add manually, or head to the Chat tab and let the assistant help you fill it in.',
      ru: 'Факты, которые ты здесь добавляешь, AI использует, чтобы отвечать клиентам в директе. Добавь вручную или зайди во вкладку «Чат» — ассистент поможет заполнить базу.',
    },
  },

  gallery: {
    tabTitle: { en: 'Gallery', ru: 'Галерея' },
    photoCount: {
      en: (n: number, drafts: number) =>
        `${n} photo${n === 1 ? '' : 's'}${drafts > 0 ? ` · ${drafts} awaiting review` : ''}`,
      // 'фото' is indeclinable in Russian, so it stays the same for all
      // counts. 'ждёт' (3sg) for exactly 1 draft, 'ждут' (3pl) otherwise —
      // the strict paucal is technically 'ждут' anyway, so two branches
      // are enough here.
      ru: (n: number, drafts: number) =>
        `${n} фото${drafts > 0 ? ` · ${drafts} ${drafts === 1 ? 'ждёт' : 'ждут'} проверки` : ''}`,
    },
    subtitleEmpty: { en: 'Drive-backed photo library.', ru: 'Библиотека из Google Drive.' },
    settings: { en: 'Settings', ru: 'Настройки' },
    ariaSettings: { en: 'Gallery settings', ru: 'Настройки галереи' },
    ariaSyncFromDrive: { en: 'Sync from Drive', ru: 'Синхронизировать с Drive' },
    ariaOpenLive: { en: 'Open live page', ru: 'Открыть страницу на сайте' },
    ariaDelete: { en: 'Delete photo', ru: 'Удалить фото' },
    syncFromDrive: { en: 'Sync from Drive', ru: 'Синхронизировать с Drive' },
    syncing: { en: 'Syncing...', ru: 'Синхронизирую...' },
    allCategories: { en: 'All categories', ru: 'Все категории' },
    allStatuses: { en: 'All status', ru: 'Все статусы' },
    statusDraft: { en: 'Draft (needs review)', ru: 'Черновик (нужна проверка)' },
    statusPublished: { en: 'Published (live)', ru: 'Опубликовано' },
    resultsCount: {
      en: (n: number, total: number) => `${n} of ${total}`,
      ru: (n: number, total: number) => `${n} из ${total}`,
    },
    editPhoto: { en: 'Edit photo', ru: 'Редактировать фото' },
    slug: { en: 'Slug', ru: 'Slug' },
    category: { en: 'Category', ru: 'Категория' },
    title: { en: 'Title', ru: 'Заголовок' },
    alt: { en: 'Alt text', ru: 'Alt-текст' },
    description: { en: 'Description', ru: 'Описание' },
    keywords: { en: 'Keywords', ru: 'Ключевые слова' },
    published: { en: 'Published', ru: 'Опубликовано' },
    draft: { en: 'Draft', ru: 'Черновик' },
    review: { en: 'Review', ru: 'Проверить' },
    liveOnSite: { en: 'Live on site', ru: 'На сайте' },
    draftHidden: { en: 'Draft (hidden)', ru: 'Черновик (скрыто)' },
    sortOverride: { en: 'Sort override', ru: 'Порядок сортировки' },

    // Drive-connection warning box
    driveNotConnectedTitle: {
      en: 'Gallery folder not connected yet',
      ru: 'Папка галереи ещё не подключена',
    },
    driveNotConnectedBody: {
      en: "Point this site at your Google Drive gallery folder so new photos can sync automatically. You'll need the folder's shareable link — same format you use for client galleries.",
      ru: 'Укажи сайту, где лежит папка галереи в Google Drive, чтобы новые фото подтягивались автоматически. Понадобится ссылка на папку — та же самая, которую ты даёшь клиентам.',
    },
    setUpDrive: { en: 'Set up Drive folder', ru: 'Настроить папку Drive' },

    // Connected indicator (below title)
    connectedToDrive: { en: 'Connected to Drive', ru: 'Подключено к Drive' },
    connectedViaEnv: {
      en: ' (via env var — click Settings to move to admin)',
      ru: ' (через env — нажми «Настройки», чтобы перенести в админку)',
    },

    // Sync-result banner — kept as small fragments so the "· part · part"
    // shape survives translation without a mega-string.
    syncSummaryHead: {
      en: (files: number, inserted: number) => `Saw ${files} files in Drive · ${inserted} new`,
      ru: (files: number, inserted: number) => `В Drive: ${files} файлов · ${inserted} новых`,
    },
    syncSummaryRestored: {
      en: (n: number) => ` · ${n} restored`,
      ru: (n: number) => ` · ${n} восстановлено`,
    },
    syncSummaryRemoved: {
      en: (n: number) => ` · ${n} removed`,
      ru: (n: number) => ` · ${n} удалено`,
    },
    syncSummaryPending: {
      en: (n: number) => ` · ${n} pending next run`,
      ru: (n: number) => ` · ${n} в следующем запуске`,
    },
    syncSummaryRedeploy: {
      en: ' · redeploy triggered',
      ru: ' · передеплой запущен',
    },
    // Plural rules for files: 1 файл, 2/3/4 файла, 5+ файлов.
    filesFailed: {
      en: (n: number) => `${n} file${n === 1 ? '' : 's'} failed`,
      ru: (n: number) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        const word =
          mod10 === 1 && mod100 !== 11
            ? 'файл не загрузился'
            : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
              ? 'файла не загрузились'
              : 'файлов не загрузились';
        return `${n} ${word}`;
      },
    },

    // PhotoCard empty-field placeholders
    noTitleYet: { en: '(no title yet)', ru: '(без заголовка)' },
    noDescription: { en: '(no description)', ru: '(без описания)' },

    // Toasts
    toastSynced: {
      en: (inserted: number, removed: number) => `Synced — ${inserted} new, ${removed} removed`,
      ru: (inserted: number, removed: number) => `Синхронизировано — ${inserted} новых, ${removed} удалено`,
    },
    toastSyncFailed: { en: 'Sync failed', ru: 'Синхронизация не удалась' },
    toastPhotoRemoved: { en: 'Photo removed', ru: 'Фото удалено' },
    toastDeleteFailed: { en: 'Delete failed', ru: 'Не удалось удалить' },

    // Confirm dialog before delete
    confirmDelete: {
      en: (name: string) =>
        `Delete "${name}"?\n\nIf the file is still in the Drive folder, the next sync will restore it. To permanently remove: delete from Drive first, then delete from here.`,
      ru: (name: string) =>
        `Удалить «${name}»?\n\nЕсли файл всё ещё в папке Drive, следующая синхронизация вернёт его обратно. Чтобы удалить окончательно: сначала удали из Drive, потом отсюда.`,
    },

    // Error strings
    loadFailed: {
      en: (status: number) => `Load failed (${status})`,
      ru: (status: number) => `Не удалось загрузить (${status})`,
    },
    saveFailed: {
      en: (status: number) => `Save failed (${status})`,
      ru: (status: number) => `Не удалось сохранить (${status})`,
    },
    pasteFolderError: {
      en: 'Paste a Drive folder URL or ID.',
      ru: 'Вставь ссылку или ID папки Drive.',
    },

    // Settings modal
    settingsModalTitle: { en: 'Gallery settings', ru: 'Настройки галереи' },
    driveFolderLabel: {
      en: 'Google Drive gallery folder',
      ru: 'Папка галереи в Google Drive',
    },
    driveFolderHelp: {
      en: 'Paste the shareable link (or just the folder ID) of the parent Drive folder that holds the four category subfolders (portraits, weddings, family, maternity). The service account this site uses must have Viewer access to that folder.',
      // Split into three shorter sentences — the English is one long
      // block, easier to read in Russian as separate thoughts. Category
      // slugs stay English because that's what the actual folders are
      // named in Drive.
      ru: 'Вставь ссылку на папку (или просто её ID). Это должна быть родительская папка, в которой лежат четыре подпапки категорий (portraits, weddings, family, maternity). Сервисный аккаунт сайта должен иметь доступ на просмотр этой папки.',
    },
    envLegacyNotice: {
      en: 'Currently loaded from an env var (legacy setup). Saving here moves it to the database so future edits can happen from this page without touching Vercel.',
      ru: 'Сейчас значение подтягивается из env-переменной (старая настройка). Если сохранить здесь, оно переедет в базу данных — потом можно будет менять прямо отсюда, не заходя в Vercel.',
    },

    // Edit modal
    liveUrlPrefix: { en: 'Live URL:', ru: 'URL на сайте:' },
    keywordsHint: {
      en: 'Comma-separated. First one is always the category.',
      ru: 'Через запятую. Первое слово — всегда категория.',
    },
    driveSectionLabel: { en: 'Drive', ru: 'Drive' },
    driveRenameHint: {
      en: 'Rename in the admin panel above — Drive filename stays as-is.',
      ru: 'Переименовывай в форме выше — имя файла в Drive не меняется.',
    },

    // Empty state
    emptyNoMatchTitle: {
      en: 'No photos match those filters',
      ru: 'Под фильтры ничего не подошло',
    },
    emptyNoPhotosTitle: { en: 'No photos yet', ru: 'Пока нет фото' },
    emptyNoMatchBody: {
      en: 'Change the filters above or click "Sync from Drive" to pull the latest.',
      ru: 'Поменяй фильтры выше или нажми «Синхронизировать с Drive», чтобы подтянуть свежие.',
    },
    emptyNoPhotosBody: {
      en: 'Upload photos to the Gallery folder in Drive, then click "Sync from Drive" to bring them in.',
      ru: 'Загрузи фото в папку галереи в Drive и нажми «Синхронизировать с Drive», чтобы они появились здесь.',
    },

    // Category display names — used in the filter Select and on the
    // PhotoCard badge. The lowercase enum values (portraits/weddings/…)
    // still travel over the wire; only the display text is translated.
    categoryNames: {
      portraits: { en: 'Portraits', ru: 'Портреты' },
      weddings: { en: 'Weddings', ru: 'Свадьбы' },
      family: { en: 'Family', ru: 'Семейные' },
      maternity: { en: 'Maternity', ru: 'Беременность' },
    },
  },

  newGallery: {
    // Header
    kicker: { en: 'New Gallery', ru: 'Новая галерея' },
    heading: { en: 'Share a photo gallery', ru: 'Отправить галерею' },
    intro: {
      en: "Use this for any booking that doesn't need a contract — portraits, family sessions, anniversaries, etc. You can create it as soon as you get the order and fill in the Drive URL later, or paste the URL now to deliver immediately.",
      // Translated for meaning: keep the "no-contract" idea + the "create
      // now, fill in later" flexibility. Split into two sentences.
      ru: 'Используй для съёмок без контракта — портреты, семейные, годовщины и всё в таком духе. Можно создать галерею как только получила заказ и вставить ссылку на Drive позже, или сразу вставить ссылку и отправить клиенту.',
    },

    // Field labels + help text
    sessionTypeLabel: { en: 'Session Type', ru: 'Тип съёмки' },
    sessionTypeHelp: {
      en: 'What kind of shoot this is. Click a standard type, or use Custom for anything else.',
      ru: 'Какая это съёмка. Выбери один из типов или нажми «Custom», чтобы вписать свой.',
    },

    clientNameLabel: { en: 'Client Name', ru: 'Имя клиента' },
    clientNameHelp: {
      en: "The client's full name (first last, or however they go by). Used to greet them in emails and to build the display name.",
      ru: 'Полное имя клиента (имя фамилия или как они себя называют). Используется в письмах и для построения названия галереи.',
    },
    clientNamePlaceholder: { en: 'e.g. Alex Smith', ru: 'например, Alex Smith' },

    eventDateLabel: { en: 'Event Date', ru: 'Дата съёмки' },
    eventDateHelp: {
      en: 'Optional — used to sort the dashboard and to pick the year for the display name. Defaults to the current year if blank.',
      ru: 'Необязательно — используется для сортировки в списке и чтобы подставить год в название галереи. По умолчанию — текущий год.',
    },

    displayNameLabel: { en: 'Display Name', ru: 'Название галереи' },
    displayNameHelpCustom: {
      en: 'Custom — clear the field to go back to the auto-generated name.',
      ru: 'Свой вариант — очисти поле, чтобы вернуться к автоматическому названию.',
    },
    displayNameHelpAuto: {
      en: 'Auto-generated as "{Session} {Client Name} {Year}", e.g. "Portrait Alex Smith 2026". Type to override.',
      ru: 'Автоматически: «{Тип} {Имя} {Год}», например «Portrait Alex Smith 2026». Впиши своё, чтобы переопределить.',
    },
    displayNamePlaceholder: { en: 'Portrait Alex Smith 2026', ru: 'Portrait Alex Smith 2026' },

    galleryPasswordLabel: { en: 'Gallery Password', ru: 'Пароль галереи' },
    galleryPasswordHelpCustom: {
      en: 'Custom — clear the field to go back to the auto-generated password.',
      ru: 'Свой вариант — очисти поле, чтобы вернуться к автоматическому паролю.',
    },
    galleryPasswordHelpAuto: {
      en: 'Auto-generated from the display name (spaces removed). Type to override.',
      ru: 'Автоматически из названия галереи (без пробелов). Впиши своё, чтобы переопределить.',
    },
    galleryPasswordPlaceholder: { en: 'PortraitAlexSmith2026', ru: 'PortraitAlexSmith2026' },

    driveUrlLabel: { en: 'Google Drive Folder URL', ru: 'Ссылка на папку Google Drive' },
    driveUrlHelp: {
      en: "Paste the share URL of the folder containing the gallery. Make sure the service account has Viewer access. Optional — leave blank if you're just creating the booking placeholder now and will attach photos later.",
      ru: 'Вставь ссылку на папку с фотографиями. Убедись, что у сервисного аккаунта есть доступ на просмотр. Необязательно — можно оставить пустым, если пока создаёшь заготовку и приложишь фото позже.',
    },
    driveUrlPlaceholder: { en: 'https://drive.google.com/drive/folders/...', ru: 'https://drive.google.com/drive/folders/...' },

    clientEmailLabel: { en: 'Client Email (optional)', ru: 'Email клиента (необязательно)' },
    clientEmailHelp: {
      en: 'If you enter an email AND a Drive URL above, the client gets an automatic email with the gallery link and password as soon as you click Create. Leave blank to copy the message manually on the next screen.',
      ru: 'Если укажешь email И ссылку на Drive выше, клиент автоматически получит письмо со ссылкой на галерею и паролем, как только нажмёшь «Создать». Оставь пустым, чтобы скопировать сообщение вручную на следующем экране.',
    },
    clientEmailPlaceholder: { en: 'client@example.com', ru: 'client@example.com' },

    retentionLabel: { en: 'Retention (months)', ru: 'Срок хранения (месяцев)' },
    retentionHelp: {
      en: 'How long the gallery stays online after delivery. Default is 3.',
      ru: 'Сколько галерея будет доступна после отправки. По умолчанию — 3 месяца.',
    },

    // Bookkeeping section
    bookkeepingKicker: { en: 'Bookkeeping (optional)', ru: 'Учёт (необязательно)' },
    bookkeepingHint: {
      en: "These are only visible to you in the admin. The client doesn't see them — gallery-only clients only see their photos.",
      ru: 'Эти поля видишь только ты в админке. Клиент их не видит — в режиме «только галерея» клиент видит только свои фото.',
    },
    totalLabel: { en: 'Total (USD)', ru: 'Итого (USD)' },
    totalHelp: {
      en: 'What you charged for the project. Optional.',
      ru: 'Сколько взяла за съёмку. Необязательно.',
    },
    retainerLabel: { en: 'Retainer / Deposit (USD)', ru: 'Предоплата (USD)' },
    retainerHelp: {
      en: 'Amount paid up front to reserve the booking.',
      ru: 'Сумма, оплаченная заранее для брони съёмки.',
    },
    paymentsNote: {
      en: "You can log payments later in the client's detail view — Zelle, cash, Venmo, etc. — with notes attached.",
      ru: 'Оплаты можно добавить позже в карточке клиента — Zelle, наличные, Venmo и всё остальное — с комментариями.',
    },

    // Validation errors
    errors: {
      sessionTypeRequired: { en: 'Session type is required.', ru: 'Укажи тип съёмки.' },
      clientNameRequired: { en: 'Client name is required.', ru: 'Укажи имя клиента.' },
      displayNameRequired: { en: 'Display name is required.', ru: 'Укажи название галереи.' },
      galleryPasswordRequired: { en: 'Gallery password is required.', ru: 'Укажи пароль галереи.' },
      retentionMustBePositive: {
        en: 'Retention months must be a positive number.',
        ru: 'Срок хранения должен быть положительным числом.',
      },
      totalMustBeNonNegative: {
        en: 'Total must be a non-negative number.',
        ru: 'Итого должно быть неотрицательным числом.',
      },
      retainerMustBeNonNegative: {
        en: 'Retainer must be a non-negative number.',
        ru: 'Предоплата должна быть неотрицательным числом.',
      },
      retainerExceedsTotal: {
        en: 'Retainer cannot exceed total.',
        ru: 'Предоплата не может превышать итого.',
      },
      serverErrorWithStatus: {
        en: (status: number) => `Server error (${status}).`,
        ru: (status: number) => `Ошибка сервера (${status}).`,
      },
    },

    // Submit button
    createCta: { en: 'Create Gallery', ru: 'Создать галерею' },
    creating: { en: 'Creating...', ru: 'Создаю...' },

    // Success screen
    doneKicker: { en: 'Done', ru: 'Готово' },
    createdHeading: { en: 'Gallery created ✓', ru: 'Галерея создана ✓' },
    createdSubtitle: {
      en: (name: string) => `${name} is in the system.`,
      ru: (name: string) => `${name} — в системе.`,
    },

    oneClickLinkLabel: { en: 'One-click link', ru: 'Ссылка в один клик' },
    oneClickLinkHint: {
      en: 'Click Open to test the link in a new tab. The full share message is below.',
      ru: 'Нажми «Открыть», чтобы проверить ссылку в новой вкладке. Полное сообщение — ниже.',
    },

    shareWithClient: { en: 'Share this with the client', ru: 'Отправь это клиенту' },
    statusLabel: { en: 'Status', ru: 'Статус' },
    emailWasSentBody: {
      en: 'An email has been sent to the client — this is a copy in case you want to send it via text/WhatsApp too.',
      ru: 'Клиенту отправлено письмо — вот копия, на случай если захочешь продублировать в SMS или WhatsApp.',
    },
    noEmailBody: {
      en: "No client email on file — copy this message and send it however you're in touch.",
      ru: 'Email клиента не указан — скопируй сообщение и отправь любым удобным способом.',
    },
    notDeliveredBody: {
      en: "The gallery is set up but no Drive URL was provided yet. Open the client's detail view to paste the URL and mark as delivered when ready.",
      ru: 'Галерея создана, но ссылка на Drive пока не добавлена. Открой карточку клиента, вставь ссылку и отметь как отправленную, когда будешь готова.',
    },
    copyMessage: { en: 'Copy message', ru: 'Копировать сообщение' },

    passwordPrefix: { en: 'Password:', ru: 'Пароль:' },
    passwordSaveHint: {
      en: "Save this somewhere — it's how you'll let the client into their gallery once you're ready to deliver.",
      ru: 'Сохрани где-нибудь — это пароль, который откроет клиенту доступ к галерее, когда будешь готова отправить.',
    },

    backToDashboard: { en: 'Back to Dashboard', ru: 'К дашборду' },
  },

  newClient: {
    // Header
    kicker: { en: 'New Client', ru: 'Новый клиент' },
    headline: { en: 'Set up a portal', ru: 'Создать портал' },

    // Section headings
    sectionContract: { en: 'Contract', ru: 'Контракт' },
    sectionClient: { en: 'Client', ru: 'Клиент' },
    sectionEvent: { en: 'Event', ru: 'Съёмка' },
    sectionPricing: { en: 'Pricing', ru: 'Стоимость' },
    sectionGalleryPass: { en: 'Gallery Pass', ru: 'Доступ к галерее' },
    sectionContractDetails: { en: 'Contract Details', ru: 'Детали контракта' },
    sectionOptionalClauses: { en: 'Optional Clauses', ru: 'Дополнительные пункты' },
    sectionAdditionalNotes: { en: 'Additional Notes (optional)', ru: 'Примечания (по желанию)' },

    // Contract template
    contractTemplateLabel: { en: 'Contract Template', ru: 'Шаблон контракта' },
    contractTemplateHelp: {
      en: 'The template shapes which clauses appear in the contract. Pick the one matching this booking.',
      ru: 'От шаблона зависит, какие пункты попадут в контракт. Выбери подходящий под эту съёмку.',
    },

    // Partners
    partner1Label: { en: 'Partner 1 Full Name', ru: 'Партнёр 1 — полное имя' },
    partner1Help: {
      en: 'Their full legal name. First name is used in the portal greeting.',
      ru: 'Полное имя, как в документах. Первое имя используется в приветствии в портале.',
    },
    partner1Placeholder: { en: 'e.g. Chrisann Bryan', ru: 'например, Chrisann Bryan' },
    partner2Label: { en: 'Partner 2 Full Name', ru: 'Партнёр 2 — полное имя' },
    partner2Help: {
      en: 'Optional. Leave blank for solo bookings (portraits, etc.).',
      ru: 'По желанию. Оставь пустым для сольных съёмок (портреты и т. п.).',
    },
    partner2Placeholder: {
      en: 'e.g. Rajiv Thomas (optional)',
      ru: 'например, Rajiv Thomas (по желанию)',
    },

    // Display name
    displayNameLabel: { en: 'Display Name', ru: 'Отображаемое имя' },
    displayNameHelpCustom: {
      en: 'Custom — clear the field to go back to the auto-generated name.',
      ru: 'Ты ввела своё значение. Очисти поле, чтобы вернуться к автоматическому имени.',
    },
    displayNameHelpAuto: {
      en: 'Auto-generated from the partner first names. Type to override.',
      ru: 'Собирается автоматически из имён партнёров. Напиши своё, чтобы переопределить.',
    },
    displayNamePlaceholder: { en: 'e.g. Chrisann & Rajiv', ru: 'например, Chrisann & Rajiv' },

    // Client email
    clientEmailLabel: { en: 'Client Email', ru: 'Email клиента' },
    clientEmailHelp: {
      en: "The invite email goes here. They'll log in with this address.",
      ru: 'На этот адрес уйдёт приглашение — с ним же клиент будет входить в портал.',
    },
    clientEmailPlaceholder: { en: 'client@example.com', ru: 'client@example.com' },

    // Responsible party
    responsiblePartyToggle: {
      en: 'Different person is paying & signing',
      ru: 'Платит и подписывает другой человек',
    },
    responsiblePartyToggleHelp: {
      en: 'Use this when a third party (e.g. mother of the bride) is the one financially responsible for the booking and will be signing the contract. Adds a "Responsible Party" section to the contract.',
      ru: 'Включи, если за съёмку платит и подписывает контракт третье лицо — например, мама невесты. В контракт добавится раздел «Ответственная сторона».',
    },
    responsiblePartyNameLabel: {
      en: 'Responsible Party Full Name',
      ru: 'Ответственная сторона — полное имя',
    },
    responsiblePartyNameHelp: {
      en: "Their full legal name. They'll be the one signing the contract.",
      ru: 'Полное имя по документам. Именно этот человек подпишет контракт.',
    },
    responsiblePartyNamePlaceholder: {
      en: 'e.g. Patricia Bryan',
      ru: 'например, Patricia Bryan',
    },
    responsiblePartyRelationshipLabel: {
      en: 'Relationship to Client(s)',
      ru: 'Кем приходится клиенту(ам)',
    },
    responsiblePartyRelationshipHelp: {
      en: 'e.g. "Mother of the Bride", "Father of the Groom", "Family Friend".',
      ru: 'Например: «Мама невесты», «Папа жениха», «Друг семьи».',
    },
    responsiblePartyRelationshipPlaceholder: {
      en: 'Mother of the Bride',
      ru: 'Мама невесты',
    },

    // Event title
    eventTitleLabel: { en: 'Event Title', ru: 'Название события' },
    eventTitleHelpCustom: {
      en: 'Custom — clear the field to go back to the auto-generated title.',
      ru: 'Ты ввела своё значение. Очисти поле, чтобы вернуться к автоматическому названию.',
    },
    eventTitleHelpAuto: {
      en: "Auto-generated from partner names + contract type (e.g. \"Chrisann & Rajiv's Wedding\"). Type to override.",
      ru: 'Собирается автоматически из имён партнёров и типа контракта (например, «Chrisann & Rajiv\'s Wedding»). Напиши своё, чтобы переопределить.',
    },
    eventTitlePlaceholder: {
      en: "e.g. Chrisann & Rajiv's Wedding",
      ru: "например, Chrisann & Rajiv's Wedding",
    },

    // Event date
    eventDateLabel: { en: 'Event Date', ru: 'Дата съёмки' },
    eventDateHelp: { en: 'The day of the shoot.', ru: 'День, когда состоится съёмка.' },

    // Coverage
    coverageLabel: { en: 'Coverage', ru: 'Продолжительность съёмки' },
    coverageHelp: {
      en: 'Specific Times for known hours. Half/Full Day for packages where the schedule will be locked in later.',
      ru: '«Точное время» — если часы уже известны. «Полдня» / «Целый день» — для пакетов, где расписание уточнится позже.',
    },
    coverageSpecific: { en: 'Specific Times', ru: 'Точное время' },
    coverageHalfDay: { en: 'Half Day', ru: 'Полдня' },
    coverageFullDay: { en: 'Full Day', ru: 'Целый день' },
    coverageCustom: { en: 'Custom', ru: 'Своё' },

    // Times
    startTimeLabel: { en: 'Start Time', ru: 'Время начала' },
    startTimeHelp: { en: 'When the shoot starts.', ru: 'Во сколько начинается съёмка.' },
    endTimeLabel: { en: 'End Time', ru: 'Время окончания' },
    endTimeHelp: {
      en: 'When the shoot ends. Duration is auto-calculated.',
      ru: 'Во сколько заканчивается съёмка. Длительность посчитается сама.',
    },

    // Preview boxes (labels are UI; the body strings that show
    // half-day / full-day / tbaClause text stay ENGLISH because they
    // are the actual contract text sent to the customer)
    onTheContract: { en: 'On the contract:', ru: 'В контракте:' },
    contractTimeSlot: {
      en: 'Will appear on the contract — Event Details → Time',
      ru: 'Попадёт в контракт: раздел «Event Details → Time»',
    },
    contractAdditionalNotesSlot: {
      en: 'Will appear on the contract — Additional Notes',
      ru: 'Попадёт в контракт: раздел «Additional Notes»',
    },
    noteForYou: {
      en: 'Note for you (not on the contract)',
      ru: 'Заметка для тебя (в контракт не попадёт)',
    },
    noteForYouBody: {
      en: 'Once the client confirms the exact times, you can update the event_time variable via Admin → Contract → Edit fields, and remove the clause above from additional_notes.',
      ru: 'Когда клиент подтвердит точные часы, обнови переменную event_time через Admin → Contract → Edit fields и убери пункт выше из additional_notes.',
    },

    // Custom coverage
    customCoverageLabel: { en: 'Custom Coverage Description', ru: 'Описание съёмки' },
    customCoverageHelp: {
      en: 'Free text — appears on the contract as the Time. e.g. "Ceremony coverage only, exact times TBD" or "Approximately 3 hours, schedule TBD".',
      ru: 'Свободный текст — появится в контракте в поле «Time». Например: «Только церемония, точное время уточняется» или «Около 3 часов, расписание уточняется».',
    },
    customCoveragePlaceholder: {
      en: 'e.g. Approximately 3 hours, exact times to be confirmed',
      ru: 'например: Около 3 часов, точное время будет подтверждено',
    },

    // Session type
    sessionTypeLabel: { en: 'Session Type', ru: 'Тип съёмки' },
    sessionTypeHelp: {
      en: 'What kind of shoot this is. Click a standard type, or use Custom for anything else.',
      ru: 'Что за съёмка. Выбери один из стандартных типов или «Custom» для всего остального.',
    },

    // Pricing
    totalLabel: { en: 'Total (USD)', ru: 'Общая сумма (USD)' },
    totalHelp: {
      en: 'Total project cost across the whole booking.',
      ru: 'Полная стоимость всей съёмки.',
    },
    retainerLabel: { en: 'Retainer (USD)', ru: 'Задаток (USD)' },
    retainerHelp: {
      en: 'Non-refundable deposit. Due at signing, reserves the date.',
      ru: 'Невозвратный задаток. Оплачивается при подписании и бронирует дату.',
    },

    // Gallery password
    galleryPasswordLabel: { en: 'Gallery Password', ru: 'Пароль от галереи' },
    galleryPasswordHelpCustom: {
      en: 'Custom — clear the field to go back to the auto-generated password.',
      ru: 'Ты ввела своё значение. Очисти поле, чтобы вернуться к автоматическому паролю.',
    },
    galleryPasswordHelpAuto: {
      en: 'Auto-generated from the partner first names + event year (e.g. ChrisannRajiv2026). Type to override.',
      ru: 'Собирается автоматически из имён партнёров и года съёмки (например, ChrisannRajiv2026). Напиши свой, чтобы переопределить.',
    },

    // Contract details intro
    contractDetailsIntro: {
      en: 'Values that get filled into the contract template. Most have sensible defaults — only touch if this booking needs something different.',
      ru: 'Значения, которые подставятся в шаблон контракта. У большинства уже есть разумные значения — меняй, только если для этой съёмки нужно что-то особенное.',
    },

    // Optional clauses
    optionalClausesIntro: {
      en: 'Toggle these on only when they apply to this booking. Each adds a clearly-titled section to the contract.',
      ru: 'Включай эти пункты, только если они действительно нужны для этой съёмки. Каждый добавит в контракт отдельный раздел с чётким заголовком.',
    },
    twoCameraLabel: {
      en: 'Two-camera coverage (lead + second camera operator)',
      ru: 'Съёмка на две камеры (основной фотограф + второй оператор)',
    },
    twoCameraHelp: {
      en: "Adds a clause describing two-camera coverage for key moments, with the Second Camera Operator acting in an assistant capacity (not as an independent professional). Use this when you're working with an assistant covering supplemental angles.",
      ru: 'Добавит пункт про съёмку на две камеры в ключевые моменты: второй оператор выступает как ассистент, а не как независимый специалист. Ставь галочку, если с тобой работает ассистент, снимающий дополнительные ракурсы.',
    },
    additionalRetouchingLabel: {
      en: 'Option for additional retouching after delivery',
      ru: 'Возможность дополнительной ретуши после сдачи',
    },
    additionalRetouchingHelp: {
      en: 'Adds a clause noting that the Client can request additional retouching (skin smoothing, advanced color, object removal, etc.) beyond the standard edits, with scope and price negotiated separately.',
      ru: 'Добавит пункт: клиент может заказать дополнительную ретушь (сглаживание кожи, продвинутая цветокоррекция, удаление объектов и т. п.) сверх стандартной обработки — объём и цену обсуждаете отдельно.',
    },

    // Additional notes
    customClausesLabel: { en: 'Custom Clauses / Addendums', ru: 'Свои пункты / приложения' },
    customClausesHelp: {
      en: "Anything specific to this booking — e.g. 'Includes drone footage', 'Second photographer for ceremony only', or any unusual terms. Appears as an addendum at the end of the contract. Leave blank to skip.",
      ru: 'Всё, что касается именно этой съёмки — например: «Включена съёмка с дрона», «Второй фотограф только на церемонии» или любые нестандартные условия. Появится приложением в конце контракта. Оставь пустым, если ничего нет.',
    },
    customClausesPlaceholder: {
      en: 'Leave blank if none.',
      ru: 'Оставь пустым, если ничего нет.',
    },

    // Submit
    submit: { en: 'Create Portal & Send Invite', ru: 'Создать портал и отправить приглашение' },
    submitting: { en: 'Creating...', ru: 'Создаю...' },

    // Error-message field labels (lowercase inside the sentence:
    // Russian doesn't capitalize mid-sentence nouns the way English
    // capitalizes label words).
    fieldLabelPartner1: { en: 'Partner 1 name', ru: 'имя партнёра 1' },
    fieldLabelClientEmail: { en: 'Client email', ru: 'email клиента' },
    fieldLabelEventDate: { en: 'Event date', ru: 'дата съёмки' },
    fieldLabelSessionType: { en: 'Session type', ru: 'тип съёмки' },
    fieldLabelDisplayName: { en: 'Display name', ru: 'отображаемое имя' },
    fieldLabelGalleryPassword: { en: 'Gallery password', ru: 'пароль от галереи' },
    fieldLabelCustomCoverage: { en: 'Custom coverage description', ru: 'описание съёмки' },
    fieldLabelResponsiblePartyName: {
      en: 'Responsible Party name',
      ru: 'имя ответственной стороны',
    },
    fieldLabelResponsiblePartyRelationship: {
      en: 'Responsible Party relationship',
      ru: 'кем ответственная сторона приходится клиенту',
    },
    fieldLabelTotal: { en: 'Total amount', ru: 'общая сумма' },
    fieldLabelRetainer: { en: 'Retainer amount', ru: 'сумма задатка' },

    // Validation error messages
    singleFieldRequired: {
      en: (label: string) => `${label} is required.`,
      ru: (label: string) => `Поле «${label}» обязательно.`,
    },
    // Russian "Не заполнены поля: X, Y и Z" reads naturally.
    missingFields: {
      en: (labels: string[]) =>
        `Missing: ${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}.`,
      ru: (labels: string[]) =>
        `Не заполнены поля: ${labels.slice(0, -1).join(', ')} и ${labels[labels.length - 1]}.`,
    },
    retainerExceedsTotal: {
      en: 'Retainer cannot exceed total.',
      ru: 'Задаток не может быть больше общей суммы.',
    },
    serverErrorStatus: {
      en: (status: number) => `Server error (${status}).`,
      ru: (status: number) => `Ошибка сервера (${status}).`,
    },
  },

  clientDetail: {
    // Header row + shared helpers
    kickerFallback: { en: 'Client', ru: 'Клиент' },
    unnamed: { en: '(unnamed)', ru: '(без имени)' },
    badgeGalleryOnly: { en: 'Gallery-only', ru: 'Только галерея' },
    badgeInvitePending: { en: 'Invite pending', ru: 'Приглашение отправлено' },
    couldNotLoad: { en: 'Could not load this portal.', ru: 'Не удалось загрузить портал.' },
    // Generic dynamic error fallback — original code had a mix of trailing-period
    // vs no-period; callers append '.' where the source had it, to preserve
    // exact wording.
    serverErrorStatus: {
      en: (status: number) => `Server error (${status})`,
      ru: (status: number) => `Ошибка сервера (${status})`,
    },

    // ─── Section titles ───────────────────────────────
    sectionPhotoGallery: { en: 'Photo Gallery', ru: 'Фотогалерея' },
    sectionGalleryPass: { en: 'Gallery Pass', ru: 'Пароль галереи' },
    sectionAccount: { en: 'Account', ru: 'Аккаунт' },
    sectionContract: { en: 'Contract', ru: 'Контракт' },
    sectionPayments: { en: 'Payments', ru: 'Оплаты' },
    sectionDetails: { en: 'Details', ru: 'Детали' },
    sectionDangerZone: { en: 'Danger Zone (Super-Admin)', ru: 'Опасная зона (супер-админ)' },

    // ─── Photo Gallery section ────────────────────────
    driveUrlLabel: { en: 'Google Drive URL', ru: 'Ссылка Google Drive' },
    driveUrlPlaceholder: {
      en: 'https://drive.google.com/drive/folders/...',
      ru: 'https://drive.google.com/drive/folders/...',
    },
    driveUrlHelp: {
      en: 'Paste the share URL of the gallery folder. After saving, click Open Folder below to verify the link works.',
      ru: 'Вставь ссылку на общий доступ к папке с галереей. После сохранения открой папку ниже — проверь, что ссылка работает.',
    },
    previewClientGallery: { en: 'Preview Client Gallery', ru: 'Посмотреть глазами клиента' },
    previewClientGalleryHint: {
      en: 'Opens what the client sees at /portal/pass.',
      ru: 'Откроется то же, что клиент увидит на /portal/pass.',
    },
    deliveryStatus: { en: 'Delivery Status', ru: 'Статус отправки' },
    deliveredOn: {
      en: (date: string) => `Delivered ${date}`,
      ru: (date: string) => `Отправлено ${date}`,
    },
    // Russian plural: 1 день · 2-4 дня · 5+ дней (with 11-14 always "дней").
    daysRemaining: {
      en: (n: number) => `${n} day${n === 1 ? '' : 's'} remaining`,
      ru: (n: number) => {
        const mod100 = n % 100;
        const mod10 = n % 10;
        let word = 'дней';
        if (mod100 < 11 || mod100 > 14) {
          if (mod10 === 1) word = 'день';
          else if (mod10 >= 2 && mod10 <= 4) word = 'дня';
        }
        return `Осталось ${n} ${word}`;
      },
    },
    expired: { en: 'Expired', ru: 'Истекла' },
    notDelivered: { en: 'Not delivered yet', ru: 'Ещё не отправлена' },
    markAsDelivered: { en: 'Mark as Delivered', ru: 'Отметить как отправленную' },
    delivering: { en: 'Delivering...', ru: 'Отправляю...' },
    // Free-form multi-line window.confirm text. Dollar amounts already
    // pre-formatted by the caller.
    outstandingConfirm: {
      en: (remaining: string, paid: string, total: string) =>
        `Heads up — ${remaining} is still outstanding (paid ${paid} of ${total}).\n\nMake sure you've received the full payment, or that you've logged it in the Payments section above.\n\nDeliver anyway?`,
      ru: (remaining: string, paid: string, total: string) =>
        `Внимание — ещё не оплачено ${remaining} (оплачено ${paid} из ${total}).\n\nУбедись, что клиент отдал полную сумму, или запиши оплату в разделе «Оплаты» выше.\n\nВсё равно отправить галерею?`,
    },

    // ─── Gallery Pass section ─────────────────────────
    passwordLabel: { en: 'Password', ru: 'Пароль' },
    passwordHelp: {
      en: 'The password guests use at /portal/pass to view photos.',
      ru: 'Пароль, который гости вводят на /portal/pass, чтобы посмотреть фото.',
    },
    access: { en: 'Access', ru: 'Доступ' },
    enabled: { en: 'Enabled', ru: 'Включён' },
    disabled: { en: 'Disabled', ru: 'Отключён' },
    enable: { en: 'Enable', ru: 'Включить' },
    disable: { en: 'Disable', ru: 'Отключить' },

    // ─── Contract badge + edit vars ───────────────────
    status: { en: 'Status', ru: 'Статус' },
    contractSigned: { en: 'Signed', ru: 'Подписан' },
    // Rendered inline after "Signed" badge, like "on Aug 12, 2026".
    // Russian uses "от {date}" — same idea, more natural syntax.
    contractSignedOn: {
      en: (date: string) => `on ${date}`,
      ru: (date: string) => `от ${date}`,
    },
    contractPending: { en: 'Pending signature', ru: 'Ожидает подписания' },
    contractVoid: { en: 'Void', ru: 'Аннулирован' },
    contractNA: { en: 'N/A', ru: 'Нет' },
    editContractUnknownTemplate: {
      en: "Couldn't determine which template this portal uses. To make changes, void it and create a new one — or edit the relevant DB columns directly.",
      ru: 'Не удалось понять, какой шаблон использует этот портал. Чтобы что-то изменить, аннулируй его и создай заново — или отредактируй нужные поля в базе напрямую.',
    },
    editContractTitle: { en: 'Edit contract', ru: 'Редактировать контракт' },
    editContractHide: { en: 'Hide', ru: 'Скрыть' },
    editContractEditFields: { en: 'Edit fields', ru: 'Редактировать поля' },
    editContractHint: {
      en: 'Any change here re-renders the contract the client sees. Once they sign, this section disappears and edits are no longer possible.',
      ru: 'Любое изменение здесь заново формирует контракт, который увидит клиент. Как только он подпишет, этот раздел исчезнет и править будет уже нельзя.',
    },
    saveContractChanges: { en: 'Save Contract Changes', ru: 'Сохранить изменения' },
    contractUpdatedOk: {
      en: 'Contract updated. The client will see the changes on next load.',
      ru: 'Контракт обновлён. Клиент увидит изменения при следующей загрузке.',
    },

    // ─── View signed PDF ──────────────────────────────
    viewSignedCopy: { en: 'View Signed Copy', ru: 'Открыть подписанную копию' },
    opening: { en: 'Opening...', ru: 'Открываю...' },
    couldNotOpenStatus: {
      en: (status: number) => `Could not open (status ${status}).`,
      ru: (status: number) => `Не удалось открыть (статус ${status}).`,
    },

    // ─── Payments section ─────────────────────────────
    statTotal: { en: 'Total', ru: 'Всего' },
    statPaid: { en: 'Paid', ru: 'Оплачено' },
    statRemaining: { en: 'Remaining', ru: 'Осталось' },
    history: { en: 'History', ru: 'История' },
    logAPayment: { en: 'Log a Payment', ru: 'Записать оплату' },
    amountLabel: { en: 'Amount (USD)', ru: 'Сумма (USD)' },
    methodLabel: { en: 'Method', ru: 'Способ' },
    // Zelle / Venmo are brand names — keep in English; only "Cash" translates.
    methodPlaceholder: { en: 'Zelle / Cash / Venmo...', ru: 'Zelle / наличные / Venmo...' },
    dateLabel: { en: 'Date', ru: 'Дата' },
    noteLabel: { en: 'Note (optional)', ru: 'Заметка (необязательно)' },
    notePlaceholder: { en: 'e.g. Retainer received', ru: 'например, получен задаток' },
    addPayment: { en: 'Add Payment', ru: 'Добавить оплату' },
    enterPositiveAmount: { en: 'Enter a positive amount.', ru: 'Введи сумму больше нуля.' },

    // Payment row
    deletePaymentAria: { en: 'Delete payment', ru: 'Удалить оплату' },
    confirmDelete: { en: 'Confirm delete', ru: 'Подтвердить удаление' },
    deleting: { en: 'Deleting...', ru: 'Удаляю...' },
    // Loading-text variants — kept as three-period strings so they
    // read consistently next to the other "-ing..." labels in this
    // file (deleting, opening, delivering). common.saving/sending use
    // the typographic ellipsis char; here we want visual parity within
    // one screen.
    saving: { en: 'Saving...', ru: 'Сохраняю...' },
    sending: { en: 'Sending...', ru: 'Отправляю...' },

    // ─── Details section ──────────────────────────────
    displayNameLabel: { en: 'Display Name', ru: 'Имя для отображения' },
    displayNameHelp: {
      en: "What we'll greet them by in the portal.",
      ru: 'Как мы будем обращаться к клиенту в портале.',
    },
    clientEmailLabel: { en: 'Client Email', ru: 'Email клиента' },
    clientEmailHelpSimple: {
      en: 'Optional. If you add one, "Mark as Delivered" will email the client.',
      ru: 'Необязательно. Если добавишь, при нажатии «Отметить как отправленную» клиенту придёт письмо.',
    },
    eventDateLabel: { en: 'Event Date', ru: 'Дата события' },
    sessionTypeLabel: { en: 'Session Type', ru: 'Тип съёмки' },
    totalAmountLabel: { en: 'Total Amount (USD)', ru: 'Общая сумма (USD)' },
    totalAmountHelp: {
      en: 'What you charged. Editable until the contract is signed (for full-mode rows).',
      ru: 'Сколько ты взяла за съёмку. Можно менять, пока контракт не подписан (для полных клиентов).',
    },
    retainerLabel: { en: 'Retainer / Deposit (USD)', ru: 'Задаток / депозит (USD)' },
    retainerHelp: {
      en: 'Non-refundable deposit. Editable until the contract is signed.',
      ru: 'Невозвратный задаток. Можно менять, пока контракт не подписан.',
    },

    // ─── Account section ──────────────────────────────
    accountActive: { en: 'Account active', ru: 'Аккаунт активен' },
    accountInvitePending: { en: 'Invite pending', ru: 'Приглашение отправлено' },
    noAccount: { en: 'No account', ru: 'Нет аккаунта' },
    resendInvite: { en: 'Resend Invite', ru: 'Отправить приглашение снова' },
    inviteResent: {
      en: (email: string) => `Invite re-sent to ${email}.`,
      ru: (email: string) => `Приглашение отправлено повторно на ${email}.`,
    },
    accountPasswordHelp: {
      en: "Set a temporary password for the client. Use this if they're locked out or if you need to set them up manually instead of waiting for them to use the welcome link.",
      ru: 'Задай клиенту временный пароль. Пригодится, если он потерял свой, или если хочешь настроить его аккаунт вручную, не дожидаясь, пока он воспользуется ссылкой из приветственного письма.',
    },
    setPassword: { en: 'Set Password', ru: 'Задать пароль' },
    passwordMinPlaceholder: { en: 'At least 6 characters', ru: 'Минимум 6 символов' },
    passwordTooShort: {
      en: 'New password must be at least 6 characters.',
      ru: 'Новый пароль должен быть не короче 6 символов.',
    },
    passwordSetOk: {
      en: 'Password set. Share it with the client and ask them to change it on first login.',
      ru: 'Пароль установлен. Передай его клиенту и попроси сменить при первом входе.',
    },

    // ─── Danger zone ──────────────────────────────────
    dangerZoneBody: {
      en: 'Hard-deletes the portal and all logged payments. Cannot be undone. The signed-contract PDF in Blob storage is kept as a historical record.',
      ru: 'Полностью удаляет портал и все записанные оплаты. Отменить нельзя. PDF подписанного контракта остаётся в хранилище — как исторический документ.',
    },
    deleteThisPortal: { en: 'Delete this portal', ru: 'Удалить этот портал' },
  },

  journalEditor: {
    // Top-bar labels — mobile uses the short version so both save
    // buttons fit inside 44px targets side-by-side; desktop swaps in
    // the fuller phrasing. The non-Short variants live in `t.journal.*`
    // (backToPosts, publish, republish, saveDraft, saveDraftShort).
    // "Republish" on mobile is translated as "Обновить" — literally
    // "update", but the shorter, more idiomatic verb for republishing.
    republishShort: { en: 'Republish', ru: 'Обновить' },

    // Toast titles
    postSaved: { en: 'Post saved', ru: 'Запись сохранена' },
    postCreated: { en: 'Post created', ru: 'Запись создана' },
    postDeleted: { en: 'Post deleted', ru: 'Запись удалена' },

    // Errors
    couldNotLoadPost: {
      en: 'Could not load the post.',
      ru: 'Не удалось загрузить запись.',
    },
    saveFailed: {
      en: (status: number) => `Save failed (${status})`,
      ru: (status: number) => `Не удалось сохранить (${status})`,
    },
    deleteFailed: {
      en: (status: number) => `Delete failed (${status})`,
      ru: (status: number) => `Не удалось удалить (${status})`,
    },

    // window.confirm() before hard-deleting a post
    deleteConfirm: {
      en: 'Delete this post? This cannot be undone.',
      ru: 'Удалить эту запись? Это действие нельзя отменить.',
    },

    // Title field
    titleLabel: { en: 'Title', ru: 'Заголовок' },
    titlePlaceholder: {
      en: 'A summer wedding on the north shore',
      ru: 'Летняя свадьба на северном берегу',
    },

    // Slug field. "Slug" itself is a technical/URL term — keep the
    // English word in RU too, same as we do elsewhere in the admin.
    slugLabel: { en: 'Slug', ru: 'Slug' },
    slugHelpAuto: {
      en: 'Leave blank to auto-generate from the title',
      ru: 'Оставь пустым — сгенерируется из заголовка автоматически',
    },
    // Live preview of what the URL will be. The URL itself is language-
    // neutral; only the "URL:" prefix would move — keeping it identical
    // in both languages for consistency with other URL displays.
    slugHelpUrl: {
      en: (slug: string) => `URL: vero.photography/journal/${slug}`,
      ru: (slug: string) => `URL: vero.photography/journal/${slug}`,
    },
    slugPlaceholder: {
      en: 'auto-generated-from-title',
      ru: 'auto-generated-from-title',
    },

    // Event date field
    eventDateLabel: { en: 'Event date', ru: 'Дата события' },
    eventDateHelp: {
      en: 'The date this post is anchored to on the timeline. For a shoot, use the day it happened — not today. Leave blank to use the publish date instead.',
      // Split into three short sentences — the English runs a bit long
      // and reads more naturally in RU as separate thoughts.
      ru: 'К какой дате запись привязана на таймлайне. Для съёмки — тот день, когда она прошла, а не сегодня. Оставь пустым, чтобы использовать дату публикации.',
    },

    // Excerpt field
    excerptLabel: { en: 'Excerpt', ru: 'Краткое описание' },
    excerptHelp: {
      en: 'Short teaser shown in card previews and as SEO description (~1–2 sentences)',
      ru: 'Короткий тизер: показывается в превью карточек и как SEO-описание (примерно 1–2 предложения)',
    },
    excerptPlaceholder: {
      en: 'One or two sentences that pull the reader in.',
      ru: 'Одно-два предложения, чтобы зацепить читателя.',
    },

    // Body field
    bodyLabel: { en: 'Body', ru: 'Текст' },
    bodyHelp: {
      en: 'Full write-up. Markdown supported (rendered in session 3 — displays as-is for now).',
      // "Session 3" is a dev-milestone reference — reworded to a generic
      // "рендер добавится позже" so it reads naturally to Vero.
      ru: 'Полный текст. Поддерживается Markdown (рендер добавится позже — пока показывается как есть).',
    },
    bodyPlaceholder: {
      en: 'Tell the story — how the day unfolded, favorite moments, whatever you want.',
      ru: 'Расскажи историю — как прошёл день, любимые моменты, всё, что захочется.',
    },

    // Drive folder field
    driveFolderLabel: { en: 'Google Drive folder', ru: 'Папка Google Drive' },
    driveFolderHelp: {
      en: 'Upload the 5–15 photos for this post to a Drive folder (same workflow as client galleries), share it so anyone with the link can view, and paste the folder link here. The FIRST photo (by filename) is used as the cover — prefix names like 01, 02, 03… in Drive to control order.',
      // Split into three sentences — the English is one long compound
      // that reads awkwardly translated as-is. Preserved "по имени файла"
      // for the sort-order rule so the mechanic stays clear.
      ru: 'Загрузи 5–15 фото для этой записи в папку Drive (тот же процесс, что и для клиентских галерей) и открой доступ по ссылке. Вставь ссылку на папку сюда. ПЕРВОЕ фото (по имени файла) становится обложкой — префиксы 01, 02, 03… в Drive задают порядок.',
    },
    driveFolderPlaceholder: {
      en: 'https://drive.google.com/drive/folders/...',
      ru: 'https://drive.google.com/drive/folders/...',
    },

    // Cover alt text field
    coverAltLabel: { en: 'Cover photo alt text', ru: 'Alt-текст обложки' },
    coverAltHelp: {
      en: "Alt text for the first photo (used as the post's cover / og:image). Describe what's in it for screen readers and search engines. Optional.",
      ru: 'Alt-текст для первого фото (оно же обложка и og:image). Опиши, что на фото — для скринридеров и поисковиков. По желанию.',
    },
    coverAltPlaceholder: {
      en: 'Bride and groom under an oak tree at sunset',
      ru: 'Жених и невеста под дубом на закате',
    },

    // Session type field. Option values (portrait/wedding/…) stay
    // English on the wire — only the display labels translate.
    sessionTypeLabel: { en: 'Session type', ru: 'Тип съёмки' },
    sessionOptionNone: { en: '— (none)', ru: '— (нет)' },
    sessionOptionWedding: { en: 'Wedding', ru: 'Свадебная' },
    sessionOptionPortrait: { en: 'Portrait', ru: 'Портретная' },
    sessionOptionFamily: { en: 'Family', ru: 'Семейная' },
    sessionOptionMaternity: { en: 'Maternity', ru: 'Беременность' },

    // Tags field
    tagsLabel: { en: 'Tags', ru: 'Теги' },
    tagsHelp: { en: 'Comma-separated', ru: 'Через запятую' },
    // Tag values themselves are English (they become searchable slugs) —
    // placeholder stays in English in both languages so Vero sees the
    // right shape.
    tagsPlaceholder: {
      en: 'outdoor, sunset, north-shore',
      ru: 'outdoor, sunset, north-shore',
    },

    // Danger zone (superadmin-only delete)
    dangerZone: { en: 'Danger zone', ru: 'Опасная зона' },
    dangerZoneBody: {
      en: 'Deleting a post removes it permanently. No undo — including the body, tags, and photo URL list. Cover image + photo files themselves are not touched (they live in Drive/etc).',
      ru: 'Удаление записи убирает её навсегда. Отменить нельзя — вместе с текстом, тегами и списком ссылок на фото. Сами файлы обложки и фото не трогаются (они лежат в Drive и т.п.).',
    },
    deletePost: { en: 'Delete post', ru: 'Удалить запись' },
    deleting: { en: 'Deleting...', ru: 'Удаляю...' },
  },

  integrations: {
    // ─── Header ───────────────────────────────────────
    subtitle: {
      en: 'Third-party services that power the site.',
      ru: 'Сторонние сервисы, на которых работает сайт.',
    },

    // ─── Instagram card ───────────────────────────────
    // Small uppercase kicker above the card name
    kicker: { en: 'Integration', ru: 'Интеграция' },
    instagramTitle: { en: 'Instagram feed', ru: 'Instagram-лента' },

    // Status detail row
    checkingStatus: {
      en: 'Checking rotation status…',
      ru: 'Проверяю статус ротации…',
    },
    couldNotReadStatus: {
      en: 'Could not read status.',
      ru: 'Не удалось получить статус.',
    },
    noRotationDate: {
      en: 'No rotation date on record — click Mark as Refreshed to establish a baseline.',
      ru: 'Дата ротации ещё не записана — нажми «Обновлено», чтобы задать точку отсчёта.',
    },
    lastRotatedPrefix: { en: 'Last rotated', ru: 'Последняя ротация:' },
    // Compact "(N days ago)" tail. Russian plural rules: 1 день / 2-4 дня /
    // 5+ дней; teen range 11-14 always takes gen.pl regardless of last digit.
    daysAgo: {
      en: (n: number) => `(${n} ${n === 1 ? 'day' : 'days'} ago)`,
      ru: (n: number) => {
        const mod100 = n % 100;
        const mod10 = n % 10;
        let word = 'дней';
        if (mod100 < 11 || mod100 > 14) {
          if (mod10 === 1) word = 'день';
          else if (mod10 >= 2 && mod10 <= 4) word = 'дня';
        }
        return `(${n} ${word} назад)`;
      },
    },
    // "Estimated **N days** of runway left (60-day token window)."
    // Split so the middle piece can stay bolded/red in JSX.
    runwayPrefix: { en: 'Estimated', ru: 'Осталось примерно' },
    daysWord: {
      en: (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`,
      // Same plural rules as daysAgo above.
      ru: (n: number) => {
        const mod100 = n % 100;
        const mod10 = n % 10;
        let word = 'дней';
        if (mod100 < 11 || mod100 > 14) {
          if (mod10 === 1) word = 'день';
          else if (mod10 >= 2 && mod10 <= 4) word = 'дня';
        }
        return `${n} ${word}`;
      },
    },
    runwaySuffix: {
      en: 'of runway left (60-day token window).',
      ru: 'до истечения токена (окно — 60 дней).',
    },
    pastWindow: {
      en: 'Past the 60-day window — auto-refresh may no longer work.',
      ru: 'Прошло больше 60 дней — авто-обновление может уже не работать.',
    },
    // Kept English on purpose — "Instagram user ID" is a technical identifier
    // name that stays the same across UIs.
    instagramUserIdLabel: { en: 'Instagram user ID:', ru: 'Instagram user ID:' },

    // Status badges
    status: {
      fresh: { en: 'Fresh', ru: 'Свежий' },
      aging: { en: 'Aging', ru: 'Стареет' },
      overdue: { en: 'Rotate now', ru: 'Пора обновить' },
      unknown: { en: 'Unknown', ru: 'Неизвестно' },
    },

    // ─── How-to-rotate steps ──────────────────────────
    howToRotate: { en: 'How to rotate', ru: 'Как обновить токен' },
    step1: {
      en: 'Open the VeronicaWebsite repo in VS Code, open a terminal',
      ru: 'Открой репозиторий VeronicaWebsite в VS Code, открой терминал',
    },
    stepRun: { en: 'Run:', ru: 'Запусти:' },
    copyCommandAria: { en: 'Copy command', ru: 'Скопировать команду' },
    step3: {
      en: "Copy the new long-lived token from the script's output",
      ru: 'Скопируй новый long-lived токен из вывода скрипта',
    },
    // Step 4 wraps a <code>IG_ACCESS_TOKEN</code> chip. The tail
    // "→ Save → Redeploy" refers to actual English buttons in the Vercel
    // dashboard, so it stays untranslated in RU as well.
    step4Before: { en: 'Paste it into Vercel →', ru: 'Вставь его в Vercel →' },
    step4After: { en: '→ Save → Redeploy', ru: '→ Save → Redeploy' },
    // Step 5 wraps the <strong>Mark as Refreshed</strong> button label
    // inline — split around it so the label stays a single source of truth.
    step5Before: {
      en: "That’s it — the reminder clock resets automatically the next time this page loads or the daily cron runs (the",
      ru: 'Готово — таймер напоминания сбросится сам при следующей загрузке страницы или запуске ежедневного крона (кнопка',
    },
    step5After: {
      en: 'button below is just an optional way to reset it right this second)',
      ru: 'ниже — просто способ сбросить таймер прямо сейчас, если хочется)',
    },

    // ─── Action buttons ───────────────────────────────
    markAsRefreshed: { en: 'Mark as Refreshed', ru: 'Обновлено' },
    openVercelEnv: { en: 'Open Vercel env vars', ru: 'Открыть env-переменные Vercel' },

    // ─── Toast on successful mark ─────────────────────
    markedRefreshedTitle: { en: 'Marked as refreshed', ru: 'Отмечено как обновлено' },
    markedRefreshedBody: {
      en: 'Reminder clock reset. Next nudge in ~50 days.',
      ru: 'Таймер сброшен. Следующее напоминание — через ~50 дней.',
    },

    // ─── Error strings ────────────────────────────────
    statusCheckFailed: {
      en: (status: number) => `Status check failed (${status})`,
      ru: (status: number) => `Не удалось проверить статус (${status})`,
    },
    couldNotSaveStatus: {
      en: (status: number) => `Could not save (${status})`,
      ru: (status: number) => `Не удалось сохранить (${status})`,
    },

    // ─── Footnote about the daily cron ────────────────
    autoReminderLabel: { en: 'Auto-reminder:', ru: 'Авто-напоминание:' },
    // Alex's email is baked in — it's the destination, not user data.
    autoReminderBody: {
      en: " A daily cron watches this stamp and emails you at agerzon21@gmail.com when we're ~10 days from the token's 60-day expiry. You should rarely need to open this tab.",
      ru: ' Ежедневный крон следит за отметкой и присылает письмо на agerzon21@gmail.com примерно за 10 дней до истечения 60-дневного токена. Открывать эту вкладку почти не придётся.',
    },
  },

  journal: {
    tabTitle: { en: 'Journal', ru: 'Дневник' },
    postCount: {
      en: (n: number) => `${n} ${n === 1 ? 'post' : 'posts'}`,
      ru: (n: number) => `${n} ${n === 1 ? 'запись' : n < 5 ? 'записи' : 'записей'}`,
    },
    subtitleEmpty: { en: 'Weekly recap posts.', ru: 'Еженедельные записи-обзоры.' },
    newPost: { en: 'New Post', ru: 'Новая запись' },
    newPostShort: { en: 'New', ru: 'Новая' },
    editorNewTitle: { en: 'New post', ru: 'Новая запись' },
    editorEditTitle: { en: 'Edit post', ru: 'Редактировать запись' },
    backToPosts: { en: 'Back to posts', ru: 'К списку записей' },
    saveDraft: { en: 'Save Draft', ru: 'Сохранить черновик' },
    saveDraftShort: { en: 'Draft', ru: 'Черновик' },
    publish: { en: 'Publish', ru: 'Опубликовать' },
    republish: { en: 'Save & Republish', ru: 'Сохранить и опубликовать' },
    publishing: { en: 'Publishing...', ru: 'Публикую...' },
    liveAt: { en: 'Live at', ru: 'Опубликовано:' },
    // Journal list — errors, aria labels, meta strings, badges,
    // empty state.
    loadFailed: {
      en: (status: number) => `Load failed (${status})`,
      ru: (status: number) => `Не удалось загрузить (${status})`,
    },
    refreshAria: { en: 'Refresh posts', ru: 'Обновить список' },
    openLivePageAria: { en: 'Open live page', ru: 'Открыть страницу' },
    // Meta row under each post row: Drive folder status
    photosLinked: { en: 'Photos linked', ru: 'Фото привязаны' },
    noPhotosYet: { en: 'No photos yet', ru: 'Фото пока нет' },
    // Meta row: "Published <date>" / "Updated <date>". The date is
    // already formatted upstream — we just wrap it with the prefix.
    publishedOn: {
      en: (date: string) => `Published ${date}`,
      ru: (date: string) => `Опубликовано ${date}`,
    },
    updatedOn: {
      en: (date: string) => `Updated ${date}`,
      ru: (date: string) => `Обновлено ${date}`,
    },
    // Status badges on each post row. Kept separate from the editor's
    // saveDraft label so we can style/spell the badge independently.
    statusDraft: { en: 'Draft', ru: 'Черновик' },
    statusPublished: { en: 'Published', ru: 'Опубликовано' },
    // Empty state (no posts yet)
    emptyTitle: { en: 'No posts yet', ru: 'Пока нет записей' },
    emptyDescription: {
      en: 'Write a weekly recap of a recent shoot — 10–15 favorite photos with a short story. First post publishes to /journal.',
      // Split into two sentences for readability. "First post publishes
      // to /journal" reworded to "как только опубликуешь первую…" so it
      // reads like a natural next step rather than a spec detail.
      ru: 'Напиши обзор недавней съёмки — 10–15 любимых кадров с короткой историей. Первая запись появится на /journal, как только её опубликуешь.',
    },
  },

  reviews: {
    tabTitle: { en: 'Reviews', ru: 'Отзывы' },
    // Russian plural rules: 1 отзыв, 2/3/4 отзыва, 5+ отзывов (teens
    // 11-14 always take the gen.pl). Same shape as journal.postCount /
    // messages.conversationCount.
    reviewCount: {
      en: (n: number) => `${n} review${n === 1 ? '' : 's'}`,
      ru: (n: number) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return `${n} отзыв`;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} отзыва`;
        return `${n} отзывов`;
      },
    },
    subtitleEmpty: { en: 'Client testimonials on the site.', ru: 'Отзывы клиентов на сайте.' },

    // Aria labels for icon-only buttons on the list
    refreshAria: { en: 'Refresh reviews', ru: 'Обновить отзывы' },
    deleteAria: { en: 'Delete review', ru: 'Удалить отзыв' },

    // + New CTA — short version fits the icon-only mobile breakpoint
    newReview: { en: 'New Review', ru: 'Новый отзыв' },
    newReviewShort: { en: 'New', ru: 'Новый' },

    // Inline chips on each card
    featured: { en: 'Featured', ru: 'В избранном' },
    hidden: { en: 'Hidden', ru: 'Скрыт' },
    visible: { en: 'Visible', ru: 'Виден' },

    // Fallback used when a review has no author name on record.
    unnamedAuthor: { en: '(unnamed)', ru: '(без имени)' },

    // Source badges — kept as brand names (Google/Yelp/Instagram/Email
    // stay English in RU too, since they're recognized in Cyrillic UIs
    // the same way). "Manual" is the odd one out — translated for
    // clarity so Vero knows what she typed herself vs. imported.
    sourceGoogle: { en: 'Google', ru: 'Google' },
    sourceYelp: { en: 'Yelp', ru: 'Yelp' },
    sourceInstagram: { en: 'Instagram', ru: 'Instagram' },
    sourceEmail: { en: 'Email', ru: 'Email' },
    sourceManual: { en: 'Manual', ru: 'Вручную' },

    // Errors
    loadFailed: {
      en: (status: number) => `Load failed (${status})`,
      ru: (status: number) => `Не удалось загрузить (${status})`,
    },
    saveFailed: {
      en: (status: number) => `Save failed (${status})`,
      ru: (status: number) => `Не удалось сохранить (${status})`,
    },
    deleteFailed: {
      en: (status: number) => `Delete failed (${status})`,
      ru: (status: number) => `Не удалось удалить (${status})`,
    },

    // Toast on successful delete (delete lives on the list, not editor)
    reviewDeleted: { en: 'Review deleted', ru: 'Отзыв удалён' },

    // Empty state
    emptyTitle: { en: 'No reviews yet', ru: 'Пока нет отзывов' },
    emptyDescription: {
      en: 'Add a testimonial you got via Google, Instagram DMs, or email. Featured ones show up first on the home page.',
      // Slightly re-shaped in RU so the "featured on home" idea reads
      // naturally as a second sentence.
      ru: 'Добавь отзыв, полученный в Google, Instagram-директе или по почте. Отмеченные «В избранном» появятся первыми на главной.',
    },

    // Google Aggregate card — the "5.0 · 15 reviews" badge on the home
    // page. Two scalars kept in system_state and edited by hand here
    // rather than pulled from the Places API.
    aggregateTitle: { en: 'Google Aggregate', ru: 'Итоги Google' },
    aggregateSubtitle: {
      en: "The '5.0 · 15 reviews' badge on your home page. Update these when new reviews land on Google.",
      ru: 'Плашка «5.0 · 15 отзывов» на главной странице. Обнови эти числа, когда в Google появятся новые отзывы.',
    },
    aggregateRatingLabel: { en: 'Rating', ru: 'Рейтинг' },
    aggregateCountLabel: { en: 'Review count', ru: 'Количество отзывов' },
    aggregateUpdatedAt: {
      en: (date: string) => `Updated ${date}`,
      ru: (date: string) => `Обновлено ${date}`,
    },
    aggregateInvalidRating: {
      en: 'Rating must be a number 0.0–5.0',
      ru: 'Рейтинг должен быть числом от 0.0 до 5.0',
    },
    aggregateInvalidCount: {
      en: 'Count must be a non-negative whole number',
      ru: 'Количество должно быть целым неотрицательным числом',
    },
    aggregateSaveFailed: { en: 'Save failed', ru: 'Не удалось сохранить' },
    aggregateSaved: { en: 'Aggregate saved', ru: 'Итоги сохранены' },
    aggregateNeverUpdated: { en: 'Never updated', ru: 'Ещё не обновлялось' },
  },

  reviewsEditor: {
    // Modal titles
    newTitle: { en: 'New Review', ru: 'Новый отзыв' },
    editTitle: { en: 'Edit Review', ru: 'Редактировать отзыв' },

    // Toast titles on save success
    reviewSaved: { en: 'Review saved', ru: 'Отзыв сохранён' },
    reviewCreated: { en: 'Review added', ru: 'Отзыв добавлен' },

    // Errors
    saveFailed: {
      en: (status: number) => `Save failed (${status})`,
      ru: (status: number) => `Не удалось сохранить (${status})`,
    },
    requiredFields: {
      en: 'Author name and review text are both required.',
      ru: 'Имя автора и текст отзыва обязательны.',
    },

    // Field labels + placeholders + help
    authorNameLabel: { en: 'Author name', ru: 'Имя автора' },
    authorNamePlaceholder: { en: 'e.g. Anna Petrova', ru: 'например, Анна Петрова' },

    authorPhotoLabel: { en: 'Author photo URL', ru: 'Ссылка на фото автора' },
    authorPhotoHelp: {
      en: 'Optional. Leave blank to show initials in a gold circle.',
      ru: 'Необязательно. Оставь пустым — покажем инициалы в золотом кружке.',
    },

    ratingLabel: { en: 'Rating', ru: 'Оценка' },
    // Aria label on each clickable star — announces "3 stars" to screen
    // readers. Russian plural: 1 звезда, 2-4 звезды, 5+ звёзд. The
    // 5-star case ("5 звёзд") uses the "ё" letter deliberately — that's
    // the correct genitive plural form.
    ratingStarAria: {
      en: (n: number) => `${n} star${n === 1 ? '' : 's'}`,
      ru: (n: number) => {
        if (n === 1) return `${n} звезда`;
        if (n >= 2 && n <= 4) return `${n} звезды`;
        return `${n} звёзд`;
      },
    },

    publishDateLabel: { en: 'Publish date', ru: 'Дата отзыва' },
    publishDateHelp: {
      en: 'When the review was left. Optional — shown on the card when set.',
      ru: 'Когда клиент оставил отзыв. Необязательно — если задано, покажем на карточке.',
    },

    sourceLabel: { en: 'Source', ru: 'Источник' },
    // Full source labels for the dropdown (the badge on the card uses
    // shorter forms from t.reviews.source*). "Manual entry" is spelled
    // out here so Vero knows exactly what the option means.
    sourceGoogle: { en: 'Google', ru: 'Google' },
    sourceYelp: { en: 'Yelp', ru: 'Yelp' },
    sourceInstagram: { en: 'Instagram', ru: 'Instagram' },
    sourceEmail: { en: 'Email', ru: 'Email' },
    sourceManual: { en: 'Manual entry', ru: 'Вручную' },

    textLabel: { en: 'Review text', ru: 'Текст отзыва' },
    textPlaceholder: {
      en: 'What the client wrote about working with you.',
      ru: 'Что клиент написал о работе с тобой.',
    },

    // Help text under the two switches (Visible / Featured) inside the
    // editor. Same switches appear inline on each list card too.
    visibleHelp: {
      en: 'When off, the review is hidden from the public site.',
      ru: 'Если выключено — отзыв не будет показан на сайте.',
    },
    featuredHelp: {
      en: 'Featured reviews appear first on the home page.',
      ru: 'Отмеченные отзывы показываются первыми на главной.',
    },

    // Danger zone — superadmin-only, mirrors journalEditor.dangerZone*
    dangerZone: { en: 'Danger zone', ru: 'Опасная зона' },
    dangerZoneBody: {
      en: 'Deleting a review removes it permanently. No undo.',
      ru: 'Удаление уберёт отзыв навсегда. Отменить нельзя.',
    },
    deleteReview: { en: 'Delete review', ru: 'Удалить отзыв' },

    // Confirm dialog (opens from either the row trash icon or the
    // editor's danger-zone button)
    deleteConfirmTitle: { en: 'Delete this review?', ru: 'Удалить этот отзыв?' },
    deleteConfirmBody: {
      en: (name: string) => `The review from ${name} will be permanently removed.`,
      ru: (name: string) => `Отзыв от ${name} будет удалён навсегда.`,
    },
  },

  leads: {
    tabTitle: { en: 'Leads', ru: 'Лиды' },
    subtitleEmpty: { en: 'Inquiries from the contact form.', ru: 'Запросы из формы обратной связи.' },

    // Russian plural: 1 лид, 2/3/4 лида, 5+ лидов (teens 11-14 → лидов).
    // Same shape as reviews.reviewCount / journal.postCount.
    leadCount: {
      en: (n: number) => `${n} lead${n === 1 ? '' : 's'}`,
      ru: (n: number) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return `${n} лид`;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} лида`;
        return `${n} лидов`;
      },
    },

    // "12 leads · 3 new" — the "N new" tail uses a mini plural helper
    // because English needs "new" invariant while Russian needs
    // agreement (1 новый, 2/3/4 новых — technically "новый" is masc.sg
    // agreeing with "лид"; kept simple with "новых" as a shortcut).
    subtitleWithNew: {
      en: (total: number, unread: number) =>
        `${total} lead${total === 1 ? '' : 's'} · ${unread} new`,
      ru: (total: number, unread: number) => {
        const totalStr =
          (total % 10 === 1 && total % 100 !== 11)
            ? `${total} лид`
            : (total % 10 >= 2 && total % 10 <= 4 && (total % 100 < 12 || total % 100 > 14))
              ? `${total} лида`
              : `${total} лидов`;
        return `${totalStr} · ${unread} новых`;
      },
    },

    refreshAria: { en: 'Refresh leads', ru: 'Обновить лидов' },

    // Fallback if a submission somehow has an empty name field
    // (validation should prevent this, but be defensive on display).
    unnamedLead: { en: '(no name)', ru: '(без имени)' },

    // Errors
    loadFailed: {
      en: (status: number) => `Load failed (${status})`,
      ru: (status: number) => `Не удалось загрузить (${status})`,
    },
    saveFailed: {
      en: (status: number) => `Save failed (${status})`,
      ru: (status: number) => `Не удалось сохранить (${status})`,
    },
    deleteFailed: {
      en: (status: number) => `Delete failed (${status})`,
      ru: (status: number) => `Не удалось удалить (${status})`,
    },

    leadDeleted: { en: 'Lead deleted', ru: 'Лид удалён' },

    emptyTitle: { en: 'No leads yet', ru: 'Пока нет лидов' },
    emptyDescription: {
      en: "Contact-form submissions land here. They also go straight to Vero's email — this is the searchable history + status tracker.",
      ru: 'Сюда попадают заявки из формы. Одновременно они приходят на почту Veronike — этот экран для истории и отметок о статусе.',
    },
  },

  leadsEditor: {
    // Modal title — no "new" variant because leads only arrive via the
    // public form; the admin panel is read + status + notes only.
    editTitle: { en: 'Lead Details', ru: 'Информация о лиде' },

    // Toast on save success — status flip and/or notes edit
    leadSaved: { en: 'Lead updated', ru: 'Лид обновлён' },

    // Field labels — the immutable submitter-owned fields (name, email,
    // shoot type, preferred date, location, message) show as detail rows
    // rather than form inputs, so their labels double as row headers.
    emailLabel: { en: 'Email', ru: 'Email' },
    shootTypeLabel: { en: 'Type', ru: 'Тип съёмки' },
    preferredDateLabel: { en: 'Preferred date', ru: 'Желаемая дата' },
    locationLabel: { en: 'Location', ru: 'Локация' },
    messageLabel: { en: 'Message', ru: 'Сообщение' },

    // Reply shortcut — opens mailto: with subject prefilled to match
    // the auto-reply Gmail-threading logic in _auto-reply.ts.
    replyViaEmail: { en: 'Reply via email', ru: 'Ответить письмом' },

    // Editable fields
    statusLabel: { en: 'Status', ru: 'Статус' },

    // The status enum. Kept in sync with STATUS_VALUES in AdminLeads.tsx
    // and ALLOWED_STATUSES in api/admin/_leads-update.ts — three sources
    // of truth, one intent (add a status → update all three).
    statusOption: {
      new:       { en: 'New',       ru: 'Новый' },
      contacted: { en: 'Contacted', ru: 'Связались' },
      replied:   { en: 'Replied',   ru: 'Ответили' },
      booked:    { en: 'Booked',    ru: 'Забронирован' },
      ghosted:   { en: 'Ghosted',   ru: 'Не ответил' },
      spam:      { en: 'Spam',      ru: 'Спам' },
    },

    contactedAtLabel: { en: 'First contact', ru: 'Первый контакт' },
    // Three states for the help text under the contacted_at read-only
    // display: already set (show timestamp), will-stamp on save (Vero
    // has flipped status past "new"), or still unset.
    contactedAtHelpSet: {
      en: (when: string) => `You first replied ${when}.`,
      ru: (when: string) => `Первый ответ был ${when}.`,
    },
    contactedAtHelpWillStamp: {
      en: 'Timestamp will be recorded when you save this change.',
      ru: 'Отметка времени будет записана при сохранении.',
    },
    contactedAtHelpUnset: {
      en: 'Set automatically the first time you flip status past "New".',
      ru: 'Заполняется автоматически при первом изменении статуса из «Новый».',
    },
    notContactedYet: { en: 'Not contacted yet', ru: 'Ещё не связывались' },

    notesLabel: { en: 'Notes', ru: 'Заметки' },
    notesHelp: {
      en: 'Internal only — never shown to the lead. Jot follow-up plans, quotes given, blockers, etc.',
      ru: 'Только для внутреннего использования — клиент их не увидит. Записывай планы, цены, комментарии.',
    },
    notesPlaceholder: {
      en: 'e.g. Called back Tue, sent quote — waiting on reply.',
      ru: 'например, Перезвонили во вторник, отправили цену — ждём ответа.',
    },

    // Danger zone — super-only, mirrors reviewsEditor.dangerZone*
    dangerZone: { en: 'Danger zone', ru: 'Опасная зона' },
    dangerZoneBody: {
      en: 'Deleting a lead removes it permanently. Prefer flipping status to "spam" or "ghosted" instead — keeps the record for later analytics.',
      ru: 'Удаление уберёт лида навсегда. Лучше сначала поставить статус «Спам» или «Не ответил» — так запись останется для аналитики.',
    },
    deleteLead: { en: 'Delete lead', ru: 'Удалить лида' },

    // Confirm dialog
    deleteConfirmTitle: { en: 'Delete this lead?', ru: 'Удалить этого лида?' },
    deleteConfirmBody: {
      en: (name: string) => `The lead from ${name} will be permanently removed.`,
      ru: (name: string) => `Лид от ${name} будет удалён навсегда.`,
    },
  },

  crons: {
    // ─── Header ───────────────────────────────────────
    tabTitle: { en: 'Crons', ru: 'Задачи' },
    subtitle: {
      en: 'Scheduled background jobs. Toggle, run on demand, inspect history.',
      ru: 'Фоновые задачи по расписанию. Включай, запускай вручную, смотри историю.',
    },
    // Meta strip count. Russian plural: 1 задача, 2/3/4 задачи, 5+ задач.
    cronCount: {
      en: (n: number) => `${n} ${n === 1 ? 'cron' : 'crons'}`,
      ru: (n: number) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return `${n} задача`;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} задачи`;
        return `${n} задач`;
      },
    },
    refreshAria: { en: 'Refresh crons', ru: 'Обновить список задач' },

    // ─── Card body ────────────────────────────────────
    // The toggle label + status pills. Kept short so they fit next
    // to the Switch on narrow cards.
    enabled: { en: 'Enabled', ru: 'Включена' },
    disabled: { en: 'Disabled', ru: 'Отключена' },
    enabledAria: { en: 'Toggle cron enabled', ru: 'Переключить активность задачи' },
    // The header row above the description.
    scheduleLabel: { en: 'Schedule', ru: 'Расписание' },
    pathLabel: { en: 'Path', ru: 'Путь' },

    // Human-readable schedule fallbacks. Common cases get named
    // strings; anything else falls back to the raw expression with
    // a "custom" tag.
    scheduleDaily2Utc: { en: 'Daily at 2:00 UTC', ru: 'Ежедневно в 02:00 UTC' },
    scheduleDaily12Utc: { en: 'Daily at 12:00 UTC', ru: 'Ежедневно в 12:00 UTC' },
    scheduleCustom: {
      en: (expr: string) => `${expr} (custom schedule)`,
      ru: (expr: string) => `${expr} (своё расписание)`,
    },

    // ─── Last-run summary line ────────────────────────
    // "Ran 3h ago in 8.4s" / "Skipped 1d ago" / "Errored 12h ago: msg"
    // Format arguments as pre-composed strings from the component
    // so plural / date-format logic stays in one place.
    lastRunOk: {
      en: (ago: string, duration: string) => `Ran ${ago} in ${duration}`,
      ru: (ago: string, duration: string) => `Выполнена ${ago}, длилась ${duration}`,
    },
    lastRunSkipped: {
      en: (ago: string) => `Skipped ${ago} (cron is off)`,
      ru: (ago: string) => `Пропущена ${ago} (задача отключена)`,
    },
    lastRunError: {
      en: (ago: string, msg: string) => `Errored ${ago}: ${msg}`,
      ru: (ago: string, msg: string) => `Ошибка ${ago}: ${msg}`,
    },
    lastRunRunning: {
      en: (ago: string) => `Running (started ${ago})`,
      ru: (ago: string) => `Выполняется (началась ${ago})`,
    },
    lastRunNever: { en: 'Has never run', ru: 'Ещё ни разу не запускалась' },

    // Trigger tags shown next to a run row in the history table.
    triggerSchedule: { en: 'schedule', ru: 'расписание' },
    triggerManual: { en: 'manual', ru: 'вручную' },

    // Status labels on run rows.
    statusOk: { en: 'ok', ru: 'ок' },
    statusError: { en: 'error', ru: 'ошибка' },
    statusSkipped: { en: 'skipped', ru: 'пропуск' },
    statusRunning: { en: 'running', ru: 'выполняется' },

    // ─── Buttons ──────────────────────────────────────
    runNow: { en: 'Run now', ru: 'Запустить сейчас' },
    running: { en: 'Running…', ru: 'Запускаю…' },
    history: { en: 'History', ru: 'История' },
    hideHistory: { en: 'Hide history', ru: 'Скрыть историю' },
    historyLoading: { en: 'Loading history…', ru: 'Загружаю историю…' },
    historyEmpty: { en: 'No runs recorded yet.', ru: 'Запусков ещё не было.' },

    // Column headers for the compact history table.
    historyStartedAt: { en: 'Started', ru: 'Начало' },
    historyDuration: { en: 'Duration', ru: 'Длительность' },
    historyStatus: { en: 'Status', ru: 'Статус' },
    historyTrigger: { en: 'Trigger', ru: 'Источник' },
    historyError: { en: 'Error', ru: 'Ошибка' },

    // Toggle-confirm — we DON'T actually pop a modal on toggle (the
    // switch flip is instant + reversible), but on Run Now we do
    // surface a soft "are you sure" toast so a mis-tap on the wedding
    // photo sync doesn't kick off a Vision-API bill for nothing.
    runNowConfirmTitle: {
      en: (name: string) => `Run '${name}' now?`,
      ru: (name: string) => `Запустить «${name}» сейчас?`,
    },
    runNowConfirmBody: {
      en: 'This runs the cron immediately, ignoring its schedule. Use to test after code changes or when you need fresh data now.',
      ru: 'Задача запустится сразу, вне расписания. Пригодится, чтобы проверить после изменений в коде или получить свежие данные прямо сейчас.',
    },
    runNowConfirm: { en: 'Run', ru: 'Запустить' },

    // ─── Toasts ───────────────────────────────────────
    toggleFailed: { en: 'Could not update cron', ru: 'Не удалось обновить задачу' },
    runNowSuccess: {
      en: (name: string) => `Ran '${name}' — see last-run info above`,
      ru: (name: string) => `Задача «${name}» выполнена — статус выше`,
    },
    runNowSkipped: {
      en: (name: string) => `Skipped '${name}' — enable it first`,
      ru: (name: string) => `«${name}» пропущена — сначала включи её`,
    },
    runNowFailed: {
      en: (name: string) => `'${name}' errored — check the history`,
      ru: (name: string) => `«${name}» завершилась с ошибкой — см. историю`,
    },

    // ─── Errors ───────────────────────────────────────
    loadFailed: {
      en: (status: number) => `Load failed (${status})`,
      ru: (status: number) => `Не удалось загрузить (${status})`,
    },
    historyLoadFailed: {
      en: (status: number) => `History load failed (${status})`,
      ru: (status: number) => `Не удалось загрузить историю (${status})`,
    },

    // ─── Empty state ──────────────────────────────────
    emptyTitle: { en: 'No crons registered yet', ru: 'Пока нет зарегистрированных задач' },
    emptyDescription: {
      en: "Registered crons auto-appear here on their first run. If you're seeing this after a fresh deploy, wait for the next scheduled invocation (or hit any of the /api/cron/* URLs manually).",
      ru: 'Задачи появляются здесь после первого запуска. Если ты только что задеплоила код, подожди до ближайшего срабатывания (или дёрни любую из URL /api/cron/* вручную).',
    },
    // Shown when the DB migration hasn't been applied yet (endpoint
    // returns migrationRequired instead of an error).
    migrationRequired: {
      en: 'The cron_jobs table has not been created yet. Run db/migrations/013-cron-jobs.sql against production Neon.',
      ru: 'Таблица cron_jobs ещё не создана. Запусти db/migrations/013-cron-jobs.sql на продакшн-базе Neon.',
    },
  },
} as const;

// ─── Type projection ────────────────────────────────────────────────
// Takes the raw dict and yields the same shape but with each leaf
// replaced by just its string (or its function). So `t.common.save`
// is `string`, `t.clients.portalCount` is `(n: number) => string`.

type Projected<T> = T extends { en: infer E; ru: any }
  ? E
  : T extends Record<string, any>
    ? { [K in keyof T]: Projected<T[K]> }
    : T;

export type AdminT = Projected<typeof dict>;

function project(node: any, lang: AdminLang): any {
  // Leaf?
  if (node && typeof node === 'object' && 'en' in node && 'ru' in node) {
    return node[lang];
  }
  // Nested?
  if (node && typeof node === 'object') {
    const out: Record<string, any> = {};
    for (const key of Object.keys(node)) {
      out[key] = project(node[key], lang);
    }
    return out;
  }
  return node;
}

// ─── Context + hook ────────────────────────────────────────────────

interface AdminI18nCtx {
  lang: AdminLang;
  setLang: (l: AdminLang) => void;
  t: AdminT;
}

// Fallback context value used before the provider mounts (e.g. during
// SSR / initial render). Defaults to English so nothing crashes if a
// component accidentally reads `t` outside the provider.
const FALLBACK_LANG: AdminLang = 'en';
const FALLBACK: AdminI18nCtx = {
  lang: FALLBACK_LANG,
  setLang: () => {},
  t: project(dict, FALLBACK_LANG),
};

const Ctx = createContext<AdminI18nCtx>(FALLBACK);

const STORAGE_KEY = 'vero_admin_lang';

/**
 * Provider — mount at the top of the admin surface. Chooses the
 * default language from adminLevel (Vero → RU, super → EN) unless
 * the user has stored a manual override in localStorage.
 */
export function AdminI18nProvider({
  adminLevel,
  children,
}: {
  adminLevel: AdminLevel;
  children: ReactNode;
}) {
  const defaultLang: AdminLang = adminLevel === 'super' ? 'en' : 'ru';
  const [lang, setLangState] = useState<AdminLang>(() => {
    if (typeof window === 'undefined') return defaultLang;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'ru' || stored === 'en' ? stored : defaultLang;
  });

  // If the admin level changes (e.g. login to a different account
  // in the same session) AND the user has no manual override yet,
  // re-apply the default for that level.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) setLangState(defaultLang);
  }, [defaultLang]);

  const setLang = useCallback((l: AdminLang) => {
    setLangState(l);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, l);
    }
  }, []);

  const t = useMemo(() => project(dict, lang) as AdminT, [lang]);

  const value = useMemo<AdminI18nCtx>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return createElement(Ctx.Provider, { value }, children);
}

/**
 * Read the current-language translation table + control setters.
 * Usage:
 *   const { t, lang, setLang } = useAdminLang();
 *   <Text>{t.common.save}</Text>
 *   <Text>{t.clients.portalCount(3)}</Text>  // dynamic leaf
 */
export function useAdminLang(): AdminI18nCtx {
  return useContext(Ctx);
}

// Re-export the raw dict + a helper for anyone who needs it (e.g.
// picking translated toast titles from outside a React tree).
export { dict as adminDict };

/**
 * Non-hook accessor for the current language + translations. Reads
 * localStorage directly. Use only where hooks aren't available
 * (event callbacks that fire after unmount, module-level constants).
 * Prefer useAdminLang() in components.
 */
export function readAdminLang(defaultLang: AdminLang = 'en'): AdminLang {
  if (typeof window === 'undefined') return defaultLang;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'ru' || stored === 'en' ? stored : defaultLang;
}
// Silence "unused" for the internal type — TS needs it referenced.
export type _LeafUnused = Leaf;
