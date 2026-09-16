/**
 * Does this visitor ask for reduced motion?
 *
 * Every programmatic scroll on the site should consult this before choosing
 * `behavior: 'smooth'`. The contact prototype did so at each of its three
 * scroll sites and the React port dropped it at all three, which is why this
 * lives in one place rather than being re-inlined per page.
 *
 * Guarded for SSR and for the prerender pass, where there is no `window`, and
 * for the odd environment that has `window` but no `matchMedia`.
 */
export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** `behavior` for a programmatic scroll, honouring the preference above. */
export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? 'auto' : 'smooth');
