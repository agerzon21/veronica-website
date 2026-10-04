import React, { useEffect, useState, useRef } from 'react';
import {
  Box,
  Container,
  Image,
  Text,
  VStack,
  Flex,
  SimpleGrid,
  Tag,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { CloseIcon } from '@chakra-ui/icons';
import FaRegCopy from '../icons/fa/FaRegCopy';
import FaShareAlt from '../icons/fa/FaShareAlt';
import { useCopyNotification } from '../components/CopyNotification';
import LoadingImage from '../components/ui/LoadingImage';
import PageHeader from '../components/ui/PageHeader';
import Reveal from '../components/ui/Reveal';
import CTAButton from '../components/ui/CTAButton';
import { useParams, Link } from 'react-router-dom';
import { useSmartBack } from '../components/ui/useSmartBack';
import { Helmet } from 'react-helmet-async';
import { m, AnimatePresence } from 'framer-motion';
import { gridSrcSet } from '../utils/gridSrcSet';
import type { GalleryCategory } from '../data/gallery-categories';

// Photo shape mirrors what /api/gallery/post returns. Kept local so
// this component doesn't need photos.ts at all (which used to
// import the whole CSV synchronously at module load).
interface Photo {
  id: string;
  slug: string;
  category: GalleryCategory;
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

/**
 * Chakra's md breakpoint and the width at which the related grid's Container
 * stops growing, both as media conditions. In em, and the tile widths below in
 * rem, so that a reader whose default font size is not 16px gets a `sizes`
 * that moves with the layout instead of one that disagrees with it: Chakra
 * writes its own breakpoints in em, and nothing sets an html font-size.
 */
const BELOW_MD = '(max-width: 47.99em)';
const BELOW_CONTENT_CAP = '(max-width: 66.49em)';

/**
 * Ask for 8% more than the tile paints, so no thumbnail is rasterised 1:1.
 *
 * This is the same call scripts/build-grid-variants.mjs makes when it explains
 * why the top rung is 1600 and not 1440: a candidate that merely MATCHES the
 * device pixels loses the supersampling that made the page look the way it
 * does. Measured here as mean absolute Laplacian of what Chrome painted into
 * the 187x220 tile at DPR 2, as a share of what the original gives:
 *
 *   photograph                       g400   g800   g1600
 *   bride-groom-sofa-quiet-bw         47%    71%     86%
 *   bride-groom-under-veil-smiles     52%    73%     88%
 *   cupcake-kiss-reception            28%    48%     68%
 *   sunset-sunflower-field-joy        22%    45%     70%
 *
 * A 412px phone at DPR 2 paints a 187px tile into 374 device px, so without
 * this it takes the 400 rung at a 1.07x margin, which is the first column.
 * There is nothing between 400 and 800, so the only lever is to ask for more.
 *
 * 1.08 IS DELIBERATELY SMALL, and the window is narrow. Anything over 1.070
 * moves that tile up a rung, which is the point. Anything over 1.096 ALSO
 * drags every viewport from 734 to 767 CSS px at DPR 2 (the iPad mini among
 * them) from the 800 rung to 1600, which buys nothing: those tiles are already
 * at 1.10x. Swept over all 232 photographs at 18 real viewport widths and DPR
 * 1, 2 and 3, per six tiles, averaged over the 198 with files in this checkout:
 *
 *   412 or 414 CSS px, DPR 2    190 KiB -> 349 KiB   margin 1.07x -> 2.14x
 *   734 to 767 CSS px, DPR 2    349 KiB   unchanged  (1.15 would make it 1091)
 *   every other width and DPR   within 10 KiB of unchanged
 *
 * against 3,252 KiB of full originals today. Worst margin anywhere goes from
 * 1.011x to 1.081x, and nothing is ever served under 1.0x, which is the line
 * that actually matters. If the 220px/300px tile heights or the px={4}/px={8}
 * gutters change, that window moves: re-measure rather than assume.
 */
const TILE_SUPERSAMPLE = 1.08;
const scalePx = (n: number) => `${Math.ceil(n * TILE_SUPERSAMPLE)}px`;
const SMALL_TILE = `calc(${+(50 * TILE_SUPERSAMPLE).toFixed(4)}vw - ${+(1.1875 * TILE_SUPERSAMPLE).toFixed(4)}rem)`;
const WIDE_TILE = `calc(${+((100 / 3) * TILE_SUPERSAMPLE).toFixed(4)}vw - ${+((5 / 3) * TILE_SUPERSAMPLE).toFixed(4)}rem)`;
const CAPPED_TILE = `${+(20.5 * TILE_SUPERSAMPLE).toFixed(4)}rem`;

/**
 * The `sizes` for one related-photo tile, which is NOT the tile's width.
 *
 * These tiles are object-fit: cover in a FIXED-HEIGHT box, so the browser
 * scales the photograph until it covers the box and then crops. The painted
 * width is max(boxWidth, boxHeight * aspect), and for a landscape frame the
 * second term wins by a lot: a 3:2 photograph in the 187x220 mobile tile is
 * painted 330 CSS px wide, not 187. Handing the box width to `sizes` would
 * have put that frame on the 400 rung at DPR 1.75 where it needs 578 device
 * px, and a soft photograph on this site is worse than a slow page.
 *
 * The geometry, every number below read back off the built page in Chrome:
 *
 *   below md: 2 columns, 220px tall, wrapper px={4} (1rem a side),
 *     SimpleGrid spacing={1.5} (0.375rem)
 *     tile width = 50vw - 1.1875rem        ->  187px at a 412px viewport
 *                                              365px at 767px
 *   md up to the cap: 3 columns, 300px tall, wrapper px={8} (2rem a side),
 *     spacing={2} (0.5rem)
 *     tile width = 33.3333vw - 1.6667rem   ->  229px at 768px, 328px at 1063px
 *   at the cap (Container maxW="content" = 62.5rem, from 66.5rem of viewport)
 *     tile width = (62.5rem - 1rem) / 3 = 20.5rem = 328px
 *
 * In the first two ranges the fixed cover width and the viewport-relative tile
 * width cross over, so each range gets the fixed px up to its crossover and the
 * calc() above it. Only the crossovers are in px, and a crossover is by
 * definition the point where the two candidates are equal, so a reader at a
 * 20px default font size is served a value at most 3.5% under the true painted
 * width there.
 */
function relatedTileSizes(width: number | null, height: number | null): string {
  // No dims means no aspect to work from, so assume the widest frame in the
  // published set (1.669:1) and over-fetch rather than under-sample. All 232
  // published photographs carry dims today; this is the belt to that braces.
  const aspect = width && height ? width / height : 1.669;
  const parts: string[] = [];

  // The crossovers stay on the UNSCALED geometry: both candidates carry the
  // same factor, so the viewport at which they swap does not move.
  const coverSmall = 220 * aspect;
  const crossSmall = 2 * (Math.ceil(coverSmall) + 19);
  if (crossSmall >= 767) {
    parts.push(`${BELOW_MD} ${scalePx(coverSmall)}`);
  } else {
    parts.push(`(max-width: ${crossSmall}px) ${scalePx(coverSmall)}`);
    parts.push(`${BELOW_MD} ${SMALL_TILE}`);
  }

  const coverWide = 300 * aspect;
  const crossWide = 3 * Math.ceil(coverWide) + 80;
  if (crossWide >= 1063) {
    parts.push(`${BELOW_CONTENT_CAP} ${scalePx(coverWide)}`);
  } else {
    if (crossWide > 768) parts.push(`(max-width: ${crossWide}px) ${scalePx(coverWide)}`);
    parts.push(`${BELOW_CONTENT_CAP} ${WIDE_TILE}`);
  }

  // Past the cap the tile is a flat 20.5rem, but a wide frame still covers wider.
  parts.push(coverWide > 328 ? scalePx(coverWide) : CAPPED_TILE);
  return parts.join(', ');
}

const IndividualPhoto: React.FC = () => {
  const { category, photoId } = useParams<{ category: string; photoId: string }>();
  // Called up here, before any early return, because hooks cannot be
  // conditional, the label is derived from the route param rather than the
  // fetched photo for the same reason.
  const back = useSmartBack({
    to: `/gallery/${category}`,
    label: `Back to ${category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Gallery'}`,
  });
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [loading, setLoading] = useState(true);
  // True only when the API said 404, the slug genuinely doesn't exist.
  // A transient failure (5xx, network) also leaves photo null, but must NOT
  // send noindex: Googlebot rendering a live page during an API hiccup would
  // otherwise see a noindex on a perfectly good URL.
  const [gone, setGone] = useState(false);
  const [relatedPhotos, setRelatedPhotos] = useState<Photo[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dragDistanceRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const { show: showCopied, Notification: CopyNotification } = useCopyNotification();

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    if (!isFullscreen) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  };

  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsFullscreen(false);
      };
      window.addEventListener('keydown', handleKey);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handleKey);
      };
    } else {
      document.body.style.overflow = '';
    }
  }, [isFullscreen]);

  useEffect(() => {
    if (!isFullscreen) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.95 : 1.05;
      setScale((prev) => Math.max(0.1, Math.min(5, prev * delta)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [isFullscreen]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragDistanceRef.current = 0;
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      dragDistanceRef.current += Math.abs(e.movementX) + Math.abs(e.movementY);
      setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDistRef = useRef<number | null>(null);
  const touchDragDistRef = useRef(0);
  const wasPinchingRef = useRef(false);

  const getTouchDist = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && !wasPinchingRef.current) {
      touchDragDistRef.current = 0;
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastPinchDistRef.current = null;
    } else if (e.touches.length === 2) {
      wasPinchingRef.current = true;
      lastTouchRef.current = null;
      lastPinchDistRef.current = getTouchDist(e.touches[0], e.touches[1]);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    if (e.touches.length === 1 && lastTouchRef.current && !wasPinchingRef.current) {
      const dx = e.touches[0].clientX - lastTouchRef.current.x;
      const dy = e.touches[0].clientY - lastTouchRef.current.y;
      touchDragDistRef.current += Math.abs(dx) + Math.abs(dy);
      setPosition((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && lastPinchDistRef.current !== null) {
      const newDist = getTouchDist(e.touches[0], e.touches[1]);
      const ratio = newDist / lastPinchDistRef.current;
      setScale((prev) => Math.max(0.1, Math.min(5, prev * ratio)));
      lastPinchDistRef.current = newDist;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      if (touchDragDistRef.current < 10 && !wasPinchingRef.current) {
        toggleFullscreen();
      }
      lastTouchRef.current = null;
      lastPinchDistRef.current = null;
      wasPinchingRef.current = false;
    } else if (e.touches.length === 1) {
      lastTouchRef.current = null;
      lastPinchDistRef.current = null;
    }
  };

  // Fetch the main photo and its related photos in parallel from the
  // gallery API. The related endpoint runs the same keyword-overlap
  // scoring the old client-side findRelatedPhotos did, just on the
  // server, so we don't ship the entire photo set to the browser.
  useEffect(() => {
    if (!category || !photoId) return;
    let cancelled = false;
    setLoading(true);
    setPhoto(null);
    setGone(false);
    setRelatedPhotos([]);
    (async () => {
      try {
        const [postRes, relatedRes] = await Promise.all([
          fetch(
            `/api/gallery/post?category=${encodeURIComponent(category)}&slug=${encodeURIComponent(photoId)}`,
          ),
          fetch(`/api/gallery/related?slug=${encodeURIComponent(photoId)}&limit=6`),
        ]);
        if (cancelled) return;
        const postData = await postRes.json();
        if (postRes.ok && postData.success) {
          setPhoto(postData.photo);
        } else {
          setPhoto(null);
          if (postRes.status === 404) setGone(true);
        }
        if (relatedRes.ok) {
          const relatedData = await relatedRes.json();
          if (relatedData.success) setRelatedPhotos(relatedData.photos);
        }
      } catch {
        // Silent fail, the render below shows a "photo not found"
        // state when `photo` is null after loading.
        if (!cancelled) setPhoto(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, photoId]);

  const handleCopyLink = () => {
    if (photo) {
      navigator.clipboard.writeText(window.location.href).then(() => showCopied());
    }
  };

  const handleShare = async () => {
    if (navigator.share && photo) {
      try {
        // `text` is deliberately omitted. WhatsApp (and most chat apps) only
        // render a link preview when the URL is the prominent part of the
        // message; with a description in front of it the link is treated as
        // plain text and the og:image never appears. Pasting the same URL by
        // hand previewed correctly, which is what gave this away. The photo IS
        // the point of sharing here, so the preview matters more than the
        // caption. `title` stays: apps use it to label the share, not to pad
        // the message body.
        await navigator.share({
          title: photo.title,
          url: window.location.href,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        await navigator.clipboard.writeText(window.location.href);
        showCopied();
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      showCopied();
    }
  };

  if (loading) {
    return (
      <Flex minH="100vh" bg="white" align="center" justify="center">
        <Text textStyle="metaCaption">Loading...</Text>
      </Flex>
    );
  }

  if (!photo) {
    return (
      <Box minH="100vh" bg="white">
        {/* A dead slug is served the SPA shell with a 200 (the static 404 can't
            exist behind the catch-all rewrite), so noindex here is the only
            signal telling Google this URL is gone, NotFound and JournalPost
            already send it; this branch was the one hole. Gated on the API's
            404 so a transient 5xx/network failure never noindexes a live page. */}
        {gone && (
          <Helmet>
            <title>Photo Not Found | Vero Photography</title>
            <meta name="robots" content="noindex, nofollow" />
          </Helmet>
        )}
        <Flex minH="100vh" align="center" justify="center" direction="column" gap={6}>
          <Text as="h1" textStyle="sectionTitle" m={0}>Photo not found</Text>
          <CTAButton to={`/gallery/${category}`} size="sm">
            Back to Gallery
          </CTAButton>
        </Flex>
      </Box>
    );
  }

  const categoryLabel = category ? category.charAt(0).toUpperCase() + category.slice(1) : '';
  const titleNoSuffix = photo.title.replace(' | Vero Photography', '');
  // Build the canonical URL from route params instead of window.location.href
  // so it's stable across SSR/prerender and never includes query strings.
  const photoUrl = `https://vero.photography/photo/${category}/${photoId}`;
  const photoImage = `https://vero.photography${photo.url}`;

  // The three grid rungs PLUS the untouched original, carrying its real width.
  //
  // The original has to stay in the candidate list. At 1440x900 DPR 2 this
  // photograph is painted 1080 CSS px wide and wants 2160 device px, and the
  // largest rung is 1600, so a desktop and a high-DPR phone still need the full
  // file. The point of the srcset is only that a 412px phone at DPR 1.75 stops
  // pulling a 3000x2000 original into a 412x275 box: it lands on the 800 rung,
  // which measured 261.9 KiB -> 22.7 KiB on the page this was built against.
  //
  // No srcset at all if the width is unknown, rather than a set topping out at
  // 1600: a candidate list whose largest rung is smaller than the desktop needs
  // is exactly how you soften a photograph, and the original alone is correct.
  const gridRungs = gridSrcSet(photo.url, photo.width);
  // gridSrcSet already carries the original as the top candidate, because it
  // was handed photo.width. Appending it here as well listed it twice.
  const mainSrcSet = photo.width ? gridRungs : undefined;

  // BreadcrumbList schema, makes the page eligible for breadcrumb rich results
  // and tells Google how the photo fits in the site hierarchy. Helps with
  // indexing thin photo pages by establishing internal-link context.
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://vero.photography' },
      { '@type': 'ListItem', position: 2, name: 'Gallery', item: 'https://vero.photography/gallery' },
      { '@type': 'ListItem', position: 3, name: categoryLabel, item: `https://vero.photography/gallery/${category}` },
      { '@type': 'ListItem', position: 4, name: titleNoSuffix, item: photoUrl },
    ],
  };

  return (
    <>
      <Helmet>
        <title>{photo.title}</title>
        <meta name="description" content={photo.description} />
        <meta property="og:title" content={photo.title} />
        <meta property="og:description" content={photo.description} />
        <meta property="og:image" content={photoImage} />
        <meta property="og:url" content={photoUrl} />
        <meta property="og:type" content="article" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={photo.title} />
        <meta name="twitter:description" content={photo.description} />
        <meta name="twitter:image" content={photoImage} />
        <link rel="canonical" href={photoUrl} />
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      <Box minH="100vh" bg="white" layerStyle="pageTop">
        {/* Breadcrumb, small, semantic. Real <a href> tags so they're
            crawlable and provide internal links INTO the photo pages from
            the perspective of Googlebot crawling the gallery → category → photo. */}
        <Box
          as="nav"
          aria-label="Breadcrumb"
          px={{ base: 4, md: 8 }}
          py={3}
          maxW="contentWide"
          mx="auto"
        >
          <Flex
            as="ol"
            listStyleType="none"
            gap={2}
            textStyle="metaCaption"
            flexWrap="wrap"
          >
            <Box as="li">
              <Link to="/" style={{ color: 'inherit' }}>Home</Link>
            </Box>
            <Box as="li" aria-hidden="true">/</Box>
            <Box as="li">
              <Link to="/gallery" style={{ color: 'inherit' }}>Gallery</Link>
            </Box>
            <Box as="li" aria-hidden="true">/</Box>
            <Box as="li">
              <Link to={`/gallery/${category}`} style={{ color: 'inherit' }}>{categoryLabel}</Link>
            </Box>
            <Box as="li" aria-hidden="true">/</Box>
            <Box as="li" aria-current="page" color="gray.600">
              {titleNoSuffix}
            </Box>
          </Flex>
        </Box>

        {/* Hero image, full width. Container uses the photo's real
            aspect ratio (from DB, via /api/gallery/post) so it has a
            non-zero height BEFORE the image loads, that's what lets
            the cream placeholder + gold spinner show up while the
            Drive proxy warms its cache. Falls back to 3/2 if the
            aspect isn't known (rare, pre-migration photos might
            lack dims). */}
        <Box
          position="relative"
          w="100%"
          bg="white"
          maxH="80vh"
          sx={{
            aspectRatio: photo.width && photo.height ? `${photo.width} / ${photo.height}` : '3 / 2',
          }}
        >
          <LoadingImage
            src={photo.url}
            srcSet={mainSrcSet}
            // 100vw, not the true painted width. maxH="80vh" with
            // object-fit: contain means the real figure is
            // min(100vw, 80vh * aspect), 1080px on a 1440x900 desktop rather
            // than 1440, but saying so needs a min() of a vw and a vh and the
            // rungs are too coarse for it to matter: 1600 is short of the real
            // 2160 either way, so both numbers pick the original. Overstating
            // sizes costs bytes; understating it costs sharpness.
            sizes="100vw"
            alt={photo.alt}
            title={photo.title}
            w="100%"
            h="100%"
            imgObjectFit="contain"
            spinnerSize="lg"
            loading="eager"
            // The LCP element on this page, and it was competing with six
            // lazy related thumbnails for the same connection.
            fetchPriority="high"
            imgStyle={{ cursor: 'pointer' }}
            onClick={toggleFullscreen}
          />
        </Box>

        {/* Content */}
        <Container maxW="contentNarrow" layerStyle="sectionTight" px={6}>
          <Box>
            {/* `immediate`: the bare `animate` here always meant "play on
                arrival", not "play on scroll". The gate comes with it because
                this block carries the related-photo links and the back link,
                and a mount fade is invisible and tappable while it runs. */}
            <Reveal immediate from={{ opacity: 0, y: 25 }} duration={0.8}>
              <VStack spacing={{ base: 6, md: 8 }} align="center" textAlign="center">
                {/* Eyebrow → rule → h1 → lead. One block, one component. */}
                <PageHeader
                  eyebrow={categoryLabel}
                  title={titleNoSuffix}
                  lead={photo.description}
                  size="content"
                />

                {/* Keyword chips (display-only) */}
                {photo.keywords.length > 0 && (
                  <Wrap spacing={2} justify="center" maxW="measure">
                    {photo.keywords.map((keyword) => (
                      <WrapItem key={keyword}>
                        <Tag
                          size="sm"
                          variant="subtle"
                          textStyle="metaCaption"
                          // Quieter than the rest of the page on purpose:
                          // these are metadata, not navigation. Cream fill and
                          // gold border gave them more presence than the
                          // photograph's own caption.
                          bg="transparent"
                          // gray.500 is 4.02:1 on white and fails AA at 10px;
                          // seven of this page's eight contrast failures were
                          // these chips. brand.mutedText is 5.92:1 on white and
                          // warm, which is why the footer's captions already
                          // moved off the cool gray. Still display-only: no
                          // hover, no link, nothing clickable.
                          color="brand.mutedText"
                          fontSize="0.625rem"
                          letterSpacing="0.12em"
                          mr="-0.12em"
                          px={2.5}
                          py={0.5}
                          borderRadius="full"
                          border="1px solid"
                          borderColor="gray.200"
                          // A hyphenated keyword like "golden-hour" was
                          // breaking at the hyphen and becoming a two-line
                          // chip, twice the height of its neighbours.
                          whiteSpace="nowrap"
                        >
                          {keyword}
                        </Tag>
                      </WrapItem>
                    ))}
                  </Wrap>
                )}

                {/* Divider */}
                <Box w="100%" maxW="measure" h="1px" bg="brand.accentBorder" />

                {/* Actions */}
                <Flex gap={3} align="center" wrap="wrap" justify="center">
                  <CTAButton
                    onClick={handleCopyLink}
                    icon={FaRegCopy}
                    variant="ghost"
                    size="sm"
                  >
                    Copy Link
                  </CTAButton>
                  <CTAButton
                    onClick={handleShare}
                    icon={FaShareAlt}
                    variant="ghost"
                    size="sm"
                  >
                    Share
                  </CTAButton>
                </Flex>

                {/* Back to gallery */}
                {/* Was always /gallery/<category>, even when the visitor
                    arrived from a related-photo link or another page. */}
                <CTAButton onClick={back.onClick} variant="ghost" size="sm">
                  ← {back.label}
                </CTAButton>
              </VStack>
            </Reveal>
          </Box>
        </Container>

        {/* Related photos */}
        {relatedPhotos.length > 0 && (
          <Box
            /* THE FOLD CREAM, so the footer's white face reads as part of the
               footer rather than as a stray band between two near-identical
               off-whites. Same change and same reason as the About page's
               closing band. The eyebrow below moves with it because the plain
               gold is only 3.96:1 on this cream, which is also one of the
               contrast failures Lighthouse reports on this page. */
            bg="brand.surfaceFold"
            layerStyle="sectionTight"
            px={{ base: 4, md: 8 }}
          >
            <Container maxW="content" px={0}>
              <VStack spacing={{ base: 8, md: 10 }}>
                {/* Same eyebrow → rule → title arrangement as PageHeader, but
                    the heading here is an h2 at sectionTitle, PageHeader only
                    offers pageTitle/contentTitle, so it can't render this one. */}
                <VStack spacing={{ base: 4, md: 5 }}>
                  <Text textStyle="eyebrowOnFold">Related</Text>
                  <Box w="40px" h="1px" bg="brand.accent" />
                  <Text as="h2" textStyle="sectionTitle" m={0}>
                    More like this
                  </Text>
                </VStack>

                <SimpleGrid
                  columns={{ base: 2, md: 3 }}
                  spacing={{ base: 1.5, md: 2 }}
                  w="100%"
                >
                  {relatedPhotos.map((rp) => (
                    <Box
                      as={Link}
                      to={`/photo/${rp.category}/${rp.id}`}
                      key={rp.id}
                      position="relative"
                      overflow="hidden"
                      cursor="pointer"
                      data-group
                      bg="white"
                      sx={{
                        // Scoped hover: only the inner img reacts,
                        // not the surrounding container. Keeps the
                        // spinner/placeholder placement stable while
                        // the hover transform runs on the img.
                        '&:hover > div > img': {
                          transform: 'scale(1.03)',
                          filter: 'brightness(0.85)',
                        },
                      }}
                    >
                      <LoadingImage
                        src={rp.url}
                        srcSet={gridSrcSet(rp.url)}
                        sizes={relatedTileSizes(rp.width, rp.height)}
                        alt={rp.alt}
                        w="100%"
                        h={{ base: '220px', md: '300px' }}
                        imgObjectFit="cover"
                        spinnerSize="sm"
                        imgStyle={{
                          transition: 'transform 0.5s ease, filter 0.3s ease',
                        }}
                      />
                      <Box
                        position="absolute"
                        inset={0}
                        bgGradient="linear(to-t, rgba(0,0,0,0.55), rgba(0,0,0,0))"
                        opacity={0}
                        transition="opacity 0.3s ease"
                        _groupHover={{ opacity: 1 }}
                        // The scrim carries the title below it; both were
                        // hover-only, so touch users got unlabelled thumbnails.
                        sx={{ '@media (hover: none)': { opacity: 1 } }}
                        pointerEvents="none"
                      />
                      <Text
                        position="absolute"
                        bottom={3}
                        left={3}
                        right={3}
                        textStyle="metaCaption"
                        color="white"
                        opacity={0}
                        transform="translateY(5px)"
                        transition="all 0.3s ease"
                        _groupHover={{ opacity: 1, transform: 'translateY(0)' }}
                        sx={{
                          '@media (hover: none)': {
                            opacity: 1,
                            transform: 'translateY(0)',
                          },
                        }}
                        pointerEvents="none"
                      >
                        {rp.title.replace(' | Vero Photography', '')}
                      </Text>
                    </Box>
                  ))}
                </SimpleGrid>
              </VStack>
            </Container>
          </Box>
        )}

        {/* Fullscreen inspect modal */}
        <AnimatePresence>
          {isFullscreen && (
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 2100,
                background: 'rgba(0,0,0,0.95)',
              }}
            >
              <Box
                ref={scrollContainerRef}
                position="absolute"
                inset={0}
                overflow="hidden"
                zIndex={1}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                cursor={isDragging ? 'grabbing' : 'grab'}
                onClick={(e) => { if (e.target === e.currentTarget && dragDistanceRef.current < 5) toggleFullscreen(); }}
                sx={{ touchAction: 'none' }}
              >
                <Image
                  src={photo.url}
                  alt={photo.alt}
                  position="absolute"
                  top="50%"
                  left="50%"
                  transform={`translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${scale})`}
                  maxW="none"
                  maxH="none"
                  draggable={false}
                  userSelect="none"
                  pointerEvents="none"
                />
              </Box>

              <Flex
                as="button"
                position="absolute"
                top={5}
                right={5}
                zIndex={100}
                onClick={toggleFullscreen}
                align="center"
                justify="center"
                w="40px"
                h="40px"
                borderRadius="full"
                bg="rgba(0,0,0,0.6)"
                backdropFilter="blur(8px)"
                border="1px solid rgba(255,255,255,0.15)"
                color="whiteAlpha.900"
                transition="all 0.3s"
                _hover={{ color: 'white', bg: 'rgba(0,0,0,0.8)' }}
              >
                <CloseIcon boxSize={3} />
              </Flex>

              <Flex
                as="button"
                position="absolute"
                bottom={6}
                left="50%"
                transform="translateX(-50%)"
                zIndex={100}
                onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }}
                align="center"
                justify="center"
                borderRadius="full"
                bg="rgba(0,0,0,0.6)"
                backdropFilter="blur(8px)"
                border="1px solid rgba(255,255,255,0.15)"
                px={5}
                py={2}
              >
                <Text
                  textStyle="ctaLabel"
                  color="whiteAlpha.900"
                  transition="color 0.3s"
                  _hover={{ color: 'white' }}
                >
                  Reset View · {Math.round(scale * 100)}%
                </Text>
              </Flex>
            </m.div>
          )}
        </AnimatePresence>
      </Box>
      <CopyNotification />
    </>
  );
};

export default IndividualPhoto;
