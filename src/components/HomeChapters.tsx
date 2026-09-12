import { Box, VStack, HStack, Text, Flex, Image, SimpleGrid, Grid, GridItem, Icon } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import CTAButton from './ui/CTAButton';
import FaArrowRight from '../icons/fa/FaArrowRight';

/**
 * The two chapters between the hero and the Instagram feed.
 *
 * The homepage used to be hero, Instagram, reviews — the only page on the
 * site that never showed Veronika's own photographs at size, and it read
 * as empty because of it. These sections fix that with work the site
 * already has: the four gallery categories, and whatever she last wrote.
 *
 * Both are self-contained and degrade to nothing: the journal strip only
 * renders once the API answers, so a slow or unreachable endpoint costs
 * the homepage a section, never a broken layout.
 */

const CATEGORIES = [
  { title: 'Weddings', to: '/gallery/weddings', image: '/assets/photos/weddings/newlyweds-running-sea.webp' },
  { title: 'Portraits', to: '/gallery/portraits', image: '/assets/photos/portraits/shadow-play-portrait.webp' },
  { title: 'Family', to: '/gallery/family', image: '/assets/photos/family/elegant-family-studio-portrait-black.webp' },
  { title: 'Maternity', to: '/gallery/maternity', image: '/assets/photos/maternity/couples-beach-baby-bump-moment.webp' },
];

interface JournalPost {
  slug: string;
  title: string;
  excerpt: string;
  cover_image_url: string | null;
  session_type: string | null;
  tags?: string[];
}

export function HomeCategories() {
  return (
    <Box bg="white" py={{ base: 14, md: 20 }}>
      <VStack spacing={3} mb={{ base: 8, md: 12 }} textAlign="center" px={6}>
        <Text textStyle="eyebrow">What I Photograph</Text>
        <Box w="35px" h="1px" bg="brand.accent" />
        <Text textStyle="bodyCopy" color="gray.600" maxW="560px">
          Four ways of telling the same kind of story: the real one.
        </Text>
      </VStack>

      {/* Full-bleed on purpose. Tall panels read as photographs first and
          navigation second, which is the right order on a photographer's
          homepage. */}
      <Grid templateColumns={{ base: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }} gap={{ base: 2, md: 3 }} px={{ base: 2, md: 3 }}>
        {CATEGORIES.map((c) => (
          <GridItem key={c.title}>
            <Box
              as={RouterLink}
              to={c.to}
              role="group"
              display="block"
              position="relative"
              h={{ base: '46vw', lg: '30vw' }}
              maxH={{ lg: '460px' }}
              overflow="hidden"
              borderRadius="sm"
              bg="gray.100"
            >
              <Image
                src={c.image}
                alt=""
                w="100%"
                h="100%"
                objectFit="cover"
                transition="transform 0.7s ease"
                _groupHover={{ transform: 'scale(1.05)' }}
                loading="lazy"
              />
              <Box
                position="absolute"
                inset={0}
                bg="linear-gradient(180deg, rgba(10,8,4,0.05) 40%, rgba(10,8,4,0.62) 100%)"
              />
              <Flex position="absolute" inset={0} align="flex-end" justify="center" pb={{ base: 5, md: 7 }}>
                <VStack spacing={1}>
                  <Text
                    fontFamily="heading"
                    fontWeight="300"
                    fontSize={{ base: '1.3rem', md: '1.7rem' }}
                    color="white"
                    textShadow="0 1px 10px rgba(0,0,0,0.45)"
                  >
                    {c.title}
                  </Text>
                  <Icon
                    as={FaArrowRight}
                    boxSize={3}
                    color="brand.accent"
                    opacity={0}
                    transform="translateX(-4px)"
                    transition="opacity 0.25s ease, transform 0.25s ease"
                    _groupHover={{ opacity: 1, transform: 'translateX(0)' }}
                  />
                </VStack>
              </Flex>
            </Box>
          </GridItem>
        ))}
      </Grid>

      <Flex justify="center" mt={{ base: 8, md: 12 }}>
        <CTAButton to="/gallery" variant="outline" size="md">
          See the full portfolio
        </CTAButton>
      </Flex>
    </Box>
  );
}

export function HomeJournal() {
  const [posts, setPosts] = useState<JournalPost[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/journal/list');
        const data = await res.json();
        if (cancelled || !res.ok || !data.success) return;
        setPosts((data.posts as JournalPost[]).slice(0, 3));
      } catch {
        // A missing journal costs the homepage a section, nothing more.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (posts.length === 0) return null;

  return (
    <Box bg="brand.surface" py={{ base: 14, md: 20 }} px={{ base: 6, md: 12 }}>
      <VStack spacing={3} mb={{ base: 8, md: 12 }} textAlign="center">
        <Text textStyle="eyebrow">From the Journal</Text>
        <Box w="35px" h="1px" bg="brand.accent" />
        <Text textStyle="bodyCopy" color="gray.600" maxW="560px">
          Recent weddings, and what I have learned photographing them.
        </Text>
      </VStack>

      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={{ base: 6, md: 7 }} maxW="1100px" mx="auto">
        {posts.map((p) => {
          const isAdvice =
            p.session_type === 'article' || (p.tags ?? []).some((t) => /advice|guide/i.test(t));
          return (
            <Box key={p.slug} as={RouterLink} to={`/journal/${p.slug}`} role="group" display="block">
              <Box aspectRatio={4 / 3} overflow="hidden" borderRadius="sm" bg="white" position="relative">
                {p.cover_image_url && (
                  <Image
                    src={p.cover_image_url}
                    alt=""
                    w="100%"
                    h="100%"
                    objectFit="cover"
                    transition="transform 0.6s ease"
                    _groupHover={{ transform: 'scale(1.04)' }}
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                )}
                <Box
                  position="absolute"
                  left={3}
                  bottom={3}
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
              </Box>
              <Text
                fontFamily="heading"
                fontWeight="400"
                fontSize={{ base: '1.15rem', md: '1.25rem' }}
                lineHeight="1.3"
                mt={4}
                noOfLines={2}
                _groupHover={{ color: 'brand.accentText' }}
                transition="color 0.2s"
              >
                {p.title}
              </Text>
              {p.excerpt && (
                <Text textStyle="bodyCopy" color="gray.600" mt={2} noOfLines={2}>
                  {p.excerpt}
                </Text>
              )}
            </Box>
          );
        })}
      </SimpleGrid>

      <Flex justify="center" mt={{ base: 8, md: 12 }}>
        <CTAButton to="/journal" variant="ghost" size="sm">
          Read the journal
        </CTAButton>
      </Flex>
    </Box>
  );
}

/** Closing invitation, so the homepage ends on an ask rather than a feed. */
export function HomeClosing() {
  return (
    <Box position="relative" py={{ base: 16, md: 22 }} px={6} overflow="hidden" sx={{ isolation: 'isolate' }}>
      <Image
        src="/assets/photos/site/weddings-hero.webp"
        alt=""
        position="absolute"
        inset={0}
        w="100%"
        h="100%"
        objectFit="cover"
        objectPosition="center 45%"
        zIndex={-2}
        loading="lazy"
      />
      <Box position="absolute" inset={0} bg="rgba(12,10,6,0.58)" zIndex={-1} />
      <VStack spacing={6} textAlign="center" maxW="620px" mx="auto">
        <Text textStyle="eyebrowOnDark">Work With Me</Text>
        <Box w="35px" h="1px" bg="brand.accent" />
        <Text
          fontFamily="heading"
          fontWeight="300"
          fontSize={{ base: '1.6rem', md: '2.2rem' }}
          lineHeight="1.35"
          color="white"
        >
          Tell me about your day, and I will tell you how I would photograph it.
        </Text>
        <HStack spacing={4} flexWrap="wrap" justify="center">
          <CTAButton to="/contact" variant="solid" size="lg">
            Book a Session
          </CTAButton>
          <CTAButton to="/wedding-photography" variant="outline" size="lg">
            Wedding packages
          </CTAButton>
        </HStack>
      </VStack>
    </Box>
  );
}
