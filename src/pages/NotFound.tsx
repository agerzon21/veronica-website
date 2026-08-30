import { Box, VStack, Text, Flex } from '@chakra-ui/react';
import CTAButton from '../components/ui/CTAButton';
import PageHeader from '../components/ui/PageHeader';
import { Helmet } from 'react-helmet-async';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';

const MotionDiv = motion.div;

const NotFound = () => {
  const contentRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(contentRef, { once: true, amount: 0.15 });

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
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
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
          </MotionDiv>
        </Box>
      </Flex>
    </Box>
  );
};

export default NotFound;
