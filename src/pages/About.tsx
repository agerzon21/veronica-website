import { Box, VStack, HStack, Text, Flex, Image, SimpleGrid, Icon } from '@chakra-ui/react';
import FaMapMarkerAlt from '../icons/fa/FaMapMarkerAlt';
import FaCamera from '../icons/fa/FaCamera';
import FaGlobe from '../icons/fa/FaGlobe';
import { Helmet } from 'react-helmet-async';
import { m, useInView } from 'framer-motion';
import { useRef } from 'react';
import CTAButton from '../components/ui/CTAButton';
import PageHeader from '../components/ui/PageHeader';

const MotionDiv = m.div;

/**
 * The About page — editorial spread (Alex picked option 1 of five mocks).
 *
 * ONE LAYOUT, NOT TWO. The old page hand-built a mobile stack and a
 * desktop split as separate trees, which meant every copy edit had to be
 * made twice and two <h1>s shipped on every render. This is a single
 * responsive column order: hero, approach, the floor shot, the modeling
 * story, details, CTA.
 *
 * EVERY PHOTOGRAPH HERE IS PORTRAIT (checked: 1600x2400, 3033x4360,
 * 3808x5712). They are framed accordingly — the only full-bleed use is
 * the hero, which is deliberately anchored high so the subject survives
 * the landscape crop; everywhere else they sit in portrait frames that
 * respect the original shape.
 */

const FADE_IN = { duration: 0.75, ease: 'easeOut' } as const;

const About = () => {
  const approachRef = useRef<HTMLDivElement>(null);
  const isApproachInView = useInView(approachRef, { once: true, amount: 0.15 });
  const angleRef = useRef<HTMLDivElement>(null);
  const isAngleInView = useInView(angleRef, { once: true, amount: 0.15 });
  const ctaRef = useRef<HTMLDivElement>(null);
  const isCtaInView = useInView(ctaRef, { once: true, amount: 0.3 });

  return (
    <Box minH="100vh" overflowX="clip">
      <Helmet>
        <meta property="og:image" content="https://vero.photography/assets/photos/site/vero-camera.webp" />
      </Helmet>

      {/* ─── Hero: the camera portrait, full bleed. Anchored at 30% so the
          crop keeps her and the lens in frame on wide screens, and the
          gradient runs sideways so the heading has dark to sit on while
          the right side of the photograph stays open. ─── */}
      <Box position="relative" h={{ base: '50vh', md: '59vh' }} overflow="hidden">
        <Image
          src="/assets/photos/site/vero-camera.webp"
          alt="Veronika Gerzon kneeling on the grass with her camera."
          w="100%"
          h="100%"
          objectFit="cover"
          objectPosition={{ base: 'center 20%', md: 'center 22%' }}
          fetchPriority="high"
        />
        <Box
          position="absolute"
          inset={0}
          bg={{
            base: 'rgba(10,8,5,0.48)',
            md: 'linear-gradient(90deg, rgba(10,8,5,0.68) 0%, rgba(10,8,5,0.34) 55%, rgba(10,8,5,0.08) 100%)',
          }}
        />
        <Flex
          position="absolute"
          inset={0}
          align="center"
          justify={{ base: 'center', md: 'flex-start' }}
          px={{ base: 6, md: '7vw' }}
          pt={{ base: '64px', md: '72px' }}
        >
          <Box maxW={{ base: '520px', md: '620px' }} textAlign={{ base: 'center', md: 'left' }}>
            <PageHeader
              onDark
              align="left"
              eyebrow="About Me"
              title={
                <>
                  Creating images that feel as natural as the moment itself.
                </>
              }
            />
          </Box>
        </Flex>
      </Box>

      {/* ─── Who she is: approach and the modeling story as ONE section.
          Two portraits offset against each other on cream, the quote
          bridging them. Four sections was one too many (Alex). ─── */}
      <Box bg="white" py={{ base: 16, md: 24 }} px={{ base: 6, md: 12 }} position="relative">
        <Box maxW="1150px" mx="auto" ref={approachRef}>
          <SimpleGrid columns={{ base: 1, lg: 12 }} spacing={{ base: 10, lg: 14 }} alignItems="center">
            {/* Offset portrait pair */}
            <Box gridColumn={{ lg: 'span 5' }} position="relative" pb={{ lg: 14 }}>
              <Box aspectRatio={3 / 4} overflow="hidden" borderRadius="sm" bg="brand.surface">
                <Image
                  src="/assets/photos/site/vero-portrait-tulips.webp"
                  alt="Portrait of Veronika Gerzon in a field of tulips."
                  w="100%"
                  h="100%"
                  objectFit="cover"
                  objectPosition="center 55%"
                  loading="lazy"
                />
              </Box>
              {/* The artistic frame overlaps the corner of the first, which
                  is the whole point of the pairing: the photographer and
                  the subject in one composition. */}
              <Box
                display={{ base: 'none', lg: 'block' }}
                position="absolute"
                right="-14%"
                bottom="0"
                w="52%"
                aspectRatio={2 / 3}
                overflow="hidden"
                borderRadius="sm"
                bg="blackAlpha.700"
                boxShadow="0 26px 60px -30px rgba(20, 15, 5, 0.6)"
                border="6px solid white"
              >
                <Image
                  src="/assets/photos/site/vero-art.webp"
                  alt="Silhouette of Veronika Gerzon behind layers of backlit fabric."
                  w="100%"
                  h="100%"
                  objectFit="cover"
                  loading="lazy"
                />
              </Box>
            </Box>

            <Box gridColumn={{ lg: 'span 7' }} pl={{ lg: 16 }}>
              <MotionDiv
                initial={{ opacity: 0, y: 24 }}
                animate={isApproachInView ? { opacity: 1, y: 0 } : {}}
                transition={FADE_IN}
              >
                <VStack align="flex-start" spacing={5}>
                  <Text textStyle="eyebrow">My Approach</Text>
                  <Box w="35px" h="1px" bg="brand.accent" />
                  <Text
                    fontFamily="heading"
                    fontWeight="300"
                    fontSize={{ base: '1.5rem', md: '2rem' }}
                    lineHeight="1.4"
                    color="gray.800"
                  >
                    The best photographs come from an easy room,{' '}
                    <Box as="em" fontStyle="italic" color="brand.accentText">
                      never a forced smile.
                    </Box>
                  </Text>
                  <Text textStyle="bodyCopy">
                    Every session starts with understanding your vision. Whether it's a
                    wedding, portrait, editorial, or commercial project, I focus on capturing
                    authentic moments and genuine emotion, so you look at your photos and feel
                    exactly what you felt that day.
                  </Text>

                  <Box w="100%" h="1px" bg="brand.accentBorder" my={{ base: 2, md: 3 }} />

                  <Text textStyle="eyebrow">A Unique Perspective</Text>
                  <Text
                    fontFamily="heading"
                    fontStyle="italic"
                    fontWeight="300"
                    fontSize={{ base: '1.3rem', md: '1.6rem' }}
                    lineHeight="1.5"
                    color="gray.800"
                  >
                    "Having been on both sides of the camera gives me an understanding that
                    most photographers simply don't have."
                  </Text>
                  {/* The artistic frame rides beside the quote on phones,
                      where the overlap treatment has no room. */}
                  <Box
                    display={{ base: 'block', lg: 'none' }}
                    w="100%"
                    aspectRatio={3 / 2}
                    overflow="hidden"
                    borderRadius="sm"
                    bg="blackAlpha.700"
                  >
                    <Image
                      src="/assets/photos/site/vero-art.webp"
                      alt="Silhouette of Veronika Gerzon behind layers of backlit fabric."
                      w="100%"
                      h="100%"
                      objectFit="cover"
                      objectPosition="center 40%"
                      loading="lazy"
                    />
                  </Box>
                  <Text textStyle="bodyCopy">
                    Before picking up a camera, I spent years working as a model. That
                    experience taught me how it feels to be directed, what makes a subject
                    comfortable, and how small adjustments in posing and light transform an
                    image. I know how to guide you naturally because I have been in your shoes.
                  </Text>
                  <HStack spacing={4} flexWrap="wrap" pt={1}>
                    <CTAButton to="/gallery" variant="outline" size="sm">
                      See my work
                    </CTAButton>
                    <CTAButton to="/journal" variant="ghost" size="sm">
                      Read the journal
                    </CTAButton>
                  </HStack>
                </VStack>
              </MotionDiv>
            </Box>
          </SimpleGrid>
        </Box>
      </Box>

      {/* ─── Whatever the angle asks for: the floor shot ─── */}
      <Box bg="brand.surface" py={{ base: 16, md: 24 }} px={{ base: 6, md: 12 }}>
        <SimpleGrid
          ref={angleRef}
          columns={{ base: 1, lg: 2 }}
          spacing={{ base: 10, lg: 16 }}
          maxW="1100px"
          mx="auto"
          alignItems="center"
        >
          <Box aspectRatio={4 / 5} overflow="hidden" borderRadius="sm" bg="white">
            <Image
              src="/assets/photos/site/about-bg.webp"
              alt="Veronika Gerzon lying on a dance floor to photograph guests dancing above her."
              w="100%"
              h="100%"
              objectFit="cover"
              objectPosition="center 62%"
              loading="lazy"
            />
          </Box>
          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            animate={isAngleInView ? { opacity: 1, y: 0 } : {}}
            transition={FADE_IN}
          >
            <VStack align="flex-start" spacing={5}>
              <Text textStyle="eyebrow">Whatever the Angle Asks For</Text>
              <Box w="35px" h="1px" bg="brand.accent" />
              <Text
                fontFamily="heading"
                fontWeight="300"
                fontSize={{ base: '1.5rem', md: '1.95rem' }}
                lineHeight="1.45"
                color="gray.800"
              >
                If the shot is on the floor,{' '}
                <Box as="em" fontStyle="italic" color="brand.accentText">
                  that is where I will be.
                </Box>
              </Text>
              <Text textStyle="bodyCopy">
                Flat on the dance floor at midnight, knee deep in a field, up on a chair for
                the one frame that shows the whole room. The picture decides where I stand,
                and I have never been precious about my dress.
              </Text>
              <HStack spacing={4} flexWrap="wrap" pt={1}>
                <CTAButton to="/wedding-photography" variant="outline" size="sm">
                  Wedding coverage
                </CTAButton>
              </HStack>
            </VStack>
          </MotionDiv>
        </SimpleGrid>
      </Box>

      {/* ─── Closing band: the details and the invitation in one dark
          block, so the page ends on black straight into the footer
          instead of trailing off through two pale strips. Icons match
          the ones the homepage hero used to carry. ─── */}
      <Box bg="#141414" py={{ base: 16, md: 22 }} px={{ base: 6, md: 12 }} ref={ctaRef}>
        <MotionDiv
          initial={{ opacity: 0, y: 22 }}
          animate={isCtaInView ? { opacity: 1, y: 0 } : {}}
          transition={FADE_IN}
        >
          <VStack spacing={{ base: 10, md: 12 }} maxW="1000px" mx="auto">
            <Flex
              gap={{ base: 8, md: 16 }}
              direction={{ base: 'column', sm: 'row' }}
              align="center"
              justify="center"
              w="100%"
            >
              {[
                { label: 'Based in', value: 'Scranton, PA', icon: FaMapMarkerAlt },
                { label: 'Experience', value: '12+ Years', icon: FaCamera },
                { label: 'Available', value: 'Worldwide', icon: FaGlobe },
              ].map((stat, i, arr) => (
                <Flex key={stat.label} align="center" gap={{ base: 8, md: 16 }}>
                  <VStack spacing={2} minW={{ base: '120px', md: '140px' }}>
                    <Icon as={stat.icon} boxSize={4} color="brand.accent" />
                    <Text textStyle="metaCaption" color="whiteAlpha.700">
                      {stat.label}
                    </Text>
                    <Text textStyle="cardTitle" color="white">
                      {stat.value}
                    </Text>
                  </VStack>
                  {i < arr.length - 1 && (
                    <Box display={{ base: 'none', sm: 'block' }} w="1px" h="50px" bg="brand.accent" opacity={0.3} />
                  )}
                </Flex>
              ))}
            </Flex>

            <VStack spacing={5} textAlign="center">
              <Text
                fontFamily="heading"
                fontWeight="300"
                fontStyle="italic"
                fontSize={{ base: '1.4rem', md: '1.8rem' }}
                color="white"
                lineHeight="1.6"
              >
                Have a session in mind? I'd love to hear about it.
              </Text>
              <CTAButton to="/contact" variant="solid" size="lg">
                Book a Session
              </CTAButton>
            </VStack>
          </VStack>
        </MotionDiv>
      </Box>
    </Box>
  );
};

export default About;
