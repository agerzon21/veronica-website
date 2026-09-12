import { Box, Text, Flex, Image, SimpleGrid, Icon } from '@chakra-ui/react';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import FaArrowRight from '../icons/fa/FaArrowRight';

/**
 * The single chapter row between the hero and the Instagram feed.
 *
 * Three doors, one row: the portfolio, the latest journal entry, and the
 * wedding packages. It replaces what were two separate stacked sections
 * (a category band and a journal strip) — Alex wanted one artsy row that
 * also carries weddings, rather than three vertical stops.
 *
 * The journal panel is the only live one: it shows whatever Veronika
 * published last. If that request fails the panel keeps its frame and
 * falls back to a static invitation, so the row never renders with a
 * hole in it.
 */

interface JournalPost {
  slug: string;
  title: string;
  cover_image_url: string | null;
  session_type: string | null;
  tags?: string[];
}

interface PanelProps {
  eyebrow: string;
  title: string;
  cta: string;
  to: string;
  image: string;
  objectPosition?: string;
  badge?: string | null;
}

function Panel({ eyebrow, title, cta, to, image, objectPosition = 'center', badge }: PanelProps) {
  return (
    <Box
      as={RouterLink}
      to={to}
      role="group"
      display="block"
      position="relative"
      h={{ base: '62vw', sm: '48vw', lg: '32vw' }}
      minH={{ base: '300px', lg: '380px' }}
      maxH={{ lg: '520px' }}
      overflow="hidden"
      borderRadius="sm"
      bg="gray.100"
    >
      <Image
        src={image}
        alt=""
        w="100%"
        h="100%"
        objectFit="cover"
        objectPosition={objectPosition}
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
        bg="linear-gradient(180deg, rgba(10,8,4,0.12) 30%, rgba(10,8,4,0.52) 72%, rgba(10,8,4,0.78) 100%)"
      />

      {badge && (
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
          bg="rgba(201,169,110,0.92)"
          color="#1c1509"
        >
          {badge}
        </Box>
      )}

      <Flex position="absolute" inset={0} direction="column" justify="flex-end" p={{ base: 6, md: 7 }}>
        <Text textStyle="eyebrowOnDark">{eyebrow}</Text>
        <Text
          fontFamily="heading"
          fontWeight="300"
          fontSize={{ base: '1.5rem', md: '1.75rem' }}
          lineHeight="1.2"
          color="white"
          mt={2}
          noOfLines={2}
          textShadow="0 1px 12px rgba(0,0,0,0.5)"
        >
          {title}
        </Text>
        <Flex
          align="center"
          gap={2}
          mt={4}
          color="white"
          borderTop="1px solid"
          borderColor="whiteAlpha.400"
          pt={3}
          transition="color 0.25s ease, border-color 0.25s ease"
          _groupHover={{ color: 'brand.accent', borderColor: 'brand.accent' }}
        >
          <Text textStyle="ctaLabel">{cta}</Text>
          <Icon
            as={FaArrowRight}
            boxSize={3}
            transition="transform 0.25s ease"
            _groupHover={{ transform: 'translateX(4px)' }}
          />
        </Flex>
      </Flex>
    </Box>
  );
}

export function HomeChapters() {
  const [latest, setLatest] = useState<JournalPost | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/journal/list');
        const data = await res.json();
        if (cancelled || !res.ok || !data.success) return;
        // The list arrives newest first, which is the one we want.
        setLatest((data.posts as JournalPost[])[0] ?? null);
      } catch {
        // Panel keeps its static fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdvice =
    latest?.session_type === 'article' ||
    (latest?.tags ?? []).some((t) => /advice|guide/i.test(t));

  return (
    <Box bg="white" py={{ base: 14, md: 20 }} px={{ base: 4, md: 8 }}>
      <SimpleGrid columns={{ base: 1, lg: 3 }} spacing={{ base: 4, md: 5 }} maxW="1300px" mx="auto">
        <Panel
          eyebrow="The Work"
          title="Weddings, portraits, families and maternity"
          cta="See the portfolio"
          to="/gallery"
          image="/assets/photos/site/home-cta-bg.webp"
          objectPosition="center 45%"
        />
        <Panel
          eyebrow="From the Journal"
          title={latest?.title ?? 'Stories from behind the lens'}
          cta="Explore the journal"
          to={latest ? `/journal/${latest.slug}` : '/journal'}
          image={latest?.cover_image_url ?? '/assets/photos/site/journal-hero.webp'}
          objectPosition="center 45%"
          badge={latest ? (isAdvice ? 'Advice' : 'Real Wedding') : null}
        />
        <Panel
          eyebrow="Weddings"
          title="Coverage, planning help, honest answers"
          cta="Wedding packages"
          to="/wedding-photography"
          image="/assets/photos/site/weddings-hero.webp"
          objectPosition="center 45%"
        />
      </SimpleGrid>
    </Box>
  );
}
