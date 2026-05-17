import { useEffect, useState } from 'react';
import { Box, Icon } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { FaSyncAlt } from 'react-icons/fa';

// Pull-to-refresh: we suppress native iOS pull-to-refresh (overscroll-behavior
// + Lenis syncTouch consume the gesture), so this re-implements it custom and
// in-brand. Indicator drops down from the top of the viewport, the ring fills
// as the user keeps pulling, and the page reloads when the threshold is hit.
const TRIGGER_DISTANCE = 80;   // px of resisted pull before refresh fires
const MAX_DISTANCE = 110;      // ceiling so the indicator never escapes too far
const RESISTANCE = 0.5;        // raw delta is halved — makes the pull feel weighty
const INDICATOR_OFFSET = 56;   // initial offset above the viewport top

const PullToRefresh = () => {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let startY = 0;
    let pullDelta = 0;
    let active = false;

    const onTouchStart = (e: TouchEvent) => {
      // Only arm the gesture when the user is at the absolute top of the page.
      // 2px of tolerance covers Lenis's lerp jitter near 0.
      if (window.scrollY > 2 || e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      pullDelta = 0;
      active = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active) return;
      // If the page has scrolled down mid-gesture (Lenis/native took over),
      // bail out of pull mode.
      if (window.scrollY > 2) {
        active = false;
        setPullDistance(0);
        return;
      }
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        // User pulled up, not a refresh gesture.
        active = false;
        setPullDistance(0);
        return;
      }
      pullDelta = delta;
      setPullDistance(Math.min(delta * RESISTANCE, MAX_DISTANCE));
    };

    const onTouchEnd = () => {
      if (!active) return;
      active = false;
      const finalDistance = pullDelta * RESISTANCE;
      pullDelta = 0;
      if (finalDistance >= TRIGGER_DISTANCE && !refreshing) {
        // Lock the indicator at the trigger position so the user sees the
        // committed state before the reload kicks in.
        setPullDistance(TRIGGER_DISTANCE);
        setRefreshing(true);
        setTimeout(() => window.location.reload(), 450);
      } else {
        setPullDistance(0);
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchEnd);

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [refreshing]);

  const progress = Math.min(pullDistance / TRIGGER_DISTANCE, 1);
  const armed = progress >= 1;
  const visible = pullDistance > 4 || refreshing;

  return (
    <Box
      position="fixed"
      top={0}
      left="50%"
      width="44px"
      height="44px"
      marginLeft="-22px"
      zIndex={9999}
      pointerEvents="none"
      style={{
        // Translate so the indicator drops in from above the viewport edge.
        transform: `translateY(${pullDistance - INDICATOR_OFFSET}px)`,
        opacity: visible ? 1 : 0,
        // Animate the snap-back when the gesture is released without a trigger;
        // during the pull itself, follow the finger 1:1.
        transition: pullDistance === 0
          ? 'transform 0.3s ease-out, opacity 0.25s ease-out'
          : 'opacity 0.15s ease-out',
      }}
    >
      <Box
        width="44px"
        height="44px"
        borderRadius="full"
        bg="white"
        boxShadow="0 4px 14px rgba(0,0,0,0.12)"
        display="flex"
        alignItems="center"
        justifyContent="center"
        position="relative"
      >
        {/* Ring — softer when the user is mid-pull, fully saturated once
            they're past the trigger threshold (signals "release to refresh"). */}
        <Box
          position="absolute"
          inset={0}
          borderRadius="full"
          border="1.5px solid"
          borderColor={armed ? '#c9a96e' : 'rgba(201, 169, 110, 0.35)'}
          style={{ transition: 'border-color 0.2s ease-out' }}
        />
        <motion.div
          animate={
            refreshing
              ? { rotate: 360 }
              : { rotate: progress * 270 }
          }
          transition={
            refreshing
              ? { duration: 0.7, ease: 'linear', repeat: Infinity }
              : { duration: 0 }
          }
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon as={FaSyncAlt} color="#c9a96e" boxSize="14px" />
        </motion.div>
      </Box>
    </Box>
  );
};

export default PullToRefresh;
