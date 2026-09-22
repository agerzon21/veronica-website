import React from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { m, AnimatePresence } from 'framer-motion';

/**
 * The 01 02 03 rail: one numeral per slide, and a line that fills between the
 * current numeral and the next one as the slide runs, so the wait is visible
 * rather than a surprise.
 *
 * This file owns the SLOT — the numeral plus its growing rule — and nothing
 * else. It was lifted out of ImageCarousel when the weddings journal
 * slideshow asked for the same language, because the alternative was a second
 * copy of numbers that had already been tuned three times (the rule widths,
 * the 44px phone target, the paging window, the reduced-motion fallback) and
 * would have drifted from the homepage's within a release.
 *
 * LAYOUT IS DELIBERATELY NOT HERE. The homepage rail is absolutely positioned
 * inside a element the hero scales, split into two halves around the scroll
 * cue, and faded out past a scale threshold; the journal rail is a plain row
 * at the bottom of a card. Those have nothing in common but the slot, so each
 * caller keeps its own container and only the slot is shared.
 */

/** How far the rule travels while a slide runs. */
const RULE_TRAVEL_PX = { compact: 26, full: 62 };
/**
 * How far it travels when it is NOT a promise about time: reduced motion, or
 * a slideshow that is not currently advancing. Short, and it settles at once,
 * because a line that fills over five seconds when nothing is going to happen
 * in five seconds is a lie.
 */
const RULE_STATIC_PX = { compact: 12, full: 26 };

export interface SlideIndexSlotProps {
  /** Zero-based index of this slot. */
  i: number;
  /** Total number of slides, for the accessible label. */
  total: number;
  /** Zero-based index of the slide currently on screen. */
  index: number;
  /** Is the slideshow actually advancing right now? See rotating below. */
  rotating: boolean;
  /** One slide's time on screen, in ms. Must match the caller's interval. */
  slideMs: number;
  onPick: (i: number) => void;
  /** Tighten type and targets so a row of numerals fits a phone. */
  compact: boolean;
  /**
   * Animate the numeral itself in and out on change. Only the homepage needs
   * it, because its phone rail PAGES: the same six slots stay put and their
   * numerals turn over, so without this the change is invisible.
   */
  swapNumerals?: boolean;
  /** Overridden by the journal rail, whose label is not about photos. */
  label?: (i: number, total: number) => string;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One numeral, plus the growing line when it is the active one.
 *
 * The line lives INSIDE its own slot, so its width only ever pushes the
 * numerals that come after it. That is what stopped it moving the homepage's
 * centre gap and putting a number on top of the mouse icon.
 */
export const SlideIndexSlot: React.FC<SlideIndexSlotProps> = ({
  i,
  total,
  index,
  rotating,
  slideMs,
  onPick,
  compact,
  swapNumerals = false,
  label = (n, t) => `Show photo ${n + 1} of ${t}`,
}) => {
  const active = i === index;
  const reduced = prefersReducedMotion();
  const still = reduced || !rotating;
  const travel = still
    ? compact
      ? RULE_STATIC_PX.compact
      : RULE_STATIC_PX.full
    : compact
      ? RULE_TRAVEL_PX.compact
      : RULE_TRAVEL_PX.full;

  return (
    <>
      <Box
        as="button"
        type="button"
        onClick={() => onPick(i)}
        aria-label={label(i, total)}
        aria-current={active ? 'true' : undefined}
        flexShrink={0}
        bg="transparent"
        border="none"
        p={0}
        cursor="pointer"
        lineHeight="1"
        minW={compact ? '34px' : undefined}
        minH={compact ? '44px' : undefined}
        display={compact ? 'inline-flex' : undefined}
        alignItems={compact ? 'center' : undefined}
        justifyContent={compact ? 'center' : undefined}
        fontSize={compact ? '15px' : '17px'}
        letterSpacing={compact ? '0.06em' : '0.16em'}
        fontWeight="400"
        color={active ? 'white' : 'rgba(255,255,255,0.55)'}
        transition="color 0.35s ease"
        _hover={{ color: 'white' }}
        _focusVisible={{ outline: '2px solid white', outlineOffset: '3px' }}
        sx={{ WebkitTapHighlightColor: 'transparent', textShadow: '0 1px 6px rgba(0,0,0,0.45)' }}
      >
        {swapNumerals ? (
          <Box position="relative" w="100%" h="100%" display="flex" alignItems="center" justifyContent="center">
            <AnimatePresence initial={false}>
              <m.span
                key={i}
                initial={{ opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -7 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                style={{ position: 'absolute', lineHeight: 1 }}
              >
                {String(i + 1).padStart(2, '0')}
              </m.span>
            </AnimatePresence>
          </Box>
        ) : (
          String(i + 1).padStart(2, '0')
        )}
      </Box>
      {active && (
        <m.span
          key={`rule-${index}`}
          aria-hidden
          initial={{ width: 0 }}
          animate={{ width: travel }}
          transition={still ? { duration: 0.25 } : { duration: slideMs / 1000, ease: 'linear' }}
          style={{
            height: 1,
            background: 'rgba(255,255,255,0.9)',
            boxShadow: '0 1px 6px rgba(0,0,0,0.45)',
            display: 'block',
            flexShrink: 0,
          }}
        />
      )}
    </>
  );
};

export interface SlideIndexRailProps
  extends Omit<SlideIndexSlotProps, 'i' | 'index'> {
  index: number;
}

/**
 * A plain left-aligned row of slots.
 *
 * LEFT-ALIGNED, not centred or right-aligned, and that is the whole design.
 * The rule grows by up to 62px while a slide runs, so whichever edge the row
 * is anchored from is the edge that stays still and everything on the other
 * side of the active numeral walks. Anchored left, only the numerals AFTER
 * the active one move, which reads as the line pushing forward into the rest
 * of the set. Anchored right or centred, the numerals already behind you
 * drift, which reads as the row sliding.
 *
 * The homepage cannot use this: it has a scroll cue sitting in the middle of
 * its rail and solves the same problem by splitting into two fixed halves.
 */
export const SlideIndexRail: React.FC<SlideIndexRailProps> = ({
  total,
  index,
  compact,
  ...slot
}) => (
  <Flex align="center" gap={compact ? '6px' : '14px'} justify="flex-start">
    {Array.from({ length: total }, (_, i) => (
      <SlideIndexSlot
        key={i}
        i={i}
        total={total}
        index={index}
        compact={compact}
        {...slot}
      />
    ))}
  </Flex>
);
