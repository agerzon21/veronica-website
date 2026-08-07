import { Box } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import ImageModal from './ImageModal';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { justifyLayout } from '../utils/justifyLayout';

interface GalleryImage {
  id?: string;
  category?: string;
  url: string;
  alt: string;
  title: string;
  description: string;
  // Natural pixel dimensions — the DB-backed /api/gallery endpoints
  // return these from Drive's imageMediaMetadata (nullable when
  // Drive didn't report them; falls back to 3:2 in the layout).
  width?: number | null;
  height?: number | null;
}

interface GalleryGridProps {
  images: GalleryImage[];
  category?: string;
}

const MotionBox = motion(Box);

// Justified-layout tuning. Target row height is what each row
// approaches when items don't have to be squished/stretched — bigger
// = fewer items per row, each item larger. Gap controls the whitespace
// between photos. Sized so a typical landscape shows 2-3 per row on
// desktop (matching the bumagaz reference), portraits fit 3-4.
const TARGET_ROW_HEIGHT_DESKTOP = 470;
const TARGET_ROW_HEIGHT_MOBILE = 260;
const GRID_GAP_DESKTOP = 20;
const GRID_GAP_MOBILE = 12;

const GalleryGrid = ({ images, category }: GalleryGridProps) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [originRect, setOriginRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [containerWidth, setContainerWidth] = useState(0);
  // Tracks whether the modal pushed a history entry. We push ONCE on open and
  // replaceState for prev/next inside the modal, so the back button cleanly
  // closes the modal in a single pop instead of unwinding every photo viewed.
  const urlPushedRef = useRef(false);

  // ResizeObserver for the grid container. Reflows the justified
  // layout on viewport width changes (both on initial mount and
  // when the user resizes the browser window).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    imageRefs.current = imageRefs.current.slice(0, images.length);
  }, [images.length]);

  const photoUrlFor = useCallback(
    (index: number) => {
      const image = images[index];
      const photoCategory = image?.category || category;
      if (!image?.id || !photoCategory) return null;
      return `/photo/${photoCategory}/${image.id}`;
    },
    [images, category],
  );

  const handleImageClick = (index: number) => {
    // Capture the bounding rect of the clicked thumbnail before opening the modal
    const el = imageRefs.current[index];
    if (el) {
      const rect = el.getBoundingClientRect();
      setOriginRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
    } else {
      setOriginRect(null);
    }
    setSelectedImageIndex(index);
    setIsModalOpen(true);

    // Sync URL with modal state: pushState so back button cleanly closes the
    // modal AND restores the gallery URL.
    const url = photoUrlFor(index);
    if (url) {
      window.history.pushState({ veroModal: true }, '', url);
      urlPushedRef.current = true;
    }
  };

  useEffect(() => {
    if (!isModalOpen || selectedImageIndex === null || !urlPushedRef.current) return;
    const url = photoUrlFor(selectedImageIndex);
    if (url) {
      window.history.replaceState({ veroModal: true }, '', url);
    }
  }, [isModalOpen, selectedImageIndex, photoUrlFor]);

  useEffect(() => {
    if (!isModalOpen) return;
    const handlePopState = () => {
      urlPushedRef.current = false;
      setIsModalOpen(false);
      setSelectedImageIndex(null);
      setOriginRect(null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isModalOpen]);

  const getImageRect = useCallback((index: number) => {
    const el = imageRefs.current[index];
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  }, []);

  const handleModalClose = useCallback((_finalIndex: number) => {
    setIsModalOpen(false);
    setSelectedImageIndex(null);
    setOriginRect(null);
    if (urlPushedRef.current) {
      urlPushedRef.current = false;
      window.history.back();
    }
  }, []);

  const handleNextImage = () => {
    if (selectedImageIndex !== null && selectedImageIndex < images.length - 1) {
      setSelectedImageIndex(selectedImageIndex + 1);
    }
  };

  const handlePreviousImage = () => {
    if (selectedImageIndex !== null && selectedImageIndex > 0) {
      setSelectedImageIndex(selectedImageIndex - 1);
    }
  };

  const isMobile = containerWidth > 0 && containerWidth < 640;
  const targetHeight = isMobile ? TARGET_ROW_HEIGHT_MOBILE : TARGET_ROW_HEIGHT_DESKTOP;
  const gap = isMobile ? GRID_GAP_MOBILE : GRID_GAP_DESKTOP;

  // Compute the justified rows from real photo aspects. Aspects are
  // known at build time (photos.ts → photo-dims.json), so the layout
  // is stable from first paint.
  const rows = useMemo(
    () =>
      justifyLayout(
        images.map((img, i) => ({
          id: img.id ?? String(i),
          aspect: img.width && img.height ? img.width / img.height : 3 / 2,
        })),
        containerWidth,
        targetHeight,
        gap,
      ),
    [images, containerWidth, targetHeight, gap],
  );

  return (
    <Box ref={containerRef} py={8} px={0}>
      {rows.map((row, ri) => (
        <Box
          key={ri}
          display="flex"
          gap={`${gap}px`}
          mb={`${gap}px`}
          h={`${row.height}px`}
        >
          {row.items.map((tile) => {
            // Look up the original index in `images` so refs, modal
            // navigation, and URL sync all stay consistent with the
            // flat images array — regardless of layout row order.
            const index = images.findIndex(
              (img, i) => (img.id ?? String(i)) === tile.id,
            );
            if (index === -1) return null;
            const image = images[index];
            const photoCategory = image.category || category;
            const photoId = image.id;
            const photoHref =
              photoCategory && photoId ? `/photo/${photoCategory}/${photoId}` : undefined;
            return (
              <MotionBox
                as={photoHref ? ('a' as any) : 'div'}
                {...(photoHref ? { href: photoHref } : {})}
                key={photoId || index}
                ref={(el: HTMLDivElement | null) => {
                  imageRefs.current[index] = el;
                }}
                position="relative"
                overflow="hidden"
                cursor="pointer"
                display="block"
                textDecoration="none"
                w={`${tile.width}px`}
                h="100%"
                flexShrink={0}
                // Warm cream placeholder that fills the tile's real
                // aspect while the Drive-proxy request is in flight.
                // Removes the "white gap then pop" behavior when images
                // stream in at different speeds. Matches the gold-cream
                // palette so it reads as intentional loading state,
                // not blank space.
                bg="#f5efe4"
                onClick={(e: React.MouseEvent) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || (e as any).button !== 0) return;
                  e.preventDefault();
                  handleImageClick(index);
                }}
                whileHover={{ scale: 1.01 }}
                transition={{ duration: 0.3 }}
              >
                <GalleryImg src={image.url} alt={image.alt} title={image.title} />
              </MotionBox>
            );
          })}
        </Box>
      ))}

      {selectedImageIndex !== null && isModalOpen && (
        <ImageModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          imageUrl={images[selectedImageIndex].url}
          imageAlt={images[selectedImageIndex].alt}
          onNext={handleNextImage}
          onPrevious={handlePreviousImage}
          currentIndex={selectedImageIndex}
          totalImages={images.length}
          photoData={images[selectedImageIndex]}
          category={category}
          originRect={originRect}
          getImageRect={getImageRect}
        />
      )}
    </Box>
  );
};

/**
 * Individual gallery <img> that fades in when loaded. The parent
 * tile has a warm-cream background so the tile shape is visible
 * from the moment the layout computes; this img starts invisible
 * (opacity 0) and eases in once the browser reports it loaded.
 * Removes the "flash of loaded pixel" jarring when photos arrive
 * out of order over the Drive proxy.
 */
function GalleryImg({ src, alt, title }: { src: string; alt: string; title: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <img
      src={src}
      alt={alt}
      title={title}
      onLoad={() => setLoaded(true)}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
        opacity: loaded ? 1 : 0,
        transition: 'opacity 0.45s ease',
      }}
      loading="lazy"
    />
  );
}

export default GalleryGrid;
