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

/**
 * Russian plural of "поле" (a form field): 1 поле, 2-4 поля, 5+ полей, and the
 * 11-14 band always taking полей regardless of its last digit.
 *
 * Shared rather than inlined because two strings on the client screen count
 * the same contract fields (the unsaved-work warning and the rewrite
 * confirmation), and they read as one screen only if they decline the word the
 * same way. daysRemaining below inlines its own because it is the only user of
 * that word.
 */
const ruFieldWord = (n: number): string => {
  const mod100 = n % 100;
  const mod10 = n % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'полей';
  if (mod10 === 1) return 'поле';
  if (mod10 >= 2 && mod10 <= 4) return 'поля';
  return 'полей';
};

/**
 * Generic Russian count-declension picker: 1 день, 2-4 дня, 5+ дней, with the
 * 11-14 band always taking the many-form whatever its last digit is.
 *
 * ruFieldWord above is the same rule hard-wired to one word. The working table
 * counts days, weeks and months in the same breath ("in 13 days", "3 weeks
 * ago"), so it needs the rule, not a fourth copy of it.
 */
const ruPlural = (n: number, one: string, few: string, many: string): string => {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
};

const portalCountEn = (n: number): string => `${n} portal${n === 1 ? '' : 's'}`;
const portalCountRu = (n: number): string => `${n} ${ruPlural(n, 'портал', 'портала', 'порталов')}`;

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
    showPassword: { en: 'Show password', ru: 'Показать пароль' },
    hidePassword: { en: 'Hide password', ru: 'Скрыть пароль' },
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
    weddings: { en: 'Weddings', ru: 'Свадьбы' },
    integrations: { en: 'Integrations', ru: 'Интеграции' },
    crons: { en: 'Crons', ru: 'Задачи' },
    users: { en: 'Admin users', ru: 'Администраторы' },
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
      en: portalCountEn,
      ru: portalCountRu,
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

    // ─── The working table: search, filter chips, sort ───
    //
    // The chips read as answers ("Owes", "To deliver"), never as field names,
    // because their job is to BE the status summary this screen has never had.
    // Их задача: короткая сводка, поэтому подписи короткие в обоих языках.
    search: { en: 'Search clients', ru: 'Поиск клиентов' },
    noMatches: { en: 'Nothing matches that.', ru: 'Ничего не найдено.' },
    clearFilter: { en: 'Clear', ru: 'Сбросить' },
    filters: {
      all: { en: 'All', ru: 'Все' },
      upcoming: { en: 'Upcoming', ru: 'Ближайшие' },
      owes: { en: 'Owes', ru: 'Должны' },
      overpaid: { en: 'Overpaid', ru: 'Переплата' },
      unsigned: { en: 'Unsigned', ru: 'Без подписи' },
      deliver: { en: 'To deliver', ru: 'Отдать галерею' },
    },
    // Chip label + its live count. One leaf rather than string concatenation
    // at the call site, so a language that wants the count first can have it.
    filterCount: {
      en: (label: string, n: number) => `${label} ${n}`,
      ru: (label: string, n: number) => `${label} ${n}`,
    },
    sortLabel: { en: 'Sort', ru: 'Сортировка' },
    // Which way the arrow points, spelled out for the mobile action sheet
    // and for the column header's accessible name. Per column, because
    // "first to last" says nothing useful about a column of money.
    sortDir: {
      date: {
        asc: { en: 'next shoot first', ru: 'сначала ближайшая съёмка' },
        desc: { en: 'oldest first', ru: 'сначала самые давние' },
      },
      name: {
        asc: { en: 'A to Z', ru: 'от А до Я' },
        desc: { en: 'Z to A', ru: 'от Я до А' },
      },
      money: {
        asc: { en: 'least owed first', ru: 'сначала меньший долг' },
        desc: { en: 'most owed first', ru: 'сначала больший долг' },
      },
    },
    sortBy: {
      date: { en: 'Date', ru: 'Дата' },
      name: { en: 'Name', ru: 'Имя' },
      money: { en: 'Money', ru: 'Деньги' },
    },
    sortAria: {
      en: (field: string) => `Sort by ${field}`,
      ru: (field: string) => `Сортировать по полю ${field}`,
    },
    // The count line under the H1 reports the filter. When nothing is
    // filtered out it must read EXACTLY like portalCount did, so the
    // unfiltered screen is unchanged.
    portalCountFiltered: {
      en: (total: number, shown: number) =>
        total === shown ? portalCountEn(total) : `${portalCountEn(total)}, ${shown} shown`,
      ru: (total: number, shown: number) =>
        total === shown ? portalCountRu(total) : `${portalCountRu(total)}, показано ${shown}`,
    },
    // Money cell. The third case the old balance line swallowed: a client
    // who sent more than the booking asks for was printed as simply "Paid".
    overpaid: {
      en: (amount: string) => `Overpaid ${amount}`,
      ru: (amount: string) => `Переплата ${amount}`,
    },
    owedOf: {
      en: (paid: string, owed: string) => `${paid} of ${owed}`,
      ru: (paid: string, owed: string) => `${paid} из ${owed}`,
    },
    // The same sentence with its subject left out, so the Money cell can set
    // the amount already paid in a heavier weight than the rest of the line.
    owedOfSuffix: {
      en: (owed: string) => ` of ${owed}`,
      ru: (owed: string) => ` из ${owed}`,
    },
    contractTotal: {
      en: (amount: string) => `${amount} total`,
      ru: (amount: string) => `всего ${amount}`,
    },
    // Second line under a gallery that has photos but has not been sent.
    galleryNotSent: { en: 'Link not sent', ru: 'Ссылка не отправлена' },
    // Relative event date, the second line of the When cell. Arithmetic is
    // done in AdminDashboard on the UTC midnight value; these leaves only
    // decline the word.
    when: {
      today: { en: 'Today', ru: 'Сегодня' },
      tomorrow: { en: 'Tomorrow', ru: 'Завтра' },
      yesterday: { en: 'Yesterday', ru: 'Вчера' },
      inDays: {
        en: (n: number) => `in ${n} days`,
        ru: (n: number) => `через ${n} ${ruPlural(n, 'день', 'дня', 'дней')}`,
      },
      daysAgo: {
        en: (n: number) => `${n} days ago`,
        ru: (n: number) => `${n} ${ruPlural(n, 'день', 'дня', 'дней')} назад`,
      },
      inWeeks: {
        en: (n: number) => `in ${n} week${n === 1 ? '' : 's'}`,
        ru: (n: number) => `через ${n} ${ruPlural(n, 'неделю', 'недели', 'недель')}`,
      },
      weeksAgo: {
        en: (n: number) => `${n} week${n === 1 ? '' : 's'} ago`,
        ru: (n: number) => `${n} ${ruPlural(n, 'неделю', 'недели', 'недель')} назад`,
      },
      inMonths: {
        en: (n: number) => `in ${n} month${n === 1 ? '' : 's'}`,
        ru: (n: number) => `через ${n} ${ruPlural(n, 'месяц', 'месяца', 'месяцев')}`,
      },
      monthsAgo: {
        en: (n: number) => `${n} month${n === 1 ? '' : 's'} ago`,
        ru: (n: number) => `${n} ${ruPlural(n, 'месяц', 'месяца', 'месяцев')} назад`,
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
    deliveryBouncedRetry: { en: 'Try again', ru: 'Отправить ещё раз' },
    deliveryPending: { en: 'Sending…', ru: 'Отправляется…' },
    deliveryBouncedHelp: {
      en: "This didn't reach them — their mail server turned it away. That's often temporary (their server was busy or filtering), so trying again later usually works. If it keeps failing, check the address is right and reach them another way.",
      ru: 'Письмо не дошло — сервер получателя его отклонил. Часто это временно (сервер был занят или сработал фильтр), поэтому повторная отправка обычно срабатывает. Если не проходит снова — проверь адрес и свяжись другим способом.',
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
    duplicateConfirmTitle: {
      en: 'Send this again?',
      ru: 'Отправить ещё раз?',
    },
    duplicateConfirmBody: {
      en: 'You just sent this exact message to this person. Sending it again means they receive it twice — send anyway?',
      ru: 'Ты только что отправила это же сообщение этому человеку. Если отправить снова, он получит его дважды — всё равно отправить?',
    },
    duplicateConfirmButton: { en: 'Send anyway', ru: 'Всё равно отправить' },

    draftRefine: { en: 'Improve with assistant', ru: 'Доработать с ассистентом' },
    // The refine panel — opens beside the thread instead of navigating to the
    // Assistant tab, which used to throw away both the conversation context
    // and anything already typed.
    refinePanelTitle: { en: 'AI', ru: 'AI' },
    refineClose: { en: 'Close AI panel', ru: 'Закрыть панель AI' },
    // NOTE: refineCollapse / refineExpand were removed with the mobile bar the
    // panel used to roll down into. It reopened the panel, which the AI strip
    // at the top of the thread already does and always shows, so there were two
    // controls for one thing. The X closes the panel now.
    // One panel per conversation, cycling the three AI surfaces that used to
    // be scattered down the thread as separate cards.
    aiTabSummary: { en: 'Summary', ru: 'Сводка' },
    aiTabReply: { en: 'Reply', ru: 'Ответ' },
    aiTabAssistant: { en: 'Assistant', ru: 'Ассистент' },
    aiPanelOpen: { en: 'Open the AI panel', ru: 'Открыть панель AI' },
    aiNoDraft: {
      en: 'No draft right now. The AI steps back once payment or contract talk starts, so the serious replies are yours.',
      ru: 'Черновика пока нет. AI отходит в сторону, когда речь заходит об оплате или договоре: серьёзные ответы за тобой.',
    },
    draftGenerateCta: { en: 'Write a draft anyway', ru: 'Всё равно написать черновик' },
    useDraftTitle: { en: 'Send this reply?', ru: 'Отправить этот ответ?' },
    useDraftBody: {
      en: (name: string) => `It goes to ${name} right away, as Vero.`,
      ru: (name: string) => `Он сразу уйдёт ${name} от имени Веро.`,
    },
    useDraftSendNow: { en: 'Send now', ru: 'Отправить сейчас' },
    useDraftEditInstead: { en: 'Edit with assistant', ru: 'Доработать с ассистентом' },
    draftGenerating: { en: 'Writing…', ru: 'Пишу…' },
    draftGenerateFailed: { en: 'Could not write a draft', ru: 'Не удалось написать черновик' },
    aiDraftWaiting: { en: 'Draft ready', ru: 'Есть черновик' },
    // The only word the collapsed AI strip prints that is not data. It opens
    // the gap line: "needs event date, total price". Everything else on that
    // row comes from the thread itself, which is the point of the design, so
    // this stays a bare verb rather than growing into a heading.
    //
    // The Russian takes a colon and the English does not, on purpose. The gap
    // labels it prefixes are nominative ("дата съёмки"), and «не хватает»
    // governs the genitive, so running them straight on would be wrong in
    // every row. The colon turns the list into a list and the case stops
    // mattering.
    aiStripNeeds: { en: 'needs', ru: 'не хватает:' },
    // The gold counterpart: the client has answered everything and the
    // outstanding items are Vero's own, the price and the retainer typically.
    // Same colon reasoning as above.
    aiStripYourCall: { en: 'your call:', ru: 'за тобой:' },
    followUpBadge: { en: 'Follow up', ru: 'Напомнить' },
    railCollapse: { en: 'Collapse list', ru: 'Свернуть список' },
    railExpand: { en: 'Expand list', ru: 'Развернуть список' },
    draftDiscard: { en: 'Discard', ru: 'Удалить' },
    draftShow: { en: 'Show draft', ru: 'Показать черновик' },
    draftHide: { en: 'Hide draft', ru: 'Скрыть черновик' },
    draftDiscarded: { en: 'Draft discarded', ru: 'Черновик удалён' },

    // ── Promotional / unrelated threads ──────────────────────────
    markPromotional: { en: 'Hide as promotional', ru: 'Скрыть как рекламу' },
    unmarkPromotional: { en: 'Show in main inbox', ru: 'Вернуть в основной список' },
    markedPromotional: {
      en: 'Hidden — future emails from this sender are hidden too',
      ru: 'Скрыто — письма от этого отправителя тоже будут скрыты',
    },
    unmarkedPromotional: { en: 'Back in the main inbox', ru: 'Снова в основном списке' },

    showPromotional: {
      en: (n: number) => `Show ${n} promotional`,
      ru: (n: number) => `Показать рекламные (${n})`,
    },
    hidePromotional: { en: 'Hide promotional', ru: 'Скрыть рекламные' },

    // ── Personal (friends & family) ──────────────────────────────
    // Nothing classifies these automatically — Vero marks them by hand — so
    // the copy says "marked", not "detected".
    markPersonal: { en: 'Mark as personal', ru: 'Отметить как личное' },
    unmarkPersonal: { en: 'Move back to inbox', ru: 'Вернуть в основной список' },
    markedPersonal: {
      en: 'Moved to Personal — the assistant will not reply to this thread',
      ru: 'В личных — ассистент больше не отвечает в этой переписке',
    },
    unmarkedPersonal: { en: 'Back in the main inbox', ru: 'Снова в основном списке' },

    showPersonal: {
      en: (n: number) => `Show ${n} personal`,
      ru: (n: number) => `Показать личные (${n})`,
    },
    hidePersonal: { en: 'Hide personal', ru: 'Скрыть личные' },
    // The two menus the conversation header's action buttons collapsed into.
    // `moreActions` went with the single overflow menu they replaced: one menu
    // labelled "more" said nothing about what was inside it, and these two say
    // which half of the actions they hold.
    filingActions: { en: 'How this thread is filed', ru: 'Куда отнесён диалог' },
    dangerActions: { en: 'Delete or reset', ru: 'Удалить или сбросить' },

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
    summaryMissing: { en: 'Ask the client', ru: 'Спросить у клиента' },
    fullClientHeading: { en: 'Full client portal', ru: 'Полный клиентский портал' },
    fullClientBlurb: {
      en: 'Contract, signing and gallery. Opens the full form with everything this thread already told us filled in.',
      ru: 'Контракт, подпись и галерея. Откроется полная форма с уже заполненными данными из переписки.',
    },
    fullClientCta: { en: 'Open full form', ru: 'Открыть полную форму' },
    fullClientReady: { en: 'Ready to fill in', ru: 'Готово к заполнению' },
    fullClientYouAdd: {
      en: (items: string) => `You add: ${items}`,
      ru: (items: string) => `Добавишь сам(а): ${items}`,
    },
    // Short field names for the create-client card. Deliberately separate
    // from the form's own labels, which carry "(optional)" and "(USD)"
    // qualifiers that read as noise in a comma-joined list.
    pfSessionType: { en: 'session type', ru: 'тип съёмки' },
    pfEventDate: { en: 'date', ru: 'дата' },
    pfEventTime: { en: 'time', ru: 'время' },
    pfEventLocation: { en: 'location', ru: 'место' },
    pfClientName: { en: "client's name", ru: 'имя клиента' },
    pfPartnerName: { en: "partner's name", ru: 'имя партнёра' },
    pfClientEmail: { en: 'email', ru: 'email' },
    pfTotal: { en: 'total', ru: 'сумма' },
    pfRetainer: { en: 'retainer', ru: 'предоплата' },
    galleryOnlyHeading: { en: 'Gallery only', ru: 'Только галерея' },
    galleryOnlyBlurb: {
      en: 'No contract. Just a password-protected gallery you can upgrade later.',
      ru: 'Без контракта. Только галерея с паролем, её можно расширить позже.',
    },
    summaryDecide: { en: 'For you to set', ru: 'Назначить самой' },
    summaryNextStep: { en: 'Next step', ru: 'Далее' },
    summaryTone: { en: 'Tone', ru: 'Тон' },
    summaryLoading: { en: 'Reading the thread…', ru: 'Читаю переписку…' },
    summaryNone: { en: 'No summary yet.', ru: 'Сводки пока нет.' },
    // NOTE: summaryLangAria went with the summary's own RU|EN toggle. The
    // summary follows the global admin language now, so there is one language
    // control in the panel rather than two that could disagree.
    openSummary: { en: 'Open summary', ru: 'Открыть сводку' },
    closeSummaryOpenChat: { en: 'Close summary — open chat', ru: 'Закрыть сводку — открыть чат' },
    // Short pair for the desktop fold control, which sits beside a chevron.
    // closeSummaryOpenChat above is the mobile phrasing, where expanding the
    // summary genuinely replaces the chat.
    hideSummary: { en: 'Hide summary', ru: 'Скрыть сводку' },
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
    send: { en: 'Send', ru: 'Отправить' },
    translating: { en: 'Translating…', ru: 'Перевожу…' },
    // NOTE: `translateBeforeSending` (a switch in the composer) and
    // `translateAndSend` (the label it changed the send button to) are gone,
    // along with the ⌘/Ctrl + Enter hint that sat under them. The switch asked
    // its question permanently and in advance; the dialog below asks it only
    // when the two languages actually differ.
    // ── Reply is in a different language than the thread ─────────
    langMismatchTitle: { en: 'Send in their language?', ru: 'Отправить на их языке?' },
    // Takes both languages as codes rather than as ready-made words so each
    // locale can put them in the case its own sentence needs: Russian wants the
    // prepositional ("на английском"), English wants the plain name.
    langMismatchBody: {
      en: (theirs: 'en' | 'ru', yours: 'en' | 'ru') => {
        const name = (l: 'en' | 'ru') => (l === 'ru' ? 'Russian' : 'English');
        return `They write in ${name(theirs)}, and this reply is in ${name(yours)}.`;
      },
      ru: (theirs: 'en' | 'ru', yours: 'en' | 'ru') => {
        const name = (l: 'en' | 'ru') => (l === 'ru' ? 'русском' : 'английском');
        return `Они пишут на ${name(theirs)}, а ответ написан на ${name(yours)}.`;
      },
    },
    langMismatchTranslate: { en: 'Translate and send', ru: 'Перевести и отправить' },
    langMismatchSendAsIs: { en: 'Send as is', ru: 'Отправить как есть' },
    micRecordReply: { en: 'Record voice reply', ru: 'Записать голосовой ответ' },
    // Classification pills
    classification: {
      'booking-inquiry': { en: 'Booking inquiry', ru: 'Запрос на бронь' },
      'existing-client': { en: 'Existing client', ru: 'Постоянный клиент' },
      'general-question': { en: 'General question', ru: 'Общий вопрос' },
      'collaboration-offer': { en: 'Collab offer', ru: 'Предложение коллаба' },
      personal: { en: 'Personal / friend', ru: 'Личное / друзья' },
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
    /**
     * The phone-number suggestion in the AI panel's Summary tab.
     *
     * "Found in this thread" rather than anything about AI: the number is
     * read straight out of the message, and saying so is the reason to
     * trust it.
     */
    factsHeading: { en: 'What you told the assistant', ru: 'Что вы сообщили ассистенту' },
    factsNote: {
      en: 'Recorded against this conversation only, and used to fill in the New Client form. Edit anything there before creating the booking.',
      ru: 'Сохранено только для этой переписки и подставляется в форму нового клиента. Всё можно поправить там перед созданием брони.',
    },
    phoneSuggestHeading: { en: 'Found in this thread', ru: 'Найдено в переписке' },
    phoneSuggestBody: {
      en: 'No number on their record yet.',
      ru: 'В карточке клиента номера пока нет.',
    },
    phoneSuggestAdd: { en: 'Add to their account', ru: 'Добавить в карточку' },
    phoneSuggestDismiss: { en: 'Not their number', ru: 'Это не их номер' },
    phoneAdded: {
      en: (v: string) => `${v} saved to their account`,
      ru: (v: string) => `${v} сохранён в карточке`,
    },
    phoneAddFailed: { en: 'Could not save the number', ru: 'Не удалось сохранить номер' },
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
    // The conversation picker on the Chat sub-tab. Without it this chat
    // has no customer at all: the assistant only ever receives a
    // conversation_id from the Messages side panel, so on this tab it had
    // no name, no thread and no portal state, and drafted to
    // "[Client's Name]".
    conversationLabel: { en: 'Working on', ru: 'Работаем над' },
    conversationNone: { en: 'Nothing in particular', ru: 'Ничего конкретного' },
    conversationLoading: { en: 'Loading conversations…', ru: 'Загружаю переписки…' },
    conversationHint: {
      en: 'Pick a conversation and the assistant can read the thread, the portal status and the customer\'s name.',
      ru: 'Выбери переписку, и ассистент увидит всю ветку, статус портала и имя клиента.',
    },
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
    // ─── Bulk selection ───────────────────────────────
    // ─── Drafts waiting callout ───────────────────────
    draftsWaitingTitle: {
      en: (n: number) => (n === 1 ? '1 new photo waiting' : `${n} new photos waiting`),
      ru: (n: number) => `Новых фото ожидает: ${n}`,
    },
    draftsWaitingBody: {
      en: 'The sync added these from Drive with a generated title and description. They are not on the public site until you publish them.',
      ru: 'Синхронизация добавила их из Drive со сгенерированным названием и описанием. Они не появятся на сайте, пока вы их не опубликуете.',
    },
    draftsWaitingAction: { en: 'Review and publish', ru: 'Просмотреть и опубликовать' },

    bulkSelect: { en: 'Select', ru: 'Выбрать' },
    bulkCancel: { en: 'Cancel', ru: 'Отмена' },
    bulkSelectAll: { en: 'Select all shown', ru: 'Выбрать все показанные' },
    bulkClear: { en: 'Clear', ru: 'Снять выделение' },
    bulkSelected: {
      en: (n: number) => (n === 1 ? '1 selected' : `${n} selected`),
      ru: (n: number) => `Выбрано: ${n}`,
    },
    bulkPublish: { en: 'Publish', ru: 'Опубликовать' },
    bulkUnpublish: { en: 'Unpublish', ru: 'Снять с публикации' },
    bulkMoveTo: { en: 'Move to…', ru: 'Переместить в…' },
    bulkDelete: { en: 'Delete', ru: 'Удалить' },
    bulkWorking: { en: 'Working…', ru: 'Выполняется…' },
    bulkDone: {
      en: (n: number) => (n === 1 ? '1 photo updated' : `${n} photos updated`),
      ru: (n: number) => `Обновлено фото: ${n}`,
    },
    bulkSkipped: {
      en: (n: number) => ` (${n} skipped)`,
      ru: (n: number) => ` (пропущено: ${n})`,
    },
    bulkFailed: { en: 'That bulk action failed.', ru: 'Массовое действие не удалось.' },
    bulkDeleteTitle: {
      en: (n: number) => (n === 1 ? 'Delete 1 photo?' : `Delete ${n} photos?`),
      ru: (n: number) => `Удалить фото: ${n}?`,
    },
    // Says plainly that a photo still in Drive comes back on the next sync.
    // That is existing behaviour, and it is exactly the thing that looks like
    // a bug if nobody tells you.
    bulkDeleteBody: {
      en: 'They disappear from the public gallery straight away. Any of them still in the Drive folder will be restored by the next sync — remove the file from Drive too if you want it gone for good.',
      ru: 'Они сразу исчезнут из публичной галереи. Те, что остались в папке Drive, вернутся при следующей синхронизации — удалите файл и из Drive, если нужно навсегда.',
    },
    bulkDeleteConfirm: { en: 'Delete', ru: 'Удалить' },
    bulkSuperOnly: {
      en: 'Deleting photos requires super-admin access.',
      ru: 'Удаление фото доступно только супер-админу.',
    },
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

    // Shown when the form was opened from a conversation rather than the
    // Clients tab, so it is obvious where the values came from.
    // Short field names for the "from the conversation" panel. Separate from
    // the form's own labels, which carry "(optional)" and "(USD)" qualifiers
    // that read as noise in a dense two-column list.
    pfSessionType: { en: 'Session type', ru: 'Тип съёмки' },
    // The three per-type rows. Each appears only for the type whose contract
    // has a field for it, so a portrait booking is never shown a due date.
    // due_date and session_scope are required by their types, which is why
    // they belong here: without them the "still to fill" list under-reports
    // what is blank on exactly the two types that have an extra required
    // field, and that list exists to answer that one question.
    pfSessionScope: { en: 'What we are shooting', ru: 'Что снимаем' },
    pfDueDate: { en: 'Due date', ru: 'Дата родов' },
    pfWeddingDate: { en: 'Wedding date', ru: 'Дата свадьбы' },
    pfEventDate: { en: 'Date', ru: 'Дата' },
    pfEventTime: { en: 'Time', ru: 'Время' },
    pfEventLocation: { en: 'Location', ru: 'Место' },
    pfClientName: { en: 'Client', ru: 'Клиент' },
    pfPartnerName: { en: 'Partner', ru: 'Партнёр' },
    pfClientEmail: { en: 'Email', ru: 'Email' },
    pfTotal: { en: 'Total', ru: 'Сумма' },
    pfRetainer: { en: 'Retainer', ru: 'Предоплата' },
    peekSubtitle: { en: 'The conversation, read-only', ru: 'Переписка, только чтение' },
    peekEmpty: { en: 'No messages in this thread.', ru: 'В переписке нет сообщений.' },
    viewConversation: { en: 'View conversation', ru: 'Открыть переписку' },
    fromConversation: {
      en: (name: string) => `From your conversation with ${name}`,
      ru: (name: string) => `Из переписки с ${name}`,
    },
    stillToFill: { en: 'You still need to fill in', ru: 'Осталось заполнить' },
    createEmailsClient: {
      en: 'Creating the portal emails the client straight away.',
      ru: 'После создания портала клиенту сразу уйдёт письмо.',
    },
    galleryOnlyInstead: { en: 'Gallery only instead', ru: 'Только галерея' },
    discardTitle: { en: 'Leave without creating?', ru: 'Выйти без создания?' },
    discardBody: {
      en: 'This form will be cleared. Nothing has been created and no email has been sent.',
      ru: 'Форма будет очищена. Ничего не создано, письмо не отправлено.',
    },
    discardConfirm: { en: 'Leave', ru: 'Выйти' },
    prefilledFromThread: {
      en: (name: string) =>
        `Filled in from your conversation with ${name}. Check everything before you create the portal — creating it emails the client straight away.`,
      ru: (name: string) =>
        `Заполнено из переписки с ${name}. Проверь всё перед созданием портала: клиенту сразу уйдёт письмо.`,
    },

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

    // Session label. Only the "Other / Custom" contract type asks for one:
    // every other type files the portal under its own key, so there is no
    // second list of shoot types to disagree with the contract.
    sessionLabelLabel: { en: 'Session Label', ru: 'Название типа съёмки' },
    sessionLabelHelp: {
      en: 'Your own word for this kind of shoot, e.g. branding or newborn. It files the portal and builds the event title. It does not appear on the contract, which uses the description below.',
      ru: 'Твоё слово для такого типа съёмки, например branding или newborn. По нему портал сохраняется в списке и собирается название события. В контракт оно не попадает: там используется описание ниже.',
    },
    sessionLabelPlaceholder: { en: 'e.g. branding', ru: 'например, branding' },

    // Partners / client name. The second name field only exists on the two
    // types that name two people; everything else asks once.
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
    clientNameLabel: { en: 'Client Full Name', ru: 'Полное имя клиента' },
    clientNameHelp: {
      en: 'The full legal name that appears on the contract. The first name is used in the portal greeting.',
      ru: 'Полное имя, как в документах: оно печатается в контракте. Первое имя используется в приветствии в портале.',
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
    // Shown for the types that do not offer the half-day / full-day presets,
    // which are wedding packages. Those two buttons are not on screen there,
    // so the help text cannot go on describing them.
    coverageHelpSession: {
      en: 'Specific Times when the hours are known. Custom to describe it in words instead.',
      ru: '«Точное время», если часы уже известны. «Своё», если проще описать словами.',
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

    // The session-type picker that used to sit here is gone: the contract
    // type answers the same question, and the two could disagree. Only the
    // Other type still asks, via sessionLabel* above.

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
    /**
     * One entry per optional clause flag, keyed by the variable the checkbox
     * drives. Which of these a booking is offered comes from the contract
     * type's own spec (CONTRACT_TEMPLATES[key].optionalClauses), so a clause
     * added there without a translation here still renders: the form falls
     * back to the English label in OPTIONAL_CLAUSES.
     *
     * two_camera_enabled and additional_retouching_enabled carry over the
     * exact wording they had when they were the only two clauses in the form,
     * except for one long dash in the Russian retouching text, now a comma.
     */
    clauses: {
      two_camera_enabled: {
        label: {
          en: 'Two-camera coverage (lead + second camera operator)',
          ru: 'Съёмка на две камеры (основной фотограф + второй оператор)',
        },
        help: {
          en: "Adds a clause describing two-camera coverage for key moments, with the Second Camera Operator acting in an assistant capacity (not as an independent professional). Use this when you're working with an assistant covering supplemental angles.",
          ru: 'Добавит пункт про съёмку на две камеры в ключевые моменты: второй оператор выступает как ассистент, а не как независимый специалист. Ставь галочку, если с тобой работает ассистент, снимающий дополнительные ракурсы.',
        },
      },
      additional_retouching_enabled: {
        label: {
          en: 'Option for additional retouching after delivery',
          ru: 'Возможность дополнительной ретуши после сдачи',
        },
        help: {
          en: 'Adds a clause noting that the Client can request additional retouching (skin smoothing, advanced color, object removal, etc.) beyond the standard edits, with scope and price negotiated separately.',
          ru: 'Добавит пункт: клиент может заказать дополнительную ретушь (сглаживание кожи, продвинутая цветокоррекция, удаление объектов и т. п.) сверх стандартной обработки, объём и цену обсуждаете отдельно.',
        },
      },
      minors_clause_enabled: {
        label: {
          en: 'Photographing a minor',
          ru: 'Съёмка ребёнка',
        },
        help: {
          en: 'A parent or guardian signs on the child’s behalf, and images of children are not published anywhere without their separate written permission. On automatically for family bookings.',
          ru: 'Родитель или опекун подписывает контракт за ребёнка, а фотографии детей нигде не публикуются без отдельного письменного разрешения. Для семейных съёмок включается автоматически.',
        },
      },
      illness_clause_enabled: {
        label: {
          en: 'Illness',
          ru: 'Болезнь',
        },
        help: {
          en: 'Everyone should be fever-free for 24 hours beforehand, and the session is rescheduled at no cost if you are told in advance. On automatically for family bookings.',
          ru: 'За 24 часа до съёмки ни у кого не должно быть температуры, а если предупредили заранее, съёмка переносится без потери денег. Для семейных съёмок включается автоматически.',
        },
      },
      permits_clause_enabled: {
        label: {
          en: 'Permits and location access',
          ru: 'Разрешения и доступ на локацию',
        },
        help: {
          en: 'Entry fees and photography permits are the client’s to arrange, and time lost getting in counts toward the session. Useful for parks and private property. On automatically for engagement bookings.',
          ru: 'Плату за вход и разрешение на съёмку берёт на себя клиент, а время, потраченное на проход, входит в оплаченное время съёмки. Пригодится для парков и частной территории. Для love story включается автоматически.',
        },
      },
      // Never a checkbox on the create form: the maternity type forces it on
      // and OPTIONAL_CLAUSES has no entry for it. It is still read from here
      // by the client-detail screen, which lists a type's forced clauses
      // read-only, and a raw variable name on screen is worse than English.
      maternity_clauses_enabled: {
        label: {
          en: 'Maternity session guidelines',
          ru: 'Правила съёмки беременности',
        },
        help: {
          en: 'Prints the estimated due date, the 28 to 36 week window, and what happens if the baby arrives before the session. Always on for a maternity booking.',
          ru: 'Печатает предполагаемую дату родов, срок с 28 по 36 неделю и что будет, если малыш родится раньше съёмки. Для съёмки беременности включается автоматически.',
        },
      },
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
    // Same input, named for what it is on a solo booking.
    fieldLabelClientName: { en: 'Client name', ru: 'имя клиента' },
    fieldLabelClientEmail: { en: 'Client email', ru: 'email клиента' },
    fieldLabelEventDate: { en: 'Event date', ru: 'дата съёмки' },
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
    // ── Invite delivery ──────────────────────────────────────────
    inviteSending: { en: 'Sending invite…', ru: 'Отправляем приглашение…' },
    inviteDelivered: { en: 'Invite delivered', ru: 'Приглашение доставлено' },
    invitePending: {
      en: 'Sent, but not confirmed yet. It may still arrive.',
      ru: 'Отправлено, доставка не подтверждена. Возможно, ещё придёт.',
    },
    // Deliberately says nothing about whether the portal exists — see
    // inviteFailedPortalExists below. Claiming "the portal was created anyway"
    // unconditionally was wrong: Vero went back to the client list after a
    // bounce and the client was not there.
    inviteSendFailed: {
      en: 'The invite did not reach that address.',
      ru: 'Приглашение не дошло до этого адреса.',
    },
    inviteFailedPortalExists: {
      en: 'The portal itself was created — only the email failed. Retry, or continue and send the link another way.',
      ru: 'Портал создан — не отправилось только письмо. Повтори или продолжи и отправь ссылку иначе.',
    },
    inviteRetry: { en: 'Try sending again', ru: 'Отправить ещё раз' },
    inviteRetryNote: {
      en: 'This makes a new link — any earlier one stops working.',
      ru: 'Будет создана новая ссылка — старая перестанет работать.',
    },
    inviteGiveUp: {
      en: 'Still not sending. Message Alex — the portal exists, only the email failed.',
      ru: 'Всё ещё не отправляется. Напиши Алексу — портал создан, не ушло только письмо.',
    },
    inviteSkip: { en: 'Continue anyway', ru: 'Продолжить всё равно' },
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
    // The summary block at the top of a client record. Labels sit under 48px
    // circles, so each one has to survive noOfLines={1} at roughly 78px on a
    // 320px screen. Russian is the longer language and set the budget: every
    // label here is one short word in both.
    // Shown under the Total and Retainer boxes when what she typed is not a
    // number. Names an example rather than describing a format, because "1,200"
    // is the thing that used to fail and the thing she will type again.
    amountInvalid: {
      en: 'Enter an amount like 1200 or 1,200.',
      ru: 'Введи сумму, например 1200 или 1,200.',
    },
    // Another booking shares this date. Phrased as information, not a
    // warning: she books two on a day deliberately, and colouring it red
    // would train her to ignore it.
    alsoBookedThisDay: {
      en: (names: string) => `Also on this day: ${names}.`,
      ru: (names: string) => `В этот же день: ${names}.`,
      dynamic: true,
    },
    // Shown in the Payments section on a booking with no total, where the only
    // way to set one used to be a field in the last section of the screen.
    noTotalYetHelp: {
      en: 'No total on this booking yet. Set one here and payments start tracking against it.',
      ru: 'У этой съёмки ещё нет суммы. Укажи её здесь, и платежи начнут считаться от неё.',
    },
    // Where the shoot is. Separate from the contract's own event_location,
    // which is a term the client agreed to and is frozen once signed.
    sessionLocationLabel: { en: 'Session Address', ru: 'Адрес съёмки' },
    sessionLocationHelp: {
      en: 'Where she drives to, in the order the day runs. Add a second place for a ceremony and a reception, or a proposal and the portraits after it. Editing this does not change a signed contract.',
      ru: 'Куда ехать, в порядке дня. Добавьте второе место для церемонии и банкета или для предложения и съёмки после него. Изменение не затрагивает подписанный контракт.',
    },
    // One place or several. The label changes with the count so a single
    // location booking never reads as though something is missing.
    sessionLocationsLabel: { en: 'Session Addresses', ru: 'Адреса съёмки' },
    placeN: { en: (n: number) => `Place ${n}`, ru: (n: number) => `Место ${n}` },
    addPlace: { en: '+ Add another place', ru: '+ Добавить место' },
    removePlace: { en: 'Remove this place', ru: 'Удалить это место' },
    moveUp: { en: 'Move earlier', ru: 'Переместить выше' },
    moveDown: { en: 'Move later', ru: 'Переместить ниже' },
    openInMaps: { en: 'Open in Maps', ru: 'Открыть в картах' },
    placeLabelPlaceholder: { en: 'Ceremony, Reception, Proposal…', ru: 'Церемония, банкет, предложение…' },
    placeAddressPlaceholder: { en: 'Full street address', ru: 'Полный адрес' },
    placeStartPlaceholder: { en: 'Starts, e.g. 3:00 PM', ru: 'Начало, напр. 15:00' },
    placeEndPlaceholder: { en: 'Ends, e.g. 3:30 PM', ru: 'Конец, напр. 15:30' },
    // Full legal names. Not a greeting: these are what the contract binds and
    // what the client's welcome page shows them, so the help text says where
    // they surface rather than describing the field.
    partner1Label: { en: 'Full Legal Name', ru: 'Полное имя по документам' },
    partner2Label: { en: 'Partner Full Legal Name', ru: 'Полное имя партнёра' },
    partnerNameHelp: {
      en: 'Shown on the client welcome page and used in the contract. While the contract is unsigned, saving updates it.',
      ru: 'Показывается на странице приветствия клиента и используется в контракте. Пока контракт не подписан, сохранение обновит и его.',
    },
    partner2Help: {
      en: 'Leave empty for a solo booking. One person can sign for both.',
      ru: 'Оставь пустым, если клиент один. Подписать может один человек за обоих.',
    },
    clientPhoneLabel: { en: 'Phone', ru: 'Телефон' },
    clientPhoneHelp: {
      en: 'Optional. Tap to call from the top of this screen. Type it however you like.',
      ru: 'Необязательно. Позволяет позвонить одним нажатием сверху. Формат любой.',
    },
    // The booking was rescheduled after the contract was signed, so the signed
    // document still names the old date. Both dates are quoted, because "these
    // disagree" without saying which is which leaves her to guess.
    // The address on the contract, shown as text in the Contract card.
    contractAddressLabel: { en: 'Address on the contract', ru: 'Адрес в контракте' },
    // Only when it differs from the session address, which is the one the
    // Directions button uses and the one she will actually drive to.
    contractAddressDrift: {
      en: (sessionAddress: string) =>
        `Directions use the session address, ${sessionAddress}. Change it under Details if that is wrong.`,
      ru: (sessionAddress: string) =>
        `Маршрут строится по адресу съёмки: ${sessionAddress}. Если это неверно, измени его в разделе «Детали».`,
      dynamic: true,
    },
    contractDateDrift: {
      en: (contractDate: string, bookingDate: string) =>
        `The signed contract says ${contractDate}, but this booking is now ${bookingDate}. A signed contract cannot be rewritten, so send the client a note confirming the new date, or void this contract and issue a new one.`,
      ru: (contractDate: string, bookingDate: string) =>
        `В подписанном контракте указано ${contractDate}, а съёмка теперь ${bookingDate}. Подписанный контракт переписать нельзя: напиши клиенту и подтверди новую дату или аннулируй этот контракт и выпусти новый.`,
      dynamic: true,
    },
    // Shown in place of the Total and Retainer inputs once the contract is
    // signed. Says why, and says what to do instead, because "you cannot" with
    // no route forward just sends her looking for another way in.
    frozenBySignedContract: {
      en: 'Locked because the contract is signed. To change what is owed, add a charge in Payments above.',
      ru: 'Заблокировано, потому что контракт подписан. Чтобы изменить сумму к оплате, добавь начисление в разделе «Оплаты» выше.',
    },
    // Taking a delivery back, after delivering to the wrong client.
    undeliverLink: { en: 'Undo this delivery', ru: 'Отменить отправку' },
    undeliverTitle: {
      en: 'Take this delivery back?',
      ru: 'Отменить отправку галереи?',
    },
    undeliverBodyFull: {
      en: 'The photos stop being served immediately and the expiry countdown is cleared. Nothing is deleted, and the folder link, the password, the payments and the contract all stay exactly as they are.',
      ru: 'Фото сразу перестанут отдаваться, отсчёт срока хранения обнулится. Ничего не удаляется: ссылка на папку, пароль, платежи и контракт останутся как есть.',
    },
    // Gallery-only portals are not gated on the delivery stamp at all, so
    // saying "the photos are hidden" here would be false. Name the control
    // that actually hides them instead.
    undeliverBodySimple: {
      en: 'This clears the delivered date and the expiry. On a gallery-only booking the photos are NOT gated on that date, so they stay reachable: use Disable above to actually hide them.',
      ru: 'Это очистит дату отправки и срок хранения. В режиме «только галерея» фото не зависят от этой даты и останутся доступными: чтобы их действительно скрыть, нажми «Отключить» выше.',
    },
    undeliverEmailCaveat: {
      en: 'The photos-are-ready email cannot be recalled. If it already went out, the client has the link and may already have opened it.',
      ru: 'Письмо «фото готовы» отозвать нельзя. Если оно уже ушло, ссылка у клиента и он мог уже её открыть.',
    },
    undeliverConfirm: { en: 'Take it back', ru: 'Отменить отправку' },
    // Evidence that the photos-are-ready email actually went out.
    // "No record" rather than "not sent": a gallery delivered before this
    // column existed has no id either, and claiming those failed would be a
    // lie in the other direction.
    deliveryEmailNoRecord: {
      en: 'No record that the photos-are-ready email went out.',
      ru: 'Нет записи о том, что письмо «фото готовы» было отправлено.',
    },
    deliveryEmailNoAddress: {
      en: 'No email address on this booking, so nothing was sent.',
      ru: 'В этой съёмке нет адреса почты, поэтому письмо не отправлялось.',
    },
    deliveryEmailResend: {
      en: 'Send the photos-are-ready email again',
      ru: 'Отправить письмо «фото готовы» ещё раз',
    },
    // Extending a delivered gallery's expiry.
    extendGallery: { en: 'Extend the gallery', ru: 'Продлить галерею' },
    extendGalleryHelp: {
      en: (until: string) => `Currently online until ${until}. Extending adds to that date, so the client keeps the time they already have.`,
      ru: (until: string) => `Сейчас доступна до ${until}. Продление добавляется к этой дате, так что клиент не теряет уже имеющееся время.`,
      dynamic: true,
    },
    extendByMonths: {
      // Russian needs the noun to agree with the numeral: 1 месяц, 2-4 месяца,
      // 5+ месяцев. Only 1, 3 and 6 are offered, but the helper covers the
      // range so a fourth option later cannot quietly print "6 месяц".
      en: (n: number) => `+${n} ${n === 1 ? 'month' : 'months'}`,
      ru: (n: number) => {
        const m100 = n % 100;
        const m10 = n % 10;
        let w = 'месяцев';
        if (m100 < 11 || m100 > 14) {
          if (m10 === 1) w = 'месяц';
          else if (m10 >= 2 && m10 <= 4) w = 'месяца';
        }
        return `+${n} ${w}`;
      },
      dynamic: true,
    },
    summaryDirections: { en: 'Directions', ru: 'Маршрут' },
    summaryCall: { en: 'Call', ru: 'Позвонить' },
    summaryEmail: { en: 'Email', ru: 'Почта' },
    summaryGallery: { en: 'Gallery', ru: 'Галерея' },
    // Shown as a title on the disabled control, and in place of the address
    // row. Says what to do about it rather than only that it is absent.
    summaryNoAddress: { en: 'No address on this booking yet', ru: 'Адрес для этой съёмки пока не указан' },
    summaryNoPhone: { en: 'No number on file', ru: 'Телефон не указан' },
    summaryNoEmail: { en: 'No email on file', ru: 'Почта не указана' },
    summaryNoGallery: { en: 'No gallery folder yet', ru: 'Папка с галереей пока не добавлена' },
    summaryWhen: { en: 'When', ru: 'Когда' },
    summaryBalance: { en: 'Balance', ru: 'Остаток' },
    summaryGalleryState: { en: 'Gallery', ru: 'Галерея' },
    summaryNotSet: { en: 'Not set', ru: 'Не указано' },
    summaryNoTotal: { en: 'No total yet', ru: 'Сумма не указана' },
    summaryDelivered: { en: 'Delivered', ru: 'Отправлена' },
    summaryNotDelivered: { en: 'Not delivered', ru: 'Не отправлена' },
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
    // Named an "Open Folder" button that exists nowhere in the repository.
    // The only outbound link in this section is Preview Client Gallery, which
    // opens /portal/pass, not Drive. Point at the control that is actually
    // there. (The create-form copy above is a different, correct string.)
    driveUrlHelp: {
      en: 'Paste the share URL of the gallery folder. After saving, use Preview Client Gallery to check what the client sees.',
      ru: 'Вставь ссылку на общий доступ к папке с галереей. После сохранения нажми «Посмотреть глазами клиента», чтобы проверить, что видит клиент.',
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
    // Inline confirmation shown in place of the Mark as Delivered button
    // when there's still a balance. Was a window.confirm; it is a panel now
    // because delivering is what actually releases the photos to the client,
    // so the warning should sit on the screen rather than in a browser popup
    // that can be dismissed with a stray Enter. Dollar amounts arrive already
    // pre-formatted by the caller.
    outstandingHeading: {
      en: 'Balance still outstanding',
      ru: 'Остаток ещё не оплачен',
    },
    outstandingBody: {
      en: (remaining: string, paid: string, total: string) =>
        `${remaining} is still outstanding (paid ${paid} of ${total}). Delivering releases the photos to the client right away. Check the payment has arrived, or log it in Payments below first.`,
      ru: (remaining: string, paid: string, total: string) =>
        `Ещё не оплачено ${remaining} (оплачено ${paid} из ${total}). После отправки клиент сразу получит доступ к фотографиям. Убедись, что оплата пришла, или сначала запиши её в разделе «Оплаты» ниже.`,
    },
    deliverAnyway: { en: 'Deliver anyway', ru: 'Всё равно отправить' },

    // ─── Gallery Pass section ─────────────────────────
    passwordLabel: { en: 'Password', ru: 'Пароль' },
    passwordHelp: {
      en: 'The password guests use at /portal/pass to view photos. It is also the one-click link, so changing it breaks links already sent.',
      ru: 'Пароль, который гости вводят на /portal/pass, чтобы посмотреть фото. Он же встроен в ссылку, поэтому смена пароля ломает уже отправленные ссылки.',
    },
    // The two-step confirmation on the password box. Says what breaks, not
    // "are you sure": the password IS the /portal/pass identity, so saving a
    // new one invalidates the one-click link in every delivery email already
    // sent and every link a client forwarded on.
    passwordChangeTitle: {
      en: 'This breaks every link already sent',
      ru: 'Это сломает все уже отправленные ссылки',
    },
    passwordChangeBody: {
      en: 'The password is built into the one-click gallery link, so changing it turns off the link in the delivery email this client already has, and any link they forwarded to family. They will need the new one. This cannot be undone except by typing the old password back.',
      ru: 'Пароль встроен в ссылку на галерею, поэтому после смены перестанет работать ссылка из уже отправленного письма и все ссылки, которые клиент переслал близким. Им понадобится новая. Отменить это можно только вернув старый пароль.',
    },
    passwordChangeConfirm: {
      en: 'Change it anyway',
      ru: 'Всё равно сменить',
    },
    // Handing the gallery out again from the client record.
    shareHeading: { en: 'Share this gallery', ru: 'Поделиться галереей' },
    shareCopyLink: { en: 'Copy link', ru: 'Копировать ссылку' },
    shareCopyPassword: { en: 'Copy password', ru: 'Копировать пароль' },
    shareCopyMessage: { en: 'Copy message', ru: 'Копировать сообщение' },
    shareCopied: { en: 'Copied', ru: 'Скопировано' },
    shareCopyFailed: {
      en: 'Could not reach the clipboard. Select the link below and copy it by hand.',
      ru: 'Не удалось получить доступ к буферу обмена. Выдели ссылку ниже и скопируй вручную.',
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
    // Shown when the filing label and the contract template disagree. Both
    // values arrive already formatted: the stored label as it is written in
    // the column, the template under its English name from the registry.
    typeMismatchWarning: {
      en: (sessionType: string, contractType: string) =>
        `This client is filed under ${sessionType}, but the contract was written from the ${contractType} template. Pick the right one under Session Type in Client Details below and both are set together, which rewrites the contract to match.`,
      ru: (sessionType: string, contractType: string) =>
        `Клиент записан как ${sessionType}, но контракт собран по шаблону ${contractType}. Выбери нужный тип в поле «Тип съёмки» в разделе «Детали» ниже: оба значения меняются вместе, и контракт перепишется под выбранный.`,
    },
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

    // ─── Clause switches inside "Edit fields" ─────────
    // The per-clause label and help text come from t.newClient.clauses, so
    // both screens describe the same clause the same way. Only the wording
    // around that list lives here.
    contractClauses: { en: 'Contract clauses', ru: 'Пункты контракта' },
    contractClausesHint: {
      en: 'Each one adds a titled section to the contract. Saving rewrites the contract the client has not signed yet.',
      ru: 'Каждый добавляет в контракт отдельный раздел с заголовком. Сохранение перепишет контракт, который клиент ещё не подписал.',
    },
    // The booking type is CONTRACT_TEMPLATES[key].name, English by design,
    // so the Russian puts it in quotes rather than trying to decline it.
    clauseAlwaysOn: {
      en: (type: string) => `Always on for a ${type} booking.`,
      ru: (type: string) => `Для типа «${type}» включается всегда.`,
    },
    clauseStranded: {
      en: 'Left over from a type this booking used to be. Untick it to clear it out.',
      ru: 'Остался от типа, которым эта съёмка была раньше. Сними галочку, чтобы его убрать.',
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
    // A tip is money in that settles nothing, so it gets its own stat rather
    // than joining Paid. Shown only when there is one.
    statTips: { en: 'Tips', ru: 'Чаевые' },
    // The strip's chips. Short on purpose: they wrap to a second line rather
    // than truncate, and Russian runs about 2.4x longer than English.
    chipOwing: { en: (v: string) => `${v} left`, ru: (v: string) => `Осталось ${v}` },
    chipOverpaid: { en: (v: string) => `${v} overpaid`, ru: (v: string) => `Переплата ${v}` },
    chipSettled: { en: 'Paid up', ru: 'Оплачено' },
    chipContractSigned: { en: 'Contract signed', ru: 'Договор подписан' },
    chipContractUnsigned: { en: 'Contract unsigned', ru: 'Договор не подписан' },
    chipGalleryDelivered: { en: 'Gallery sent', ru: 'Галерея отправлена' },
    chipGalleryNotSent: { en: 'Gallery not sent', ru: 'Галерея не отправлена' },
    /**
     * The numbers behind the balance chip, on the strip itself.
     *
     * Labels rather than bare figures, because four sums in a row with no
     * words is a puzzle. They read left to right as the arithmetic this
     * system allows: total, plus charges, less paid, leaves the chip above.
     * Charges appear only when there are some, so the usual booking shows
     * three numbers and the sum still adds up.
     */
    stripTotal: { en: 'Total', ru: 'Итого' },
    stripCharges: { en: 'Charges', ru: 'Доплаты' },
    stripRetainer: { en: 'Retainer', ru: 'Предоплата' },
    stripPaid: { en: 'Paid', ru: 'Оплачено' },
    tipBadge: { en: 'Tip', ru: 'Чаевые' },
    tipNotInBalance: {
      en: 'Tips are not counted toward what this booking owes.',
      ru: 'Чаевые не учитываются в сумме к оплате по этой брони.',
    },
    settleDiscountTitle: { en: 'They paid directly', ru: 'Оплатили напрямую' },
    settleDiscountBody: {
      en: 'The amount left is the card fee they avoided. Waive it to settle this booking.',
      ru: 'Остаток равен комиссии за карту, которой удалось избежать. Списать его и закрыть бронь.',
    },
    settleDiscountAction: { en: 'Waive the card fee', ru: 'Списать комиссию' },
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

    // ─── Charges (extra time + costs paid on the day) ──
    // Owed on top of the contract total, the mirror image of a payment.
    // Every one of these lines is printed in the client's own portal, which
    // is why the note is guided and required rather than optional.
    statCharges: { en: 'Charges', ru: 'Доплаты' },
    addACharge: { en: 'Add a Charge', ru: 'Добавить доплату' },
    addAChargeHelp: {
      en: 'Extra time, or a cost you paid on the day. The client sees every line with its reason.',
      ru: 'Переработка или расход, который ты оплатила в день съёмки. Клиент видит каждую строку с причиной.',
    },
    reasonLabel: { en: 'Reason', ru: 'Причина' },
    reasonOvertime: { en: 'Extra time', ru: 'Переработка' },
    reasonExpense: { en: 'Expense', ru: 'Расход' },
    reasonOther: { en: 'Other', ru: 'Другое' },
    chargeNoteLabel: { en: 'Note', ru: 'Заметка' },
    // One example per reason, so there is always the right shape of answer
    // on screen instead of an empty box.
    chargeNotePlaceholder: {
      overtime: { en: '45 minutes over', ru: '45 минут сверх времени' },
      expense: { en: 'Parking at the venue', ru: 'Парковка на месте съёмки' },
      other: { en: 'What this is for', ru: 'За что эта доплата' },
    },
    chargeNoteHelp: {
      en: 'This is the line the client reads, so say what it was for.',
      ru: 'Эту строку читает клиент, поэтому напиши, за что доплата.',
    },
    chargeNoteRequired: {
      en: 'Add a short note, the client sees this line.',
      ru: 'Добавь короткую заметку, клиент увидит эту строку.',
    },
    addCharge: { en: 'Add Charge', ru: 'Добавить доплату' },
    chargesHistory: { en: 'Charge history', ru: 'История доплат' },
    deleteChargeAria: { en: 'Delete charge', ru: 'Удалить доплату' },

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
    // Both the read-only value on a signed row and the blank option the
    // select shows when the row has no type yet.
    typeNotSet: { en: 'Not set', ru: 'Не указан' },
    contractTypeLocked: {
      en: 'The contract type is locked once the contract is signed.',
      ru: 'После подписания контракта тип менять нельзя.',
    },
    // The free-text filing label beside the type. Same name the create form
    // gives the same box (t.newClient.sessionLabelLabel).
    sessionLabelLabel: { en: 'Session Label', ru: 'Название типа съёмки' },
    sessionLabelHelp: {
      en: 'Filing only. Shows on the Clients list, the calendar and the heading above.',
      ru: 'Просто метка для учёта. Видна в списке клиентов, в календаре и в заголовке выше.',
    },
    // Same box on a signed booking, where the one thing worth saying is that
    // renaming it does not reopen the document the client already signed.
    sessionLabelHelpSigned: {
      en: 'Filing only. Shows on the Clients list, the calendar and the heading above, and does not touch the signed contract.',
      ru: 'Просто метка для учёта. Видна в списке клиентов, в календаре и в заголовке выше, на подписанный контракт не влияет.',
    },
    // Example values, not words to translate: the column stores a lowercase
    // slug and both create screens write English ones.
    sessionLabelPlaceholder: { en: 'newborn, boudoir...', ru: 'newborn, boudoir...' },
    // Help under the type select. The first variant is for the one type that
    // also shows the label box, the second for every other type.
    sessionTypeHelpCustom: {
      en: 'Sets the contract type as well. The box beside it is your own word for the shoot, used for filing only: the Clients list, the calendar and the heading above. The client never reads it, they read "What is being photographed" in the contract.',
      ru: 'Заодно меняет тип контракта. Поле рядом, это твоё слово для съёмки, нужное только для учёта: список клиентов, календарь и заголовок выше. Клиент его не видит, он читает пункт «What is being photographed» в контракте.',
    },
    sessionTypeHelpStandard: {
      en: 'Sets the contract type as well. The contract is rewritten into the type you pick, so the client signs the right wording. Not possible once they have signed.',
      ru: 'Заодно меняет тип контракта. Контракт перепишется под выбранный тип, чтобы клиент подписал правильные формулировки. После подписания так сделать уже нельзя.',
    },
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
    inviteEmailState: {
      en: (state: string) => `Invite email: ${state}`,
      ru: (state: string) => `Письмо-приглашение: ${state}`,
    },
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

    // ─── Unsaved-work guard ───────────────────────────
    // Raised by Back when something on the screen has not been saved. The
    // wording names the fields rather than saying "unsaved changes" on its
    // own: the page is long, several sections collapse, and a warning she
    // cannot act on is a warning she learns to click through.
    // The header arrows. Reviewing several bookings before a weekend used to
    // mean a full round trip through the list for each one.
    prevClient: { en: 'Previous client', ru: 'Предыдущий клиент' },
    nextClient: { en: 'Next client', ru: 'Следующий клиент' },
    unsavedHeading: { en: 'Unsaved changes', ru: 'Несохранённые изменения' },
    // `fields` is a comma-joined list of the names below plus whatever field
    // labels are dirty, already translated by the caller.
    unsavedBody: {
      en: (fields: string) =>
        `Not saved yet: ${fields}. Leaving now throws it away.`,
      ru: (fields: string) =>
        `Ещё не сохранено: ${fields}. Если сейчас уйти, это пропадёт.`,
    },
    unsavedStay: { en: 'Stay on this page', ru: 'Остаться на странице' },
    unsavedLeave: { en: 'Discard and go back', ru: 'Выйти без сохранения' },
    // Names for the unsaved things that are not a single labelled box, so the
    // list reads as a sentence rather than as a set of internal field names.
    unsavedPaymentDraft: {
      en: 'the payment you were logging',
      ru: 'оплата, которую ты записывала',
    },
    unsavedChargeDraft: {
      en: 'the charge you were adding',
      ru: 'доплата, которую ты добавляла',
    },
    unsavedClientPassword: {
      en: 'the new client password',
      ru: 'новый пароль клиента',
    },
    unsavedContractFields: {
      en: (n: number) => `${n} contract field${n === 1 ? '' : 's'}`,
      ru: (n: number) => `${n} ${ruFieldWord(n)} контракта`,
    },

    // ─── Rewriting a pending contract ─────────────────
    // Second step on Save in the contract variable editor. The editor only
    // exists while the contract is pending, so nobody has signed what is about
    // to be replaced, but the client may well have read it, the save replaces
    // every variable at once and the body is rebuilt from the template, so it
    // is the one save on this screen with no way back.
    contractSaveConfirmHeading: {
      en: 'This rewrites the contract',
      ru: 'Контракт будет переписан',
    },
    contractSaveConfirmBody: {
      en: (n: number) =>
        `Saving writes all ${n} fields back and rebuilds the contract from the template. The client has not signed yet, and will read the new wording the next time they open their portal. This cannot be undone.`,
      ru: (n: number) =>
        `Сохранение перезапишет все ${n} ${ruFieldWord(n)} и соберёт контракт заново по шаблону. Клиент ещё не подписал и прочитает новый текст, когда в следующий раз откроет портал. Отменить это нельзя.`,
    },
    contractSaveConfirmCta: {
      en: 'Rewrite the contract',
      ru: 'Переписать контракт',
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
    sessionOptionArticle: { en: 'Article / Advice (blog post)', ru: 'Статья / советы (блог)' },

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

    // Series. Almost every post is standalone, so this whole block stays
    // collapsed to a single "no" until someone says otherwise.
    seriesLabel: { en: 'Part of a series', ru: 'Часть серии' },
    seriesHelp: {
      en: 'Use this when one story runs across two or more entries, like a courthouse ceremony and the wedding day that follows it. Readers get a link between the parts at the bottom of each one.',
      ru: 'Для случаев, когда одна история рассказана в двух или более записях: например, роспись и сама свадьба. Внизу каждой записи читатель увидит ссылку на остальные части.',
    },
    seriesNone: { en: 'No, this is a standalone post', ru: 'Нет, это отдельная запись' },
    seriesNew: { en: 'Start a new series...', ru: 'Создать новую серию...' },
    seriesNameLabel: { en: 'Series name', ru: 'Название серии' },
    seriesNameHelp: {
      en: 'Shown above the links, so write it the way a reader should see it. Keep the same wording on every part.',
      ru: 'Показывается над ссылками, поэтому пиши так, как это увидит читатель. На всех частях используй одну и ту же формулировку.',
    },
    seriesNamePlaceholder: {
      en: 'Nicole and Tucker, in two parts',
      ru: 'Николь и Такер, в двух частях',
    },
    seriesPartLabel: { en: 'Part number', ru: 'Номер части' },
    seriesPartHelp: {
      en: 'Which entry this is in the story. Leave blank if the order does not matter yet.',
      ru: 'Какая это часть истории. Оставь пустым, если порядок пока не важен.',
    },
    // Live preview of the marker that appears beside the date on the
    // post itself, so the wording is confirmed before saving.
    seriesPreviewPrefix: { en: 'Readers will see', ru: 'Читатель увидит' },
    // The trap this prevents: the link only renders once two parts are
    // PUBLISHED, so setting a series while the other half is still a
    // draft looks exactly like the setting failing to save.
    seriesNotYetVisible: {
      en: 'Nothing appears on the site yet. The link between the parts shows up once a second part is published.',
      ru: 'На сайте пока ничего не появится. Ссылка между частями возникнет, когда будет опубликована вторая часть.',
    },
    seriesMembers: { en: 'Already in this series', ru: 'Уже в этой серии' },
    seriesThisPost: { en: 'this post', ru: 'эта запись' },
    seriesDraftNote: { en: 'draft', ru: 'черновик' },
    seriesNoPart: { en: 'no part number', ru: 'без номера' },
    // Caught in the form rather than on save: the database rejects a
    // duplicate part, and a 409 after writing a whole post is a bad way
    // to find out.
    seriesPartTaken: {
      en: (title: string) => `Part number already used by "${title}". Pick another.`,
      ru: (title: string) => `Этот номер уже занят записью «${title}». Выбери другой.`,
    },
    seriesNeedsName: {
      en: 'Give the series a name, or set this back to a standalone post.',
      ru: 'Дай серии название или верни запись в состояние отдельной.',
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

  // Rebuild control. Lives in its own block rather than under `integrations`
  // because the button appears on the Journal screen too — Integrations is
  // super-only, and the person publishing journal posts is not a super admin.
  rebuild: {
    title: { en: 'Search engine pages', ru: 'Страницы для поисковиков' },
    subtitle: {
      en: 'New photos and journal entries appear on the site straight away. The separate pages search engines read are built when the site is published — rebuild after adding something so Google can find it.',
      ru: 'Новые фотографии и записи журнала появляются на сайте сразу. Отдельные страницы, которые читают поисковики, создаются при публикации сайта — пересоберите его после добавления материалов, чтобы Google их нашёл.',
    },
    action: { en: 'Rebuild site', ru: 'Пересобрать сайт' },
    actionShort: { en: 'Rebuild', ru: 'Пересобрать' },
    starting: { en: 'Starting…', ru: 'Запуск…' },
    started: {
      en: 'Build started. It takes about four minutes.',
      ru: 'Сборка запущена. Занимает около четырёх минут.',
    },
    cooldown: {
      en: (s: number) => `Already building. Try again in ${s}s.`,
      ru: (s: number) => `Сборка уже идёт. Повторите через ${s} с.`,
    },
    needsSetup: {
      en: 'No deploy hook is set up yet, so this cannot start a build. Ask Alex.',
      ru: 'Deploy Hook ещё не настроен, сборку запустить нельзя. Напишите Алексу.',
    },
    failed: { en: 'Could not start the build.', ru: 'Не удалось запустить сборку.' },
    checking: { en: 'Checking…', ru: 'Проверка…' },
    upToDate: {
      en: 'Everything is published — nothing waiting.',
      ru: 'Всё опубликовано — изменений нет.',
    },
    // Numeric rather than "3 new photos", so neither language needs plural
    // agreement for a count that can be any number or negative (a removal).
    waiting: {
      en: (photos: number, journal: number) =>
        `Waiting to publish — photos ${photos >= 0 ? '+' : ''}${photos} · journal ${journal >= 0 ? '+' : ''}${journal}`,
      ru: (photos: number, journal: number) =>
        `Ожидает публикации — фото ${photos >= 0 ? '+' : ''}${photos} · журнал ${journal >= 0 ? '+' : ''}${journal}`,
    },
    waitingEdits: {
      en: 'Edits are waiting to be published.',
      ru: 'Изменения ожидают публикации.',
    },
    nothingToDo: { en: 'Nothing to publish.', ru: 'Публиковать нечего.' },
  },

  integrations: {
    // ─── Config health ────────────────────────────────
    configTitle: { en: 'Configuration', ru: 'Конфигурация' },
    configSubtitle: {
      en: 'Environment variables this deployment reads, and what stops working when one is not set.',
      ru: 'Переменные окружения этого деплоя и что перестаёт работать, если какая-то не задана.',
    },
    configAllSet: { en: 'Nothing needs attention', ru: 'Всё в порядке' },
    configBroken: {
      en: (n: number) => (n === 1 ? '1 needs attention' : `${n} need attention`),
      ru: (n: number) => `${n} требует внимания`,
    },
    configCovered: {
      en: (n: number) => (n === 1 ? '1 unset, covered' : `${n} unset, covered`),
      ru: (n: number) => `${n} не задано, есть запасной вариант`,
    },
    configUsingFallback: { en: 'Using fallback', ru: 'Запасной вариант' },
    configNoFallback: { en: 'Nothing covers for this', ru: 'Ничего не подменяет' },
    configCoveredExplain: {
      en: 'Unset, but something else covers for it — this is fine and needs no action.',
      ru: 'Не задана, но есть замена — это нормально, ничего делать не нужно.',
    },
    configCritical: { en: 'Required', ru: 'Обязательно' },
    configFeature: { en: 'Feature', ru: 'Функция' },
    configOptional: { en: 'Optional', ru: 'Необязательно' },
    configSet: { en: 'Set', ru: 'Задана' },
    configNotSet: { en: 'Not set', ru: 'Не задана' },
    configShowAll: { en: 'Show all', ru: 'Показать все' },
    configShowProblems: { en: 'Show only problems', ru: 'Только проблемы' },
    configRefreshAria: { en: 'Recheck configuration', ru: 'Перепроверить конфигурацию' },
    configLoadFailed: { en: 'Could not load configuration.', ru: 'Не удалось загрузить конфигурацию.' },
    webhookTitle: { en: 'Stripe webhook', ru: 'Вебхук Stripe' },
    webhookOk: { en: 'All events subscribed', ru: 'Все события подключены' },
    webhookIncomplete: {
      en: (n: number) => (n === 1 ? '1 event missing' : `${n} events missing`),
      ru: (n: number) => (n === 1 ? 'Не хватает 1 события' : `Не хватает событий: ${n}`),
    },
    webhookNone: { en: 'No webhook points here yet', ru: 'Вебхук сюда ещё не настроен' },
    webhookUnknown: { en: 'Could not check', ru: 'Не удалось проверить' },
    webhookMissingHelp: {
      en: 'Add these in Stripe, Developers, Webhooks, then Save destination. Money can move without them and nothing will be recorded.',
      ru: 'Добавь их в Stripe: Developers, Webhooks, затем Save destination. Без них деньги проходят, а в журнале ничего не появляется.',
    },
    configEnvLabel: { en: 'Environment', ru: 'Окружение' },
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
    // Badge on a list row that belongs to a multi-part story. Digits, not
    // words: this is a list you scan, where "2" reads faster than "Two".
    // The post page spells it out instead, because there it is being read.
    seriesPartBadge: {
      en: (n: number) => `Part ${n}`,
      ru: (n: number) => `Часть ${n}`,
    },
    // A post in a series whose order is not set yet.
    seriesBadge: { en: 'In a series', ru: 'В серии' },
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

    // Card meta for the popup fields (migration 033). "фото" does not
    // decline, so RU needs no plural rules here.
    photoCount: {
      en: (n: number) => `${n} photo${n === 1 ? '' : 's'}`,
      ru: (n: number) => `${n} фото`,
    },
    linked: { en: 'Linked', ru: 'Есть ссылка' },
    // Shown on reviews still missing their link, so it is easy to see which
    // ones have no "Read it on Google" button on the site yet.
    noLink: { en: 'No link yet', ru: 'Нет ссылки' },

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
      en: 'Add a testimonial you got via Google, Instagram DMs, or email. Featured ones appear on the home page.',
      // Slightly re-shaped in RU so the "featured on home" idea reads
      // naturally as a second sentence.
      ru: 'Добавь отзыв, полученный в Google, Instagram-директе или по почте. Отмеченные «В избранном» появятся на главной.',
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
    // No rebuild needed for reviews: the homepage reads them live, through
    // a one-minute cache (api/reviews.ts).
    reviewSaved: {
      en: 'Review saved. The homepage shows it within a minute or two.',
      ru: 'Отзыв сохранён. На главной он появится в течение пары минут.',
    },
    reviewCreated: {
      en: 'Review added. The homepage shows it within a minute or two.',
      ru: 'Отзыв добавлен. На главной он появится в течение пары минут.',
    },

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

    // Link to the review where it was posted (migration 033). The public
    // popup turns it into a "Read it on Google" button.
    reviewUrlLabel: { en: 'Link to the review', ru: 'Ссылка на отзыв' },
    reviewUrlHelp: {
      en: 'On Google Maps, open the review, tap Share and copy the link. The popup on the site gets a button that opens it, so visitors can see it is real.',
      ru: 'В Google Maps открой отзыв, нажми «Поделиться» и скопируй ссылку. Во всплывающем окне на сайте появится кнопка, которая его открывает, чтобы посетители видели, что отзыв настоящий.',
    },
    reviewUrlButtonPreview: {
      en: (label: string) => `On the site, the button will read "${label}".`,
      ru: (label: string) => `На сайте кнопка будет называться «${label}».`,
    },
    urlNeedsHttps: {
      en: 'Paste the full link, starting with https://',
      ru: 'Вставь полную ссылку, начиная с https://',
    },

    // Photos the reviewer attached (migration 033), one link per row.
    photosLabel: { en: 'Photos for this review', ru: 'Фото к отзыву' },
    photosHelp: {
      en: 'Shown in the review popup under "From the session": the ones the client attached on Google, or originals from their session. One link per row. Google Drive share links work best.',
      ru: 'Показываются во всплывающем окне отзыва под заголовком «From the session»: фото, прикреплённые клиентом в Google, или оригиналы с его съёмки. По одной ссылке в строке. Лучше всего подходят ссылки на Google Drive.',
    },
    photoAria: {
      en: (n: number) => `Photo ${n} link`,
      ru: (n: number) => `Ссылка на фото ${n}`,
    },
    addPhoto: { en: 'Add photo', ru: 'Добавить фото' },
    removePhotoAria: {
      en: (n: number) => `Remove photo ${n}`,
      ru: (n: number) => `Убрать фото ${n}`,
    },
    photoLimit: {
      en: (max: number) => `That is the maximum of ${max} photos.`,
      ru: (max: number) => `Это максимум: ${max} фото.`,
    },
    driveRecognised: {
      en: 'Google Drive link recognised. Sharing must be set to "Anyone with the link", or it will not load on the site.',
      ru: 'Ссылка на Google Drive распознана. Доступ должен быть открыт «Всем, у кого есть ссылка», иначе на сайте фото не загрузится.',
    },
    driveNoId: {
      en: 'That looks like a Google Drive link, but it has no file id. Use the link from the Share button.',
      ru: 'Похоже на ссылку Google Drive, но в ней нет id файла. Возьми ссылку из кнопки «Поделиться».',
    },
    googlePhotoWarning: {
      en: 'This works for now, but Google can change or retire links like this at any time, and it breaks if the client removes the photo. A Google Drive link stays put.',
      ru: 'Сейчас это работает, но Google может в любой момент изменить или отключить такую ссылку, и она сломается, если клиент удалит фото. Ссылка на Google Drive надёжнее.',
    },
    photoBroken: {
      en: 'This link does not load as an image. Check that it opens a photo and, for Drive, that sharing is on.',
      ru: 'По этой ссылке не загружается изображение. Проверь, что она открывает фото, а для Drive, что доступ открыт.',
    },

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
    // api/reviews.ts serves only rows that are visible AND featured, so this
    // switch decides whether the review is on the home page at all.
    featuredHelp: {
      en: 'Only featured reviews appear on the home page.',
      ru: 'На главной показываются только отмеченные отзывы.',
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

  weddings: {
    tabTitle: { en: 'Weddings', ru: 'Свадьбы' },
    subtitle: {
      en: 'Photos, journal picks, and vendors for the weddings page.',
      ru: 'Фото, записи из дневника и подрядчики для страницы свадеб.',
    },
    refreshAria: { en: 'Refresh weddings content', ru: 'Обновить данные' },

    // Shared error shapes — same pattern as reviews/journal/gallery.
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

    // ── Card 1: Pinned photos ───────────────────────────────────
    // Five POSITIONAL slots that never reshuffle, each with a fixed
    // job on the page, plus the Drive folder feeding the background
    // tapestry (which DOES reshuffle).
    pinnedTitle: { en: 'Pinned photos', ru: 'Закреплённые фото' },
    pinnedIntro: {
      en: 'These photos are pinned: they never get shuffled with the rest. Each slot has one fixed job on the page. Paste a Google Drive file link or a direct https image link, then drag the preview to set the crop.',
      ru: 'Эти фото закреплены: они не перемешиваются вместе с остальными. У каждого слота своя фиксированная роль на странице. Вставь ссылку на файл в Google Drive или прямую https-ссылку, затем перетащи превью, чтобы настроить кадр.',
    },
    // Slot labels + one-line descriptions, POSITIONAL (index = slot).
    // Package names stay English: that is how the packages are named
    // on the public page.
    pinnedSlotLabels: {
      en: [
        'Package photo: Intimate Wedding',
        'Package photo: Wedding Day',
        'Package photo: Full Wedding Day',
        'FAQ photo',
        'Quote section background',
      ],
      ru: [
        'Фото пакета: Intimate Wedding',
        'Фото пакета: Wedding Day',
        'Фото пакета: Full Wedding Day',
        'Фото у блока вопросов',
        'Фон блока с цитатой',
      ],
    },
    pinnedSlotDescs: {
      en: [
        'Behind the Intimate Wedding pricing card.',
        'Behind the Wedding Day pricing card.',
        'Behind the Full Wedding Day pricing card.',
        'Sits beside the FAQ section.',
        'Wide band behind the closing quote. Pick a wide, horizontal photo.',
      ],
      ru: [
        'Фон карточки пакета Intimate Wedding.',
        'Фон карточки пакета Wedding Day.',
        'Фон карточки пакета Full Wedding Day.',
        'Стоит рядом с блоком вопросов и ответов.',
        'Широкая полоса за финальной цитатой. Выбери широкое горизонтальное фото.',
      ],
    },
    positionLabel: { en: 'Photo position', ru: 'Положение фото' },
    pinnedSaved: { en: 'Pinned photos saved', ru: 'Закреплённые фото сохранены' },
    folderLabel: { en: 'Drive folder', ru: 'Папка Drive' },
    folderHelp: {
      en: 'Photos from this folder form the background tapestry: a collage scattered across the page that reshuffles on every visit.',
      ru: 'Фото из этой папки образуют фоновое полотно: коллаж, рассыпанный по странице, он перемешивается при каждом заходе.',
    },

    // ── Card 2: From the Journal ────────────────────────────────
    journalTitle: { en: 'From the Journal', ru: 'Из дневника' },
    journalSubtitle: {
      en: 'Published posts featured on the weddings page, in this order.',
      ru: 'Опубликованные записи для страницы свадеб, в этом порядке.',
    },
    featuredCount: {
      en: (n: number, max: number) => `${n} / ${max}`,
      ru: (n: number, max: number) => `${n} / ${max}`,
    },
    featuredEmpty: {
      en: 'No posts featured yet. Add one from the list below.',
      ru: 'Пока ничего не выбрано. Добавь запись из списка ниже.',
    },
    // Shown when a featured slug no longer matches a published post
    // (post deleted or unpublished after being featured).
    unavailablePost: {
      en: (slug: string) => `Unavailable post (${slug})`,
      ru: (slug: string) => `Недоступная запись (${slug})`,
    },
    moveUpAria: { en: 'Move up', ru: 'Выше' },
    moveDownAria: { en: 'Move down', ru: 'Ниже' },
    removeAria: { en: 'Remove from featured', ru: 'Убрать из подборки' },
    addHeading: { en: 'Add a post', ru: 'Добавить запись' },
    addAria: { en: 'Add to featured', ru: 'Добавить в подборку' },
    maxReached: {
      en: 'Limit reached. Remove a post to add another.',
      ru: 'Лимит достигнут. Убери запись, чтобы добавить другую.',
    },
    noPublishedPosts: {
      en: 'No published journal posts yet. Publish one in the Journal tab first.',
      ru: 'Опубликованных записей пока нет. Сначала опубликуй запись во вкладке «Дневник».',
    },
    allPostsAdded: {
      en: 'Every published post is already featured.',
      ru: 'Все опубликованные записи уже в подборке.',
    },
    featuredSaved: { en: 'Featured posts saved', ru: 'Подборка сохранена' },

    // Focal-point drag editors for the journal slideshow — each
    // featured entry anchors its cover separately in the big stage
    // image and in the thumbnail strip, so crops stop cutting faces.
    focusHelp: {
      en: 'If a face gets cropped, open Adjust photo position and drag the previews. The large photo is the big slideshow image, the small photo is its thumbnail.',
      ru: 'Если лицо обрезается, открой «Настроить положение фото» и перетащи превью. Большое фото отвечает за крупный слайд, маленькое фото отвечает за его миниатюру.',
    },
    focusStageLabel: { en: 'Large photo', ru: 'Большое фото' },
    focusThumbLabel: { en: 'Small photo', ru: 'Маленькое фото' },
    adjustPosition: { en: 'Adjust photo position', ru: 'Настроить положение фото' },
    // Shared strings for the drag-to-focus editor (pinned, journal,
    // selected work). Reset clears both the position and the zoom.
    dragHint: {
      en: 'Drag the photo to choose what stays in view, and use the zoom slider to crop closer.',
      ru: 'Перетащи фото, чтобы выбрать, что останется в кадре, а ползунком приближения подрежь ближе.',
    },
    zoomLabel: { en: 'Zoom', ru: 'Приближение' },
    focusReset: { en: 'Reset', ru: 'Сбросить' },

    // ── Card 3: Selected work ───────────────────────────────────
    // Curates the clickable Selected Work mosaic — public wedding
    // gallery photos that link to /photo/weddings/<slug>. Distinct
    // from the hero/folder photos, which are non-clickable ambiance.
    selectedWorkTitle: { en: 'Selected work', ru: 'Избранные работы' },
    selectedWorkSubtitle: {
      en: 'Gallery photos in the clickable mosaic. Each one links to its photo page.',
      ru: 'Фото из галереи для кликабельной мозаики. Каждое ведёт на свою страницу.',
    },
    selectedCount: {
      en: (n: number, max: number) => `${n} / ${max}`,
      ru: (n: number, max: number) => `${n} / ${max}`,
    },
    // The mosaic gives every fifth tile a tall feature slot, so a
    // photo's crop depends on where it sits in this order.
    mosaicHelp: {
      en: 'The first photo and the sixth photo get the large tiles, the rest get small ones. Open Adjust photo position on any row to set what stays in view for its current place.',
      ru: 'Первое и шестое фото занимают большие плитки, остальные маленькие. Открой «Настроить положение фото» в любой строке, чтобы выбрать, что остаётся в кадре на текущем месте.',
    },
    mosaicLargeLabel: { en: 'Large tile', ru: 'Большая плитка' },
    mosaicSmallLabel: { en: 'Small tile', ru: 'Маленькая плитка' },
    selectedEmpty: {
      en: 'No photos selected yet. Add one from the list below.',
      ru: 'Пока ничего не выбрано. Добавь фото из списка ниже.',
    },
    // Shown when a selected slug no longer matches a published wedding
    // gallery photo (unpublished, recategorized, or deleted).
    unavailablePhoto: {
      en: (slug: string) => `Unavailable photo (${slug})`,
      ru: (slug: string) => `Недоступное фото (${slug})`,
    },
    removeFromSelectionAria: { en: 'Remove from selection', ru: 'Убрать из подборки' },
    addPhotoHeading: { en: 'Add a photo', ru: 'Добавить фото' },
    addPhotoAria: { en: 'Add to selection', ru: 'Добавить в подборку' },
    maxReachedPhotos: {
      en: 'Limit reached. Remove a photo to add another.',
      ru: 'Лимит достигнут. Убери фото, чтобы добавить другое.',
    },
    noGalleryPhotos: {
      en: 'No published wedding photos yet. Publish some in the Gallery tab first.',
      ru: 'Опубликованных свадебных фото пока нет. Сначала опубликуй их во вкладке «Галерея».',
    },
    allPhotosAdded: {
      en: 'Every wedding gallery photo is already selected.',
      ru: 'Все свадебные фото из галереи уже в подборке.',
    },
    selectedSaved: { en: 'Selected work saved', ru: 'Подборка работ сохранена' },

    // ── Shared searchable add-picker (journal + selected work) ──
    searchPlaceholder: { en: 'Search by title...', ru: 'Поиск по названию...' },
    noMatches: {
      en: (query: string) => `Nothing matches "${query}".`,
      ru: (query: string) => `По запросу «${query}» ничего не найдено.`,
    },
    pageOf: {
      en: (x: number, y: number) => `Page ${x} of ${y}`,
      ru: (x: number, y: number) => `Страница ${x} из ${y}`,
    },
    prevPageAria: { en: 'Previous page', ru: 'Предыдущая страница' },
    nextPageAria: { en: 'Next page', ru: 'Следующая страница' },

    // ── Card 4: Recommended vendors ─────────────────────────────
    vendorsTitle: { en: 'Recommended vendors', ru: 'Рекомендуемые подрядчики' },
    vendorsNote: {
      en: 'Vendors are listed for free as mutual promotion. The site shows them with a note that Vero is independent from them.',
      ru: 'Подрядчики размещаются бесплатно, в порядке взаимной рекомендации. На сайте рядом с ними стоит пометка, что Веро работает независимо от них.',
    },
    // Russian plural: 1 подрядчик, 2/3/4 подрядчика, 5+ подрядчиков
    // (teens 11-14 take gen.pl) — same shape as reviews.reviewCount.
    vendorCount: {
      en: (n: number) => `${n} vendor${n === 1 ? '' : 's'}`,
      ru: (n: number) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return `${n} подрядчик`;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} подрядчика`;
        return `${n} подрядчиков`;
      },
    },
    newVendor: { en: 'New Vendor', ru: 'Новый подрядчик' },
    newVendorShort: { en: 'New', ru: 'Новый' },
    hiddenBadge: { en: 'Hidden', ru: 'Скрыт' },
    activeLabel: { en: 'Active', ru: 'Активен' },
    deleteVendorAria: { en: 'Delete vendor', ru: 'Удалить подрядчика' },
    vendorsEmptyTitle: { en: 'No vendors yet', ru: 'Пока нет подрядчиков' },
    vendorsEmptyBody: {
      en: 'Add the DJs, florists, and planners you like working with. They appear on the weddings page.',
      ru: 'Добавь диджеев, флористов и организаторов, с которыми тебе нравится работать. Они появятся на странице свадеб.',
    },

    // Vendor editor modal
    editorNewTitle: { en: 'New Vendor', ru: 'Новый подрядчик' },
    editorEditTitle: { en: 'Edit Vendor', ru: 'Редактировать подрядчика' },
    nameLabel: { en: 'Name', ru: 'Название' },
    namePlaceholder: { en: 'e.g. Bloom Florals', ru: 'например, Bloom Florals' },
    categoryLabel: { en: 'Category', ru: 'Категория' },
    categoryPlaceholder: { en: 'DJ / Florist / Dresses', ru: 'DJ / Флорист / Платья' },
    blurbLabel: { en: 'Blurb', ru: 'Описание' },
    blurbPlaceholder: {
      en: 'A sentence or two on why you recommend them.',
      ru: 'Пара предложений о том, почему ты их рекомендуешь.',
    },
    websiteLabel: { en: 'Website', ru: 'Сайт' },
    instagramLabel: { en: 'Instagram', ru: 'Instagram' },
    photoLabel: { en: 'Photo URL', ru: 'Ссылка на фото' },
    photoHelp: {
      en: 'Optional. A logo or portrait shown next to the name.',
      ru: 'Необязательно. Логотип или портрет рядом с названием.',
    },
    sortOrderLabel: { en: 'Sort order', ru: 'Порядок' },
    sortOrderHelp: {
      en: 'Lower numbers show first.',
      ru: 'Чем меньше число, тем выше в списке.',
    },
    activeHelp: {
      en: 'When off, the vendor is hidden from the public site.',
      ru: 'Если выключено, подрядчик не показывается на сайте.',
    },
    requiredFields: {
      en: 'Name and category are both required.',
      ru: 'Название и категория обязательны.',
    },
    vendorSaved: { en: 'Vendor saved', ru: 'Подрядчик сохранён' },
    vendorCreated: { en: 'Vendor added', ru: 'Подрядчик добавлен' },
    vendorDeleted: { en: 'Vendor deleted', ru: 'Подрядчик удалён' },
    deleteConfirmTitle: { en: 'Delete this vendor?', ru: 'Удалить этого подрядчика?' },
    deleteConfirmBody: {
      en: (name: string) => `${name} will be permanently removed from the weddings page.`,
      ru: (name: string) => `${name} будет навсегда удалён со страницы свадеб.`,
    },
    deleteVendor: { en: 'Delete vendor', ru: 'Удалить подрядчика' },
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
    exportAria: { en: 'Export leads as CSV', ru: 'Экспорт лидов в CSV' },

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
    packageLabel: { en: 'Wedding package', ru: 'Свадебный пакет' },
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
    // Same column: the error when there is one, otherwise what the run did.
    historyOutcome: { en: 'Result', ru: 'Результат' },

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

  cronResult: {
    heading: { en: 'What it did', ru: 'Что сделано' },
    none: { en: 'This run recorded no details.', ru: 'Детали не записаны.' },
    // Friendly names for the keys gallery-sync and the other jobs return.
    // Anything not listed here is shown with its raw key, so a new cron does
    // not need this table updated before its numbers become visible.
    labels: {
      driveFilesSeen: { en: 'Files in Drive', ru: 'Файлов в Drive' },
      inserted: { en: 'Added', ru: 'Добавлено' },
      restored: { en: 'Restored', ru: 'Восстановлено' },
      softDeleted: { en: 'Removed', ru: 'Удалено' },
      refreshed: { en: 'Unchanged', ru: 'Без изменений' },
      remainingNewNextRun: { en: 'Queued for next run', ru: 'В очереди на след. запуск' },
      deployTriggered: { en: 'Redeploy triggered', ru: 'Пересборка запущена' },
      softDeleteBlocked: { en: 'Deletion blocked', ru: 'Удаление заблокировано' },
      checked: { en: 'Checked', ru: 'Проверено' },
      updated: { en: 'Updated', ru: 'Обновлено' },
      skipped: { en: 'Skipped', ru: 'Пропущено' },
      failed: { en: 'Failed', ru: 'Ошибок' },
      insertFailures: { en: 'Failed to add', ru: 'Не удалось добавить' },
      emailed: { en: 'Emailed', ru: 'Отправлено писем' },
    },
  },

  users: {
    // ─── Header ───────────────────────────────────────
    tabTitle: { en: 'Admin users', ru: 'Администраторы' },
    selfTabTitle: { en: 'Your account', ru: 'Ваш аккаунт' },
    selfSubtitle: {
      en: 'Your password and where you are signed in.',
      ru: 'Ваш пароль и активные устройства.',
    },
    subtitle: {
      en: 'Who can sign in to this panel, and what they can do.',
      ru: 'Кто может входить в панель и что может делать.',
    },
    // Russian plural: 1 аккаунт, 2/3/4 аккаунта, 5+ аккаунтов.
    userCount: {
      en: (n: number) => `${n} ${n === 1 ? 'account' : 'accounts'}`,
      ru: (n: number) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return `${n} аккаунт`;
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} аккаунта`;
        return `${n} аккаунтов`;
      },
    },
    refreshAria: { en: 'Refresh users', ru: 'Обновить список' },
    loadFailed: { en: 'Could not load admin users.', ru: 'Не удалось загрузить список.' },

    // ─── Level + status pills ─────────────────────────
    levelSuper: { en: 'Super', ru: 'Супер' },
    levelAdmin: { en: 'Admin', ru: 'Админ' },
    levelSuperHint: {
      en: 'Full access, including deleting clients and managing these accounts.',
      ru: 'Полный доступ, включая удаление клиентов и управление аккаунтами.',
    },
    levelAdminHint: {
      en: 'Can view and edit everything day-to-day, but cannot delete or manage accounts.',
      ru: 'Может просматривать и редактировать всё по работе, но не может удалять и управлять аккаунтами.',
    },
    disabled: { en: 'Disabled', ru: 'Отключён' },
    you: { en: 'You', ru: 'Вы' },
    signedInNow: {
      en: (n: number) => (n === 1 ? 'Signed in on 1 device' : `Signed in on ${n} devices`),
      ru: (n: number) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return `Вход с ${n} устройства`;
        return `Вход с ${n} устройств`;
      },
    },
    neverSignedIn: { en: 'Never signed in', ru: 'Ни разу не входил' },
    lastSignIn: { en: (when: string) => `Last sign-in ${when}`, ru: (when: string) => `Последний вход ${when}` },

    // ─── Enable / disable ─────────────────────────────
    disableAction: { en: 'Disable access', ru: 'Отключить доступ' },
    enableAction: { en: 'Enable access', ru: 'Включить доступ' },
    disableTitle: { en: 'Disable this account?', ru: 'Отключить аккаунт?' },
    disableBody: {
      en: (email: string) =>
        `${email} will be signed out everywhere immediately and will not be able to sign back in. ` +
        `Nothing they have done is deleted, and you can turn access back on at any time.`,
      ru: (email: string) =>
        `${email} будет немедленно разлогинен на всех устройствах и больше не сможет войти. ` +
        `Ничего из сделанного не удаляется, доступ можно вернуть в любой момент.`,
    },
    disableConfirm: { en: 'Disable access', ru: 'Отключить' },

    // ─── Delete ───────────────────────────────────────
    deleteAction: { en: 'Delete', ru: 'Удалить' },
    deleteTitle: { en: 'Delete this account?', ru: 'Удалить аккаунт?' },
    deleteBody: {
      en: (email: string) =>
        `${email} will be removed permanently, along with every session they have open. This cannot be undone. ` +
        `If you only want to take their access away for now, disable the account instead — that is reversible.`,
      ru: (email: string) =>
        `${email} будет удалён навсегда вместе со всеми активными сессиями. Это необратимо. ` +
        `Если нужно лишь временно закрыть доступ — отключите аккаунт, это обратимо.`,
    },
    deleteConfirm: { en: 'Delete permanently', ru: 'Удалить навсегда' },
    deletedToast: { en: 'Account deleted', ru: 'Аккаунт удалён' },
    // Why the two original accounts show no Delete button.
    envBackedHint: {
      en: 'Set up from an environment variable — can be disabled, but not deleted.',
      ru: 'Создан из переменной окружения — можно отключить, но не удалить.',
    },
    disabledToast: { en: 'Access disabled', ru: 'Доступ отключён' },
    enabledToast: { en: 'Access restored', ru: 'Доступ восстановлен' },

    // ─── Add a person ─────────────────────────────────
    addTitle: { en: 'Add someone', ru: 'Добавить человека' },
    addOpen: { en: 'Add someone', ru: 'Добавить' },
    emailLabel: { en: 'Email', ru: 'Эл. почта' },
    nameLabel: { en: 'Name', ru: 'Имя' },
    nameOptional: { en: 'optional', ru: 'необязательно' },
    levelLabel: { en: 'Access level', ru: 'Уровень доступа' },
    addSubmit: { en: 'Create account', ru: 'Создать аккаунт' },
    cancel: { en: 'Cancel', ru: 'Отмена' },
    addFailed: { en: 'Could not create that account.', ru: 'Не удалось создать аккаунт.' },

    // Shown once, after creation. There is no way to see it again, which is
    // the point — so the copy has to say so plainly.
    tempTitle: { en: 'Account created', ru: 'Аккаунт создан' },
    tempBody: {
      en: 'Give them this one-time password. It will not be shown again — if it gets lost, disable the account and make a new one.',
      ru: 'Передайте им этот одноразовый пароль. Он больше не будет показан — если потеряется, отключите аккаунт и создайте новый.',
    },
    tempCopy: { en: 'Copy password', ru: 'Скопировать пароль' },
    tempCopied: { en: 'Copied', ru: 'Скопировано' },
    tempDone: { en: 'Done', ru: 'Готово' },

    // ─── Your own password ────────────────────────────
    ownTitle: { en: 'Your password', ru: 'Ваш пароль' },
    ownBody: {
      en: 'Changing this signs you out on every other device.',
      ru: 'После смены вы выйдете из аккаунта на всех других устройствах.',
    },
    ownOpen: { en: 'Change password', ru: 'Сменить пароль' },
    currentLabel: { en: 'Current password', ru: 'Текущий пароль' },
    newLabel: { en: 'New password', ru: 'Новый пароль' },
    confirmLabel: { en: 'Repeat new password', ru: 'Повторите новый пароль' },
    tooShort: {
      en: 'Use at least 8 characters.',
      ru: 'Минимум 8 символов.',
    },
    mismatch: { en: 'Those two do not match.', ru: 'Пароли не совпадают.' },
    wrongCurrent: { en: 'Current password is incorrect.', ru: 'Текущий пароль неверен.' },
    ownSubmit: { en: 'Change password', ru: 'Сменить пароль' },
    ownDone: { en: 'Password changed', ru: 'Пароль изменён' },
    // Only reachable on an env-var login, which has no database row behind it.
    // ─── Other devices ────────────────────────────────
    othersTitle: { en: 'Other devices', ru: 'Другие устройства' },
    othersBody: {
      en: 'Signs you out everywhere except here. Your password stays the same.',
      ru: 'Выход из аккаунта на всех устройствах, кроме этого. Пароль не меняется.',
    },
    othersAction: { en: 'Sign out other devices', ru: 'Выйти на других устройствах' },
    othersNone: { en: 'No other devices are signed in.', ru: 'Других активных устройств нет.' },
    othersNoAccount: {
      en: 'This session is not tied to a database account, so there are no other sessions to end.',
      ru: 'Эта сессия не привязана к аккаунту в базе, других сессий нет.',
    },
    othersDone: {
      en: (n: number) => (n === 1 ? 'Signed out 1 other device' : `Signed out ${n} other devices`),
      ru: (n: number) => `Выполнен выход на ${n} устр.`,
    },

    // Recovery. The env-var branch in requireAdmin() is deliberately kept as
    // the way back in, so a forgotten database password is never a lockout.
    recoveryTitle: { en: 'If you forget your password', ru: 'Если забыли пароль' },
    // Shown to non-supers, who have no env-var password of their own.
    recoveryOther: {
      en: 'Ask a super-admin. They cannot read or set your password, so they will disable this account and create you a new one.',
      ru: 'Обратитесь к супер-админу. Он не может прочитать или задать ваш пароль, поэтому отключит этот аккаунт и создаст новый.',
    },
    recoveryBody: {
      en:
        'The passwords in the Vercel environment variables (SUPER_ADMIN_PASSWORD, ADMIN_PASSWORD) keep working as a way back in, ' +
        'even after you change your password here. Sign in with one of those, then change your password on this screen — ' +
        'enter that same environment-variable password as your current password.',
      ru:
        'Пароли из переменных окружения Vercel (SUPER_ADMIN_PASSWORD, ADMIN_PASSWORD) продолжают работать как запасной вход, ' +
        'даже после смены пароля здесь. Войдите с одним из них и смените пароль на этом экране — ' +
        'в поле «текущий пароль» введите тот же пароль из переменной окружения.',
    },
    ownNoAccount: {
      en: 'This session is not tied to a database account, so there is no password to change here.',
      ru: 'Эта сессия не привязана к аккаунту в базе, менять пароль здесь нечего.',
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
