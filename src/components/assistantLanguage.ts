/**
 * The assistant's chat language, shared by the Assistant tab and the refine
 * panel in Messages.
 *
 * Lives in its own module rather than in AdminAssistant.tsx because exporting
 * a non-component from a component file breaks React Fast Refresh for that
 * file — and duplicating the storage key in the second consumer is exactly how
 * two places quietly drift onto different preferences.
 */
export type ChatLanguage = 'ru' | 'en';

const LANG_STORAGE_KEY = 'vero_assistant_lang';

/** Russian by default — Vero's language. English is opt-in and remembered. */
export function loadInitialLanguage(): ChatLanguage {
  if (typeof window === 'undefined') return 'ru';
  const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
  return stored === 'en' ? 'en' : 'ru';
}

export function saveLanguage(lang: ChatLanguage): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LANG_STORAGE_KEY, lang);
}
