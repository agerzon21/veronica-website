import { Box, VStack, Text, Flex, Image, SimpleGrid, Icon } from '@chakra-ui/react';
import FaMapMarkerAlt from '../icons/fa/FaMapMarkerAlt';
import FaCamera from '../icons/fa/FaCamera';
import FaGlobe from '../icons/fa/FaGlobe';
import { Helmet } from 'react-helmet-async';
import { m, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
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

/**
 * The three facts, as one line under the hero title (Alex picked S3).
 *
 * They used to close the page, which put the least interesting thing last and
 * made the story trail off into a table. At the top they are the page
 * introducing itself, and they cost no height: the hero already had room.
 *
 * Each carries its icon, and two of them say more than they used to — "12+
 * Years" and "Worldwide" were fragments that only made sense next to a label
 * column that no longer exists.
 */
const STATS = [
  { value: 'Scranton, PA', icon: FaMapMarkerAlt },
  // countTo drives the tick-up; suffix is everything the number is not, so
  // the line reads correctly at every frame of the count.
  { value: '12+ Years Experience', icon: FaCamera, countTo: 12, suffix: '+ Years Experience' },
  { value: 'Available Worldwide', icon: FaGlobe },
] as const;

/**
 * The years figure counts up once the band is on screen. Until it starts it
 * renders the real string, so a crawler, a JS-off visitor, or a headless
 * browser (where requestAnimationFrame never fires) all still read
 * "12+ Years" rather than "0+ Years".
 */
const COUNT_MS = 950;

const StatValue = ({
  value,
  countTo,
  suffix,
  play,
}: {
  value: string;
  countTo?: number;
  suffix?: string;
  play: boolean;
}) => {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    if (!play || countTo === undefined) return;
    let raf = 0;
    let start: number | null = null;
    const step = (t: number) => {
      if (start === null) start = t;
      const p = Math.min(1, (t - start) / COUNT_MS);
      // easeOutCubic — quick off the mark, settles rather than stopping dead.
      setN(Math.round(countTo * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // Backstop: if rAF never fires (headless Chrome does exactly this), the
    // figure still lands on its real value instead of sitting at zero.
    const settle = setTimeout(() => setN(countTo), COUNT_MS + 150);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
    };
  }, [play, countTo]);

  // Plain text: the caller owns the type, because this renders inside a line
  // whose styling belongs to the hero, not to the number.
  return <>{n === null ? value : `${n}${suffix ?? ''}`}</>;
};

/**
 * The line itself. Each fact rises out from behind its own mask a beat after
 * the one before, and the years tick up to twelve — the same arrival the band
 * had, at a size that belongs in a hero rather than a section.
 */
const HeroFacts = () => {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });

  return (
    <Flex
      ref={ref}
      mt={{ base: 4, md: 5 }}
      gap={{ base: 2.5, md: 4 }}
      align="center"
      justify={{ base: 'center', md: 'flex-start' }}
      wrap="wrap"
      rowGap={2}
    >
      {STATS.map((stat, i, arr) => (
        <Flex key={stat.value} align="center" gap={{ base: 2.5, md: 4 }}>
          <Box overflow="hidden">
            <MotionDiv
              initial={{ y: '115%' }}
              animate={inView ? { y: '0%' } : {}}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1], delay: 0.15 + i * 0.13 }}
            >
              <Flex align="center" gap={{ base: 1.5, md: 2 }}>
                <Icon as={stat.icon} boxSize={3} color="brand.accent" flex="none" />
                <Text
                  fontSize={{ base: '0.625rem', md: '0.6875rem' }}
                  fontWeight="400"
                  letterSpacing={{ base: '0.14em', md: '0.18em' }}
                  textTransform="uppercase"
                  color="whiteAlpha.900"
                  whiteSpace="nowrap"
                  sx={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  <StatValue
                    value={stat.value}
                    countTo={'countTo' in stat ? stat.countTo : undefined}
                    suffix={'suffix' in stat ? stat.suffix : undefined}
                    play={inView}
                  />
                </Text>
              </Flex>
            </MotionDiv>
          </Box>
          {/* A gold dot between, not a bullet character: it keeps its colour
              and its size independent of the type around it. */}
          {i < arr.length - 1 && (
            <MotionDiv
              initial={{ opacity: 0, scale: 0 }}
              animate={inView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.4, ease: 'easeOut', delay: 0.3 + i * 0.13 }}
            >
              <Box w="3px" h="3px" borderRadius="full" bg="brand.accent" />
            </MotionDiv>
          )}
        </Flex>
      ))}
    </Flex>
  );
};

const About = () => {
  const approachRef = useRef<HTMLDivElement>(null);
  const isApproachInView = useInView(approachRef, { once: true, amount: 0.15 });
  const angleRef = useRef<HTMLDivElement>(null);
  const isAngleInView = useInView(angleRef, { once: true, amount: 0.15 });

  return (
    <Box minH="100vh" overflowX="clip">
      <Helmet>
        <meta property="og:image" content="https://vero.photography/assets/photos/site/vero-camera.webp" />
      </Helmet>

      {/* ─── Hero: the camera portrait, full bleed. Anchored at 30% so the
          crop keeps her and the lens in frame on wide screens, and the
          gradient runs sideways so the heading has dark to sit on while
          the right side of the photograph stays open. ─── */}
      <Box position="relative" h={{ base: '45vh', md: '53vh' }} overflow="hidden">
        <Image
          src="/assets/photos/site/vero-camera.webp"
          alt="Veronika Gerzon kneeling on the grass with her camera."
          w="100%"
          h="100%"
          objectFit="cover"
          objectPosition={{ base: 'center 20%', md: 'center 32%' }}
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
            <HeroFacts />
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

                  {/* The button belongs to the paragraph that earned it, and
                      it is centred in the column rather than hung off the left
                      edge — the same arrangement repeats in the closing
                      section below, so the page has one rhythm. */}
                  <Flex w="100%" justify="center" pt={1}>
                    <CTAButton to="/gallery" variant="tab" size="sm">
                      See my work
                    </CTAButton>
                  </Flex>

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
                  <Flex w="100%" justify="center" pt={1}>
                    <CTAButton to="/journal" variant="tabMuted" size="sm">
                      Read the journal
                    </CTAButton>
                  </Flex>
                </VStack>
              </MotionDiv>
            </Box>
          </SimpleGrid>
        </Box>
      </Box>

      {/* ─── Closing section: the floor shot, the invitation and the facts
          in ONE block. It was three — the angle story, a stats strip, and a
          lone CTA — and the page trailed off through all of them. This is
          the same shape as the section above it: photograph on one side, two
          eyebrow blocks separated by a hairline on the other, and the pair
          of buttons at the end. The facts sit underneath as a footing rather
          than as their own band. ─── */}
      <Box
        bg="brand.surface"
        borderTop="1px solid"
        borderColor="brand.accentBorder"
        py={{ base: 16, md: 24 }}
        px={{ base: 6, md: 12 }}
        ref={angleRef}
      >
        <Box maxW="1100px" mx="auto">
          <SimpleGrid
            columns={{ base: 1, lg: 2 }}
            spacing={{ base: 10, lg: 16 }}
            w="100%"
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

                <Flex w="100%" justify="center" pt={1}>
                  <CTAButton to="/wedding-photography" variant="tab" size="sm">
                    Wedding coverage
                  </CTAButton>
                </Flex>

                {/* Same hairline the section above uses to turn one column
                    into two thoughts. */}
                <Box w="100%" h="1px" bg="brand.accentBorder" my={{ base: 2, md: 3 }} />

                <Text textStyle="eyebrow">Your Turn</Text>
                <Text
                  fontFamily="heading"
                  fontWeight="300"
                  fontStyle="italic"
                  fontSize={{ base: '1.3rem', md: '1.6rem' }}
                  lineHeight="1.5"
                  color="gray.800"
                >
                  Have a session in mind? I&apos;d love to hear about it.
                </Text>
                <Flex w="100%" justify="center" pt={1}>
                  <CTAButton to="/contact" variant="tabMuted" size="sm">
                    Book a session
                  </CTAButton>
                </Flex>

              </VStack>
            </MotionDiv>
          </SimpleGrid>
        </Box>
      </Box>

    </Box>
  );
};

export default About;
