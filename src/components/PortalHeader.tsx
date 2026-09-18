import { Box, Flex, Icon, Image, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import type { IconType } from 'react-icons';
import FaCheck from '../icons/fa/FaCheck';
import FaChevronDown from '../icons/fa/FaChevronDown';
import FaChevronLeft from '../icons/fa/FaChevronLeft';
import FaChevronRight from '../icons/fa/FaChevronRight';
import BurgerMenu from './BurgerMenu';
import { HEADER_CLEARANCE } from './portalLayout';
import { scrollBehavior } from '../utils/motion';

/**
 * The client portal's own header.
 *
 * It replaces the public site navbar on /portal and /portal/pass. A client
 * standing inside their portal does not need Gallery, Journal, About, Contact
 * and a link to the portal they are already in; they need to know where they
 * are in the booking and what is still owed.
 *
 * Left to right: the logo, a three step progress indicator, the balance.
 *
 * COLOUR RULE, the one thing not to undo: exactly one step carries colour at a
 * time, the step they are on. Finished steps go green with a tick, everything
 * ahead goes neutral grey. An earlier version painted all three amber, which
 * told the client nothing, because if everything is coloured nothing says
 * where you are.
 *
 * Once the booking is signed, paid and delivered the progress has nothing left
 * to say, so the header hands its middle slot to the portal's section nav,
 * drawn as a segmented control. That is the header a finished client lives
 * with for as long as their gallery is up, so it is the one that matters most.
 *
 * The component takes DATA, not JSX, and degrades to "just a logo" when it is
 * handed nothing: the gallery-only route at /portal/pass has no contract, no
 * balance and no section nav, and renders the same header.
 *
 * ── ON A PHONE, THIS HEADER IS ALL THE NAVIGATION THERE IS ──
 *
 * Below `md` neither of the portal's second sticky rows renders, so the chrome
 * is this 60px header and nothing else, in every state. The header carries
 * what those rows used to: logo, middle slot, balance, burger.
 *
 * The middle slot holds ONE thing, so it has to choose, and the rule is that
 * gallery SECTIONS beat progress. A client looking at a delivered gallery
 * needs to move around inside it far more than they need a 1-2-3 track telling
 * them what they can already see. Nothing about collecting money is lost by
 * that: the balance block is independent of the slot and still appears
 * whenever something is owed.
 *
 * The split between the phone controls and the desktop ones is plain
 * responsive `display`, never a breakpoint hook. This app prerenders, and a
 * width measured during render is a hydration mismatch waiting to happen. The
 * few numbers that genuinely cannot be expressed in CSS, the scroll scan's
 * activation lines, read the width inside their scroll handlers instead: see
 * PortalChrome in portalLayout.ts.
 */

export type PortalContractStatus = 'none' | 'pending' | 'signed' | 'void';

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
}

/**
 * A nav the phone header renders as a MENU rather than as a row of pills: the
 * items, which one the reader is in, and what to do when they pick one.
 *
 * Both menus take this shape, because from the header's side they differ only
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
   * The section nav, DESKTOP only. Rendered as a segmented control once the
   * booking is complete, and ignored otherwise, because until then the middle
   * of the header belongs to the progress.
   *
   * A phone never renders this list here. Whichever of the two menus below it
   * belongs to carries it instead: the gallery's sections go to `sectionNav`,
   * the portal's own sections to `accountNav`.
   */
  navItems?: PortalNavItem[];
  activeNavId?: string | null;
  onNavSelect?: (id: string) => void;
  /**
   * MOBILE: the gallery's sections, for the photo section bar in the middle
   * slot. Present whenever there is a gallery with sections to move around in,
   * on both routes. Takes the slot from the progress track when it is there.
   */
  sectionNav?: PortalMenuNav;
  /**
   * MOBILE: "a section bar is coming, the slot is already spoken for."
   *
   * The full portal cannot hand over `sectionNav` on its first render. The
   * gallery builds it, the gallery is a SIBLING of this header, and an effect
   * is what carries it up, so the first commit has nothing here however much
   * the page already knows. A header that decided the slot on `sectionNav`
   * alone therefore painted the 1-2-3 progress once, on every load of a
   * delivered portal that still had money outstanding, and swapped it for the
   * section bar a commit later. The client saw a flash of a track that was
   * never theirs to see.
   *
   * So the answer comes from the DATA instead, on the first render, and the
   * arriving items only fill a slot that was already reserved. The caller
   * derives it from the same predicate the gallery uses to decide whether it
   * has a section nav at all, which is what keeps the reservation and the
   * thing reserving it from ever disagreeing.
   *
   * An empty slot for one commit, which is what this leaves, is the point: a
   * slot with nothing in it is not a state the client can misread, and a
   * progress track that vanishes is.
   */
  sectionNavExpected?: boolean;
  /**
   * MOBILE: the booking's own sections, for the burger at the far right. The
   * full portal always has these; /portal/pass has no account behind it and
   * passes nothing, which is what leaves a guest with no burger at all.
   */
  accountNav?: PortalMenuNav;
}

/**
 * The phone controls' shared geometry.
 *
 * Written once because the section bar and the burger's frame sit side by side
 * in a 60px header and have to read as a matched pair; two sets of literals
 * would drift by a pixel and look like a mistake rather than a style.
 */
const MOBILE_CONTROL_H = '40px';
const MOBILE_CONTROL_RADIUS = '9px';
/** The progress row along the section bar's bottom edge, one tick per item. */
const SECTION_TICK_H = '3px';
/** How far in from the window edge an anchored menu sits. */
const MENU_INSET = '8px';
const MENU_RADIUS = '12px';
/** Past this a menu scrolls inside itself rather than running down the page. */
const MENU_MAX_H = '250px';
/** The site's own menu timing. MobileNav fades its overlay over the same 0.3s. */
const MENU_FADE = '0.3s';
/**
 * The wash on the row the reader is currently in. One step up from the gold
 * SegmentedNav uses on hover, so the two read as the same family rather than
 * as two different ideas of "gold".
 */
const MENU_CURRENT_BG = 'rgba(201, 169, 110, 0.14)';

/** Which anchored menu is open. Never both: the header holds one answer. */
type OpenMenu = 'sections' | 'account' | null;

const formatMoney = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * Exported so ClientPortalView formats every amount the same way the header
 * does. One formatter, so the header and the Balance section can never
 * disagree about how a number is written.
 */
export { formatMoney };

/** Nothing owed: either the portal carries no money, or it is all in. */
const isFullyPaid = (p: PortalProgressData): boolean =>
  p.amountOwed === null || p.paidToDate >= p.amountOwed;

/**
 * Signed, paid and delivered. The state where the progress indicator has
 * nothing left to report and the section nav takes the header instead.
 *
 * Exported because ClientPortalView has to make the same call to decide
 * whether to render its second sticky nav row. Two independent readings of
 * "complete" would eventually disagree and the client would get both navs, or
 * neither.
 */
export const isPortalComplete = (p: PortalProgressData | undefined): boolean =>
  !!p && p.contractStatus === 'signed' && isFullyPaid(p) && p.photosDelivered;

/** Is there a contract at all to report progress on? */
const hasContract = (p: PortalProgressData | undefined): boolean =>
  !!p && (p.contractStatus === 'pending' || p.contractStatus === 'signed');

type StepTone = 'done' | 'action' | 'progress' | 'overdue' | 'upcoming';

interface ProgressStep {
  n: number;
  label: string;
  tone: StepTone;
  /** The step they are on. Keeps its label on a phone; the others lose theirs. */
  current: boolean;
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
};

const STEP_LABELS = ['Sign', 'Pay', 'Photos'];

function buildSteps(p: PortalProgressData): ProgressStep[] {
  const signed = p.contractStatus === 'signed';
  const paid = isFullyPaid(p);
  // Step 2 is done ONLY when the whole thing is paid. A retainer in the bank
  // is progress, not completion.
  const done = [signed, signed && paid, p.photosDelivered];

  // The step they are on is the first unfinished one. Everything past it is
  // grey whatever its own state would otherwise suggest.
  const currentIndex = done.findIndex((d) => !d);

  // Amber while the retainer is outstanding, gold once it is in and only the
  // balance remains. A contract with no named retainer treats any payment at
  // all as the retainer being in.
  const retainerOutstanding =
    p.retainerAmount !== null && p.retainerAmount > 0
      ? p.paidToDate < p.retainerAmount
      : p.paidToDate <= 0;

  const toneForCurrent = (i: number): StepTone => {
    if (i === 0) return 'action';
    if (i === 1) {
      if (p.overdue) return 'overdue';
      return retainerOutstanding ? 'action' : 'progress';
    }
    // Photos: they are on this step, but there is nothing for them to do
    // except wait, so it reads as in progress rather than as a demand.
    return 'progress';
  };

  return STEP_LABELS.map((label, i) => {
    const tone: StepTone = done[i] ? 'done' : i === currentIndex ? toneForCurrent(i) : 'upcoming';
    return { n: i + 1, label, tone, current: i === currentIndex };
  });
}

const PortalHeader = ({
  logoTo = '/',
  progress,
  navItems,
  activeNavId = null,
  onNavSelect,
  sectionNav,
  sectionNavExpected = false,
  accountNav,
}: PortalHeaderProps) => {
  const items = navItems ?? [];
  // A single item is not navigation, it is a label. Two is the floor.
  // The nav takes the middle in two cases: the booking is finished, so the
  // progress has nothing left to report, and the gallery-only route, which has
  // no booking behind it at all. A private gallery's whole navigation IS this
  // strip, so without the second test the header would render an empty middle.
  const showNav =
    (isPortalComplete(progress) || !hasContract(progress)) &&
    items.length > 1 &&
    !!onNavSelect;
  const showProgress = !showNav && hasContract(progress);

  // The two phone controls, on the same two-is-the-floor rule.
  const showSectionBar = !!sectionNav && sectionNav.items.length > 1;
  const showAccountMenu = !!accountNav && accountNav.items.length > 1;

  // Who the phone's middle slot belongs to. Not the same question as whether
  // the section bar can be DRAWN yet: the sections own the slot from the first
  // render of a page that is going to have them, and the bar simply moves in
  // when its items arrive. Anything else painting there in the meantime is a
  // state the client watches disappear. See sectionNavExpected.
  const sectionsOwnMobileSlot = showSectionBar || sectionNavExpected;

  const remaining =
    progress && progress.amountOwed !== null ? progress.amountOwed - progress.paidToDate : null;
  // Never "$0". Nothing owed means nothing to say here.
  const showBalance = remaining !== null && remaining > 0;

  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const headerRef = useRef<HTMLDivElement | null>(null);
  // Stable ids for aria-controls. useId rather than a literal because two
  // headers could in principle be on one page, and a duplicated id points a
  // screen reader at the wrong panel.
  const uid = useId();
  const sectionPanelId = `${uid}-sections`;
  const accountPanelId = `${uid}-account`;

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

  const toggleMenu = useCallback((which: Exclude<OpenMenu, null>) => {
    setOpenMenu((open) => (open === which ? null : which));
  }, []);

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
          h="44px"
          px={1}
          _hover={{ opacity: 0.8, textDecoration: 'none' }}
          transition="opacity 0.2s"
          sx={{
            WebkitTapHighlightColor: 'transparent',
            '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
          }}
          aria-label="Vero Photography, back to the main site"
        >
          {/* The monogram on phones, where a 263px wordmark would take the
              whole row and leave no space for the progress. */}
          <Image
            src="/assets/images/logo-mark.svg"
            alt="Vero Photography"
            htmlWidth={60}
            htmlHeight={60}
            h="34px"
            w="34px"
            display={{ base: 'block', md: 'none' }}
          />
          <Image
            src="/assets/images/logo.svg"
            alt="Vero Photography"
            htmlWidth={460}
            htmlHeight={70}
            width="auto"
            h="30px"
            display={{ base: 'none', md: 'block' }}
          />
        </Box>

        {/* Middle slot. It holds exactly one control at any width, and the slot
            keeps its width whichever it is, so the header does not jump when a
            client pays the last installment or their photos land.

            Three candidates, each gated by `display` rather than by a measured
            width, so the same markup prerenders once and the browser picks:

              - the segmented nav, DESKTOP only and exactly as it was,
              - the photo section bar, MOBILE only,
              - the progress track, at whichever widths neither of the other
                two has taken. That is both of them in the ordinary
                mid-booking portal, and desktop only once photos arrive, since
                the phone gives sections the slot and keeps the balance.

            Taken includes SPOKEN FOR. On a phone the sections hold the slot
            from the first render of a page that will have them, before their
            items have travelled up from the gallery, which is why the track
            below reads sectionsOwnMobileSlot rather than asking whether the
            bar can be drawn yet. */}
        <Box flex="1" minW={0}>
          {showNav && (
            <Box display={{ base: 'none', md: 'block' }}>
              <SegmentedNav items={items} activeId={activeNavId} onSelect={onNavSelect!} />
            </Box>
          )}
          {showSectionBar && (
            <Box display={{ base: 'block', md: 'none' }}>
              <SectionBar
                nav={sectionNav!}
                open={openMenu === 'sections'}
                onToggle={() => toggleMenu('sections')}
                panelId={sectionPanelId}
              />
            </Box>
          )}
          {showProgress && (
            <Box display={{ base: sectionsOwnMobileSlot ? 'none' : 'block', md: 'block' }}>
              <ProgressTrack steps={buildSteps(progress!)} />
            </Box>
          )}
        </Box>

        {showBalance && (
          <Flex direction="column" align="flex-end" flexShrink={0} lineHeight="1.15">
            <Text
              fontSize="2xs"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.18em"
              color={progress?.overdue ? 'red.600' : 'brand.accentText'}
            >
              Balance
            </Text>
            <Text
              fontSize={{ base: 'sm', md: 'md' }}
              fontWeight="400"
              color={progress?.overdue ? 'red.600' : 'gray.800'}
            >
              {formatMoney(remaining!)}
            </Text>
          </Flex>
        )}

        {/* The account menu, and the site's own burger doing the opening.
            Deliberately the LAST thing in the row, as far from the logo as the
            header allows: the logo navigates away to the public homepage, and
            a missed tap there ejects a client out of the portal they were
            reading. Putting the one control they will use most right beside it
            would make that misfire routine. */}
        {showAccountMenu && (
          <BurgerMenu
            isOpen={openMenu === 'account'}
            onClick={() => toggleMenu('account')}
            // Dark bars whether it is open or shut. The site's white ones are
            // for its full screen gray.900 overlay; this one opens a white
            // panel and stays sitting in a white header.
            barColor="gray.700"
            barColorOpen="gray.700"
            frame={{
              display: { base: 'flex', md: 'none' },
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              w: MOBILE_CONTROL_H,
              h: MOBILE_CONTROL_H,
              p: 0,
              bg: 'white',
              border: '1px solid',
              borderColor: 'gray.200',
              borderRadius: MOBILE_CONTROL_RADIUS,
              'aria-label': openMenu === 'account' ? 'Close your booking menu' : 'Open your booking menu',
              'aria-haspopup': 'menu',
              'aria-controls': accountPanelId,
              sx: { WebkitTapHighlightColor: 'transparent' },
            }}
          />
        )}
      </Flex>

      {/* The two anchored panels. They hang off the header rather than
          covering the screen, so the photos stay visible behind the menu that
          is navigating them. */}
      {showSectionBar && (
        <PortalMenuPanel
          id={sectionPanelId}
          heading="Jump to a section"
          nav={sectionNav!}
          numbered
          open={openMenu === 'sections'}
          onPick={(id) => {
            sectionNav!.onSelect(id);
            setOpenMenu(null);
          }}
        />
      )}
      {showAccountMenu && (
        <PortalMenuPanel
          id={accountPanelId}
          heading="Your booking"
          nav={accountNav!}
          open={openMenu === 'account'}
          onPick={(id) => {
            accountNav!.onSelect(id);
            setOpenMenu(null);
          }}
        />
      )}
    </Box>
  );
};

/**
 * The phone header's middle slot once there are photos: where in the gallery
 * the client is, how far through it they are, and a way to jump.
 *
 * Four things in 40px, and the order is the order they are wanted in. The
 * eyebrow says what kind of thing the name underneath is, since "Ceremony"
 * alone in a header could be anything. The counter is the answer to "how much
 * more is there", which is the question a long gallery actually provokes. The
 * chevron says this opens. And along the bottom edge, one tick per section:
 * the counter again, as a shape, so a thumb learns the length of the gallery
 * without reading a number.
 *
 * Nothing here may overflow, because the header is the whole chrome and a
 * header that can be dragged sideways takes the page with it. The only elastic
 * part is the name, which truncates; everything else is flexShrink 0 and
 * measured.
 */
function SectionBar({
  nav,
  open,
  onToggle,
  panelId,
}: {
  nav: PortalMenuNav;
  open: boolean;
  onToggle: () => void;
  panelId: string;
}) {
  // activeId is null until the first scroll scan has run, and the first item
  // is where the reader is standing while that is true.
  const index = Math.max(
    0,
    nav.items.findIndex((i) => i.id === nav.activeId),
  );
  const current = nav.items[index];

  return (
    <Box
      as="button"
      type="button"
      onClick={onToggle}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={panelId}
      position="relative"
      w="100%"
      h={MOBILE_CONTROL_H}
      // The ticks run to the very edge, so the radius has to clip them.
      overflow="hidden"
      display="flex"
      alignItems="center"
      textAlign="left"
      gap={2}
      px={2}
      // The ticks own the bottom SECTION_TICK_H, so the text is centred in
      // what is left rather than in the whole button.
      pb={SECTION_TICK_H}
      bg="white"
      border="1px solid"
      borderColor="gray.200"
      borderRadius={MOBILE_CONTROL_RADIUS}
      cursor="pointer"
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {/* minW 0 on the flex item AND nowrap/ellipsis on the text. Without the
          first, a long section name refuses to shrink and pushes the counter
          out of the header rather than truncating. */}
      {/* `as="span"` on every one of these, here and in the menu below: a
          button's content model is phrasing content, and Chakra's Text is a
          <p> by default. display block gives back the stacking a <p> would
          have. */}
      <Box flex="1" minW={0}>
        <Text
          as="span"
          display="block"
          fontSize="2xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.16em"
          color="gray.500"
          lineHeight="1.1"
          whiteSpace="nowrap"
          // The name below clamps but this did not, so on a narrow phone the
          // eyebrow ran straight out of its box and painted over the counter
          // sitting to its right. Both lines share the same minW 0 parent, so
          // both need the clamp, not just the one that obviously varies.
          overflow="hidden"
          textOverflow="ellipsis"
        >
          Photo section
        </Text>
        <Text
          as="span"
          display="block"
          fontSize="13px"
          fontWeight="500"
          color="gray.800"
          lineHeight="1.25"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {current.label}
        </Text>
      </Box>
      <Text
        as="span"
        fontSize="2xs"
        color="gray.500"
        flexShrink={0}
        // Tabular figures, or the counter jiggles sideways as the reader
        // scrolls past a 1 and the column is 40px from an ellipsis.
        sx={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {index + 1} / {nav.items.length}
      </Text>
      <Icon
        as={FaChevronDown}
        boxSize={2.5}
        color="gray.500"
        flexShrink={0}
        transform={open ? 'rotate(180deg)' : 'rotate(0deg)'}
        transition={`transform ${MENU_FADE} ease`}
        sx={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
      />

      {/* One tick per item, equal width, the whole width of the bar. Behind
          the reader is filled, the one they are in is stronger, ahead is
          track. aria-hidden because the counter above already says this in
          words and a screen reader does not want it twice. */}
      <Flex
        position="absolute"
        left={0}
        right={0}
        bottom={0}
        h={SECTION_TICK_H}
        gap="1px"
        aria-hidden="true"
      >
        {nav.items.map((item, i) => (
          <Box
            key={item.id}
            flex="1"
            h="100%"
            bg={i < index ? 'brand.accent' : i === index ? 'brand.accentStrong' : 'gray.200'}
          />
        ))}
      </Flex>
    </Box>
  );
}

/**
 * The panel both phone menus use.
 *
 * Anchored under the header and inset from both edges, not a full screen
 * overlay: these menus navigate the page behind them, and covering it to offer
 * a list of places on it is the thing the gallery's old bottom sheet drawer
 * got wrong.
 *
 * It is always mounted and toggled with opacity, so the 0.3s fade has
 * something to fade FROM. visibility goes with it, which is what takes the
 * closed panel's items out of the tab order and away from a screen reader
 * rather than leaving an invisible menu in the page.
 */
function PortalMenuPanel({
  id,
  heading,
  nav,
  numbered = false,
  open,
  onPick,
}: {
  id: string;
  heading: string;
  nav: PortalMenuNav;
  /** Number the rows. The sections do, to match the bar's counter and ticks. */
  numbered?: boolean;
  open: boolean;
  onPick: (id: string) => void;
}) {
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
      maxH={MENU_MAX_H}
      overflowY="auto"
      overflowX="hidden"
      opacity={open ? 1 : 0}
      visibility={open ? 'visible' : 'hidden'}
      pointerEvents={open ? 'auto' : 'none'}
      transition={`opacity ${MENU_FADE} ease, visibility ${MENU_FADE} ease`}
      sx={{
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
        '&::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
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
      {nav.items.map((item, i) => {
        const active = item.id === nav.activeId;
        return (
          <Box
            key={item.id}
            as="button"
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => onPick(item.id)}
            aria-current={active ? 'true' : undefined}
            display="flex"
            alignItems="center"
            gap={3}
            w="100%"
            minH="44px"
            px={4}
            py={2}
            textAlign="left"
            bg={active ? MENU_CURRENT_BG : 'transparent'}
            color={item.disabled ? 'gray.400' : active ? 'brand.accentText' : 'gray.700'}
            cursor={item.disabled ? 'default' : 'pointer'}
            transition="background 0.2s ease"
            _hover={item.disabled || active ? undefined : { bg: 'gray.50' }}
            sx={{
              WebkitTapHighlightColor: 'transparent',
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          >
            {numbered && (
              <Text
                as="span"
                fontSize="2xs"
                color={active ? 'brand.accentText' : 'gray.400'}
                flexShrink={0}
                w="14px"
                sx={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {i + 1}
              </Text>
            )}
            <Text
              as="span"
              flex="1"
              minW={0}
              fontSize="sm"
              fontWeight={active ? '500' : '400'}
              whiteSpace="nowrap"
              overflow="hidden"
              textOverflow="ellipsis"
            >
              {item.label}
            </Text>
            {active && <Icon as={FaCheck} boxSize={2.5} color="brand.accentText" flexShrink={0} />}
          </Box>
        );
      })}
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
function ProgressTrack({ steps }: { steps: ProgressStep[] }) {
  return (
    <Flex
      align="center"
      justify="center"
      gap={{ base: 1, md: 2 }}
      role="group"
      aria-label="Your booking progress"
    >
      {steps.map((s, i) => {
        const tone = STEP_TONES[s.tone];
        return (
          <Fragment key={s.label}>
            {i > 0 && (
              <Box
                // `flex` rather than a width, because it has to carry the
                // shrink rule too: one shorthand, so nothing can set the two
                // halves of this in an order CSS resolves the wrong way round.
                flex={{ base: '1 1 10px', md: '0 0 20px' }}
                minW={{ base: '10px', md: '20px' }}
                h="1px"
                bg={s.tone === 'done' ? 'brand.success' : 'gray.200'}
              />
            )}
            <Flex
              align="center"
              gap={{ base: 1.5, md: 2 }}
              flexShrink={0}
              // role="img" plus a label is what makes a badge and a word read
              // as one thing to a screen reader. Without it the number and the
              // label are announced as loose text and the state, which is
              // carried entirely in colour, is lost.
              role="img"
              aria-label={`Step ${s.n}, ${s.label}, ${
                s.tone === 'done' ? 'done' : s.current ? 'in progress' : 'not started'
              }`}
            >
              <Flex
                align="center"
                justify="center"
                w="22px"
                h="22px"
                borderRadius="full"
                bg={tone.bg}
                border="1px solid"
                borderColor={tone.border}
                color={tone.fg}
                fontSize="2xs"
                fontWeight="600"
                flexShrink={0}
                aria-hidden="true"
              >
                {s.tone === 'done' ? <Icon as={FaCheck} boxSize={2.5} /> : s.n}
              </Flex>
              <Text
                fontSize="2xs"
                fontWeight="500"
                textTransform="uppercase"
                letterSpacing="0.16em"
                color={tone.label}
                whiteSpace="nowrap"
                aria-hidden="true"
                display={{ base: s.current ? 'block' : 'none', md: 'block' }}
              >
                {s.label}
              </Text>
            </Flex>
          </Fragment>
        );
      })}
    </Flex>
  );
}

/**
 * The finished-client nav: ONE connected bar with hairline dividers between
 * items, not a row of separate pills. Centred, and scrollable with the same
 * affordance the portal's second nav row uses, because on a phone six sections
 * will not fit at 390px and a strip that silently overflows reads as a strip
 * with three items in it.
 *
 * Every item is written out in full. An icon-only Info or Favourites saves a
 * few pixels of a bar that already scrolls and costs the client the one thing
 * the bar is for, which is knowing what is in it.
 */
function SegmentedNav({
  items,
  activeId,
  onSelect,
}: {
  items: PortalNavItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<{ [id: string]: HTMLElement | null }>({});

  // Keep the active item inside the visible part of the strip. Scrolls the
  // container itself rather than calling scrollIntoView on the item, which
  // would page-scroll the whole window whenever the strip is off screen.
  useEffect(() => {
    if (!activeId) return;
    const el = itemRefs.current[activeId];
    const container = scrollRef.current;
    if (!el || !container) return;
    container.scrollTo({
      left: el.offsetLeft - container.clientWidth / 2 + el.offsetWidth / 2,
      behavior: scrollBehavior(),
    });
  }, [activeId]);

  return (
    <ScrollStrip scrollRef={scrollRef}>
      <Flex
        border="1px solid"
        borderColor="gray.200"
        borderRadius="full"
        overflow="hidden"
        bg="white"
        flexShrink={0}
      >
        {items.map((item, i) => {
          const active = item.id === activeId;
          return (
            <Box
              key={item.id}
              ref={(el: HTMLElement | null) => {
                itemRefs.current[item.id] = el;
              }}
              as="button"
              type="button"
              onClick={() => onSelect(item.id)}
              aria-current={active ? 'true' : undefined}
              display="inline-flex"
              alignItems="center"
              gap={2}
              flexShrink={0}
              px={{ base: 4, md: 5 }}
              // 44px is the floor for a thumb. The bar reads as 46px tall on a
              // phone once its own hairline border is counted, which still
              // clears PORTAL_HEADER_H with room either side.
              h={{ base: '44px', md: '36px' }}
              fontSize="2xs"
              fontWeight="500"
              letterSpacing="0.16em"
              textTransform="uppercase"
              whiteSpace="nowrap"
              color={active ? 'white' : 'gray.700'}
              bg={active ? 'brand.accent' : 'transparent'}
              // The divider IS the left border, so the bar reads as one
              // control rather than as touching pills.
              borderLeft={i > 0 ? '1px solid' : undefined}
              borderColor="gray.200"
              cursor="pointer"
              transition="background 0.2s ease, color 0.2s ease"
              _hover={
                active
                  ? { bg: 'brand.accentStrong' }
                  : { bg: 'rgba(201, 169, 110, 0.08)', color: 'brand.accentText' }
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
      </Flex>
    </ScrollStrip>
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
 * portal sit about 8px apart in the same 60px header: the burger and the photo
 * section bar. Tapping Password in the burger from the foot of the gallery held
 * the portal's own scan and left the gallery's running, so the bar beside the
 * burger rattled through every section name on the way up. The guard was there.
 * It simply was not reached from the other menu.
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
   * makes: standing at the foot of the photos, they open the burger and tap
   * Photos to get back to the top of them. The portal's own nav has said
   * Photos the whole time, because the entire gallery IS the photos section,
   * so "the scan agrees" was true on the first frame of a five thousand pixel
   * scroll and the hold was gone before the page had moved. Every other nav
   * was then free for the rest of it, which is the flicker this lock exists to
   * stop, arriving through the one door the lock could not see.
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
 * Exported because the portal's second nav row needs the identical affordance,
 * and two hand-rolled copies of it drifted apart once already.
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
 * strip's right edge, and both of the portal's sticky nav rows run the full
 * width of the page. Four pixels past the viewport is all it takes for a phone
 * to let the whole document be dragged sideways.
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
        sx={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
      >
        <Icon as={direction === 'left' ? FaChevronLeft : FaChevronRight} boxSize={2.5} />
      </Flex>
    </Box>
  );
}

export default PortalHeader;
