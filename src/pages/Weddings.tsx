import { Box, VStack, HStack, Text, Flex, Image, SimpleGrid } from '@chakra-ui/react';
import { Helmet } from 'react-helmet-async';
import { motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import CTAButton from '../components/ui/CTAButton';
import PageHeader from '../components/ui/PageHeader';

/**
 * The weddings page.
 *
 * WHY IT EXISTS WHEN /gallery/weddings ALREADY DOES
 * The gallery answers "is she good". This answers "will she work for MY
 * wedding, and what happens next". Wedding is 35% of all inquiries (8 of 23
 * over 90 days), and until now every one of those people had to type into a
 * blank contact box to learn anything about coverage, travel or delivery.
 *
 * WHY THERE ARE NO PACKAGES OR PRICES
 * Real range is a few hundred to several thousand, a few hours to several
 * days, local to a seven-hour drive. Publishing three tiers would be a lie and
 * would lose everyone who does not fit one. The flexibility IS the pitch, so
 * the page says that plainly and sends people to a quote.
 *
 * No photo counts anywhere, for the same reason — it genuinely varies.
 *
 * Images come from the 97 already-published wedding photos. Nothing new to
 * shoot or host, and the tiles link to their photo pages, which also gives
 * those pages real inbound links from a page that is not the gallery.
 */

const MotionDiv = motion.div;

/**
 * Hand-picked for range: ceremony, portrait, detail, celebration — so the grid
 * reads as "she covers a whole day", not four versions of the same shot.
 *
 * Inlined rather than imported from src/data/photos. That module imports
 * photos.csv?raw — 65KB — and pulling it in for six records made this route's
 * chunk 84KB. The gallery avoids the same trap by fetching from /api/gallery.
 * Six curated entries cost ~600 bytes and this is an editorial selection, not
 * a live listing, so it does not need to track the CSV.
 *
 * Slugs are the permanent URL identifiers for these photos, so they are stable —
 * but if one is ever renamed, this page's tile 404s. The build guards against
 * that: see the check in scripts/prerender-photos.mjs.
 */
const FEATURED: Array<{ id: string; alt: string }> = [
  { id: 'ocean-vows-ceremony', alt: "Wedding couple exchanging vows by the ocean." },
  { id: 'loving-wedding-embrace-bw', alt: "Black and white photo of a wedding couple in a tender embrace." },
  { id: 'graceful-bride-bouquet', alt: "Bride in an elegant gown holding a bouquet in an exquisite interior." },
  { id: 'wedding-champagne-celebration', alt: "Newlyweds toasting with champagne to celebrate their wedding." },
  { id: 'bride-greenhouse-serenity', alt: "Bride standing in a greenhouse surrounded by lush plants and flowers." },
  { id: 'floral-wedding-kiss', alt: "Groom kissing his bride surrounded by stunning flowers." },
];

const photoUrl = (id: string) => `/assets/photos/weddings/${id}.webp`;

const Weddings = () => {
  const introRef = useRef<HTMLDivElement>(null);
  const isIntroInView = useInView(introRef, { once: true, amount: 0.15 });
  const workRef = useRef<HTMLDivElement>(null);
  const isWorkInView = useInView(workRef, { once: true, amount: 0.1 });
  const ctaRef = useRef<HTMLDivElement>(null);
  const isCtaInView = useInView(ctaRef, { once: true, amount: 0.3 });

  const grid = FEATURED;
  const hero = grid[0];

  return (
    <Box minH="100vh">
      <Helmet>
        <title>Wedding Photography | Vero Photography</title>
        <meta
          name="description"
          content="Wedding photography by Veronika Gerzon — from a few hours to several days, local or destination. Every wedding is quoted individually. Request a quote."
        />
        <link rel="canonical" href="https://vero.photography/wedding-photography" />
        <meta property="og:title" content="Wedding Photography | Vero Photography" />
        <meta
          property="og:description"
          content="From a few hours to several days, local or destination. Every wedding is quoted individually."
        />
        <meta property="og:url" content="https://vero.photography/wedding-photography" />
        {hero && (
          <meta property="og:image" content={`https://vero.photography${photoUrl(hero.id)}`} />
        )}
      </Helmet>

      {/* ─── Hero ─── */}
      <Box position="relative" h={{ base: '68vh', md: '80vh' }} overflow="hidden">
        {hero && (
          <Image
            src={photoUrl(hero.id)}
            alt={hero.alt}
            objectFit="cover"
            objectPosition="center 35%"
            w="100%"
            h="100%"
          />
        )}
        <Box position="absolute" inset={0} bg="rgba(0,0,0,0.42)" />
        <Flex position="absolute" inset={0} align="center" justify="center">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            <Box px={6} maxW="720px">
              <PageHeader
                onDark
                eyebrow="Weddings"
                title={
                  <>
                    No two weddings are the same.
                    <br />
                    Neither is the way I photograph them.
                  </>
                }
              />
            </Box>
          </MotionDiv>
        </Flex>
      </Box>

      {/* ─── The pitch: flexibility, stated plainly ─── */}
      <Box bg="white" py={{ base: 16, md: 24 }} px={{ base: 8, md: 12 }}>
        <Flex justify="center" ref={introRef}>
          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            animate={isIntroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <VStack spacing={6} maxW="640px" textAlign="center">
              <Text fontSize={{ base: 'lg', md: 'xl' }} fontWeight="300" color="gray.700" lineHeight="1.9">
                Some couples want a few hours — the ceremony, the portraits, a little of
                the party. Others want the whole day, from the quiet morning through the
                last song. Some fly me out for a weekend.
              </Text>
              <Text fontSize={{ base: 'md', md: 'lg' }} fontWeight="300" color="gray.600" lineHeight="1.9">
                I don't sell three packages and hope your wedding fits one of them. Tell me
                what your day looks like and I'll put together something built around it.
              </Text>
            </VStack>
          </MotionDiv>
        </Flex>
      </Box>

      {/* ─── What that actually means ─── */}
      <Box bg="brand.surface" py={{ base: 14, md: 20 }} px={{ base: 8, md: 12 }}>
        <Box maxW="1000px" mx="auto">
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 10, md: 12 }}>
            {[
              {
                title: 'Coverage',
                body:
                  'A few hours through to a full day, or several days for a wedding that runs longer than one. We work out what you actually need rather than what fits a tier.',
              },
              {
                title: 'Travel',
                body:
                  "Local, and well beyond it — I've driven seven hours for a wedding and flown further. Destination weddings are welcome; travel is simply part of the quote.",
              },
              {
                title: 'Afterwards',
                body:
                  'Your photographs arrive in a private online gallery of your own — view them, favourite them, download them, and share the link with family.',
              },
            ].map((c) => (
              <VStack key={c.title} align="flex-start" spacing={3}>
                <Text textStyle="eyebrow">{c.title}</Text>
                <Box w="28px" h="1px" bg="brand.accent" />
                <Text textStyle="bodyCopy">{c.body}</Text>
              </VStack>
            ))}
          </SimpleGrid>
        </Box>
      </Box>

      {/* ─── Selected work. Real links to the photo pages. ─── */}
      <Box bg="white" py={{ base: 16, md: 24 }} px={{ base: 6, md: 12 }} ref={workRef}>
        <VStack spacing={3} mb={{ base: 10, md: 14 }} textAlign="center">
          <Text textStyle="eyebrow">Selected Work</Text>
          <Box w="35px" h="1px" bg="brand.accent" />
        </VStack>

        <MotionDiv
          initial={{ opacity: 0, y: 24 }}
          animate={isWorkInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: 'easeOut' }}
        >
          <SimpleGrid
            columns={{ base: 1, sm: 2, lg: 3 }}
            spacing={{ base: 4, md: 5 }}
            maxW="1200px"
            mx="auto"
          >
            {grid.map((p) => (
              <Box
                key={p.id}
                as={RouterLink}
                to={`/photo/weddings/${p.id}`}
                position="relative"
                overflow="hidden"
                borderRadius="sm"
                display="block"
                sx={{ aspectRatio: '4 / 5' }}
                _hover={{ '& img': { transform: 'scale(1.04)' } }}
              >
                <Image
                  src={photoUrl(p.id)}
                  alt={p.alt}
                  w="100%"
                  h="100%"
                  objectFit="cover"
                  loading="lazy"
                  decoding="async"
                  transition="transform 0.6s ease"
                />
              </Box>
            ))}
          </SimpleGrid>
        </MotionDiv>

        <Flex justify="center" mt={{ base: 10, md: 14 }}>
          <CTAButton to="/gallery/weddings" variant="outline" size="md">
            See the full wedding gallery
          </CTAButton>
        </Flex>
      </Box>

      {/* ─── CTA ─── */}
      <Box bg="brand.surfaceSunken" py={{ base: 16, md: 24 }} px={{ base: 8, md: 12 }}>
        <Flex justify="center" ref={ctaRef}>
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={isCtaInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <VStack spacing={6} textAlign="center" maxW="560px">
              <Text as="h2" textStyle="sectionTitle">
                Tell me about your day
              </Text>
              <Text textStyle="bodyLead">
                Where you're getting married, roughly when, and how much of it you'd like
                photographed. That's enough for me to come back with a quote.
              </Text>
              <HStack spacing={4} flexWrap="wrap" justify="center">
                <CTAButton to="/contact" variant="solid" size="lg">
                  Request a quote
                </CTAButton>
              </HStack>
            </VStack>
          </MotionDiv>
        </Flex>
      </Box>
    </Box>
  );
};

export default Weddings;
