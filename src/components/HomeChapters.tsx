import { Box, VStack, Text, Flex, Image, SimpleGrid, Icon } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import FaArrowRight from '../icons/fa/FaArrowRight';

/**
 * The chapter row between the hero and the Instagram feed: three cards,
 * one shape.
 *
 * EVERY card is four-fifths specific content and one-fifth a bar to the
 * section it belongs to. The Work stacks the four gallery categories,
 * each with the hero photograph its own category page uses, over a bar
 * to the whole portfolio. The Journal shows one real entry over a bar to
 * the journal. Weddings shows the coverage page over a bar to the
 * wedding gallery. Top half takes you somewhere specific, bottom bar
 * takes you to the whole thing.
 */

interface JournalPost {
  slug: string;
  title: string;
  excerpt: string;
  cover_image_url: string | null;
  session_type: string | null;
  tags?: string[];
}

/** Category hero photographs, matching categoryDetails in Gallery.tsx. */
const CATEGORIES = [
  { title: 'Weddings', to: '/gallery/weddings', image: '/assets/photos/weddings/newlyweds-running-sea.webp', pos: 'center 25%' },
  { title: 'Portraits', to: '/gallery/portraits', image: '/assets/photos/portraits/shadow-play-portrait.webp', pos: 'center 50%' },
  { title: 'Family', to: '/gallery/family', image: '/assets/photos/family/elegant-family-studio-portrait-black.webp', pos: 'center 40%' },
  { title: 'Maternity', to: '/gallery/maternity', image: '/assets/photos/maternity/couples-beach-baby-bump-moment.webp', pos: 'center 35%' },
];

const GALLERY_HERO = '/assets/photos/portraits/sunset-sunflower-field-joy.webp';
/** The weddings page's MOBILE hero: the desktop frame crops badly this narrow. */
const WEDDINGS_CARD_IMAGE = '/assets/photos/weddings/ocean-vows-ceremony.webp';

const CARD_H = { base: '86vw', sm: '62vw', lg: '34vw' } as const;
const CARD_MIN = { base: '420px', lg: '460px' } as const;
const CARD_MAX = { lg: '560px' } as const;

/** The shared bottom bar: label, arrow, its own photograph behind a scrim. */
function CardBar({ to, label, image, pos = 'center' }: { to: string; label: string; image: string; pos?: string }) {
  return (
    <Box as={RouterLink} to={to} role="group" display="block" position="relative" flex="1 0 20%" overflow="hidden">
      <Image
        src={image}
        alt=""
        position="absolute"
        inset={0}
        w="100%"
        h="100%"
        objectFit="cover"
        objectPosition={pos}
        transition="transform 0.8s ease"
        _groupHover={{ transform: 'scale(1.06)' }}
        loading="lazy"
      />
      <Box position="absolute" inset={0} bg="rgba(12,10,6,0.62)" transition="background 0.3s ease" _groupHover={{ bg: 'rgba(12,10,6,0.5)' }} />
      <Flex position="relative" h="100%" align="center" justify="space-between" px={{ base: 5, md: 6 }}>
        <Text textStyle="ctaLabel" color="white">
          {label}
        </Text>
        <Icon
          as={FaArrowRight}
          boxSize={3}
          color="brand.accent"
          transition="transform 0.25s ease"
          _groupHover={{ transform: 'translateX(4px)' }}
        />
      </Flex>
    </Box>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <Flex
      direction="column"
      h={CARD_H}
      minH={CARD_MIN}
      maxH={CARD_MAX}
      borderRadius="sm"
      overflow="hidden"
      bg="gray.100"
      boxShadow="0 18px 44px -30px rgba(20, 15, 5, 0.55)"
    >
      {children}
    </Flex>
  );
}

export function HomeChapters() {
  const [post, setPost] = useState<JournalPost | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/journal/list');
        const data = await res.json();
        if (cancelled || !res.ok || !data.success) return;
        const posts = data.posts as JournalPost[];
        if (posts.length === 0) return;
        // A different entry per visit, so the homepage is never the same
        // twice. Runtime only — never at import time, where it would be
        // baked into the prerendered HTML.
        setPost(posts[Math.floor(Math.random() * posts.length)]);
      } catch {
        // Card keeps its static fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdvice =
    post?.session_type === 'article' || (post?.tags ?? []).some((t) => /advice|guide/i.test(t));

  return (
    <Box bg="white" py={{ base: 14, md: 20 }} px={{ base: 4, md: 8 }}>
      <VStack spacing={3} mb={{ base: 8, md: 12 }} textAlign="center">
        <Text textStyle="eyebrow">Where to Begin</Text>
        <Box w="40px" h="1px" bg="brand.accent" />
      </VStack>

      <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={{ base: 5, md: 6 }} maxW="1300px" mx="auto">
        {/* ── The Work: four categories stacked, portfolio bar beneath ── */}
        <CardShell>
          <Flex direction="column" flex="4 0 80%">
            {CATEGORIES.map((c) => (
              <Box
                key={c.title}
                as={RouterLink}
                to={c.to}
                role="group"
                display="block"
                position="relative"
                flex="1"
                overflow="hidden"
                borderBottom="1px solid"
                borderColor="whiteAlpha.400"
              >
                <Image
                  src={c.image}
                  alt=""
                  position="absolute"
                  inset={0}
                  w="100%"
                  h="100%"
                  objectFit="cover"
                  objectPosition={c.pos}
                  transition="transform 0.8s ease"
                  _groupHover={{ transform: 'scale(1.06)' }}
                  loading="lazy"
                />
                <Box
                  position="absolute"
                  inset={0}
                  bg="rgba(12,10,6,0.38)"
                  transition="background 0.3s ease"
                  _groupHover={{ bg: 'rgba(12,10,6,0.2)' }}
                />
                <Flex position="relative" h="100%" align="center" px={{ base: 5, md: 6 }} gap={3}>
                  <Text
                    fontFamily="heading"
                    fontWeight="300"
                    fontSize={{ base: '1.35rem', md: '1.5rem' }}
                    color="white"
                    textShadow="0 1px 10px rgba(0,0,0,0.5)"
                  >
                    {c.title}
                  </Text>
                  <Icon
                    as={FaArrowRight}
                    boxSize={3}
                    color="brand.accent"
                    opacity={0}
                    transform="translateX(-6px)"
                    transition="opacity 0.25s ease, transform 0.25s ease"
                    _groupHover={{ opacity: 1, transform: 'translateX(0)' }}
                  />
                </Flex>
              </Box>
            ))}
          </Flex>
          <CardBar to="/gallery" label="See the full portfolio" image={GALLERY_HERO} pos="center 30%" />
        </CardShell>

        {/* ── The Journal: one entry, journal bar beneath ── */}
        <CardShell>
          <Box
            as={RouterLink}
            to={post ? `/journal/${post.slug}` : '/journal'}
            role="group"
            display="block"
            position="relative"
            flex="4 0 80%"
            overflow="hidden"
          >
            <Image
              src={post?.cover_image_url ?? '/assets/photos/site/journal-hero.webp'}
              alt=""
              position="absolute"
              inset={0}
              w="100%"
              h="100%"
              objectFit="cover"
              objectPosition="center 45%"
              transition="transform 0.8s ease"
              _groupHover={{ transform: 'scale(1.05)' }}
              loading="lazy"
              onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = '0';
              }}
            />
            <Box
              position="absolute"
              inset={0}
              bg="linear-gradient(180deg, rgba(10,8,4,0.14) 34%, rgba(10,8,4,0.55) 70%, rgba(10,8,4,0.82) 100%)"
            />
            {post && (
              <Box
                position="absolute"
                top={4}
                left={4}
                fontSize="9px"
                fontWeight="500"
                letterSpacing="0.16em"
                textTransform="uppercase"
                px={2}
                py={1}
                borderRadius="2px"
                bg={isAdvice ? 'rgba(201,169,110,0.92)' : 'blackAlpha.600'}
                color={isAdvice ? '#1c1509' : 'white'}
              >
                {isAdvice ? 'Advice' : 'Real Wedding'}
              </Box>
            )}
            <Flex position="absolute" inset={0} direction="column" justify="flex-end" p={{ base: 6, md: 7 }}>
              <Text textStyle="eyebrowOnDark">From the Journal</Text>
              <Text
                fontFamily="heading"
                fontWeight="300"
                fontSize={{ base: '1.5rem', md: '1.7rem' }}
                lineHeight="1.2"
                color="white"
                mt={2}
                noOfLines={2}
                textShadow="0 1px 12px rgba(0,0,0,0.5)"
              >
                {post?.title ?? 'Stories from behind the lens'}
              </Text>
              {post?.excerpt && (
                <Text textStyle="bodyCopy" color="whiteAlpha.900" mt={2} noOfLines={2}>
                  {post.excerpt}
                </Text>
              )}
            </Flex>
          </Box>
          <CardBar
            to="/journal"
            label="Explore the journal"
            image="/assets/photos/site/journal-hero.webp"
            pos="center 55%"
          />
        </CardShell>

        {/* ── Weddings: the coverage page, wedding gallery bar beneath ── */}
        <CardShell>
          <Box
            as={RouterLink}
            to="/wedding-photography"
            role="group"
            display="block"
            position="relative"
            flex="4 0 80%"
            overflow="hidden"
          >
            <Image
              src={WEDDINGS_CARD_IMAGE}
              alt=""
              position="absolute"
              inset={0}
              w="100%"
              h="100%"
              objectFit="cover"
              objectPosition="center 35%"
              transition="transform 0.8s ease"
              _groupHover={{ transform: 'scale(1.05)' }}
              loading="lazy"
            />
            <Box
              position="absolute"
              inset={0}
              bg="linear-gradient(180deg, rgba(10,8,4,0.14) 34%, rgba(10,8,4,0.55) 70%, rgba(10,8,4,0.82) 100%)"
            />
            <Flex position="absolute" inset={0} direction="column" justify="flex-end" p={{ base: 6, md: 7 }}>
              <Text textStyle="eyebrowOnDark">Weddings</Text>
              <Text
                fontFamily="heading"
                fontWeight="300"
                fontSize={{ base: '1.5rem', md: '1.7rem' }}
                lineHeight="1.2"
                color="white"
                mt={2}
                textShadow="0 1px 12px rgba(0,0,0,0.5)"
              >
                Coverage, planning help, honest answers
              </Text>
              <Text textStyle="bodyCopy" color="whiteAlpha.900" mt={2} noOfLines={2}>
                Packages from intimate ceremonies to full days, and everything couples ask me
                before they book.
              </Text>
            </Flex>
          </Box>
          <CardBar
            to="/gallery/weddings"
            label="See the wedding gallery"
            image="/assets/photos/weddings/newlyweds-running-sea.webp"
            pos="center 25%"
          />
        </CardShell>
      </SimpleGrid>
    </Box>
  );
}
