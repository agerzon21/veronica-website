import React from 'react';
import { Box, Icon, Spinner } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import type { IconType } from 'react-icons';

// Single source of truth for every CTA on the site. Adding new buttons by
// hand-rolling Box/Link with copy-pasted styles is what got us into the
// "Leave a Review looks different from Book a Session" mess. Don't do that.
// Every CTA goes through this component; if it can't, fix the component.

type Variant = 'outline' | 'solid' | 'ghost' | 'danger';
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
}

const GOLD = '#c9a96e';
const GOLD_HOVER = '#d4b87a';
const GOLD_ACTIVE = '#b8964f';
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

const CTAButton = ({
  children,
  to,
  href,
  onClick,
  type = 'button',
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
}: CTAButtonProps) => {
  // Either a pending action or an explicit `isDisabled` should kill clicks
  // and dim the button. We keep the cursor distinct (`wait` for loading,
  // `not-allowed` for disabled, `pointer` otherwise) so the reason is
  // visible on hover.
  const inactive = isLoading || isDisabled;
  const common = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 400,
    textTransform: 'uppercase' as const,
    transition: 'all 0.4s ease',
    cursor: isLoading ? 'wait' : isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.5 : 1,
    pointerEvents: (isDisabled ? 'none' : 'auto') as 'none' | 'auto',
    borderRadius: 0,
    lineHeight: 1,
    whiteSpace: (wrapText ? 'normal' : 'nowrap') as 'normal' | 'nowrap',
    textAlign: 'center' as const,
    ...sizeStyles[size],
    ...variantStyles(variant, tone),
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
    sx: { WebkitTapHighlightColor: 'transparent' },
  };

  const content = (
    <>
      {isLoading ? (
        <Spinner size="xs" />
      ) : (
        icon && <Icon as={icon} boxSize={size === 'sm' ? 3.5 : 4} />
      )}
      <Box as="span">{isLoading && loadingText ? loadingText : children}</Box>
    </>
  );

  if (to) {
    return (
      <Box as={RouterLink} to={to} aria-label={ariaLabel} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...common}>
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
        {...common}
      >
        {content}
      </Box>
    );
  }

  return (
    <Box as="button" type={type} onClick={onClick} disabled={inactive} aria-label={ariaLabel} {...common}>
      {content}
    </Box>
  );
};

export default CTAButton;
