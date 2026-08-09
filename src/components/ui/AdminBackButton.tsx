import { Box, Icon, Text } from '@chakra-ui/react';
import { FaChevronLeft } from 'react-icons/fa';

/**
 * Standard 44×44 back button used at the top of every drill-in admin
 * view (client detail, mode chooser, new-client forms, journal editor,
 * mobile Messages conversation view). Replaces the hand-rolled
 * `Box as="button"` back links that were showing up on every screen
 * with 14-22px tap targets — impossible to hit reliably on a phone.
 *
 * Aligns visually with the section it's inside by using ml={-2} so the
 * chevron sits flush with body text below.
 */

interface Props {
  onClick: () => void;
  label?: string;
  // Optional aria-label override for icon-only usage (rare — most back
  // buttons want the visible text).
  'aria-label'?: string;
}

const AdminBackButton = ({ onClick, label = 'Back', 'aria-label': ariaLabel }: Props) => {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      aria-label={ariaLabel || label}
      display="inline-flex"
      alignItems="center"
      gap={2}
      // The negative margin pulls the icon back to align with body text
      // below — but only where the parent has enough padding to absorb it.
      // If a caller doesn't have that room they can wrap us in a spacer.
      ml={{ base: -2, md: -2 }}
      px={2}
      py={2}
      minH="44px"
      bg="transparent"
      color="gray.500"
      border="1px solid transparent"
      borderRadius="sm"
      cursor="pointer"
      transition="all 0.15s"
      _hover={{ color: '#c9a96e', bg: 'rgba(201, 169, 110, 0.06)' }}
      _active={{ bg: 'rgba(201, 169, 110, 0.12)' }}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Icon as={FaChevronLeft} boxSize={{ base: 3.5, md: 3 }} />
      <Text
        as="span"
        fontSize={{ base: 'xs', md: '2xs' }}
        fontWeight="500"
        letterSpacing={{ base: '0.15em', md: '0.2em' }}
        textTransform="uppercase"
      >
        {label}
      </Text>
    </Box>
  );
};

export default AdminBackButton;
