import { useState, useEffect } from 'react';
import { Box, Text, Flex, VStack, HStack, Link, Icon } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { FaGoogle, FaStar } from 'react-icons/fa';

const MotionDiv = motion.div;

const GOOGLE_PROFILE_URL = 'https://g.page/r/CSNq8ccyWt_wEAE';
const GOOGLE_WRITE_REVIEW_URL = 'https://g.page/r/CSNq8ccyWt_wEAE/review';
const RATING = '5.0';
const REVIEW_COUNT = 19;

const TESTIMONIAL_POOL = [
  {
    name: 'Kimberly Diotte',
    quote:
      'Veronika was the absolute best photographer we could have asked for on our wedding day. Her confidence and creativity put you completely at ease — you just trust her. Our photos are something we will treasure forever.',
  },
  {
    name: 'Polina Korchagina',
    quote:
      'All of them were very professional and beautiful. I printed and hanged her photos all over my house. Highly recommend her if you want your memorable events stay with you forever.',
  },
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
  {
    name: 'Ariadne Comulada',
    quote:
      'Vero is so amazing to work with. Very responsible and teamwork was amazing. You won’t regret hiring her! We did a destination wedding in Puerto Rico and it was amazing to work with her.',
  },
  {
    name: 'Robert Mwandia',
    quote:
      'Had an amazing experience shooting with Vero in the Dominican Republic. Super professional, made everything feel natural, and absolutely nailed the vision. The photos came out incredible, and the drone footage took everything to another level. Highly recommend if you want quality content and a smooth experience from start to finish.',
  },
  {
    name: 'Angelina Rodau',
    quote:
      'Veronica has an incredible eye for photography, capturing beautiful moments with creativity and precision while always delivering stunning results. Thank you.',
  },
  {
    name: 'Tali Kipnis',
    quote:
      'Veronica is the best!! Thank you so much for capturing such beautiful moments of my special day. The guests also came up to me commenting how nice she is! Highly recommend.',
  },
];

const TESTIMONIALS_TO_DISPLAY = 2;

const FiveStars = ({ size = 3.5 }: { size?: number }) => (
  <HStack spacing={0.5}>
    {[0, 1, 2, 3, 4].map((i) => (
      <Icon as={FaStar} key={i} color="#fbbc04" boxSize={size} />
    ))}
  </HStack>
);

const GoogleReviewsSection = () => {
  const [testimonials, setTestimonials] = useState(
    TESTIMONIAL_POOL.slice(0, TESTIMONIALS_TO_DISPLAY)
  );

  useEffect(() => {
    const shuffled = [...TESTIMONIAL_POOL].sort(() => Math.random() - 0.5);
    setTestimonials(shuffled.slice(0, TESTIMONIALS_TO_DISPLAY));
  }, []);

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
                textDecoration="underline"
                textUnderlineOffset="4px"
                textDecorationColor="gray.400"
                transition="color 0.3s, text-decoration-color 0.3s"
                _groupHover={{
                  color: '#c9a96e',
                  textDecorationColor: '#c9a96e',
                }}
              >
                {RATING} · {REVIEW_COUNT} Reviews on Google →
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
          {testimonials.map((t) => (
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
