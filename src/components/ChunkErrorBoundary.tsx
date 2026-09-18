import React from 'react';
import { Box, Heading, Text, VStack, Button, Link } from '@chakra-ui/react';
import { ensureAnalytics } from '../utils/analytics';

/**
 * Safety net for lazily-loaded routes.
 *
 * Once App.tsx splits routes with React.lazy, a route's chunk is a separate
 * network request made *after* the app is already running. Two things can make
 * that request fail:
 *
 *   1. A deploy landed while the tab was open. The old index.html references
 *      hashed chunks that no longer exist, so the fetch 404s.
 *   2. The connection dropped mid-navigation.
 *
 * Without a boundary, either one throws during render and React 18 unmounts
 * the entire tree — a white screen. Before this existed there was no
 * ErrorBoundary anywhere in src/, so any such throw took the whole site down.
 *
 * The recovery path is deliberately conservative:
 *   - Never reload while offline (the reload would fail too).
 *   - Never reload twice within 30s (a reload loop is worse than an error).
 *   - Never reload automatically once the user has state worth losing; the
 *     boundary offers a button instead and always shows a way to reach
 *     Veronika, because a client stuck mid-contract needs an escape hatch.
 */

const RELOAD_KEY = 'chunkReloadAt';
const RELOAD_COOLDOWN_MS = 30_000;
/**
 * Cache buster appended to the URL when recovering.
 *
 * Stripped again on the next successful boot, so it never lingers in a URL a
 * client might copy or share.
 */
const FRESH_PARAM = 'fresh';

/**
 * Reload in a way a stale cache cannot satisfy.
 *
 * `location.reload()` re-requests the SAME url, and a browser holding a cached
 * index.html is entitled to answer from that cache. It then hands back the
 * very same dead chunk urls, the boundary trips again, and the 30 second
 * cooldown blocks the next attempt: the page is stuck until someone knows to
 * hard reload. That is what a client hit on a phone, where iOS is especially
 * willing to serve a document from memory without revalidating, while the same
 * deploy looked fine on a desktop that happened to have a fresher copy.
 *
 * Changing the url is the one thing no cache can answer from, so recovery
 * actually recovers. `replace` rather than `assign`, so Back does not walk
 * into the broken page again.
 */
function reloadFresh(): void {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set(FRESH_PARAM, String(Date.now()));
    window.location.replace(url.toString());
  } catch {
    // A url we cannot parse is not worth failing over; the plain reload is
    // still better than nothing.
    window.location.reload();
  }
}

/**
 * Take the cache buster back out of the address bar.
 *
 * Called once the app has booted, which by definition means the fresh document
 * arrived. Uses replaceState so it costs no history entry, and leaves every
 * other query parameter alone: `/portal/pass?password=...` has to survive this
 * untouched, since that link IS the client's way in.
 */
export function clearFreshParam(): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(FRESH_PARAM)) return;
    url.searchParams.delete(FRESH_PARAM);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // Cosmetic only.
  }
}

/** True when this looks like a missing/failed JS chunk rather than a code bug. */
export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return (
    /Loading chunk|ChunkLoadError|Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically imported module/i.test(
      msg,
    )
  );
}

// Speculative prefetches (warming a route the user has NOT navigated to) must
// never trigger a reload. A failed background fetch is harmless; reloading
// because of one would discard whatever the visitor was typing — the Contact
// form warms ThankYou while someone is mid-message.
let speculativeDepth = 0;

/** Run a background import() that can fail silently without triggering recovery. */
export function prefetchChunk(load: () => Promise<unknown>): void {
  speculativeDepth++;
  void Promise.resolve()
    .then(load)
    .catch(() => {
      /* a warm-up miss is not an error worth surfacing */
    })
    .finally(() => {
      speculativeDepth--;
    });
}

export const isSpeculativeLoad = () => speculativeDepth > 0;

/** Reload once to pick up the new deploy, with loop and offline guards. */
export function attemptChunkRecovery(): boolean {
  if (typeof window === 'undefined') return false;
  if (!navigator.onLine) return false;
  if (isSpeculativeLoad()) return false;
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
  } catch {
    // Private-mode Safari can throw on sessionStorage; treat as never-reloaded.
  }
  if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Non-fatal — worst case we lose loop protection for this tab.
  }
  reloadFresh();
  return true;
}

type Props = { children: React.ReactNode };
type State = { error: Error | null };

class ChunkErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Always put the real thing in the console. The UI below deliberately
    // stays calm for a client mid-contract, but a swallowed stack means the
    // only evidence of a genuine bug is a screenshot of reassuring copy.
    console.error('[ChunkErrorBoundary]', error, info?.componentStack);
    // Surface it in analytics so this shows up in a report instead of only in
    // a frustrated text message. gtag is deferred site-wide, so it usually
    // does NOT exist yet at the moment a chunk fails — boot it first or this
    // telemetry is silently dropped in exactly the window it matters.
    ensureAnalytics();
    if (typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      (window as any).gtag('event', 'chunk_load_error', {
        event_category: 'Error',
        event_label: error.message?.slice(0, 120) ?? 'unknown',
      });
    }
    if (isChunkLoadError(error)) attemptChunkRecovery();
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" px={6}>
        <VStack spacing={5} maxW="440px" textAlign="center">
          <Heading as="h1" size="lg" fontWeight="light">
            Something went wrong
          </Heading>
          {/* Two different failures wearing one message is how a real bug
              spent an evening being mistaken for a stale tab. A missing chunk
              genuinely is fixed by reloading; a code bug is not, and saying
              so sends the operator round in circles. */}
          <Text color="gray.600">
            {isChunkLoadError(this.state.error)
              ? "This page didn't finish loading. Reloading usually fixes it: the site may have been updated while you had this open."
              : 'Something in the page failed to run. Reloading may get you moving again, but this one is a bug and worth reporting.'}
          </Text>
          {!isChunkLoadError(this.state.error) && (
            <Text
              fontFamily="mono"
              fontSize="xs"
              color="gray.500"
              bg="gray.50"
              borderRadius="sm"
              px={3}
              py={2}
              maxW="100%"
              overflowX="auto"
            >
              {this.state.error.message || String(this.state.error)}
            </Text>
          )}
          <Button onClick={reloadFresh} colorScheme="blackAlpha" bg="black">
            Reload the page
          </Button>
          <Text fontSize="sm" color="gray.500">
            Still stuck? Reach Veronika at{' '}
            <Link href="tel:+15709095707" textDecoration="underline">
              (570) 909-5707
            </Link>{' '}
            or{' '}
            <Link href="https://wa.me/15709095707" isExternal textDecoration="underline">
              WhatsApp
            </Link>
            .
          </Text>
        </VStack>
      </Box>
    );
  }
}

export default ChunkErrorBoundary;
