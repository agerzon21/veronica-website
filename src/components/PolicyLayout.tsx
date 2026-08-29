import { Box, VStack, Text, Flex } from '@chakra-ui/react';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

/**
 * Shared page shell for legal / policy pages (/privacy, /terms, and any
 * future ones like a cookie policy). Keeps the two documents visually
 * identical so they read as one coherent legal surface — you'd never
 * want the Privacy Policy and Terms to look like they were built by
 * two different teams.
 *
 * Content structure the caller provides:
 *   <PolicyLayout title="..." kicker="Policy" effectiveDate="..." intro={...}>
 *     <PolicySection title="Section 1">
 *       <PolicyParagraph>...</PolicyParagraph>
 *     </PolicySection>
 *   </PolicyLayout>
 */

const MotionDiv = motion.div;

interface PolicyLayoutProps {
  title: string;
  // Small uppercase eyebrow above the title ("PRIVACY POLICY" /
  // "TERMS OF SERVICE").
  kicker: string;
  // ISO date the policy went into effect (rendered as "Month Day, Year").
  effectiveDate: string;
  // Optional lead paragraph rendered right below the header. Kept as a
  // ReactNode so callers can style bold spans / links inline.
  intro?: React.ReactNode;
  children: React.ReactNode;
}

const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const PolicyLayout = ({ title, kicker, effectiveDate, intro, children }: PolicyLayoutProps) => {
  const heroRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(heroRef, { once: true, amount: 0.2 });

  return (
    <Box minH="100vh" bg="white" pt={{ base: 20, md: 24 }} pb={{ base: 20, md: 28 }} px={4}>
      <Box maxW="720px" mx="auto">
        {/* Header */}
        <VStack ref={heroRef} spacing={4} mb={{ base: 10, md: 14 }} textAlign="center">
          <MotionDiv
            initial={{ opacity: 0, y: 12 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          >
            <Text
              fontSize="xs"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.3em"
              color="brand.accentText"
              mb={4}
            >
              {kicker}
            </Text>
            <Box w="40px" h="1px" bg="brand.accent" mx="auto" mb={6} />
            <Text
              as="h1"
              fontSize={{ base: '2xl', md: '4xl' }}
              fontWeight="200"
              color="gray.800"
              letterSpacing="0.02em"
              lineHeight="1.2"
              m={0}
              mb={3}
            >
              {title}
            </Text>
            <Text
              fontSize="xs"
              fontWeight="400"
              color="gray.500"
              letterSpacing="0.2em"
              textTransform="uppercase"
            >
              Effective {formatDate(effectiveDate)}
            </Text>
          </MotionDiv>
        </VStack>

        {/* Optional lead paragraph */}
        {intro && (
          <Box
            fontSize={{ base: 'sm', md: 'md' }}
            color="gray.700"
            fontWeight="300"
            lineHeight="1.9"
            mb={{ base: 10, md: 14 }}
            fontStyle="italic"
            borderLeft="2px solid"
            borderColor="brand.accent"
            pl={5}
          >
            {intro}
          </Box>
        )}

        {/* Sections */}
        <VStack spacing={{ base: 8, md: 12 }} align="stretch">
          {children}
        </VStack>

        {/* Footer note — every policy page ends with a "contact us" nudge
            so readers who have questions know exactly where to go. Kept
            simple gray so it doesn't try to compete with the site's
            actual Contact page. */}
        <Flex
          justify="center"
          align="center"
          gap={2}
          mt={{ base: 14, md: 20 }}
          pt={{ base: 10, md: 12 }}
          borderTop="1px solid"
          borderColor="gray.100"
        >
          <Text fontSize="xs" color="gray.500" fontWeight="300" textAlign="center">
            Questions? Email{' '}
            <Text
              as="a"
              href="mailto:vero@vero.photography"
              color="brand.accentText"
              fontWeight="400"
              textDecoration="underline"
            >
              vero@vero.photography
            </Text>
            .
          </Text>
        </Flex>
      </Box>
    </Box>
  );
};

/**
 * One numbered section within a policy document. Uses the same
 * uppercase-gold-kicker + underline treatment as the rest of the site
 * so it looks native to the codebase.
 */
export const PolicySection = ({
  title,
  children,
  id,
}: {
  title: string;
  children: React.ReactNode;
  // Optional anchor id so future "table of contents" links can jump
  // to a section. Not rendered visually.
  id?: string;
}) => (
  <Box id={id} sx={{ scrollMarginTop: '90px' }}>
    <Text
      as="h2"
      fontSize={{ base: 'lg', md: 'xl' }}
      fontWeight="300"
      color="gray.800"
      letterSpacing="0.02em"
      mb={4}
      pb={3}
      borderBottom="1px solid"
      borderColor="gray.100"
      m={0}
    >
      {title}
    </Text>
    <VStack spacing={3} align="stretch">
      {children}
    </VStack>
  </Box>
);

/**
 * Body paragraph — set the line-height + size once here so every
 * paragraph across every policy reads the same.
 */
export const P = ({ children }: { children: React.ReactNode }) => (
  <Text fontSize={{ base: 'sm', md: 'md' }} color="gray.700" fontWeight="300" lineHeight="1.9">
    {children}
  </Text>
);

/**
 * Bulleted list rendered underneath a paragraph. Uses gold dot markers
 * to match the site's accent color.
 */
export const PolicyList = ({ items }: { items: React.ReactNode[] }) => (
  <Box as="ul" pl={0} m={0} listStyleType="none">
    {items.map((item, i) => (
      <Flex key={i} as="li" align="flex-start" gap={3} mb={2}>
        <Box
          as="span"
          w="4px"
          h="4px"
          borderRadius="full"
          bg="brand.accent"
          mt={{ base: '10px', md: '12px' }}
          flexShrink={0}
        />
        <Text
          fontSize={{ base: 'sm', md: 'md' }}
          color="gray.700"
          fontWeight="300"
          lineHeight="1.9"
        >
          {item}
        </Text>
      </Flex>
    ))}
  </Box>
);

/**
 * Inline emphasis for defined terms ("Site", "Photographer", "Client").
 * Keeps the legal-doc convention of bolding the first mention of a
 * defined term.
 */
export const Term = ({ children }: { children: React.ReactNode }) => (
  <Text as="span" fontWeight="500" color="gray.800">
    {children}
  </Text>
);

export default PolicyLayout;
