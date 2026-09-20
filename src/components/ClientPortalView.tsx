import { Box, VStack, Text, Flex, HStack, Icon, Input, Checkbox, SimpleGrid, useToast, Collapse } from '@chakra-ui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import FaCheck from '../icons/fa/FaCheck';
import FaChevronUp from '../icons/fa/FaChevronUp';
import FaCopy from '../icons/fa/FaCopy';
import FaSignOutAlt from '../icons/fa/FaSignOutAlt';
import FaSync from '../icons/fa/FaSync';
import FaUndo from '../icons/fa/FaUndo';
import SignatureCanvas from 'react-signature-canvas';
import type SignatureCanvasType from 'react-signature-canvas';
import ClientGallery, {
  galleryDrawsNavRow,
  type DriveFile,
  type FolderSection,
  type GalleryNav,
} from './ClientGallery';
import CTAButton from './ui/CTAButton';
import ConfirmDialog from './ui/ConfirmDialog';
import PortalHeader, {
  ScrollStrip,
  formatMoney,
  isPortalComplete,
  useNavSelectionLock,
  type PortalNavItem,
  type PortalProgressData,
} from './PortalHeader';
import {
  AT_BOTTOM_THRESHOLD,
  HEADER_CLEARANCE,
  PORTAL_HEADER_H,
  PORTAL_NAV_H,
  STICKY_BOTTOM,
  portalChrome,
  type PortalChrome,
} from './portalLayout';
import ReadingProgress from './ReadingProgress';
import { scrollBehavior } from '../utils/motion';
import type { ContractTemplate } from '../data/contract-template';
import { PAYMENT_HANDLES, CARD_PAYMENTS_MODE, cardPaymentsVisible } from '../data/payment-handles';

// Full client portal payload — mirrors the shape returned by
// /api/portal/client. Each field group is annotated with which phase
// of the rollout populates / consumes it.
export interface ClientPortalData {
  mode: 'full';
  client_name: string | null;
  client_email: string;
  drive_url: string | null;
  rootFiles: DriveFile[];
  sections: FolderSection[];
  warning?: string;
  // True while the photos exist but have not been released yet. The server
  // withholds the data itself in that case (drive_url null, both lists
  // empty), so this is the only way to tell "Vero has not pressed Mark as
  // Delivered yet" apart from "no photos uploaded yet", and the Photos
  // section says a different thing for each. See api/portal/_gallery-gate.ts.
  gallery_withheld?: boolean;

  // Session metadata — surfaced in the portal header so clients see
  // what they booked without having to open the contract. Every field
  // is nullable because older portals were created before we started
  // storing them.
  event_date: string | null;
  session_type: string | null;
  // Which of the six contracts this booking was written on. Free-text
  // session_type cannot be trusted to decide wording (see bookingWording
  // below); this can, and /api/portal/client defaults legacy rows to
  // 'wedding'.
  contract_template_key: string | null;
  event_title: string | null;
  event_location: string | null;
  delivery_timeframe: string | null;

  // Contract — Phase 2
  contract_status: 'none' | 'pending' | 'signed' | 'void';
  contract_signed_at: string | null;
  contract_body: string | null;
  contract_signed_pdf_available: boolean;

  // Payment — Phase 3
  contract_total_amount: number | null;
  contract_retainer_amount: number | null;
  paid_to_date: number;
  payment_plan_enabled: boolean;
  installments: Array<{
    installment_number: number;
    amount: number;
    due_date: string;
    paid_at: string | null;
    paid_amount: number | null;
    payment_method: string | null;
  }>;
  // Itemized log of payments Veronika has recorded against this booking.
  payments: Array<{
    id: string;
    amount: number;
    method: string | null;
    note: string | null;
    paid_at: string;
  }>;
  /**
   * Charges added after the booking: extra time at the client's request, and
   * costs paid on the day. Owed on top of contract_total_amount, which is why
   * every remaining-balance sum in this file reads
   * contract_total_amount + charges_total - paid_to_date.
   */
  charges_total: number;
  charges: Array<{
    id: string;
    amount: number;
    // 'overtime' | 'expense' | 'other' as stored. Kept as a string because it
    // comes off the wire, and a value this bundle predates should render as
    // the generic label rather than break the balance section.
    reason: string;
    note: string | null;
    charged_at: string;
  }>;

  // Gallery Pass settings — Phase 1c
  gallery_password: string;
  gallery_enabled: boolean;

  // Gallery hosting — surfaced in the UI as the "available until" line
  gallery_delivered_at: string | null;
  gallery_expires_at: string | null;

  // Favorites — Drive file IDs the client has hearted. Only populated
  // for full-mode portals (guests on /portal/pass don't get favorites).
  favorite_photo_ids: string[];
}

interface ClientPortalViewProps {
  data: ClientPortalData;
  // Re-auth credentials for actions that mutate portal state (rotate the
  // Gallery Pass, sign the contract, etc.). The credentials live in the
  // Portal page's React state only — never persisted to storage — so a
  // tab refresh boots the client back to the login form. Acceptable for
  // this MVP; sessions can come later.
  credentials: { email: string; password: string };
  onDataUpdate: (data: ClientPortalData) => void;
  // Fired after the client changes their password from the Account
  // section. Parent (Portal.tsx) uses this to keep its cached
  // credentials.password in sync — without it, the next mutating
  // request (rotate gallery pass, sign contract, etc.) would fail
  // authentication because the parent would still be sending the old
  // password.
  onPasswordChanged?: (newPassword: string) => void;
  // Clears the parent's credentials and lands back on the login form. There
  // is no stored session to end: the password lives in Portal.tsx React state
  // and nowhere else, which is also why a plain page reload already signs the
  // client out.
  onLogout?: () => void;
}

const formatDate = (iso: string) => {
  // event_date, due_date, and similar date-only fields come back from
  // Postgres as midnight-UTC timestamps. Without timeZone='UTC' the
  // formatter would render them in the viewer's local timezone, sliding
  // dates back a day in any negative UTC offset. Using UTC consistently
  // here means typed-date matches displayed-date everywhere. The trade-
  // off is that timestamps within an hour or two of UTC midnight may
  // appear as the "next" day relative to the viewer's local clock; for
  // date-level display (payments, signed-at, expires) that's a fair
  // call.
  const datePart = iso.split('T')[0];
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
};

/**
 * What a charge's reason is called in front of the client.
 *
 * The stored values are 'overtime', 'expense' and 'other', which are storage
 * words, not copy. Anything unrecognised falls through to the neutral label
 * rather than printing a raw column value at someone reading their receipt,
 * and the note underneath carries the specifics either way.
 */
const CHARGE_REASON_LABELS: Record<string, string> = {
  overtime: 'Additional time',
  expense: 'Expense',
  other: 'Additional charge',
};

const chargeReasonLabel = (reason: string): string =>
  CHARGE_REASON_LABELS[reason] ?? CHARGE_REASON_LABELS.other;

/**
 * The nouns the portal's copy hangs on, per booking type.
 *
 * The portal was built when a wedding was the only thing Vero sold, so the
 * wording is wedding-shaped throughout: "Event Date", "to reserve the date",
 * "on the day of the event". A family client reading that is reading somebody
 * else's portal, so the nouns come from the booking instead of being
 * hardcoded. Four nouns cover every line; anything more and this turns into
 * the pile of ternaries it exists to avoid.
 *
 * The signal is `contract_template_key`, not `session_type`. session_type is
 * a free-text label: the old picker let Vero type anything and lowercase-
 * hyphenated it, so a real wedding can be filed as 'wedding-day' or a Russian
 * word, and every portal created before the six-type expansion was filed
 * under whatever she typed while being sold the WEDDING contract. Keying off
 * it would tell those clients about "your session" while the contract they
 * signed says "after the event date". The template key cannot drift: legacy
 * rows default to 'wedding' at the column level
 * (001-baseline-client-portals.sql), and it is the same key that chose the
 * contract body.
 */
interface BookingWording {
  /** Header label above event_date. */
  dateLabel: string;
  /** Object of "to reserve ...". */
  reserveDate: string;
  /** Bare noun, as in "the {dateNoun} isn't officially booked". */
  dateNoun: string;
  /** Object of "closer to ...", "after ...", "on the day of ...". */
  occasion: string;
}

const EVENT_WORDING: BookingWording = {
  dateLabel: 'Event Date',
  reserveDate: 'the date',
  dateNoun: 'event date',
  occasion: 'the event',
};

const SESSION_WORDING: BookingWording = {
  dateLabel: 'Session Date',
  reserveDate: 'your session date',
  dateNoun: 'session date',
  occasion: 'your session',
};

/**
 * The five template keys whose contract body is a session contract. Wedding is
 * the only one that prints "due within X after the event date"; these five
 * print "after the session date", and the Next Step panel restates that clause
 * back to the client, so the two have to agree.
 *
 * Listed here rather than imported from contract-template.ts on purpose: that
 * module is ~600 lines of contract prose, and the portal only ever needs the
 * type-only `ContractTemplate` import it already has. Pulling in the value
 * would ship every contract to every client.
 */
const SESSION_TEMPLATE_KEYS = new Set(['portrait', 'family', 'engagement', 'maternity', 'other']);

/**
 * Free-text session labels that describe a real event with a day-of. Only
 * consulted when the payload carries no template key.
 */
const EVENT_BOOKING_TYPES = new Set(['wedding', 'elopement', 'event']);

function bookingWording(templateKey: string | null, sessionType: string | null): BookingWording {
  const key = (templateKey ?? '').trim().toLowerCase();
  if (key === 'wedding') return EVENT_WORDING;
  if (SESSION_TEMPLATE_KEYS.has(key)) return SESSION_WORDING;
  // No key at all, or one this bundle predates: fall back to the free-text
  // label. Empty falls back to event wording because everything that predates
  // the six-type expansion is a wedding, and rewording a signed wedding
  // portal is the one regression worth designing around.
  const type = (sessionType ?? '').trim().toLowerCase();
  if (!type) return EVENT_WORDING;
  return EVENT_BOOKING_TYPES.has(type) ? EVENT_WORDING : SESSION_WORDING;
}

// Detect whether Vercel has deployed a new build since this page loaded.
//
// How: Vite writes the main JS bundle with a content-hashed filename
// (e.g. /assets/index.BcH27ukN.js). Every deploy changes the hash and
// updates the <script src> in index.html. So if we fetch the current
// index.html and its script src differs from the one WE loaded, a new
// deploy has landed.
//
// Called from the portal's Refresh button — if this returns true we do
// a full window.location.reload() to pick up the new bundle. Falls
// through silently (returns false) on any failure so a network hiccup
// never breaks the normal data-refresh path.
async function hasNewerDeploy(): Promise<boolean> {
  try {
    const currentBundle = Array.from(
      document.querySelectorAll<HTMLScriptElement>('script[src]'),
    )
      .map((s) => s.getAttribute('src') ?? '')
      .find((src) => src.includes('/assets/index.') && src.endsWith('.js'));
    if (!currentBundle) return false;

    // Fetch the live index.html for this route. cache: 'no-store' is
    // belt-and-suspenders on top of the vercel.json no-cache header —
    // guarantees we're seeing what the CDN would serve fresh, not
    // some proxy cache in between.
    const res = await fetch(window.location.pathname, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) return false;
    const html = await res.text();
    const match = html.match(
      /src=["']([^"']*\/assets\/index\.[^"']+\.js)["']/,
    );
    if (!match) return false;
    return match[1] !== currentBundle;
  } catch {
    return false;
  }
}

const ClientPortalView = ({
  data,
  credentials,
  onDataUpdate,
  onPasswordChanged,
  onLogout,
}: ClientPortalViewProps) => {
  // Every client-visible noun that used to assume a wedding reads out of here.
  const wording = bookingWording(data.contract_template_key, data.session_type);

  // What the booking comes to, and what is left on it. Charges added after
  // the fact (extra time, costs paid on the day) are owed just like the
  // contract total, so they belong in every sum here. The client reads them
  // itemized in the Balance section below, so the number that changed is
  // always explained by a line they can point at.
  const chargesTotal = data.charges_total ?? 0;
  const amountOwed =
    data.contract_total_amount !== null ? data.contract_total_amount + chargesTotal : null;
  /**
   * Floored, like every other consumer of this number.
   *
   * This one was not, and it renders straight to the CLIENT, so an overpaid
   * booking showed them "-$50.00" as an amount outstanding. Every other place
   * in the system floors at zero.
   *
   * Overpayment used to be rare enough to ignore because money only arrived
   * when Vero typed it in. It stops being rare the moment a client can pay
   * from their phone: they settle a balance by card while she has already
   * logged the cash they handed her at the shoot, and now the record is 50
   * dollars over.
   */
  const rawRemaining = amountOwed !== null ? amountOwed - data.paid_to_date : null;
  const remaining = rawRemaining !== null ? Math.max(rawRemaining, 0) : null;
  // Kept separately so the client is TOLD they are owed money rather than
  // being shown a silent zero. A quiet zero on an overpayment looks like the
  // money was absorbed.
  const creditBalance = rawRemaining !== null && rawRemaining < 0 ? -rawRemaining : 0;

  // Whether the NextStepsPanel will render anything — same conditions
  // it uses internally, mirrored here so PortalTopNav can decide
  // whether to add a "Next Steps" pill AND so we know where to
  // auto-scroll after signing.
  const hasNextStep =
    data.contract_status === 'signed' &&
    amountOwed !== null &&
    data.paid_to_date < amountOwed;

  // Photos exist and have been released. Used in four places (the header's
  // progress, the Next Steps panel, the nav handoff, and the Photos section
  // itself), and computed once so they cannot disagree.
  const photosDelivered =
    data.rootFiles.length > 0 || data.sections.some((s) => s.files.length > 0);

  // An installment whose due date has come and gone unpaid. The ONLY thing
  // that turns the header red. A balance that simply still exists is not
  // overdue, and colouring it red would make every portal shout from the day
  // it opens.
  const balanceOverdue =
    data.payment_plan_enabled &&
    data.installments.some((inst) => inst.paid_at === null && new Date(inst.due_date) < new Date());

  const progress: PortalProgressData = {
    contractStatus: data.contract_status,
    amountOwed,
    retainerAmount: data.contract_retainer_amount,
    paidToDate: data.paid_to_date,
    photosDelivered,
    overdue: balanceOverdue,
  };

  // Signed, paid and delivered. The section nav moves up into the header as a
  // segmented control and the second sticky row stands down, because with
  // nothing left to do the progress has nothing left to say.
  const portalComplete = isPortalComplete(progress);

  // How tall this portal's sticky chrome is, which is the header plus the
  // second nav row for as long as that row is mounted. Once the booking is
  // complete the row is gone and there is only the header, so a section that
  // reserved room for both would leave a nav row of empty space above its
  // heading. Every scroll target and every scan threshold below comes off
  // this one answer, because they have to agree: the margin decides where a
  // tapped heading lands and the activation line decides whether the nav
  // believes it arrived.
  //
  // What comes back is RESPONSIVE, and the argument is about desktop widths
  // only. Below `md` the second row does not render in any state, so the
  // chrome is the header alone whatever this says, and portalChrome is
  // what knows that. A phone taking the two-row margin would drop every
  // heading a nav row below chrome that is not there, and its scan would call
  // a section current 48px before the reader reached it: neither looks broken,
  // they just look like a badly built page.
  const chrome = portalChrome(!portalComplete);

  // Whether the Photos section renders the gallery at all. Three states, kept
  // mutually exclusive down in the section itself; this is the test for the
  // two that show a gallery. A Drive URL plus files is the ordinary one. A
  // Drive URL plus a warning is a listing that threw: no files came back, and
  // the gallery is still what renders, because its failure UI is what gives
  // the client a way into Drive.
  //
  // It is hoisted up here out of the render because the nav handoff below has
  // to know whether there is a gallery on the page at all, and it used to ask
  // a different question, see below.
  const galleryRendered = Boolean(data.drive_url) && (photosDelivered || Boolean(data.warning));

  // Are there gallery sections worth navigating at all? Whoever ends up
  // drawing the control.
  //
  // The predicate is the gallery's own, imported rather than restated. The
  // handoff used to be guarded by photosDelivered, which is ALMOST the same
  // question and differs in exactly the state where the Drive listing failed:
  // the gallery renders, so its strip was drawn, but no files came back, so
  // the guard read "no gallery nav to hand off to" and this row never hid.
  // Both rows then pinned to the same 48px and painted over each other.
  // Favorites are on in the full portal by construction, since it always
  // passes onToggleFavorite below.
  const galleryHasNav =
    galleryRendered &&
    galleryDrawsNavRow({
      rootFiles: data.rootFiles,
      sections: data.sections,
      favoritesEnabled: true,
      sectionNavInHeader: false,
    });

  // Does the gallery draw its own sticky nav row? If it does, this portal's
  // row has to stand down for it, because they pin to the same band.
  //
  // Once the booking is COMPLETE it does not: the header carries both navs
  // itself at every width, as two bars that trade places, so a strip under it
  // would be the gallery's sections listed twice. That is the same fact the
  // `sectionNavInHeader` passed to ClientGallery below states, and it is
  // stated once here so the row that stands down and the row that never
  // mounts cannot disagree.
  const galleryOwnsNavRow = galleryHasNav && !portalComplete;

  // How many photos there are, for the pinned See photos row in the account
  // menu. The same two lists photosDelivered is derived from, counted rather
  // than tested.
  const photoCount =
    data.rootFiles.length + data.sections.reduce((n, s) => n + s.files.length, 0);

  // The portal's sections, in DOM order. Built once here rather than inside
  // the nav, because the header and the second row render the same list and
  // only one of them is on screen at a time.
  const navItems: PortalNavItem[] = [];
  // Top first: a one tap way back to the welcome and refresh area.
  navItems.push({ id: 'portal-top-section', label: 'Top', icon: FaChevronUp });
  if (hasNextStep) navItems.push({ id: 'next-steps-section', label: 'Next Steps' });
  if (data.contract_status !== 'none' && data.contract_status !== 'void') {
    navItems.push({ id: 'contract-section', label: 'Contract' });
  }
  if (data.contract_total_amount !== null) {
    navItems.push({ id: 'balance-section', label: 'Balance' });
  }
  navItems.push({ id: 'password-section', label: 'Password' });
  // `role` rather than an id the header would have to recognise: the header
  // pins Photos to the top of the account menu once there is a gallery behind
  // it, and turns Share into a button in the desktop corner. Both of those are
  // facts about what the section IS, and this is the one place that knows.
  navItems.push({ id: 'photos-section', label: 'Photos', role: 'photos' });
  navItems.push({ id: 'gallery-share-section', label: 'Share', role: 'share' });

  const [activeNavId, setActiveNavId] = useActiveSection(navItems, chrome);

  const handleNavSelect = useCallback(
    (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      // The tap IS the answer: this lights the item up at once and holds the
      // scroll scan off it until the smooth scroll has landed on it, so the
      // sections the page travels through on the way do not each take a turn
      // in the highlight. See useNavSelectionLock.
      setActiveNavId(id);
      el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    },
    [setActiveNavId],
  );

  // ─── The gallery's own section nav, borrowed for the phone header ───
  //
  // The gallery hands it up (see ClientGallery's onSectionNav) rather than
  // this component building a second one, because there must be exactly one
  // of these on the page: two would double the gallery's scroll listeners and
  // give the header and the strip separate opinions about which section the
  // reader is in, which drifts apart over a long scroll.
  //
  // This is why the portal re-renders when the reader crosses a gallery
  // section boundary, which it did not before. That is a handful of renders
  // per scroll of the page, at the same moments the portal's own nav scan
  // already re-rendered it, and it is the price of one source of truth.
  //
  // The setter goes down as-is: a useState setter is stable for the life of
  // the component, which is what the effect reporting into it depends on.
  const [gallerySectionNav, setGallerySectionNav] = useState<GalleryNav | null>(null);

  // Picking a section from the header's menu. The item carries its own
  // scrollTo, so there is no second implementation of where a section is, and
  // setActiveId is the gallery's held-pick setter, so the highlight stays on
  // what was tapped while the scroll is in flight.
  const handleGallerySelect = useCallback(
    (id: string) => {
      const item = gallerySectionNav?.items.find((i) => i.id === id);
      if (!item || item.disabled) return;
      gallerySectionNav!.setActiveId(id);
      item.scrollTo();
    },
    [gallerySectionNav],
  );

  // ─── Sign out ───
  const [signOutOpen, setSignOutOpen] = useState(false);

  // Auto-scroll to Next Steps immediately after the client signs the
  // contract. Without this, the page just re-renders in place — but
  // the ContractSignSection (big signature-pad UI) collapses into a
  // tiny SignedContractSection, which leaves the user's viewport
  // stranded somewhere down in the Share section, missing the whole
  // reason we made them sign (send the retainer). Watching the
  // status transition pending → signed catches the moment.
  const prevContractStatus = useRef(data.contract_status);
  useEffect(() => {
    if (
      prevContractStatus.current === 'pending' &&
      data.contract_status === 'signed'
    ) {
      // requestAnimationFrame gives React a chance to render the new
      // SignedContractSection + NextStepsPanel before we scroll to it,
      // otherwise the element we're targeting might not exist yet.
      requestAnimationFrame(() => {
        const target =
          document.getElementById('next-steps-section') ||
          document.getElementById('balance-section');
        target?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
      });
    }
    prevContractStatus.current = data.contract_status;
  }, [data.contract_status]);

  // Portal-nav / gallery-nav coordination. When the user is INSIDE
  // the photos section, the portal-level top nav hides on desktop so
  // the gallery's own sticky section-nav can take over that space
  // without stacking.
  //
  // Uses scroll position directly instead of IntersectionObserver
  // because IO fires the moment any pixel of the section enters the
  // observation zone — which, for a small placeholder positioned
  // right below the Balance section, incorrectly triggers "in view"
  // when the user has only scrolled to Balance. Scroll-based check
  // is definitively "user has scrolled INTO the section" (its top
  // is above the sticky nav bottom, its bottom is still below it).
  const photosSectionRef = useRef<HTMLDivElement | null>(null);
  const [isPhotosInView, setIsPhotosInView] = useState(false);
  /**
   * The HEADER's handoff: is the reader inside the photos?
   *
   * A different question from isPhotosInView above and measured against a
   * different line, which is why both live here rather than one standing in
   * for the other. That one asks whether the gallery's sticky STRIP is in the
   * band two rows compete for; this one asks whether the READER is in the
   * Photos section, which is what decides whether the header's account bar
   * condenses and the photo bar grows into its place.
   *
   * The line is the chrome's own activation line, the very line the nav scan
   * uses to decide which section is current. That is not a coincidence, it is
   * the requirement: the bar that appears names the section the scan picked,
   * so if the two were measured against different lines the header could
   * hand over to a photo bar that still said "Password".
   */
  const [headerInPhotos, setHeaderInPhotos] = useState(false);
  // One listener for both, because they are two readings of one rectangle.
  // isPhotosInView is only meaningful when the gallery is drawing a strip of
  // its own: otherwise there is nothing to swap in, and hiding the portal's
  // row would leave the client with no desktop navigation at all. The guard is
  // the gallery's own predicate rather than a second reading of the same data,
  // so the row that stands down and the row that takes over are decided by one
  // fact.
  useEffect(() => {
    if (!galleryRendered) {
      setIsPhotosInView(false);
      setHeaderInPhotos(false);
      return;
    }
    // The band is PORTAL_HEADER_H to STICKY_BOTTOM: the 48px under the header
    // that both rows pin to. This asks whether the gallery's strip is in that
    // band AT ALL, which is not the same as whether the reader is inside the
    // Photos section, and the difference is a real 48px of scrolling.
    //
    // The strip is sticky within the gallery, so on the way IN it reaches the
    // band as the section's top passes STICKY_BOTTOM, and on the way OUT it is
    // pushed up with the section's bottom and has not left the band until that
    // bottom passes PORTAL_HEADER_H. Testing the bottom against STICKY_BOTTOM,
    // as this did, brought this row back 48px early: for that much scrolling
    // the two rows were both painted, one sliding out under the other.
    //
    // Both edges are the numbers the nav's own active scan is built on, so the
    // nav cannot flicker on and off at this boundary instead of failing in a
    // way anyone would notice.
    const check = () => {
      // Read per frame rather than closed over: the Photos section is mounted
      // by a later commit than this effect on a portal whose gallery arrives
      // with the data, and an effect that gave up on a null ref would never
      // subscribe at all.
      const el = photosSectionRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setIsPhotosInView(
        galleryOwnsNavRow && rect.top < STICKY_BOTTOM && rect.bottom > PORTAL_HEADER_H,
      );
      // Asked for per frame for the same reason the nav scans ask: the line
      // sits under whatever chrome the CURRENT width has, and this listener is
      // already subscribed to resize.
      const { activationLine } = chrome.metrics();
      setHeaderInPhotos(rect.top <= activationLine && rect.bottom > activationLine);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [galleryRendered, galleryOwnsNavRow, chrome]);

  // ─── Gallery Pass management state ───
  const toast = useToast();
  const [gpUpdating, setGpUpdating] = useState(false);
  const [gpCustomOpen, setGpCustomOpen] = useState(false);
  const [gpCustomValue, setGpCustomValue] = useState('');
  const [gpError, setGpError] = useState('');
  const [gpCopied, setGpCopied] = useState(false);

  // ─── Favorites ───
  // Optimistic UI: update the local list immediately, fire the API
  // call in the background, roll back if it fails. Feels instant
  // even on slow networks; a heart-tap must not visibly lag.
  const favorites = data.favorite_photo_ids;
  const handleToggleFavorite = useCallback(
    (photoId: string, currentlyFavorite: boolean) => {
      const action = currentlyFavorite ? 'remove' : 'add';
      // Optimistic update — flip local state first.
      const nextFavorites = currentlyFavorite
        ? favorites.filter((id) => id !== photoId)
        : Array.from(new Set([...favorites, photoId]));
      onDataUpdate({ ...data, favorite_photo_ids: nextFavorites });
      // Fire-and-forget API call. On failure we revert and toast so
      // the client isn't left thinking a favorite was saved when it
      // wasn't.
      fetch('/api/portal/favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          photo_id: photoId,
          action,
        }),
      })
        .then((res) => res.json())
        .then((result) => {
          if (!result?.success) throw new Error(result?.error || 'server error');
          // Trust the server's list as the source of truth (handles
          // the case where the local optimistic state raced with
          // another tab or a stale reload).
          onDataUpdate({
            ...data,
            favorite_photo_ids: result.favorite_photo_ids ?? nextFavorites,
          });
        })
        .catch(() => {
          // Roll back to previous state + toast.
          onDataUpdate({ ...data, favorite_photo_ids: favorites });
          toast({
            title: `Could not ${action} favorite`,
            description: 'Check your connection and try again.',
            status: 'error',
            duration: 3000,
            isClosable: true,
          });
        });
    },
    [credentials.email, credentials.password, data, favorites, onDataUpdate, toast],
  );

  // ─── Refresh ───
  // Page reload would log them out (credentials live in state), so a
  // soft refresh button is genuinely useful — most relevant right
  // after they've sent a payment and want to see Vero's "Payment
  // Received" entry show up without losing the session.
  const [refreshing, setRefreshing] = useState(false);
  // When Vercel has deployed a newer build since this page loaded, we
  // surface a small notice under the Refresh button with a "Reload" CTA.
  // We don't force-reload — that would log the client out mid-task,
  // which is much more annoying than briefly missing a new feature.
  // The client decides when to reload (e.g. after they finish signing
  // the contract or sharing a gallery link).
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      // Check for a new build in parallel with the data fetch. If one
      // landed, we just flag it — the client keeps their session and
      // sees the notice when they're ready to act on it.
      const [newer, res] = await Promise.all([
        hasNewerDeploy(),
        fetch('/api/portal/client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        }),
      ]);
      if (newer) setUpdateAvailable(true);
      const fresh = await res.json();
      if (res.ok && fresh.success) {
        onDataUpdate(fresh as ClientPortalData);
      }
    } catch {
      // Swallow — user can just click again. No toast clutter.
    } finally {
      setRefreshing(false);
    }
  };

  // ─── Sharing state ───
  // shareUrl is derived from gallery_password (no need to store it, just
  // recompute below). The copy / invite states live here.
  const [shareLinkCopied, setShareLinkCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<
    { kind: 'error' | 'success'; text: string } | null
  >(null);
  const [invitesRemaining, setInvitesRemaining] = useState<number | null>(null);

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://vero.photography'}/portal/pass?password=${encodeURIComponent(data.gallery_password)}`;

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareLinkCopied(true);
      setTimeout(() => setShareLinkCopied(false), 2000);
    } catch {
      toast({ title: 'Could not copy', status: 'error', duration: 2000 });
    }
  };

  const handleSendInvite = async () => {
    setInviteMessage(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      setInviteMessage({ kind: 'error', text: 'Enter a valid email address.' });
      return;
    }
    setInviteSending(true);
    try {
      const res = await fetch('/api/portal/share-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, target_email: inviteEmail.trim() }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        setInviteMessage({
          kind: 'success',
          text: `Invite sent to ${inviteEmail.trim()}.`,
        });
        setInviteEmail('');
        if (typeof result.remaining_today === 'number') {
          setInvitesRemaining(result.remaining_today);
        }
      } else {
        setInviteMessage({
          kind: 'error',
          text: result.error || 'Could not send the invite.',
        });
      }
    } catch {
      setInviteMessage({ kind: 'error', text: 'Could not reach the server.' });
    } finally {
      setInviteSending(false);
    }
  };

  // Single helper for every gallery-pass action — auth + the action are
  // all server-side, this just dispatches and folds the new state back into
  // the parent's clientData so the rest of the view stays in sync.
  const callGalleryPass = async (
    body:
      | { action: 'rotate' }
      | { action: 'enable' }
      | { action: 'disable' }
      | { action: 'set'; customPassword: string },
  ): Promise<boolean> => {
    setGpUpdating(true);
    setGpError('');
    try {
      const res = await fetch('/api/portal/gallery-pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, ...body }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        onDataUpdate({
          ...data,
          gallery_password: result.gallery_password,
          gallery_enabled: result.gallery_enabled,
        });
        return true;
      }
      setGpError(result.error || 'Could not update the gallery pass.');
      return false;
    } catch {
      setGpError('Could not reach the server. Please try again.');
      return false;
    } finally {
      setGpUpdating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(data.gallery_password);
      setGpCopied(true);
      setTimeout(() => setGpCopied(false), 2000);
    } catch {
      toast({
        title: 'Could not copy',
        description: 'Long-press the password to copy it manually.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleSetCustom = async () => {
    const trimmed = gpCustomValue.trim();
    if (trimmed.length < 4) {
      setGpError('Custom password must be at least 4 characters.');
      return;
    }
    const ok = await callGalleryPass({ action: 'set', customPassword: trimmed });
    if (ok) {
      setGpCustomOpen(false);
      setGpCustomValue('');
    }
  };

  return (
    <Box
      bg="white"
      minH="100vh"
      pt={HEADER_CLEARANCE}
      // Belt and braces against the page being draggable sideways on a phone.
      // CLIP, not hidden: `overflow-x: hidden` forces the other axis to auto
      // and turns this Box into a scrollport, which would break the two sticky
      // nav rows inside it (they would stick to this box rather than to the
      // viewport). `clip` does not create a scroll container, so sticky keeps
      // working, and the fixed header is unaffected either way because its
      // containing block is the viewport. The actual overflow was the nav
      // strips' chevron hit area and is fixed at source in ScrollChevron; this
      // is here so the next stray pixel is a visual bug rather than a page
      // that slides around under the reader's thumb.
      overflowX="clip"
    >
      {/* Keyframes for the refresh spinner. A page-global animation that has
          to exist somewhere in the DOM.

          The old pulseUrgent keyframe went with the red pulsing dot on the
          "Next Steps" pill. The header's progress now carries urgency, in one
          place and in one colour at a time, and red there means an overdue
          balance and nothing else. A permanently pulsing red pill beside an
          amber step was two things shouting the same news. */}
      <Box
        as="style"
        dangerouslySetInnerHTML={{
          __html: `
            @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `,
        }}
      />

      {/* The VP coin, the same one a journal post carries, travelling the
          right edge as the client reads.

          Three differences from the journal's, and all three are because this
          is a portal rather than an article. The rail shows at EVERY width,
          because there is no reading column to clear and because the right
          edge is where the reader is already looking: the owner mistook the
          native macOS overlay scrollbar for this and asked where it had gone.
          It FADES when the page stands still, so a portal being read rather
          than scrolled has nothing hovering beside it. And it can be dragged,
          which is what a gallery thousands of pixels long actually wants.

          It does not touch the native scrollbar and must not be made to.
          Styling one to clear a lane for this would turn the macOS overlay
          into a permanent, space-taking bar on every page of the site, and
          only in WebKit. The two sit side by side. */}
      <ReadingProgress rail="always" bottomBar={false} autoHide scrub />

      {/* The portal's own header, in place of the public site navbar.

          It carries BOTH navs, at every width: the booking's own sections as
          the account bar, and the gallery's as the photo bar beside it. Which
          of them owns the room is decided by where the reader is, and the
          header is handed that as `inPhotos` rather than working it out
          itself, so the bar that appears and the name written in it come off
          one measurement. Until the booking is finished a desktop keeps its
          progress track and its second row below instead; a phone hands the
          slot over the moment there are photos.

          Both lists are the same data the rows below render, handed over
          rather than rebuilt, so a phone and a desktop cannot disagree about
          where the client is. */}
      <PortalHeader
        progress={progress}
        sectionNav={
          gallerySectionNav
            ? {
                items: gallerySectionNav.items,
                activeId: gallerySectionNav.activeId,
                onSelect: handleGallerySelect,
              }
            : undefined
        }
        // The items above arrive an effect late, because the gallery builds
        // them and the gallery is a sibling of the header. This is the same
        // fact one render earlier: galleryHasNav is the gallery's own
        // predicate, called on the very data the gallery is about to be handed,
        // so it answers "there will be a photo bar" before there is one.
        // Without it the header spends its first commit painting the 1-2-3
        // progress into a slot the sections are about to take, and the client
        // watches it vanish. One predicate for both, so the slot cannot be
        // reserved for a bar that never comes.
        sectionNavExpected={galleryHasNav}
        accountNav={{ items: navItems, activeId: activeNavId, onSelect: handleNavSelect }}
        inPhotos={headerInPhotos}
        photoCount={photoCount}
      />

      {/* Second sticky row: the portal's section nav, for as long as the
          header is busy showing progress. Top (jumps back to the welcome
          block) → conditional Next Steps → conditional Contract / Balance
          → Password → Photos → Share.

          DESKTOP only now: it is display:none below `md`, where the header's
          burger carries this very list instead. Hides on a desktop when the
          client scrolls into the photos section, where the gallery's own
          sticky section nav takes over that slot so the two do not stack. It
          keeps its height while hidden, see the note on the component. */}
      {!portalComplete && (
        <PortalTopNav
          items={navItems}
          activeId={activeNavId}
          onSelect={handleNavSelect}
          isPhotosInView={isPhotosInView}
        />
      )}

      {/* ─── Welcome block ───
          id="portal-top-section" is the scroll target for the Top
          item in the nav above. The chrome's scroll margin keeps the
          heading from being clipped by the sticky chrome; it is
          derived from the header and nav heights, and from whether
          this portal still has a second row at all, rather than typed
          out, so it can never drift from them.

          Content: title + welcome + labeled session-info rows
          (Email / Event / Type / Location / Delivery). Every info
          row is conditional — clients booked before we started
          storing a field just skip that row rather than showing an
          empty label. Refresh button uses the canonical CTAButton
          so it matches every other button on the site. */}
      <Box
        id="portal-top-section"
        sx={{ scrollMarginTop: chrome.scrollMargin }}
        px={{ base: 4, md: 8 }}
        py={{ base: 8, md: 10 }}
        textAlign="center"
      >
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="brand.accent"
          mb={3}
        >
          Your Portal
        </Text>
        <Box w="40px" h="1px" bg="brand.accent" mx="auto" mb={5} />
        <Text
          as="h1"
          fontSize={{ base: '2xl', md: '3xl' }}
          fontWeight="200"
          color="gray.800"
          letterSpacing="0.02em"
          m={0}
        >
          {data.client_name ? `Welcome, ${data.client_name}` : 'Welcome'}
        </Text>

        {/* Session summary — each row is a centered label-value pair
            (no fixed-width label column, so the whole block reads as
            centered content rather than left-aligned two-column). We
            keep Email + the date + Location; Session and Delivery
            got dropped as noisy — three feels right for the "at a
            glance" role this block plays. The date's label follows the
            booking type: a family client sees "Session Date". */}
        <VStack
          spacing={{ base: 2, md: 2.5 }}
          mt={5}
          mx="auto"
          align="center"
        >
          <InfoRow label="Email" value={data.client_email} />
          {data.event_date && (
            <InfoRow label={wording.dateLabel} value={formatDate(data.event_date)} />
          )}
          {data.event_location && (
            <InfoRow label="Location" value={data.event_location} />
          )}
        </VStack>

        {/* Refresh and Sign Out, centred as a pair. Both are canonical
            CTAButtons so they read as part of the site rather than as
            one-offs. Sign Out uses the outlined danger treatment: a
            hairline that only fills on hover, which is the quiet end of
            the scale. Nothing here is destructive, but it does end the
            visit, so it should not sit in gold next to Refresh. */}
        <HStack mt={6} spacing={3} justify="center" flexWrap="wrap">
          <CTAButton
            onClick={handleRefresh}
            icon={FaSync}
            variant="outline"
            size="sm"
            isLoading={refreshing}
            loadingText="Refreshing..."
          >
            Refresh Portal
          </CTAButton>
          {onLogout && (
            <CTAButton
              onClick={() => setSignOutOpen(true)}
              icon={FaSignOutAlt}
              variant="danger"
              size="sm"
            >
              Sign Out
            </CTAButton>
          )}
        </HStack>

        {/* Update-available notice — surfaces when Refresh detected a
            newer build. Non-blocking; the client keeps their session
            and can reload when they're ready. Reload uses a text-link
            treatment rather than another button because it visually
            sits INSIDE the notice card. */}
        {updateAvailable && (
          <Flex
            direction={{ base: 'column', sm: 'row' }}
            align="center"
            justify="center"
            gap={3}
            mt={4}
            px={4}
            py={2}
            bg="#fff8e6"
            borderTop="1px solid"
            borderBottom="1px solid"
            borderColor="brand.accentBorder"
            maxW="fit-content"
            mx="auto"
          >
            <Text fontSize="xs" color="gray.700" fontWeight="300">
              A newer version of the portal is available.
            </Text>
            <CTAButton
              onClick={() => window.location.reload()}
              variant="solid"
              size="sm"
            >
              Reload
            </CTAButton>
          </Flex>
        )}
      </Box>

      {/* Next-steps panel — hoisted to the top of the section list so
          the very first thing signed clients see is what they still
          need to do (retainer / balance) or an "all set" confirmation,
          before the collapsed signed contract or any other section.
          Before signing this returns null and the section takes no
          space, so it's a no-op for pending/no-contract flows. */}
      <Box
        id="next-steps-section"
        sx={{ scrollMarginTop: chrome.scrollMargin }}
      >
        <NextStepsPanel
          contractStatus={data.contract_status}
          total={data.contract_total_amount}
          retainer={data.contract_retainer_amount}
          paidToDate={data.paid_to_date}
          chargesTotal={chargesTotal}
          wording={wording}
          // Once photos land, the "All Set / awaiting delivery" state
          // is no longer relevant — client isn't waiting anymore.
          // Panel returns null in that case (fully-paid + delivered).
          photosDelivered={photosDelivered}
          credentials={credentials}
        />
      </Box>

      {/* ─── Contract section ───
          Pending: shows the consent checkbox + signature pad + sign button.
          Signed: shows the date + a download link to the signed PDF (served
          via Drive's standard download endpoint).
          Other (none/void): empty.
          Gray in the new alternation (Header/NextSteps sit above; Balance
          white below). Inner ContractSignSection / SignedContractSection
          are transparent so this wrapper's bg shows through.
      */}
      <Box
        id="contract-section"
        bg="gray.50"
        borderTop="1px solid"
        borderColor="gray.100"
        sx={{ scrollMarginTop: chrome.scrollMargin }}
      >
        {data.contract_status === 'pending' && (
          <ContractSignSection
            credentials={credentials}
            contractBody={data.contract_body}
            onSigned={(updates) => onDataUpdate({ ...data, ...updates })}
          />
        )}
        {data.contract_status === 'signed' && data.contract_signed_at && (
          <SignedContractSection
            credentials={credentials}
            signedAt={data.contract_signed_at}
            pdfAvailable={data.contract_signed_pdf_available}
          />
        )}
      </Box>

      {/* ─── Payment / Balance section — Phase 3 fills this in fully.
            For now, surface the totals so it's visible end-to-end. ─── */}
      {data.contract_total_amount !== null && remaining !== null && (
        <Box
          id="balance-section"
          bg="white"
          py={{ base: 10, md: 12 }}
          px={6}
          borderTop="1px solid"
          borderColor="gray.100"
          sx={{ scrollMarginTop: chrome.scrollMargin }}
        >
          <VStack spacing={4} maxW="540px" mx="auto" textAlign="center">
            <Text
              fontSize="xs"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.25em"
              color="brand.accentText"
            >
              Balance
            </Text>
            <Box w="30px" h="1px" bg="brand.accent" />
            {/* Equal-width grid keeps the stats aligned even when the
                Retainer or Added column drops out. On mobile we go to 2x2
                so amounts don't truncate; desktop sits on one row. */}
            <SimpleGrid
              columns={{
                base: 2,
                md:
                  3 +
                  (data.contract_retainer_amount !== null && data.contract_retainer_amount > 0 ? 1 : 0) +
                  (chargesTotal > 0 ? 1 : 0),
              }}
              spacing={{ base: 5, md: 8 }}
              w="100%"
            >
              <BalanceStat label="Total" value={formatMoney(data.contract_total_amount)} />
              {data.contract_retainer_amount !== null && data.contract_retainer_amount > 0 && (
                <BalanceStat
                  label="Retainer"
                  value={formatMoney(data.contract_retainer_amount)}
                  note="Part of total"
                />
              )}
              {/* Sits between Total and Paid so the column order reads as
                  the arithmetic: this much, plus this, less what you paid,
                  leaves this. */}
              {chargesTotal > 0 && (
                <BalanceStat
                  label="Added"
                  value={formatMoney(chargesTotal)}
                  note="Listed below"
                />
              )}
              <BalanceStat label="Paid" value={formatMoney(data.paid_to_date)} />
              {/* An overpayment is money owed BACK, so it gets its own label
                  rather than being flattened into a zero balance. Saying
                  "Remaining $0.00" to someone who is fifty dollars up reads
                  as the money having been quietly absorbed. */}
              {creditBalance > 0 ? (
                <BalanceStat
                  label="Credit"
                  value={formatMoney(creditBalance)}
                  note="Overpaid, we owe you this"
                />
              ) : (
                <BalanceStat
                  label="Remaining"
                  value={formatMoney(remaining)}
                  emphasize={remaining > 0}
                />
              )}
            </SimpleGrid>

            {/* Itemized charges: extra time, and costs paid on the day.
                A receipt, not a demand: each line says what it was for and
                what it cost, and nothing here scolds. Sits above the
                payments list so the reading order matches the stat row
                (what the booking came to, what was added, what was paid). */}
            {data.charges.length > 0 && (
              <Box w="100%" pt={6}>
                <Text
                  fontSize="2xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.25em"
                  color="brand.accent"
                  mb={2}
                >
                  Added To Your Booking
                </Text>
                <Text fontSize="xs" color="gray.500" fontWeight="300" mb={4} lineHeight="1.7">
                  From the Additional Time and Expenses section of your contract.
                </Text>
                <VStack spacing={2} align="stretch">
                  {data.charges.map((c) => (
                    <Flex
                      key={c.id}
                      align="center"
                      justify="space-between"
                      bg="white"
                      border="1px solid"
                      borderColor="gray.200"
                      borderRadius="sm"
                      px={4}
                      py={3}
                      textAlign="left"
                      gap={3}
                    >
                      <VStack align="start" spacing={0.5} flex="1" minW={0}>
                        <HStack spacing={2} flexWrap="wrap">
                          <Text fontSize="sm" color="gray.800" fontWeight="500">
                            {formatMoney(c.amount)}
                          </Text>
                          <Text fontSize="sm" color="gray.500">
                            · {chargeReasonLabel(c.reason)}
                          </Text>
                          <Text fontSize="sm" color="gray.400">
                            · {formatDate(c.charged_at)}
                          </Text>
                        </HStack>
                        {c.note && (
                          <Text fontSize="xs" color="gray.600" fontWeight="300">
                            {c.note}
                          </Text>
                        )}
                      </VStack>
                    </Flex>
                  ))}
                </VStack>
              </Box>
            )}

            {/* Itemized payment log — every entry Veronika has recorded
                (retainer, balance, etc.), with method and notes. Doesn't
                include in-the-future installment plan rows; those live
                below in their own section. */}
            {data.payments.length > 0 && (
              <Box w="100%" pt={6}>
                <Text
                  fontSize="2xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.25em"
                  color="brand.accent"
                  mb={4}
                >
                  Payments Received
                </Text>
                <VStack spacing={2} align="stretch">
                  {data.payments.map((p) => (
                    <Flex
                      key={p.id}
                      align="center"
                      justify="space-between"
                      bg="white"
                      border="1px solid"
                      borderColor="green.100"
                      borderRadius="sm"
                      px={4}
                      py={3}
                      textAlign="left"
                      gap={3}
                    >
                      <VStack align="start" spacing={0.5} flex="1" minW={0}>
                        <HStack spacing={2} flexWrap="wrap">
                          <Text fontSize="sm" color="gray.800" fontWeight="500">
                            {formatMoney(p.amount)}
                          </Text>
                          {p.method && (
                            <Text fontSize="sm" color="gray.500">
                              · {p.method}
                            </Text>
                          )}
                          <Text fontSize="sm" color="gray.400">
                            · {formatDate(p.paid_at)}
                          </Text>
                        </HStack>
                        {p.note && (
                          <Text fontSize="xs" color="gray.600" fontWeight="300">
                            {p.note}
                          </Text>
                        )}
                      </VStack>
                      <Text
                        fontSize="2xs"
                        fontWeight="500"
                        textTransform="uppercase"
                        letterSpacing="0.15em"
                        color="green.500"
                      >
                        Received
                      </Text>
                    </Flex>
                  ))}
                </VStack>
              </Box>
            )}

            {data.payment_plan_enabled && data.installments.length > 0 && (
              <Box w="100%" pt={6}>
                <Text
                  fontSize="2xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.25em"
                  color="brand.accent"
                  mb={4}
                >
                  Payment Schedule
                </Text>
                <VStack spacing={3} align="stretch">
                  {data.installments.map((inst) => {
                    const isPaid = inst.paid_at !== null;
                    const isOverdue =
                      !isPaid && new Date(inst.due_date) < new Date();
                    return (
                      <Flex
                        key={inst.installment_number}
                        align="center"
                        justify="space-between"
                        bg="white"
                        border="1px solid"
                        borderColor={isPaid ? 'green.200' : isOverdue ? 'red.200' : 'gray.200'}
                        borderRadius="sm"
                        px={4}
                        py={3}
                        textAlign="left"
                      >
                        <VStack align="start" spacing={0.5}>
                          <Text fontSize="xs" color="gray.500" fontWeight="500">
                            Installment {inst.installment_number}
                          </Text>
                          <Text fontSize="sm" color="gray.700" fontWeight="400">
                            {formatMoney(inst.amount)}
                            <Text as="span" color="gray.400" fontWeight="300">
                              {' · due '}
                              {formatDate(inst.due_date)}
                            </Text>
                          </Text>
                        </VStack>
                        <Text
                          fontSize="2xs"
                          fontWeight="500"
                          textTransform="uppercase"
                          letterSpacing="0.15em"
                          color={
                            isPaid ? 'green.500' : isOverdue ? 'red.500' : 'gray.500'
                          }
                        >
                          {isPaid
                            ? `Paid ${inst.payment_method ? `· ${inst.payment_method}` : ''}`
                            : isOverdue
                              ? 'Overdue'
                              : 'Upcoming'}
                        </Text>
                      </Flex>
                    );
                  })}
                </VStack>
              </Box>
            )}
          </VStack>
        </Box>
      )}

      {/* ─── Login password management ───
          Moved above Photos so the section alternation lands with the
          gallery block on white (which lets the gallery's own white
          header sit flush with its container). Order is now:
          Balance → Password → Photos → Share. The "Gallery Pass vs
          login password" ambiguity that motivated the old ordering
          isn't a real problem in the new IA — Gallery Pass has moved
          into Share, so the two are far apart.
          id wrapper is the portal top nav's scroll target. */}
      <Box
        id="password-section"
        bg="gray.50"
        borderTop="1px solid"
        borderColor="gray.100"
        sx={{ scrollMarginTop: chrome.scrollMargin }}
      >
        <ChangePasswordSection
          credentials={credentials}
          onChanged={onPasswordChanged}
        />
      </Box>

      {/* ─── Photos ───
          Three states, kept mutually exclusive:
          1) No Drive URL set OR Drive folder empty with no listing error →
             "photos will appear once they're ready" placeholder with a
             proper section header so it doesn't look like empty space
             the client can't identify.
          2) Drive URL set, listing failed (warning) → render the gallery
             (the failure-mode UI inside shows the "previews aren't
             loading" message + a "View in Drive" button so the client
             still has a path to their photos).
          3) Drive URL set, files present → normal gallery.

          Wrapped with id + ref so:
            - the portal top nav can smooth-scroll here (id)
            - an IntersectionObserver knows when the user is inside this
              section, which controls (a) hiding the portal top nav on
              desktop and (b) whether the gallery's own sticky bottom bar
              is visible (only when photos are actually in view). */}
      <Box
        id="photos-section"
        ref={photosSectionRef}
        // Photos is WHITE so the gallery's own white header (Private
        // Gallery, client name, disclaimer, review card) sits flush
        // with its section rather than looking like a bright rectangle
        // stuck inside a gray container. New alternation (with
        // Password moved up):
        //   Header (white) → Next Steps (warm) → Contract (gray)
        //   → Balance (white) → Password (gray) → Photos (white)
        //   → Share (gray).
        // Empty-placeholder version below also uses white to match.
        bg="white"
        borderTop="1px solid"
        borderColor="gray.100"
        sx={{ scrollMarginTop: chrome.scrollMargin }}
      >
        {(() => {
          if (galleryRendered) {
            return (
              <ClientGallery
                clientName={data.client_name}
                driveUrl={data.drive_url!}
                rootFiles={data.rootFiles}
                sections={data.sections}
                warning={data.warning}
                expiresAt={data.gallery_expires_at}
                // Favorites are full-portal only. /portal/pass renders
                // ClientGallery without these props, which disables the
                // heart UI + Favorites section for guests (they didn't
                // sign in, there's no place to persist their picks).
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                // This portal keeps a nav row under the header until the
                // booking is complete, so the gallery's own headings have to
                // clear it even in the states where the gallery draws no
                // strip of its own. Desktop widths only; portalChrome knows a
                // phone has no second row in any state.
                portalNavRow={!portalComplete}
                // Once the booking is complete the header carries the gallery's
                // sections itself, as the photo bar, at every width. A strip
                // under it would be the same list twice, and the one thing this
                // page must never do is pin two nav rows to the same band. The
                // gallery still BUILDS the nav and hands it up, which is what
                // the bar renders: the flag only says who draws the control.
                sectionNavInHeader={portalComplete}
                // And the gallery hands its section nav back up, for the
                // header's photo bar. See gallerySectionNav above.
                onSectionNav={setGallerySectionNav}
              />
            );
          }
          return (
            /* Placeholder inherits gray.50 from the photos-section
               wrapper — no explicit bg needed here. */
            <Box py={{ base: 14, md: 20 }} px={6} textAlign="center">
              <Text
                fontSize="xs"
                fontWeight="500"
                textTransform="uppercase"
                letterSpacing="0.25em"
                color="brand.accent"
                mb={3}
              >
                Your Photos
              </Text>
              <Box w="30px" h="1px" bg="brand.accent" mx="auto" mb={5} />
              <Text fontSize="sm" color="gray.500" fontWeight="300" lineHeight="1.7">
                {/* Two different waits, and saying the wrong one is worse than
                    saying nothing: withheld means the photos are finished and
                    waiting on release, so "will appear once Veronika delivers
                    them" would read as a stall. The server sends no amounts
                    here and neither does this copy, because the balance is a
                    conversation with Veronika, not a notice on a page. */}
                {data.gallery_withheld
                  ? 'Your photos are ready and will be released here shortly. Veronika will email you the moment they are open.'
                  : 'Your gallery will appear here once Veronika delivers your photos.'}
              </Text>
            </Box>
          );
        })()}
      </Box>

      {/* ─── Gallery Pass management ───
          The client owns this control: rotate, disable entirely, or set a
          custom password. All server-side via /api/portal/gallery-pass,
          re-authenticated each call with the credentials passed down from
          the Portal page.
          id="gallery-share-section" is the smooth-scroll target for the
          gallery's sticky Share widget — same id is used on the
          /portal/pass route so the widget doesn't need to know its
          context, it just scrolls to whichever element exists. */}
      <Box
        id="gallery-share-section"
        bg="gray.50"
        borderTop="1px solid"
        borderColor="gray.100"
        py={{ base: 12, md: 14 }}
        px={6}
        mt={6}
        sx={{ scrollMarginTop: chrome.scrollMargin }}
      >
        <VStack maxW="520px" mx="auto" spacing={6}>
          {/* Section header */}
          <VStack spacing={2}>
            <Text
              fontSize="xs"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.25em"
              color="brand.accentText"
            >
              Share these photos
            </Text>
            <Box w="30px" h="1px" bg="brand.accent" />
          </VStack>

          {!data.gallery_enabled ? (
            /* Disabled state — one clear "enable to share" CTA. No point
               showing password/link/email UI when nothing will work. */
            <VStack spacing={4} textAlign="center">
              <Text fontSize="sm" color="gray.600" fontWeight="300" lineHeight="1.7">
                Gallery sharing is currently <Text as="span" fontWeight="500" color="gray.700">disabled</Text>. Enable it to share these photos with family or friends.
              </Text>
              <CTAButton
                onClick={() => callGalleryPass({ action: 'enable' })}
                variant="solid"
                size="sm"
                isLoading={gpUpdating}
                loadingText="Enabling..."
              >
                Enable sharing
              </CTAButton>
              {gpError && (
                <Text fontSize="xs" color="red.500" fontWeight="400">
                  {gpError}
                </Text>
              )}
            </VStack>
          ) : (
            <>
              <Text fontSize="sm" color="gray.600" fontWeight="300" textAlign="center" lineHeight="1.7">
                Want to share these with family or friends? Anyone with the link below can view the gallery, no account needed.
              </Text>

              {/* HERO — one-click link with big Copy button */}
              <Box
                w="100%"
                bg="brand.surface"
                border="1px solid"
                borderColor="brand.accentBorder"
                borderRadius="md"
                px={{ base: 5, md: 7 }}
                py={{ base: 6, md: 7 }}
                textAlign="center"
              >
                <Text
                  fontSize="2xs"
                  fontWeight="500"
                  textTransform="uppercase"
                  letterSpacing="0.25em"
                  color="brand.accentText"
                  mb={4}
                >
                  Easiest: one-click link
                </Text>
                <CTAButton
                  onClick={handleCopyShareLink}
                  icon={shareLinkCopied ? FaCheck : FaCopy}
                  variant="solid"
                  size="md"
                  fullWidth
                >
                  {shareLinkCopied ? 'Link Copied!' : 'Copy Link'}
                </CTAButton>
                <Text
                  mt={4}
                  fontSize="xs"
                  color="gray.500"
                  fontWeight="300"
                  fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
                  noOfLines={1}
                  wordBreak="break-all"
                >
                  {shareUrl}
                </Text>
                <Text mt={2} fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.6">
                  Paste anywhere: text, email, WhatsApp. Opens the gallery instantly, no password to type.
                </Text>
              </Box>

              {/* Secondary: email + password. "Or, more ways" divider to
                  visually demote these from equal-weight alternatives. */}
              <Box w="100%" pt={2}>
                <Flex align="center" gap={3} mb={5}>
                  <Box flex={1} h="1px" bg="gray.200" />
                  <Text
                    fontSize="2xs"
                    fontWeight="500"
                    textTransform="uppercase"
                    letterSpacing="0.2em"
                    color="gray.400"
                    whiteSpace="nowrap"
                  >
                    Or, more ways
                  </Text>
                  <Box flex={1} h="1px" bg="gray.200" />
                </Flex>

                {/* Email invite */}
                <VStack w="100%" spacing={2} align="stretch" mb={6}>
                  <Text fontSize="xs" color="gray.500" fontWeight="400" lineHeight="1.6">
                    Have us email the one-click link:
                  </Text>
                  <Flex gap={2} direction={{ base: 'column', sm: 'row' }}>
                    <Input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="friend@example.com"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                      h="40px"
                      bg="white"
                      fontSize="sm"
                      _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
                    />
                    <CTAButton
                      onClick={handleSendInvite}
                      variant="outline"
                      size="sm"
                      isLoading={inviteSending}
                      loadingText="Sending..."
                    >
                      Send Invite
                    </CTAButton>
                  </Flex>
                  <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.5">
                    Up to 5 invites per 24-hour period so nothing gets spammy.
                    {invitesRemaining !== null && (
                      <> ({invitesRemaining} left today.)</>
                    )}
                  </Text>
                  {inviteMessage && (
                    <Text
                      fontSize="xs"
                      fontWeight="400"
                      color={inviteMessage.kind === 'error' ? 'red.500' : 'green.600'}
                    >
                      {inviteMessage.text}
                    </Text>
                  )}
                </VStack>

                {/* Manual password + management controls. The controls
                    (rotate, disable, set custom) live here — attached
                    to the password itself — instead of being their own
                    prominent block at the top of the section, so the
                    share-flow reads as the primary purpose. */}
                <VStack w="100%" spacing={2} align="stretch">
                  <Text fontSize="xs" color="gray.500" fontWeight="400" lineHeight="1.6">
                    Or go to <Text as="span" fontWeight="500" color="gray.700">vero.photography/portal/pass</Text> and enter this password:
                  </Text>
                  <Flex
                    align="center"
                    gap={2}
                    bg="white"
                    border="1px solid"
                    borderColor="gray.200"
                    borderRadius="sm"
                    px={3}
                    py={2}
                  >
                    <Text
                      fontSize="sm"
                      color="gray.800"
                      fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
                      fontWeight="500"
                      flex="1"
                      minW={0}
                      textAlign="left"
                      letterSpacing="0.05em"
                    >
                      {data.gallery_password}
                    </Text>
                    <Box
                      as="button"
                      type="button"
                      onClick={handleCopy}
                      aria-label="Copy password"
                      p={1.5}
                      borderRadius="sm"
                      color="gray.500"
                      cursor="pointer"
                      _hover={{ color: 'brand.accent', bg: 'gray.100' }}
                      sx={{ WebkitTapHighlightColor: 'transparent' }}
                    >
                      <Icon as={gpCopied ? FaCheck : FaCopy} boxSize={3} />
                    </Box>
                  </Flex>

                  {/* Password management row — three buttons centered
                      below the password itself. Small helper line below
                      spells out what each does so clients don't have to
                      guess; "Rotate" and "Set custom" are especially
                      ambiguous without context. */}
                  <Text
                    pt={3}
                    fontSize="xs"
                    color="gray.500"
                    fontWeight="300"
                    lineHeight="1.6"
                    textAlign="center"
                  >
                    Change the password if it gets shared too widely, or turn sharing off entirely.
                  </Text>
                  <HStack spacing={2} pt={1} flexWrap="wrap" justify="center">
                    <CTAButton
                      onClick={() => callGalleryPass({ action: 'rotate' })}
                      variant="outline"
                      size="sm"
                      icon={FaSync}
                      isLoading={gpUpdating}
                    >
                      Generate new
                    </CTAButton>
                    <CTAButton
                      onClick={() => setGpCustomOpen((open) => !open)}
                      variant="outline"
                      size="sm"
                      isDisabled={gpUpdating}
                    >
                      {gpCustomOpen ? 'Cancel' : 'Pick my own'}
                    </CTAButton>
                    <CTAButton
                      onClick={() => callGalleryPass({ action: 'disable' })}
                      variant="outline"
                      size="sm"
                      isLoading={gpUpdating}
                    >
                      Turn off sharing
                    </CTAButton>
                  </HStack>

                  {gpCustomOpen && (
                    <Flex
                      gap={2}
                      pt={3}
                      direction={{ base: 'column', sm: 'row' }}
                    >
                      <Input
                        value={gpCustomValue}
                        onChange={(e) => setGpCustomValue(e.target.value.toUpperCase())}
                        placeholder="ABCD1234"
                        autoCapitalize="characters"
                        autoCorrect="off"
                        spellCheck={false}
                        h="40px"
                        bg="white"
                        fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
                        fontSize="sm"
                        letterSpacing="0.05em"
                        _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
                      />
                      <CTAButton
                        onClick={handleSetCustom}
                        variant="solid"
                        size="sm"
                        isLoading={gpUpdating}
                        loadingText="Saving..."
                      >
                        Save
                      </CTAButton>
                    </Flex>
                  )}

                  {gpError && (
                    <Text fontSize="xs" color="red.500" fontWeight="400" pt={2}>
                      {gpError}
                    </Text>
                  )}
                </VStack>
              </Box>
            </>
          )}
        </VStack>
      </Box>

      {/* Sign out asks first. Nothing is lost by signing out, but a
          client who taps it by accident has to find their password
          again, and on a phone that is a real errand. Reuses the shared
          ConfirmDialog rather than window.confirm or a new modal. */}
      <ConfirmDialog
        isOpen={signOutOpen}
        title="Sign out?"
        body="You will need your email and password to get back in."
        confirmLabel="Sign Out"
        cancelLabel="Stay Signed In"
        danger
        onConfirm={() => {
          setSignOutOpen(false);
          onLogout?.();
        }}
        onCancel={() => setSignOutOpen(false)}
      />
    </Box>
  );
};

/**
 * One labeled row in the portal-header session summary. Kept as a
 * component so every row shares the exact same layout, alignment,
 * type scale, and gold label treatment. Keep new header info coming
 * through this — do NOT hand-roll another Flex-label-value pair.
 */
const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <Flex
    direction={{ base: 'column', sm: 'row' }}
    align="center"
    justify="center"
    gap={{ base: 0.5, sm: 3 }}
    textAlign="center"
  >
    <Text
      fontSize="2xs"
      fontWeight="500"
      textTransform="uppercase"
      letterSpacing="0.22em"
      color="brand.accent"
      flexShrink={0}
    >
      {label}
    </Text>
    <Text
      fontSize="sm"
      fontWeight="400"
      color="gray.700"
      lineHeight="1.5"
    >
      {value}
    </Text>
  </Flex>
);

const BalanceStat = ({
  label,
  value,
  emphasize,
  note,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  note?: string;
}) => (
  <VStack spacing={1}>
    <Text
      fontSize="2xs"
      fontWeight="500"
      textTransform="uppercase"
      letterSpacing="0.25em"
      color={emphasize ? 'brand.accent' : 'gray.400'}
    >
      {label}
    </Text>
    <Text
      fontSize={{ base: 'xl', md: '2xl' }}
      fontWeight={emphasize ? '400' : '200'}
      color={emphasize ? 'gray.800' : 'gray.600'}
    >
      {value}
    </Text>
    {note && (
      <Text fontSize="2xs" color="gray.400" fontStyle="italic">
        {note}
      </Text>
    )}
  </VStack>
);

/**
 * Post-sign "what's next" panel. Surfaces the most pressing payment
 * step (retainer or balance) with payment-method links so the client
 * isn't left wondering what to do after they sign.
 *
 * The handles moved to src/data/payment-handles.ts. They used to be declared
 * here, which meant they lived only in this bundle and the admin assistant
 * could not answer "what is our Venmo?" about a number printed on every
 * portal. Zelle is still bank-app initiated (no public URL, just the number
 * with a Copy button); Venmo and Cash App have public /handle URLs that open
 * the in-app payment screen on mobile.
 */

function NextStepsPanel({
  contractStatus,
  total,
  retainer,
  paidToDate,
  chargesTotal,
  wording,
  photosDelivered,
  credentials,
}: {
  contractStatus: 'none' | 'pending' | 'signed' | 'void';
  total: number | null;
  retainer: number | null;
  paidToDate: number;
  // Extra time and costs paid on the day, owed on top of the contract total.
  // The retainer is untouched by these: it reserves the date and is agreed up
  // front, while charges land after the shoot, so they fall on the balance.
  chargesTotal: number;
  // Needed to start a card payment: the portal re-proves ownership on every
  // request rather than holding a session, so the pay endpoint is exactly as
  // protected as the one that showed this balance.
  credentials: { email: string; password: string };
  // Event vs session nouns, resolved once by the parent from the booking's
  // type. This panel is where the wedding assumptions were thickest: it
  // talked about reserving "the date" and paying cash on the day of "the
  // event", to family and maternity clients who have neither.
  wording: BookingWording;
  // When true, the "All Set / awaiting delivery" state stops
  // rendering entirely — the client isn't awaiting anything, the
  // photos are already there. Retainer/balance states still show
  // if somehow relevant (rare — normally payments finish before
  // delivery, but be defensive about the state).
  photosDelivered: boolean;
}) {
  // Only meaningful after the contract is signed. Before that,
  // "next step" IS the contract itself and there's already a
  // dedicated section for it.
  if (contractStatus !== 'signed' || total === null) return null;

  const owed = total + chargesTotal;
  const retainerOutstanding = retainer !== null && retainer > 0 && paidToDate < retainer;
  const retainerToSend = retainerOutstanding ? retainer - paidToDate : 0;
  const balanceOutstanding = !retainerOutstanding && paidToDate < owed;
  const balanceToSend = balanceOutstanding ? owed - paidToDate : 0;
  const fullyPaid = !retainerOutstanding && !balanceOutstanding;

  // Fully paid AND photos delivered → nothing to say. The Photos
  // section itself is the celebration.
  if (fullyPaid && photosDelivered) return null;

  const sectionLabel = fullyPaid ? 'All Set' : 'Next Step';

  return (
    <Box
      bg="linear-gradient(180deg, #fefaf2 0%, #fcf6ea 100%)"
      borderTop="1px solid"
      borderBottom="1px solid"
      borderColor="#f0e4b6"
      py={{ base: 10, md: 12 }}
      px={6}
    >
      <VStack maxW="560px" mx="auto" spacing={5}>
        <VStack spacing={2}>
          <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="brand.accent">
            {sectionLabel}
          </Text>
          <Box w="30px" h="1px" bg="brand.accent" />
        </VStack>

        {retainerOutstanding ? (
          <>
            <VStack spacing={3} textAlign="center">
              <Text fontSize="lg" color="gray.800" fontWeight="400">
                Send your retainer of <strong>${retainerToSend.toFixed(0)}</strong> to reserve {wording.reserveDate}.
              </Text>
              <Text fontSize="sm" color="gray.600" fontWeight="300" lineHeight="1.7">
                Your contract is signed, but per the agreement the {wording.dateNoun} isn't officially booked until the retainer arrives. Send it through any of the methods below, and note "retainer" in the comments so Veronika can match it up.
              </Text>
            </VStack>

            <PayByCardButton kind="retainer" amount={retainerToSend} credentials={credentials} />
            <PaymentMethodsStack />

            <Text fontSize="xs" color="gray.500" fontWeight="300" textAlign="center" maxW="440px" lineHeight="1.7">
              Once you've sent it, reply to this booking's email or message Veronika so she can confirm receipt. <Text as="span" fontWeight="500" color="gray.700">If she's already confirmed and this page hasn't updated, tap "Refresh Portal" up top.</Text>
            </Text>
          </>
        ) : balanceOutstanding ? (
          <>
            {/* Celebrate the retainer being received — this section
                exists specifically because the "you already did the
                urgent thing" moment was previously invisible; users
                saw "next step: pay balance" and thought they were
                behind on everything. Green + checkmark makes clear
                the urgent step is DONE. */}
            <Flex
              w="100%"
              align="center"
              gap={3}
              bg="green.50"
              border="1px solid"
              borderColor="green.200"
              borderRadius="md"
              px={4}
              py={3}
            >
              <Text fontSize="lg" role="img" aria-hidden>✅</Text>
              <Text fontSize="sm" color="green.700" fontWeight="500" lineHeight="1.5">
                Retainer received, your date is reserved. The rest can wait until closer to {wording.occasion}.
              </Text>
            </Flex>

            <VStack spacing={2} textAlign="center">
              <Text fontSize="lg" color="gray.800" fontWeight="400">
                Remaining balance: <strong>${balanceToSend.toFixed(0)}</strong>
              </Text>
              {/* The number moved because something was added to it, so say
                  so here and point at the lines that explain it. Stated, not
                  justified: the Balance section carries the detail. */}
              {chargesTotal > 0 && (
                <Text fontSize="sm" color="gray.600" fontWeight="300" lineHeight="1.7">
                  This includes ${chargesTotal.toFixed(0)} added after {wording.occasion}, listed
                  line by line under Balance below.
                </Text>
              )}
            </VStack>

            {/* The actual clause from the contract, restated here so
                clients don't have to dig back into the signed PDF to
                figure out when the balance is due. */}
            <Box
              w="100%"
              bg="white"
              border="1px solid"
              borderColor="brand.accentBorder"
              borderRadius="md"
              px={5}
              py={4}
            >
              <Text fontSize="2xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.2em" color="brand.accentText" mb={2}>
                Per your contract
              </Text>
              <Text fontSize="sm" color="gray.700" lineHeight="1.7" fontStyle="italic">
                The remaining balance is due within the payment window specified in your contract (after the {wording.dateNoun}). Full payment must be received before delivery of any images.
              </Text>
            </Box>

            <PayByCardButton kind="balance" amount={balanceToSend} credentials={credentials} />
            <PaymentMethodsStack />

            <VStack spacing={2} maxW="440px" textAlign="center">
              <Text fontSize="xs" color="gray.600" fontWeight="400" lineHeight="1.7">
                <Text as="span" fontWeight="500" color="gray.700">Cash</Text> is also accepted on the day of {wording.occasion}.
              </Text>
              <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.7">
                If your contract's Additional Notes section specifies different payment terms for this booking, those take precedence over the standard schedule above.
              </Text>
              <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.7">
                Once you've sent payment, message Veronika so she can confirm. <Text as="span" fontWeight="500" color="gray.700">If she's already confirmed and this page hasn't updated, tap "Refresh Portal" up top.</Text>
              </Text>
            </VStack>
          </>
        ) : (
          /* Fully paid — this whole section becomes an informational
             "here's what happens next" panel instead of a to-do.
             Signals warmly that everything on the client's side is
             done and photos are on the way, so the empty Photos
             placeholder below doesn't read as "did I miss a step?" */
          <>
            <Flex
              w="100%"
              align="center"
              gap={3}
              bg="green.50"
              border="1px solid"
              borderColor="green.200"
              borderRadius="md"
              px={4}
              py={4}
            >
              <Text fontSize="xl" role="img" aria-hidden>🎉</Text>
              <VStack align="start" spacing={0.5}>
                <Text fontSize="sm" color="green.700" fontWeight="600" lineHeight="1.4">
                  You're fully paid up, thank you!
                </Text>
                <Text fontSize="xs" color="green.700" fontWeight="400" lineHeight="1.5">
                  Nothing else to do on your end.
                </Text>
              </VStack>
            </Flex>

            <VStack spacing={3} textAlign="center" maxW="440px">
              <Text fontSize="sm" color="gray.700" fontWeight="400" lineHeight="1.7">
                Your gallery will be delivered per your contract's timeline, typically within a few weeks after {wording.occasion}.
              </Text>
              <Text fontSize="sm" color="gray.600" fontWeight="300" lineHeight="1.7">
                Keep an eye on your email, you'll get a note from Veronika the moment it's ready, and the Photos section below will fill in with your images.
              </Text>
              <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.6" pt={2}>
                Delivery already happened but photos aren't showing here yet? Tap <Text as="span" fontWeight="500" color="gray.700">"Refresh Portal"</Text> up top.
              </Text>
            </VStack>
          </>
        )}
      </VStack>
    </Box>
  );
}

// Small helper — the three payment-method rows show up in both the
// retainer and balance flows, and were duplicated inline. Extracted
// so future tweaks (adding a method, changing handles, etc) live in
// one place instead of two.
/**
 * Pay by card, from the portal.
 *
 * Renders nothing unless CARD_PAYMENTS_ENABLED, so this ships dark and turns
 * on with one constant once a live Stripe account exists. Until then the
 * client sees exactly what they see today.
 *
 * The button NEVER sends an amount. It says which payment this is and the
 * server works out what that costs, because a number that travels through a
 * browser is a number a client can edit.
 *
 * The label carries the amount anyway, because the client is on a phone and
 * should not have to reconcile "Pay now" against a figure further up the page.
 */
function PayByCardButton({
  kind,
  amount,
  credentials,
}: {
  kind: 'retainer' | 'balance';
  amount: number;
  credentials: { email: string; password: string };
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Reads the live query string rather than a captured prop, so opening the
  // portal with ?cards=1 during preview shows the button without a reload.
  if (!cardPaymentsVisible(typeof window === 'undefined' ? '' : window.location.search)) return null;
  if (amount <= 0) return null;

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/portal/pay-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email,
          password: credentials.password,
          kind,
          // Ask for the opt-in to be echoed into the return URL, so coming back
          // from Stripe during preview does not land on a portal with no button.
          preview: CARD_PAYMENTS_MODE === 'preview',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.url) {
        // Same tab, deliberately. A payment that opens in a new tab leaves the
        // client wondering which one is real, and the return URL brings them
        // straight back to this page anyway.
        window.location.href = data.url;
        return;
      }
      setError(data.error || 'Could not start the payment. Please try again.');
    } catch {
      setError('Could not reach the payment page. Please check your connection.');
    } finally {
      // Left spinning on success on purpose: the redirect is in flight and
      // re-enabling the button invites a second click that opens a second
      // checkout session.
      setBusy(false);
    }
  };

  return (
    <VStack spacing={2} w="100%" maxW="380px" mb={2}>
      <CTAButton onClick={start} variant="solid" isLoading={busy} loadingText="Opening" fullWidth>
        {kind === 'retainer'
          ? `Pay $${amount.toFixed(0)} retainer by card`
          : `Pay $${amount.toFixed(0)} balance by card`}
      </CTAButton>
      {error && (
        <Text fontSize="xs" color="red.600" textAlign="center">
          {error}
        </Text>
      )}
      {/* Unmissable while the keys are test keys. A real card is DECLINED in
          test mode, so anyone who reaches this button before go-live needs to
          know that before they try. */}
      {CARD_PAYMENTS_MODE === 'preview' && (
        <Text fontSize="2xs" color="orange.700" textAlign="center" fontWeight="600">
          TEST MODE. No real money moves and a real card will be declined.
        </Text>
      )}
      <Text fontSize="2xs" color="gray.500" textAlign="center">
        Secure payment by Stripe. Or send it directly below, which costs us nothing.
      </Text>
    </VStack>
  );
}

function PaymentMethodsStack() {
  return (
    <VStack spacing={2} w="100%" maxW="380px">
      <PaymentMethodRow label="Zelle" value={PAYMENT_HANDLES.zelle} />
      <PaymentMethodRow
        label="Venmo"
        value={PAYMENT_HANDLES.venmo}
        href={`https://venmo.com/u/${PAYMENT_HANDLES.venmo.replace(/^@/, '')}`}
      />
      <PaymentMethodRow
        label="Cash App"
        value={PAYMENT_HANDLES.cashapp}
        href={`https://cash.app/${PAYMENT_HANDLES.cashapp}`}
      />
    </VStack>
  );
}

function PaymentMethodRow({ label, value, href }: { label: string; value: string; href?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard fallback handled by input selection in a textarea elsewhere */
    }
  };

  const body = (
    <Flex
      align="center"
      justify="space-between"
      bg="white"
      border="1px solid"
      borderColor="#f0e4b6"
      borderRadius="sm"
      px={3}
      py={2}
      gap={3}
    >
      <HStack spacing={3}>
        <Text fontSize="xs" fontWeight="500" letterSpacing="0.15em" textTransform="uppercase" color="brand.accentText" minW="64px">
          {label}
        </Text>
        <Text fontSize="sm" color="gray.700" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
          {value}
        </Text>
      </HStack>
      <Box
        as="button"
        type="button"
        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
          e.preventDefault();
          e.stopPropagation();
          copy();
        }}
        aria-label={`Copy ${label}`}
        p={1.5}
        borderRadius="sm"
        color="gray.500"
        cursor="pointer"
        _hover={{ color: 'brand.accent', bg: 'gray.50' }}
        sx={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Icon as={copied ? FaCheck : FaCopy} boxSize={3} />
      </Box>
    </Flex>
  );

  if (href) {
    return (
      <Box
        as="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        w="100%"
        textDecoration="none"
        _hover={{ textDecoration: 'none' }}
      >
        {body}
      </Box>
    );
  }
  return <Box w="100%">{body}</Box>;
}

/**
 * Signed-state display + download. The PDF lives in a private Vercel Blob
 * store (no direct URL exposed to the browser), so the download button
 * re-auths via /api/portal/download-contract and streams the binary back,
 * which we then trigger a file save on via an in-memory object URL.
 */
function SignedContractSection({
  credentials,
  signedAt,
  pdfAvailable,
}: {
  credentials: { email: string; password: string };
  signedAt: string;
  pdfAvailable: boolean;
}) {
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');

  const handleView = async () => {
    setError('');
    setOpening(true);
    try {
      const res = await fetch('/api/portal/download-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      if (!res.ok) {
        // Error responses are JSON; success is binary.
        const data = await res.json().catch(() => null);
        setError(data?.error || `Could not open (status ${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      // Open in a new tab. The browser's PDF viewer renders inline and has
      // its own download button — covers both "view" and "save" from one
      // action. We hold the object URL for a bit so the new tab has time
      // to fetch it before we revoke.
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.error('[download-contract] network error:', err);
      setError('Could not reach the server. Please try again.');
    } finally {
      setOpening(false);
    }
  };

  return (
    // Transparent — the section wrapper in the parent tree owns the
    // background (gray.50 in the new alternation) so we let it show
    // through here rather than repainting a color inside.
    <Box
      py={{ base: 10, md: 12 }}
      px={6}
    >
      <VStack spacing={4} maxW="500px" mx="auto" textAlign="center">
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="brand.accent"
        >
          Contract
        </Text>
        <Box w="30px" h="1px" bg="brand.accent" />
        <Icon as={FaCheck} color="green.500" boxSize={6} />
        <Text fontSize="sm" color="gray.600" lineHeight="1.8" fontWeight="300">
          Signed electronically on {formatDate(signedAt)}.
        </Text>
        {pdfAvailable && (
          <CTAButton
            onClick={handleView}
            variant="outline"
            size="sm"
            isLoading={opening}
            loadingText="Opening..."
          >
            View Signed Copy
          </CTAButton>
        )}
        {error && (
          <Text fontSize="xs" color="red.500" fontWeight="400">
            {error}
          </Text>
        )}
      </VStack>
    </Box>
  );
}

/**
 * Pending-contract signing UI: typed full name + consent checkbox +
 * signature pad. Sends everything to /api/portal/sign-contract which
 * does the heavy lifting (PDF generation, Blob upload, email).
 *
 * Kept as its own component because it owns a fair amount of local state
 * (the signature canvas ref, the typed name, the consent flag, the
 * submitting/error states) — pulling it out keeps ClientPortalView
 * readable as a layout component.
 */
function ContractSignSection({
  credentials,
  contractBody,
  onSigned,
}: {
  credentials: { email: string; password: string };
  contractBody: string | null;
  onSigned: (updates: {
    contract_status: 'signed';
    contract_signed_at: string;
    contract_signed_pdf_available: boolean;
  }) => void;
}) {
  const sigPadRef = useRef<SignatureCanvasType | null>(null);
  const [signerName, setSignerName] = useState('');
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Parse the frozen contract body. If it's missing or malformed, we show a
  // friendly "being prepared" message rather than a sign form pointed at
  // nothing — the endpoint would 409 anyway, but the UI shouldn't promise
  // signing it can't deliver.
  const contract = useMemo<ContractTemplate | null>(() => {
    if (!contractBody) return null;
    try {
      return JSON.parse(contractBody) as ContractTemplate;
    } catch {
      return null;
    }
  }, [contractBody]);

  // Size the signature canvas to its rendered CSS size × devicePixelRatio.
  // Without this, the fixed internal pixel buffer doesn't match the
  // stretched CSS width — pointer events get coordinate-rounded, and the
  // bezier smoothing in signature_pad accumulates that error over long
  // strokes, producing visible drift between cursor and ink.
  useEffect(() => {
    if (!contract) return;
    const pad = sigPadRef.current;
    if (!pad) return;

    const resize = () => {
      const canvas = pad.getCanvas();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      pad.clear();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [contract]);

  const handleClear = () => {
    sigPadRef.current?.clear();
  };

  const handleSign = async () => {
    setError('');
    if (!consent) {
      setError('Please confirm you intend to sign this contract electronically.');
      return;
    }
    if (signerName.trim().length < 2) {
      setError('Please type your full name to sign.');
      return;
    }
    if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
      setError('Please draw your signature in the box.');
      return;
    }
    const signatureDataUrl = sigPadRef.current.toDataURL('image/png');

    setSubmitting(true);
    try {
      let res: Response;
      try {
        res = await fetch('/api/portal/sign-contract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...credentials,
            signer_name: signerName.trim(),
            signer_signature: signatureDataUrl,
            consent: true,
          }),
        });
      } catch (err) {
        // Genuine network failure (offline, DNS, etc). Distinct from a
        // server response we couldn't parse.
        console.error('[sign-contract] network error:', err);
        setError('Could not reach the server. Please check your connection and try again.');
        return;
      }

      // Read the response as text first so we can show *something* useful
      // even if the body isn't JSON (e.g. Vercel returning an HTML error
      // page). Logging both the status and the raw body to the console
      // makes the failure mode obvious in DevTools.
      const rawBody = await res.text();
      let data: { success?: boolean; error?: string; contract_signed_at?: string } | null = null;
      try {
        data = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        console.error('[sign-contract] non-JSON response', { status: res.status, rawBody });
        setError(`Server returned an unexpected response (status ${res.status}). Open the browser console for details.`);
        return;
      }

      if (res.ok && data?.success) {
        onSigned({
          contract_status: 'signed',
          contract_signed_at: data.contract_signed_at!,
          contract_signed_pdf_available: true,
        });
      } else {
        console.error('[sign-contract] server returned error', { status: res.status, data });
        setError(data?.error || `Could not sign the contract (status ${res.status}). Please try again.`);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!contract) {
    return (
      <Box
        py={{ base: 12, md: 14 }}
        px={6}
      >
        <VStack spacing={4} maxW="500px" mx="auto" textAlign="center">
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="brand.accent"
          >
            Contract
          </Text>
          <Box w="30px" h="1px" bg="brand.accent" />
          <Text fontSize="sm" color="gray.600" lineHeight="1.8" fontWeight="300">
            Your contract is being prepared. We'll let you know as soon as it's
            ready to sign.
          </Text>
        </VStack>
      </Box>
    );
  }

  return (
    // Transparent — the section wrapper (contract-section) owns the
    // background (gray.50 in the new alternation).
    <Box
      py={{ base: 12, md: 14 }}
      px={6}
    >
      <VStack spacing={6} maxW="640px" mx="auto">
        <VStack spacing={3}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="brand.accent"
          >
            Your Contract
          </Text>
          <Box w="35px" h="1px" bg="brand.accent" />
        </VStack>

        <Text
          fontSize="sm"
          color="gray.600"
          lineHeight="1.8"
          fontWeight="300"
          textAlign="center"
        >
          Please read the contract below. Once you sign, both you and Veronika
          will receive a copy by email, and the signed PDF will be available
          here to download any time.
        </Text>
        <Text
          fontSize="xs"
          color="gray.500"
          lineHeight="1.7"
          fontWeight="300"
          textAlign="center"
          fontStyle="italic"
          maxW="540px"
        >
          If anything looks wrong with your details, or if there's a clause you'd like to adjust or don't fully understand, please reach out to Veronika before signing so she can update it.
        </Text>

        {/* Full contract body. The signature section is skipped — the form
            below replaces it. Page scroll carries the user through; we don't
            trap scroll inside a small box because that hides the document. */}
        <ContractBodyView contract={contract} />

        <VStack spacing={2} pt={2}>
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="brand.accent"
          >
            Sign Below
          </Text>
          <Box w="35px" h="1px" bg="brand.accent" />
        </VStack>

        {/* Typed full name — required for the audit trail */}
        <Box w="100%">
          <Text
            as="label"
            htmlFor="signer-name"
            display="block"
            fontSize="2xs"
            fontWeight="500"
            letterSpacing="0.2em"
            textTransform="uppercase"
            color="brand.accent"
            mb={2}
          >
            Full Name
          </Text>
          <Input
            id="signer-name"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            placeholder="Type your full name"
            h="48px"
            bg="white"
            _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
          />
        </Box>

        {/* Signature canvas */}
        <Box w="100%">
          <Flex justify="space-between" align="center" mb={2}>
            <Text
              fontSize="2xs"
              fontWeight="500"
              letterSpacing="0.2em"
              textTransform="uppercase"
              color="brand.accentText"
            >
              Draw Your Signature
            </Text>
            <Box
              as="button"
              type="button"
              onClick={handleClear}
              fontSize="2xs"
              letterSpacing="0.15em"
              textTransform="uppercase"
              color="gray.500"
              cursor="pointer"
              display="inline-flex"
              alignItems="center"
              gap={1.5}
              _hover={{ color: 'brand.accent' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon as={FaUndo} boxSize={2.5} />
              Clear
            </Box>
          </Flex>
          <Box
            bg="white"
            border="1px dashed"
            borderColor="gray.300"
            borderRadius="sm"
            overflow="hidden"
            sx={{
              // The canvas inside needs an explicit width to render
              // properly; we let the wrapper drive the visible area.
              '& canvas': {
                display: 'block',
                width: '100% !important',
                height: '180px !important',
                touchAction: 'none',
              },
            }}
          >
            <SignatureCanvas
              ref={sigPadRef}
              penColor="#2d2d2d"
              canvasProps={{
                style: { width: '100%', height: '180px', display: 'block' },
              }}
            />
          </Box>
        </Box>

        {/* Consent checkbox — the ESIGN "intent to sign" requirement */}
        <Checkbox
          isChecked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          colorScheme="yellow"
          alignItems="flex-start"
        >
          <Text fontSize="xs" color="gray.600" lineHeight="1.7" fontWeight="300">
            I agree to sign this contract electronically. I understand this
            signature has the same legal effect as a handwritten one under
            the U.S. ESIGN Act and the Uniform Electronic Transactions Act.
          </Text>
        </Checkbox>

        {error && (
          <Text fontSize="sm" color="red.500" fontWeight="400" textAlign="center">
            {error}
          </Text>
        )}

        <CTAButton
          onClick={handleSign}
          variant="solid"
          size="lg"
          fullWidth
          isLoading={submitting}
          loadingText="Signing..."
        >
          Sign Contract
        </CTAButton>
      </VStack>
    </Box>
  );
}

/**
 * Renders the contract body for in-portal reading. Mirrors the look of the
 * PDF (numbered sections, gold accents, bullets) but in HTML/Chakra so it
 * flows naturally on mobile. Skips the signature_block paragraph — the
 * sign form is the in-portal equivalent.
 */
function ContractBodyView({ contract }: { contract: ContractTemplate }) {
  return (
    <Box
      w="100%"
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius="sm"
      px={{ base: 5, md: 8 }}
      py={{ base: 7, md: 9 }}
    >
      <Text
        fontSize={{ base: 'md', md: 'lg' }}
        fontWeight="500"
        letterSpacing="0.05em"
        textAlign="center"
        color="gray.800"
        mb={6}
      >
        {contract.title}
      </Text>

      <VStack spacing={5} align="stretch">
        {contract.sections.map((section, idx) => {
          const isSignature = section.paragraphs.some(
            (p) => p.kind === 'signature_block',
          );
          if (isSignature) return null;
          return (
            <Box key={idx}>
              <Text
                fontSize="xs"
                fontWeight="600"
                letterSpacing="0.15em"
                textTransform="uppercase"
                color="brand.accent"
                mb={2}
              >
                {section.number ? `${section.number}. ` : ''}
                {section.title}
              </Text>
              <VStack spacing={2.5} align="stretch">
                {section.paragraphs.map((p, i) => {
                  if (p.kind === 'text') {
                    return (
                      <Text
                        key={i}
                        fontSize="sm"
                        color="gray.700"
                        lineHeight="1.7"
                        fontWeight={p.emphasis === 'bold' ? '500' : '300'}
                        fontStyle={p.emphasis === 'italic' ? 'italic' : 'normal'}
                      >
                        {p.text}
                      </Text>
                    );
                  }
                  if (p.kind === 'bullets') {
                    return (
                      <VStack key={i} spacing={1.5} align="stretch" pl={4}>
                        {p.items.map((item, j) => (
                          <HStack key={j} align="flex-start" spacing={2.5}>
                            <Text color="brand.accent" fontSize="sm" lineHeight="1.7">
                              •
                            </Text>
                            <Text
                              fontSize="sm"
                              color="gray.700"
                              lineHeight="1.7"
                              fontWeight="300"
                            >
                              {item}
                            </Text>
                          </HStack>
                        ))}
                      </VStack>
                    );
                  }
                  if (p.kind === 'fields') {
                    return (
                      <VStack key={i} spacing={1.5} align="stretch" pl={2}>
                        {p.items.map((f, j) => (
                          <Flex
                            key={j}
                            direction={{ base: 'column', md: 'row' }}
                            align={{ base: 'flex-start', md: 'baseline' }}
                            gap={{ base: 0.5, md: 2 }}
                          >
                            <Text
                              fontSize="sm"
                              color="gray.800"
                              fontWeight="500"
                              lineHeight="1.7"
                              minW={{ md: '170px' }}
                            >
                              {f.label}:
                            </Text>
                            <Text
                              fontSize="sm"
                              color="gray.700"
                              fontWeight="300"
                              lineHeight="1.7"
                              flex="1"
                            >
                              {f.value}
                            </Text>
                          </Flex>
                        ))}
                      </VStack>
                    );
                  }
                  return null;
                })}
              </VStack>
            </Box>
          );
        })}
      </VStack>
    </Box>
  );
}

/**
 * Change-password section. Collapsed by default (small "Change password"
 * link on the right); expands to reveal current / new / confirm inputs.
 *
 * We ask for the current password (not just email) so someone with a
 * hijacked but unlocked browser tab can't silently take over the
 * account. Same lightweight re-auth pattern the mutating gallery-pass
 * endpoints use.
 *
 * On success, we call `onChanged(newPassword)` so the parent Portal
 * page can update the cached credentials — otherwise the next mutating
 * API call would still be sending the old password.
 */
function ChangePasswordSection({
  credentials,
  onChanged,
}: {
  credentials: { email: string; password: string };
  onChanged?: (newPassword: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setMessage(null);
  };

  const handleToggle = () => {
    if (open) {
      // Closing — wipe any in-flight edits + banner so reopening is clean.
      reset();
    }
    setOpen((o) => !o);
  };

  const handleSave = async () => {
    setMessage(null);
    if (!current) {
      setMessage({ kind: 'err', text: 'Enter your current password.' });
      return;
    }
    if (next.length < 6) {
      setMessage({ kind: 'err', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (next !== confirm) {
      setMessage({ kind: 'err', text: 'New password and confirmation don’t match.' });
      return;
    }
    if (next === current) {
      setMessage({ kind: 'err', text: 'New password must be different from the current one.' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/portal/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: credentials.email,
          current_password: current,
          new_password: next,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // Bubble the new password up so the parent's cached credentials
        // stay in sync. Without this the next mutating call (rotate
        // gallery pass, sign contract) would 401.
        onChanged?.(next);
        setMessage({ kind: 'ok', text: 'Password updated.' });
        setCurrent('');
        setNext('');
        setConfirm('');
        // Collapse after a beat so the success banner is visible first.
        setTimeout(() => {
          setOpen(false);
          setMessage(null);
        }, 2500);
      } else {
        setMessage({ kind: 'err', text: data.error || `Server error (${res.status}).` });
      }
    } catch {
      setMessage({ kind: 'err', text: 'Could not reach the server. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  // NOTE: borderTop AND bg live on the section wrapper in the parent
  // tree now (id="password-section"), so we don't double-border it
  // here and we don't force white — inherits gray.50 from the
  // wrapper for the alternating-stripe rhythm.
  return (
    <Box py={{ base: 10, md: 12 }} px={6}>
      <VStack spacing={4} maxW="520px" mx="auto" textAlign="center">
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="brand.accent"
        >
          Login Password
        </Text>
        <Box w="30px" h="1px" bg="brand.accent" />
        <Text fontSize="sm" color="gray.600" lineHeight="1.8" fontWeight="300">
          The password you use to sign in to this portal.
          {' '}
          <Text as="span" color="gray.500">
            (This is separate from the Gallery Pass above, which is what you share with guests.)
          </Text>
        </Text>
        <CTAButton
          onClick={handleToggle}
          variant="outline"
          size="sm"
        >
          {open ? 'Cancel' : 'Change login password'}
        </CTAButton>

        {/* Collapse animates the height + fade in/out instead of an
            instant show/hide. On iOS this matters not just for polish
            — an instant collapse used to snap the page shorter mid-scroll,
            which triggered the rubber-band overscroll past the footer. */}
        <Collapse in={open} animateOpacity>
          <VStack spacing={3} w="100%" maxW="360px" pt={2} mx="auto">
            <Input
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="Current login password"
              autoComplete="current-password"
              h="42px"
              bg="white"
              fontSize="sm"
              _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
            />
            <Input
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              placeholder="New login password (min. 6 characters)"
              autoComplete="new-password"
              h="42px"
              bg="white"
              fontSize="sm"
              _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
            />
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new login password"
              autoComplete="new-password"
              h="42px"
              bg="white"
              fontSize="sm"
              _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
            />
            <CTAButton
              onClick={handleSave}
              variant="solid"
              size="sm"
              isLoading={saving}
              loadingText="Saving..."
              fullWidth
            >
              Save
            </CTAButton>
          </VStack>
        </Collapse>

        {message && (
          <Text
            fontSize="xs"
            color={message.kind === 'ok' ? 'green.600' : 'red.500'}
            fontWeight="400"
          >
            {message.text}
          </Text>
        )}
      </VStack>
    </Box>
  );
}

/**
 * Which section is the client currently reading?
 *
 * A rAF-throttled scroll scan, not an IntersectionObserver. IO fires on
 * threshold changes, so between fires the answer goes stale, and when a tiny
 * section sits fully inside the observation zone alongside a big one poking in
 * from below, IO's "topmost" pick is the wrong one. That pair of facts was the
 * "click Photos, Share lights up" and "scroll up, skip Contract" bugs.
 *
 * The rule: the current section is the one with the LARGEST top that is still
 * above the chrome's activation line, which is whichever section the client
 * most recently scrolled into. That line is derived from the header and nav
 * heights in portalLayout.ts, the same numbers the section scroll margins and
 * the Photos handoff are built on, so a heading cannot land somewhere the scan
 * disagrees is arrival. It moves with the chrome: a finished portal has no
 * second row, and a line left 48px lower than the chrome it is meant to sit
 * under would call a section current before the reader had reached it.
 *
 * It lives here, above both navs, rather than inside one of them: the header
 * and the second sticky row render the same list and only one is mounted at a
 * time. Two copies of this scan would mean the highlight jumped the moment a
 * client paid their last installment.
 *
 * The setter it hands back is the "the reader picked this" signal, not a plain
 * setState: it takes a hold on the scan (see useNavSelectionLock) so the smooth
 * scroll that follows cannot light up every section it travels through. Every
 * caller gets that for free, which matters because the header's segmented
 * control and the second sticky row are two different components calling it.
 *
 * The hold is page-wide, not this scan's own, so it also stops the GALLERY's
 * scan for the length of the scroll. That is the point of it on a phone: the
 * burger and the photo section bar are 8px apart in the same header, and a pick
 * in one used to leave the other rattling through every section the page flew
 * over on the way.
 */
function useActiveSection(
  items: PortalNavItem[],
  chrome: PortalChrome,
): [string | null, (id: string) => void] {
  const [activeId, setActiveId] = useState<string | null>(null);
  const lock = useNavSelectionLock();
  // The list is rebuilt on every render, so the effect keys off its contents
  // rather than the array's identity.
  const idKey = items.map((i) => i.id).join('|');

  useEffect(() => {
    const ids = idKey ? idKey.split('|') : [];
    if (ids.length === 0) return;
    let raf: number | null = null;
    const update = () => {
      raf = null;

      // At the very bottom of the page, force the LAST section. Short trailing
      // sections never satisfy "top is above the line", because there is not
      // enough content below them for the browser to push their top that far.
      const scrollBottom = window.scrollY + window.innerHeight;
      const atBottom =
        scrollBottom >= document.documentElement.scrollHeight - AT_BOTTOM_THRESHOLD;
      if (atBottom) {
        setActiveId(lock.resolve(ids[ids.length - 1]));
        return;
      }

      // Asked for per frame rather than closed over: the line sits under
      // whatever chrome the CURRENT width has, which is one row on a phone and
      // may be two on a desktop. This listener already re-runs on resize, so
      // reading it here is what makes crossing the breakpoint free.
      const { activationLine } = chrome.metrics();
      let currentId: string | null = null;
      let bestTop = -Infinity;
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        if (top <= activationLine && top > bestTop) {
          bestTop = top;
          currentId = id;
        }
      });
      // Every path out of the scan goes through the lock, the at-the-bottom
      // one included: a pick made near the foot of the page would otherwise be
      // overruled by that rule on the very next frame.
      setActiveId(lock.resolve(currentId));
    };
    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // And once more whenever a pick anywhere on the page stops being held. A
    // scan that stood still through somebody else's scroll has had its last
    // scroll event by then, so without this it would keep showing where the
    // reader WAS until they moved the page again. See NavSelectionLock.watch.
    const unwatch = lock.watch(update);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      unwatch();
    };
  }, [idKey, lock, chrome]);

  const select = useCallback(
    (id: string) => {
      lock.hold(id);
      setActiveId(id);
    },
    [lock],
  );

  return [activeId, select];
}

/**
 * The portal's second sticky row: its section nav.
 *
 * Sits directly under PortalHeader, so its `top` is the header's height and
 * its own height is PORTAL_NAV_H. Both come from portalLayout.ts, because the
 * Photos handoff below measures a section against the sum of the two. Typing
 * either one out here would show up as the nav flickering on and off at the
 * Photos boundary rather than as anything obviously broken.
 *
 * It renders only while the header is busy showing progress. Once the booking
 * is signed, paid and delivered the same list moves INTO the header as a
 * segmented control and this row does not mount at all.
 *
 * Coordination with the gallery's own section nav: this row hides for exactly
 * as long as the gallery's strip is in the band, so the two never stack. That
 * hand off now happens at EVERY width. It used to be desktop only, because the
 * gallery's strip was desktop only and a phone fell back to a bottom sheet
 * drawer; the drawer is gone and the strip renders on phones too, so leaving
 * this row up on mobile would pin two translucent nav bars at the same
 * top offset, on top of each other.
 *
 * It only stands down for a strip that is actually there, which is what
 * galleryOwnsNavRow decides, off the gallery's own predicate. So the reader is
 * never left inside Photos with no navigation at all: either the gallery drew
 * a strip and it has the band, or it did not and this row keeps it.
 *
 * CENTRED at every width now, including a phone, where it used to start hard
 * against the left edge. Centring is only safe inside a horizontal scroller
 * because the row is minW="max-content": see the note in ScrollStrip.
 */
interface PortalTopNavProps {
  items: PortalNavItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  isPhotosInView: boolean;
}

function PortalTopNav({ items, activeId, onSelect, isPhotosInView }: PortalTopNavProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pillRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});

  // Keep the active pill inside the visible part of the strip.
  //
  // Scrolls the container directly rather than calling pill.scrollIntoView():
  // the latter reads block:'nearest' as "scroll the PAGE until this is
  // reachable" whenever the whole sticky row is off screen, which is what
  // produced the "tap an item, the page springs to the bottom and back" bounce
  // on long portals.
  useEffect(() => {
    if (!activeId) return;
    const pill = pillRefs.current[activeId];
    const container = scrollRef.current;
    if (!pill || !container) return;
    container.scrollTo({
      left: pill.offsetLeft - container.clientWidth / 2 + pill.offsetWidth / 2,
      behavior: scrollBehavior(),
    });
  }, [activeId]);

  // Fewer than two items is not navigation, it is a label.
  if (items.length < 2) return null;

  return (
    <Box
      // Hidden, NOT unmounted, and not display:none either. This row is
      // sticky, so it still takes its PORTAL_NAV_H out of the normal flow
      // above the Photos section. Taking that height away on the way in and
      // handing it back on the way out moves every following section by
      // PORTAL_NAV_H, which moves the very rectangle the handoff measures, and
      // the two chase each other for the width of the boundary. That is the
      // flicker. Keeping the height reserved makes the handoff a clean swap:
      // the gallery's own row pins to the same offset and takes the band over.
      visibility={isPhotosInView ? 'hidden' : 'visible'}
      pointerEvents={isPhotosInView ? 'none' : 'auto'}
      // Desktop only. A phone's whole chrome is the header alone, which carries
      // this list behind its burger, and portalChrome answers that there in
      // every state because of this line.
      display={{ base: 'none', md: 'block' }}
      position="sticky"
      top={HEADER_CLEARANCE}
      zIndex={10}
      h={`${PORTAL_NAV_H}px`}
      bg="rgba(255, 255, 255, 0.94)"
      backdropFilter="blur(10px)"
    >
      <Flex h="100%" align="center">
        <Box flex="1" minW={0}>
          <ScrollStrip scrollRef={scrollRef}>
            {items.map((item) => {
              const active = activeId === item.id;
              return (
                <Box
                  key={item.id}
                  ref={(el: HTMLDivElement | null) => {
                    pillRefs.current[item.id] = el;
                  }}
                  as="button"
                  type="button"
                  onClick={() => onSelect(item.id)}
                  aria-current={active ? 'true' : undefined}
                  flexShrink={0}
                  display="inline-flex"
                  alignItems="center"
                  justifyContent="center"
                  gap={2}
                  px={{ base: 4, md: 5 }}
                  // 44px on a phone is the minimum a thumb gets. It very
                  // nearly fills PORTAL_NAV_H, which is the point: the row is
                  // as short as it can be while still being tappable.
                  h={{ base: '44px', md: '32px' }}
                  fontSize="2xs"
                  fontWeight="500"
                  letterSpacing="0.2em"
                  textTransform="uppercase"
                  whiteSpace="nowrap"
                  color={active ? 'white' : 'gray.700'}
                  bg={active ? 'brand.accent' : 'transparent'}
                  border="1px solid"
                  borderColor={active ? 'brand.accent' : 'gray.200'}
                  borderRadius="full"
                  transition="all 0.25s ease"
                  cursor="pointer"
                  _hover={
                    active
                      ? { bg: 'brand.accentStrong', borderColor: 'brand.accentStrong' }
                      : {
                          borderColor: 'brand.accent',
                          color: 'brand.accentText',
                          bg: 'rgba(201, 169, 110, 0.06)',
                        }
                  }
                  sx={{
                    WebkitTapHighlightColor: 'transparent',
                    '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
                  }}
                >
                  {item.icon && <Icon as={item.icon} boxSize={2.5} />}
                  {item.label}
                </Box>
              );
            })}
          </ScrollStrip>
        </Box>
      </Flex>
    </Box>
  );
}

export default ClientPortalView;
