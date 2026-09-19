import { Box, VStack, Text, Flex } from '@chakra-ui/react';
import CTAButton from '../components/ui/CTAButton';
import PageHeader from '../components/ui/PageHeader';
import { Helmet } from 'react-helmet-async';
import Reveal, { useReveal } from '../components/ui/Reveal';

const NotFound = () => {
  // 'some', not a fraction. See the note on the contact page. The observer
  // stays on the Box below, the element it has always measured.
  const { ref: contentRef, shown } = useReveal({ amount: 'some' });

  return (
    <Box minH="100vh" bg="white">
      <Helmet>
        <title>Page Not Found - Vero Photography</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <Flex
        minH="100vh"
        align="center"
        justify="center"
        px={6}
      >
        <Box ref={contentRef} w="100%" maxW="measure">
          <Reveal shown={shown} from={{ opacity: 0, y: 20 }} duration={0.8}>
            <VStack spacing={8}>
              {/* The numeral is decoration, not the heading — aria-hidden so a
                  screen reader gets "Page not found", not "four hundred four". */}
              <Text textStyle="pageTitle" color="gray.200" aria-hidden="true">
                404
              </Text>

              {/* Same eyebrow-less header block every other page uses — the
                  rule sits above the title, not under it. */}
              <PageHeader
                size="content"
                title="Page not found"
                lead="The page you're looking for doesn't exist or has been moved."
              />

              <Flex gap={4} direction={{ base: 'column', sm: 'row' }}>
                <CTAButton to="/" variant="solid">Go Home</CTAButton>
                <CTAButton to="/gallery">View Gallery</CTAButton>
              </Flex>
            </VStack>
          </Reveal>
        </Box>
      </Flex>
    </Box>
  );
};

export default NotFound;
