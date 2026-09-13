import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export type BackTarget = { to: string; label: string };

/**
 * "Back" that returns you to where you actually came from.
 *
 * Every back control on the site used to hardcode its destination — the
 * wedding gallery always went to /gallery, a photo always went to its
 * category — so arriving from the weddings page and pressing Back dropped you
 * somewhere you had never been.
 *
 * The rule here is: if there is an entry behind us that WE pushed, go back to
 * it. React Router's history writes `{ usr, key, idx }` into history.state,
 * and `idx` is this entry's position in the session's stack, so `idx > 0`
 * means the previous entry belongs to this site and `navigate(-1)` is safe.
 * A visitor who landed here cold from Google or a shared link has `idx === 0`
 * and gets the fallback route instead of being thrown out to wherever they
 * came from.
 *
 * Going back rather than pushing a new entry also means the scroll position of
 * the page being returned to is restored (see ScrollToTop in App.tsx), which
 * pushing a fresh entry to the same URL would not do.
 *
 * A caller that knows better can still pass explicit router state —
 * `<Link state={{ back: { to, label } }}>` — and that wins for the LABEL.
 * The navigation itself stays a real back step whenever one exists.
 */
export function useSmartBack(fallback: BackTarget) {
  const navigate = useNavigate();
  const location = useLocation();
  const explicit = (location.state as { back?: BackTarget } | null)?.back;

  const goBack = useCallback(() => navigate(-1), [navigate]);

  // Guarded for the prerender pass, which has no window.
  const idx =
    typeof window === 'undefined'
      ? undefined
      : (window.history.state as { idx?: number } | null)?.idx;
  const canGoBack = typeof idx === 'number' && idx > 0;

  const to = explicit?.to ?? fallback.to;

  // One shape for both cases, so call sites stay a plain button and do not
  // have to switch element types on a value they cannot know at compile time.
  // `to` comes back as well, for anything that wants it for a title or href.
  if (canGoBack) {
    // The label is the caller's best guess at where back leads, and it is
    // usually right — a post's parent really is the journal. Falling back to a
    // bare "Back" here threw away good copy for no gain.
    return { label: explicit?.label ?? fallback.label, onClick: goBack, to };
  }

  return {
    label: explicit?.label ?? fallback.label,
    onClick: () => navigate(to),
    to,
  };
}
