/**
 * Text typed but not yet sent, kept across reloads and navigation.
 *
 * Persisting the refine panel's OPEN state without persisting what she had
 * typed into it was worse than useless: the panel came back empty, so the
 * thing she was in the middle of writing was gone and the container that lost
 * it was still on screen. Both composers now park their text here.
 *
 * Scoped per conversation, so switching threads and coming back restores that
 * thread's text rather than bleeding one customer's half-written reply into
 * another's.
 */

const PREFIX = 'vero_draft:';

/** A week. Long enough to survive a weekend, short enough not to accumulate. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Cap on a single stored body. localStorage is a shared per-origin quota, and
 * a pasted wall of text large enough to exhaust it would start breaking the
 * other keys in here (the refine session, the language) rather than failing on
 * its own. A reply that does not fit is not worth taking the panel down for.
 */
const MAX_BODY = 32_000;

export type DraftComposer = 'reply' | 'assistant';

export function draftKey(composer: DraftComposer, conversationId: string): string {
  return `${PREFIX}${composer}:${conversationId}`;
}

interface StoredDraft {
  /** Written-at timestamp, so stale entries can be swept. */
  t: number;
  v: string;
}

export function loadDraft(composer: DraftComposer, conversationId: string): string {
  if (typeof window === 'undefined' || !conversationId) return '';
  try {
    const raw = window.localStorage.getItem(draftKey(composer, conversationId));
    if (!raw) return '';
    const parsed = JSON.parse(raw) as StoredDraft;
    if (typeof parsed?.v !== 'string') return '';
    if (typeof parsed.t === 'number' && Date.now() - parsed.t > MAX_AGE_MS) {
      window.localStorage.removeItem(draftKey(composer, conversationId));
      return '';
    }
    return parsed.v;
  } catch {
    // Private mode, quota, or a corrupt value. An empty composer is the same
    // as today's behaviour, so there is nothing to recover from.
    return '';
  }
}

export function saveDraft(composer: DraftComposer, conversationId: string, value: string): void {
  if (typeof window === 'undefined' || !conversationId) return;
  try {
    const key = draftKey(composer, conversationId);
    // An empty composer is the absence of a draft, not a draft of "".
    if (!value.trim()) {
      window.localStorage.removeItem(key);
      return;
    }
    if (value.length > MAX_BODY) return;
    window.localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value } satisfies StoredDraft));
  } catch {
    /* quota or private mode: the text still lives in React state for this view */
  }
}

export function clearDraft(composer: DraftComposer, conversationId: string): void {
  if (typeof window === 'undefined' || !conversationId) return;
  try {
    window.localStorage.removeItem(draftKey(composer, conversationId));
  } catch {
    /* ignore */
  }
}

/**
 * Drop expired drafts. Cheap, and it keeps deleted conversations from leaving
 * entries behind forever, since nothing else would ever clean those up.
 */
export function sweepDrafts(): void {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) || '{}') as StoredDraft;
        if (typeof parsed?.t !== 'number' || now - parsed.t > MAX_AGE_MS) doomed.push(key);
      } catch {
        doomed.push(key);
      }
    }
    doomed.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

/**
 * Remove every stored draft. Called on sign-out: this is customer reply text
 * sitting in localStorage, and admin is shared with Vero on her own devices.
 */
export function clearAllDrafts(): void {
  if (typeof window === 'undefined') return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(PREFIX)) doomed.push(key);
    }
    doomed.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
