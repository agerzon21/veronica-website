/**
 * The $ / % switch for a discount. One control for the package discount and
 * the single-session discount, so both read and behave the same.
 */

import { Box, HStack } from '@chakra-ui/react';
import type { DiscountMode } from '../../data/package';

export default function DiscountModeToggle({
  mode,
  onChange,
  testIdPrefix = 'discount',
}: {
  mode: DiscountMode;
  onChange: (mode: DiscountMode) => void;
  testIdPrefix?: string;
}) {
  return (
    <HStack spacing={0} border="1px solid" borderColor="gray.300" borderRadius="md" overflow="hidden">
      {(['usd', 'pct'] as const).map((m) => (
        <Box
          key={m}
          as="button"
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={mode === m}
          data-testid={`${testIdPrefix}-${m}`}
          px={4}
          h="40px"
          bg={mode === m ? 'brand.accentText' : 'white'}
          color={mode === m ? 'white' : 'gray.600'}
          fontSize="sm"
        >
          {m === 'usd' ? '$' : '%'}
        </Box>
      ))}
    </HStack>
  );
}
