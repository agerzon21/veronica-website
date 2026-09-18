import { Box, Flex, Icon, Image, Text } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import type { IconType } from 'react-icons';
import FaCheck from '../icons/fa/FaCheck';
import FaChevronLeft from '../icons/fa/FaChevronLeft';
import FaChevronRight from '../icons/fa/FaChevronRight';
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
 */

export type PortalContractStatus = 'none' | 'pending' | 'signed' | 'void';

/** One entry in whatever nav the header is handed. */
export interface PortalNavItem {
  /** The id of the section element this jumps to. */
  id: string;
  label: string;
  icon?: IconType;
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
   * The section nav. Rendered as a segmented control once the booking is
   * complete, and ignored otherwise, because until then the middle of the
   * header belongs to the progress.
   */
  navItems?: PortalNavItem[];
  activeNavId?: string | null;
  onNavSelect?: (id: string) => void;
}

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

  const remaining =
    progress && progress.amountOwed !== null ? progress.amountOwed - progress.paidToDate : null;
  // Never "$0". Nothing owed means nothing to say here.
  const showBalance = remaining !== null && remaining > 0;

  return (
    <Box
      as="header"
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

        {/* Middle slot. Progress until the booking is finished, then the
            section nav. Never both, and the slot keeps its width either way so
            the header does not jump when a client pays the last installment. */}
        <Box flex="1" minW={0}>
          {showNav && <SegmentedNav items={items} activeId={activeNavId} onSelect={onNavSelect!} />}
          {showProgress && <ProgressTrack steps={buildSteps(progress!)} />}
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
      </Flex>
    </Box>
  );
};

/**
 * The three step indicator.
 *
 * On a phone only the current step keeps its label. Three labels plus a
 * balance does not fit at 390px, and the numbers carry the shape of the
 * journey on their own once one of them is coloured.
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
                w={{ base: '10px', md: '20px' }}
                h="1px"
                bg={s.tone === 'done' ? 'brand.success' : 'gray.200'}
                flexShrink={0}
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
 */
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
      {...(direction === 'left' ? { left: 1 } : { right: 1 })}
      zIndex={2}
      display="flex"
      alignItems="center"
      justifyContent="center"
      w="28px"
      h="28px"
      borderRadius="full"
      bg="rgba(255, 255, 255, 0.9)"
      backdropFilter="blur(6px)"
      color="brand.accent"
      border="1px solid"
      borderColor="rgba(201, 169, 110, 0.35)"
      boxShadow="0 2px 6px rgba(0, 0, 0, 0.08)"
      cursor="pointer"
      transition="all 0.2s"
      _hover={{ bg: 'brand.accent', color: 'white', borderColor: 'brand.accent' }}
      // The chevron is drawn at 28px so it does not smother the strip it sits
      // on, but a thumb gets the full 44px: the pseudo-element widens the hit
      // area without widening the ink.
      _before={{
        content: '""',
        position: 'absolute',
        top: '-8px',
        bottom: '-8px',
        left: '-8px',
        right: '-8px',
      }}
      sx={{
        WebkitTapHighlightColor: 'transparent',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      <Icon as={direction === 'left' ? FaChevronLeft : FaChevronRight} boxSize={2.5} />
    </Box>
  );
}

export default PortalHeader;
