import { Box, VStack, HStack, Text, Flex, Image, SimpleGrid } from '@chakra-ui/react';
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
  const storyRef = useRef<HTMLDivElement>(null);
  const isStoryInView = useInView(storyRef, { once: true, amount: 0.15 });
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
      <Box position="relative" h={{ base: '62vh', md: '74vh' }} overflow="hidden">
        <Image
          src="/assets/photos/site/vero-camera.webp"
          alt="Veronika Gerzon kneeling on the grass with her camera."
          w="100%"
          h="100%"
          objectFit="cover"
          objectPosition={{ base: 'center 22%', md: 'center 30%' }}
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

      {/* ─── My Approach: words left, portrait right ─── */}
      <Box bg="white" py={{ base: 16, md: 24 }} px={{ base: 6, md: 12 }}>
        <SimpleGrid
          ref={approachRef}
          columns={{ base: 1, lg: 2 }}
          spacing={{ base: 10, lg: 16 }}
          maxW="1100px"
          mx="auto"
          alignItems="center"
        >
          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            animate={isApproachInView ? { opacity: 1, y: 0 } : {}}
            transition={FADE_IN}
          >
            <VStack align="flex-start" spacing={5}>
              <Text textStyle="eyebrow">My Approach</Text>
              <Box w="35px" h="1px" bg="brand.accent" />
              <Text
                textStyle="bodyCopy"
                sx={{
                  '&::first-letter': {
                    float: 'left',
                    fontFamily: 'heading',
                    fontSize: '3.4em',
                    lineHeight: '0.82',
                    pr: '0.12em',
                    color: 'gray.800',
                  },
                }}
              >
                Every session starts with understanding your vision. I believe the best
                photos come from a comfortable, collaborative environment, not stiff poses
                or forced smiles.
              </Text>
              <Text textStyle="bodyCopy">
                Whether it's a wedding, portrait, editorial, or commercial project, I focus
                on capturing authentic moments and genuine emotion. My goal is for you to
                look at your photos and feel exactly what you felt that day.
              </Text>
              <Text textStyle="bodyCopy">
                I bring patience, attention to detail, and a dedication to making every
                client feel confident and beautiful in front of the camera.
              </Text>
            </VStack>
          </MotionDiv>

          <Box
            aspectRatio={3 / 4}
            overflow="hidden"
            borderRadius="sm"
            bg="brand.surface"
            order={{ base: -1, lg: 0 }}
          >
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
        </SimpleGrid>
      </Box>

      {/* ─── Whatever the angle asks for: the floor shot. Alex wanted this
          one kept because it says something no posed portrait can. It is
          a tall portrait frame, never cropped to landscape. ─── */}
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
              <Text textStyle="bodyCopy">
                It is the same instinct behind every session: find the angle nobody else is
                looking for, and stay out of the way of the moment while doing it.
              </Text>
            </VStack>
          </MotionDiv>
        </SimpleGrid>
      </Box>

      {/* ─── A Unique Perspective: the modeling story, dark band ─── */}
      <Box bg="#141414" py={{ base: 18, md: 24 }} px={{ base: 6, md: 12 }}>
        <SimpleGrid
          ref={storyRef}
          columns={{ base: 1, lg: 12 }}
          spacing={{ base: 10, lg: 14 }}
          maxW="1000px"
          mx="auto"
          alignItems="center"
          py={{ base: 4, md: 6 }}
        >
          <Box gridColumn={{ lg: 'span 5' }} aspectRatio={2 / 3} overflow="hidden" borderRadius="sm" bg="blackAlpha.500">
            <Image
              src="/assets/photos/site/vero-art.webp"
              alt="Silhouette of Veronika Gerzon behind layers of backlit fabric."
              w="100%"
              h="100%"
              objectFit="cover"
              objectPosition="center"
              loading="lazy"
            />
          </Box>
          <Box gridColumn={{ lg: 'span 7' }}>
            <MotionDiv
              initial={{ opacity: 0, y: 24 }}
              animate={isStoryInView ? { opacity: 1, y: 0 } : {}}
              transition={FADE_IN}
            >
              <VStack align="flex-start" spacing={5}>
                <Text textStyle="eyebrowOnDark">A Unique Perspective</Text>
                <Box w="35px" h="1px" bg="brand.accent" />
                <Text
                  fontFamily="heading"
                  fontStyle="italic"
                  fontWeight="300"
                  fontSize={{ base: '1.45rem', md: '1.85rem' }}
                  lineHeight="1.5"
                  color="white"
                >
                  "Having been on both sides of the camera gives me an understanding that
                  most photographers simply don't have."
                </Text>
                <Text textStyle="bodyCopy" color="whiteAlpha.800">
                  Before picking up a camera, I spent years working as a model. That
                  experience taught me how it feels to be directed, what makes a subject
                  comfortable, and how small adjustments in posing and light can completely
                  transform an image.
                </Text>
                <Text textStyle="bodyCopy" color="whiteAlpha.800">
                  This dual perspective is my edge. I know how to guide you naturally because
                  I have been in your shoes, and the result is photography that feels
                  effortless, authentic, and truly you.
                </Text>
              </VStack>
            </MotionDiv>
          </Box>
        </SimpleGrid>
      </Box>

      {/* ─── Details bar ─── */}
      <Box bg="white" py={{ base: 12, md: 16 }}>
        <Flex
          justify="center"
          gap={{ base: 10, md: 20 }}
          direction={{ base: 'column', md: 'row' }}
          align="center"
          px={8}
        >
          {[
            { label: 'Based in', value: 'Scranton, PA' },
            { label: 'Experience', value: '12+ Years' },
            { label: 'Available', value: 'Worldwide' },
          ].map((stat) => (
            <VStack key={stat.label} spacing={1.5}>
              <Text textStyle="eyebrow">{stat.label}</Text>
              <Text textStyle="sectionTitle" color="gray.700">
                {stat.value}
              </Text>
            </VStack>
          ))}
        </Flex>
      </Box>

      {/* ─── Page-closing CTA ─── */}
      <Box bg="gray.50" py={{ base: 16, md: 20 }} px={6}>
        <Flex justify="center">
          <Box ref={ctaRef} textAlign="center" maxW="540px">
            <MotionDiv
              initial={{ opacity: 0, y: 20 }}
              animate={isCtaInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, ease: 'easeOut' }}
            >
              <VStack spacing={6}>
                <VStack spacing={3}>
                  <Text textStyle="eyebrow">Work With Me</Text>
                  <Box w="35px" h="1px" bg="brand.accent" />
                </VStack>
                <Text
                  fontSize={{ base: 'lg', md: 'xl' }}
                  color="gray.700"
                  fontWeight="200"
                  lineHeight="1.8"
                  fontStyle="italic"
                >
                  Have a session in mind? I'd love to hear about it.
                </Text>
                <HStack pt={2}>
                  <CTAButton to="/contact" variant="solid" size="lg">
                    Book a Session
                  </CTAButton>
                </HStack>
              </VStack>
            </MotionDiv>
          </Box>
        </Flex>
      </Box>
    </Box>
  );
};

export default About;
