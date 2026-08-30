import { Box, VStack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * The one page header. Eyebrow → rule → title → lead.
 *
 * There was a PageHeader before this one, at src/components/PageHeader.tsx,
 * with zero imports — an earlier attempt at this that never got adopted. It is
 * deleted; this replaces it and is actually wired up.
 *
 * WHY IT EXISTS
 * Ten public pages each hand-rolled this block. The eyebrow appeared at four
 * letter-spacings and four sizes; the title was uppercase-tracked on Contact,
 * sentence case on Journal, a third ramp on Gallery, and hidden offscreen on
 * About. The 1px gold rule was 40px wide on nine pages and 35px on eleven —
 * and sat ABOVE the title on five, BELOW it on three.
 *
 * THE RULE GOES ABOVE THE TITLE, always, directly under the eyebrow, so it
 * reads as the eyebrow's underline. That is the arrangement Alex singled out on
 * Journal as the one that looked right.
 *
 * ON DARK
 * `onDark` switches the eyebrow to the light gold and the text to white. It is
 * a single flag rather than colour props because every page that got to pick
 * its own colours is how the drift started.
 */

interface PageHeaderProps {
  /** Small gold label above the rule. Optional — 404 has none. */
  eyebrow?: string;
  /** The h1. Sentence case; the token never uppercases it. */
  title: ReactNode;
  /** One paragraph under the title. Optional. */
  lead?: ReactNode;
  /** Over a photograph or dark panel. */
  onDark?: boolean;
  /** Left-aligns instead of centring. Gallery category headers use this. */
  align?: 'center' | 'left';
  /** Render the title as something other than h1 — item pages that already have one. */
  as?: 'h1' | 'h2' | 'p';
  /** Step down to contentTitle: journal posts, policies, photo pages. */
  size?: 'page' | 'content';
  children?: ReactNode;
}

const PageHeader = ({
  eyebrow,
  title,
  lead,
  onDark = false,
  align = 'center',
  as = 'h1',
  size = 'page',
  children,
}: PageHeaderProps) => {
  const centred = align === 'center';
  return (
    <VStack
      spacing={{ base: 4, md: 5 }}
      align={centred ? 'center' : 'flex-start'}
      textAlign={centred ? 'center' : 'left'}
      w="100%"
    >
      {eyebrow && <Text textStyle={onDark ? 'eyebrowOnDark' : 'eyebrow'}>{eyebrow}</Text>}

      {/* One width, one placement. Not a per-page decision any more. */}
      <Box w="40px" h="1px" bg="brand.accent" />

      <Text
        as={as}
        textStyle={size === 'page' ? 'pageTitle' : 'contentTitle'}
        color={onDark ? 'white' : undefined}
        // ch rather than px: the measure should follow the type size, and this
        // replaces six different pixel widths that were all approximating it.
        maxW={size === 'page' ? '18ch' : '24ch'}
        m={0}
        sx={{ textWrap: 'balance' }}
      >
        {title}
      </Text>

      {lead && (
        <Text
          textStyle="bodyLead"
          color={onDark ? 'whiteAlpha.800' : undefined}
          maxW="46ch"
        >
          {lead}
        </Text>
      )}

      {children}
    </VStack>
  );
};

export default PageHeader;
