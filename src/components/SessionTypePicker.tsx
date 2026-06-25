import { Box, Flex, Input } from '@chakra-ui/react';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

// Standard set of session types. Kept lowercase so it round-trips
// through the DB without surprises — display is title-cased.
const STANDARD_TYPES = [
  'wedding',
  'engagement',
  'portrait',
  'family',
  'maternity',
  'newborn',
  'anniversary',
  'boudoir',
];

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

/**
 * Chips for the standard session types + a "Custom" fallback that opens
 * a free-text input. Reduces typing for Vero (most shoots fall into the
 * standard list) without locking out anything weird that might come up
 * later — gifted shoot, brand campaign, whatever.
 */
const SessionTypePicker = ({ value, onChange }: Props) => {
  const isStandard = STANDARD_TYPES.includes(value);
  const isCustom = !isStandard && value !== '';

  return (
    <Box>
      <Flex gap={2} wrap="wrap">
        {STANDARD_TYPES.map((t) => (
          <Chip key={t} label={cap(t)} selected={value === t} onClick={() => onChange(t)} />
        ))}
        <Chip
          label="Custom"
          selected={isCustom}
          onClick={() => {
            // Toggle into custom mode by clearing the value if not custom
            // already, so the input shows up empty + focused.
            if (!isCustom) onChange('');
          }}
        />
      </Flex>
      {(isCustom || value === '') && (
        <Input
          mt={3}
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
          placeholder="Type a custom session type (e.g. lifestyle, branding)"
          autoFocus={isCustom}
          h="40px"
          bg="white"
          border="1px solid"
          borderColor="gray.300"
          color="gray.800"
          fontSize="sm"
          borderRadius="sm"
          _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
        />
      )}
    </Box>
  );
};

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      px={3}
      py={1.5}
      bg={selected ? '#c9a96e' : 'white'}
      color={selected ? 'white' : 'gray.700'}
      border="1px solid"
      borderColor={selected ? '#c9a96e' : 'gray.300'}
      borderRadius="sm"
      fontSize="xs"
      fontWeight="500"
      letterSpacing="0.05em"
      cursor="pointer"
      transition="all 0.15s"
      _hover={{
        borderColor: '#c9a96e',
        color: selected ? 'white' : '#c9a96e',
      }}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {label}
    </Box>
  );
}

export default SessionTypePicker;
