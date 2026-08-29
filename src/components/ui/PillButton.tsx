import { Box, HStack, Text, Icon } from '@chakra-ui/react';
import type { IconType } from 'react-icons';

/**
 * Pill/chip that used to be hand-rolled in two places: the Coverage
 * chips in AdminNewClient and the SessionType picker (SessionTypePicker).
 * Both had the same look, same behavior, and both suffered the same
 * ~28px height touch-target problem. Consolidating means the mobile
 * touch fix ships once + the two grids stay visually identical.
 *
 * On desktop the pill hugs its content. On mobile it stretches to fill
 * its grid cell (2 columns) so a whole thumb hits the target instead
 * of the letter cluster in the middle.
 */

interface Props {
  label: string;
  isActive: boolean;
  onClick: () => void;
  icon?: IconType;
  disabled?: boolean;
}

const PillButton = ({ label, isActive, onClick, icon, disabled = false }: Props) => {
  return (
    <Box
      as="button"
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-pressed={isActive}
      disabled={disabled}
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      px={{ base: 4, md: 4 }}
      py={{ base: 3, md: 1.5 }}
      minH={{ base: '44px', md: 'auto' }}
      w="100%"
      fontSize={{ base: 'sm', md: 'xs' }}
      fontWeight="500"
      letterSpacing="0.02em"
      color={isActive ? 'white' : disabled ? 'gray.400' : 'gray.700'}
      bg={isActive ? '#c9a96e' : 'white'}
      border="1px solid"
      borderColor={isActive ? '#c9a96e' : 'gray.300'}
      borderRadius="full"
      cursor={disabled ? 'not-allowed' : 'pointer'}
      opacity={disabled ? 0.5 : 1}
      transition="all 0.15s"
      sx={{
        WebkitTapHighlightColor: 'transparent',
        // Hover states only apply on actual pointer-hover devices, so
        // tapped-then-let-go on mobile doesn't leave the chip stuck in
        // its hover fill.
        '@media (hover: hover)': {
          _hover: isActive
            ? { bg: 'brand.accentStrong', borderColor: 'brand.accentStrong' }
            : { borderColor: 'brand.accent', color: 'brand.accent' },
        },
      }}
      _active={
        isActive
          ? { bg: 'brand.accentStrong', borderColor: 'brand.accentStrong' }
          : { bg: 'rgba(201, 169, 110, 0.08)' }
      }
    >
      <HStack spacing={2}>
        {icon && <Icon as={icon} boxSize={3.5} />}
        <Text as="span" whiteSpace="nowrap">
          {label}
        </Text>
      </HStack>
    </Box>
  );
};

export default PillButton;
