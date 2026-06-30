import {
  Box,
  Text,
  Flex,
  Icon,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import { FaDownload, FaExternalLinkAlt } from 'react-icons/fa';
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
  // pre-fetches the photo and shares via Web Share API → "Save to Photos".
  mobileSaveUrl?: string;
  // File size in bytes. Used to short-circuit the Web Share flow on big
  // files where pre-fetching through our proxy would either time out the
  // Vercel function, exhaust mobile browser memory, or just waste a lot of
  // bandwidth. Above the threshold (LARGE_FILE_THRESHOLD), the mobile CTA
  // becomes "Open in Drive" — links to Drive's native viewer where the
  // user gets a proper download button regardless of file size.
  fileSize?: number;
  driveViewUrl?: string;
  // Hide the share icon in the top bar (client portal galleries don't share).
  hideShare?: boolean;
}

// 40 MB. Reasoning: typical wedding/portrait JPEGs are 5–25 MB (well
// under), high-end JPEGs hit 20–50 MB (just above), TIFFs/RAWs/videos
// start at 50+ MB (clearly above). 40 MB keeps the Save-to-Photos flow
// for ~95% of real photos and gracefully degrades the rest to Drive's
// native viewer where size isn't a problem.
const LARGE_FILE_THRESHOLD = 40 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

// Split-button dropdown used on both desktop and mobile flows. Two
// equally-weighted options so users see both paths up front, instead of
// the "Need print quality?" disclaimer link reading as a caveat.
//
// Primary option is platform-specific (anchor download on desktop,
// Web Share API call on mobile) so the caller passes either
// `primaryHref` or `onPrimary`. Secondary option is always Drive's
// viewer for the full-res original — same link in both contexts.
interface DownloadMenuProps {
  triggerLabel: string;
  primaryTitle: string;
  primaryDesc: string;
  primaryHref?: string;
  primaryDownload?: string | boolean;
  onPrimary?: () => void;
  driveViewUrl?: string;
  fileSize?: number;
}

const DownloadMenu = ({
  triggerLabel,
  primaryTitle,
  primaryDesc,
  primaryHref,
  primaryDownload,
  onPrimary,
  driveViewUrl,
  fileSize,
}: DownloadMenuProps) => {
  const GOLD = '#c9a96e';
  const triggerStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    px: { base: 4, md: 5 },
    py: 2,
    fontSize: '2xs',
    fontWeight: 400,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.18em',
    lineHeight: 1,
    borderRadius: 0,
    border: '1px solid',
    borderColor: GOLD,
    color: GOLD,
    bg: 'transparent',
    cursor: 'pointer',
    transition: 'all 0.4s ease',
    whiteSpace: 'nowrap' as const,
    _hover: { bg: GOLD, color: 'white', transform: 'translateY(-2px)' },
    _active: { bg: '#b8964f', transform: 'translateY(0)' },
    _expanded: { bg: GOLD, color: 'white' },
    sx: { WebkitTapHighlightColor: 'transparent' },
  };
  const listStyles = {
    bg: 'rgba(15, 15, 15, 0.96)',
    border: '1px solid',
    borderColor: 'whiteAlpha.200',
    borderRadius: 0,
    minW: '260px',
    py: 1,
    zIndex: 1600,
    boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
  };
  const itemStyles = {
    bg: 'transparent',
    py: 3,
    px: 4,
    _hover: { bg: 'whiteAlpha.100' },
    _focus: { bg: 'whiteAlpha.100' },
  };

  return (
    <Menu placement="top-end" gutter={8}>
      <MenuButton as={Box} {...triggerStyles}>
        {/* MenuButton wraps children in an inner span, so flex `gap` on
            the trigger doesn't propagate down to the icon/label/chevron.
            Wrap in our own Flex so the gap actually applies. */}
        <Flex as="span" align="center" gap={2.5}>
          <Icon as={FaDownload} boxSize={3.5} />
          <Box as="span">{triggerLabel}</Box>
          <ChevronDownIcon boxSize={3.5} />
        </Flex>
      </MenuButton>
      <MenuList {...listStyles}>
        <MenuItem
          {...(primaryHref
            ? {
                as: 'a',
                href: primaryHref,
                download: primaryDownload,
              }
            : { onClick: onPrimary })}
          {...itemStyles}
        >
          <Box>
            <Text color="white" fontSize="sm" fontWeight="400" mb={0.5}>
              {primaryTitle}
            </Text>
            <Text color="whiteAlpha.600" fontSize="xs">
              {primaryDesc}
            </Text>
          </Box>
        </MenuItem>
        {driveViewUrl && (
          <MenuItem
            as="a"
            href={driveViewUrl}
            target="_blank"
            rel="noopener noreferrer"
            {...itemStyles}
          >
            <Box>
              <Text color="white" fontSize="sm" fontWeight="400" mb={0.5}>
                Original
              </Text>
              <Text color="whiteAlpha.600" fontSize="xs">
                Full quality{fileSize ? ` · ${formatFileSize(fileSize)}` : ''}
              </Text>
            </Box>
          </MenuItem>
        )}
      </MenuList>
    </Menu>
  );
};

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
  fileSize,
  driveViewUrl,
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
  const isLargeFile =
    typeof fileSize === 'number' && fileSize > LARGE_FILE_THRESHOLD;
  const useMobileSaveFlow =
    isTouchDevice && Boolean(mobileSaveUrl) && !isLargeFile;
  const useMobileDriveFlow =
    isTouchDevice && isLargeFile && Boolean(driveViewUrl);

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
          {downloadUrl || mobileSaveUrl || driveViewUrl ? (
            useMobileDriveFlow ? (
              // Large-file path on mobile: skip the in-app save flow
              // entirely. Pre-fetching a 100+ MB blob through our Vercel
              // proxy would either time out, exhaust browser memory, or
              // waste a lot of bandwidth. Drive's native viewer handles
              // arbitrarily large files just fine.
              <CTAButton
                href={driveViewUrl!}
                newTab
                icon={FaExternalLinkAlt}
                tone="dark"
                size="sm"
              >
                Open in Drive
              </CTAButton>
            ) : useMobileSaveFlow ? (
              // Mobile path (small files): dropdown with two options.
              //
              //   Save to Photos → handleMobileSave runs the Web Share
              //     API on the pre-fetched (resized) blob. iOS's share
              //     sheet shows "Save to Photos" as the first option.
              //   Open original → opens Drive's viewer in a new tab;
              //     client can grab the full-res file from Drive's UI.
              //
              // Web Share API needs a synchronous user gesture, which the
              // MenuItem onClick provides — Chakra fires onClick inline
              // before closing the menu, so the gesture isn't consumed.
              <DownloadMenu
                fileSize={fileSize}
                onPrimary={handleMobileSave}
                primaryTitle="Optimized"
                primaryDesc="Smaller file, quick save"
                driveViewUrl={driveViewUrl}
                triggerLabel="Save"
              />
            ) : downloadUrl ? (
              // Desktop path: dropdown with two options.
              //
              //   Optimized → downloadUrl points at our /api/photo proxy
              //     which serves a 2400px webp with Content-Disposition:
              //     attachment. In-page Save dialog, no Drive interstitial.
              //   Original → Drive's viewer in a new tab for the full-res
              //     file. Doesn't count against our Origin Transfer quota.
              <DownloadMenu
                fileSize={fileSize}
                primaryHref={downloadUrl}
                primaryDownload={downloadFilename ?? true}
                primaryTitle="Optimized"
                primaryDesc="Smaller file, fast download"
                driveViewUrl={driveViewUrl}
                triggerLabel="Download"
              />
            ) : (
              <CTAButton onClick={handleViewPhotoPage} tone="dark" size="sm">
                View Photo Page →
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
