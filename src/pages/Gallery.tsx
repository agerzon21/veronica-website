import { Box, Text, Flex, VStack, Image, Spinner } from '@chakra-ui/react';
import { useParams, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowBackIcon } from '@chakra-ui/icons';
import { Helmet } from 'react-helmet-async';
import PageHeader from '../components/ui/PageHeader';
import { motion } from 'framer-motion';
import GalleryCategories from '../components/GalleryCategories';
import GalleryGrid from '../components/GalleryGrid';

// Match the shape /api/gallery returns — kept local here (rather
// than a shared type file) since the API is the source of truth and
// the extra fields (originalUrl, driveViewUrl) are optional for
// consumers that don't need them.
export type Category = 'portraits' | 'weddings' | 'family' | 'maternity';

interface PublicPhoto {
  id: string;
  slug: string;
  category: Category;
  url: string;
  originalUrl?: string;
  driveViewUrl?: string;
  alt: string;
  title: string;
  description: string;
  keywords: string[];
  width: number | null;
  height: number | null;
}

const MotionDiv = motion.div;

const GALLERY_HERO_IMAGE = '/assets/photos/portraits/sunset-sunflower-field-joy.webp';

export const categoryDetails: Record<Category, {
  title: string;
  description: string;
  image: string;
  backgroundPosition: string;
}> = {
  portraits: {
    title: 'Portraits',
    description: 'Capturing the essence of individuals through stunning portrait photography.',
    image: '/assets/photos/portraits/shadow-play-portrait.webp',
    backgroundPosition: 'center 50%',
  },
  weddings: {
    title: 'Weddings',
    description: 'Documenting your special day with beautiful and timeless wedding photography.',
    image: '/assets/photos/weddings/newlyweds-running-sea.webp',
    backgroundPosition: 'center 25%',
  },
  family: {
    title: 'Family',
    description: 'Preserving precious family moments with heartfelt photography sessions.',
    image: '/assets/photos/family/elegant-family-studio-portrait-black.webp',
    backgroundPosition: 'center 40%',
  },
  maternity: {
    title: 'Maternity',
    description: 'Celebrating the beauty of pregnancy with elegant maternity photography.',
    image: '/assets/photos/maternity/couples-beach-baby-bump-moment.webp',
    backgroundPosition: 'center 35%',
  },
};

const Gallery = () => {
  const { category } = useParams();
  const [images, setImages] = useState<PublicPhoto[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch photos for the current category. Runs on category change
  // (initial mount + navigation between categories). We set the
  // array to `null` while loading so the JSX below can distinguish
  // "no data yet" from "loaded but empty".
  useEffect(() => {
    if (!category) return;
    let cancelled = false;
    setImages(null);
    setLoadError(null);
    (async () => {
      try {
        const res = await fetch(`/api/gallery/list?category=${encodeURIComponent(category)}`);
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data.success) {
          // Randomize order so gallery browsing feels fresh each
          // visit — matches the previous CSV-based behavior.
          const shuffled = [...(data.photos as PublicPhoto[])].sort(() => Math.random() - 0.5);
          setImages(shuffled);
        } else {
          setLoadError(data.error || 'Could not load photos.');
          setImages([]);
        }
      } catch {
        if (!cancelled) {
          setLoadError('Could not reach the server.');
          setImages([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category]);

  if (!category) {
    return (
      <Box minH="100vh" bg="white">
        <Helmet>
          <meta property="og:image" content={`https://vero.photography${GALLERY_HERO_IMAGE}`} />
        </Helmet>
        {/* Hero */}
        <Box position="relative" h={{ base: '45vh', lg: '50vh' }} overflow="hidden">
          <Image
            src={GALLERY_HERO_IMAGE}
            alt="Gallery"
            objectFit="cover"
            objectPosition="center 15%"
            w="100%"
            h="100%"
          />
          <Box position="absolute" inset={0} bg="rgba(0,0,0,0.5)" />
          <Flex
            position="absolute"
            inset={0}
            align="center"
            justify="center"
          >
            <MotionDiv
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            >
              <Box px={6}>
                <PageHeader
                  onDark
                  eyebrow="Portfolio"
                  title="A collection of my recent work"
                />
              </Box>
            </MotionDiv>
          </Flex>
        </Box>

        {/* Categories */}
        <GalleryCategories />
      </Box>
    );
  }

  const categoryInfo = categoryDetails[category as Category];

  if (!categoryInfo) {
    return null;
  }

  return (
    <Box minH="100vh" bg="white">
      <Helmet>
        <meta property="og:image" content={`https://vero.photography${categoryInfo.image}`} />
      </Helmet>
      {/* Category Hero */}
      <Box position="relative" h={{ base: '40vh', lg: '45vh' }} overflow="hidden">
        <Image
          src={categoryInfo.image}
          alt={categoryInfo.title}
          objectFit="cover"
          objectPosition={categoryInfo.backgroundPosition}
          w="100%"
          h="100%"
        />
        <Box position="absolute" inset={0} bg="rgba(0,0,0,0.5)" />
        <Flex
          position="absolute"
          inset={0}
          pt="36px"
          align="center"
          justify="center"
        >
          <MotionDiv
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <VStack spacing={4} textAlign="center" px={6}>
              <Text
                fontSize="xs"
                fontWeight="500"
                textTransform="uppercase"
                letterSpacing="0.2em"
                color="brand.accent"
              >
                Gallery
              </Text>
              <Box w="35px" h="1px" bg="brand.accent" />
              <Text
                as="h1"
                fontSize={{ base: '2xl', md: '3xl', lg: '4xl' }}
                fontWeight="200"
                color="white"
                lineHeight="1.4"
                m={0}
              >
                {categoryInfo.title}
              </Text>
            </VStack>
          </MotionDiv>
        </Flex>

        {/* Back Button */}
        <Box
          position="absolute"
          top="calc(50% + 18px)"
          left={{ base: 4, md: 8 }}
          transform="translateY(-50%)"
          zIndex={2}
        >
          <Link to="/gallery" style={{ textDecoration: 'none' }}>
            <Flex
              align="center"
              color="whiteAlpha.800"
              transition="all 0.3s"
              _hover={{ color: 'brand.accent' }}
              cursor="pointer"
              gap={2}
            >
              <ArrowBackIcon />
              <Text
                fontSize="xs"
                fontWeight="400"
                letterSpacing="0.15em"
                textTransform="uppercase"
              >
                Back
              </Text>
            </Flex>
          </Link>
        </Box>
      </Box>

      {/* Images Grid */}
      <Box py={{ base: 6, md: 10 }} px={{ base: 4, md: 12 }}>
        {images === null ? (
          // Initial fetch — before we know how many tiles there are.
          // Center a spinner + subtle label so the empty space reads
          // as intentional loading rather than a broken page. Once
          // the API responds, GalleryGrid takes over and shows the
          // cream-placeholder tiles while individual Drive-proxy
          // images stream in.
          <Flex justify="center" align="center" direction="column" gap={3} py={20}>
            <Spinner color="brand.accent" size="lg" thickness="2px" />
            <Text
              fontSize="xs"
              color="gray.400"
              fontWeight="300"
              letterSpacing="0.2em"
              textTransform="uppercase"
            >
              Loading gallery…
            </Text>
          </Flex>
        ) : loadError && images.length === 0 ? (
          <Flex justify="center" py={16}>
            <Text color="red.500" fontSize="sm">{loadError}</Text>
          </Flex>
        ) : (
          <GalleryGrid images={images} category={category} />
        )}
      </Box>
    </Box>
  );
};

export default Gallery;
