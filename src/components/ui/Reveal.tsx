import { m, useInView, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode, RefObject } from 'react';
import type { Easing, MotionStyle } from 'framer-motion';
import { prefersReducedMotion } from '../../utils/motion';

/**
 * The one scroll reveal for the whole site.
 *
 * It replaces the hand rolled copies of
 *
 *     const ref = useRef(null);
 *     const isInView = useInView(ref, { once: true, amount: 0.3 });
 *     <m.div initial={{ opacity: 0, y: 20 }}
 *            animate={isInView ? { opacity: 1, y: 0 } : {}}
 *            transition={{ duration: 0.7, ease: 'easeOut' }}>
 *
 * that had spread across nearly every page. Each copy carried the same two
 * faults, and both of them have already cost this project a real outage or a
 * page that rendered blank.
 *
 * FAULT ONE: INVISIBLE AND STILL TAPPABLE.
 *
 * `opacity: 0` paints nothing but it does not take an element out of hit
 * testing, so for the first frames of every one of those fades a full width
 * block of live controls sat on the page with nothing drawn on it. The sweep
 * that followed the CTAButton outage caught two of them mid fade: the Google
 * review link on the home page and the Contact CTA at the bottom of the
 * wedding page. A per-frame scan of the build this component replaced found
 * far more than two. Ten on `/`, fifteen on `/contact` (the name and email
 * inputs), dozens on `/portal` (the password box among them, which is where
 * the outage this all came from was reported), sixteen on `/admin`, and eight
 * on the 404 where both buttons are invisible and live on arrival. The window
 * is short, a frame or two of a 0.6 to 0.8s fade, so on its own each one is a
 * curiosity.
 *
 * What makes it worth a component is the PERMANENT version of the same state.
 * `useInView` with a fractional `amount` measures the visible slice against
 * THE TARGET'S OWN height, so when the target is a whole page body and the
 * screen is short, the fraction is more than the viewport can ever show at
 * once, the observer never fires, and the content stays at `opacity: 0`
 * forever while remaining perfectly hit testable. That is the blank contact
 * page in Chrome on iOS, and it is why Contact.tsx grew a timed fallback of
 * its own. The same measurement on a 390x200 viewport found `/gallery`
 * stranded exactly that way: the four category cards at opacity 0, for good,
 * with their links still answering taps. Invisible content that still reacts
 * is the worst of both, because the visitor sees nothing and the page moves.
 *
 * So the gate below is driven by the element's OWN live opacity rather than by
 * the in-view boolean. It is correct at every point of the fade and, more to
 * the point, it is correct for reasons nobody anticipated: whatever leaves
 * this thing at opacity 0, it cannot take a tap while it is there.
 *
 * FAULT TWO: WRITING `pointer-events: auto` TO TURN IT BACK ON.
 *
 * The obvious other half of the gate is `pointer-events: auto` once visible,
 * and that is the exact line this component comes out of. `pointer-events`
 * INHERITS. An explicit `auto` does not restore the default, it overrides any
 * ancestor that had deliberately switched itself off with `none` and
 * re-enables the whole subtree inside it. CTAButton set it on every enabled
 * button, the closed mobile menu is a full screen transparent overlay that
 * turns itself off that way, and the result was an invisible 126x48 link to
 * /contact parked in the middle of every phone screen on every route,
 * swallowing taps and sitting on top of the portal's Sign In button and a
 * gallery card as well.
 *
 * The visible value here is therefore the EMPTY STRING, which clears the
 * inline declaration and lets the property inherit again. Never `auto`.
 *
 * PRIOR ART, DELIBERATELY COPIED. HeroSection already gates its header, its
 * footer and its scroll cue this way, with a `useTransform` off the same
 * motion value that drives their opacity (see `headerTaps` / `footerTaps` /
 * `nextCueTaps`). That was the second instance found during the CTAButton
 * sweep, and this generalises it rather than inventing anything.
 */

/**
 * Below this the element is not drawing anything a visitor could aim at.
 *
 * Lower than HeroSection's 0.2 on purpose. There the gated things are part of
 * a scroll-linked cinematic that is genuinely not "there" at a fifth opacity.
 * A content reveal at 0.15 is faint but legible, and a visitor who can see a
 * button has every right to press it, so the line is drawn where there is
 * nothing to see at all. It is also the threshold the verification suite uses
 * for "invisible", so the code and its test agree by construction.
 */
const VISIBLE_OPACITY = 0.05;

/**
 * How long a reveal may sit at the edge of the viewport without its own
 * observer firing before it is shown anyway. 700ms, the number Contact.tsx
 * already used for exactly this; see useRevealSignal for why the clock starts
 * where it does rather than at mount.
 */
const REVEAL_FALLBACK_MS = 700;

/**
 * Passed as `onUpdate` on every instance, and it has to be there.
 *
 * framer-motion 10 hands plain opacity and transform animations to the Web
 * Animations API, which runs them off the main thread. Look at
 * `animation/interfaces/motion-value.mjs` in the installed package: the
 * accelerated path is taken unless `value.owner.getProps().onUpdate` is set,
 * and `animators/waapi/create-accelerated-animation.mjs` only ever calls
 * `value.set()` from its `onfinish` handler. A MotionValue bound to an
 * accelerated animation therefore reads as its STARTING value for the whole
 * fade and then snaps to the end, which would leave the gate below correct at
 * the two endpoints and blind everywhere between them, with nothing to fall
 * back on if that final `onfinish` never arrives. An `onUpdate` prop, even an
 * empty one, opts this element back into the JS animator, whose per frame
 * `value.set(v)` is what the gate follows.
 *
 * Module level so the identity is stable and no instance re-reads props for
 * it. The cost is that these short fades run on the main thread, which is the
 * price of the gate being right in the middle of the transition rather than
 * only at its ends.
 */
const KEEP_ON_MAIN_THREAD = () => {};

export type RevealAmount = 'some' | 'all' | number;

/** The resting state is always opacity 1 / y 0 / scale 1, so only the start is named. */
export type RevealFrom = {
  opacity?: number;
  y?: number | string;
  scale?: number;
};

/**
 * The in-view signal, with the safety net that stops a reveal stranding its
 * content invisible for good.
 *
 * Two observers, deliberately:
 *
 *   inView    the call site's own `amount`. This is what drives the timing, so
 *             every migrated animation still fires exactly where it used to.
 *
 *   anyPixel  amount 'some'. It fires the moment one pixel of the target is on
 *             screen, which no viewport height can make unreachable.
 *
 * The fallback clock is started by `anyPixel`, NOT by mount. Contact.tsx set a
 * flat 700ms timer from mount, which is right for the one reveal it had (the
 * whole page body, always touching the viewport on arrival) and wrong for
 * every other call site: a reveal at the bottom of the wedding page would have
 * quietly played itself 700ms after load, off screen, and scrolling down to it
 * later would have found it already over. Starting the clock when the element
 * actually reaches the viewport keeps Contact's behaviour identical and keeps
 * every scroll reveal intact.
 *
 * In ordinary use it never pays out at all. Scrolling carries an element from
 * its first pixel to any fraction of itself in far less than 700ms, so
 * `inView` wins the race and the timer is cleared. It only fires in the case
 * it exists for, where `amount` is a fraction the viewport cannot satisfy and
 * `inView` would otherwise never fire however far you scrolled.
 */
function useRevealSignal(ref: RefObject<Element>, amount: RevealAmount, fallbackMs: number) {
  const inView = useInView(ref, { once: true, amount });
  const anyPixel = useInView(ref, { once: true, amount: 'some' });
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (inView || fallback || !anyPixel) return;
    const t = window.setTimeout(() => setFallback(true), fallbackMs);
    return () => window.clearTimeout(t);
  }, [inView, fallback, anyPixel, fallbackMs]);

  return inView || fallback;
}

/**
 * For the call sites where ONE observer drives SEVERAL reveals that have to
 * arrive together: the four gallery category cards behind a single ref, the
 * two halves of an About section, the wedding intro. Giving each of those its
 * own observer would stagger them as they scrolled past individually, which is
 * a different animation from the one that shipped.
 *
 * It also keeps the observer on the SAME element it used to watch. Several
 * call sites hang the ref on a wrapping Box or Flex rather than on the fading
 * div, and with a fractional `amount` the element being measured decides when
 * the fade starts, so moving the ref inwards would quietly retime it.
 *
 * Attach `ref` to whatever element the observer should watch and hand `shown`
 * to each <Reveal> underneath it.
 */
export function useReveal({
  amount = 'some',
  fallbackMs = REVEAL_FALLBACK_MS,
}: { amount?: RevealAmount; fallbackMs?: number } = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRevealSignal(ref, amount, fallbackMs);
  return { ref, shown };
}

type RevealProps = {
  children: ReactNode;
  /**
   * Where the animation starts. The default is the shape most of the site
   * already used. Anything that differs says so at the call site, because
   * these distances and durations were chosen per section and flattening them
   * onto one value would be a redesign rather than a refactor.
   */
  from?: RevealFrom;
  duration?: number;
  delay?: number;
  ease?: Easing;
  /** Passed straight to useInView. Ignored when `shown` or `immediate` is set. */
  amount?: RevealAmount;
  /**
   * No observer at all: play on mount. For the wedding page hero, which fades
   * in on arrival rather than on scroll. It shares the pointer-events gate for
   * the same reason everything else does, since a mount fade is every bit as
   * invisible and tappable while it runs.
   */
  immediate?: boolean;
  /** Driven from a useReveal() above. Leave unset to let this element observe itself. */
  shown?: boolean;
  fallbackMs?: number;
  style?: CSSProperties;
};

const Reveal = ({
  children,
  from = { opacity: 0, y: 20 },
  duration = 0.8,
  delay = 0,
  ease = 'easeOut',
  amount = 'some',
  immediate = false,
  shown,
  fallbackMs = REVEAL_FALLBACK_MS,
  style,
}: RevealProps) => {
  // Read once per instance rather than on every render: matchMedia is a real
  // DOM call and the answer does not change under us mid page. The helper is
  // guarded for the no-window case, so the prerender pass sees `false` and
  // renders the same markup it always did.
  const [reduced] = useState(prefersReducedMotion);

  const selfRef = useRef<HTMLDivElement>(null);
  // Only attached when this element does its own observing. Left detached,
  // useInView sees a null ref and never creates an observer at all, so the
  // controlled and immediate forms cost nothing.
  const observing = shown === undefined && !immediate;
  const signal = useRevealSignal(selfRef, amount, fallbackMs);
  const isShown = immediate || (shown !== undefined ? shown : signal);

  const startOpacity = from.opacity;
  // ONE motion value, created once and bound in `style` for the life of the
  // element. The `animate` prop below drives this very value, which is what
  // makes the gate track the real fade frame by frame instead of flipping at
  // the endpoints. Swapping a different motion value in later does not rebind
  // (the lightbox learned that the hard way with a drifting `style.y`), so
  // nothing here is allowed to be conditional on a prop that can change.
  const opacity = useMotionValue(reduced ? 1 : startOpacity ?? 1);
  // The empty string, never 'auto'. See the note at the top of the file.
  const pointerEvents = useTransform(opacity, (o) => (o < VISIBLE_OPACITY ? 'none' : ''));

  // Belt and braces, and the only reason it is here is that the failure it
  // guards against is worse than the one this component fixes. A gate stuck on
  // 'none' over content that has faded in leaves a button visible, obviously
  // pressable and completely dead, which is the original outage with the sign
  // flipped. Once the animation has had its full duration plus a margin, the
  // resting opacity is 1 by definition, so if the value is still short of it
  // something upstream dropped the animation and the gate is told to open.
  // In normal running this never does anything: the JS animator has already
  // set the value to exactly 1 well before the timer fires.
  useEffect(() => {
    if (!isShown || startOpacity === undefined || reduced) return;
    const t = window.setTimeout(
      () => {
        if (opacity.get() < 1) opacity.set(1);
      },
      (duration + delay) * 1000 + 250,
    );
    return () => window.clearTimeout(t);
  }, [isShown, startOpacity, reduced, duration, delay, opacity]);

  // The resting state, derived from whatever `from` named, so a call site that
  // only fades does not also acquire a transform it never had.
  const to: Record<string, number | string> = {};
  if (startOpacity !== undefined) to.opacity = 1;
  // A percentage has to come back to a percentage. Animating '115%' to a bare
  // 0 mixes units and framer resolves the target as pixels, which lands a
  // masked line 115% of its own height away from where it belongs.
  if (from.y !== undefined) to.y = typeof from.y === 'string' ? '0%' : 0;
  if (from.scale !== undefined) to.scale = 1;

  const motionStyle: MotionStyle = { ...(style as MotionStyle), opacity, pointerEvents };

  return (
    <m.div
      // The suite that guards this component needs to tell a scroll reveal
      // apart from the other things on the page that legitimately sit at
      // opacity 0, above all HeroSection's scroll-linked header and footer,
      // which are supposed to be invisible at the top of the home page and
      // would otherwise read as stranded content.
      data-reveal=""
      ref={observing ? selfRef : undefined}
      // See KEEP_ON_MAIN_THREAD: without it framer runs this fade through
      // WAAPI, the motion value never moves until the animation finishes, and
      // the gate above is blind for the whole transition.
      onUpdate={KEEP_ON_MAIN_THREAD}
      // A visitor who asked for reduced motion gets the finished state and no
      // travel: `initial={false}` tells framer to render at the resting values
      // rather than playing in from `from`, and the duration below is zero.
      initial={reduced ? false : from}
      animate={isShown ? to : {}}
      transition={reduced ? { duration: 0 } : { duration, delay, ease }}
      style={motionStyle}
    >
      {children}
    </m.div>
  );
};

export default Reveal;
