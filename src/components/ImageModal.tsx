import {
  Box,
  Text,
  Flex,
} from '@chakra-ui/react';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ExternalLinkIcon, ViewIcon } from '@chakra-ui/icons';
import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import { motion } from 'framer-motion';
import { useCopyNotification } from './CopyNotification';

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
}: ImageModalProps) => {
  const [touchStart, setTouchStart] = useState({ x: 0, y: 0 });
  const [touchEnd, setTouchEnd] = useState({ x: 0, y: 0 });
  const scrollYRef = useRef(0);
  const scrollLockedRef = useRef(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showUI, setShowUI] = useState(false);
  const [backdropOpacity, setBackdropOpacity] = useState(1);

  const { show: showCopied, Notification: CopyNotification } = useCopyNotification();

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
          {photoData && category && (
            <>
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
              <Box
                as="button"
                aria-label="Open in new tab"
                onClick={() => {
                  const shareUrl = `/photo/${category}/${photoData.id}`;
                  const fullUrl = `${window.location.origin}${shareUrl}`;
                  window.open(fullUrl, '_blank');
                }}
                color="whiteAlpha.600"
                transition="color 0.3s"
                _hover={{ color: '#c9a96e' }}
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <ViewIcon boxSize={4} />
              </Box>
            </>
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
