import { useEffect, useState, RefObject } from 'react';
import { Box, Icon } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import { FaSyncAlt } from 'react-icons/fa';

// Pull-to-refresh, GTA6-style:
//   - When the user pulls down at scrollY = 0, the *page content* translates
//     down with the gesture (with resistance), leaving a gap below the
//     navbar where a gold indicator drops in.
//   - The navbar (rendered as a sibling of the contentRef wrapper in App.tsx)
//     stays anchored, so a real visible gap opens between header and content.
//   - Past the trigger threshold, the indicator's ring saturates ("release to
//     refresh"). Release past the threshold reloads the page; release before
//     it snaps content + indicator back into place.
const TRIGGER_DISTANCE = 70;    // px of resisted pull before refresh fires
const MAX_DISTANCE = 100;       // ceiling on the visible pull
const RESISTANCE = 0.5;         // raw finger delta is halved — pull feels weighty
const NAVBAR_HEIGHT = 72;       // matches the fixed Navbar's actual rendered height

type Props = {
  contentRef: RefObject<HTMLDivElement>;
};

const PullToRefresh = ({ contentRef }: Props) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Apply translateY to the content wrapper as the pull progresses. Snap-back
  // gets a soft ease-out; while the user is actively pulling, follow 1:1 with
  // no transition (transition during pull would feel laggy).
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.style.transform = pullDistance > 0 ? `translateY(${pullDistance}px)` : '';
    el.style.transition =
      pullDistance === 0
        ? 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)'
        : 'none';
    el.style.willChange = pullDistance > 0 ? 'transform' : '';
  }, [pullDistance, contentRef]);

  useEffect(() => {
    let startY = 0;
    let pullDelta = 0;
    let active = false;

    const onTouchStart = (e: TouchEvent) => {
      // Only arm when the user is at the absolute top. 2px tolerance covers
      // Lenis's lerp jitter near 0.
      if (window.scrollY > 2 || e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      pullDelta = 0;
      active = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!active) return;
      if (window.scrollY > 2) {
        // Scroll started mid-gesture (Lenis or native took over). Cancel
        // pull mode and snap back.
        active = false;
        setPullDistance(0);
        return;
      }
      const delta = e.touches[0].clientY - startY;
      if (delta <= 0) {
        // User pulled up — not a refresh gesture.
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
        // Lock the indicator at the trigger position briefly so the user
        // sees the committed state, then reload.
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
  // Indicator is centered in the gap that opens between the navbar bottom
  // and the (translated) content top. As pullDistance grows, the gap grows;
  // we center the 44px indicator in it.
  const indicatorTop = NAVBAR_HEIGHT + Math.max(0, (pullDistance - 44) / 2);
  const visible = pullDistance > 4 || refreshing;

  return (
    <Box
      position="fixed"
      top={`${indicatorTop}px`}
      left="50%"
      width="44px"
      height="44px"
      marginLeft="-22px"
      zIndex={9999}
      pointerEvents="none"
      style={{
        opacity: visible ? 1 : 0,
        transition:
          pullDistance === 0
            ? 'top 0.35s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s'
            : 'opacity 0.15s',
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
            refreshing ? { rotate: 360 } : { rotate: progress * 270 }
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
