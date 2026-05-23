import {
  Box,
  Text,
  Flex,
} from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import { FaDownload } from 'react-icons/fa';
import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useCopyNotification } from './CopyNotification';
import CTAButton from './ui/CTAButton';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ImageModalProps {
  isOpen: boolean;
  onClose: (currentIndex: number) => void;
  imageUrl: string;
  imageAlt?: string;
  onNext?: () => void;
  onPrevious?: () => void;
  currentIndex?: number;
  totalImages?: number;
  photoData?: {
    id?: string;
    url: string;
    alt: string;
    title: string;
    description: string;
  };
  category?: string;
  originRect?: Rect | null;
  getImageRect?: (index: number) => Rect | null;
  // When set, the bottom CTA becomes a "Download" button (with the file
  // saved via the anchor's download attribute) instead of the default
  // "View Photo Page" link. Lets the client portal reuse this same modal.
  downloadUrl?: string;
  downloadFilename?: string;
  // On touch devices, "download" goes to the phone's Files app, which is the
  // wrong destination — clients want photos in Photos / Camera Roll. When
  // mobileSaveUrl is provided (and we detect a touch device), the bottom CTA
  // instead opens the original-quality image in a new tab where the user
  // can long-press → "Save to Photos" (iOS) / "Download image" (Android).
  mobileSaveUrl?: string;
  // Hide the share icon in the top bar (client portal galleries don't share).
  hideShare?: boolean;
}

const ImageModal = ({
  isOpen,
  onClose,
  imageUrl,
  imageAlt = 'Gallery image',
  onNext,
  onPrevious,
  currentIndex,
  totalImages,
  photoData,
  category,
  originRect,
  getImageRect,
  downloadUrl,
  downloadFilename,
  mobileSaveUrl,
  hideShare,
}: ImageModalProps) => {
  // Touch-device detection. Captured once on mount via useEffect so SSR/
  // prerender stays consistent (no `window` access during render).
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice(
      window.matchMedia?.('(pointer: coarse)').matches ||
        /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    );
  }, []);
  const useMobileSaveFlow = isTouchDevice && Boolean(mobileSaveUrl);

  // Pre-fetch the photo file when the modal opens (and whenever the selected
  // photo changes via prev/next). Two reasons:
  //
  // 1. iOS Safari's `navigator.share()` requires "transient activation" —
  //    the user gesture must still be valid when share() is called. After
  //    an `await fetch(...)`, the gesture is consumed and share silently
  //    fails. Pre-fetching means the click handler can call share
  //    synchronously from inside the user gesture, no await needed.
  //
  // 2. /api/photo is our own origin (same-origin proxy through the service
  //    account), so fetch isn't blocked by Drive's CORS policy.
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  useEffect(() => {
    if (!useMobileSaveFlow || !mobileSaveUrl || !isOpen) return;
    let cancelled = false;
    setPhotoBlob(null);
    fetch(mobileSaveUrl)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((blob) => {
        if (!cancelled) setPhotoBlob(blob);
      })
      .catch((err) => {
        console.warn('[ImageModal] pre-fetch failed:', err);
        // photoBlob stays null → click handler falls back to opening URL
      });
    return () => {
      cancelled = true;
    };
  }, [useMobileSaveFlow, mobileSaveUrl, isOpen]);

  const handleMobileSave = useCallback(() => {
    // Inside the click handler — must stay synchronous up to the point where
    // we hand off to navigator.share() to preserve the user gesture.
    if (!mobileSaveUrl) return;
    const filename = downloadFilename || 'photo.jpg';

    if (photoBlob) {
      const file = new File([photoBlob], filename, {
        type: photoBlob.type || 'image/jpeg',
      });
      if (navigator.canShare?.({ files: [file] })) {
        // The share sheet is presented synchronously; the promise resolves
        // when the user picks an option or dismisses. AbortError = dismiss,
        // which we treat as a no-op.
        navigator.share({ files: [file] }).catch((err) => {
          if ((err as Error).name === 'AbortError') return;
          console.warn('[ImageModal] share failed, falling back:', err);
        });
        return;
      }
      // Browser doesn't support file sharing — fall through to the
      // open-in-new-tab path so user can long-press to save manually.
    }

    // Either the pre-fetch failed (CORS or 5xx) or this browser can't share
    // files. Best fallback: open the image URL in a new tab. iOS Safari
    // shows the image; user long-press → "Save to Photos". This works
    // because we're still inside the user-gesture sync code path.
    const a = document.createElement('a');
    a.href = mobileSaveUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [mobileSaveUrl, downloadFilename, photoBlob]);
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0 });
  const [touchEnd, setTouchEnd] = useState({ x: 0, y: 0 });
  const scrollYRef = useRef(0);
  const scrollLockedRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showUI, setShowUI] = useState(false);
  const [backdropOpacity, setBackdropOpacity] = useState(1);

  const navigate = useNavigate();
  const { show: showCopied, Notification: CopyNotification } = useCopyNotification();
  const photoPageUrl =
    photoData && category && photoData.id ? `/photo/${category}/${photoData.id}` : null;
  const photoTitle = photoData?.title?.replace(' | Vero Photography', '') ?? '';

  const handleViewPhotoPage = useCallback(() => {
    // Use replace because GalleryGrid already pushed this exact URL when the
    // modal opened. Without replace, navigate() would push a duplicate entry
    // on top and require TWO back presses to escape the photo page.
    if (photoPageUrl) navigate(photoPageUrl, { replace: true });
  }, [navigate, photoPageUrl]);

  // Open position: centered in viewport
  const openPos = {
    top: window.innerHeight * 0.075,
    left: window.innerWidth * 0.05,
    width: window.innerWidth * 0.9,
    height: window.innerHeight * 0.85,
    opacity: 1,
    borderRadius: 0,
  };

  // Animation target — starts as open position, changes to close target
  const [animTarget, setAnimTarget] = useState(openPos);
  const [animTransition, setAnimTransition] = useState({
    duration: 0.4,
    ease: [0.16, 1, 0.3, 1] as number[],
  });

  // Initial position from thumbnail (computed once on mount via ref)
  const initialPos = useRef(
    originRect
      ? {
          top: originRect.top,
          left: originRect.left,
          width: originRect.width,
          height: originRect.height,
          opacity: 1,
          borderRadius: 8,
        }
      : { ...openPos, opacity: 0 }
  );

  const unlockScroll = useCallback(() => {
    if (scrollLockedRef.current) {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollYRef.current);
      scrollLockedRef.current = false;
    }
  }, []);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setShowUI(false);

    // 1. Unlock scroll BEHIND the still-visible backdrop
    unlockScroll();

    // 2. Find where the target thumbnail is and scroll to center it
    let targetRect = getImageRect?.(currentIndex ?? 0);
    if (targetRect) {
      const scrollTarget =
        window.scrollY +
        targetRect.top -
        window.innerHeight / 2 +
        targetRect.height / 2;
      window.scrollTo(0, Math.max(0, scrollTarget));
      // 3. Get FRESH rect now that page is at the right scroll position
      targetRect = getImageRect?.(currentIndex ?? 0) ?? targetRect;
    }

    // 4. Animate image to where the thumbnail now is + fade backdrop
    setBackdropOpacity(0);
    setAnimTransition({ duration: 0.35, ease: [0.32, 0.72, 0, 1] });

    if (targetRect) {
      setAnimTarget({
        top: targetRect.top,
        left: targetRect.left,
        width: targetRect.width,
        height: targetRect.height,
        opacity: 0,
        borderRadius: 8,
      });
    } else {
      setAnimTarget((prev) => ({ ...prev, opacity: 0 }));
    }
  }, [isClosing, getImageRect, currentIndex, unlockScroll]);

  const handleAnimComplete = useCallback(() => {
    if (isClosing) {
      onClose(currentIndex ?? 0);
    } else if (!showUI) {
      setShowUI(true);
    }
  }, [isClosing, onClose, currentIndex, showUI]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && onPrevious) onPrevious();
      if (e.key === 'ArrowRight' && onNext) onNext();
      if (e.key === 'Escape') handleClose();
    },
    [onNext, onPrevious, handleClose]
  );

  // Scroll lock — only depends on isOpen so it won't re-run mid-animation
  useEffect(() => {
    if (isOpen) {
      scrollYRef.current = window.scrollY;
      scrollLockedRef.current = true;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollYRef.current}px`;
      document.body.style.width = '100%';
      return () => {
        if (scrollLockedRef.current) {
          document.body.style.overflow = '';
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.width = '';
          window.scrollTo(0, scrollYRef.current);
          scrollLockedRef.current = false;
        }
      };
    }
  }, [isOpen]);

  // Keyboard listener — separate so handler changes don't re-lock scroll
  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Resize listener — recompute the image's fullscreen rect when the viewport
  // changes. Without this the image stays pinned at the size/position it had
  // when the modal opened, while the rest of the UI (top bar, bottom CTA,
  // arrows) follows the new viewport, looking visibly broken. Uses an instant
  // transition because the user is actively dragging the window edge and any
  // animation lag reads as jank.
  useEffect(() => {
    if (!isOpen || isClosing) return;
    const handleResize = () => {
      setAnimTransition({ duration: 0, ease: [0, 0, 1, 1] });
      setAnimTarget({
        top: window.innerHeight * 0.075,
        left: window.innerWidth * 0.05,
        width: window.innerWidth * 0.9,
        height: window.innerHeight * 0.85,
        opacity: 1,
        borderRadius: 0,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, isClosing]);

  const handleShare = () => {
    if (photoData && category) {
      const shareUrl = `/photo/${category}/${photoData.id}`;
      const fullUrl = `${window.location.origin}${shareUrl}`;
      if (navigator.share) {
        navigator.share({
          title: 'Vero Photography',
          text: 'Check out this beautiful photo from Vero Photography',
          url: fullUrl,
        });
      } else {
        navigator.clipboard.writeText(fullUrl).then(() => showCopied());
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.innerWidth >= 768) return;
    const touch = e.touches[0];
    setTouchStart({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (window.innerWidth >= 768) return;
    const touch = e.touches[0];
    setTouchEnd({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = () => {
    if (window.innerWidth >= 768) return;
    if (!touchStart.x || !touchEnd.x) return;
    const distance = touchStart.x - touchEnd.x;
    if (distance > 50 && onNext) onNext();
    else if (distance < -50 && onPrevious) onPrevious();
    setTouchStart({ x: 0, y: 0 });
    setTouchEnd({ x: 0, y: 0 });
  };

  if (!isOpen) return null;

  return (
    <Box position="fixed" inset="0" zIndex={2100}>
      {/* Dark backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: backdropOpacity }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.92)',
        }}
        onClick={handleClose}
      />

      {/* Top bar */}
      <Flex
        position="absolute"
        top={0}
        left={0}
        right={0}
        px={{ base: 4, md: 8 }}
        py={5}
        justify="space-between"
        align="center"
        zIndex={1450}
        opacity={showUI ? 1 : 0}
        transition="opacity 0.25s"
        pointerEvents={showUI ? 'auto' : 'none'}
      >
        <Text
          fontSize="xs"
          fontWeight="400"
          color="whiteAlpha.600"
          letterSpacing="0.15em"
          userSelect="none"
          onClick={(e) => e.stopPropagation()}
        >
          {currentIndex !== undefined && totalImages !== undefined
            ? `${currentIndex + 1} / ${totalImages}`
            : ''}
        </Text>

        <Flex gap={5} align="center" onClick={(e) => e.stopPropagation()}>
          {photoData && category && !hideShare && (
            <Box
              as="button"
              aria-label="Share photo"
              onClick={handleShare}
              color="whiteAlpha.600"
              transition="color 0.3s"
              _hover={{ color: '#c9a96e' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <ExternalLinkIcon boxSize={4} />
            </Box>
          )}
          <Box
            as="button"
            aria-label="Close"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              handleClose();
            }}
            color="whiteAlpha.600"
            transition="color 0.3s"
            _hover={{ color: 'white' }}
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <CloseIcon boxSize={3} />
          </Box>
        </Flex>
      </Flex>

      {/* Bottom bar — photo title (left) + action CTA (right). The action is
          "Download" for client-portal galleries (downloadUrl set) or "View
          Photo Page" for the public gallery (photoPageUrl set). Same showUI
          gating as the top bar so both fade in together once the open
          animation lands. */}
      {(photoPageUrl || downloadUrl) && (
        <Flex
          position="absolute"
          bottom={0}
          left={0}
          right={0}
          px={{ base: 4, md: 8 }}
          py={{ base: 4, md: 5 }}
          justify="space-between"
          align="center"
          gap={4}
          zIndex={1450}
          opacity={showUI ? 1 : 0}
          transition="opacity 0.25s"
          pointerEvents={showUI ? 'auto' : 'none'}
          bg="linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))"
          onClick={(e) => e.stopPropagation()}
        >
          {photoTitle && (
            <Text
              fontSize={{ base: 'xs', md: 'sm' }}
              fontWeight="300"
              color="whiteAlpha.800"
              letterSpacing="0.05em"
              noOfLines={1}
              flex="1 1 auto"
              minW={0}
            >
              {photoTitle}
            </Text>
          )}
          {downloadUrl || mobileSaveUrl ? (
            useMobileSaveFlow ? (
              // Mobile path: photo is pre-fetched on modal open. Click
              // calls navigator.share() synchronously inside the user
              // gesture → native share sheet with "Save to Photos" as the
              // first option. If pre-fetch failed (CORS, network), falls
              // back to opening the URL so user can long-press to save.
              <CTAButton
                onClick={handleMobileSave}
                icon={FaDownload}
                tone="dark"
                size="sm"
              >
                Save to Photos
              </CTAButton>
            ) : (
              // Desktop path: anchor with download attribute triggers the
              // browser's Save As dialog so the user picks a location.
              <CTAButton
                href={downloadUrl!}
                download={downloadFilename ?? true}
                icon={FaDownload}
                tone="dark"
                size="sm"
              >
                Download
              </CTAButton>
            )
          ) : (
            <CTAButton onClick={handleViewPhotoPage} tone="dark" size="sm">
              View Photo Page →
            </CTAButton>
          )}
        </Flex>
      )}

      {/* Navigation arrows */}
      {onPrevious && (
        <Flex
          position="absolute"
          left={{ base: 2, md: 6 }}
          top="50%"
          transform="translateY(-50%)"
          zIndex={1450}
          as="button"
          aria-label="Previous image"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onPrevious();
          }}
          align="center"
          justify="center"
          w="44px"
          h="44px"
          color="whiteAlpha.500"
          transition="color 0.3s"
          _hover={{ color: 'white' }}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
          opacity={showUI ? 1 : 0}
          pointerEvents={showUI ? 'auto' : 'none'}
        >
          <ChevronLeftIcon boxSize={8} />
        </Flex>
      )}

      {onNext && (
        <Flex
          position="absolute"
          right={{ base: 2, md: 6 }}
          top="50%"
          transform="translateY(-50%)"
          zIndex={1450}
          as="button"
          aria-label="Next image"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onNext();
          }}
          align="center"
          justify="center"
          w="44px"
          h="44px"
          color="whiteAlpha.500"
          transition="color 0.3s"
          _hover={{ color: 'white' }}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
          opacity={showUI ? 1 : 0}
          pointerEvents={showUI ? 'auto' : 'none'}
        >
          <ChevronRightIcon boxSize={8} />
        </Flex>
      )}

      {/* Image container — animates between thumbnail rect and centered rect */}
      <motion.div
        initial={initialPos.current}
        animate={animTarget}
        transition={animTransition}
        onAnimationComplete={handleAnimComplete}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          position: 'fixed',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 1400,
        }}
      >
        <img
          src={imageUrl}
          alt={imageAlt}
          draggable={false}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          style={{
            maxHeight: '100%',
            maxWidth: '100%',
            objectFit: 'contain',
            userSelect: 'none',
            pointerEvents: 'auto',
          }}
        />
      </motion.div>
      <CopyNotification />
    </Box>
  );
};

export default ImageModal;
