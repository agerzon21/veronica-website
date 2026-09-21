import { Box, Flex, Icon, Image, Text, VStack } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import type { IconType } from 'react-icons';
import FaArrowRight from '../icons/fa/FaArrowRight';
import FaCamera from '../icons/fa/FaCamera';
import FaCheck from '../icons/fa/FaCheck';
import FaChevronDown from '../icons/fa/FaChevronDown';
import BurgerMenu from './BurgerMenu';
import FaChevronLeft from '../icons/fa/FaChevronLeft';
import FaChevronRight from '../icons/fa/FaChevronRight';
import FaShareAlt from '../icons/fa/FaShareAlt';
import { HEADER_CLEARANCE } from './portalLayout';
import { SITE_LOGO_H, SITE_LOGO_H_MOBILE } from './siteHeader';
import { scrollBehavior } from '../utils/motion';

/**
 * The client portal's own header.
 *
 * It replaces the public site navbar on /portal and /portal/pass. A client
 * standing inside their portal does not need Gallery, Journal, About, Contact
 * and a link to the portal they are already in; they need to know where they
 * are in the booking and what is still owed.
 *
 * ── THE HEADER IS THE WHOLE NAVIGATION, AT EVERY WIDTH ──
 *
 * There are two navs in a delivered portal and they are different kinds of
 * thing: the BOOKING's own sections (contract, balance, password, share) and
 * the GALLERY's sections (ceremony, group photos, reception). Both live in the
 * header, as two bars that trade places, and which of them owns the room is
 * decided by where the reader is:
 *
 *   outside the photos -> one wide "Your account" bar, naming the section they
 *                         are in, and the photo bar takes no width at all,
 *   inside the photos  -> the photo bar grows into the slot and the account bar
 *                         condenses, to a square burger on a phone and to a
 *                         labelled 168px control on a desktop.
 *
 * It is driven by SCROLL POSITION, not by tapping: reaching the photos any way
 * at all is what triggers it, which is the only rule a client never has to
 * learn.
 *
 * The condensed account bar lands at the FAR RIGHT of the row, because the
 * photo bar leads and it follows. That is deliberate: the logo at the far left
 * navigates away to the public site, and a missed tap there ejects a client out
 * of the portal they were reading. The control they will use most does not
 * belong beside it.
 *
 * COLOUR RULE, the one thing not to undo: in the progress indicator exactly one
 * step carries colour at a time, the step they are on. An earlier version
 * painted all three amber, which told the client nothing, because if everything
 * is coloured nothing says where you are.
 *
 * The component takes DATA, not JSX, and degrades to "just a logo" when it is
 * handed nothing: the gallery-only route at /portal/pass has no contract, no
 * balance and no account menu, and renders the same header.
 *
 * ── BEFORE THE PHOTOS LAND ──
 *
 * There is no gallery to move around in, so the slot holds the 1-2-3 progress
 * instead and the account menu is already the burger at the far right. That is
 * exactly where it ends up once photos arrive, so nothing moves house on
 * delivery day.
 *
 * ── WIDTHS ──
 *
 * The split between the phone controls and the desktop ones is plain
 * responsive `display` and responsive style values, never a breakpoint hook.
 * This app prerenders, and a width measured during render is a hydration
 * mismatch waiting to happen. The few numbers that genuinely cannot be
 * expressed in CSS, the scroll scan's activation lines, read the width inside
 * their scroll handlers instead: see PortalChrome in portalLayout.ts.
 */

export type PortalContractStatus = 'none' | 'pending' | 'signed' | 'void';

/**
 * What a nav item IS, as opposed to what it is called.
 *
 * The header has to treat two of the booking's sections specially: Photos gets
 * pinned to the top of the account menu once there is a gallery behind it, and
 * Share becomes a button in the desktop corner rather than a row in the menu.
 * Both used to be decidable only by comparing DOM ids, which puts a literal
 * like 'gallery-share-section' inside a component that has no business knowing
 * what the portal calls its sections. The role is the caller saying which is
 * which, once, where the list is built.
 */
export type PortalNavRole = 'photos' | 'share';

/** One entry in whatever nav the header is handed. */
export interface PortalNavItem {
  /** The id of the section element this jumps to. */
  id: string;
  label: string;
  icon?: IconType;
  /**
   * Greyed out and inert. The gallery sets it on a section the favourites
   * filter has emptied; the portal's own sections are never disabled.
   */
  disabled?: boolean;
  /** See PortalNavRole. Absent on an ordinary section. */
  role?: PortalNavRole;
}

/**
 * A nav the header renders as a BAR plus a MENU: the items, which one the
 * reader is in, and what to do when they pick one.
 *
 * Both navs take this shape, because from the header's side they differ only
 * in what they are called. The caller owns the selecting, since a pick is a
 * scroll and only the surface that built the items knows how to perform it.
 */
export interface PortalMenuNav {
  items: PortalNavItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

/** Everything the progress indicator and the balance are derived from. */
export interface PortalProgressData {
  contractStatus: PortalContractStatus;
  /**
   * The total owed on the booking, contract plus any charges added after it.
   * null means this portal carries no money at all, in which case the header
   * shows no balance rather than a meaningless "$0".
   */
  amountOwed: number | null;
  /** The retainer, if the contract names one. Decides amber versus gold on Pay. */
  retainerAmount: number | null;
  paidToDate: number;
  photosDelivered: boolean;
  /** True only when a dated installment has actually come and gone unpaid. */
  overdue?: boolean;
  /**
   * The shoot itself, as YYYY-MM-DD. The track's middle step.
   *
   * It belongs in the sequence because the CONTRACT puts it there: the
   * retainer is due at signing and the balance is due a set window AFTER the
   * event date. A track that collapsed both into one "Pay" step told a client
   * who had signed and paid a retainer that the next thing in their life was
   * "Photos", months before the day they were actually waiting for.
   */
  eventDate?: string | null;
}

interface PortalHeaderProps {
  /**
   * Where the logo goes. PLAIN NAVIGATION, no sign out, no confirm, session
   * untouched. Signing out is a separate, deliberate control further down the
   * page.
   */
  logoTo?: string;
  /** Omitted on the gallery-only route, which has no booking behind it. */
  progress?: PortalProgressData;
  /**
   * The gallery's sections, for the photo bar. Present whenever there is a
   * gallery with sections to move around in, on both routes.
   */
  sectionNav?: PortalMenuNav;
  /**
   * "A photo bar is coming, the slot is already spoken for."
   *
   * The full portal cannot hand over `sectionNav` on its first render. The
   * gallery builds it, the gallery is a SIBLING of this header, and an effect
   * is what carries it up, so the first commit has nothing here however much
   * the page already knows. A header that decided the slot on `sectionNav`
   * alone therefore painted the 1-2-3 progress once, on every load of a
   * delivered portal, and swapped it for the two-bar nav a commit later. The
   * client saw a flash of a track that was never theirs to see.
   *
   * So the answer comes from the DATA instead, on the first render, and the
   * arriving items only fill a slot that was already reserved. The caller
   * derives it from the same predicate the gallery uses to decide whether it
   * has a section nav at all, which is what keeps the reservation and the
   * thing reserving it from ever disagreeing.
   */
  sectionNavExpected?: boolean;
  /**
   * The booking's own sections. The full portal always has these; /portal/pass
   * has no account behind it and passes nothing, which is what leaves a guest
   * with no account bar and no burger at all.
   */
  accountNav?: PortalMenuNav;
  /**
   * Is the reader INSIDE the photos right now?
   *
   * The handoff's only input, and it is a scroll position rather than a tap:
   * the caller measures the photos section against the same activation line
   * its nav scan uses to decide which section is current, so the bar that
   * appears and the name written in it can never disagree about where the
   * reader is. See ClientPortalView.
   */
  inPhotos?: boolean;
  /**
   * How many images are in the gallery, for the pinned See photos row. null on
   * a surface that does not know, which simply drops the count.
   */
  photoCount?: number | null;
}

/**
 * The bars' shared geometry.
 *
 * Written once because the two bars sit side by side in one header and have to
 * read as a matched pair; two sets of literals would drift by a pixel and look
 * like a mistake rather than a style.
 *
 * They are proportions of the header rather than absolutes. The bars were 40
 * and 44 in a 60px header, which left 10px and 8px of breathing room above and
 * below; the header is now the public navbar's 72 and these keep the same
 * shape at 12px and 10px. Both are well past the 44px a thumb is owed, which
 * the 40px one only just cleared.
 */
const CONTROL_H = { base: '48px', md: '52px' };
const CONTROL_RADIUS = { base: '9px', md: '10px' };
/**
 * What the account bar condenses TO.
 *
 * A phone gets a burger, because 390px has no room for a labelled control
 * beside a section name. A desktop keeps the label: a burger on a 1200px
 * header hides a menu for no reason, and at 168px the bar still says where the
 * reader is and is still one click from every destination. It NEVER goes to
 * zero at either width, which is the point of a condense rather than a hide.
 *
 * The phone value is CONTROL_H's, not a second copy of it: the condensed bar is
 * a SQUARE burger, so its width is its height and typing 48 here would be a
 * promise to remember two places the next time the header's proportions move.
 */
const ACCOUNT_MINI_W = { base: CONTROL_H.base, md: '168px' };
/** The gap between the two bars, and the negative margin that cancels it. */
const SLOT_GAP = '8px';
const SLOT_GAP_NEG = '-8px';
/** The progress row along the photo bar's bottom edge, one tick per item. */
const SECTION_TICK_H = '3px';
/** How far in from the window edge an anchored menu sits. */
const MENU_INSET = '8px';
const MENU_RADIUS = '12px';
/**
 * Past this a phone menu scrolls inside itself rather than running down the
 * page. Five rows, and it is the LIST's height rather than the panel's: the
 * heading and the scroll cue sit outside it, so the whole panel comes to about
 * 245px and stays an anchored menu rather than something that reads as an
 * overlay.
 */
const MENU_MAX_H = '216px';
/** The site's own menu timing. MobileNav fades its overlay over the same 0.3s. */
const MENU_FADE = '0.3s';
/**
 * The wash on the row the reader is currently in. One step up from the gold
 * used on hover, so the two read as the same family rather than as two
 * different ideas of "gold".
 */
const MENU_CURRENT_BG = 'rgba(201, 169, 110, 0.14)';
/**
 * brand.success at low alpha. Written out because Chakra has no alpha channel
 * on a raw hex token, and both of these have to sit against white in a control
 * that is already carrying a green word.
 */
const READY_TINT = 'rgba(47, 122, 77, 0.09)';
const READY_BORDER = 'rgba(47, 122, 77, 0.3)';

/* ──────────────────────────────────────────────────────────────────────────
 * THE HANDOFF'S MOTION
 *
 * ONE duration and ONE curve, shared by every moving part, so the whole thing
 * lands on the same frame. The rigidity earlier versions had was never the
 * easing: it was four things finishing at four different times. The box took
 * 420ms while the label settled at 220 and the bars at 140, and the eye read a
 * sequence of small events rather than one movement.
 *
 * The curve is a long, soft deceleration rather than the material standard. It
 * leaves fast and arrives slowly, which is what reads as smooth on a control
 * that is changing shape rather than merely moving.
 *
 * The LEAVING parts are the exception, and deliberately so. The burger bars and
 * the account label must never be visible in the same frame, in either
 * direction, so whichever is arriving waits for the other to finish leaving:
 * out in 120ms, in from 130ms. That is the handover, and it is why the leaving
 * timings below are short and undelayed while every arriving one ends at 460ms.
 * ────────────────────────────────────────────────────────────────────────── */
const NAV_DUR = '0.46s';
const NAV_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

/** The box itself: width, padding, border, the lot, on the shared timing. */
const BOX_TRANSITION =
  `flex-grow ${NAV_DUR} ${NAV_EASE}, flex-basis ${NAV_DUR} ${NAV_EASE}, ` +
  `padding ${NAV_DUR} ${NAV_EASE}, border-width ${NAV_DUR} ${NAV_EASE}, ` +
  `margin-right ${NAV_DUR} ${NAV_EASE}, opacity 0.2s ease, ` +
  `background-color 0.25s ease, border-color 0.25s ease`;

/**
 * The account bar's own contents. Arriving, they start at 130ms, once the
 * burger bars are gone, and RIDE the box the rest of the way, finishing at
 * 460ms with it. Leaving, they go immediately and fast, so they are out of the
 * way before the bars arrive.
 */
const ACCOUNT_CONTENT_IN = `opacity 0.33s ease 0.13s, transform 0.33s ${NAV_EASE} 0.13s`;
const ACCOUNT_CONTENT_OUT = `opacity 0.12s ease 0s, transform 0.3s ${NAV_EASE} 0s`;

/**
 * The photo bar's contents. Leaving: out in 130ms, so the shrinking box is
 * never full of text it is about to clip. Arriving: from 150ms, landing at
 * 460ms with everything else.
 */
const PHOTO_CONTENT_IN = `opacity 0.31s ease 0.15s, transform 0.31s ${NAV_EASE} 0.15s`;
const PHOTO_CONTENT_OUT = `opacity 0.13s ease 0s, transform 0.3s ${NAV_EASE} 0s`;

/**
 * The BOX around the burger bars fades and scales; the bars themselves do not
 * animate on entry at all. That separation is the whole trick: opacity lives
 * here, where a delay is safe, and the X morph lives inside BurgerMenu, where
 * any delay shows up as the menu sticking half open on close.
 *
 * Scale as well as fade, so the bars feel absorbed into the widening box rather
 * than switched off in place. `visibility` rides along so a burger nobody can
 * see is also out of the tab order.
 */
const BARS_IN =
  `opacity 0.24s ease 0.14s, transform 0.3s ${NAV_EASE} 0.12s, visibility 0s linear 0s`;
const BARS_OUT =
  `opacity 0.12s ease 0s, transform 0.26s ${NAV_EASE} 0s, visibility 0s linear 0.12s`;

/**
 * The tick track wipes in left to right rather than fading, so the eye follows
 * the bar growing into place instead of watching two things dissolve.
 *
 * NO delay on the way in, deliberately. An earlier version gave it 100ms so the
 * wipe would trail the box, and measured per frame it was the one arriving part
 * that finished late: the whole movement spread over 200ms instead of landing
 * together, which is the exact fault this timing was rebuilt to fix. It runs on
 * the shared duration and curve like everything else, so the track fills at the
 * rate the bar grows, which is what "follows the bar" was meant to mean.
 *
 * Leaving is quick, like every other leaving part: the bar is about to be one
 * control wide and a track still wiping out inside it is a detail nobody can
 * read.
 */
const TICKS_IN = `clip-path ${NAV_DUR} ${NAV_EASE} 0s`;
const TICKS_OUT = `clip-path 0.3s ${NAV_EASE} 0s`;

/** Anything that animates has to stand still for a reader who asked it to. */
const STILL = { '@media (prefers-reduced-motion: reduce)': { transition: 'none' } };

/** Which anchored menu is open. Never both: the header holds one answer. */
type OpenMenu = 'sections' | 'account' | 'progress' | null;

const formatMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * Exported so ClientPortalView formats every amount the same way the header
 * does. One formatter, so the header and the Balance section can never
 * disagree about how a number is written.
 */
export { formatMoney };

/**
 * Money compared in whole cents, because these are NUMERIC(10,2) amounts that
 * became JS numbers. On a booking settled exactly to the cent, total + charges
 * - paid lands on 4.5e-13 rather than 0, which is enough to leave a fully paid
 * client showing an outstanding balance and stuck on the Pay step forever.
 */
export const moneyCents = (n: number): number => Math.round(n * 100);

/** Nothing owed: either the portal carries no money, or it is all in. */
const isFullyPaid = (p: PortalProgressData): boolean =>
  p.amountOwed === null || moneyCents(p.paidToDate) >= moneyCents(p.amountOwed);

/**
 * Is there a RETAINER still to pay?
 *
 * One definition, exported, because there were two. The Next Steps panel asked
 * `retainer !== null && retainer > 0 && paid < retainer`, while the header and
 * the step track fell back to `paid <= 0` when no retainer was named. On a
 * signed booking with no retainer and nothing paid, the corner demanded a red
 * "Retainer" for the WHOLE balance while the panel directly below it said the
 * retainer was received and the date was reserved.
 *
 * The panel's rule is the correct one: a contract that names no retainer has
 * no retainer step to be on.
 */
export const retainerStillDue = (p: PortalProgressData): boolean =>
  p.retainerAmount !== null &&
  p.retainerAmount > 0 &&
  moneyCents(p.paidToDate) < moneyCents(p.retainerAmount);

/**
 * Signed, paid and delivered. The state where the progress indicator has
 * nothing left to report.
 *
 * It is also the ONLY state that earns the green readiness cue. "Your photos
 * are ready" beside an open balance is the wrong thing to say twice over: the
 * gallery may be up but the booking is not finished, and a cue that appears
 * before the money is in trains the client to ignore it.
 *
 * Exported because ClientPortalView has to make the same call to decide
 * whether to render its second sticky nav row and whether the gallery draws a
 * strip of its own. Two independent readings of "complete" would eventually
 * disagree and the client would get both navs, or neither.
 */
export const isPortalComplete = (p: PortalProgressData | undefined): boolean =>
  !!p && p.contractStatus === 'signed' && isFullyPaid(p) && p.photosDelivered;

/** Is there a contract at all to report progress on? */
const hasContract = (p: PortalProgressData | undefined): boolean =>
  !!p && (p.contractStatus === 'pending' || p.contractStatus === 'signed');

type StepTone = 'done' | 'action' | 'progress' | 'overdue' | 'upcoming' | 'waiting';

interface ProgressStep {
  n: number;
  label: string;
  tone: StepTone;
  /** The step they are on. Keeps its label on a phone; the others lose theirs. */
  current: boolean;
  /** How many steps there are in total, for the phone's "3 of 5". */
  total?: number;
  /** A money step. The phone drops its detail when the balance corner has it. */
  money?: boolean;
  /**
   * The section of the portal this stage IS, so the stage itself is the way
   * there.
   *
   * Three of the five stages were printed twice: once here as status and
   * again in the account menu as a link, and only the menu copy did anything.
   * The other two are not separate places either. The retainer is part of the
   * Balance section, and the event date is the Top section, which is where it
   * is printed. So every stage has somewhere to go, and the menu keeps only
   * what no stage covers.
   */
  sectionId?: string;
  /**
   * Where this step actually stands, in a few words.
   *
   * "SIGN, PAY, PHOTOS" in three small circles told a client the order of
   * events, which they already knew, and nothing about their own booking. The
   * header had most of a screen of empty space next to it while the answer to
   * "what is happening with my photos" sat further down the page.
   */
  detail?: string;
}

/**
 * done: finished, green, a tick instead of the number.
 * action: the step waiting on the client. Amber.
 * progress: the step they are on, but the ball is in Veronika's court. Gold.
 * overdue: a balance whose due date has passed. Red, and only then.
 * upcoming: not reached. Neutral grey, deliberately.
 */
const STEP_TONES: Record<StepTone, { bg: string; border: string; fg: string; label: string }> = {
  done: { bg: 'brand.success', border: 'brand.success', fg: 'white', label: 'brand.success' },
  action: { bg: 'brand.caution', border: 'brand.caution', fg: 'white', label: 'brand.caution' },
  progress: {
    bg: 'brand.accentText',
    border: 'brand.accentText',
    fg: 'white',
    label: 'brand.accentText',
  },
  overdue: { bg: 'red.600', border: 'red.600', fg: 'white', label: 'red.600' },
  upcoming: { bg: 'transparent', border: 'gray.300', fg: 'gray.600', label: 'gray.600' },
  /**
   * Their part is finished and the next move is not theirs.
   *
   * Deliberately NOT 'done' and deliberately not a tick. A green check on
   * Photos would say the gallery is delivered, and a client who reads that
   * goes looking for pictures that are not there yet. Deliberately not
   * 'action' either, which is what it used to be: amber reads as a demand,
   * and there is nothing for them to do but wait for Veronika.
   *
   * Green, hollow, so it belongs to the finished half of the track without
   * claiming to be finished itself.
   */
  waiting: { bg: 'transparent', border: 'brand.success', fg: 'brand.success', label: 'brand.success' },
};

/**
 * Read a YYYY-MM-DD column without letting a timezone move it.
 *
 * new Date('2026-12-31') is midnight UTC, which is the 30th across the
 * Americas. The whole system reads these dates by their parts for this
 * reason; see the contract renderer, which composes noon UTC for the same
 * fact.
 */
function eventParts(iso: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "December 31", and the year too when it is not the one we are in. */
function prettyEventDate(iso: string | null | undefined): string | null {
  const p = eventParts(iso);
  if (!p) return null;
  const thisYear = new Date().getFullYear();
  return `${MONTHS[p.m - 1]} ${p.d}${p.y === thisYear ? '' : `, ${p.y}`}`;
}

/** Has the day itself been and gone? Compared by calendar date, not by clock. */
function eventHasPassed(iso: string | null | undefined): boolean {
  const p = eventParts(iso);
  if (!p) return false;
  const now = new Date();
  const today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  return p.y * 10000 + p.m * 100 + p.d < today;
}

/**
 * The booking as the CLIENT experiences it, in order.
 *
 * Contract, retainer, the day itself, whatever is left to pay, then the
 * photographs. It used to be three fixed steps, Sign / Pay / Photos, which got
 * two things wrong. It merged the retainer and the balance, although the
 * contract makes them due at opposite ends of the booking. And it left a green
 * "Photos" sitting as the next thing for a client whose wedding had not
 * happened yet, which answers a question nobody asked.
 *
 * Steps that do not apply are not rendered as done, they are not rendered at
 * all: a booking with no named retainer has no retainer step, and one whose
 * whole price is the retainer has no balance step. A step the client can never
 * act on is noise in a header.
 */
function buildSteps(p: PortalProgressData): ProgressStep[] {
  const signed = p.contractStatus === 'signed';
  const paidCents = moneyCents(p.paidToDate);
  const retainer = p.retainerAmount;
  const hasRetainer = retainer !== null && retainer > 0;
  const retainerCents = hasRetainer ? moneyCents(retainer) : 0;
  const retainerIn = !hasRetainer || paidCents >= retainerCents;
  const owed = p.amountOwed;
  const owedCents = owed !== null ? moneyCents(owed) : null;
  const paidInFull = isFullyPaid(p);
  const leftOver = owedCents !== null ? Math.max(owedCents - paidCents, 0) / 100 : 0;
  // Only when there is genuinely something beyond the retainer to settle.
  const hasBalance = owedCents !== null && owedCents > retainerCents;
  const eventPassed = eventHasPassed(p.eventDate);
  const eventLabel = prettyEventDate(p.eventDate);

  const raw: Array<{
    label: string;
    done: boolean;
    detail?: string;
    tone: StepTone;
    money?: boolean;
    sectionId?: string;
  }> = [];

  raw.push({
    label: 'Contract',
    done: signed,
    detail: signed ? 'Signed' : 'Waiting for you',
    tone: 'action',
    sectionId: 'contract-section',
  });

  if (hasRetainer) {
    raw.push({
      label: 'Retainer',
      done: retainerIn,
      detail: retainerIn
        ? 'Received'
        : `${formatMoney(Math.max(retainerCents - paidCents, 0) / 100)} due`,
      tone: 'action',
      money: true,
      // The retainer is money, and the money lives in Balance.
      sectionId: 'balance-section',
    });
  }

  if (eventLabel) {
    raw.push({
      label: 'Event',
      done: eventPassed,
      // The date either way. Before the day it is what they are waiting for;
      // after it, it is still the fact that anchors everything below.
      detail: eventLabel,
      // Nothing is being asked of them. The day arrives on its own.
      tone: 'waiting',
      // The date is printed at the top of the portal, so that is where it is.
      sectionId: 'portal-top-section',
    });
  }

  if (hasBalance) {
    raw.push({
      label: 'Balance',
      done: paidInFull,
      detail: paidInFull
        ? 'Paid in full'
        : p.overdue
          ? `${formatMoney(leftOver)} overdue`
          : `${formatMoney(leftOver)} left`,
      tone: p.overdue ? 'overdue' : 'action',
      money: true,
      sectionId: 'balance-section',
    });
  }

  raw.push({
    label: 'Photos',
    done: p.photosDelivered,
    detail: p.photosDelivered
      ? 'Ready to view'
      : eventPassed
        ? 'Veronika is editing'
        : 'After the event',
    tone: 'waiting',
    sectionId: 'photos-section',
  });

  // The step they are on is the first unfinished one; everything past it is
  // grey whatever its own state would otherwise suggest.
  const currentIndex = raw.findIndex((r) => !r.done);

  return raw.map((r, i) => ({
    n: i + 1,
    label: r.label,
    tone: r.done ? 'done' : i === currentIndex ? r.tone : 'upcoming',
    current: i === currentIndex,
    detail: r.detail,
    money: r.money,
    sectionId: r.sectionId,
    total: raw.length,
  }));
}

/* ──────────────────────────────────────────────────────────────────────────
 * MENU ROWS
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * One row of a menu, as data.
 *
 * Built once and rendered by both the phone's scrolling list and the desktop's
 * columned panel, because the two differ only in how they are laid out. A
 * second builder would be a second chance for the pinned row to appear in one
 * menu and not the other.
 */
interface MenuRow {
  id: string;
  label: string;
  /** Its position in the list AS RENDERED. Absent on the pinned row. */
  n?: number;
  /** The pinned See photos row: green, unnumbered, its own colour. */
  jump?: boolean;
  /** "943 images", on the pinned row only. */
  count?: string;
  active?: boolean;
  disabled?: boolean;
}

/**
 * The account menu's rows.
 *
 * Two rules, and both are about not saying the same thing twice:
 *
 *   - Once the gallery is DELIVERED, Photos is never an ordinary numbered row.
 *     Outside the photos it is the pinned green row at the top, which says the
 *     same thing far louder; inside them the reader is already there and it is
 *     dropped altogether. Before delivery it stays an ordinary row, where it
 *     points at the panel saying the photos are on the way.
 *   - On a DESKTOP, Share is a button in the corner, so it comes out of the
 *     list. A phone has no corner to spare and keeps it.
 *
 * The numbering is applied to what is actually rendered, last, so removing a
 * row never leaves a hole in the sequence.
 */
function buildAccountRows(
  nav: PortalMenuNav,
  opts: {
    delivered: boolean;
    inPhotos: boolean;
    photoCount?: number | null;
    dropShare?: boolean;
  },
): MenuRow[] {
  const rows: MenuRow[] = [];
  const photos = nav.items.find((i) => i.role === 'photos');
  if (opts.delivered && !opts.inPhotos && photos) {
    rows.push({
      id: photos.id,
      label: 'See photos',
      jump: true,
      count:
        typeof opts.photoCount === 'number' && opts.photoCount > 0
          ? `${opts.photoCount} ${opts.photoCount === 1 ? 'image' : 'images'}`
          : undefined,
    });
  }
  nav.items.forEach((item) => {
    if (opts.delivered && item.role === 'photos') return;
    if (opts.dropShare && item.role === 'share') return;
    rows.push({
      id: item.id,
      label: item.label,
      active: item.id === nav.activeId,
      disabled: item.disabled,
    });
  });
  let n = 0;
  rows.forEach((r) => {
    if (!r.jump) {
      n += 1;
      r.n = n;
    }
  });
  return rows;
}

/**
 * "Which of these am I on, out of how many", for one menu's rows.
 *
 * It counts the rows that menu ACTUALLY renders, which is why it is a function
 * of rows rather than of the nav: the desktop account menu has no Share row and
 * the phone's has, so the same bar owes the two widths different answers. A
 * counter built from the raw item list once promised "5 / 6" over a four row
 * menu, and this is what stops that coming back.
 *
 * An empty string when the reader is in a section this menu does not list. That
 * happens for real: crossing into the photos drops Photos from the account
 * menu, and on a desktop Share lives in the corner rather than in the list.
 * "1 / 5" beside the word Photos would be a made up number, so the bar shows no
 * number at all instead. See accountBarLabel for the other half of the rule.
 *
 * The jump row is excluded because it is not part of the sequence: it is an
 * action pinned above the list and it carries no number in the menu either.
 */
const barCounterFor = (rows: MenuRow[]): string => {
  const list = rows.filter((r) => !r.jump);
  const i = list.findIndex((r) => r.active);
  return i < 0 ? '' : `${i + 1} / ${list.length}`;
};

/** The gallery's sections. Numbered, in order, nothing removed. */
function buildSectionRows(nav: PortalMenuNav): MenuRow[] {
  return nav.items.map((item, i) => ({
    id: item.id,
    label: item.label,
    n: i + 1,
    active: item.id === nav.activeId,
    disabled: item.disabled,
  }));
}

/* ──────────────────────────────────────────────────────────────────────────
 * THE HEADER
 * ────────────────────────────────────────────────────────────────────────── */

const PortalHeader = ({
  logoTo = '/',
  progress,
  sectionNav,
  sectionNavExpected = false,
  accountNav,
  inPhotos = false,
  photoCount = null,
}: PortalHeaderProps) => {
  // A single item is not navigation, it is a label. Two is the floor for both.
  const hasSectionBar = !!sectionNav && sectionNav.items.length > 1;
  const hasAccountBar = !!accountNav && accountNav.items.length > 1;

  // Who the phone's middle slot belongs to. Not the same question as whether
  // the photo bar can be DRAWN yet: the two-bar nav owns the slot from the
  // first render of a page that is going to have it, and the bar simply moves
  // in when its items arrive. Anything else painting there in the meantime is
  // a state the client watches disappear. See sectionNavExpected.
  const navOwnsMobileSlot = hasSectionBar || sectionNavExpected;

  /**
   * And on a desktop, ALWAYS, once there is an account menu to put there.
   *
   * This used to wait until the booking was finished, and until then the
   * booking's sections lived in a second sticky row of pills below the header.
   * That row cost roughly fifty pixels of the first screenful and made an
   * unfinished booking look like a different product from a finished one, for
   * no reason other than the order the two states were built in. The same list
   * is behind the same control in both states now.
   *
   * The progress track keeps its place alongside rather than being displaced:
   * they are different facts. The track says where the booking is, the control
   * says where the page is.
   */
  const navOwnsDesktopSlot = hasAccountBar || !hasContract(progress);

  /**
   * The handoff itself.
   *
   * Gated on the photo bar having somewhere to go: condensing the account bar
   * when there is no section nav to take its place would leave the client
   * looking at a burger and an empty header. A guest on /portal/pass has no
   * account bar at all, so the photo bar simply owns the slot outright there.
   */
  const handoff = hasSectionBar && (hasAccountBar ? inPhotos : true);
  const photoBarShown = handoff;
  const accountMini = hasAccountBar && handoff;

  const delivered = !!progress?.photosDelivered;
  // Delivered AND paid AND signed. See isPortalComplete: a cue that appears
  // while money is owed is the wrong thing to say.
  const photosReady = isPortalComplete(progress);

  const shareItem = accountNav?.items.find((i) => i.role === 'share');

  const remaining =
    progress && progress.amountOwed !== null ? progress.amountOwed - progress.paidToDate : null;
  // Never "$0". Nothing owed means nothing to say here, and the corner is
  // worth more as a door than as a receipt: Share takes it instead.
  const showBalance = remaining !== null && remaining > 0;

  /**
   * Which money state the corner is reporting, because they are three
   * different messages and a single "Balance" label said one thing for all of
   * them.
   *
   *   retainer  nothing is reserved yet. The date can still go to someone
   *             else, which is the only genuinely urgent money on this screen,
   *             so it is the only one that gets to be red.
   *   balance   the date is held and the rest is owed later. Two numbers, not
   *             one: what has landed, and what is left. A lone "$750" hides
   *             the fact that they have already paid most of it.
   *
   * A contract with no named retainer treats any payment at all as the
   * retainer being in, which is the same rule buildSteps uses so the track and
   * the corner cannot disagree.
   */
  const retainerAmt = progress?.retainerAmount ?? null;
  const paidSoFar = progress?.paidToDate ?? 0;
  const retainerOutstanding = progress ? retainerStillDue(progress) : false;
  // Only ever the retainer itself. It used to fall through to the whole
  // remaining balance when no retainer was named, which is what put the word
  // "Retainer" in red above the full amount of the booking.
  const retainerDue =
    retainerAmt !== null && retainerAmt > 0 ? Math.max(retainerAmt - paidSoFar, 0) : 0;

  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  /**
   * Where the reader's pointer was when they opened the menu, in viewport x, or
   * null when there was no pointer.
   *
   * A wide bar is most of the header, and a panel that always hangs off its left
   * edge can open a long way from the hand that asked for it. So on a DESKTOP a
   * click puts the panel under the click. Null is the honest answer for a
   * keyboard, and for the condensed bar, which is small enough that its own edge
   * IS where the reader was pointing. See DesktopMenuPanel.
   */
  const [openAtX, setOpenAtX] = useState<number | null>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  const accountTriggerRef = useRef<HTMLElement | null>(null);
  const sectionTriggerRef = useRef<HTMLElement | null>(null);
  // Stable ids for aria-controls. useId rather than a literal because two
  // headers could in principle be on one page, and a duplicated id points a
  // screen reader at the wrong panel.
  const uid = useId();
  const sectionPanelId = `${uid}-sections`;
  const accountPanelId = `${uid}-account`;
  const progressPanelId = `${uid}-progress`;

  /**
   * Escape, and a press anywhere outside the header, close whichever menu is
   * open.
   *
   * The test is the HEADER, not the panel: both triggers live inside it, and a
   * press on a trigger is its own business. Closing here first would fight the
   * trigger's onClick, which would reopen the menu in the same gesture and make
   * tapping it a second time do nothing at all. Tapping the OTHER trigger is a
   * swap for the same reason, which is what keeps one menu open at a time.
   *
   * Only subscribed while something is open, so a portal sitting idle carries
   * no document level listeners.
   */
  useEffect(() => {
    if (openMenu === null) return;
    const close = () => setOpenMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onPress = (e: Event) => {
      const el = headerRef.current;
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPress, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPress, true);
    };
  }, [openMenu]);

  /**
   * The handoff closes whatever is open.
   *
   * A menu anchored to a bar that is in the middle of shrinking to a burger is a
   * panel hanging off nothing, and its rows are about to change underneath the
   * reader's thumb anyway: crossing into the photos is what drops Photos from
   * the account list.
   */
  useEffect(() => {
    setOpenMenu(null);
  }, [handoff]);

  const toggleMenu = useCallback((which: Exclude<OpenMenu, null>, pointerX: number | null = null) => {
    setOpenMenu((open) => (open === which ? null : which));
    setOpenAtX(pointerX);
  }, []);

  const pickFrom = useCallback((nav: PortalMenuNav | undefined, id: string) => {
    setOpenMenu(null);
    nav?.onSelect(id);
  }, []);

  // The rows, built once per render and handed to both renderings of each
  // menu. The desktop account menu is the same list minus Share, which has its
  // own button up in the corner.
  const accountRowsMobile = useMemo(
    () =>
      accountNav ? buildAccountRows(accountNav, { delivered, inPhotos: handoff, photoCount }) : [],
    [accountNav, delivered, handoff, photoCount],
  );
  const accountRowsDesktop = useMemo(
    () =>
      accountNav
        ? buildAccountRows(accountNav, {
            delivered,
            inPhotos: handoff,
            photoCount,
            dropShare: true,
          })
        : [],
    [accountNav, delivered, handoff, photoCount],
  );

  /**
   * The stages, and the sections no stage reaches.
   *
   * Contract, Balance and Photos used to appear twice: as status here and as
   * links in the account menu, where only the menu copy did anything. Now the
   * stage is the link, so the menu is whatever is LEFT: Password, Share, and
   * Top on a booking with no event date to claim it.
   *
   * Derived from the stages rather than listed by hand, so a stage that stops
   * being rendered gives its section back to the menu instead of stranding it.
   */
  const steps = useMemo(
    () => (hasContract(progress) ? buildSteps(progress!) : []),
    [progress],
  );
  const coveredIds = useMemo(
    () => new Set(steps.map((x) => x.sectionId).filter(Boolean) as string[]),
    [steps],
  );
  /**
   * Does the progress track own the desktop row?
   *
   * While it does, the track is the section nav: every stage is a link to the
   * section it names. So the control beside it must NOT be a second list of
   * the same words. It becomes "More", holding only what no stage reaches.
   * Once the booking is finished the track stands down and the full account
   * bar comes back, which is the state Alex has already approved.
   */
  const trackOwnsDesktopRow = hasContract(progress) && !isPortalComplete(progress);

  const uncoveredRows = useMemo(
    () => accountRowsMobile.filter((r) => !r.jump && !coveredIds.has(r.id)),
    [accountRowsMobile, coveredIds],
  );
  const uncoveredRowsDesktop = useMemo(
    () => accountRowsDesktop.filter((r) => !r.jump && !coveredIds.has(r.id)),
    [accountRowsDesktop, coveredIds],
  );
  /** What the desktop control actually offers right now. */
  const desktopMenuRows = trackOwnsDesktopRow ? uncoveredRowsDesktop : accountRowsDesktop;

  const sectionRows = useMemo(
    () => (sectionNav ? buildSectionRows(sectionNav) : []),
    [sectionNav],
  );

  const sectionIndex = sectionNav
    ? Math.max(
        0,
        sectionNav.items.findIndex((i) => i.id === sectionNav.activeId),
      )
    : 0;
  /**
   * THE LABEL SAYS WHERE YOU ARE. THE COUNTER SAYS WHAT YOU CAN PICK.
   *
   * They are two different questions and they used to be answered by one lookup,
   * which is why the bar read "Top" to a client standing in the middle of their
   * photos. Both readings were defensible and only one of them was the bar's
   * job: naming the current section is what the eyebrow "Your account" promises,
   * and Photos is a section whether or not it is still a row you can choose.
   *
   * So the label comes from the NAV, which knows every section including the
   * ones the menu has stopped listing, and the counter comes from the ROWS,
   * which is the list being offered. They are allowed to disagree, and when
   * they do the counter stands down rather than inventing a position: see
   * barCounterFor.
   *
   * The counter is per width because the two menus are. A phone lists Share and
   * a desktop does not, so one string would be wrong at one of them, and it was
   * wrong at the desktop, where the bar counted five rows over a menu of four.
   */
  const accountBarLabel =
    accountNav?.items.find((i) => i.id === accountNav.activeId)?.label ??
    // Nothing active at all: name the first place they could go rather than
    // leaving the bar blank. The full portal's scan always has an answer, so
    // this is for a caller that has not scanned yet.
    accountRowsMobile.find((r) => !r.jump)?.label ??
    '';
  const accountBarCounter = {
    base: barCounterFor(accountRowsMobile),
    md: barCounterFor(accountRowsDesktop),
  };

  return (
    <Box
      as="header"
      ref={headerRef}
      position="fixed"
      top={0}
      left={0}
      right={0}
      h={HEADER_CLEARANCE}
      zIndex={1000}
      bg="rgba(255, 255, 255, 0.94)"
      backdropFilter="blur(10px)"
      borderBottom="1px solid"
      borderColor="gray.100"
    >
      <Flex h="100%" align="center" gap={{ base: 2, md: 4 }} px={{ base: 3, md: 6 }}>
        {/* Logo. Plain navigation home, nothing clever attached to it. */}
        <Box
          as={RouterLink}
          to={logoTo}
          flexShrink={0}
          display="flex"
          alignItems="center"
          h={CONTROL_H}
          px={1}
          _hover={{ opacity: 0.8, textDecoration: 'none' }}
          transition="opacity 0.2s"
          sx={{ WebkitTapHighlightColor: 'transparent', ...STILL }}
          aria-label="Vero Photography, back to the main site"
        >
          {/* The monogram on phones, where a 263px wordmark would take the
              whole row and leave no space for the nav.

              WHICH mark is a portal decision; HOW BIG is the site's, and both
              of these take the public navbar's own clamps rather than a size of
              their own. That is what makes the two headers the same height: the
              navbar is padding around a logo of exactly this size, so a portal
              logo 10px shorter would have been a portal header 10px shorter, or
              a fixed 72px box with the mark rattling around inside it.

              The breakpoint on the clamps is `lg`, like the navbar's, and not
              the `md` that decides which mark shows. Between the two the
              wordmark wears the mobile clamp, which is already at its 2.5rem
              ceiling by 375px and therefore the same 40px. Matching the
              navbar's structure exactly is worth more here than tidiness. */}
          <Image
            src="/assets/images/logo-mark.svg"
            alt="Vero Photography"
            htmlWidth={60}
            htmlHeight={60}
            h={{ base: SITE_LOGO_H_MOBILE, lg: SITE_LOGO_H }}
            w={{ base: SITE_LOGO_H_MOBILE, lg: SITE_LOGO_H }}
            display={{ base: 'block', md: 'none' }}
          />
          <Image
            src="/assets/images/logo.svg"
            alt="Vero Photography"
            htmlWidth={460}
            htmlHeight={70}
            width="auto"
            h={{ base: SITE_LOGO_H_MOBILE, lg: SITE_LOGO_H }}
            display={{ base: 'none', md: 'block' }}
          />
        </Box>

        {/* ORDER MATTERS on a desktop, where the track and the account
            control are both visible: the track comes first so the account
            control sits at the RIGHT of the header, away from the logo,
            and the track gets the width that used to sit empty between
            them. On a phone only ever one of the two is displayed, so the
            order changes nothing there. */}
        {/* The progress track, at whichever widths the two-bar nav has not
            taken the slot. Not rendered at all when that is neither of them: a
            display:none track in the markup is dead weight in the one place on
            the page where every byte is in front of the client's face. The
            guard is two plain booleans, not a measured width, so it is the same
            answer in the prerendered HTML and in the client's first paint. */}
        {hasContract(progress) && !(navOwnsMobileSlot && isPortalComplete(progress)) && (
          <Box
            flex="1"
            minW={0}
            display={{
              base: navOwnsMobileSlot ? 'none' : 'block',
              // Shown alongside the account control now rather than instead of
              // it, and gone only when the booking is finished, because a
              // track whose every step is done is a receipt rather than a
              // direction.
              md: isPortalComplete(progress) ? 'none' : 'block',
            }}
          >
            <ProgressTrack
              steps={steps}
              suppressMoneyDetail={showBalance}
              open={openMenu === 'progress'}
              onToggle={() => toggleMenu('progress')}
              panelId={progressPanelId}
              onGo={(id) => pickFrom(accountNav, id)}
            />
          </Box>
        )}

        {/* The slot. It holds the two-bar nav, or the 1-2-3 progress, and the
            choice is made separately per width by plain `display`, never by a
            measured breakpoint. A phone hands the slot over the moment there
            are photos; a desktop keeps the progress until the booking is
            finished, because it has a second row of its own underneath for the
            booking's sections until then. */}
        <Flex
          flex="1"
          minW={0}
          align="center"
          gap={SLOT_GAP}
          // Capped on a WIDE screen while the progress track is still beside
          // it. Left to flex freely the account control stretched to nearly
          // seven hundred pixels, which reads as a search field rather than a
          // menu: a control that wide looks like somewhere to type. Uncapped
          // again once the booking is finished, because then it shares the row
          // with the photo bar and the two split the width between them.
          maxW={{ base: 'none', md: isPortalComplete(progress) ? 'none' : '300px' }}
          display={{
            base: navOwnsMobileSlot ? 'flex' : 'none',
            md: navOwnsDesktopSlot ? 'flex' : 'none',
          }}
        >
          {/* The photo bar LEADS and the account bar follows it, so that when
              the account bar condenses it lands at the far RIGHT of the header,
              as far from the logo as the row allows. */}
          {hasSectionBar && (
            <NavBar
              kind="photo"
              triggerRef={sectionTriggerRef}
              shown={photoBarShown}
              eyebrow="Photo section"
              label={sectionNav!.items[sectionIndex].label}
              counter={`${sectionIndex + 1} / ${sectionNav!.items.length}`}
              open={openMenu === 'sections'}
              onToggle={(x) => toggleMenu('sections', x)}
              panelId={sectionPanelId}
              ticks={{ total: sectionNav!.items.length, index: sectionIndex }}
            />
          )}
          {hasAccountBar && (
            <NavBar
              kind="account"
              triggerRef={accountTriggerRef}
              shown
              mini={accountMini}
              eyebrow={trackOwnsDesktopRow ? 'More' : 'Your account'}
              label={trackOwnsDesktopRow ? (desktopMenuRows[0]?.label ?? '') : accountBarLabel}
              counter={trackOwnsDesktopRow ? { base: '', md: '' } : accountBarCounter}
              ready={photosReady}
              open={openMenu === 'account'}
              onToggle={(x) => toggleMenu('account', x)}
              panelId={accountPanelId}
            />
          )}
        </Flex>

        {showBalance && (
          <Flex direction="column" align="flex-end" flexShrink={0} lineHeight="1.15">
            <Text
              fontSize="2xs"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.18em"
              color={retainerOutstanding || progress?.overdue ? 'red.600' : 'brand.accentText'}
            >
              {retainerOutstanding ? 'Retainer' : 'Balance'}
            </Text>
            {retainerOutstanding ? (
              // One number, red. Until this lands the date is not held, so it
              // is the one piece of money on this page that is genuinely
              // time-sensitive rather than merely outstanding.
              <Text fontSize={{ base: 'sm', md: 'md' }} fontWeight="500" color="red.600">
                {formatMoney(retainerDue)}
              </Text>
            ) : (
              // Paid over remaining, stacked and rule-separated, so it reads
              // as the fraction it is. The green number is what they have
              // already handed over, which a lone remaining figure throws
              // away.
              <Flex direction="column" align="flex-end" lineHeight="1.05">
                <Text fontSize={{ base: '2xs', md: 'xs' }} fontWeight="600" color="brand.success">
                  {formatMoney(paidSoFar)}
                </Text>
                <Box w="100%" h="1px" bg="gray.300" my="2px" />
                <Text
                  fontSize={{ base: 'xs', md: 'sm' }}
                  fontWeight="500"
                  color={progress?.overdue ? 'red.600' : 'gray.800'}
                >
                  {formatMoney(remaining!)}
                </Text>
              </Flex>
            )}
          </Flex>
        )}

        {/* The desktop corner. No "Balance: Paid": a settled balance is not
            news, and the corner is worth more as a door than as a receipt. The
            balance above DOES take it back the moment something is owed, which
            is the only time the number earns the space.

            The phone keeps Share in its menu instead, because a phone has no
            corner to spare. */}
        {/* Only once the photos are actually delivered. It used to appear the
            moment the account menu had a share row, which is before the
            gallery exists: the client was offered a Share button on a booking
            with nothing behind it, next to a step 3 that plainly said the
            photos had not arrived. */}
        {shareItem && progress?.photosDelivered && !showBalance && navOwnsDesktopSlot && (
          <Flex
            as="button"
            type="button"
            data-portal-share
            onClick={() => pickFrom(accountNav, shareItem.id)}
            display={{ base: 'none', md: 'flex' }}
            align="center"
            gap={2}
            flexShrink={0}
            h={CONTROL_H.md}
            px={3}
            borderRadius={CONTROL_RADIUS.md}
            border="1px solid"
            borderColor="brand.accentBorder"
            bg="brand.surface"
            color="brand.accentText"
            fontSize="2xs"
            fontWeight="500"
            letterSpacing="0.14em"
            textTransform="uppercase"
            cursor="pointer"
            transition="background 0.2s ease, border-color 0.2s ease"
            _hover={{ bg: 'brand.surfaceSunken', borderColor: 'brand.accent' }}
            sx={{ WebkitTapHighlightColor: 'transparent', ...STILL }}
          >
            <Icon as={FaShareAlt} boxSize={3} />
            Share
          </Flex>
        )}

        {/* The burger is GONE, and that is the point of this change.
            It existed only to reach the account menu while the progress track
            owned the row, and that menu listed Contract, Balance and Photos:
            the same three words the track was already showing as status, with
            only the menu copy doing anything. The track's own panel now
            carries every stage AND the sections no stage covers, so a second
            control opening a second list of the same words is exactly the
            duplication being removed. Once the photos land the account bar is
            back in the slot with its own trigger, as before. */}
      </Flex>

      {/* The panels. They hang off the header rather than covering the screen,
          so the photos stay visible behind the menu that is navigating them.

          Two renderings of each, one per width, because they are genuinely
          different shapes: a phone scrolls a single column and says how much
          is left below it, a desktop spends its width showing every item at
          once in columns and never scrolls at all. The ROWS are built once and
          shared, so the two cannot disagree about what is in the list. */}
      {/* Every step, under the phone header, when the current step is tapped.
          Desktop never opens this: the whole track is already on screen. */}
      {hasContract(progress) && !(navOwnsMobileSlot && isPortalComplete(progress)) && (
        <ProgressPanel
          id={progressPanelId}
          steps={steps}
          open={openMenu === 'progress'}
          extras={uncoveredRows}
          onGo={(id) => pickFrom(accountNav, id)}
        />
      )}

      {hasSectionBar && (
        <>
          <PhoneMenuPanel
            id={sectionPanelId}
            heading="Jump to a section"
            rows={sectionRows}
            open={openMenu === 'sections'}
            onPick={(id) => pickFrom(sectionNav, id)}
          />
          <DesktopMenuPanel
            heading="Jump to a section"
            rows={sectionRows}
            cols={3}
            open={openMenu === 'sections'}
            anchorRef={sectionTriggerRef}
            headerRef={headerRef}
            // The photo bar is only ever wide, so a click on it is always a
            // click somewhere along a bar most of the header across.
            pointerX={openAtX}
            onPick={(id) => pickFrom(sectionNav, id)}
          />
        </>
      )}
      {hasAccountBar && (
        <>
          <PhoneMenuPanel
            id={accountPanelId}
            heading="Your account"
            rows={accountRowsMobile}
            open={openMenu === 'account'}
            onPick={(id) => pickFrom(accountNav, id)}
          />
          <DesktopMenuPanel
            heading={trackOwnsDesktopRow ? 'More' : 'Your account'}
            rows={desktopMenuRows}
            cols={trackOwnsDesktopRow ? 1 : 2}
            open={openMenu === 'account'}
            anchorRef={accountTriggerRef}
            headerRef={headerRef}
            // Only while the bar is WIDE. Condensed it is a 168px control in the
            // corner, small enough that its own left edge is already where the
            // reader pointed, and moving its panel a few px sideways would read
            // as the menu wobbling rather than as it following the hand.
            pointerX={accountMini ? null : openAtX}
            onPick={(id) => pickFrom(accountNav, id)}
          />
        </>
      )}
    </Box>
  );
};

/* ──────────────────────────────────────────────────────────────────────────
 * THE TWO BARS
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The bar's counter, and it may differ per width because the two menus do: a
 * phone's account menu lists Share and a desktop's does not. An empty string at
 * a width means there is no honest number to show there, and nothing is
 * rendered at that width rather than an empty span the row's gap still pays
 * for. See barCounterFor.
 */
type BarCounter = string | { base: string; md: string };

/** Plain responsive `display`, which is how this header splits every width. */
type NavBarDisplay = 'block' | { base: 'block' | 'none'; md: 'block' | 'none' };

interface NavBarProps {
  kind: 'photo' | 'account';
  triggerRef: MutableRefObject<HTMLElement | null>;
  /** The photo bar is absent until the reader is in the photos. */
  shown: boolean;
  /** The account bar is never absent, only condensed. */
  mini?: boolean;
  eyebrow: string;
  label: string;
  counter: BarCounter;
  /** The account bar's green cue. Delivered AND paid, or nothing. */
  ready?: boolean;
  open: boolean;
  /**
   * @param pointerX viewport x of the click, or null when it came from the
   * keyboard. The desktop panel opens under the pointer; see DesktopMenuPanel.
   */
  onToggle: (pointerX: number | null) => void;
  panelId: string;
  /** The photo bar's progress row: one tick per section. */
  ticks?: { total: number; index: number };
}

/**
 * Where the pointer was when a button was clicked, or null when there was no
 * pointer.
 *
 * Enter and Space on a focused button fire a click too, with `detail` 0 and a
 * clientX of 0. Zero is the window's left edge, not a place the reader chose,
 * so treating it as a position would fling every keyboard user's menu into the
 * corner. `detail` is the standard way to tell the two apart and it is the one
 * thing standing between this feature and breaking keyboard navigation.
 */
const pointerXOf = (e: { detail: number; clientX: number }): number | null =>
  e.detail > 0 ? e.clientX : null;

/**
 * One of the header's two bars.
 *
 * Four things in one control's height, and the order is the order they are
 * wanted in. The
 * eyebrow says what kind of thing the name underneath is, since "Ceremony"
 * alone in a header could be anything. The counter answers "how much more is
 * there", which is the question a long list actually provokes. The chevron says
 * this opens. And along the bottom edge of the photo bar, one tick per section:
 * the counter again, as a shape, so a thumb learns the length of the gallery
 * without reading a number.
 *
 * Nothing here may overflow, because the header is the whole chrome and a
 * header that can be dragged sideways takes the page with it. The only elastic
 * part is the name, which truncates; everything else is flexShrink 0 and
 * measured.
 *
 * THE WIDTHS ANIMATE, which is what makes this a handoff rather than a swap:
 * the account bar visibly condenses into the burger while the photo bar grows
 * into its place. `flex-grow` and `flex-basis` are what move, and because the
 * two bars share one flex container their widths always sum to the slot, so
 * nothing can overflow mid-movement.
 *
 * The absent photo bar is GENUINELY zero, not merely invisible: 1px of border
 * each side plus the slot's gap would otherwise steal 10px from the account bar
 * for a control that is not on screen. The negative margin cancels the gap.
 */
function NavBar({
  kind,
  triggerRef,
  shown,
  mini = false,
  eyebrow,
  label,
  counter,
  ready = false,
  open,
  onToggle,
  panelId,
  ticks,
}: NavBarProps) {
  const isPhoto = kind === 'photo';
  // The photo bar animates in and out of existence; the account bar animates
  // between wide and condensed and is always there.
  const wide = isPhoto ? shown : !mini;
  const contentIn = isPhoto ? PHOTO_CONTENT_IN : ACCOUNT_CONTENT_IN;
  const contentOut = isPhoto ? PHOTO_CONTENT_OUT : ACCOUNT_CONTENT_OUT;

  /**
   * How the contents behave while the box is condensed.
   *
   * On a PHONE the account bar becomes a square burger, so its words have to
   * clear out. On a DESKTOP it becomes a 168px labelled control, so they stay:
   * a burger on a wide header hides a menu for no reason, and the whole value
   * of the condensed state there is that it still names where the reader is.
   * The photo bar is either there or not at both widths.
   */
  const contentHidden = isPhoto ? !shown : mini;
  const contentOpacity = isPhoto
    ? shown
      ? 1
      : 0
    : { base: mini ? 0 : 1, md: 1 };
  const contentShift = isPhoto
    ? shown
      ? 'none'
      : 'translateX(14px)'
    : { base: mini ? 'translateX(-12px)' : 'none', md: 'none' };
  const contentTransition = contentHidden ? contentOut : contentIn;
  const contentSx = { ...STILL };

  /**
   * The counter, as the spans that will render it.
   *
   * ONE span when both widths say the same thing, which is every case but the
   * account bar's. Two responsive ones when they differ, because a single text
   * node cannot say two things. NONE when a width has nothing to count: an
   * empty span still costs the row's gap, and a 390px header has spent that gap
   * on the section name.
   */
  const counterWidths = typeof counter === 'string' ? { base: counter, md: counter } : counter;
  const counterParts: Array<{ key: string; text: string; display: NavBarDisplay }> =
    counterWidths.base === counterWidths.md
      ? counterWidths.base
        ? [{ key: 'both', text: counterWidths.base, display: 'block' }]
        : []
      : [
          ...(counterWidths.base
            ? [
                {
                  key: 'base',
                  text: counterWidths.base,
                  display: { base: 'block', md: 'none' } as NavBarDisplay,
                },
              ]
            : []),
          ...(counterWidths.md
            ? [
                {
                  key: 'md',
                  text: counterWidths.md,
                  display: { base: 'none', md: 'block' } as NavBarDisplay,
                },
              ]
            : []),
        ];

  return (
    <Flex
      as="button"
      type="button"
      ref={triggerRef as MutableRefObject<never>}
      onClick={(e) => onToggle(pointerXOf(e))}
      data-portal-photo-bar={isPhoto ? 'true' : undefined}
      data-portal-account-bar={isPhoto ? undefined : 'true'}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={isPhoto ? 'Jump to a photo section' : 'Your account menu'}
      position="relative"
      // grow/basis rather than a width: the two bars share one flex container,
      // so what one gives up the other takes in the same frame and the slot is
      // always exactly full.
      flexGrow={wide ? 1 : 0}
      flexBasis={wide ? '0px' : isPhoto ? '0px' : ACCOUNT_MINI_W}
      flexShrink={wide ? 1 : 0}
      minW={0}
      h={CONTROL_H}
      // The ticks run to the very edge, so the radius has to clip them, and a
      // name longer than the box has to be cut rather than pushed out of it.
      overflow="hidden"
      align="center"
      textAlign="left"
      // 6px on a phone. Four things share this row at 390px and the two px the
      // usual gap costs three times over are two px the section name does not
      // have to truncate.
      gap={{ base: '6px', md: '10px' }}
      pl={isPhoto ? (shown ? { base: '12px', md: '14px' } : '0px') : { base: mini ? '0px' : '12px', md: '14px' }}
      pr={isPhoto ? (shown ? { base: '10px', md: '12px' } : '0px') : { base: mini ? '0px' : '10px', md: '12px' }}
      // The ticks own the bottom SECTION_TICK_H, so the text is centred in
      // what is left rather than in the whole button.
      pb={ticks ? SECTION_TICK_H : undefined}
      mr={isPhoto ? (shown ? '0px' : SLOT_GAP_NEG) : undefined}
      opacity={isPhoto ? (shown ? 1 : 0) : 1}
      pointerEvents={isPhoto && !shown ? 'none' : 'auto'}
      bg={!isPhoto && mini ? { base: 'gray.50', md: 'white' } : 'white'}
      border="1px solid"
      borderWidth={isPhoto ? (shown ? '1px' : '0px') : '1px'}
      borderColor="gray.200"
      borderRadius={CONTROL_RADIUS}
      cursor="pointer"
      transition={BOX_TRANSITION}
      _hover={{ borderColor: 'brand.accent' }}
      sx={{ WebkitTapHighlightColor: 'transparent', ...STILL }}
    >
      {/* minW 0 on the flex item AND nowrap/ellipsis on both lines. Without the
          first, a long section name refuses to shrink and pushes the counter
          out of the header rather than truncating. Without the second on the
          EYEBROW as well, it runs straight out of its box on a narrow phone and
          paints over the counter sitting to its right. */}
      {/* `as="span"` on every one of these, here and in the menus below: a
          button's content model is phrasing content, and Chakra's Text is a
          <p> by default. display block gives back the stacking a <p> would
          have. */}
      <Box
        as="span"
        display="block"
        flex="1"
        minW={0}
        opacity={contentOpacity}
        transform={contentShift}
        transition={contentTransition}
        sx={contentSx}
      >
        {/* 8px, and tracked at 0.12em rather than the 0.16em the rest of the
            portal's eyebrows use. Both are measured: "YOUR ACCOUNT" has about
            71px to live in once the readiness pill and the counter have taken
            their share of a 390px phone, and the same again inside the 168px
            the desktop bar condenses to. At the usual size it ran out of room
            in both and read "YOUR ACCOU...", which looks like a bug rather
            than a style. */}
        <Text
          as="span"
          display="block"
          fontSize="8px"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.12em"
          color="gray.500"
          lineHeight="1.2"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {eyebrow}
        </Text>
        <Text
          as="span"
          // A stable hook for the guard that keeps this label honest. Reading
          // the whole bar's text instead picks up the readiness pill, which is
          // still in the DOM at opacity 0 while the bar is a burger.
          data-portal-bar-label="true"
          display="block"
          fontSize={{ base: '13px', md: '14px' }}
          fontWeight="500"
          color="gray.800"
          lineHeight="1.25"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {label}
        </Text>
      </Box>

      {/* The readiness cue. Only ever on the account bar, only ever when the
          gallery is delivered AND the balance is settled, and gone again the
          moment the bar condenses: a burger has no room for it and 168px is
          already carrying a label and a counter. */}
      {ready && (
        <Flex
          as="span"
          data-portal-ready="true"
          align="center"
          gap={1}
          flexShrink={0}
          display={{ base: 'flex', md: mini ? 'none' : 'flex' }}
          px="7px"
          py="3px"
          borderRadius="full"
          bg={READY_TINT}
          border="1px solid"
          borderColor={READY_BORDER}
          color="brand.success"
          fontSize="9px"
          fontWeight="500"
          letterSpacing="0.08em"
          textTransform="uppercase"
          whiteSpace="nowrap"
          opacity={contentOpacity}
          transform={contentShift}
          transition={contentTransition}
          sx={contentSx}
        >
          <Icon as={FaCamera} boxSize={2.5} />
          Photos are ready
        </Flex>
      )}

      {counterParts.map((part) => (
        <Text
          key={part.key}
          as="span"
          data-portal-bar-counter="true"
          display={part.display}
          fontSize="2xs"
          color="gray.500"
          flexShrink={0}
          opacity={contentOpacity}
          transform={contentShift}
          transition={contentTransition}
          // Tabular figures, or the counter jiggles sideways as the reader
          // scrolls past a 1 and the column is a few px from an ellipsis.
          sx={{ fontVariantNumeric: 'tabular-nums', ...contentSx }}
        >
          {part.text}
        </Text>
      ))}
      <Box
        as="span"
        display="block"
        flexShrink={0}
        opacity={contentOpacity}
        transform={contentShift}
        transition={contentTransition}
        sx={contentSx}
      >
        <Icon
          as={FaChevronDown}
          boxSize={2.5}
          color="gray.500"
          display="block"
          transform={open ? 'rotate(180deg)' : 'rotate(0deg)'}
          transition={`transform ${MENU_FADE} ease`}
          sx={STILL}
        />
      </Box>

      {/* The burger, for the phone's condensed account bar.

          The BOX fades and scales, and the bars inside it do not animate on
          entry at all. That separation is the whole trick: opacity lives out
          here, where a delay is safe, and the X morph lives inside BurgerMenu,
          where any delay shows up as the menu sticking half open on close. An
          earlier version gave each bar its own delay so they would draw in one
          by one; it looked good going in and was wrong coming out, because the
          same delays applied to the X. */}
      {!isPhoto && (
        <Box
          as="span"
          data-portal-burger-box="true"
          position="absolute"
          inset={0}
          display={{ base: 'grid', md: 'none' }}
          placeItems="center"
          pointerEvents="none"
          opacity={mini ? 1 : 0}
          visibility={mini ? 'visible' : 'hidden'}
          transform={mini ? 'scale(1)' : 'scale(0.72)'}
          transition={mini ? BARS_IN : BARS_OUT}
          sx={STILL}
        >
          {/* The site's own burger, so the morph cannot drift from the one a
              client just used on the public site.

              `as: 'span'` because this bar is already a <button> and a button
              inside a button is neither valid nor clickable. The span's own
              click is a no-op and the event bubbles to the bar, which is what
              toggles; its aria is cleared for the same reason, since the bar
              carries the real haspopup/expanded/controls. `frame` is documented
              as the escape hatch for exactly this. */}
          <BurgerMenu
            isOpen={mini && open}
            onClick={() => {}}
            barColor="gray.700"
            barColorOpen="gray.700"
            frame={{
              as: 'span',
              display: 'block',
              p: 0,
              w: '24px',
              h: '20px',
              zIndex: 'auto',
              cursor: 'inherit',
              'aria-label': undefined,
              'aria-expanded': undefined,
            }}
          />
        </Box>
      )}

      {/* One tick per item, equal width, the whole width of the bar. Behind
          the reader is filled, the one they are in is stronger, ahead is
          track. It wipes in left to right rather than fading, so the eye
          follows the bar growing into place. aria-hidden because the counter
          above already says this in words and a screen reader does not want it
          twice. */}
      {ticks && (
        <Flex
          as="span"
          data-portal-ticks="true"
          position="absolute"
          left={0}
          right={0}
          bottom={0}
          h={SECTION_TICK_H}
          gap="1px"
          aria-hidden="true"
          clipPath={shown ? 'inset(0 0 0 0)' : 'inset(0 100% 0 0)'}
          transition={shown ? TICKS_IN : TICKS_OUT}
          sx={STILL}
        >
          {Array.from({ length: ticks.total }, (_, i) => (
            <Box
              key={i}
              as="span"
              display="block"
              flex="1"
              h="100%"
              bg={
                i < ticks.index
                  ? 'brand.accent'
                  : i === ticks.index
                    ? 'brand.accentStrong'
                    : 'gray.200'
              }
            />
          ))}
        </Flex>
      )}
    </Flex>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * THE MENUS
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * One row, in either menu.
 *
 * The pinned See photos row is the same element wearing a different coat:
 * green, unnumbered, a camera where the number would be, the image count and
 * an arrow on the right, and a green rail down its edge so it reads as an
 * action before the words are read.
 */
function MenuRowButton({
  row,
  desktop = false,
  onPick,
}: {
  row: MenuRow;
  desktop?: boolean;
  onPick: (id: string) => void;
}) {
  const jump = !!row.jump;
  return (
    <Flex
      as="button"
      type="button"
      role="menuitem"
      data-portal-row="true"
      data-portal-jump={jump ? 'true' : undefined}
      disabled={row.disabled}
      onClick={() => onPick(row.id)}
      aria-current={row.active ? 'true' : undefined}
      position="relative"
      align="center"
      gap={3}
      w="100%"
      minH="44px"
      px={4}
      py={2}
      borderRadius={desktop ? '8px' : undefined}
      textAlign="left"
      gridColumn={desktop && jump ? '1 / -1' : undefined}
      bg={jump ? READY_TINT : row.active ? MENU_CURRENT_BG : 'transparent'}
      color={
        jump
          ? 'brand.success'
          : row.disabled
            ? 'gray.400'
            : row.active
              ? 'brand.accentText'
              : 'gray.700'
      }
      fontWeight={jump ? '600' : row.active ? '500' : '400'}
      cursor={row.disabled ? 'default' : 'pointer'}
      transition="background 0.2s ease"
      _hover={
        row.disabled
          ? undefined
          : jump
            ? { bg: 'rgba(47, 122, 77, 0.16)' }
            : row.active
              ? undefined
              : { bg: 'gray.50' }
      }
      _before={
        jump
          ? {
              content: '""',
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              w: '3px',
              bg: 'brand.success',
            }
          : undefined
      }
      sx={{ WebkitTapHighlightColor: 'transparent', ...STILL }}
    >
      {/* The number slot, and what the pinned row puts in it instead. Same
          width either way, so the labels line up down the column. */}
      <Flex
        as="span"
        data-portal-n={jump ? undefined : 'true'}
        align="center"
        justify="flex-start"
        flexShrink={0}
        w="15px"
        fontSize="2xs"
        color={jump ? 'brand.success' : row.active ? 'brand.accentText' : 'gray.400'}
        sx={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {jump ? <Icon as={FaCamera} boxSize={3} /> : row.n}
      </Flex>
      <Text
        as="span"
        flex={jump ? undefined : '1'}
        minW={0}
        flexShrink={jump ? 0 : 1}
        fontSize={jump ? 'xs' : 'sm'}
        letterSpacing={jump ? '0.14em' : undefined}
        textTransform={jump ? 'uppercase' : undefined}
        whiteSpace="nowrap"
        overflow="hidden"
        textOverflow="ellipsis"
      >
        {row.label}
      </Text>
      {jump ? (
        <Flex
          as="span"
          flex="1"
          justify="flex-end"
          align="center"
          gap={1.5}
          fontSize="2xs"
          letterSpacing="0.1em"
          textTransform="uppercase"
          opacity={0.85}
        >
          {row.count}
          <Icon as={FaArrowRight} boxSize={2.5} />
        </Flex>
      ) : (
        row.active && <Icon as={FaCheck} boxSize={2.5} color="brand.accentText" flexShrink={0} />
      )}
    </Flex>
  );
}

/**
 * THE SCROLL CUE.
 *
 * A fade at the bottom edge plus a gold pill saying how many rows are still
 * below it, shown only while something remains and gone the moment the reader
 * reaches the end.
 *
 * The number is the point. A fade alone was too quiet: people read a list as
 * ending where it visually fades, and a shadow is easy to mistake for a border.
 * A count is a fact that cannot be misread.
 *
 * Nothing about the list's height changes, so the menu still shows the same
 * rows it did before; this only tells the truth about the rest.
 */
function MenuScrollCue({
  scrollRef,
  open,
  rowKey,
}: {
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  open: boolean;
  /** Changes whenever the rows do, so the count is re-measured. */
  rowKey: string;
}) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => {
      const canScroll = el.scrollHeight - el.clientHeight > 4;
      const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      if (!canScroll || atEnd) {
        setRemaining(0);
        return;
      }
      // Count the rows the reader has not seen ALL of, which is the question
      // they are actually asking. Counting only rows that start below the edge
      // reports zero on a list that overflows by less than one row, and a cue
      // that vanishes while there is still something under it is worse than no
      // cue: it says the list has ended when it has not.
      const edge = el.getBoundingClientRect().bottom;
      let hidden = 0;
      el.querySelectorAll('[data-portal-row]').forEach((row) => {
        if (row.getBoundingClientRect().bottom > edge + 2) hidden += 1;
      });
      setRemaining(hidden);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // The rows can change height under a closed menu (a section name wrapping
    // at a new width), and the list itself changes as the reader crosses into
    // the photos, so watch the box rather than trusting the render.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro?.disconnect();
    };
  }, [scrollRef, open, rowKey]);

  const on = remaining > 0;
  return (
    <Flex
      data-portal-more="true"
      data-portal-more-count={remaining}
      position="absolute"
      left={0}
      right={0}
      bottom={0}
      h="46px"
      pointerEvents="none"
      align="flex-end"
      justify="center"
      pb={1}
      // A plain inline style, not `bgGradient` and not `sx`. Chakra parses a
      // gradient by splitting on commas and re-joining the stops, which walks
      // straight through the commas inside `rgba(...)` and produces a
      // gradient the browser drops on the floor.
      style={{ backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0), #fff 62%)' }}
      opacity={on ? 1 : 0}
      transition="opacity 0.2s ease"
      aria-hidden="true"
      sx={STILL}
    >
      <Flex
        align="center"
        gap={1.5}
        bg="brand.accent"
        color="white"
        px={2}
        py={1}
        borderRadius="full"
        fontSize="2xs"
        fontWeight="500"
        letterSpacing="0.12em"
        textTransform="uppercase"
        boxShadow="0 2px 8px rgba(36, 33, 28, 0.24)"
      >
        {remaining} more
        <Icon as={FaChevronDown} boxSize={2} />
      </Flex>
    </Flex>
  );
}

/**
 * The phone's menu.
 *
 * Anchored under the header and inset from both edges, not a full screen
 * overlay: these menus navigate the page behind them, and covering it to offer
 * a list of places on it is the thing the gallery's old bottom sheet drawer got
 * wrong.
 *
 * It is always mounted and toggled with opacity, so the fade has something to
 * fade FROM. visibility goes with it, which is what takes the closed panel's
 * items out of the tab order and away from a screen reader rather than leaving
 * an invisible menu in the page.
 */
function PhoneMenuPanel({
  id,
  heading,
  rows,
  open,
  onPick,
}: {
  id: string;
  heading: string;
  rows: MenuRow[];
  open: boolean;
  onPick: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  return (
    <Box
      id={id}
      role="menu"
      aria-label={heading}
      display={{ base: 'block', md: 'none' }}
      position="absolute"
      top="100%"
      left={MENU_INSET}
      right={MENU_INSET}
      mt={MENU_INSET}
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius={MENU_RADIUS}
      boxShadow="0 12px 32px rgba(0, 0, 0, 0.12)"
      // So the cue's gradient is clipped by the radius rather than squaring
      // off the bottom corners.
      overflow="hidden"
      opacity={open ? 1 : 0}
      visibility={open ? 'visible' : 'hidden'}
      pointerEvents={open ? 'auto' : 'none'}
      transition={`opacity ${MENU_FADE} ease, visibility ${MENU_FADE} ease`}
      sx={STILL}
    >
      <Text
        fontSize="2xs"
        fontWeight="500"
        textTransform="uppercase"
        letterSpacing="0.18em"
        color="gray.500"
        px={4}
        pt={3}
        pb={2}
      >
        {heading}
      </Text>
      <Box position="relative">
        <Box
          ref={scrollRef}
          maxH={MENU_MAX_H}
          overflowY="auto"
          overflowX="hidden"
          sx={{ '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}
        >
          {rows.map((row) => (
            <MenuRowButton key={row.id} row={row} onPick={onPick} />
          ))}
        </Box>
        <MenuScrollCue
          scrollRef={scrollRef}
          open={open}
          rowKey={rows.map((r) => `${r.id}:${r.jump ? 'j' : r.n}`).join('|')}
        />
      </Box>
    </Box>
  );
}

/**
 * The desktop's menu.
 *
 * NOT a scrolling list, and not a segmented strip either. A strip is lovely
 * with five sections and broken with nine: the last ones run under whatever
 * else is in the header and get clipped, which is the same sideways overflow
 * that came off the phone. So desktop spends its extra width on the one thing a
 * phone cannot do, and shows EVERY item at once, in columns, with no scrolling
 * and no counting cue needed.
 *
 * WHERE IT OPENS. A wide bar is most of the header across, so hanging its panel
 * off the bar's LEFT edge could put the list a long way from the hand that
 * asked for it: click the right hand end of a 900px bar and the menu appears
 * beside the logo. So a pointer click opens the panel under the pointer, and
 * only its x moves. It still hangs from the bottom of the header, it keeps its
 * size, and it is clamped inside the window exactly as before, so a click near
 * either edge still gets a panel that is fully on screen.
 *
 * `pointerX` is null for the two cases that must keep the old anchoring: a
 * keyboard press, which has no position to follow, and the condensed account
 * bar, which is small enough that its own edge is where the reader pointed.
 * The panel then falls back to the anchor, which is the same clamp with a
 * different starting x rather than a second placement rule.
 */
function DesktopMenuPanel({
  heading,
  rows,
  cols,
  open,
  anchorRef,
  headerRef,
  pointerX,
  onPick,
}: {
  heading: string;
  rows: MenuRow[];
  cols: number;
  open: boolean;
  anchorRef: MutableRefObject<HTMLElement | null>;
  headerRef: MutableRefObject<HTMLDivElement | null>;
  /** Viewport x of the click that opened this, or null. See above. */
  pointerX: number | null;
  onPick: (id: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [left, setLeft] = useState<number | null>(null);

  // useLayoutEffect so the panel is placed in the same frame it becomes
  // visible; a plain effect paints one frame at the wrong x. Aliased for the
  // prerender pass, which has no layout to read.
  const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;
  useIso(() => {
    if (!open) return;
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    const header = headerRef.current;
    if (!panel || !anchor || !header) return;
    // Zero width means this panel is the display:none one for the current
    // width. Nothing to place.
    if (panel.offsetWidth === 0) return;
    const a = anchor.getBoundingClientRect();
    const h = header.getBoundingClientRect();
    const pad = 12;
    // The header spans the window, so clamping to it IS clamping to the
    // viewport: `left` is relative to the header's own box, and the panel is
    // positioned inside it.
    const max = Math.max(pad, h.width - panel.offsetWidth - pad);
    const from = pointerX === null ? a.left : pointerX;
    setLeft(Math.max(pad, Math.min(from - h.left, max)));
  }, [open, rows.length, pointerX, anchorRef, headerRef]);

  return (
    <Box
      ref={panelRef}
      role="menu"
      aria-label={heading}
      data-portal-dmenu={heading}
      display={{ base: 'none', md: 'block' }}
      position="absolute"
      top="100%"
      left={left === null ? MENU_INSET : `${left}px`}
      mt={MENU_INSET}
      zIndex={20}
      minW="300px"
      maxW="640px"
      p={2}
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="14px"
      boxShadow="0 20px 48px rgba(36, 33, 28, 0.22)"
      opacity={open ? 1 : 0}
      visibility={open ? 'visible' : 'hidden'}
      pointerEvents={open ? 'auto' : 'none'}
      transition={`opacity ${MENU_FADE} ease, visibility ${MENU_FADE} ease`}
      sx={STILL}
    >
      <Text
        fontSize="2xs"
        fontWeight="500"
        textTransform="uppercase"
        letterSpacing="0.18em"
        color="gray.500"
        px={2}
        pt={1}
        pb={2}
      >
        {heading}
      </Text>
      <Box
        data-portal-cols={cols}
        display="grid"
        gridTemplateColumns={`repeat(${cols}, minmax(170px, 1fr))`}
        gap="2px"
      >
        {rows.map((row) => (
          <MenuRowButton key={row.id} row={row} desktop onPick={onPick} />
        ))}
      </Box>
    </Box>
  );
}

/**
 * The three step indicator.
 *
 * On a phone only the current step keeps its label. Three labels plus a
 * balance does not fit at 390px, and the numbers carry the shape of the
 * journey on their own once one of them is coloured.
 *
 * The connectors between the steps STRETCH on a phone and stay at a fixed
 * 20px on a desktop. On a phone this track is the only thing in the middle of
 * the header, so a fixed connector left it huddled in the centre with dead
 * space on both sides, reading as three loose badges rather than as a journey
 * with a beginning and an end. Letting the connectors take the slack makes the
 * track span the whole gap between the logo and the balance, which is both the
 * shape of the thing it is describing and a bigger tap-free target for the eye.
 * A desktop header has plenty else in it and does not want the track pulled
 * across the full width, so it keeps its measured 20px.
 */
function ProgressTrack({
  steps,
  suppressMoneyDetail = false,
  open = false,
  onToggle,
  panelId,
  onGo,
}: {
  steps: ProgressStep[];
  /** The balance corner already shows the number, so the phone should not. */
  suppressMoneyDetail?: boolean;
  /** Phone only: whether the full list is showing underneath. */
  open?: boolean;
  onToggle?: () => void;
  panelId?: string;
  /** Take the reader to the section a stage IS. */
  onGo?: (sectionId: string) => void;
}) {
  const current = steps.find((s) => s.current) ?? steps[steps.length - 1];
  /**
   * How far the line is filled. Up to the step they are ON, and no further.
   *
   * Not "is either end done": a client who pays in full before the wedding has
   * a finished Balance step sitting AFTER an unfinished Event step, which is
   * true and worth showing, but colouring the run to it green made the track
   * read green, grey, green and look like it had lost its place.
   */
  const currentIdx = steps.findIndex((s) => s.current);

  return (
    <>
      {/*
        THE PHONE: the step they are on, centred, and pressable for the rest.

        It showed every badge, which two steps in meant two green ticks and a
        number taking most of the row to say nothing anyone could act on. Then
        it showed one step and a "3/5", which is a progress bar written as
        arithmetic: a client does not think of their wedding as five of
        anything. So the count is gone and the chevron is the honest signal
        that there is more, in the one place a phone has room for it: behind a
        tap.
      */}
      <Flex
        as="button"
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Step ${current.n} of ${steps.length}, ${current.label}${
          current.detail ? `, ${current.detail}` : ''
        }. Show every step.`}
        display={{ base: 'flex', md: 'none' }}
        align="center"
        justify="center"
        gap={2}
        w="100%"
        minW={0}
        h={CONTROL_H.base}
        px={2}
        borderRadius={CONTROL_RADIUS.base}
        cursor="pointer"
        bg="transparent"
        transition="background 0.2s ease"
        _hover={{ bg: 'brand.surface' }}
        _focusVisible={{ outline: '2px solid', outlineColor: 'brand.accent', outlineOffset: '2px' }}
        sx={{ WebkitTapHighlightColor: 'transparent', ...STILL }}
      >
        {/* Sized for the room it is actually in. This was a 2xs badge and two
            2xs lines squeezed into the middle of a header with most of a row
            of empty space around them, so the one thing worth reading was the
            hardest thing to read. */}
        <Flex
          align="center"
          justify="center"
          w="32px"
          h="32px"
          flexShrink={0}
          borderRadius="full"
          bg={STEP_TONES[current.tone].bg}
          border="1px solid"
          borderColor={STEP_TONES[current.tone].border}
          color={STEP_TONES[current.tone].fg}
          fontSize="sm"
          fontWeight="600"
          aria-hidden="true"
        >
          {current.tone === 'done' ? <Icon as={FaCheck} boxSize={3} /> : current.n}
        </Flex>
        <Flex direction="column" lineHeight="1.2" minW={0} align="flex-start" aria-hidden="true">
          <Text
            fontSize="sm"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.14em"
            color={STEP_TONES[current.tone].label}
            whiteSpace="nowrap"
          >
            {current.label}
          </Text>
          {current.detail && !(current.money && suppressMoneyDetail) && (
            <Text
              fontSize="xs"
              fontWeight="400"
              color={current.tone === 'overdue' ? 'red.600' : 'gray.500'}
              whiteSpace="nowrap"
              overflow="hidden"
              textOverflow="ellipsis"
              maxW="100%"
              mt="1px"
            >
              {current.detail}
            </Text>
          )}
        </Flex>
        <Icon
          as={FaChevronDown}
          boxSize={2.5}
          color="gray.400"
          flexShrink={0}
          aria-hidden="true"
          transform={open ? 'rotate(180deg)' : 'none'}
          transition="transform 0.25s ease"
        />
      </Flex>

      {/* THE DESKTOP: the whole track, centred in the space it was given. */}
      <Flex
        display={{ base: 'none', md: 'flex' }}
        align="center"
        justify="center"
        gap={2.5}
        role="group"
        aria-label="Your booking progress"
      >
        {steps.map((s, i) => {
          const tone = STEP_TONES[s.tone];
          return (
            <Fragment key={s.label}>
              {i > 0 && (
                <Box
                  // Grows into the room the header used to waste, but capped so
                  // a three-step booking does not stretch into a dashed line
                  // with two dots on it.
                  flex="1 1 20px"
                  minW="16px"
                  maxW="72px"
                  h="1px"
                  bg={currentIdx === -1 || i <= currentIdx ? 'brand.success' : 'gray.200'}
                />
              )}
              <Flex
                as={s.sectionId && onGo ? 'button' : 'div'}
                {...(s.sectionId && onGo
                  ? { type: 'button' as const, onClick: () => onGo(s.sectionId!) }
                  : {})}
                align="center"
                gap={2}
                flexShrink={0}
                px={1}
                py={1}
                borderRadius="md"
                bg="transparent"
                border="none"
                cursor={s.sectionId && onGo ? 'pointer' : 'default'}
                transition="background 0.15s ease"
                _hover={s.sectionId && onGo ? { bg: 'brand.surface' } : undefined}
                _focusVisible={{ outline: '2px solid', outlineColor: 'brand.accent', outlineOffset: '2px' }}
                sx={{ WebkitTapHighlightColor: 'transparent' }}
                // The stage IS the link, so it is announced as one. It used to
                // be role="img", which was right when it was only a picture of
                // a state and is wrong now that pressing it goes somewhere.
                aria-label={`${s.label}${s.detail ? `, ${s.detail}` : ''}, ${
                  s.tone === 'done' ? 'done' : s.current ? 'in progress' : 'not started'
                }${s.sectionId && onGo ? '. Go to this section.' : ''}`}
              >
                <Flex
                  align="center"
                  justify="center"
                  w="30px"
                  h="30px"
                  borderRadius="full"
                  bg={tone.bg}
                  border="1px solid"
                  borderColor={tone.border}
                  color={tone.fg}
                  fontSize="xs"
                  fontWeight="600"
                  flexShrink={0}
                  aria-hidden="true"
                >
                  {s.tone === 'done' ? <Icon as={FaCheck} boxSize={3} /> : s.n}
                </Flex>
                <Flex direction="column" lineHeight="1.15" minW={0} aria-hidden="true">
                  <Text
                    fontSize="2xs"
                    fontWeight="500"
                    textTransform="uppercase"
                    letterSpacing="0.16em"
                    color={tone.label}
                    whiteSpace="nowrap"
                  >
                    {s.label}
                  </Text>
                  {s.detail && (
                    <Text
                      fontSize="2xs"
                      fontWeight="400"
                      letterSpacing="0.02em"
                      color={s.tone === 'overdue' ? 'red.600' : 'gray.500'}
                      whiteSpace="nowrap"
                      mt="2px"
                    >
                      {s.detail}
                    </Text>
                  )}
                </Flex>
              </Flex>
            </Fragment>
          );
        })}
      </Flex>
    </>
  );
}

/**
 * Every step, listed, under the phone header.
 *
 * The same shell as the two menu panels next door so it reads as the same kind
 * of thing opening, but its rows are STATUS and not navigation: nothing here is
 * pickable, because none of it is somewhere to go.
 */
/**
 * Every stage, under the phone header, and every one of them a way in.
 *
 * It used to be a read only list, which is why opening it felt pointless: the
 * rows named the Contract and the Balance and the Photos and then did nothing,
 * while a separate menu behind the burger listed the same three words as
 * links. Now the stage IS the link, and the menu keeps only the sections no
 * stage covers.
 */
function ProgressPanel({
  id,
  steps,
  open,
  extras,
  onGo,
}: {
  id: string;
  steps: ProgressStep[];
  open: boolean;
  /** Sections no stage covers: Password, Share, and Top when there is no event. */
  extras: MenuRow[];
  onGo: (sectionId: string) => void;
}) {
  return (
    <Box
      id={id}
      display={{ base: 'block', md: 'none' }}
      position="absolute"
      top="100%"
      left={MENU_INSET}
      right={MENU_INSET}
      mt={MENU_INSET}
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius={MENU_RADIUS}
      boxShadow="0 12px 32px rgba(0, 0, 0, 0.12)"
      overflow="hidden"
      opacity={open ? 1 : 0}
      visibility={open ? 'visible' : 'hidden'}
      pointerEvents={open ? 'auto' : 'none'}
      transition={`opacity ${MENU_FADE} ease, visibility ${MENU_FADE} ease`}
      sx={STILL}
      aria-hidden={!open}
      role="menu"
      aria-label="Your booking"
    >
      <Text
        fontSize="2xs"
        fontWeight="500"
        textTransform="uppercase"
        letterSpacing="0.18em"
        color="gray.500"
        px={4}
        pt={3}
        pb={2}
      >
        Your booking
      </Text>
      <VStack align="stretch" spacing={0} pb={extras.length ? 0 : 2}>
        {steps.map((s) => {
          const tone = STEP_TONES[s.tone];
          const go = s.sectionId;
          return (
            <Flex
              key={s.label}
              as={go ? 'button' : 'div'}
              {...(go ? { type: 'button' as const, onClick: () => onGo(go) } : {})}
              role={go ? 'menuitem' : undefined}
              align="center"
              gap={3}
              px={4}
              py={3}
              w="100%"
              textAlign="left"
              bg="transparent"
              border="none"
              cursor={go ? 'pointer' : 'default'}
              _hover={go ? { bg: 'brand.surface' } : undefined}
              _focusVisible={{ outline: '2px solid', outlineColor: 'brand.accent', outlineOffset: '-2px' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Flex
                align="center"
                justify="center"
                w="26px"
                h="26px"
                flexShrink={0}
                borderRadius="full"
                bg={tone.bg}
                border="1px solid"
                borderColor={tone.border}
                color={tone.fg}
                fontSize="2xs"
                fontWeight="600"
                aria-hidden="true"
              >
                {s.tone === 'done' ? <Icon as={FaCheck} boxSize={2.5} /> : s.n}
              </Flex>
              <Flex direction="column" lineHeight="1.2" minW={0} align="flex-start">
                <Text
                  fontSize="2xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.16em"
                  color={tone.label}
                >
                  {s.label}
                </Text>
                {s.detail && (
                  <Text
                    fontSize="xs"
                    fontWeight="300"
                    color={s.tone === 'overdue' ? 'red.600' : 'gray.600'}
                    mt="2px"
                  >
                    {s.detail}
                  </Text>
                )}
              </Flex>
              {s.current && (
                <Text
                  ml="auto"
                  fontSize="2xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.14em"
                  color="brand.accentText"
                  flexShrink={0}
                >
                  You are here
                </Text>
              )}
            </Flex>
          );
        })}
      </VStack>

      {/* Everything the five stages do not already reach. */}
      {extras.length > 0 && (
        <>
          <Box h="1px" bg="gray.100" mx={4} my={1} />
          <VStack align="stretch" spacing={0} pb={2}>
            {extras.map((row) => (
              <Flex
                key={row.id}
                as="button"
                type="button"
                role="menuitem"
                onClick={() => onGo(row.id)}
                align="center"
                gap={3}
                px={4}
                py={2.5}
                w="100%"
                textAlign="left"
                bg="transparent"
                border="none"
                cursor="pointer"
                _hover={{ bg: 'brand.surface' }}
                _focusVisible={{ outline: '2px solid', outlineColor: 'brand.accent', outlineOffset: '-2px' }}
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Box w="26px" flexShrink={0} />
                <Text fontSize="sm" fontWeight="300" color="gray.700">
                  {row.label}
                </Text>
              </Flex>
            ))}
          </VStack>
        </>
      )}
    </Box>
  );
}

/**
 * How long a held pick waits after the page last MOVED before it gives up.
 *
 * Not a deadline on the scroll itself: the timer is pushed out again on every
 * frame that actually goes somewhere, so a long scroll on a slow phone is never
 * cut short. It only runs out once the page has genuinely stopped, which is the
 * case a cancelled or interrupted scroll lands in.
 */
const NAV_PICK_BACKSTOP_MS = 1200;

/**
 * The ceiling on the above, measured from the tap.
 *
 * The rearming timer alone can be kept alive forever by anything that keeps the
 * page moving, so a hold that has outlived any plausible smooth scroll is
 * wrong by definition and ends here. Chrome and Safari both animate a scroll on
 * a clock rather than a frame count, and cap it well under a second, so a slow
 * phone does not need more of this than a fast one.
 */
const NAV_PICK_CEILING_MS = 3000;

/** What a section nav gets back from useNavSelectionLock. */
export interface NavSelectionLock {
  /** Record a pick. Call it the moment the reader taps an item. */
  hold: (id: string) => void;
  /**
   * What the nav should show this frame, given what the scroll scan just
   * worked out. Returns the held pick while one is in flight, and whatever the
   * scan said otherwise.
   */
  resolve: (scanned: string | null) => string | null;
  /**
   * Run this nav's scan again whenever a pick stops being held, and hand back
   * the unsubscribe.
   *
   * A scan that only listens to scroll events gets its last look on the last
   * frame of the scroll. That is one frame too early for a nav that spent the
   * scroll standing still for somebody else's pick, so this is how it gets
   * told to look again once the page has stopped. Call it from the same effect
   * that subscribes the scroll listener and drop it in the same cleanup.
   */
  watch: (recheck: () => void) => () => void;
}

/**
 * The pick currently in flight. ONE of these for the whole page, on purpose.
 *
 * A tapped scroll travels over the same document whoever started it, so every
 * nav watching that document has to stand still for it, not just the one whose
 * item was tapped. It used to be per hook, and the two navs on a delivered
 * portal sit about 8px apart in the same one header: the account bar and the
 * photo bar. Tapping Password in the account menu from the foot of the gallery
 * held the portal's own scan and left the gallery's running, so the bar beside
 * it rattled through every section name on the way up. The guard was there. It
 * simply was not reached from the other menu.
 *
 * Module state rather than a lock instance threaded down to both navs, or a
 * selection that calls hold() on each of them in turn. Both of those work
 * today and both are a wiring step somebody has to remember the next time the
 * portal grows a nav surface: forget it, and the flicker is back with nothing
 * to show that it is. A hold that lives ABOVE every instance of the hook means
 * a third nav joins by doing nothing at all, because calling
 * useNavSelectionLock is the only thing it has to do.
 *
 * `owner` is what stops the two navs reading each other's answer. The held id
 * belongs to whoever took it and means nothing to anybody else: the gallery
 * has no 'password-section' in its list, and handing it that id would swap its
 * bar to item one rather than hold it still, which is a worse flicker than the
 * one being fixed. So a nav that does not own the hold is told to show what it
 * is already showing. See resolve.
 */
interface NavHold {
  /** Which hook instance took it. Compared, never read. */
  owner: object;
  id: string;
  /** When the tap happened. The ceiling is measured from here. */
  at: number;
  /** The last scroll position a frame saw, for the rearming backstop. */
  lastY: number;
  timer: ReturnType<typeof setTimeout> | null;
  /**
   * The owner's scan ALREADY called this the current item before the tap, so
   * its agreeing says nothing and cannot be what ends the hold.
   *
   * This is not a corner case, it is the commonest pick a client in a gallery
   * makes: standing at the foot of the photos, they open the account menu and
   * tap See photos to get back to the top of them. The portal's own nav has
   * said Photos the whole time, because the entire gallery IS the photos
   * section, so "the scan agrees" was true on the first frame of a five
   * thousand pixel scroll and the hold was gone before the page had moved.
   * Every other nav was then free for the rest of it, which is the flicker this
   * lock exists to stop, arriving through the one door the lock could not see.
   *
   * Movement stopping is what ends this kind of hold instead, which is exactly
   * what the rearming backstop above already measures.
   */
  alreadyThere: boolean;
}

let navHold: NavHold | null = null;

/**
 * Scans to re-run once a pick stops being held.
 *
 * Both scans only run on scroll events, so the last frame of a smooth scroll
 * is the last chance they get. A nav that was standing still through somebody
 * else's pick would therefore keep whatever it was showing until the reader
 * moved the page again, which for the Photos case above means the bar still
 * naming the section they left. So releasing tells every scan to look once
 * more, and they answer with where the page actually stopped.
 */
const navRechecks = new Set<() => void>();

/** Drop the pick in flight, whoever took it, and its timer with it. */
const releaseNavHold = () => {
  // Nothing held is not a release. Without this the hand-scroll listeners
  // below would fire a recheck on every wheel event of every scroll.
  if (navHold === null) return;
  if (navHold.timer !== null) clearTimeout(navHold.timer);
  navHold = null;
  // A microtask, not a straight call: a release usually happens INSIDE a
  // scan's own resolve, and re-entering that scan from underneath itself is a
  // trap waiting to be sprung. By the time this runs the frame's scans have
  // finished, and it is still before paint.
  queueMicrotask(() => {
    navRechecks.forEach((recheck) => recheck());
  });
};

/**
 * Give the backstop its full time again, from now, but never past the ceiling.
 * Safe to call when nothing is held: there is then nothing to arm.
 */
const armNavHold = () => {
  const held = navHold;
  if (held === null) return;
  if (held.timer !== null) clearTimeout(held.timer);
  const left = held.at + NAV_PICK_CEILING_MS - Date.now();
  held.timer = setTimeout(releaseNavHold, Math.max(0, Math.min(NAV_PICK_BACKSTOP_MS, left)));
};

/**
 * Holds EVERY section nav's highlight still while a tapped scroll is in flight.
 *
 * Both of the portal's navs pick their active item by scanning section
 * positions against their surface's activation line on every scroll frame.
 * That is right while
 * the reader is scrolling and wrong for the second after they tap an item: the
 * smooth scroll passes THROUGH every section in between and the scan lights
 * each one up in turn, so tapping Password from Balance flickers
 * balance, password, balance, password before it settles. A desktop hides it
 * only because the distances are shorter and the scan settles sooner.
 *
 * So a tap is treated as the truth, and the scan is ignored until the scroll
 * has landed. Landed is expressed in the scan's OWN terms, `scanned === held`:
 * the scan agreeing is exactly the target having reached the activation line,
 * and it costs nothing to a short trailing section that can never get there,
 * which the scan already handles with its at-the-bottom rule.
 *
 * Three things end the hold, and all three are needed:
 *   - the scan agreeing, which is the normal case,
 *   - the reader taking over with a wheel, a drag or a key, since scrolling by
 *     hand overrules something they tapped a moment ago,
 *   - the two timeouts above, so a cancelled scroll cannot leave the nav stuck
 *     on a section the reader is nowhere near.
 *
 * It lives here, next to ScrollStrip, because the portal's nav and the
 * gallery's nav both have this scan and a second copy of the guard would drift
 * from the first. The hold ITSELF is shared by every nav on the page rather
 * than owned by one, see navHold above: a tapped scroll moves the whole
 * document, so every scan watching it has to stand still, not only the scan
 * whose item was tapped.
 */
export function useNavSelectionLock(): NavSelectionLock {
  // Identity, and nothing else. A ref keeps the first object it is handed for
  // the life of the component, which is exactly what "which nav is this" needs.
  const ownerRef = useRef<object>({});
  // What this nav last resolved to. A nav that does not own the pick in flight
  // is asked to stand still, and standing still means answering with this.
  const shownRef = useRef<string | null>(null);

  // The reader scrolling by hand outranks anything they tapped a moment ago,
  // whichever nav they tapped it in: it is one page and one hand.
  // touchstart is deliberately NOT in this list: a tap on a nav pill begins
  // with one, and it would drop the hold in the same gesture that took it.
  useEffect(() => {
    // Copied out here rather than read in the cleanup. It is an identity
    // object that is written once and never again, so the two are the same
    // thing, but a ref read in a cleanup is a real trap often enough that the
    // linter is right to refuse to tell them apart.
    const me = ownerRef.current;
    const events: Array<keyof WindowEventMap> = ['wheel', 'touchmove', 'keydown'];
    events.forEach((name) => window.addEventListener(name, releaseNavHold, { passive: true }));
    return () => {
      events.forEach((name) => window.removeEventListener(name, releaseNavHold));
      // On the way out, only OUR pick goes with us. A nav unmounting must not
      // cancel a scroll another nav on the page is still steering.
      if (navHold !== null && navHold.owner === me) releaseNavHold();
    };
  }, []);

  const hold = useCallback((id: string) => {
    // The newest pick wins outright, including over another nav's: the reader
    // asked for this one second.
    releaseNavHold();
    navHold = {
      owner: ownerRef.current,
      id,
      at: Date.now(),
      lastY: window.scrollY,
      timer: null,
      // What this nav is showing IS what its scan last said, because that is
      // where the value came from. So this is the scan agreeing before the
      // reader has gone anywhere. See alreadyThere.
      alreadyThere: shownRef.current === id,
    };
    armNavHold();
    shownRef.current = id;
  }, []);

  const resolve = useCallback((scanned: string | null) => {
    const held = navHold;
    if (held === null) {
      shownRef.current = scanned;
      return scanned;
    }
    if (held.owner !== ownerRef.current) {
      // Somebody else's pick is in flight over this page. Stand still. The id
      // they are holding is from their list, not ours, so it cannot be
      // answered with; what it means to us is only "not yet".
      return shownRef.current;
    }
    const landed = scanned === held.id && !held.alreadyThere;
    if (landed || Date.now() - held.at >= NAV_PICK_CEILING_MS) {
      releaseNavHold();
      shownRef.current = scanned;
      return scanned;
    }
    // Still travelling. Give the backstop its full time again, measured from
    // the last frame that actually moved.
    const y = window.scrollY;
    if (y !== held.lastY) {
      held.lastY = y;
      armNavHold();
    }
    return held.id;
  }, []);

  const watch = useCallback((recheck: () => void) => {
    navRechecks.add(recheck);
    return () => {
      navRechecks.delete(recheck);
    };
  }, []);

  // A stable object, so a caller can put it straight in an effect's deps
  // without resubscribing its scroll listeners on every render.
  return useMemo(() => ({ hold, resolve, watch }), [hold, resolve, watch]);
}

/**
 * A horizontally scrollable strip that admits it scrolls.
 *
 * Centred content, fade masks at both edges, and a small tappable chevron on
 * whichever side still has something on it. The fade alone was never enough on
 * a phone: people read the strip as ending where it visually fades.
 *
 * Exported because the portal's second nav row and the gallery's strip both
 * need the identical affordance, and two hand-rolled copies of it drifted
 * apart once already.
 */
export function ScrollStrip({
  children,
  scrollRef,
  px = { base: '44px', md: '48px' },
  gap = 2,
}: {
  children: ReactNode;
  /** Pass one in when the caller also needs to drive the scroll position. */
  scrollRef?: MutableRefObject<HTMLDivElement | null>;
  px?: { base: string; md: string };
  gap?: number;
}) {
  const ownRef = useRef<HTMLDivElement | null>(null);
  const ref = scrollRef ?? ownRef;

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    // A plain resize listener misses the case that matters most: the strip's
    // CONTENTS changing. Items come and go as the booking moves along, and
    // without this the chevrons keep reporting the old content's width.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null;
    if (ro) {
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
      ro?.disconnect();
    };
  }, [ref]);

  const scrollBy = (delta: number) => {
    ref.current?.scrollBy({ left: delta, behavior: scrollBehavior() });
  };

  return (
    <Box position="relative">
      <ScrollChevron direction="left" visible={canScrollLeft} onClick={() => scrollBy(-200)} />
      <ScrollChevron direction="right" visible={canScrollRight} onClick={() => scrollBy(200)} />
      <Box
        ref={ref}
        overflowX="auto"
        // Explicit, because `overflow-x: auto` alone quietly promotes
        // overflow-y from visible to auto, which puts a vertical scrollbar
        // inside a strip that is exactly one row tall.
        overflowY="hidden"
        sx={{
          maskImage:
            'linear-gradient(90deg, transparent 0, black 44px, black calc(100% - 44px), transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(90deg, transparent 0, black 44px, black calc(100% - 44px), transparent 100%)',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
        }}
      >
        {/* minW="max-content" is what makes `justify: center` safe here. With
            it the row is exactly as wide as its contents, so when they
            overflow there is no free space for centring to steal and the strip
            simply scrolls from its left edge. Centred when it fits, scrollable
            when it does not, at every width including a phone. The horizontal
            padding matches the mask so the first and last items never sit
            underneath the fade. */}
        <Flex gap={gap} px={px} justify="center" minW="max-content" align="center">
          {children}
        </Flex>
      </Box>
    </Box>
  );
}

/**
 * The tap-to-scroll chevron on a strip's edge. 200px a tap is roughly one item
 * at any screen size.
 *
 * The BUTTON is the 44px a thumb is owed, and the 28px circle inside it is the
 * ink. That split is deliberate and is the fix for a real bug: the chevron used
 * to be a 28px button inset 4px from the strip's edge, with its hit area grown
 * to 44px by a `::before` pulled 8px out on every side. A pseudo-element still
 * counts as scrollable overflow, so those 8px put 4px of overflow past the
 * strip's right edge, and the portal's sticky nav rows run the full width of
 * the page. Four pixels past the viewport is all it takes for a phone to let
 * the whole document be dragged sideways.
 */
const CHEVRON_INK_CLASS = 'portal-scroll-chevron-ink';

export function ScrollChevron({
  direction,
  visible,
  onClick,
}: {
  direction: 'left' | 'right';
  visible: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      aria-label={direction === 'left' ? 'Scroll left' : 'Scroll right'}
      position="absolute"
      top="50%"
      transform="translateY(-50%)"
      // Flush with the strip's edge, so the whole 44px sits inside it. The
      // circle is centred within that, which also parks it in the middle of
      // the 44px edge fade rather than half under it.
      {...(direction === 'left' ? { left: 0 } : { right: 0 })}
      zIndex={2}
      display="flex"
      alignItems="center"
      justifyContent="center"
      w="44px"
      h="44px"
      p={0}
      bg="transparent"
      border="none"
      cursor="pointer"
      sx={{
        WebkitTapHighlightColor: 'transparent',
        [`&:hover .${CHEVRON_INK_CLASS}`]: {
          bg: 'brand.accent',
          color: 'white',
          borderColor: 'brand.accent',
        },
      }}
    >
      <Flex
        className={CHEVRON_INK_CLASS}
        align="center"
        justify="center"
        w="28px"
        h="28px"
        borderRadius="full"
        bg="rgba(255, 255, 255, 0.9)"
        backdropFilter="blur(6px)"
        color="brand.accent"
        border="1px solid"
        borderColor="rgba(201, 169, 110, 0.35)"
        boxShadow="0 2px 6px rgba(0, 0, 0, 0.08)"
        transition="all 0.2s"
        sx={STILL}
      >
        <Icon as={direction === 'left' ? FaChevronLeft : FaChevronRight} boxSize={2.5} />
      </Flex>
    </Box>
  );
}

export default PortalHeader;
