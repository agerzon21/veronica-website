import { Box, HStack, Icon, Text } from '@chakra-ui/react';
import type { IconType } from 'react-icons';

/**
 * One segment of an underline-style segmented control.
 *
 * Lifted out of AdminAssistant, where it already served this exact purpose, so
 * the AI panel's Summary / Reply / Assistant strip is the same control rather
 * than a fourth hand-rolled copy of the pattern. Unchanged: full-width segments
 * and a 48px minimum height on a phone, auto width on desktop.
 */
export default function SubTabButton({
  active,
  icon,
  label,
  onClick,
  disabled = false,
  badge,
  'aria-label': ariaLabel,
}: {
  active: boolean;
  icon: IconType;
  label: string;
  onClick: () => void;
  /** Rendered muted and inert. Used for a tab with nothing in it yet. */
  disabled?: boolean;
  /** Small marker after the label, e.g. that a draft is waiting. */
  badge?: React.ReactNode;
  'aria-label'?: string;
}) {
  return (
    <Box
      as="button"
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? 'true' : undefined}
      px={{ base: 5, md: 4 }}
      py={{ base: 3.5, md: 2.5 }}
      minH={{ base: '48px', md: 'auto' }}
      flex={{ base: '1', md: 'none' }}
      mb="-1px"
      bg="transparent"
      border="none"
      borderBottom="2px solid"
      borderColor={active ? 'brand.accent' : 'transparent'}
      cursor={disabled ? 'default' : 'pointer'}
      opacity={disabled ? 0.45 : 1}
      transition="all 0.15s"
      sx={{ WebkitTapHighlightColor: 'transparent' }}
      _hover={disabled ? undefined : { borderColor: active ? 'brand.accent' : 'gray.300' }}
      _active={disabled ? undefined : { bg: 'rgba(201, 169, 110, 0.06)' }}
    >
      <HStack spacing={2} justify="center">
        <Icon as={icon} boxSize={{ base: 3.5, md: 3 }} color={active ? 'brand.accent' : 'gray.500'} />
        <Text
          fontSize="xs"
          fontWeight="500"
          letterSpacing="0.14em"
          textTransform="uppercase"
          color={active ? 'gray.800' : 'gray.500'}
          noOfLines={1}
        >
          {label}
        </Text>
        {badge}
      </HStack>
    </Box>
  );
}
