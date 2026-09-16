import { Box, Flex, Grid, GridItem, Text, VStack } from '@chakra-ui/react';

/**
 * The column beside the contact form, shared by /contact and /contact/thank-you.
 *
 * Shared rather than inlined twice on purpose: it carries Veronika's email,
 * phone number and handle, and a number that lives in two page files is a
 * number that eventually gets changed in one of them. It is also exactly what
 * someone wants to read the moment they have sent an enquiry, which is why the
 * thank-you page keeps it rather than replacing the whole screen.
 */

/** The label-and-hairline heading used by every section on both pages. */
export const SectionHead = ({ title, required }: { title: string; required?: boolean }) => (
  <Flex align="center" gap={3} mb={5}>
    <Text
      as="h2"
      fontSize="12px"
      fontWeight="500"
      letterSpacing="0.18em"
      textTransform="uppercase"
      color="brand.accentText"
      whiteSpace="nowrap"
      m={0}
    >
      {title}
      {required && (
        <Text as="span" color="red.600" fontWeight="500">
          {' *'}
        </Text>
      )}
    </Text>
    <Box flex={1} h="1px" bg="brand.accentBorder" />
  </Flex>
);

const CHANNELS = [
  {
    label: 'Email',
    value: 'vero@vero.photography',
    href: 'mailto:vero@vero.photography?subject=Photography%20Inquiry',
  },
  { label: 'WhatsApp', value: '+1 (570) 909-5707', href: 'https://wa.me/15709095707' },
  { label: 'Instagram', value: '@vero.art.photo', href: 'https://www.instagram.com/vero.art.photo' },
];

const STEPS: Array<[string, string, string]> = [
  ['1', 'Your signed contract', ', which you review and sign online in your private client portal.'],
  ['2', 'Your retainer', ', paid to hold the date for you.'],
];

const railItemSx = {
  w: '100%',
  maxW: { base: '640px', lg: 'none' },
  mx: 'auto',
  borderLeft: { lg: '1px solid' },
  borderColor: { lg: 'brand.accentBorder' },
  pl: { lg: 8 },
};

/**
 * Renders the two rail sections as separate grid items so each can take its own
 * named area. Returned in a fragment, whose children are hoisted, so the grid
 * still sees them as direct children and the area names apply.
 *
 * `onChannelClick` lets the caller record the outbound click; the thank-you
 * page tracks these as contact conversions, the contact page does not.
 */
const ContactRail = ({ onChannelClick }: { onChannelClick?: (label: string) => void }) => (
  <>
    <GridItem area="reserve" mt={{ base: 14, lg: 0 }} pb={{ lg: 10 }} sx={railItemSx}>
      <SectionHead title="What reserves your date" />
      <VStack as="ol" spacing={4} align="stretch" m={0} sx={{ listStyle: 'none' }}>
        {STEPS.map(([n, strong, rest]) => (
          <Grid key={n} as="li" templateColumns="28px minmax(0,1fr)" gap={3} alignItems="baseline">
            <Text fontFamily="heading" fontSize="28px" lineHeight="1" color="brand.accentText" aria-hidden="true">
              {n}
            </Text>
            <Text fontSize="15px" lineHeight="1.7" color="gray.700" m={0}>
              <Text
                as="strong"
                fontWeight="500"
                color="gray.800"
                textDecoration="underline"
                textDecorationColor="brand.accent"
                textUnderlineOffset="4px"
              >
                {strong}
              </Text>
              {rest}
            </Text>
          </Grid>
        ))}
      </VStack>
      <Text mt={4} fontSize="15px" lineHeight="1.7" color="gray.600">
        Once both are done, the date is yours.
      </Text>
    </GridItem>

    <GridItem area="reach" mt={{ base: 12, lg: 0 }} sx={railItemSx}>
      <SectionHead title="Need a faster reply?" />
      <Text mt={-2} mb={4} fontSize="15px" lineHeight="1.7" color="gray.600">
        Reach out to me directly.
      </Text>
      <VStack as="ul" spacing={2.5} align="stretch" m={0} sx={{ listStyle: 'none' }}>
        {CHANNELS.map((c) => (
          <Box as="li" key={c.label}>
            <Flex
              as="a"
              href={c.href}
              onClick={() => onChannelClick?.(c.label)}
              {...(c.href.startsWith('http') ? { target: '_blank', rel: 'noopener' } : {})}
              align="center"
              px={4}
              py={3}
              bg="white"
              border="1px solid"
              borderColor="brand.accentBorder"
              borderLeft="3px solid"
              borderLeftColor="brand.accent"
              transition="background 0.2s, border-color 0.2s"
              _hover={{ bg: 'brand.surfaceSunken', borderColor: 'brand.accent' }}
            >
              {/* Label left, value hard right. Stacked, these rows were mostly
                  empty air on a phone. */}
              <Flex flex={1} align="baseline" justify="space-between" gap={3.5} minW={0}>
                <Text
                  fontSize="11px"
                  letterSpacing="0.15em"
                  textTransform="uppercase"
                  color="gray.800"
                  whiteSpace="nowrap"
                >
                  {c.label}
                </Text>
                <Text fontSize="14px" color="gray.600" textAlign="right" sx={{ overflowWrap: 'anywhere' }}>
                  {c.value}
                </Text>
              </Flex>
            </Flex>
          </Box>
        ))}
      </VStack>
    </GridItem>
  </>
);

export default ContactRail;
