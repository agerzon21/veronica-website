import { Box, Text, Flex, VStack, HStack, Link, Icon } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { FaGoogle, FaStar } from 'react-icons/fa';

const MotionDiv = motion.div;

const GOOGLE_PROFILE_URL = 'https://g.page/r/CSNq8ccyWt_wEAE';
const GOOGLE_WRITE_REVIEW_URL = 'https://g.page/r/CSNq8ccyWt_wEAE/review';
const RATING = '5.0';
const REVIEW_COUNT = 15;

const TESTIMONIALS = [
  {
    name: 'Lilia Petruk',
    quote:
      'I had a personal photo shoot. The photos are amazing and I felt Veronica saw my soul.',
  },
  {
    name: 'Kamila Muzaffarova',
    quote:
      'Veronica is very professional! It was a pleasure working with her. Highly recommended.',
  },
];

const FiveStars = ({ size = 3.5 }: { size?: number }) => (
  <HStack spacing={0.5}>
    {[0, 1, 2, 3, 4].map((i) => (
      <Icon as={FaStar} key={i} color="#fbbc04" boxSize={size} />
    ))}
  </HStack>
);

const GoogleReviewsSection = () => {
  return (
    <Box bg="white" pt={0} pb={{ base: 14, md: 16 }} px={6}>
      <MotionDiv
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Header */}
        <VStack spacing={6} mb={{ base: 12, md: 16 }} maxW="600px" mx="auto">
          <Text
            fontSize="xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.2em"
            color="#c9a96e"
          >
            Kind Words
          </Text>
          <Box w="35px" h="1px" bg="#c9a96e" />

          {/* Google rating badge — links to profile */}
          <Link
            href={GOOGLE_PROFILE_URL}
            isExternal
            _hover={{ textDecoration: 'none' }}
            role="group"
          >
            <HStack
              spacing={3}
              align="center"
              transition="all 0.3s"
              _groupHover={{ transform: 'translateY(-1px)' }}
            >
              <Icon as={FaGoogle} boxSize={4} color="gray.600" />
              <FiveStars />
              <Text
                fontSize="sm"
                fontWeight="300"
                color="gray.700"
                letterSpacing="0.05em"
                _groupHover={{ color: '#c9a96e' }}
                transition="color 0.3s"
              >
                {RATING} · {REVIEW_COUNT} Reviews on Google
              </Text>
            </HStack>
          </Link>
        </VStack>

        {/* Testimonial cards */}
        <Flex
          gap={{ base: 10, md: 14 }}
          maxW="1100px"
          mx="auto"
          direction={{ base: 'column', md: 'row' }}
          align="stretch"
        >
          {TESTIMONIALS.map((t) => (
            <VStack
              key={t.name}
              flex={1}
              spacing={6}
              px={{ base: 2, md: 6 }}
              align="start"
            >
              <FiveStars />
              <Text
                fontSize={{ base: 'md', md: 'lg' }}
                fontWeight="200"
                color="gray.700"
                fontStyle="italic"
                lineHeight="1.8"
              >
                “{t.quote}”
              </Text>
              <Text
                fontSize="xs"
                fontWeight="500"
                textTransform="uppercase"
                letterSpacing="0.2em"
                color="#c9a96e"
              >
                — {t.name}
              </Text>
            </VStack>
          ))}
        </Flex>

        {/* CTA — links to write-review URL */}
        <Flex justify="center" mt={{ base: 14, md: 20 }}>
          <Link
            href={GOOGLE_WRITE_REVIEW_URL}
            isExternal
            fontSize="xs"
            fontWeight="400"
            color="gray.700"
            textTransform="uppercase"
            letterSpacing="0.2em"
            display="inline-block"
            px={8}
            py={3}
            border="1px solid"
            borderColor="gray.300"
            transition="all 0.4s ease"
            _hover={{
              textDecoration: 'none',
              borderColor: '#c9a96e',
              color: '#c9a96e',
              transform: 'translateY(-2px)',
            }}
          >
            Leave a Review
          </Link>
        </Flex>
      </MotionDiv>
    </Box>
  );
};

export default GoogleReviewsSection;
