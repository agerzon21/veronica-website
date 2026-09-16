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
export const SectionHead = ({
  title,
  required,
  // The progress square that closes off a FORM section's rule. The rail's own
  // headings never had one in the approved design, so it is opt-in.
  square,
  active,
}: {
  title: string;
  required?: boolean;
  square?: boolean;
  active?: boolean;
}) => (
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
        // aria-hidden because a screen reader otherwise reads the glyph out as
        // "star". The control itself carries aria-required, which is what
        // actually conveys this.
        <Text as="span" color="red.600" fontWeight="500" aria-hidden="true">
          {' *'}
        </Text>
      )}
    </Text>
    <Box flex={1} h="1px" bg="brand.accentBorder" />
    {square && (
      <Box
        flex="none"
        w="7px"
        h="7px"
        border="1px solid"
        borderColor="brand.accent"
        bg={active ? 'brand.accent' : 'transparent'}
        transition="background 0.3s"
        aria-hidden="true"
      />
    )}
  </Flex>
);

/**
 * The channel marks. Drawn here rather than pulled from an icon set so the
 * stroke weight matches the prototype's line work exactly, and painted in
 * currentColor so the row tints them with the same gold as the rest of the
 * rail. Without these the three rows read as a plain list and the channel is
 * not identifiable at a glance.
 */
const markProps = {
  as: 'svg' as const,
  flex: 'none',
  w: '18px',
  h: '18px',
  viewBox: '0 0 20 20',
  'aria-hidden': true,
  color: 'brand.accentText',
};

const IconEmail = () => (
  <Box {...markProps}>
    <rect x="2" y="4.5" width="16" height="11" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <path d="M2.6 5.2 10 11l7.4-5.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
  </Box>
);

const IconWhatsApp = () => (
  <Box {...markProps}>
    <path
      d="M10 2.4a7.6 7.6 0 0 0-6.5 11.5l-1 3.7 3.8-1A7.6 7.6 0 1 0 10 2.4z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
    />
  </Box>
);

const IconInstagram = () => (
  <Box {...markProps}>
    <rect x="2.5" y="2.5" width="15" height="15" rx="4" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="10" cy="10" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
    <circle cx="14.4" cy="5.6" r=".9" fill="currentColor" />
  </Box>
);

const CHANNELS = [
  {
    label: 'Email',
    value: 'vero@vero.photography',
    href: 'mailto:vero@vero.photography?subject=Photography%20Inquiry',
    icon: IconEmail,
  },
  {
    label: 'WhatsApp',
    value: '+1 (570) 909-5707',
    href: 'https://wa.me/15709095707',
    icon: IconWhatsApp,
  },
  {
    label: 'Instagram',
    value: '@vero.art.photo',
    href: 'https://www.instagram.com/vero.art.photo',
    icon: IconInstagram,
  },
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
      <Text mt={4} fontSize="15px" lineHeight="1.7" color="brand.mutedText">
        Once both are done, the date is yours.
      </Text>
    </GridItem>

    <GridItem area="reach" mt={{ base: 12, lg: 0 }} sx={railItemSx}>
      <SectionHead title="Need a faster reply?" />
      <Text mt={-2} mb={4} fontSize="15px" lineHeight="1.7" color="brand.mutedText">
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
              gap={3.5}
              px={4}
              py={3}
              bg="white"
              border="1px solid"
              borderColor="brand.accentBorder"
              borderLeft="3px solid"
              borderLeftColor="brand.accent"
              transition="background 0.2s, border-color 0.2s"
              _hover={{ bg: 'brand.surfaceSunken', borderColor: 'brand.accent' }}
              // Keyboard visitors were getting the browser's default ring here
              // rather than the gold one the rest of the page uses.
              _focusVisible={{
                outline: '2px solid',
                outlineColor: 'brand.accentText',
                outlineOffset: '2px',
              }}
            >
              <c.icon />
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
                <Text fontSize="14px" color="brand.mutedText" textAlign="right" sx={{ overflowWrap: 'anywhere' }}>
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
