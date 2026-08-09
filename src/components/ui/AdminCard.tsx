import { Box, type BoxProps } from '@chakra-ui/react';

/**
 * The white card wrapper that AdminClientDetail's Section, DangerZone,
 * PortalCard, FactCard, etc. all reach for by hand with slightly
 * different paddings. Consolidates those into one primitive with
 * responsive padding + margin so mobile automatically gets the
 * tighter treatment.
 *
 * Kept as a thin BoxProps wrapper so callers can still override
 * anything (padding, border, etc.) — it's an *ergonomic default*,
 * not a lockdown.
 */

interface Props extends BoxProps {
  // Emphasize = slightly higher contrast border, used for danger-zone
  // style cards or "you should notice this" callouts.
  emphasize?: boolean;
}

const AdminCard = ({ emphasize = false, children, ...rest }: Props) => (
  <Box
    bg="white"
    border="1px solid"
    borderColor={emphasize ? 'red.200' : 'gray.200'}
    borderRadius="sm"
    px={{ base: 4, md: 7 }}
    py={{ base: 4, md: 6 }}
    mb={{ base: 4, md: 5 }}
    {...rest}
  >
    {children}
  </Box>
);

export default AdminCard;
