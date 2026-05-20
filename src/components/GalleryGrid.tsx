import { Box } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import ImageModal from './ImageModal';
import { useState, useEffect, useRef, useCallback } from 'react';

interface GalleryGridProps {
  images: Array<{
    id?: string;
    category?: string;
    url: string;
    alt: string;
    title: string;
    description: string;
  }>;
  category?: string;
}

const MotionBox = motion(Box);

const GalleryGrid = ({ images, category }: GalleryGridProps) => {
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [originRect, setOriginRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [columnCount, setColumnCount] = useState(3);
  // Tracks whether the modal pushed a history entry. We push ONCE on open and
  // replaceState for prev/next inside the modal, so the back button cleanly
  // closes the modal in a single pop instead of unwinding every photo viewed.
  const urlPushedRef = useRef(false);

  useEffect(() => {
    const updateColumnCount = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        if (width < 768) setColumnCount(1);
        else if (width < 1024) setColumnCount(2);
        else setColumnCount(3);
      }
    };

    updateColumnCount();
    window.addEventListener('resize', updateColumnCount);
    return () => window.removeEventListener('resize', updateColumnCount);
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
    // modal AND restores the gallery URL. React Router isn't re-rendered
    // because we don't fire popstate ourselves — it only triggers when the
    // user navigates back.
    const url = photoUrlFor(index);
    if (url) {
      window.history.pushState({ veroModal: true }, '', url);
      urlPushedRef.current = true;
    }
  };

  // When the user navigates prev/next inside the open modal, replace (don't
  // push) the URL so we don't bloat history with one entry per photo viewed.
  useEffect(() => {
    if (!isModalOpen || selectedImageIndex === null || !urlPushedRef.current) return;
    const url = photoUrlFor(selectedImageIndex);
    if (url) {
      window.history.replaceState({ veroModal: true }, '', url);
    }
  }, [isModalOpen, selectedImageIndex, photoUrlFor]);

  // Back button (mobile gesture, hardware back, browser back) → close modal.
  // The popstate fires AFTER history has already popped, so the URL is
  // already restored by the time we close the modal.
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
    // Modal already scrolled the page to the right spot before animating closed
    setIsModalOpen(false);
    setSelectedImageIndex(null);
    setOriginRect(null);
    // Pop the history entry we pushed on open so the gallery URL comes back.
    // popstate will fire and the listener above will try to close the modal
    // again — that's fine, the setStates are idempotent.
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

  return (
    <Box
      ref={containerRef}
      py={8}
      px={0}
    >
      <Box
        display="grid"
        gridTemplateColumns={`repeat(${columnCount}, 1fr)`}
        gap={4}
      >
        {images.map((image, index) => {
          // Render each thumbnail as a real <a href> so Googlebot can crawl
          // the individual photo pages from the gallery. JS-enabled clicks
          // are intercepted to open the modal (preserves existing UX);
          // cmd/ctrl/middle-click falls through to native navigation so
          // "open in new tab" still works.
          const photoCategory = image.category || category;
          const photoId = image.id;
          const photoHref =
            photoCategory && photoId ? `/photo/${photoCategory}/${photoId}` : undefined;
          return (
            <MotionBox
              as={photoHref ? ('a' as any) : 'div'}
              {...(photoHref ? { href: photoHref } : {})}
              key={photoId || index}
              ref={(el: HTMLDivElement | null) => { imageRefs.current[index] = el; }}
              position="relative"
              overflow="hidden"
              cursor="pointer"
              display="block"
              textDecoration="none"
              onClick={(e: React.MouseEvent) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || (e as any).button !== 0) return;
                e.preventDefault();
                handleImageClick(index);
              }}
              whileHover={{ scale: 1.01 }}
              transition={{ duration: 0.3 }}
            >
              <img
                src={image.url}
                alt={image.alt}
                title={image.title}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  display: 'block',
                }}
                loading="lazy"
              />
            </MotionBox>
          );
        })}
      </Box>

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

export default GalleryGrid;
