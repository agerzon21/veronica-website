import {
  Box, VStack, HStack, Text, Flex, Image, SimpleGrid, Grid, GridItem, Icon,
} from '@chakra-ui/react';
import FaChevronDown from '../icons/fa/FaChevronDown';
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

const SPRINKLE_ALT = 'Wedding photography by Veronika Gerzon';

const Weddings = () => {
  const introRef = useRef<HTMLDivElement>(null);
  const isIntroInView = useInView(introRef, { once: true, amount: 0.15 });
  const ctaRef = useRef<HTMLDivElement>(null);
  const isCtaInView = useInView(ctaRef, { once: true, amount: 0.3 });

  const [heroes, setHeroes] = useState<WPhoto[]>([]);
  const [pool, setPool] = useState<WPhoto[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [featured, setFeatured] = useState<FeaturedPost[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/gallery/wedding-page');
        const data = await res.json();
        if (cancelled || !res.ok || !data.success) return;
        setHeroes(Array.isArray(data.heroes) ? data.heroes : []);
        // The once-per-visit shuffle. Every reload deals the folder's
        // photos into the layout slots in a new order.
        setPool(shuffled(Array.isArray(data.photos) ? data.photos : []));
        setVendors(Array.isArray(data.vendors) ? data.vendors : []);

        const slugs: string[] = Array.isArray(data.featuredSlugs) ? data.featuredSlugs : [];
        if (slugs.length > 0) {
          const jr = await fetch('/api/journal/list');
          const jd = await jr.json();
          if (cancelled || !jr.ok || !jd.success) return;
          const bySlug = new Map<string, FeaturedPost>(
            (jd.posts as FeaturedPost[]).map((p) => [p.slug, p]),
          );
          setFeatured(slugs.map((s) => bySlug.get(s)).filter((p): p is FeaturedPost => Boolean(p)));
        }
      } catch {
        // Static page still stands on its own; photo bands just stay out.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Deal the shuffled pool into fixed slots. Sections render only the
  // photos their slot actually received, so a small folder degrades to
  // fewer bands rather than broken layouts.
  const slots = useMemo(() => {
    let cursor = 0;
    const take = (n: number) => {
      const s = pool.slice(cursor, cursor + n);
      cursor += n;
      return s;
    };
    return {
      trio: take(3),
      fullbleed1: take(1),
      stagger: take(2),
      quartet: take(4),
      fullbleed2: take(1),
      mosaic: take(8),
    };
  }, [pool]);

  const heroPhoto = heroes[0] ?? null;
  const midHero = heroes[3] ?? null;
  const ctaHero = heroes[4] ?? null;
  const approachPair = heroes.slice(1, 3);

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
          content={
            heroPhoto?.fullUrl ?? 'https://vero.photography/assets/photos/weddings/newlyweds-running-sea.webp'
          }
        />
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      {/* ─── Hero ─── */}
      <Box position="relative" h={{ base: '68vh', md: '80vh' }} overflow="hidden">
        <Image
          src={heroPhoto?.fullUrl ?? photoUrl(FEATURED[0].id)}
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

      {/* ─── Approach ─── */}
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
                My photographs are warm, natural, and story-driven: real moments in real
                light. My packages are based on how much coverage you need, and every one
                of them bends to fit your day.
              </Text>
            </VStack>
          </MotionDiv>
        </Flex>

        {/* Two pinned heroes flank the pitch when Vero has set them */}
        {approachPair.length === 2 && (
          <SimpleGrid columns={2} spacing={{ base: 3, md: 5 }} maxW="1000px" mx="auto" mt={{ base: 10, md: 16 }}>
            <SprinkleTile photo={approachPair[0]} ratio={4 / 5} />
            <SprinkleTile photo={approachPair[1]} ratio={4 / 5} extraProps={{ mt: { base: 6, md: 12 } }} />
          </SimpleGrid>
        )}
      </Box>

      {/* ─── Sprinkle: trio ─── */}
      {slots.trio.length === 3 && (
        <Box bg="white" pb={{ base: 12, md: 16 }} px={{ base: 4, md: 8 }}>
          <Grid
            templateColumns={{ base: '1fr 1fr', md: '2fr 1fr' }}
            templateRows={{ md: '1fr 1fr' }}
            gap={{ base: 3, md: 4 }}
            maxW="1200px"
            mx="auto"
            aspectRatio={{ md: 3 / 2 }}
          >
            <GridItem colSpan={{ base: 2, md: 1 }} rowSpan={{ base: 1, md: 2 }}>
              <SprinkleTile photo={slots.trio[0]} cover full aspect={{ base: 3 / 2, md: 'auto' }} />
            </GridItem>
            <GridItem>
              <SprinkleTile photo={slots.trio[1]} cover aspect={{ base: 1, md: 'auto' }} />
            </GridItem>
            <GridItem>
              <SprinkleTile photo={slots.trio[2]} cover aspect={{ base: 1, md: 'auto' }} />
            </GridItem>
          </Grid>
        </Box>
      )}

      {/* ─── Packages ─── */}
      <Box bg="brand.surface" py={{ base: 16, md: 24 }} px={{ base: 6, md: 12 }}>
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

          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 5, md: 6 }}>
            {weddingData.packages.map((pkg) => (
              <Flex
                key={pkg.name}
                direction="column"
                bg="white"
                borderRadius="sm"
                border="1px solid"
                borderColor="brand.accentBorder"
                p={{ base: 6, md: 8 }}
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
                <VStack align="flex-start" spacing={1.5} mt="auto">
                  {pkg.includes.map((line) => (
                    <HStack key={line} spacing={2} align="flex-start">
                      <Box w="4px" h="4px" borderRadius="full" bg="brand.accent" mt="9px" flexShrink={0} />
                      <Text textStyle="bodyCopy">{line}</Text>
                    </HStack>
                  ))}
                </VStack>
              </Flex>
            ))}
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 5, md: 6 }} mt={{ base: 5, md: 6 }}>
            {weddingData.addOns.map((a) => (
              <Box
                key={a.name}
                bg="white"
                borderRadius="sm"
                border="1px dashed"
                borderColor="brand.accentBorder"
                p={{ base: 5, md: 6 }}
              >
                <Text textStyle="eyebrow">{a.name}</Text>
                <Text textStyle="bodyCopy" mt={2}>
                  {a.detail}
                </Text>
              </Box>
            ))}
          </SimpleGrid>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={{ base: 8, md: 12 }} mt={{ base: 12, md: 16 }}>
            <VStack align="flex-start" spacing={3}>
              <Text textStyle="eyebrow">Travel</Text>
              <Box w="28px" h="1px" bg="brand.accent" />
              <Text textStyle="bodyCopy">{weddingData.travel}</Text>
            </VStack>
            <VStack align="flex-start" spacing={3}>
              <Text textStyle="eyebrow">Booking your date</Text>
              <Box w="28px" h="1px" bg="brand.accent" />
              <Text textStyle="bodyCopy">{weddingData.booking}</Text>
            </VStack>
          </SimpleGrid>
        </Box>
      </Box>

      {/* ─── Full-bleed breath: pinned hero, else the pool's next ─── */}
      {(midHero ?? slots.fullbleed1[0]) && (
        <Box h={{ base: '42vh', md: '64vh' }} overflow="hidden">
          <Image
            src={(midHero ?? slots.fullbleed1[0]).fullUrl}
            alt={SPRINKLE_ALT}
            w="100%"
            h="100%"
            objectFit="cover"
            loading="lazy"
          />
        </Box>
      )}

      {/* ─── From the Journal ─── */}
      {featured.length > 0 && (
        <Box bg="white" py={{ base: 14, md: 20 }} px={{ base: 0, md: 0 }}>
          <VStack spacing={3} mb={{ base: 3, md: 4 }} textAlign="center" px={6}>
            <Text textStyle="eyebrow">From the Journal</Text>
            <Box w="35px" h="1px" bg="brand.accent" />
            <Text textStyle="bodyCopy" color="gray.600" maxW="560px">
              Real weddings, planning advice, and notes from behind the lens.
            </Text>
          </VStack>
          <Flex
            overflowX="auto"
            gap={{ base: 3, md: 4 }}
            px={{ base: 4, md: 10 }}
            py={{ base: 4, md: 6 }}
            sx={{
              scrollSnapType: 'x mandatory',
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': { display: 'none' },
              '& > a': { scrollSnapAlign: 'start' },
            }}
          >
            {featured.map((post) => (
              <Box
                key={post.slug}
                as={RouterLink}
                to={`/journal/${post.slug}`}
                role="group"
                position="relative"
                flexShrink={0}
                w={{ base: '240px', md: '300px' }}
                h={{ base: '160px', md: '200px' }}
                borderRadius="sm"
                overflow="hidden"
                bg="brand.surface"
              >
                {post.cover_image_url && (
                  <Image
                    src={post.cover_image_url}
                    alt=""
                    position="absolute"
                    inset={0}
                    w="100%"
                    h="100%"
                    objectFit="cover"
                    transition="transform 0.6s ease"
                    _groupHover={{ transform: 'scale(1.05)' }}
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <Box
                  position="absolute"
                  inset={0}
                  bg="linear-gradient(180deg, rgba(15,15,15,0.05) 30%, rgba(15,15,15,0.62) 100%)"
                />
                <Flex position="relative" direction="column" justify="flex-end" h="100%" p={4}>
                  <Text
                    color="white"
                    textStyle="cardTitle"
                    fontSize={{ base: 'sm', md: 'md' }}
                    noOfLines={2}
                    textShadow="0 1px 8px rgba(0,0,0,0.4)"
                  >
                    {post.title}
                  </Text>
                </Flex>
              </Box>
            ))}
          </Flex>
          <Flex justify="center" mt={{ base: 2, md: 3 }}>
            <CTAButton to="/journal" variant="ghost" size="sm">
              View the full journal
            </CTAButton>
          </Flex>
        </Box>
      )}

      {/* ─── Sprinkle: stagger ─── */}
      {slots.stagger.length === 2 && (
        <Box bg="white" pb={{ base: 12, md: 16 }} px={{ base: 4, md: 8 }}>
          <Grid
            templateColumns={{ base: '1fr', sm: '3fr 2fr' }}
            gap={{ base: 3, md: 4 }}
            maxW="1200px"
            mx="auto"
            alignItems="start"
          >
            <SprinkleTile photo={slots.stagger[0]} ratio={3 / 4} />
            <SprinkleTile photo={slots.stagger[1]} ratio={4 / 5} extraProps={{ mt: { base: 0, sm: 16 } }} />
          </Grid>
        </Box>
      )}

      {/* ─── FAQ ─── */}
      <Box bg="brand.surface" py={{ base: 16, md: 24 }} px={{ base: 6, md: 12 }}>
        <Box maxW="820px" mx="auto">
          <VStack spacing={3} mb={{ base: 8, md: 12 }} textAlign="center">
            <Text textStyle="eyebrow">Wedding Photography FAQ</Text>
            <Box w="35px" h="1px" bg="brand.accent" />
            <Text textStyle="bodyCopy" color="gray.600" maxW="560px">
              The questions every couple asks, answered the way I answer them in my inbox.
            </Text>
          </VStack>
          <Box borderTop="1px solid" borderColor="brand.accentBorder">
            {weddingData.faq.map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </Box>
        </Box>
      </Box>

      {/* ─── Sprinkle: quartet filmstrip ─── */}
      {slots.quartet.length === 4 && (
        <Box bg="white" py={{ base: 12, md: 16 }} px={{ base: 4, md: 8 }}>
          <SimpleGrid columns={{ base: 2, md: 4 }} spacing={{ base: 3, md: 4 }} maxW="1200px" mx="auto">
            {slots.quartet.map((p, i) => (
              <SprinkleTile key={i} photo={p} ratio={3 / 4} />
            ))}
          </SimpleGrid>
        </Box>
      )}

      {/* ─── Recommended vendors ─── */}
      {vendors.length > 0 && (
        <Box bg="white" pb={{ base: 16, md: 24 }} pt={{ base: 4, md: 8 }} px={{ base: 6, md: 12 }}>
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

      {/* ─── Selected work: curated, linked, always present ─── */}
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
          {[...FEATURED.map((p) => ({ kind: 'featured' as const, p })), ...slots.mosaic.map((p) => ({ kind: 'pool' as const, p }))].map(
            (item, i) => {
              const feature = i % 5 === 0;
              const tile =
                item.kind === 'featured' ? (
                  <Box
                    as={RouterLink}
                    to={`/photo/weddings/${item.p.id}`}
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
                      src={photoUrl(item.p.id)}
                      alt={item.p.alt}
                      w="100%"
                      h="100%"
                      objectFit="cover"
                      loading="lazy"
                      decoding="async"
                    />
                  </Box>
                ) : (
                  <Box w="100%" h="100%" overflow="hidden" borderRadius="sm" bg="gray.100">
                    <Image
                      src={feature ? item.p.fullUrl : item.p.url}
                      alt={SPRINKLE_ALT}
                      w="100%"
                      h="100%"
                      objectFit="cover"
                      loading="lazy"
                    />
                  </Box>
                );
              return (
                <GridItem
                  key={i}
                  colSpan={feature ? { base: 2, md: 4 } : { base: 1, md: 2 }}
                  rowSpan={feature ? 2 : 1}
                >
                  {tile}
                </GridItem>
              );
            },
          )}
        </Grid>
        <Flex justify="center" mt={{ base: 10, md: 14 }}>
          <CTAButton to="/gallery/weddings" variant="outline" size="md">
            See the full wedding gallery
          </CTAButton>
        </Flex>
      </Box>

      {/* ─── CTA ─── */}
      <Box position="relative" py={{ base: 16, md: 24 }} px={{ base: 8, md: 12 }} overflow="hidden">
        {ctaHero ? (
          <>
            <Image
              src={ctaHero.fullUrl}
              alt=""
              position="absolute"
              inset={0}
              w="100%"
              h="100%"
              objectFit="cover"
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
              <Text as="h2" textStyle="sectionTitle" color={ctaHero ? 'white' : undefined}>
                Tell me about your day
              </Text>
              <Text textStyle="bodyLead" color={ctaHero ? 'whiteAlpha.900' : undefined}>
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
function FaqItem({ q, a }: { q: string; a: string }) {
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
        <Text textStyle="cardTitle" fontSize={{ base: 'sm', md: 'md' }}>
          {q}
        </Text>
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
          <Text textStyle="bodyCopy" color="gray.600" px={1} pb={open ? 5 : 0} transition="padding 0.25s ease">
            {a}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * One non-interactive sprinkle photograph. `ratio` crops to a fixed
 * shape; `cover` fills the parent grid cell; `full` requests w2000.
 */
function SprinkleTile({
  photo,
  ratio,
  cover,
  full,
  aspect,
  extraProps,
}: {
  photo: WPhoto;
  ratio?: number;
  cover?: boolean;
  full?: boolean;
  aspect?: Record<string, number | string>;
  extraProps?: Record<string, unknown>;
}) {
  const cropped = cover || ratio !== undefined;
  return (
    <Box
      w="100%"
      h={cover ? '100%' : 'auto'}
      bg="gray.100"
      borderRadius="sm"
      overflow="hidden"
      aspectRatio={aspect ?? ratio}
      {...extraProps}
    >
      <Image
        src={full || !cropped ? photo.fullUrl : photo.url}
        alt={SPRINKLE_ALT}
        w="100%"
        h={cropped ? '100%' : 'auto'}
        objectFit={cropped ? 'cover' : undefined}
        display="block"
        loading="lazy"
      />
    </Box>
  );
}

export default Weddings;
