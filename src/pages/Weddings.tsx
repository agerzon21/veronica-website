import {
  Box, VStack, HStack, Text, Flex, Image, SimpleGrid, Grid, GridItem, Icon,
} from '@chakra-ui/react';
import FaChevronDown from '../icons/fa/FaChevronDown';
import FaArrowRight from '../icons/fa/FaArrowRight';
import { Helmet } from 'react-helmet-async';
import { m, useInView } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import CTAButton from '../components/ui/CTAButton';
import PageHeader from '../components/ui/PageHeader';
import weddingData from '../data/wedding-page.json';

/**
 * The weddings page: photographs woven through packages, planning help,
 * an FAQ mined from what customers actually ask, featured journal
 * entries, and recommended vendors.
 *
 * WHY PACKAGES NOW, WHEN THIS PAGE FAMOUSLY HAD NONE
 * The page used to argue "publishing tiers would be a lie". Vero's call
 * (2026-09) is the middle path: BROAD tiers with "from" pricing — high-end
 * couples see there is room to build up, budget couples see there is room
 * to trim, and the final number is always confirmed before booking. The
 * package/FAQ copy lives in src/data/wedding-page.json — one source shared
 * with the prerender script (noscript + FAQPage schema), so page and
 * crawler can never drift apart.
 *
 * PHOTOS: TWO POOLS
 * - HEROES: up to 6 photos Vero pins from the admin panel (Weddings tab).
 *   Constant across visits; they anchor the hero, the mid-page full-bleed,
 *   and the closing CTA background.
 * - SPRINKLES: everything in the admin-configured Drive folder. Shuffled
 *   client-side once per visit and dealt into fixed layout slots between
 *   sections — so the page recomposes itself on every reload without
 *   costing anything at build or render time (transform of an in-memory
 *   array). Prerendered HTML is unaffected; crawlers see the static copy.
 *
 * FALLBACK: with no folder configured (or Drive down), sprinkle bands
 * simply don't render and the page leans on FEATURED — the six curated
 * gallery slugs below, which also keep real internal links to the photo
 * pages. The build guards FEATURED against renames
 * (scripts/prerender-photos.mjs).
 */

const MotionDiv = m.div;

const FEATURED: Array<{ id: string; alt: string }> = [
  { id: 'ocean-vows-ceremony', alt: 'Wedding couple exchanging vows by the ocean.' },
  { id: 'loving-wedding-embrace-bw', alt: 'Black and white photo of a wedding couple in a tender embrace.' },
  { id: 'graceful-bride-bouquet', alt: 'Bride in an elegant gown holding a bouquet in an exquisite interior.' },
  { id: 'wedding-champagne-celebration', alt: 'Newlyweds toasting with champagne to celebrate their wedding.' },
  { id: 'bride-greenhouse-serenity', alt: 'Bride standing in a greenhouse surrounded by lush plants and flowers.' },
  { id: 'floral-wedding-kiss', alt: 'Groom kissing his bride surrounded by stunning flowers.' },
];

const photoUrl = (id: string) => `/assets/photos/weddings/${id}.webp`;

interface WPhoto {
  url: string;
  fullUrl: string;
  alt?: string;
}

interface PinnedPhoto {
  url: string;
  fullUrl: string;
  focus: string;
}

interface Vendor {
  name: string;
  category: string;
  blurb: string;
  websiteUrl: string | null;
  instagram: string | null;
  photoUrl: string | null;
}

interface FeaturedPost {
  slug: string;
  title: string;
  cover_image_url: string | null;
  published_at: string;
  session_type: string | null;
  tags?: string[];
}

/** One slide in the journal slideshow, joined from settings + journal. */
interface FeaturedItem {
  slug: string;
  title: string;
  cover: string | null;
  /** Vero tags advice articles with "advice"; everything else is a wedding. */
  label: 'Advice' | 'Real Wedding';
  focusStage: string;
  focusThumb: string;
}

/** Fisher-Yates. Runtime-only (inside an effect) — never at module init. */
function shuffled<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}


/** Journal covers arrive as w800 thumbs; the slideshow stage renders big. */
const coverLarge = (url: string | null): string =>
  url ? url.replace(/([?&]sz=)w\d+/, '$1w2000') : '';

/**
 * The type chip over a slide. Width hugs the text — the box ends where
 * the words end (Alex's screenshot note), never stretching to the title
 * width. Gold-filled for advice articles, hairline-outlined for real
 * weddings.
 */
function JournalLabel({ label }: { label: 'Advice' | 'Real Wedding' }) {
  return (
    <Box
      alignSelf="flex-start"
      w="fit-content"
      fontSize="10px"
      fontWeight="500"
      letterSpacing="0.18em"
      textTransform="uppercase"
      px={2}
      py={1}
      borderRadius="2px"
      border="1px solid"
      borderColor={label === 'Advice' ? 'transparent' : 'whiteAlpha.600'}
      bg={label === 'Advice' ? 'rgba(201,169,110,0.92)' : 'transparent'}
      color={label === 'Advice' ? '#1c1509' : 'white'}
    >
      {label}
    </Box>
  );
}

const Weddings = () => {
  const introRef = useRef<HTMLDivElement>(null);
  const isIntroInView = useInView(introRef, { once: true, amount: 0.15 });
  const ctaRef = useRef<HTMLDivElement>(null);
  const isCtaInView = useInView(ctaRef, { once: true, amount: 0.3 });

  // POSITIONAL pinned slots: 0-2 package cards, 3 FAQ, 4 quote background.
  const [pinned, setPinned] = useState<Array<PinnedPhoto | null>>([]);
  const [pool, setPool] = useState<WPhoto[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [featured, setFeatured] = useState<FeaturedItem[]>([]);
  const [selectedWork, setSelectedWork] = useState<Array<{ slug: string; url: string; alt: string }>>([]);
  // Journal slideshow: active slide + hover-pause for the autoplay.
  const [slideIdx, setSlideIdx] = useState(0);
  const [slidePaused, setSlidePaused] = useState(false);

  useEffect(() => {
    if (featured.length < 2 || slidePaused) return;
    // Re-created whenever slideIdx changes, so a manual thumb/dot click
    // earns a full interval before the next auto-advance.
    const t = setInterval(() => {
      setSlideIdx((i) => (i + 1) % featured.length);
    }, 4800);
    return () => clearInterval(t);
  }, [featured.length, slidePaused, slideIdx]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/gallery/wedding-page');
        const data = await res.json();
        if (cancelled || !res.ok || !data.success) return;
        setPinned(Array.isArray(data.pinned) ? data.pinned : []);
        // The once-per-visit shuffle: the folder's photos become the
        // background tapestry, dealt into fixed decorative slots in a
        // new order on every visit.
        const photos: WPhoto[] = Array.isArray(data.photos) ? data.photos : [];
        setPool(shuffled(photos));
        setVendors(Array.isArray(data.vendors) ? data.vendors : []);
        setSelectedWork(Array.isArray(data.selectedWork) ? data.selectedWork : []);

        // Featured entries carry per-entry focal points; fall back to the
        // legacy slug array for a stale edge-cached payload.
        const entries: Array<{ slug: string; focusStage?: string; focusThumb?: string }> =
          Array.isArray(data.featured)
            ? data.featured
            : Array.isArray(data.featuredSlugs)
              ? data.featuredSlugs.map((s: string) => ({ slug: s }))
              : [];
        if (entries.length > 0) {
          const jr = await fetch('/api/journal/list');
          const jd = await jr.json();
          if (cancelled || !jr.ok || !jd.success) return;
          const bySlug = new Map<string, FeaturedPost>(
            (jd.posts as FeaturedPost[]).map((p) => [p.slug, p]),
          );
          setFeatured(
            entries
              .map((e) => {
                const p = bySlug.get(e.slug);
                if (!p) return null;
                const isAdvice =
                  p.session_type === 'article' ||
                  (p.tags ?? []).some((t) => /advice|guide/i.test(t));
                return {
                  slug: p.slug,
                  title: p.title,
                  cover: p.cover_image_url,
                  label: isAdvice ? ('Advice' as const) : ('Real Wedding' as const),
                  focusStage: e.focusStage ?? 'center',
                  focusThumb: e.focusThumb ?? 'center',
                };
              })
              .filter((p): p is FeaturedItem => Boolean(p)),
          );
        }
      } catch {
        // Static page still stands on its own; photo bands just stay out.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Deal the shuffled pool into the tapestry: fixed decorative slots
  // per section, filled in whatever order this visit's shuffle dealt.
  const decor = useMemo(() => {
    let cursor = 0;
    const take = (n: number) => {
      const s = pool.slice(cursor, cursor + n);
      cursor += n;
      return s;
    };
    return {
      approach: take(3),
      packages: take(4),
      journal: take(2),
      faq: take(2),
      vendors: take(2),
    };
  }, [pool]);

  // The big top hero stays FIXED: the curated local photo, served from
  // /assets. The five admin pinned slots are positional:
  const pkgPin = (i: number): PinnedPhoto | null => pinned[i] ?? null;
  const faqPin = pinned[3] ?? null;
  const ctaPin = pinned[4] ?? null;

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: weddingData.faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <Box minH="100vh">
      <Helmet>
        <title>Wedding Photography Services | Vero Photography</title>
        <meta
          name="description"
          content="Wedding photography by Veronika Gerzon — coverage from intimate ceremonies to full days, planning help, honest answers, and trusted local vendors. Based in Scranton, Pennsylvania; available worldwide."
        />
        <link rel="canonical" href="https://vero.photography/wedding-photography" />
        <meta property="og:title" content="Wedding Photography Services | Vero Photography" />
        <meta
          property="og:description"
          content="Coverage from intimate ceremonies to full days, planning help, honest answers, and trusted local vendors."
        />
        <meta property="og:url" content="https://vero.photography/wedding-photography" />
        <meta
          property="og:image"
          content="https://vero.photography/assets/photos/weddings/newlyweds-running-sea.webp"
        />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      {/* ─── Hero ─── */}
      <Box position="relative" h={{ base: '68vh', md: '80vh' }} overflow="hidden">
        <Image
          src={photoUrl(FEATURED[0].id)}
          alt={FEATURED[0].alt}
          objectFit="cover"
          objectPosition="center 35%"
          w="100%"
          h="100%"
        />
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

      {/* ─── Approach — tapestry prints live behind the words ─── */}
      <Box bg="white" py={{ base: 16, md: 24 }} px={{ base: 8, md: 12 }} position="relative" overflow="hidden" sx={{ isolation: 'isolate' }}>
        <DecorPrints photos={decor.approach} slots={DECOR_APPROACH} />
        <Flex justify="center" ref={introRef}>
          <MotionDiv
            initial={{ opacity: 0, y: 24 }}
            animate={isIntroInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <VStack spacing={7} maxW="720px" textAlign="center">
              <Text textStyle="eyebrow">My Approach</Text>
              <Box w="35px" h="1px" bg="brand.accent" />
              {/* The pitch as a statement, not a paragraph — set in the
                  serif display face so it reads as her voice, with the
                  accent phrase in italic. */}
              <Text
                fontFamily="heading"
                fontWeight="300"
                fontSize={{ base: '1.55rem', md: '2.15rem' }}
                lineHeight="1.55"
                color="gray.800"
              >
                Some couples want a few hours. Others want the whole day, from the quiet
                morning through the last song.{' '}
                <Box as="em" fontStyle="italic" color="brand.accentText">
                  Some fly me out for a weekend.
                </Box>
              </Text>
              <Text
                fontSize={{ base: 'md', md: 'lg' }}
                fontWeight="300"
                color="gray.600"
                lineHeight="1.9"
                maxW="560px"
              >
                My photographs are warm, natural, and story-driven: real moments in real
                light. My packages are based on how much coverage you need, and every one
                of them bends to fit your day.
              </Text>
            </VStack>
          </MotionDiv>
        </Flex>

      </Box>

      {/* ─── Packages — cream section keeps its rhythm; prints peek from
          the gutters behind the cards ─── */}
      <Box bg="brand.surface" py={{ base: 16, md: 24 }} px={{ base: 6, md: 12 }} position="relative" overflow="hidden" sx={{ isolation: 'isolate' }}>
        <DecorPrints photos={decor.packages} slots={DECOR_PACKAGES} />
        <Box maxW="1200px" mx="auto">
          <VStack spacing={3} mb={{ base: 4, md: 6 }} textAlign="center">
            <Text textStyle="eyebrow">Wedding Photography</Text>
            <Box w="35px" h="1px" bg="brand.accent" />
          </VStack>
          <Text
            textStyle="bodyLead"
            textAlign="center"
            maxW="640px"
            mx="auto"
            mb={{ base: 10, md: 14 }}
          >
            {weddingData.broadNote}
          </Text>

          {/* Each card is one link to the prefilled contact form. With a
              pinned photo (admin slots 1-3, with focus) the WHOLE card is
              the photograph: it shows through at the top and dissolves
              into white where the text lives (Alex's transparency idea).
              Without one, the curated fallback rides on top as before. */}
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 5, md: 6 }}>
            {weddingData.packages.map((pkg, i) => {
              const pin = pkgPin(i);
              const fallback = FEATURED[i + 1];
              return (
                <Flex
                  key={pkg.name}
                  as={RouterLink}
                  to={`/contact?package=${encodeURIComponent(pkg.name)}`}
                  role="group"
                  direction="column"
                  position="relative"
                  bg="white"
                  borderRadius="sm"
                  border="1px solid"
                  borderColor="brand.accentBorder"
                  overflow="hidden"
                  transition="transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease"
                  _hover={{
                    transform: 'translateY(-4px)',
                    boxShadow: '0 18px 40px -18px rgba(15, 15, 15, 0.35)',
                    borderColor: 'brand.accent',
                  }}
                >
                  {pin ? (
                    <>
                      <Image
                        src={pin.fullUrl}
                        alt=""
                        position="absolute"
                        inset={0}
                        w="100%"
                        h="100%"
                        objectFit="cover"
                        objectPosition={pin.focus}
                        loading="lazy"
                        transition="transform 0.7s ease"
                        _groupHover={{ transform: 'scale(1.04)' }}
                      />
                      <Box
                        position="absolute"
                        inset={0}
                        bg="linear-gradient(180deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.28) 130px, rgba(255,255,255,0.9) 185px, rgba(255,255,255,0.99) 215px, #ffffff 245px)"
                      />
                    </>
                  ) : (
                    <Box h={{ base: '170px', md: '190px' }} overflow="hidden" flexShrink={0}>
                      <Image
                        src={photoUrl(fallback.id)}
                        alt={fallback.alt}
                        w="100%"
                        h="100%"
                        objectFit="cover"
                        loading="lazy"
                        transition="transform 0.6s ease"
                        _groupHover={{ transform: 'scale(1.05)' }}
                      />
                    </Box>
                  )}
                  <Flex
                    direction="column"
                    p={{ base: 6, md: 7 }}
                    pt={pin ? { base: '210px', md: '235px' } : { base: 6, md: 7 }}
                    flex="1"
                    position="relative"
                    zIndex={1}
                  >
                    <Text textStyle="eyebrow">{pkg.coverage}</Text>
                    <Text as="h3" textStyle="cardTitle" mt={2}>
                      {pkg.name}
                    </Text>
                    <Text
                      fontFamily="heading"
                      fontSize={{ base: '2xl', md: '3xl' }}
                      fontWeight="300"
                      color="gray.800"
                      mt={1}
                    >
                      {pkg.price}
                    </Text>
                    <Text textStyle="bodyCopy" color="gray.600" mt={3}>
                      {pkg.tagline}
                    </Text>
                    <Box w="28px" h="1px" bg="brand.accent" my={4} />
                    {pkg.buildsOn && (
                      <Text textStyle="metaCaption" color="brand.accentText" mb={2}>
                        {pkg.buildsOn}
                      </Text>
                    )}
                    <VStack align="flex-start" spacing={1.5}>
                      {pkg.includes.map((line) => (
                        <HStack key={line} spacing={2} align="flex-start">
                          <Box w="4px" h="4px" borderRadius="full" bg="brand.accent" mt="9px" flexShrink={0} />
                          <Text textStyle="bodyCopy">{line}</Text>
                        </HStack>
                      ))}
                    </VStack>
                    {/* The hover reveal on desktop; always visible on touch,
                        where hover doesn't exist. */}
                    <HStack
                      spacing={2}
                      mt="auto"
                      pt={5}
                      color="brand.accentText"
                      opacity={{ base: 1, md: 0 }}
                      transform={{ base: 'none', md: 'translateY(4px)' }}
                      transition="opacity 0.25s ease, transform 0.25s ease"
                      _groupHover={{ opacity: 1, transform: 'translateY(0)' }}
                    >
                      <Text textStyle="ctaLabel">Start with this package</Text>
                      <Icon as={FaArrowRight} boxSize={3} />
                    </HStack>
                  </Flex>
                </Flex>
              );
            })}
          </SimpleGrid>

          {/* Footnotes, deliberately not card-shaped: these are asides to
              the tiers, not options you click. */}
          <Box maxW="720px" mx="auto" mt={{ base: 10, md: 12 }} pt={{ base: 6, md: 8 }} borderTop="1px solid" borderColor="brand.accentBorder">
            <VStack spacing={4} align="stretch">
              {weddingData.addOns.map((a) => (
                <Text key={a.name} textStyle="bodyCopy" color="gray.600" textAlign="center">
                  <Box as="span" textStyle="eyebrow" color="gray.700" mr={2}>
                    {a.name}.
                  </Box>
                  {a.detail}
                </Text>
              ))}
            </VStack>
          </Box>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 8, md: 12 }} mt={{ base: 12, md: 16 }}>
            <VStack align="flex-start" spacing={3} bg="rgba(255,255,255,0.82)" p={{ base: 4, md: 6 }} borderRadius="sm">
              <Text textStyle="eyebrow">Travel</Text>
              <Box w="28px" h="1px" bg="brand.accent" />
              <Text textStyle="bodyCopy">{weddingData.travel}</Text>
            </VStack>
            <VStack align="flex-start" spacing={3} bg="rgba(255,255,255,0.82)" p={{ base: 4, md: 6 }} borderRadius="sm">
              <Text textStyle="eyebrow">Booking your date</Text>
              <Box w="28px" h="1px" bg="brand.accent" />
              <Text textStyle="bodyCopy">{weddingData.booking}</Text>
            </VStack>
          </SimpleGrid>
        </Box>
      </Box>



      {/* ─── From the Journal — the slow slideshow (Alex's pick), with
          tapestry prints behind it. Per-entry focal points from the
          admin keep faces in frame on stage and thumbs alike. ─── */}
      {featured.length > 0 && (
        <Box bg="white" py={{ base: 14, md: 20 }} px={{ base: 4, md: 12 }} position="relative" overflow="hidden" sx={{ isolation: 'isolate' }}>
          <DecorPrints photos={decor.journal} slots={DECOR_JOURNAL} />
          <VStack spacing={3} mb={{ base: 8, md: 10 }} textAlign="center">
            <Text textStyle="eyebrow">From the Journal</Text>
            <Box w="35px" h="1px" bg="brand.accent" />
            <Text textStyle="bodyCopy" color="gray.600" maxW="560px">
              Real weddings, planning advice, and notes from behind the lens.
            </Text>
          </VStack>

          <Box maxW="1150px" mx="auto">
            <Box
              position="relative"
              h={{ base: '46vh', md: '470px' }}
              borderRadius="sm"
              overflow="hidden"
              bg="brand.surface"
              onMouseEnter={() => setSlidePaused(true)}
              onMouseLeave={() => setSlidePaused(false)}
            >
              {featured.map((p, i) => {
                const active = i === Math.min(slideIdx, featured.length - 1);
                return (
                  <Box
                    key={p.slug}
                    as={RouterLink}
                    to={`/journal/${p.slug}`}
                    state={{ back: { to: '/wedding-photography', label: 'Back to weddings' } }}
                    position="absolute"
                    inset={0}
                    opacity={active ? 1 : 0}
                    transition="opacity 0.8s ease"
                    pointerEvents={active ? 'auto' : 'none'}
                  >
                    <Image
                      src={coverLarge(p.cover)}
                      alt=""
                      w="100%"
                      h="100%"
                      objectFit="cover"
                      objectPosition={p.focusStage}
                      loading={i === 0 ? undefined : 'lazy'}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <Box
                      position="absolute"
                      inset={0}
                      bg="linear-gradient(180deg, transparent 55%, rgba(10,8,4,0.68) 100%)"
                    />
                    <Flex position="absolute" inset={0} align="flex-end" p={{ base: 4, md: 8 }}>
                      <VStack align="flex-start" spacing={{ base: 1.5, md: 2.5 }}>
                        <JournalLabel label={p.label} />
                        <Text
                          fontFamily="heading"
                          fontWeight="400"
                          color="white"
                          fontSize={{ base: 'xl', md: '3xl' }}
                          lineHeight="1.2"
                          noOfLines={2}
                          textShadow="0 1px 12px rgba(0,0,0,0.45)"
                        >
                          {p.title}
                        </Text>
                      </VStack>
                    </Flex>
                  </Box>
                );
              })}

              <HStack position="absolute" right={{ base: 3, md: 6 }} bottom={{ base: 3, md: 6 }} spacing={2} zIndex={2}>
                {featured.map((p, i) => (
                  <Box
                    key={p.slug}
                    as="button"
                    type="button"
                    aria-label={p.title}
                    onClick={() => setSlideIdx(i)}
                    w={i === slideIdx ? '9px' : '7px'}
                    h={i === slideIdx ? '9px' : '7px'}
                    borderRadius="full"
                    bg={i === slideIdx ? 'brand.accent' : 'whiteAlpha.600'}
                    border="none"
                    p={0}
                    cursor="pointer"
                    transition="all 0.3s ease"
                  />
                ))}
              </HStack>
            </Box>

            <Grid
              templateColumns={{ base: 'repeat(3, 1fr)', md: `repeat(${featured.length}, 1fr)` }}
              gap={{ base: 2, md: 2.5 }}
              mt={{ base: 2.5, md: 3.5 }}
            >
              {featured.map((p, i) => (
                <Box
                  key={p.slug}
                  as="button"
                  type="button"
                  aria-label={p.title}
                  onClick={() => setSlideIdx(i)}
                  position="relative"
                  h={{ base: '58px', md: '66px' }}
                  borderRadius="sm"
                  overflow="hidden"
                  bg="brand.surface"
                  border="none"
                  p={0}
                  cursor="pointer"
                  opacity={i === slideIdx ? 1 : 0.5}
                  boxShadow={i === slideIdx ? 'inset 0 0 0 2px var(--chakra-colors-brand-accent)' : undefined}
                  transition="opacity 0.3s ease"
                  _hover={{ opacity: 1 }}
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <Image
                    src={p.cover ?? undefined}
                    alt=""
                    w="100%"
                    h="100%"
                    objectFit="cover"
                    objectPosition={p.focusThumb}
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <Box
                    position="absolute"
                    left={1.5}
                    bottom={1.5}
                    fontSize="8px"
                    fontWeight="500"
                    letterSpacing="0.12em"
                    textTransform="uppercase"
                    px={1.5}
                    py={0.5}
                    borderRadius="2px"
                    bg={p.label === 'Advice' ? 'rgba(201,169,110,0.92)' : 'blackAlpha.600'}
                    color={p.label === 'Advice' ? '#1c1509' : 'white'}
                  >
                    {p.label}
                  </Box>
                </Box>
              ))}
            </Grid>

            <Flex justify="center" mt={{ base: 6, md: 8 }}>
              <CTAButton to="/journal" variant="ghost" size="sm">
                View the full journal
              </CTAButton>
            </Flex>
          </Box>
        </Box>
      )}

      {/* ─── FAQ — editorial split: a sticky intro column (with one ambient
          photograph and the ask-me-directly path) beside the numbered
          questions. On mobile the intro stacks above the list. ─── */}
      <Box bg="brand.surface" py={{ base: 16, md: 24 }} px={{ base: 6, md: 12 }} position="relative" sx={{ isolation: 'isolate' }}>
        <DecorPrints photos={decor.faq} slots={DECOR_FAQ} />
        <Grid
          templateColumns={{ base: '1fr', lg: '5fr 7fr' }}
          gap={{ base: 10, lg: 16 }}
          maxW="1100px"
          mx="auto"
          alignItems="start"
        >
          <Box position={{ lg: 'sticky' }} top={{ lg: '110px' }}>
            <VStack spacing={5} align={{ base: 'center', lg: 'flex-start' }} textAlign={{ base: 'center', lg: 'left' }}>
              <Text textStyle="eyebrow">Wedding Photography FAQ</Text>
              <Box w="35px" h="1px" bg="brand.accent" />
              <Text
                fontFamily="heading"
                fontWeight="300"
                fontSize={{ base: '1.4rem', md: '1.7rem' }}
                lineHeight="1.5"
                color="gray.800"
              >
                Everything couples ask me, answered the way I answer it in my inbox.
              </Text>
              {faqPin && (
                <Box
                  display={{ base: 'none', lg: 'block' }}
                  w="100%"
                  maxW="360px"
                  aspectRatio={3 / 4}
                  overflow="hidden"
                  borderRadius="sm"
                  bg="gray.100"
                >
                  <Image
                    src={faqPin.fullUrl}
                    alt=""
                    w="100%"
                    h="100%"
                    objectFit="cover"
                    objectPosition={faqPin.focus}
                    loading="lazy"
                  />
                </Box>
              )}
              <Text textStyle="bodyCopy" color="gray.600">
                Have a question that isn't here? Ask me directly and you'll hear back
                within a day or two.
              </Text>
              <CTAButton to="/contact" variant="outline" size="sm">
                Ask me directly
              </CTAButton>
            </VStack>
          </Box>
          <Box borderTop="1px solid" borderColor="brand.accentBorder">
            {weddingData.faq.map((f, i) => (
              <FaqItem key={f.q} q={f.q} a={f.a} index={i} />
            ))}
          </Box>
        </Grid>
      </Box>

      {/* ─── Recommended vendors ─── */}
      {vendors.length > 0 && (
        <Box bg="white" pb={{ base: 16, md: 24 }} pt={{ base: 4, md: 8 }} px={{ base: 6, md: 12 }} position="relative" overflow="hidden" sx={{ isolation: 'isolate' }}>
          <DecorPrints photos={decor.vendors} slots={DECOR_VENDORS} />
          <Box maxW="1000px" mx="auto">
            <VStack spacing={3} mb={{ base: 8, md: 12 }} textAlign="center">
              <Text textStyle="eyebrow">Recommended Vendors</Text>
              <Box w="35px" h="1px" bg="brand.accent" />
              <Text textStyle="bodyCopy" color="gray.600" maxW="620px">
                Local wedding businesses I know and trust. No commissions, no
                sponsorships — just people whose work I have seen up close.
              </Text>
            </VStack>
            <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={{ base: 4, md: 5 }}>
              {vendors.map((v) => (
                <Flex
                  key={v.name}
                  direction="column"
                  border="1px solid"
                  borderColor="brand.accentBorder"
                  borderRadius="sm"
                  overflow="hidden"
                  bg="white"
                >
                  {v.photoUrl && (
                    <Box h="150px" overflow="hidden">
                      <Image
                        src={v.photoUrl}
                        alt={v.name}
                        w="100%"
                        h="100%"
                        objectFit="cover"
                        loading="lazy"
                        onError={(e) => {
                          ((e.target as HTMLImageElement).parentElement as HTMLElement).style.display = 'none';
                        }}
                      />
                    </Box>
                  )}
                  <Flex direction="column" p={5} flex="1">
                    <Text textStyle="eyebrow">{v.category}</Text>
                    <Text textStyle="cardTitle" mt={1}>
                      {v.name}
                    </Text>
                    {v.blurb && (
                      <Text textStyle="bodyCopy" color="gray.600" mt={2}>
                        {v.blurb}
                      </Text>
                    )}
                    <HStack spacing={4} mt="auto" pt={3}>
                      {v.websiteUrl && (
                        <Box
                          as="a"
                          href={v.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          textStyle="ctaLabel"
                          color="brand.accentText"
                          _hover={{ textDecoration: 'underline' }}
                        >
                          Website
                        </Box>
                      )}
                      {v.instagram && (
                        <Box
                          as="a"
                          href={
                            v.instagram.startsWith('http')
                              ? v.instagram
                              : `https://instagram.com/${v.instagram.replace(/^@/, '')}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          textStyle="ctaLabel"
                          color="brand.accentText"
                          _hover={{ textDecoration: 'underline' }}
                        >
                          Instagram
                        </Box>
                      )}
                    </HStack>
                  </Flex>
                </Flex>
              ))}
            </SimpleGrid>
            <Text textStyle="metaCaption" color="gray.500" textAlign="center" mt={{ base: 6, md: 8 }}>
              Vendors listed here are independent businesses. I recommend them because I
              like their work, but each works with you directly and is responsible for
              their own services.
            </Text>
          </Box>
        </Box>
      )}

      {/* ─── Selected work: admin-curated GALLERY photos, every tile a real
          link to its photo page. Deliberately separate from the ambient
          hero/folder pools, which are background and never clickable. Falls
          back to the built-in curated six until Vero picks her own. ─── */}
      <Box bg="white" py={{ base: 14, md: 20 }} px={{ base: 6, md: 12 }}>
        <VStack spacing={3} mb={{ base: 10, md: 14 }} textAlign="center">
          <Text textStyle="eyebrow">Selected Work</Text>
          <Box w="35px" h="1px" bg="brand.accent" />
        </VStack>
        <Grid
          templateColumns={{ base: 'repeat(2, 1fr)', md: 'repeat(6, 1fr)' }}
          autoRows={{ base: '34vw', md: '200px' }}
          autoFlow="dense"
          gap={{ base: 3, md: 4 }}
          maxW="1200px"
          mx="auto"
        >
          {(selectedWork.length > 0
            ? selectedWork
            : FEATURED.map((p) => ({ slug: p.id, url: photoUrl(p.id), alt: p.alt }))
          ).map((p, i) => {
            const feature = i % 5 === 0;
            return (
              <GridItem
                key={p.slug}
                colSpan={feature ? { base: 2, md: 4 } : { base: 1, md: 2 }}
                rowSpan={feature ? 2 : 1}
              >
                <Box
                  as={RouterLink}
                  to={`/photo/weddings/${p.slug}`}
                  display="block"
                  w="100%"
                  h="100%"
                  overflow="hidden"
                  borderRadius="sm"
                  bg="gray.100"
                  sx={{ '& > img': { transition: 'transform 0.5s ease' } }}
                  _hover={{ '& > img': { transform: 'scale(1.03)' } }}
                >
                  <Image
                    src={p.url}
                    alt={p.alt}
                    w="100%"
                    h="100%"
                    objectFit="cover"
                    loading="lazy"
                    decoding="async"
                  />
                </Box>
              </GridItem>
            );
          })}
        </Grid>
        <Flex justify="center" mt={{ base: 10, md: 14 }}>
          <CTAButton to="/gallery/weddings" variant="outline" size="md">
            See the full wedding gallery
          </CTAButton>
        </Flex>
      </Box>

      {/* ─── CTA ─── */}
      <Box position="relative" py={{ base: 16, md: 24 }} px={{ base: 8, md: 12 }} overflow="hidden">
        {ctaPin ? (
          <>
            <Image
              src={ctaPin.fullUrl}
              alt=""
              position="absolute"
              inset={0}
              w="100%"
              h="100%"
              objectFit="cover"
              objectPosition={ctaPin.focus}
              loading="lazy"
            />
            <Box position="absolute" inset={0} bg="rgba(15,15,15,0.55)" />
          </>
        ) : (
          <Box position="absolute" inset={0} bg="brand.surfaceSunken" />
        )}
        <Flex justify="center" ref={ctaRef} position="relative">
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={isCtaInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          >
            <VStack spacing={6} textAlign="center" maxW="560px">
              <Text as="h2" textStyle="sectionTitle" color={ctaPin ? 'white' : undefined}>
                Tell me about your day
              </Text>
              <Text textStyle="bodyLead" color={ctaPin ? 'whiteAlpha.900' : undefined}>
                Where you're getting married, roughly when, and how much of it you'd like
                photographed. That's enough for me to come back with a recommendation.
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

/**
 * One FAQ disclosure. NOT Chakra's Accordion: that renders framer's full
 * `motion` component internally, and the public bundle runs LazyMotion in
 * strict mode (perf work), which throws on it by design. A CSS
 * grid-template-rows transition gives the same open/close animation with
 * zero motion machinery.
 */
function FaqItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Box borderBottom="1px solid" borderColor="brand.accentBorder">
      <Flex
        as="button"
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        w="100%"
        align="center"
        justify="space-between"
        gap={4}
        py={4}
        px={1}
        textAlign="left"
        _hover={{ bg: 'blackAlpha.50' }}
        sx={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <HStack spacing={4} align="baseline">
          <Text
            fontFamily="heading"
            fontWeight="300"
            fontSize="sm"
            color="brand.accent"
            minW="24px"
          >
            {String(index + 1).padStart(2, '0')}
          </Text>
          <Text textStyle="cardTitle" fontSize={{ base: 'sm', md: 'md' }}>
            {q}
          </Text>
        </HStack>
        <Icon
          as={FaChevronDown}
          boxSize={3}
          color="brand.accent"
          transform={open ? 'rotate(180deg)' : undefined}
          transition="transform 0.2s ease"
          flexShrink={0}
        />
      </Flex>
      <Box display="grid" gridTemplateRows={open ? '1fr' : '0fr'} transition="grid-template-rows 0.25s ease">
        <Box overflow="hidden">
          <Text
            textStyle="bodyCopy"
            color="gray.600"
            pl={{ base: 1, md: '44px' }}
            pr={1}
            pb={open ? 5 : 0}
            transition="padding 0.25s ease"
          >
            {a}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}


/**
 * One tapestry slot: where a background print sits inside its section.
 * Percent offsets so wide screens breathe; `mob` marks the few slots
 * that survive on phones (smaller, via mw). Rotations alternate so the
 * collage reads as scattered prints, not a grid.
 */
interface DecorSlot {
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  w: number;
  rot: number;
  mob?: boolean;
  mw?: number;
}

const DECOR_APPROACH: DecorSlot[] = [
  { left: '1%', top: '8%', w: 190, rot: -6 },
  { right: '2%', top: '30%', w: 230, rot: 4 },
  { left: '3%', bottom: '2%', w: 150, rot: 2 },
];
const DECOR_PACKAGES: DecorSlot[] = [
  { left: '-1%', top: '1.5%', w: 200, rot: -5 },
  { right: '-1%', top: '10%', w: 170, rot: 6, mob: true, mw: 88 },
  { right: '4%', bottom: '2.5%', w: 210, rot: -3 },
  { left: '2%', bottom: '16%', w: 150, rot: 3 },
];
const DECOR_JOURNAL: DecorSlot[] = [
  { left: '0.5%', top: '12%', w: 160, rot: -4 },
  { right: '1%', bottom: '9%', w: 190, rot: 5 },
];
const DECOR_FAQ: DecorSlot[] = [
  { right: '2%', top: '5%', w: 170, rot: 4 },
  { left: '3%', bottom: '5%', w: 150, rot: -5, mob: true, mw: 88 },
];
const DECOR_VENDORS: DecorSlot[] = [
  { left: '1%', top: '9%', w: 150, rot: -4 },
  { right: '2%', bottom: '7%', w: 170, rot: 3 },
];

/**
 * The background tapestry. Absolutely positioned white-bordered prints
 * at fixed slots, zIndex -1 inside an isolated section: they paint ABOVE
 * the section's background but BELOW every piece of content, so the
 * layout, spacing, and the page's white/cream rhythm never move — the
 * photographs are fabric, not blocks. pointer-events none throughout;
 * a print that fails to load removes itself.
 */
function DecorPrints({ photos, slots }: { photos: WPhoto[]; slots: DecorSlot[] }) {
  return (
    <>
      {slots.map((slot, i) => {
        const photo = photos[i];
        if (!photo) return null;
        return (
          <Box
            key={i}
            data-print=""
            position="absolute"
            top={slot.top}
            bottom={slot.bottom}
            left={slot.left}
            right={slot.right}
            w={{ base: slot.mob ? `${slot.mw ?? 90}px` : '0px', md: `${slot.w}px` }}
            display={{ base: slot.mob ? 'block' : 'none', md: 'block' }}
            transform={`rotate(${slot.rot}deg)`}
            zIndex={-1}
            pointerEvents="none"
            bg="white"
            p={{ base: 1, md: 2 }}
            borderRadius="2px"
            boxShadow="0 14px 30px -18px rgba(20, 15, 5, 0.4)"
            aria-hidden="true"
          >
            <Box aspectRatio={4 / 3} overflow="hidden">
              <Image
                src={photo.url}
                alt=""
                w="100%"
                h="100%"
                objectFit="cover"
                loading="lazy"
                onError={(e) => {
                  const print = (e.target as HTMLImageElement).closest('[data-print]') as HTMLElement | null;
                  if (print) print.style.display = 'none';
                }}
              />
            </Box>
          </Box>
        );
      })}
    </>
  );
}


export default Weddings;
