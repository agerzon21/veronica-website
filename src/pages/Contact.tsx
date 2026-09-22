import { Box, Flex, Grid, GridItem, Image, Input, Text, Textarea } from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import CTAButton from '../components/ui/CTAButton';
import PageHeader from '../components/ui/PageHeader';
import { prefetchChunk } from '../components/ChunkErrorBoundary';
import ContactRail, { SectionHead } from '../components/ContactRail';
import Reveal from '../components/ui/Reveal';
import weddingData from '../data/wedding-page.json';
import { scrollBehavior } from '../utils/motion';

/**
 * The three wedding packages, by name. The weddings page links each card to
 * /contact?package=<name>, and the value is matched against this list so a
 * crafted URL cannot inject text. Coverage and price are read from the same
 * file the weddings page renders, so what the plate quotes is what they saw.
 *
 * The server re-resolves all of this from the name at submit time; nothing
 * priced is ever taken from the browser.
 */
const PACKAGES = weddingData.packages as Array<{
  name: string;
  price: string;
  coverage: string;
}>;

/**
 * Used only when someone arrives on a cold link or refreshes: the weddings
 * page hands the real photograph over in history state, which does not survive
 * either. Any wedding photograph reads correctly here, so this is one slug
 * rather than a second copy of that page's curated list.
 */
const FALLBACK_PHOTO = '/assets/photos/weddings/loving-wedding-embrace-bw.webp';

const SHOOT_TYPES = [
  { value: 'Wedding Photography', label: 'Wedding' },
  { value: 'Portrait Session', label: 'Portrait' },
  { value: 'Family Session', label: 'Family' },
  { value: 'Maternity Session', label: 'Maternity' },
  { value: 'Other', label: 'Other' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The field frame: the focus brackets and the green tick.
 *
 * MODULE SCOPE ON PURPOSE. Declared inside Contact this would be a new
 * component type on every render, so React would unmount and remount the input
 * inside it and the field would lose focus on each keystroke.
 *
 * The brackets are four 12px corners, two drawn on this box and two on an inner
 * one, because a single element has only ::before and ::after. They sit 7px
 * outside the control, clear of the label 12px above it, and slide in on
 * :focus-within. It is the same treatment as the homepage CTA, and the form
 * lost its visual link to the rest of the site without it.
 */
const BRACKET = {
  content: '""',
  position: 'absolute',
  width: '12px',
  height: '12px',
  border: '0 solid',
  borderColor: '#c9a96e',
  pointerEvents: 'none',
  opacity: 0,
  transition: 'opacity 0.18s ease, transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
} as const;

const FieldWrap = ({
  state,
  tick = false,
  children,
}: {
  state: FieldState;
  tick?: boolean;
  children: React.ReactNode;
}) => (
  <Box
    position="relative"
    sx={{
      '&::before': {
        ...BRACKET, top: '-7px', left: '-7px',
        borderTopWidth: '1.5px', borderLeftWidth: '1.5px', transform: 'translate(-5px, -5px)',
      },
      '&::after': {
        ...BRACKET, top: '-7px', right: '-7px',
        borderTopWidth: '1.5px', borderRightWidth: '1.5px', transform: 'translate(5px, -5px)',
      },
      '&:focus-within::before, &:focus-within::after': { opacity: 1, transform: 'none' },
      '&:focus-within .fw-br::before, &:focus-within .fw-br::after': { opacity: 1, transform: 'none' },
    }}
  >
    {children}
    <Box
      className="fw-br"
      position="absolute"
      inset={0}
      pointerEvents="none"
      aria-hidden="true"
      sx={{
        '&::before': {
          ...BRACKET, bottom: '-7px', left: '-7px',
          borderBottomWidth: '1.5px', borderLeftWidth: '1.5px', transform: 'translate(-5px, 5px)',
        },
        '&::after': {
          ...BRACKET, bottom: '-7px', right: '-7px',
          borderBottomWidth: '1.5px', borderRightWidth: '1.5px', transform: 'translate(5px, 5px)',
        },
      }}
    />
    {/* The date control deliberately has no tick: its own calendar mark already
        sits in that corner, and the prototype gives it none either. */}
    {tick && (
      <Box
        as="svg"
        viewBox="0 0 16 16"
        aria-hidden="true"
        position="absolute"
        right="14px"
        top="16px"
        w="16px"
        h="16px"
        color="brand.success"
        pointerEvents="none"
        opacity={state === 'valid' ? 1 : 0}
        transform={state === 'valid' ? 'none' : 'scale(0.6)'}
        transition="opacity 0.2s, transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)"
      >
        <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </Box>
    )}
  </Box>
);

const GREETING = (name: string) => `We're interested in the ${name} package.`;
const PROMPT_LINE = 'Our plans so far: ';
const BLANKS = `\n\n${PROMPT_LINE}`;
const prefillFor = (name: string) => GREETING(name) + BLANKS;

/**
 * Finds OUR opening sentence so it can be swapped or removed without touching
 * anything the visitor wrote. Three properties, each learned from a real bug:
 *
 *   m       so it still matches when they have typed ABOVE our line. Anchored
 *           to line one, Remove silently did nothing and the package stayed.
 *   stem    so a visitor's own line ending in "package." is not mistaken for
 *           ours, deleted on Remove and overwritten on a swap.
 *   lazy    so it stops at the FIRST "package.", ours. Greedy, it ran on to
 *           the last one and swallowed a sentence they wrote after it.
 *
 * The trailing whitespace is captured rather than discarded so a following
 * word keeps the space that separated it.
 */
const GREETING_LINE = /^[^\n]*?\binterested in the[^\n]*?\bpackage\.([ \t]*\n?)/m;

// Date and location are VALIDATED but not REQUIRED: filling one in turns it
// green, leaving it empty is fine. Keeping the two ideas apart matters, because
// the submit button now names the first REQUIRED field still empty, and folding
// the optional pair into the same list would send it to a field nobody has to
// fill.
type FieldName = 'name' | 'email' | 'shoot_type' | 'message' | 'date' | 'location';
type FieldState = '' | 'valid' | 'error';

const REQUIRED: FieldName[] = ['name', 'email', 'shoot_type', 'message'];

/**
 * What the submit button calls itself while a field is still empty. The button
 * carries this instead of a separate counter line above it, so the bar is one
 * element tall and the button says what pressing it will do for you.
 *
 * Every label is measured: the longest here is 178px in Jost at 14px/0.2em
 * uppercase, inside 216px of room at a 320px viewport. "Check availability",
 * the label that already shipped, is the widest string this button ever wears
 * at 180px, so nothing added here can overflow a button that did not already.
 *
 * date and location cannot ever be the next MISSING REQUIRED field. They are
 * here only to keep the map total over FieldName, so adding a field to
 * REQUIRED cannot leave a hole.
 */
const NEXT_LABEL: Record<FieldName, string> = {
  name: 'Add your name',
  email: 'Add your email',
  shoot_type: 'Choose a session',
  message: 'Add your message',
  date: 'Check availability',
  location: 'Check availability',
};

// The same idea spoken rather than shown. The hidden live region reads this,
// and audio has no width budget, so it can afford the article the button drops.
const SPOKEN_OF: Record<FieldName, string> = {
  name: 'your name',
  email: 'your email',
  shoot_type: 'the session type',
  message: 'your message',
  date: 'the date',
  location: 'the location',
};

// Visually hidden, still read aloud. Written once because there are now two of
// them: the assertive one that speaks a failed submit, and the polite one that
// narrates progress in place of the counter line the button replaced.
const SR_ONLY = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/**
 * Which section each control belongs to, so the progress square on that
 * section's heading can fill while you are working in it. Keyed by control id
 * rather than by marking up the three section containers, two of which are
 * textually identical and would be a coin flip to edit correctly.
 */
const SECTION_OF: Record<string, string> = {
  name: 'you',
  email: 'you',
  date: 'session',
  location: 'session',
  message: 'message',
};

const Contact = () => {
  // The reveal that wraps this whole page lives in <Reveal> now, down at the
  // content block. Both halves of what used to be written out here went with
  // it: the amount 'some' (NOT a fraction, because IntersectionObserver
  // measures the visible slice against the TARGET'S OWN height, and this
  // target is the whole page body, so on a tall phone layout 15% of it is more
  // than the viewport can show at once and the observer never reports it
  // visible at all), and the timed fallback that showed the content anyway if
  // the observer had not fired. This page is where both were learned: the
  // empty contact page in Chrome on iOS, where Safari's smaller browser chrome
  // had left it just the right side of the threshold.
  const navigate = useNavigate();
  const location = useLocation();

  // ThankYou is a lazy route, so submitting would otherwise fetch a chunk
  // between the POST and the Google Ads conversion firing. Warm it on arrival.
  useEffect(() => {
    prefetchChunk(() => import('./ThankYou'));
  }, []);

  // ── the carried package ────────────────────────────────────────────────
  const initialPackage = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('package');
    return PACKAGES.find((p) => p.name === raw) ?? null;
  }, []);

  const [pkg, setPkg] = useState(initialPackage);
  // Handed over by the weddings page in history state, so the plate shows the
  // very photograph they tapped. Not a query parameter: that is editable by
  // anyone, and an arbitrary URL in an <img src> is an injection.
  const navState = location.state as
    | { packagePhoto?: string; packageFocus?: string }
    | null;
  const platePhoto = navState?.packagePhoto ?? FALLBACK_PHOTO;
  const plateFocus = navState?.packageFocus ?? 'center';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [date, setDate] = useState('');
  const [place, setPlace] = useState('');
  const [message, setMessage] = useState(initialPackage ? prefillFor(initialPackage.name) : '');
  const [shootType, setShootType] = useState(initialPackage ? 'Wedding Photography' : '');

  const [state, setState] = useState<Record<FieldName, FieldState>>({
    name: '', email: '', shoot_type: '', message: '', date: '', location: '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Spoken, not shown. A failed submit used to be completely silent for a
  // screen reader: no count, no field names, and no focus move either, so the
  // button appeared to do nothing at all.
  const [announce, setAnnounce] = useState('');
  // A live region only speaks when its text actually changes, so the same
  // sentence written twice is silent. The re-announce below blanks it first
  // and writes it back a tick later; this holds that tick so it can be
  // cancelled. setTimeout rather than requestAnimationFrame, which does not
  // fire in headless Chrome.
  const announceTimer = useRef<number>();
  useEffect(() => () => window.clearTimeout(announceTimer.current), []);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);

  // Is the bar hovering over the form, or has it landed at its natural place?
  // It matters visually: floating on a background the same colour as the page,
  // it reads as the bottom of the page and hides the fact that there is more
  // to scroll to. Observed on the trust line directly beneath it, so there is
  // no scroll listener.
  // How much of the screen the on-screen keyboard is covering.
  //
  // iOS does not shrink the LAYOUT viewport when the keyboard opens, so an
  // element pinned to the bottom of it ends up underneath the keyboard. The
  // prototype dodged that by dropping the bar out of sticky positioning
  // altogether, but then touching a field and scrolling without typing left
  // the bar behind, which is exactly what Alex hit. The visual viewport knows
  // where the keyboard actually is, so lift the bar above it instead and let
  // it stay pinned.
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [vvSupported, setVvSupported] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    setVvSupported(true);
    const update = () => {
      const overlap = window.innerHeight - vv.height - vv.offsetTop;
      // A browser toolbar is only tens of pixels; a keyboard is hundreds. The
      // threshold keeps a disappearing Safari toolbar from being mistaken for
      // one and shunting the bar up the screen.
      setKeyboardInset(overlap > 120 ? Math.round(overlap) : 0);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  const [floating, setFloating] = useState(true);
  const trustRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = trustRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => {
      setFloating(!entry.isIntersecting && entry.boundingClientRect.top > 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Below lg the bar stands down while a text field has focus, because iOS
  // Safari mispositions bottom-pinned elements over the on-screen keyboard.
  // Synced from the FORM rather than from each field, and read one tick later,
  // because blur fires before the next focus: a per-field handler would flash
  // the bar off and on every time you moved between fields. Setting it only
  // on focus is worse still, which is what this replaced: the flag latched
  // true on the first tap and never cleared, so on a phone the submit bar
  // disappeared for good and the form could not be sent at all.
  // setTimeout rather than requestAnimationFrame: rAF does not fire in
  // headless Chrome, which would make this impossible to test.
  const syncTyping = (e: { currentTarget: HTMLElement }) => {
    const form = e.currentTarget;
    window.setTimeout(() => {
      const el = document.activeElement as HTMLElement | null;
      const inForm = !!el && form.contains(el);
      setTyping(
        inForm &&
          !!el &&
          (el.tagName === 'TEXTAREA' ||
            (el.tagName === 'INPUT' && (el as HTMLInputElement).type !== 'radio')),
      );
      // The same pass drives the progress square: the chips have no id of
      // their own, so they are recognised by their group instead.
      setActiveSection(
        inForm && el
          ? SECTION_OF[el.id] ?? (el.closest('#shoot_type_group') ? 'session' : null)
          : null,
      );
    }, 0);
  };

  // A carried package answers the question, so the chooser comes off screen
  // and a hidden input posts the value instead.
  const typeHidden = pkg !== null;
  const prefill = pkg ? prefillFor(pkg.name) : '';

  // ── validity ───────────────────────────────────────────────────────────
  const valid = useMemo(() => {
    const messageHasWords = prefill
      ? message.replace(GREETING_LINE, '').split(PROMPT_LINE).join('').trim().length > 0
      : message.trim().length > 0;
    return {
      name: name.trim().length > 0,
      email: EMAIL_RE.test(email.trim()),
      shoot_type: typeHidden ? true : shootType.length > 0,
      message: messageHasWords,
      date: date.trim().length > 0,
      location: place.trim().length > 0,
    };
  }, [name, email, shootType, message, date, place, prefill, typeHidden]);

  // REQUIRED, not every key of `valid`. The optional pair are in there too now.
  const requiredLeft = REQUIRED.filter((k) => !valid[k]).length;

  // The first required field still empty, in the order they appear on the page.
  // Deliberately the SAME expression handleSubmit uses to build `missing`, so
  // the field the button names and the field a press scrolls you to can never
  // be two different fields.
  const nextMissing = REQUIRED.find((k) => !valid[k]);

  // What the button says. Never an empty string: CTAButton renders its label
  // span only when children is truthy, so an empty one would collapse the span
  // and leave the flex gap behind, painting a blank, off-centre button.
  const ctaLabel = !nextMissing
    ? 'Check availability'
    // Present but flagged. "Add your email" is a lie over a box with something
    // in it. Read from `state`, NOT from live validity, because state only
    // turns error on blur or on a failed submit: this cannot scold you while
    // you are still halfway through typing the address.
    //
    // The emptiness check is not redundant with the error state. Pressing the
    // button on an untouched form flags every required field at once, empty
    // ones included, and without this the button answered its own press with
    // "Check that email" over a box with nothing in it to check.
    : nextMissing === 'email' && state.email === 'error' && email.trim()
      ? 'Check that email'
      // A carried package leaves the greeting and the "Our plans so far:"
      // prompt sitting visibly in the box while messageHasWords is still
      // false, so "Add your message" would contradict the screen.
      : nextMissing === 'message' && prefill
        ? 'Add a few words'
        : NEXT_LABEL[nextMissing];

  // Spoken, never shown. This is where the count the old counter line carried
  // survives: a button label has a width budget and a screen reader does not.
  // It only changes when the count or the next field changes, so it speaks at
  // most four times over the life of the page, not once per keystroke.
  const progress = nextMissing
    ? `${requiredLeft} required field${requiredLeft === 1 ? '' : 's'} left. Next: ${SPOKEN_OF[nextMissing]}.`
    : 'All required fields are filled.';

  const messageFor = (field: FieldName): string => ({
    name: 'Add your name',
    email: email.trim() ? 'That email does not look quite right' : 'Add an email so I can reply',
    shoot_type: 'Choose what you are booking',
    message: 'Tell me more about what you have in mind, so I can give you a helpful reply',
    // Neither can be wrong, only present or absent, so these never render.
    // They exist so the map stays exhaustive over FieldName.
    date: '',
    location: '',
  }[field]);

  // Validity of a field for a GIVEN value, rather than for the value as of the
  // last render. `valid` is a useMemo, so reading it from an onChange handler
  // sees the previous keystroke: pasting a name into a flagged field left it
  // red until you typed another character. This takes the incoming value.
  const validFor = (field: FieldName, value: string): boolean => {
    if (field === 'email') return EMAIL_RE.test(value.trim());
    if (field === 'shoot_type') return typeHidden ? true : value.length > 0;
    if (field === 'message') {
      return prefill
        ? value.replace(GREETING_LINE, '').split(PROMPT_LINE).join('').trim().length > 0
        : value.trim().length > 0;
    }
    return value.trim().length > 0;
  };

  // Reward early, judge late: an errored field clears the moment it is right,
  // but a field is only marked wrong once they leave it.
  const judge = (field: FieldName, value: string) => {
    const ok = validFor(field, value);
    const required = REQUIRED.includes(field);
    setState((s) => ({
      ...s,
      // An OPTIONAL field left empty is never an error, however many times the
      // form has been submitted.
      [field]: value.trim() ? (ok ? 'valid' : 'error') : required && submitted ? 'error' : '',
    }));
  };
  const clearIfFixed = (field: FieldName, value: string) => {
    setState((s) => (s[field] === 'error' && validFor(field, value) ? { ...s, [field]: 'valid' } : s));
  };

  // ── the package plate ──────────────────────────────────────────────────
  const removePackage = () => {
    // Take OUR sentence out and leave everything they wrote. If nothing of
    // theirs remains, clear the box rather than stranding an empty prompt.
    const rest = message.replace(GREETING_LINE, '').replace(/^\s+/, '');
    const next = rest.trim() === BLANKS.trim() ? '' : rest;
    setMessage(next);
    setPkg(null);
    setShootType('Wedding Photography');
    // Re-judge what the removal just changed. Clicking into the message box and
    // then pressing Remove left the now-EMPTY box outlined in red with "Tell me
    // more about what you have in mind" under it: the textarea's blur fires
    // first and marks it, then the click empties it, and nothing recomputed the
    // state afterwards. A field that is empty and not yet submitted is neutral,
    // not wrong. Checked directly rather than through validFor, whose `prefill`
    // still refers to the package being removed in this very handler.
    setState((s) => ({
      ...s,
      message: next.trim() ? 'valid' : submitted ? 'error' : '',
      shoot_type: '',
    }));
  };

  // ── submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // A re-announce still in flight belongs to the previous attempt and would
    // otherwise speak its count over this one.
    window.clearTimeout(announceTimer.current);
    setSubmitted(true);

    const missing = REQUIRED.filter((k) => !valid[k]);
    if (missing.length) {
      setState((s) => {
        const next = { ...s };
        REQUIRED.forEach((k) => {
          next[k] = valid[k] ? (k === 'shoot_type' ? '' : 'valid') : 'error';
        });
        return next;
      });
      const firstId = missing[0] === 'shoot_type' ? 'shoot_type_group' : missing[0];
      const target = document.getElementById(firstId);
      target?.scrollIntoView({ block: 'center', behavior: scrollBehavior() });
      // Move the CARET, not just the viewport. Without this a keyboard visitor
      // is scrolled up to the offending field while focus stays on the submit
      // button at the bottom of the page, so they have to tab backwards through
      // the whole form to reach what they were sent to.
      const control =
        missing[0] === 'shoot_type'
          ? target?.querySelector<HTMLElement>('button')
          : (target as HTMLElement | null);
      control?.focus({ preventScroll: true });
      // Pressing submit again with the same fields missing produced a
      // byte-identical string, React mutated nothing, and the region stayed
      // quiet. Blanking it first guarantees the mutation.
      const msg = `${missing.length} field${missing.length === 1 ? ' needs' : 's need'} attention.`;
      setAnnounce('');
      announceTimer.current = window.setTimeout(() => setAnnounce(msg), 60);
      return;
    }
    setAnnounce('');

    setIsSubmitting(true);
    setError('');

    // Only the package NAME goes up. The server resolves coverage and price
    // from its own copy of the data, so a tampered value cannot be quoted back.
    const payload = {
      name, email, shoot_type: shootType, date, location: place, message,
      package: pkg?.name ?? '',
      botcheck: '',
    };

    try {
      // Submit and WAIT before navigating. This used to fire from the
      // thank-you page after the route changed, and closing the tab or
      // backgrounding on mobile aborted it: the lead vanished from our side
      // while the customer saw a success page. Awaiting it closes that.
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({ success: false }));

      if (response.ok && data.success) {
        const submissionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        navigate('/contact/thank-you', {
          state: { submissionId, emailId: data.emailId ?? null },
        });
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── shared field styling ───────────────────────────────────────────────
  const fieldSx = (field: FieldName) => ({
    bg: 'white',
    border: '1px solid',
    borderColor:
      state[field] === 'error' ? 'red.600'
      : state[field] === 'valid' ? 'brand.success'
      : 'brand.field',
    borderRadius: 0,
    color: 'gray.800',
    fontSize: '16px',
    fontWeight: '300',
    // On the CONTROL, never the wrapper: the browser honours scroll-margin
    // only on the element it scrolls to, so on a wrapper it does nothing and
    // tabbing still parks the field behind the header or the submit bar.
    //
    // The bottom number is the submit bar's own height: 14 + 56 + 14 at base,
    // 14 + 52 + 14 on desktop. It was 112 while the bar also carried a counter
    // line above the button, and left 28px of dead air under every field it
    // scrolled to once that line went.
    scrollMarginTop: '88px',
    scrollMarginBottom: '88px',
    _placeholder: { color: 'gray.500' },
    // Chakra paints its own _invalid styling in its own red once isInvalid is
    // set. Pin it to ours so the two can never disagree.
    _invalid: {
      borderColor: 'red.600',
      boxShadow: '0 0 0 3px rgba(197, 48, 48, 0.14)',
    },
    // The prototype's resting error glow. Without it a missing field is a thin
    // red line and very little else.
    boxShadow: state[field] === 'error' ? '0 0 0 3px rgba(197, 48, 48, 0.14)' : undefined,
    // Keep the red WHILE the field has focus. Clicking into the field you have
    // just been told to fix used to swap the red border and glow for the
    // ordinary gold ring, so while you were typing there was no longer any
    // sign of which field had been flagged.
    _focus:
      state[field] === 'error'
        ? {
            borderColor: 'red.600',
            boxShadow: '0 0 0 1px #c53030, 0 0 0 4px rgba(197, 48, 48, 0.12)',
          }
        : { borderColor: 'brand.accentText', boxShadow: 'accentFocus' },
  });

  const labelSx = {
    display: 'block',
    mb: 3,
    fontSize: '11px',
    fontWeight: '400',
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    color: 'brand.mutedText',
  };

  // The id is what each control's aria-describedby points at, so the message
  // is read out with the field rather than being sighted-only. The alert mark
  // is the prototype's ICON_ALERT: without it the line is colour alone, which
  // a colour-blind visitor cannot read as an error at all.
  const errorLine = (field: FieldName) =>
    state[field] === 'error' && (
      <Flex id={`${field}-err`} align="center" gap="6px" mt={3} fontSize="13px" color="red.600">
        <Box as="svg" flex="none" w="14px" h="14px" viewBox="0 0 14 14" aria-hidden="true">
          <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <path d="M7 3.8v4M7 9.6v.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </Box>
        <Box as="span">{messageFor(field)}</Box>
      </Flex>
    );

  // aria-describedby ONLY, and the required/invalid state goes through Chakra's
  // isRequired/isInvalid props instead.
  //
  // Chakra runs Input and Textarea props through useFormControl, which derives
  // aria-invalid and aria-required from those two props and OVERWRITES whatever
  // you passed for the attributes directly. Setting them by hand looked right
  // in the source and rendered nothing at all; aria-describedby survived from
  // the very same spread, which is what gave the game away.
  //
  // Naming the error line even when it is not rendered is deliberate: pointing
  // at a missing id is harmless, and it means the association is already in
  // place the instant the error appears.
  const describe = (field: FieldName) => ({ 'aria-describedby': `${field}-err` });

  return (
    <Box position="relative" minH="100vh" bg="brand.surface">
      <Helmet>
        <title>Book a Session | Vero Photography</title>
        <meta property="og:image" content="https://vero.photography/assets/photos/site/contact-bg.webp" />
      </Helmet>

      {/* Hero — the same band every other page opens with: 45vh / 53vh, the
          same veil, the same header ramp. */}
      <Box position="relative" h={{ base: '45vh', md: '53vh' }} overflow="hidden" bg="#3a342d">
        <Image
          src="/assets/photos/site/contact-bg.webp"
          alt=""
          w="100%"
          h="100%"
          objectFit="cover"
          objectPosition={{ base: '13% 30%', md: 'center 30%' }}
          fetchPriority="high"
        />
        <Box position="absolute" inset={0} bg="rgba(0,0,0,0.45)" />
        <Flex position="absolute" inset={0} align="center" justify="center" px={6} pt={{ base: '64px', md: '72px' }}>
          <Box maxW="46ch">
            <PageHeader
              onDark
              eyebrow="Get in touch"
              title="Book a session"
              lead="Tell me about your vision and let's create something beautiful together."
            />
          </Box>
        </Flex>
      </Box>

      <Box maxW="1120px" mx="auto" px={{ base: 5, md: 10 }} pt={{ base: 12, md: 16 }} pb={{ base: 16, md: '88px' }}>
        <Reveal amount="some" from={{ opacity: 0, y: 20 }} duration={0.8}>
          <Grid
            templateColumns={{ base: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 320px' }}
            // 72px explicitly, NOT a scale number. 18 is not a Chakra spacing
            // token, so it passed through as a literal 18px, and the submit
            // bar's -72px right margin then overshot the gap by 54px and
            // covered the rail.
            columnGap={{ lg: '72px' }}
            // The last row is flexible so the tall form column cannot inflate
            // the rows beside it. Without it the form's height is shared across
            // all three, pushing the rail down and leaving a hole at the top.
            templateRows={{ lg: 'auto auto 1fr' }}
            templateAreas={{
              base: `"plate" "col" "reserve" "reach"`,
              lg: `"col plate" "col reserve" "col reach"`,
            }}
          >
            {/* ── the package plate ── */}
            {pkg && (
              <GridItem area="plate" mb={{ base: 9, lg: 10 }} w="100%" maxW={{ base: '640px', lg: 'none' }} mx="auto">
                <Box position="relative" h={{ base: '200px', lg: '210px' }} overflow="hidden" bg="#3a342d">
                  <Image src={platePhoto} alt="" position="absolute" inset={0} w="100%" h="100%" objectFit="cover" objectPosition={plateFocus} />
                  <Box
                    position="absolute"
                    inset={0}
                    bg="linear-gradient(180deg, rgba(12,10,6,0.5) 0%, rgba(12,10,6,0.14) 32%, rgba(12,10,6,0.56) 62%, rgba(12,10,6,0.88) 100%)"
                  />
                  <Flex
                    as="button"
                    type="button"
                    onClick={removePackage}
                    position="absolute"
                    top={0}
                    right={0}
                    zIndex={2}
                    align="center"
                    gap={2}
                    minH="44px"
                    px={3.5}
                    color="white"
                    fontSize="10px"
                    letterSpacing="0.16em"
                    textTransform="uppercase"
                    textShadow="0 1px 6px rgba(0,0,0,0.5)"
                    _hover={{ color: 'brand.accentSoft' }}
                    // Inset, because an outset ring on a control sitting in the
                    // corner of the photograph is clipped by the plate.
                    _focusVisible={{ outline: '2px solid #e3c98f', outlineOffset: '-4px' }}
                    // Tabbing back up to this left it tucked under the navbar.
                    sx={{ scrollMarginTop: '88px', scrollMarginBottom: '88px' }}
                  >
                    {/* Drawn, for the same reason as the tick in the submit
                        bar: the glyph fell back to another face entirely and
                        sat smaller and lighter than the label beside it. */}
                    <Box as="svg" viewBox="0 0 12 12" aria-hidden="true" w="11px" h="11px" flex="none">
                      <path
                        d="M1.5 1.5 10.5 10.5M10.5 1.5 1.5 10.5"
                        stroke="currentColor"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                      />
                    </Box>
                    Remove
                  </Flex>
                  <Box position="absolute" left={0} right={0} bottom={0} zIndex={1} px={5} py={4}>
                    <Text fontSize="10px" letterSpacing="0.2em" textTransform="uppercase" color="brand.accentSoft">
                      Your package
                    </Text>
                    <Text fontFamily="heading" fontWeight="400" fontSize="28px" lineHeight="1.1" color="white" mt={1} textShadow="0 2px 14px rgba(0,0,0,0.45)">
                      {pkg.name}
                    </Text>
                    <Flex align="center" justify="space-between" gap={3} mt={1.5}>
                      <Flex align="center" gap={2} minW={0} fontSize="13px" color="whiteAlpha.900">
                        <Box as="span">{pkg.coverage}</Box>
                        {/* The same gold dot as the trust line further down,
                            rather than a typographic middot in the body colour,
                            which read as one undifferentiated run of text. */}
                        <Box
                          as="span"
                          flex="none"
                          w="3px"
                          h="3px"
                          borderRadius="full"
                          bg="brand.accent"
                          aria-hidden="true"
                        />
                        <Box as="span">{pkg.price}</Box>
                      </Flex>
                      <Box
                        as="a"
                        href="/wedding-photography#packages"
                        flex="none"
                        fontSize="10px"
                        letterSpacing="0.16em"
                        textTransform="uppercase"
                        color="white"
                        borderBottom="1px solid"
                        borderColor="brand.accentSoft"
                        pb={0.5}
                        _focusVisible={{ outline: '2px solid #e3c98f', outlineOffset: '3px' }}
                        // Tabbing back up to this left it under the navbar.
                        sx={{ scrollMarginTop: '88px', scrollMarginBottom: '88px' }}
                      >
                        Change
                      </Box>
                    </Flex>
                  </Box>
                </Box>
              </GridItem>
            )}

            {/* ── form, submit bar and trust line travel together ── */}
            <GridItem area="col" minW={0} alignSelf="start">
              <Box
                as="form"
                onSubmit={handleSubmit}
                // The browser's own validation bubble pre-empts all of this:
                // a half-typed email made Chrome show its grey tooltip and
                // handleSubmit never ran, so the designed red copy never
                // appeared and the other empty fields were never flagged.
                noValidate
                id="contact-form"
                // A form is only a landmark once it has a name, and the CTA
                // that submits it lives outside it. Matches the h1.
                aria-label="Book a session"
                w="100%"
                maxW={{ base: '640px', lg: 'none' }}
                mx="auto"
                // The other half of the bar's negative margin below.
                mb={{ base: '336px', lg: '332px' }}
                onFocus={syncTyping}
                onBlur={syncTyping}
              >
                {/* Honeypot. Bots fill it, humans never see it, and the API
                    returns a fake success when it arrives populated. */}
                <input type="hidden" name="botcheck" defaultValue="" />

                {/* Assertive, and visually hidden. This is what makes a failed
                    submit audible; the focus move above is what makes it
                    navigable. */}
                <Text as="p" aria-live="assertive" m={0} sx={SR_ONLY}>
                  {announce}
                </Text>

                {/* The counter line above the submit button is gone: the button
                    names the next empty field itself now. A button's ACCESSIBLE
                    NAME changing is not a live-region event though, and it is
                    only spoken when that button has focus, which it never does
                    while you are typing. So the progress this page used to show
                    is spoken here instead.

                    INSIDE THE FORM, not in the bar. The bar sets display:none
                    for the whole time the on-screen keyboard is up, and a
                    display:none subtree is out of the accessibility tree
                    entirely, so a region living there would fall silent during
                    the exact interaction it exists to narrate. Mounted from the
                    first render too, with only its text changing: a live region
                    that appears at the same moment as its content is registered
                    too late and its first announcement is dropped. */}
                <Text as="p" aria-live="polite" m={0} sx={SR_ONLY}>
                  {progress}
                </Text>

                <Box mb={12}>
                  <SectionHead title="You" square active={activeSection === 'you'} />
                  <Box>
                    <Text as="label" htmlFor="name" sx={labelSx}>
                      Full name <Text as="span" color="red.600" fontWeight="500" aria-hidden="true">*</Text>
                    </Text>
                    <FieldWrap state={state.name} tick>
                      <Input
                        id="name"
                        name="name"
                        autoComplete="name"
                        value={name}
                        onChange={(e) => { setName(e.target.value); clearIfFixed('name', e.target.value); }}
                        onBlur={(e) => judge('name', e.target.value)}
                        isRequired
                        isInvalid={state.name === 'error'}
                        {...describe('name')}
                        h="48px"
                        sx={fieldSx('name')}
                      />
                    </FieldWrap>
                    {errorLine('name')}
                  </Box>
                  <Box mt={6}>
                    <Text as="label" htmlFor="email" sx={labelSx}>
                      Email <Text as="span" color="red.600" fontWeight="500" aria-hidden="true">*</Text>
                    </Text>
                    <FieldWrap state={state.email} tick>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="off"
                        spellCheck={false}
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); clearIfFixed('email', e.target.value); }}
                        onBlur={(e) => judge('email', e.target.value)}
                        isRequired
                        isInvalid={state.email === 'error'}
                        {...describe('email')}
                        h="48px"
                        sx={fieldSx('email')}
                      />
                    </FieldWrap>
                    {errorLine('email')}
                  </Box>
                </Box>

                <Box mb={12}>
                  <SectionHead title="The session" square active={activeSection === 'session'} />
                  {/* Hidden entirely while a package is carried: the package
                      already says this is a wedding, so offering to change it
                      to Maternity makes no sense. Removing it brings it back. */}
                  {typeHidden ? (
                    <input type="hidden" name="shoot_type" value={shootType} readOnly />
                  ) : (
                    // A plain comment, NOT the {/* */} form: this is a ternary
                    // branch, an expression position, where the braces open an
                    // object literal and the JSX below is then read as a
                    // less-than operator.
                    //
                    // A group with a name: the five buttons were otherwise
                    // announced one by one with nothing saying what they were
                    // choosing between.
                    <Box id="shoot_type_group" mb={6} role="group" aria-labelledby="shoot_type_label">
                      <Text as="span" id="shoot_type_label" sx={labelSx}>
                        Type <Text as="span" color="red.600" fontWeight="500" aria-hidden="true">*</Text>
                      </Text>
                      <Flex
                        wrap="wrap"
                        gap={2}
                        // The flagged control has to LOOK flagged. With only the
                        // sentence beneath it turning red, a missing Type
                        // scrolled the visitor to a chip row that looked exactly
                        // as it had a moment earlier.
                        sx={
                          state.shoot_type === 'error'
                            ? {
                                outline: '1.5px solid #c53030',
                                outlineOffset: '6px',
                                boxShadow: '0 0 0 9px rgba(197, 48, 48, 0.07)',
                              }
                            : undefined
                        }
                      >
                        {SHOOT_TYPES.map((t) => (
                          <Box
                            key={t.value}
                            as="button"
                            type="button"
                            onClick={() => { setShootType(t.value); setState((s) => ({ ...s, shoot_type: '' })); }}
                            aria-pressed={shootType === t.value}
                            // Submit sends focus to the first chip, which was
                            // the one flagged control whose error line named
                            // nothing.
                            {...describe('shoot_type')}
                            display="flex"
                            alignItems="center"
                            minH={{ base: '44px', lg: '40px' }}
                            px={4}
                            fontSize="12px"
                            letterSpacing="0.1em"
                            textTransform="uppercase"
                            border="1px solid"
                            borderColor={shootType === t.value ? 'brand.accentText' : 'brand.field'}
                            bg={shootType === t.value ? 'brand.accentText' : 'white'}
                            color={shootType === t.value ? 'white' : 'gray.700'}
                            transition="background 0.2s, color 0.2s, border-color 0.2s"
                            // Without a hover the chips do not read as
                            // pressable until you have already pressed one.
                            _hover={{ borderColor: 'brand.accentText' }}
                            _focusVisible={{
                              outline: '2px solid',
                              outlineColor: 'brand.accentText',
                              outlineOffset: '2px',
                            }}
                            sx={{ scrollMarginTop: '88px', scrollMarginBottom: '88px' }}
                          >
                            {t.label}
                          </Box>
                        ))}
                      </Flex>
                      {errorLine('shoot_type')}
                    </Box>
                  )}

                  <Grid
                    // 560px, matching the prototype, not Chakra's sm (480px).
                    // Between 480 and 559 these sat side by side at roughly
                    // 208px each, squeezing the native date control and the
                    // long "Venue, town, address, or still deciding" placeholder.
                    templateColumns="minmax(0,1fr)"
                    sx={{
                      '@media (min-width: 560px)': {
                        gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)',
                      },
                    }}
                    gap={6}
                  >
                    <Box>
                      <Text as="label" htmlFor="date" sx={labelSx}>
                        Preferred date <Text as="span" textTransform="none" letterSpacing="0.02em" fontSize="12px" color="brand.mutedText">optional</Text>
                      </Text>
                      {/* No tick on this one: the prototype gives the date
                          field none, and its own calendar mark already sits in
                          the corner a tick would occupy. */}
                      <FieldWrap state={state.date}>
                        <Input
                          id="date"
                          name="date"
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          onBlur={(e) => judge('date', e.target.value)}
                          h="48px"
                          sx={{
                          // Its OWN state, not the name field's. Borrowing
                          // another field's state is what made the optional
                          // fields flash green and red for input they had
                          // nothing to do with.
                          ...fieldSx('date'),
                          // iOS lays a chosen date out by its own shadow-DOM
                          // defaults: pinned to the top of the box and centred.
                          // Both need overriding, and the value element needs
                          // the line height, not just the input.
                          height: '48px',
                          lineHeight: '46px',
                          textAlign: 'left',
                          '&::-webkit-date-and-time-value': {
                            height: '46px', lineHeight: '46px', margin: 0, textAlign: 'left',
                          },
                          // iOS Safari gives a date input no picker indicator
                          // at all, so once a date is chosen the field reads as
                          // plain text and nothing suggests it can be tapped
                          // again to change it. Paint our own calendar mark,
                          // and hide the native one where it does exist, on
                          // Android Chrome, so the two never double up. The
                          // native indicator keeps its hit area, it is only
                          // made invisible.
                          '@media (max-width: 991px)': {
                            paddingRight: '42px',
                            // KEBAB-CASE ON PURPOSE, do not "tidy" this to
                            // backgroundImage. Chakra routes the camelCase
                            // prop through its gradient transform, which
                            // mangled this data URI: the string reached the
                            // bundle but the declaration it produced was
                            // invalid, so the CSS parser discarded it and the
                            // field computed background-image:none while every
                            // other background longhand applied. A hyphenated
                            // key is not in Chakra's style-prop map, so it
                            // passes straight through to Emotion untouched.
                            'background-image': `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='none' stroke='%238a6e35' stroke-width='1.3'%3E%3Crect x='2.6' y='4.2' width='14.8' height='13'/%3E%3Cpath d='M2.6 8.2h14.8M6.6 2.6v3.2M13.4 2.6v3.2'/%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 13px center',
                            backgroundSize: '17px 17px',
                            '&::-webkit-calendar-picker-indicator': { opacity: 0 },
                          },
                          }}
                        />
                      </FieldWrap>
                    </Box>
                    <Box>
                      <Text as="label" htmlFor="location" sx={labelSx}>
                        Location <Text as="span" textTransform="none" letterSpacing="0.02em" fontSize="12px" color="brand.mutedText">optional</Text>
                      </Text>
                      <FieldWrap state={state.location} tick>
                        <Input
                          id="location"
                          name="location"
                          autoComplete="off"
                          placeholder="Venue, town, address, or still deciding"
                          value={place}
                          onChange={(e) => setPlace(e.target.value)}
                          onBlur={(e) => judge('location', e.target.value)}
                          h="48px"
                          // Its own state. This field was wired to the NAME
                          // field's: typing a name turned the untouched, empty
                          // Location box green, and a failed submit turned it
                          // red with no message under it.
                          sx={fieldSx('location')}
                        />
                      </FieldWrap>
                    </Box>
                  </Grid>
                </Box>

                <Box>
                  <SectionHead title="Your message" required square active={activeSection === 'message'} />
                  <FieldWrap state={state.message} tick>
                    <Textarea
                      id="message"
                      name="message"
                      rows={5}
                      placeholder="The day, your ideas, any questions"
                      value={message}
                      onChange={(e) => { setMessage(e.target.value); clearIfFixed('message', e.target.value); }}
                      onBlur={(e) => judge('message', e.target.value)}
                      isRequired
                      isInvalid={state.message === 'error'}
                      {...describe('message')}
                      // The section heading is an h2, not a label, so without
                      // this the box announces as its placeholder text and is
                      // unfindable by name in a screen reader's control list.
                      aria-label="Your message"
                      lineHeight="1.6"
                      p={3}
                      sx={{
                        ...fieldSx('message'),
                        // 560px, the width at which the greeting stops
                        // wrapping, NOT Chakra's md (768px). Between 561 and
                        // 767 the box was opening 64px taller than the approved
                        // design for no reason, since nothing wraps there.
                        minHeight: '204px',
                        '@media (min-width: 561px)': { minHeight: '140px' },
                      }}
                    />
                  </FieldWrap>
                  {errorLine('message')}
                </Box>

                {error && (
                  <Text mt={6} fontSize="sm" color="red.600">
                    {error}
                  </Text>
                )}
              </Box>

              {/* The submit bar. OUTSIDE the form on purpose: a sticky element
                  can never leave its containing block, and inside the form that
                  block's top sits only a little above the fold on arrival,
                  which clamped the bar and left it hanging below the screen.
                  The button stays the form's submit through the form attribute.

                  margin-top is negative, and .form carries the same number as
                  margin-bottom above. A negative margin outsets the sticky
                  constraint rectangle so the bar can reach the bottom of the
                  viewport from the first pixel, on a short screen or a phone
                  held in landscape, without moving where it finally lands. */}
              <Flex
                direction="column"
                align="center"
                gap={2.5}
                position="sticky"
                // Always flush to the bottom. Lifting the bar above the
                // keyboard put it straight over the field being typed into, so
                // you could not see what you were writing. While the keyboard
                // is up the bar hides instead; see the media query below.
                bottom={0}
                zIndex={40}
                bg="brand.surface"
                mt="-300px"
                py={3.5}
                mx={{ base: -5, md: -10, lg: '-40px' }}
                px={{ base: 5, md: 10, lg: 0 }}
                sx={{
                  '@media (max-width: 991px)': {
                    // ONLY while the bar is actually pinned, which is the only
                    // time the home indicator can overlap it.
                    // env(safe-area-inset-bottom) is 0 while Safari's bottom
                    // toolbar is on screen and about 34px once it auto-hides,
                    // so applying this unconditionally made the gap above the
                    // trust line grow and shrink as the toolbar came and went.
                    paddingBottom: floating
                      ? 'calc(14px + env(safe-area-inset-bottom, 0px))'
                      : '14px',
                    // While the on-screen keyboard is up, the bar gets out of
                    // the way completely.
                    //
                    // Keyed on THE KEYBOARD, not on focus, and that distinction
                    // is the whole fix. Focus outlives the keyboard: press iOS
                    // Done, or scroll so the keyboard dismisses, and the field
                    // is still focused. Keying this on focus is what left the
                    // bar missing long after the keyboard had gone. The visual
                    // viewport tells us what the keyboard is actually doing, so
                    // the bar comes back the instant it closes.
                    ...(keyboardInset > 0 ? { display: 'none' } : {}),
                    // Fallback for browsers with no visualViewport, where the
                    // keyboard is invisible to us and focus is the only signal
                    // available. Static rather than hidden, so that at worst
                    // the bar scrolls with the page instead of vanishing.
                    ...(typing && !vvSupported
                      ? {
                          position: 'static',
                          boxShadow: 'none',
                          borderTopColor: 'transparent',
                          '&::before': { opacity: 0 },
                        }
                      : {}),
                  },
                  '@media (min-width: 62em)': {
                    // Reaches the rail on the right and past the fields on the
                    // left, so no field edge or error glow shows beside it. The
                    // right padding puts the button back on the form's centre.
                    marginRight: '-72px',
                    paddingRight: '32px',
                  },
                }}
                borderTop="1px solid"
                borderTopColor={floating ? 'brand.accentBorder' : 'transparent'}
                boxShadow={floating ? '0 -12px 24px -20px rgba(40, 30, 10, 0.55)' : 'none'}
                transition="box-shadow 0.25s, border-color 0.25s"
                // A short fade above the bar while it floats, so the content
                // passing underneath is visible as content rather than reading
                // as the end of the page. Nothing once the bar has landed.
                _before={{
                  content: '""',
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  // Percentages on an absolutely positioned child resolve
                  // against the PADDING box, so a plain 100% would sit over
                  // the 1px hairline above and paint it out. The extra pixel
                  // lands the fade exactly on top of the border instead.
                  bottom: 'calc(100% + 1px)',
                  height: '28px',
                  pointerEvents: 'none',
                  opacity: floating ? 1 : 0,
                  transition: 'opacity 0.25s',
                  // brand.surface at zero alpha, NOT `transparent` — the
                  // keyword interpolates through rgba(0,0,0,0) and greys the
                  // middle of the fade.
                  bgGradient: 'linear(to-t, brand.surface, rgba(253, 249, 240, 0))',
                }}
              >
                <Box w="100%" maxW="320px">
                  {/* Muted until the required fields are filled, but still
                      pressable: pressing it is what shows WHICH fields are
                      missing. A disabled submit tells you nothing, which is
                      why GOV.UK advises against it.

                      There used to be a "4 required fields left" line above
                      this button. The button carries that job now, one field
                      at a time, which is 28px of bar back and a label that
                      describes what the press actually does. */}
                  <CTAButton
                    type="submit"
                    form="contact-form"
                    variant={requiredLeft === 0 ? 'solid' : 'solidMuted'}
                    size="lg"
                    fullWidth
                    isLoading={isSubmitting}
                    loadingText="Sending..."
                  >
                    {/* Keyed on the label, because a key change remounts the
                        node and a remount is what replays a CSS animation.
                        inline-block because transform does not apply to an
                        inline box.

                        The animation sits INSIDE the no-preference query rather
                        than being declared and then switched off for `reduce`,
                        and fill-mode stays at its default `none` with a resting
                        opacity of 1. So anywhere the animation does not run at
                        all, the label is simply there. An opacity that starts
                        at 0 and waits for a keyframe is how a reveal leaves a
                        page blank. */}
                    <Box
                      as="span"
                      key={ctaLabel}
                      display="inline-block"
                      sx={{
                        '@keyframes ctaLabelIn': {
                          from: { opacity: 0, transform: 'translateY(2px)' },
                          to: { opacity: 1, transform: 'none' },
                        },
                        '@media (prefers-reduced-motion: no-preference)': {
                          animation: 'ctaLabelIn 200ms ease',
                        },
                      }}
                    >
                      {ctaLabel}
                    </Box>
                  </CTAButton>
                </Box>
              </Flex>

              <Flex ref={trustRef} align="center" justify="center" gap={2.5} wrap="wrap" mt={5} w="100%" maxW={{ base: '640px', lg: 'none' }} mx="auto">
                <Text textStyle="metaCaption" color="brand.mutedText">No obligation</Text>
                <Box w="3px" h="3px" borderRadius="full" bg="brand.accent" />
                <Text textStyle="metaCaption" color="brand.mutedText">Get a reply within 24 hours</Text>
              </Flex>
            </GridItem>

            {/* Shared with the thank-you page: it carries Veronika's contact
                details, and a phone number living in two page files is one that
                eventually gets changed in only one of them. */}
            <ContactRail />
          </Grid>
        </Reveal>
      </Box>
    </Box>
  );
};

export default Contact;
