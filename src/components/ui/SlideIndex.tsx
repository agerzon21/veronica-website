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

/**
 * How many numerals a phone shows at once.
 *
 * Six on any phone made this decade. Four below 340px, where six plus the
 * gap measured 347px inside a 320px screen and hung off both edges: the
 * choice there is fewer numbers or smaller targets, and a target you cannot
 * hit is worth less than a number you cannot see.
 *
 * Exported because both rails page by these, and a phone that pages at six in
 * one place and seven in another is two bugs waiting to be found separately.
 */
export const WINDOW_SIZE = 6;
export const WINDOW_SIZE_NARROW = 4;
export const NARROW_VW = 340;

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
        // Explicit, because the journal rail's wrapper sets pointerEvents
        // none so its full-width band stops covering the slide underneath.
        // The homepage rail's container already sets auto, so this changes
        // nothing there.
        pointerEvents="auto"
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
  // swapNumerals is not a caller's choice here: it is exactly "is this row
  // paging", and the rail is the only thing that knows.
  extends Omit<SlideIndexSlotProps, 'i' | 'index' | 'swapNumerals'> {
  index: number;
  /**
   * Page the row instead of showing every numeral. 0 shows them all.
   *
   * Pass WINDOW_SIZE_NARROW below NARROW_VW and WINDOW_SIZE on any other
   * phone; desktop has the room and should pass 0.
   */
  windowSize?: number;
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
 *
 * IT PAGES, it does not slide. The same numerals sit still while the
 * highlight walks across them, and only when it reaches the end does the set
 * turn over. Advancing by one every slide would change every numeral every
 * few seconds, so instead of reading as a position in a set it reads as one
 * number churning. The last page is clamped to a full row rather than left
 * ragged, so a count that does not divide evenly overlaps the previous page
 * instead of showing one numeral and a gap.
 */
export const SlideIndexRail: React.FC<SlideIndexRailProps> = ({
  total,
  index,
  compact,
  windowSize = 0,
  ...slot
}) => {
  const windowed = windowSize > 0 && total > windowSize;
  const pageStart = windowed
    ? Math.max(0, Math.min(Math.floor(index / windowSize) * windowSize, total - windowSize))
    : 0;
  const count = windowed ? windowSize : total;

  return (
    <Flex align="center" gap={compact ? '6px' : '14px'} justify="flex-start">
      {Array.from({ length: count }, (_, k) => {
        const i = pageStart + k;
        return (
          <SlideIndexSlot
            // Keyed by SLOT, not by numeral, so a page turn animates the
            // numerals inside slots that stay put rather than remounting the
            // whole row.
            key={windowed ? `slot-${k}` : i}
            i={i}
            total={total}
            index={index}
            compact={compact}
            swapNumerals={windowed}
            {...slot}
          />
        );
      })}
    </Flex>
  );
};
