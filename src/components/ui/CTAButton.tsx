import React from 'react';
import { Box, Icon, Spinner } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import type { IconType } from 'react-icons';

// Single source of truth for every CTA on the site. Adding new buttons by
// hand-rolling Box/Link with copy-pasted styles is what got us into the
// "Leave a Review looks different from Book a Session" mess. Don't do that.
// Every CTA goes through this component; if it can't, fix the component.

type Variant = 'outline' | 'solid';
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
  fullWidth?: boolean;
  // External link target — defaults to _blank for href, _self for `to`
  newTab?: boolean;
  // When set, renders `download` on the anchor so the browser saves the file
  // instead of navigating. String = suggested filename. Auto-forces newTab=false.
  download?: string | boolean;
}

const GOLD = '#c9a96e';
const GOLD_HOVER = '#d4b87a';
const GOLD_ACTIVE = '#b8964f';

const sizeStyles: Record<Size, Record<string, any>> = {
  sm: { px: { base: 4, md: 5 }, py: 2, fontSize: '2xs', letterSpacing: '0.18em', gap: 2 },
  md: { px: 8, py: 3, fontSize: 'xs', letterSpacing: '0.2em', gap: 2.5 },
  lg: { px: 10, h: '52px', fontSize: 'sm', letterSpacing: '0.2em', gap: 3 },
};

// Visual variants. Hover transform is identical across all CTAs so the page
// reads consistently — only the resting fill/border colors differ.
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
  // outline
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
    whiteSpace: 'nowrap' as const,
    ...sizeStyles[size],
    ...variantStyles(variant, tone),
    ...(fullWidth ? { w: '100%' } : {}),
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
      <Box as={RouterLink} to={to} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})} {...common}>
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
    <Box as="button" type={type} onClick={onClick} disabled={inactive} {...common}>
      {content}
    </Box>
  );
};

export default CTAButton;
