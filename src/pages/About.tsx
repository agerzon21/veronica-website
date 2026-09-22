import { Box, VStack, Text, Flex, Image, Icon, Grid, GridItem } from '@chakra-ui/react';
import FaMapMarkerAlt from '../icons/fa/FaMapMarkerAlt';
import FaCamera from '../icons/fa/FaCamera';
import FaGlobe from '../icons/fa/FaGlobe';
import { Helmet } from 'react-helmet-async';
import { m, useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import CTAButton from '../components/ui/CTAButton';
import PageHeader from '../components/ui/PageHeader';
import Reveal, { useReveal } from '../components/ui/Reveal';

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
 * 3808x5712, and vero-ceremony-lawn at 960x1440). They are framed
 * accordingly — the only full-bleed use is the hero, which is deliberately
 * anchored high so the subject survives the landscape crop; everywhere else
 * they sit in portrait frames that respect the original shape.
 *
 * PHONES (below lg) got their own arrangement in 2026-09 (Alex picked "H" of
 * seven mocks): the first block of text is a white card that rides up over
 * the bottom of the hero, so the first screen shows words and a card cut off
 * by the screen edge, which is what says "keep scrolling". Each section's two
 * portraits then sit side by side (PortraitPair). Desktop keeps its layout;
 * only its buttons and the fourth photograph changed.
 */

/**
 * The one duration every section reveal on this page shares. It used to be a
 * whole transition object; the easing in it was 'easeOut', which is Reveal's
 * default, so only the number is left.
 */
const FADE_IN_SEC = 0.75;

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

/**
 * The three small photos on each button. They come from the wedding collage
 * Drive folder: its portrait frames were the only ones that fit the 2:3 slots
 * without heavy cropping, and the twelve were then chosen by eye
 * (2026-09-17). Local files, 96x144, so the buttons do not wait on Drive.
 */
const tabThumbs = (key: 'work' | 'journal' | 'wedding' | 'book') =>
  [1, 2, 3].map((n) => `/assets/photos/site/about-tabs/about-tab-${key}-${n}.webp`);

interface Frame {
  src: string;
  alt: string;
  position?: string;
}

/**
 * One section's two portraits.
 *
 * Phones: side by side, the second dropped lower. The label that opens the
 * text below is tucked into the gap that leaves under the first photo (Alex,
 * 2026-09-17), so the pair reads as the start of a section rather than a
 * wall of photographs, and there are words on screen sooner.
 *
 * Desktop (lg): the same two frames become the overlapping pair. The first
 * fills the column; the second rides over one of its bottom corners in a
 * white border, the photographer and the subject in one composition. Which
 * corner is per section: the dance floor shot has Vero lying in its bottom
 * right, so its inset takes the bottom left instead (Alex, 2026-09-17).
 *
 * `tuck` repeats a label the text column shows on desktop. Each copy is
 * display:none at the other size, so a screen reader meets it once.
 */
const PortraitPair = ({
  main,
  mainRatio,
  inset,
  insetSide,
  insetHang,
  tuck,
}: {
  main: Frame;
  mainRatio: number | Record<string, number>;
  inset: Frame;
  // Which bottom corner the inset covers on desktop, and how far it hangs
  // past the column there (negative).
  insetSide: 'left' | 'right';
  insetHang: string;
  tuck: React.ReactNode;
}) => (
  <Box
    display={{ base: 'grid', lg: 'block' }}
    gridTemplateColumns="1fr 1fr"
    // auto 1fr, not auto auto: the tall right photo spans both rows, and with
    // two auto rows the grid shares its extra height between them, which
    // pushed the tucked label well below the left photo on wider phones.
    gridTemplateRows="auto 1fr"
    columnGap={3}
    rowGap="14px"
    alignItems="start"
    position="relative"
    pb={{ lg: 14 }}
  >
    <Box
      gridColumn={1}
      gridRow={1}
      aspectRatio={mainRatio}
      overflow="hidden"
      borderRadius="sm"
      bg="brand.surface"
    >
      <Image
        src={main.src}
        alt={main.alt}
        w="100%"
        h="100%"
        objectFit="cover"
        objectPosition={main.position ?? 'center'}
        loading="lazy"
      />
    </Box>
    <Box
      gridColumn={2}
      gridRow="1 / span 2"
      mt={{ base: '40px', lg: 0 }}
      position={{ base: 'relative', lg: 'absolute' }}
      {...(insetSide === 'right' ? { right: { lg: insetHang } } : { left: { lg: insetHang } })}
      bottom={{ lg: 0 }}
      w={{ lg: '52%' }}
      aspectRatio={2 / 3}
      overflow="hidden"
      borderRadius="sm"
      bg="blackAlpha.700"
      border={{ base: 'none', lg: '6px solid white' }}
      boxShadow={{ base: 'none', lg: '0 26px 60px -30px rgba(20, 15, 5, 0.6)' }}
    >
      <Image
        src={inset.src}
        alt={inset.alt}
        w="100%"
        h="100%"
        objectFit="cover"
        objectPosition={inset.position ?? 'center'}
        loading="lazy"
      />
    </Box>
    <Box gridColumn={1} gridRow={2} display={{ base: 'block', lg: 'none' }} minW={0}>
      {tuck}
    </Box>
  </Box>
);

// The tucked label wraps inside half a phone's width, so it needs a real
// line height; the eyebrow style's 1 is for single lines. It carries the same
// short gold rule as every other label on the page.
//
// h2, because it names the section it sits beside. Its lg-only twin further
// down carries the same words, but the two are display:none of each other, so
// only one is ever in the accessibility tree and the heading is never
// announced twice.
const TuckedEyebrow = ({ children }: { children: React.ReactNode }) => (
  <VStack align="flex-start" spacing={4}>
    <Text as="h2" textStyle="eyebrow" lineHeight="1.7">
      {children}
    </Text>
    <Box w="35px" h="1px" bg="brand.accent" />
  </VStack>
);

const About = () => {
  // amount 'some', not a fraction: these wrap whole sections, and a fraction
  // of a tall section can exceed a short screen, leaving the text invisible.
  // One observer per section, each still on the Box it has always measured, so
  // the two halves of a section arrive together rather than separately.
  const { ref: approachRef, shown: approachShown } = useReveal({ amount: 'some' });
  const { ref: angleRef, shown: angleShown } = useReveal({ amount: 'some' });

  return (
    <Box minH="100vh" overflowX="clip">
      <Helmet>
        <meta property="og:image" content="https://vero.photography/assets/photos/site/vero-camera.webp" />
      </Helmet>

      {/* ─── Hero: the camera portrait, full bleed. Anchored at 30% so the
          crop keeps her and the lens in frame on wide screens, and the
          gradient runs sideways so the heading has dark to sit on while
          the right side of the photograph stays open. ─── */}
      {/* Same 45vh / 53vh band every other page opens with (Alex wanted the
          heroes to match). Below lg the approach card overlaps its bottom
          44px, so the text is centred in the part the card leaves alone
          (the bottom padding); without that the card covered the facts line
          on short phones.
          The height is a MINIMUM with the text in flow: only where the text
          cannot fit (the smallest phones, 375x667 and below) does the hero
          grow past 45vh, instead of clipping its text. */}
      <Flex
        position="relative"
        minH={{ base: '45vh', md: '53vh' }}
        overflow="hidden"
      >
        <Image
          src="/assets/photos/site/vero-camera.webp"
          alt="Veronika Gerzon kneeling on the grass with her camera."
          position="absolute"
          inset={0}
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
          position="relative"
          flex="1"
          minW={0}
          align="center"
          justify={{ base: 'center', md: 'flex-start' }}
          px={{ base: 6, md: '7vw' }}
          pt={{ base: '64px', md: '72px' }}
          pb={{ base: '52px', lg: 0 }}
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
      </Flex>

      {/* ─── Who she is: approach and the modeling story as ONE section.
          Desktop: the portrait pair on the left, both blocks of text on the
          right, centred against it (the 1fr rows above and below take the
          slack). Phones reorder the same three pieces: the approach card
          first, over the hero, then the pair, then the modeling story. ─── */}
      <Box
        bg="white"
        pt={{ base: 0, lg: 24 }}
        pb={{ base: 16, md: 24 }}
        px={{ base: 6, md: 12 }}
        position="relative"
      >
        <Box maxW="1150px" mx="auto" ref={approachRef}>
          <Grid
            templateColumns={{ base: 'minmax(0, 1fr)', lg: '5fr 7fr' }}
            templateRows={{ lg: '1fr auto auto 1fr' }}
            columnGap={{ lg: 14 }}
          >
            {/* The approach. On phones this is the card: white, a gold top
                edge, pulled 44px up over the hero. */}
            <GridItem
              gridColumn={{ lg: 2 }}
              gridRow={{ base: 1, lg: 2 }}
              position="relative"
              zIndex={1}
              mt={{ base: '-44px', lg: 0 }}
              mx={{ base: -2, lg: 0 }}
              pl={{ base: 4, lg: 16 }}
              pr={{ base: 4, lg: 0 }}
              pt={{ base: 7, lg: 0 }}
              pb={{ base: 1, lg: 0 }}
              bg={{ base: 'white', lg: 'transparent' }}
              borderTop={{ base: '2px solid', lg: 'none' }}
              borderColor="brand.accent"
              boxShadow={{ base: '0 -18px 30px -22px rgba(10, 8, 5, 0.55)', lg: 'none' }}
            >
              <Reveal shown={approachShown} from={{ opacity: 0, y: 24 }} duration={FADE_IN_SEC}>
                <VStack align="flex-start" spacing={5}>
                  {/* The four section labels are the page's only headings
                      below the h1. eyebrow sets font-size, font-weight and
                      margin itself, which is every property a bare h2 would
                      otherwise inherit differently from a p. */}
                  <Text as="h2" textStyle="eyebrow">My Approach</Text>
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

                  {/* The button belongs to the paragraph that earned it. */}
                  <Box w="100%" pt={1}>
                    <CTAButton to="/gallery" variant="photoTab" thumbs={tabThumbs('work')}>
                      See my work
                    </CTAButton>
                  </Box>
                </VStack>
              </Reveal>
            </GridItem>

            {/* The pair. Second in the source as well as on screen, so a screen
                reader meets the card first; grid placement puts it in the left
                column on desktop. */}
            <GridItem
              gridColumn={{ lg: 1 }}
              gridRow={{ base: 2, lg: '1 / span 4' }}
              alignSelf={{ lg: 'center' }}
              mt={{ base: 10, lg: 0 }}
            >
              <PortraitPair
                main={{
                  src: '/assets/photos/site/vero-portrait-truck-tulips.webp',
                  alt: 'Veronika Gerzon seated on the roof of a vintage truck in a field of tulips.',
                  // 45%, not the 55% the previous photograph used. This one is
                  // an environmental frame rather than a tight portrait: the
                  // subject sits near the top and the tulips fill the bottom
                  // third, so the 3/4 box crops the sky above her hat at 55%.
                  position: 'center 45%',
                }}
                mainRatio={3 / 4}
                inset={{
                  src: '/assets/photos/site/vero-art.webp',
                  alt: 'Silhouette of Veronika Gerzon behind layers of backlit fabric.',
                  position: 'center 40%',
                }}
                insetSide="right"
                insetHang="-14%"
                tuck={<TuckedEyebrow>A Unique Perspective</TuckedEyebrow>}
              />
            </GridItem>

            {/* The modeling story. Its label is tucked beside the pair on
                phones, so here it only shows from lg up. */}
            <GridItem
              gridColumn={{ lg: 2 }}
              gridRow={{ base: 3, lg: 3 }}
              pl={{ lg: 16 }}
              mt={{ base: 5, lg: 5 }}
            >
              <Reveal shown={approachShown} from={{ opacity: 0, y: 24 }} duration={FADE_IN_SEC}>
                <VStack align="flex-start" spacing={5}>
                  <Box
                    display={{ base: 'none', lg: 'block' }}
                    w="100%"
                    h="1px"
                    bg="brand.accentBorder"
                    my={3}
                  />
                  <Text as="h2" textStyle="eyebrow" display={{ base: 'none', lg: 'block' }}>
                    A Unique Perspective
                  </Text>
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
                  <Text textStyle="bodyCopy">
                    Before picking up a camera, I spent years working as a model. That
                    experience taught me how it feels to be directed, what makes a subject
                    comfortable, and how small adjustments in posing and light transform an
                    image. I know how to guide you naturally because I have been in your shoes.
                  </Text>
                  <Box w="100%" pt={1}>
                    <CTAButton to="/journal" variant="photoTab" thumbs={tabThumbs('journal')}>
                      Read the journal
                    </CTAButton>
                  </Box>
                </VStack>
              </Reveal>
            </GridItem>
          </Grid>
        </Box>
      </Box>

      {/* ─── Closing section: the angle story, the floor shot and the
          ceremony-lawn portrait, then the invitation. On phones it mirrors the
          section above exactly (Alex, 2026-09-17): text and button, the pair
          with the next label tucked in, text and button. On desktop it keeps
          its old shape, the photographs on the left and both thoughts on the
          right, centred against them by the 1fr rows. The ceremony-lawn frame
          was added 2026-09-17 so the invitation has a photograph of its own. ─── */}
      <Box
        bg="brand.surface"
        borderTop="1px solid"
        borderColor="brand.accentBorder"
        py={{ base: 16, md: 24 }}
        px={{ base: 6, md: 12 }}
        ref={angleRef}
      >
        <Box maxW="1100px" mx="auto">
          <Grid
            templateColumns={{ base: 'minmax(0, 1fr)', lg: '1fr 1fr' }}
            templateRows={{ lg: '1fr auto auto 1fr' }}
            columnGap={{ lg: 16 }}
          >
            {/* The angle story. */}
            <GridItem gridColumn={{ lg: 2 }} gridRow={{ base: 1, lg: 2 }}>
              <Reveal shown={angleShown} from={{ opacity: 0, y: 24 }} duration={FADE_IN_SEC}>
                <VStack align="flex-start" spacing={5}>
                  <Text as="h2" textStyle="eyebrow">Whatever the Angle Asks For</Text>
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
                  <Box w="100%" pt={1}>
                    <CTAButton to="/wedding-photography" variant="photoTab" thumbs={tabThumbs('wedding')}>
                      Wedding coverage
                    </CTAButton>
                  </Box>
                </VStack>
              </Reveal>
            </GridItem>

            {/* The pair. Between the two thoughts on phones, the left column
                on desktop. */}
            <GridItem
              gridColumn={{ lg: 1 }}
              gridRow={{ base: 2, lg: '1 / span 4' }}
              alignSelf={{ lg: 'center' }}
              mt={{ base: 10, lg: 0 }}
            >
              <PortraitPair
                main={{
                  src: '/assets/photos/site/about-bg.webp',
                  alt: 'Veronika Gerzon lying on a dance floor to photograph guests dancing above her.',
                  position: 'center 62%',
                }}
                mainRatio={{ base: 3 / 4, lg: 4 / 5 }}
                inset={{
                  src: '/assets/photos/site/vero-ceremony-lawn.webp',
                  alt: 'Veronika Gerzon with her camera on the lawn before an outdoor ceremony.',
                  position: 'center 30%',
                }}
                // Bottom left: the bottom right is where Vero is lying in the
                // floor shot, and the lower left of that frame is floor and
                // the group's feet. 9% stays inside the page margin down to
                // 992px.
                insetSide="left"
                insetHang="-9%"
                tuck={<TuckedEyebrow>Your Turn</TuckedEyebrow>}
              />
            </GridItem>

            {/* The invitation. Its label is tucked beside the pair on phones,
                so here it only shows from lg up, after the same hairline the
                section above uses to turn one column into two thoughts. */}
            <GridItem gridColumn={{ lg: 2 }} gridRow={{ base: 3, lg: 3 }} mt={5}>
              <Reveal shown={angleShown} from={{ opacity: 0, y: 24 }} duration={FADE_IN_SEC}>
                <VStack align="flex-start" spacing={5}>
                  <Box
                    display={{ base: 'none', lg: 'block' }}
                    w="100%"
                    h="1px"
                    bg="brand.accentBorder"
                    my={3}
                  />
                  <Text as="h2" textStyle="eyebrow" display={{ base: 'none', lg: 'block' }}>
                    Your Turn
                  </Text>
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
                  {/* Same button as the other three, by request: the booking
                      link does not need to shout to be found. */}
                  <Box w="100%" pt={1}>
                    <CTAButton to="/contact" variant="photoTab" thumbs={tabThumbs('book')}>
                      Book a session
                    </CTAButton>
                  </Box>
                </VStack>
              </Reveal>
            </GridItem>
          </Grid>
        </Box>
      </Box>
    </Box>
  );
};

export default About;
