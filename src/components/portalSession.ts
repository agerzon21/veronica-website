/**
 * Moved out of Portal.tsx on 2026-10-15 so the welcome page can sign a client
 * in the moment they choose their password. Until then it sent them to the
 * sign-in form to type the same password again, and a client who took "You're
 * all set" at its word never came back to sign or pay.
 */

/**
 * The portal session, kept for the length of the browser tab.
 *
 * Until now the credentials lived in React state and nowhere else, so ANY
 * reload signed the client out. That was mostly invisible, until it was not:
 * the chunk error boundary reloads the page by design when a lazily loaded
 * route fails, which on a phone with a flaky connection happens when you tap a
 * photo and the lightbox chunk does not arrive. The client was then dumped at
 * the login form mid gallery with no explanation, which is what was reported
 * as "it randomly logs me out".
 *
 * sessionStorage rather than localStorage on purpose: it is scoped to this tab
 * and dies when the tab closes, so a shared or borrowed phone does not keep a
 * client signed in. It does mean the portal password sits in tab storage for
 * the length of the visit. That is a real trade off, and the right one here:
 * every call this page makes already re-sends the same credential, the gallery
 * password is by design a bearer token in a shareable link, and anything able
 * to read sessionStorage on this origin could read the page itself anyway.
 */
export const SESSION_KEY = 'vg:portalSession';

export type StoredSession =
  // portalId: which of the account's sessions is open (api/portal/_account.ts).
  // Absent on the "Your sessions" page, and for every one-session client.
  | { kind: 'client'; email: string; password: string; portalId?: string }
  | { kind: 'gallery'; password: string };

export function storeSession(session: StoredSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Private mode can throw. The visit still works, it just will not
    // survive a reload, which is exactly the old behaviour.
  }
}

export function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed?.kind === 'client' && parsed.email && parsed.password) return parsed;
    if (parsed?.kind === 'gallery' && parsed.password) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function clearStoredSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to do */
  }
}
