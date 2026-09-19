import React, { useEffect, useRef, useState } from 'react';
import { Box, Icon, Spinner } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import type { IconType } from 'react-icons';

// Single source of truth for every CTA on the site. Adding new buttons by
// hand-rolling Box/Link with copy-pasted styles is what got us into the
// "Leave a Review looks different from Book a Session" mess. Don't do that.
// Every CTA goes through this component; if it can't, fix the component.

// 'tab' / 'tabMuted' are the pair Alex picked for About (D8): a hairline plate
// with a solid gold spine down its left edge, like the marker beside a printed
// caption. The spine thickens on hover. 'tab' is the emphasized one; 'tabMuted'
// carries a grey spine that warms to gold, so a pair reads as primary +
// secondary without changing shape.
//
// 'photoTab' replaced that pair on About (Alex picked treatment 5 of five,
// 2026-09-17): a full-width plate carrying a fan of three small photographs,
// then the label, then a thin arrow. Pass the photos as `thumbs`. A phone has
// no hover, so the fan also spreads once when the button first scrolls fully
// into view; that is the one moment of motion a touch visitor gets.
type Variant = 'outline' | 'solid' | 'solidMuted' | 'ghost' | 'danger' | 'tab' | 'tabMuted' | 'photoTab';
type Tone = 'light' | 'dark';
type Size = 'sm' | 'md' | 'lg';

interface CTAButtonProps {
  children: React.ReactNode;
  // Exactly one of: `to` (internal router nav), `href` (external link),
  // or `onClick` (button action). Form submits use type="submit" + onClick.
  to?: string;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  type?: 'button' | 'submit';
  // The id of the <form> this button submits, for a submit button that sits
  // OUTSIDE its form in the markup. The contact page needs it: its submit bar
  // is sticky, and a sticky element cannot leave its containing block, so
  // inside the form the bar was clamped and hung below the fold. Moving the
  // bar out fixes that, and this attribute is what still connects the button
  // to the form. Per the note at the top of this file, the fix belongs here
  // rather than in a hand-rolled button beside it.
  form?: string;
  icon?: IconType;
  variant?: Variant;
  tone?: Tone;
  size?: Size;
  isLoading?: boolean;
  loadingText?: string;
  // Visually + functionally disable the button (e.g. an action that depends
  // on some other state being true). isLoading already implies disabled,
  // so callers don't need to set both.
  isDisabled?: boolean;
  // Boolean = w:100% always. Responsive object = full-width only at
  // the breakpoints where it's true. Common pattern: `fullWidth={{ base: true, md: false }}`
  // for CTAs that stretch on mobile but hug their content on desktop.
  fullWidth?: boolean | { base?: boolean; sm?: boolean; md?: boolean; lg?: boolean; xl?: boolean };
  // External link target — defaults to _blank for href, _self for `to`
  newTab?: boolean;
  // When set, renders `download` on the anchor so the browser saves the file
  // instead of navigating. String = suggested filename. Auto-forces newTab=false.
  download?: string | boolean;
  // Escape hatch for buttons with long labels ("Create Portal & Send Invite")
  // that would otherwise blow past a mobile viewport in nowrap mode. Unsets
  // whiteSpace and gently tightens letterSpacing on mobile so the label wraps.
  wrapText?: boolean;
  // Accessibility label — used on icon-only buttons.
  'aria-label'?: string;
  // Explicit height, for the rare CTA that has to fill a sized slot rather
  // than size itself from its padding — e.g. the send button in the refine
  // panel, which is two thirds of a fixed-height column beside the composer.
  // Added here rather than hand-rolling that one button, per the note above.
  h?: string | Record<string, string>;
  // Flex sizing, for the same reason as `h` — a CTA that is one sized child
  // of a column rather than a self-sizing button.
  flex?: string | Record<string, string>;
  // 'photoTab' only: up to three small photos for the fan, left to right.
  // The middle one sits on top. 2:3 portrait files fit the slots uncropped.
  thumbs?: string[];
}

const GOLD = '#c9a96e';
const GOLD_HOVER = '#d4b87a';
const GOLD_ACTIVE = '#b8964f';
// Same tokens as brand.accentBorder / brand.accentText / brand.surfaceSunken
// in the theme. They are repeated as literals here for the same reason the
// golds above are: this file's style objects are plain values, not Chakra
// props resolved per key.
const GOLD_BORDER = '#e8d9a8';
const GOLD_TEXT = '#8a6e35';
const SUNKEN = '#f5efe4';
const SPINE_MUTED = 'rgba(43, 39, 36, 0.3)';
// photoTab's label. Warm, because the cool Chakra greys the tab pair used read
// as out of place on the cream sections.
const WARM_INK = '#4a4038';

// The fan's three photos at rest and spread (hover, press, or the one-time
// play on a phone). Index 1 is the middle, raised photo.
const FAN_REST = ['rotate(-6deg)', 'translateY(-2px)', 'rotate(6deg)'];
const FAN_SPREAD = ['translateX(-5px) rotate(-12deg)', 'translateY(-6px)', 'translateX(5px) rotate(12deg)'];
const fanRules = (transforms: string[]) =>
  Object.fromEntries(transforms.map((t, i) => [`& .cta-fan-${i}`, { transform: t }]));

// The flutter (Alex, 2026-09-17): on hover (or the one-time play on a phone)
// the three photos swing past their spread position, back, and out again
// before settling, each a beat after the one before, like prints caught by a
// breath of air.
//
// Two layers, on purpose. The outer .cta-fan-N moves between rest and spread
// with a plain transition; the inner .cta-fan-print carries the flutter as an
// offset that starts and ends at `none`. With both on one element, Chromium
// snapped the prints back when the hover ended instead of easing them home:
// a transition never starts from a value an animation owned.
const FLUTTER_FRAMES = [
  ['none', 'translate(-3px, -4px) rotate(-6deg)', 'translate(2px, -1px) rotate(4deg)', 'translate(-1px, -2px) rotate(-3deg)', 'none'],
  ['none', 'translateY(-4px) rotate(3deg)', 'translateY(2px) rotate(-2.5deg)', 'translateY(-2px) rotate(1.5deg)', 'none'],
  ['none', 'translate(3px, -4px) rotate(6deg)', 'translate(-2px, -1px) rotate(-4deg)', 'translate(1px, -2px) rotate(3deg)', 'none'],
];
const flutterKeyframes = Object.fromEntries(
  FLUTTER_FRAMES.map((frames, i) => [
    `@keyframes ctaFanFlutter${i}`,
    Object.fromEntries(frames.map((t, f) => [`${[0, 28, 54, 78, 100][f]}%`, { transform: t }])),
  ]),
);
const flutterRules = {
  ...fanRules(FAN_SPREAD),
  ...Object.fromEntries(
    [0, 1, 2].map((i) => [
      `& .cta-fan-${i} > .cta-fan-print`,
      { animation: `ctaFanFlutter${i} 0.75s cubic-bezier(0.37, 0, 0.3, 1) ${i * 0.07}s backwards` },
    ]),
  ),
};

const DANGER = '#c53030';
const DANGER_HOVER = '#e53e3e';
const DANGER_ACTIVE = '#9b2c2c';

// Every size is now RESPONSIVE. On mobile every CTA hits the 44px iOS
// touch-target minimum. On desktop the numbers match the site's classic
// light-weight typographic buttons. This is why every one of ~40 button
// call sites in /admin becomes touch-friendly with zero call-site churn.
const sizeStyles: Record<Size, Record<string, any>> = {
  sm: {
    px: { base: 4, md: 5 },
    py: { base: 3, md: 2 },
    fontSize: { base: 'xs', md: '2xs' },
    letterSpacing: { base: '0.15em', md: '0.18em' },
    gap: 2,
    minH: { base: '44px', md: 'auto' },
  },
  md: {
    px: { base: 6, md: 8 },
    py: { base: 3.5, md: 3 },
    fontSize: { base: 'sm', md: 'xs' },
    letterSpacing: { base: '0.15em', md: '0.2em' },
    gap: 2.5,
    minH: { base: '48px', md: 'auto' },
  },
  lg: {
    px: { base: 8, md: 10 },
    h: { base: '56px', md: '52px' },
    fontSize: 'sm',
    letterSpacing: '0.2em',
    gap: 3,
  },
};

// Visual variants. Hover transform is identical across all CTAs so the page
// reads consistently — only the resting fill/border colors differ.
// Ghost = borderless text button (replaces hand-rolled `Box as="button"`).
// Danger = red-tone destructive action (replaces hand-rolled red Boxes).
const variantStyles = (variant: Variant, tone: Tone): Record<string, any> => {
  if (variant === 'solid') {
    return {
      bg: GOLD,
      color: 'white',
      border: '1px solid',
      borderColor: GOLD,
      _hover: {
        bg: GOLD_HOVER,
        borderColor: GOLD_HOVER,
        transform: 'translateY(-2px)',
        textDecoration: 'none',
      },
      _active: { bg: GOLD_ACTIVE, transform: 'translateY(0)' },
    };
  }
  // The muted twin of `solid`: a primary action whose preconditions are not
  // met yet. It deliberately is NOT `outline`, because outline is a real
  // secondary CTA and reads as "the lesser of two buttons" rather than "not
  // ready yet". Sunken fill, gold text, pale border.
  if (variant === 'solidMuted') {
    return {
      bg: SUNKEN,
      color: GOLD_TEXT,
      border: '1px solid',
      borderColor: GOLD_BORDER,
      // Does not go gold on hover. Gold is what the READY state looks like,
      // so borrowing it here would signal the preconditions are met. Warming
      // the border plus the shared lift is enough to say "pressable", which
      // matters because this button genuinely is: pressing it is how you find
      // out what is still missing.
      _hover: {
        borderColor: GOLD,
        color: GOLD_TEXT,
        transform: 'translateY(-2px)',
        textDecoration: 'none',
      },
      _active: { bg: GOLD_BORDER, transform: 'translateY(0)' },
    };
  }
  if (variant === 'ghost') {
    return {
      bg: 'transparent',
      color: tone === 'dark' ? 'gray.100' : 'gray.600',
      border: '1px solid transparent',
      _hover: {
        bg: 'rgba(201, 169, 110, 0.08)',
        color: GOLD,
        textDecoration: 'none',
      },
      _active: { bg: 'rgba(201, 169, 110, 0.15)' },
    };
  }
  if (variant === 'tab' || variant === 'tabMuted') {
    return {
      // The spine is a pseudo-element pulled out over the left border, so it
      // reads as one continuous edge rather than a stripe sitting inside a box.
      position: 'relative',
      bg: 'transparent',
      color: variant === 'tab' ? 'gray.700' : tone === 'dark' ? 'gray.300' : 'gray.600',
      border: '1px solid',
      borderColor: GOLD_BORDER,
      _before: {
        content: '""',
        position: 'absolute',
        left: '-1px',
        top: '-1px',
        bottom: '-1px',
        width: '5px',
        bg: variant === 'tab' ? GOLD : SPINE_MUTED,
        transition: 'width 0.4s cubic-bezier(0.22, 1, 0.36, 1), background 0.35s ease',
      },
      _hover: {
        color: GOLD_TEXT,
        borderColor: GOLD,
        textDecoration: 'none',
        _before: { width: '11px', bg: GOLD },
      },
      _active: { bg: 'rgba(201, 169, 110, 0.12)' },
      // No hover on a phone, so the spine sits at its halfway width to read as
      // a real control. It must NOT also go gold: doing that made both buttons
      // in a pair identical on touch while desktop still showed one gold and
      // one grey, so the ranking simply vanished on phones. Width only.
      sx: {
        '@media (hover: none)': {
          '&::before': { width: '8px' },
        },
      },
      // Both variants get the SAME box. Left to the size scale the two came
      // out at different heights, because only one of them carries a border
      // colour heavy enough to define its own edge.
      h: { base: '48px', md: '42px' },
    };
  }

  if (variant === 'photoTab') {
    return {
      position: 'relative',
      w: '100%',
      justifyContent: 'flex-start',
      gap: { base: 4, md: 5 },
      minH: { base: '70px', md: '66px' },
      px: { base: '14px', md: '16px' },
      py: 2,
      bg: 'white',
      color: WARM_INK,
      fontWeight: 500,
      fontSize: 'xs',
      letterSpacing: '0.16em',
      // Labels wrap on the narrowest phones (320px) instead of pushing the
      // arrow out past the border.
      whiteSpace: 'normal',
      lineHeight: 1.4,
      border: '1px solid',
      borderColor: GOLD_BORDER,
      _hover: {
        borderColor: GOLD,
        color: GOLD_TEXT,
        transform: 'translateY(-2px)',
        boxShadow: '0 12px 26px -20px rgba(20, 15, 5, 0.5)',
        textDecoration: 'none',
      },
      _active: { bg: SUNKEN, transform: 'translateY(0)' },
      sx: {
        ...flutterKeyframes,
        '& .cta-arrow': { transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)' },
        // Hover only where hover exists; on a phone :hover sticks after a tap.
        '@media (hover: hover)': {
          '&:hover': flutterRules,
          '&:hover .cta-arrow': { transform: 'translateX(5px)' },
        },
        '&[data-play="true"]': {
          ...flutterRules,
          '& .cta-arrow': { transform: 'translateX(5px)' },
        },
        '&:active': {
          ...fanRules(FAN_SPREAD),
          '& .cta-arrow': { transform: 'translateX(5px)' },
        },
        '@media (prefers-reduced-motion: reduce)': {
          '& .cta-fan *, & .cta-arrow': { transition: 'none', animation: 'none !important' },
        },
      },
    };
  }

  if (variant === 'danger') {
    return {
      bg: 'transparent',
      color: DANGER,
      border: '1px solid',
      borderColor: DANGER,
      _hover: {
        bg: DANGER_HOVER,
        color: 'white',
        borderColor: DANGER_HOVER,
        transform: 'translateY(-2px)',
        textDecoration: 'none',
      },
      _active: { bg: DANGER_ACTIVE, transform: 'translateY(0)' },
    };
  }
  // outline (default)
  return {
    bg: 'transparent',
    color: tone === 'dark' ? GOLD : 'gray.700',
    border: '1px solid',
    borderColor: GOLD,
    _hover: {
      bg: GOLD,
      color: 'white',
      transform: 'translateY(-2px)',
      textDecoration: 'none',
    },
    _active: { bg: GOLD_ACTIVE, borderColor: GOLD_ACTIVE, color: 'white', transform: 'translateY(0)' },
  };
};

const PhotoFan = ({ thumbs }: { thumbs: string[] }) => (
  // pl offsets the first photo's negative margin, so the fan starts flush.
  <Box className="cta-fan" as="span" display="flex" flex="none" pl="10px" aria-hidden="true">
    {thumbs.slice(0, 3).map((src, i) => (
      // Outer span: the pose (rest or spread), eased by a transition.
      <Box
        key={`${i}-${src}`}
        as="span"
        className={`cta-fan-${i}`}
        display="block"
        position="relative"
        zIndex={i === 1 ? 1 : 0}
        ml="-10px"
        transform={FAN_REST[i]}
        transition="transform 0.5s cubic-bezier(0.22, 1, 0.36, 1)"
      >
        {/* Inner span: the print itself, and the flutter on top of the pose. */}
        <Box
          as="span"
          className="cta-fan-print"
          display="block"
          w="32px"
          h="48px"
          bg={SUNKEN}
          border="2px solid white"
          boxShadow="0 5px 12px -5px rgba(20, 15, 5, 0.55)"
          overflow="hidden"
        >
          <Box
            as="img"
            src={src}
            alt=""
            width={32}
            height={48}
            loading="lazy"
            decoding="async"
            display="block"
            w="100%"
            h="100%"
            objectFit="cover"
          />
        </Box>
      </Box>
    ))}
  </Box>
);

const ThinArrow = () => (
  <Box
    as="svg"
    className="cta-arrow"
    viewBox="0 0 20 10"
    w="20px"
    h="10px"
    flex="none"
    ml="auto"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.2"
    color={GOLD_TEXT}
    aria-hidden="true"
  >
    <path d="M0 5h18.5M14.2 1l4.2 4-4.2 4" />
  </Box>
);

const CTAButton = ({
  children,
  to,
  href,
  onClick,
  type = 'button',
  form,
  icon,
  variant = 'outline',
  tone = 'light',
  size = 'md',
  isLoading = false,
  loadingText,
  isDisabled = false,
  fullWidth = false,
  newTab,
  download,
  wrapText = false,
  'aria-label': ariaLabel,
  h,
  flex,
  thumbs,
}: CTAButtonProps) => {
  // photoTab's one-time spread on touch screens. Hooks run for every variant;
  // the effect bails out unless this is a photoTab on a device without hover.
  const isPhotoTab = variant === 'photoTab';
  const rootRef = useRef<HTMLElement | null>(null);
  const [play, setPlay] = useState(false);
  useEffect(() => {
    const el = rootRef.current;
    if (!isPhotoTab || !el || typeof IntersectionObserver === 'undefined') return;
    if (!window.matchMedia?.('(hover: none)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timers: number[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        // A beat after it lands, so the eye is already on it.
        timers.push(window.setTimeout(() => setPlay(true), 250));
        timers.push(window.setTimeout(() => setPlay(false), 1500));
      },
      { threshold: 0.9 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [isPhotoTab]);

  // Either a pending action or an explicit `isDisabled` should kill clicks
  // and dim the button. We keep the cursor distinct (`wait` for loading,
  // `not-allowed` for disabled, `pointer` otherwise) so the reason is
  // visible on hover.
  const inactive = isLoading || isDisabled;
  // A variant may carry its own `sx` (the tab pair uses one for its no-hover
  // media query). The literal `sx` at the bottom of this object would silently
  // clobber it, so pull it out here and merge the two.
  const { sx: variantSx, ...variantStyle } = variantStyles(variant, tone);
  const common = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 400,
    textTransform: 'uppercase' as const,
    transition: 'all 0.4s ease',
    cursor: isLoading ? 'wait' : isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.5 : 1,
    // `none` when disabled, and otherwise NOTHING AT ALL. Spelling out the
    // default `auto` looks like a no-op and is the exact opposite: because
    // `pointer-events` inherits, an explicit `auto` here re-enables the button
    // inside an ancestor that deliberately switched itself off with `none`.
    // The closed mobile menu is a full-screen, fully transparent overlay that
    // turns itself off that way, and this one word kept its Contact button
    // alive inside it: an invisible 126x48 link parked in the middle of every
    // phone screen, on every page, swallowing taps and going to /contact. That
    // is the whole of "random pages, random actions take us to Contact".
    // Anything that needs to stay clickable inside a `pointer-events: none`
    // parent should say so at the call site, where it is visible.
    ...(isDisabled ? { pointerEvents: 'none' as const } : {}),
    borderRadius: 0,
    lineHeight: 1,
    whiteSpace: (wrapText ? 'normal' : 'nowrap') as 'normal' | 'nowrap',
    textAlign: 'center' as const,
    ...sizeStyles[size],
    ...variantStyle,
    ...(h !== undefined ? { h } : {}),
    ...(flex !== undefined ? { flex } : {}),
    ...(fullWidth
      ? typeof fullWidth === 'boolean'
        ? { w: '100%' }
        : // Responsive: map each breakpoint's truthiness to a width value.
          {
            w: Object.fromEntries(
              Object.entries(fullWidth).map(([bp, on]) => [bp, on ? '100%' : 'auto']),
            ),
          }
      : {}),
    sx: { WebkitTapHighlightColor: 'transparent', ...variantSx },
  };

  const content = isPhotoTab ? (
    <>
      {thumbs && thumbs.length > 0 && <PhotoFan thumbs={thumbs} />}
      <Box as="span" textAlign="left" minW={0}>{children}</Box>
      <ThinArrow />
    </>
  ) : (
    <>
      {isLoading ? (
        <Spinner size="xs" />
      ) : (
        icon && <Icon as={icon} boxSize={size === 'sm' ? 3.5 : 4} />
      )}
      {/* Skip the label entirely when there is none — an empty span still
          consumes the flex `gap`, which pushes an icon-only button off-centre. */}
      {(children || (isLoading && loadingText)) && (
        <Box as="span">{isLoading && loadingText ? loadingText : children}</Box>
      )}
    </>
  );

  // Only photoTab needs these: the element to watch, and the play flag its
  // styles key off.
  const photoTabProps = isPhotoTab
    ? { ref: rootRef as React.Ref<HTMLDivElement>, 'data-play': play ? 'true' : undefined }
    : {};

  if (to) {
    return (
      <Box as={RouterLink} to={to} aria-label={ariaLabel} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...photoTabProps} {...common}>
        {content}
      </Box>
    );
  }

  if (href) {
    // Downloads stay in the same tab — opening a new tab just to immediately
    // close it after the download starts is jarring UX.
    const openInNewTab = download ? false : (newTab ?? true);
    return (
      <Box
        as="a"
        href={href}
        aria-label={ariaLabel}
        {...(openInNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...(download !== undefined
          ? { download: typeof download === 'string' ? download : '' }
          : {})}
        {...photoTabProps}
        {...common}
      >
        {content}
      </Box>
    );
  }

  return (
    <Box as="button" type={type} form={form} onClick={onClick} disabled={inactive} aria-label={ariaLabel} {...photoTabProps} {...common}>
      {content}
    </Box>
  );
};

export default CTAButton;
