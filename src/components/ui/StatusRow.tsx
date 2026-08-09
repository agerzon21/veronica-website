import { Stack, VStack, Text, Box, type StackProps } from '@chakra-ui/react';
import { type ReactNode } from 'react';

/**
 * Two-column-on-desktop / stacked-on-mobile row with a label group on
 * the left (title + optional subtitle) and an action group on the right
 * (buttons, switches, links, whatever). Repeated 5+ times in
 * AdminClientDetail as the "Delivery / Gallery Pass / Contract Status /
 * Account Status" pattern — extracting it stops the mobile orphan-CTA
 * problem where the button `wrap="wrap"`ed to its own line, right-
 * aligned, floating in whitespace.
 *
 * On mobile the action group goes full-width below the label. On
 * desktop it sits to the right, top-aligned with the label.
 */

interface Props extends Omit<StackProps, 'children' | 'title'> {
  title: ReactNode;
  subtitle?: ReactNode;
  // Right-side content — buttons, switches, status badges, etc.
  action: ReactNode;
  // Optional pre-title element (icon, avatar, etc.)
  leading?: ReactNode;
}

const StatusRow = ({ title, subtitle, action, leading, ...stackProps }: Props) => {
  return (
    <Stack
      direction={{ base: 'column', md: 'row' }}
      align={{ base: 'stretch', md: 'center' }}
      justify={{ base: 'flex-start', md: 'space-between' }}
      spacing={{ base: 3, md: 4 }}
      {...stackProps}
    >
      <Stack direction="row" align="flex-start" spacing={3} flex={1} minW={0}>
        {leading}
        <VStack align="flex-start" spacing={0.5} flex={1} minW={0}>
          {typeof title === 'string' ? (
            <Text
              fontSize={{ base: 'sm', md: 'sm' }}
              color="gray.800"
              fontWeight="500"
              lineHeight="1.4"
            >
              {title}
            </Text>
          ) : (
            title
          )}
          {subtitle && (
            typeof subtitle === 'string' ? (
              <Text fontSize={{ base: 'xs', md: 'xs' }} color="gray.500" lineHeight="1.5">
                {subtitle}
              </Text>
            ) : (
              subtitle
            )
          )}
        </VStack>
      </Stack>
      {/* Action goes full-width on mobile so buttons don't orphan. */}
      <Box w={{ base: '100%', md: 'auto' }} flexShrink={0}>
        {action}
      </Box>
    </Stack>
  );
};

export default StatusRow;
