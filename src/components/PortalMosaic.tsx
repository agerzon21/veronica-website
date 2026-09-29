import { Box } from '@chakra-ui/react';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';

/**
 * The drifting field of photographs behind the client portal's sign-in.
 *
 * ONE SPRITE, NOT 120 IMAGES. Every tile is a background-position into
 * public/assets/portal/mosaic.webp, built by scripts/build-portal-mosaic.mjs.
 * One request, one decode. It is also LIGHTER than what it replaces: the page
 * used to load a single full-bleed photograph at 913 KB, and the sheet is
 * about 220 KB for a hundred and twenty of them.
 *
 * EVEN ROWS TRAVEL LEFT, ODD ROWS RIGHT, each at its own speed so the field
 * never resolves into a grid marching in step. That claim used to be written
 * the other way round AND it used to be false: there were two durations and
 * two start times, so every other row was in exact lockstep. Each row now
 * derives its own duration from a fixed px/s velocity and a per-row jitter,
 * which is what actually makes it true. See SPEED and rowJitter.
 *
 * Each row renders its tiles twice and translates by exactly -50%, which is
 * what makes the loop seamless rather than snapping.
 *
 * THE VEIL IS ONE VALUE ON EVERY ROW, and a different one on a phone. Earlier
 * versions lightened the TOP of the field so the gold eyebrow would clear
 * 4.5:1, and it read as a spotlight, which the owner rejected twice. Measured
 * against the real sheet, a third of its pixels sit in the darkest luminance
 * decile and brand.accentText needs a background within two percent of cream,
 * so no uniform value was ever going to carry it and none is asked to: the
 * header and the offramp bring their own opaque soft spots (SoftSpot, in
 * src/pages/Portal.tsx), which is what actually puts the gold on cream.
 *
 * The pair {base, md} is not a gradient and does not reintroduce one. It is
 * two flat values, one per screen, because a phone shows about a third as
 * many tiles at three times the size and the same veil leaves far more of one
 * photograph showing. Both numbers were read off the tuning canvas.
 *
 * IT STOPS COMPLETELY under prefers-reduced-motion, and never starts at all
 * on a connection that cannot afford it.
 */

const SPRITE = '/assets/portal/mosaic.webp';
const COLS = 12;
const ROWS_IN_SHEET = 10;
const N_TILES = COLS * ROWS_IN_SHEET;

/** The single photograph the page used to be, kept as the fallback. */
const FALLBACK = '/assets/photos/site/client-portal.webp';

interface Tile {
  tw: number;
  th: number;
  gap: number;
}

/**
 * Tile sizes only. How MANY is measured from the FIELD'S OWN BOX, not guessed
 * and no longer read off the window, which is a different number the moment
 * the form makes the page taller than the screen. See useField.
 *
 * Both counts were fixed numbers and both were wrong. 7 rows of 140 is
 * 1010px, so any window taller than that, which is most of them, showed a
 * band of bare cream under the photographs. And because each row renders its
 * tiles twice and travels exactly -50%, one copy has to be at least as wide
 * as the window or a gap walks across the screen partway through the loop;
 * 14 tiles of 110 is 1540px, narrower than a 1920 monitor.
 *
 * Neither appeared at 1280x880, which is the size I had been screenshotting.
 * Deriving both from the viewport fixes the small screens and the large ones
 * at once, and means a phone does not carry the tile count a 2560 monitor
 * needs.
 */
const DESKTOP: Tile = { tw: 105, th: 140, gap: 5 };
const PHONE: Tile = { tw: 70, th: 94, gap: 4 };

/**
 * How fast the field drifts, in PIXELS PER SECOND rather than seconds a loop.
 *
 * It used to be a flat 58s and 66s, and a duration is the wrong unit for this:
 * a row travels half its own width, and its width is derived from the window,
 * so the SAME number was a different speed on every screen. Measured off the
 * shipped build, one row ran at 8.9 px/s on a 440px phone and 49.3 px/s on a
 * 2560px monitor, a 5.5x spread. Slowing the duration down would have
 * over-slowed the phone and barely touched the monitor, which is the screen
 * the complaint came from.
 *
 * 8.0 and 6.9 sit just under the phone's old speed, which is the one screen
 * nobody has ever objected to, and 80:69 shares no factor, so the two
 * directions do not fall back into phase with each other.
 */
const SPEED = { left: 8.0, right: 6.9 };

/**
 * Up to six percent either side, per row, from the row's index alone.
 *
 * The rows used to run at two durations from two start times, so every other
 * row was in exact lockstep: rows 0 and 2 held identical transforms the whole
 * way round. A field whose bands move as one is most of what makes it tiring
 * to sit in front of, which is the thing being fixed here.
 *
 * The modulus is 23 and not 11 because two rows only share a duration if they
 * share BOTH a jitter and a direction. 37 and 23 are coprime, so the jitter
 * has a full period of 23, and 23 is odd, so a repeat lands on the opposite
 * parity and the first genuine collision is 46 rows apart. The tallest field
 * this renders is about 15 rows.
 */
const rowJitter = (r: number) => 1 + ((((r * 37) % 23) - 11) / 11) * 0.06;

/**
 * Is this a connection we should be putting a 220 KB decorative sheet on?
 *
 * Save-Data is an explicit request and is obeyed without argument. The
 * effectiveType check is the browser's own estimate; 2g and slow-2g get the
 * single photograph, which is bigger but is ONE image the browser can show
 * progressively rather than a sheet that must fully arrive before any tile
 * paints. navigator.connection is Chromium-only, so Safari simply takes the
 * mosaic, which is the right default.
 */
function useAffordsMosaic(): boolean {
  const [affords, setAffords] = useState(true);

  useEffect(() => {
    const nav = navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string; addEventListener?: (t: string, f: () => void) => void; removeEventListener?: (t: string, f: () => void) => void };
    };
    const c = nav.connection;
    if (!c) return;
    const read = () => {
      const slow = c.effectiveType === '2g' || c.effectiveType === 'slow-2g';
      setAffords(!(c.saveData === true || slow));
    };
    read();
    c.addEventListener?.('change', read);
    return () => c.removeEventListener?.('change', read);
  }, []);

  return affords;
}

/**
 * The field's own box, as it needs to know it: which tile size, and how many.
 *
 * The WINDOW still picks the tile size, because that has to agree with the
 * theme's `md` breakpoint. The BOX decides the counts, because the box is
 * what has to be covered and it is taller than the window whenever the form
 * is.
 *
 * One field is built, not two behind a responsive `display`, because the
 * losing one's tiles would sit in the DOM doing nothing.
 */
function useField(el: HTMLElement | null): {
  tile: Tile;
  rows: number;
  perRow: number;
  measured: boolean;
} {
  const read = (boxH: number, boxW: number) => {
    const w = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const h = typeof window === 'undefined' ? 900 : window.innerHeight;
    const tile = w < 768 ? PHONE : DESKTOP;
    const pitch = tile.th + tile.gap;
    // THE FIELD'S OWN HEIGHT, not the window's.
    //
    // This used to read window.innerHeight, and the field is `inset: 0` inside
    // a `minH="100vh"` box that GROWS with the form, so the moment the page
    // was taller than the window the last rows were never built and the
    // photographs stopped partway down: measured 112px of bare cream at
    // 1280x600 and 393px on a landscape phone. It also meant that on iOS,
    // where scrolling collapses the URL bar and fires a resize, scrolling
    // literally added a row, which is what looked like lazy loading. Nothing
    // here was ever lazy: the whole field is one sprite sheet in one request,
    // so covering the box costs no bytes at all, only DOM nodes.
    const height = Math.max(boxH, h);
    return {
      tile,
      // Exactly enough to cover the box, and no spare. `ceil` guarantees the
      // rows are at least as tall as the box, so there is never bare cream
      // under them; anything past the edge bleeds off the bottom under the
      // footer, which is where the old spare row was going anyway.
      //
      // What this does NOT do is control how much of the last row shows: that
      // is `height % pitch` and it can be a thin stripe. Fixing THAT means
      // sizing the tiles so a whole number of rows divides the box, which
      // makes the tile size a function of the viewport. It is a real option
      // and a separate decision, not an oversight.
      rows: Math.max(2, Math.ceil((height + tile.gap) / pitch)),
      // One COPY must cover the width; the row renders two of them.
      perRow: Math.ceil(Math.max(boxW, w) / (tile.tw + tile.gap)) + 2,
    };
  };
  const [field, setField] = useState(() => ({ ...read(0, 0), measured: false }));
  useLayoutEffect(() => {
    if (!el) return;
    // MEASURE ONCE, SYNCHRONOUSLY, BEFORE THE FIRST PAINT.
    //
    // The observer below does not deliver its first callback until a later
    // task, and on a warm cache the sprite is already decoded by then, so the
    // field would fade up to full opacity still carrying a row count read off
    // the WINDOW. Because the surplus is now centred, that shortfall shows at
    // BOTH edges rather than only the bottom: measured 269px of bare cream
    // above and below on an 844x390 page, on 5 of 12 warm reloads. That is
    // the exact defect this change exists to remove, so it cannot be allowed
    // to flash on the way in.
    const first = el.getBoundingClientRect();
    setField({ ...read(first.height, first.width), measured: true });
    // The field's height comes from `inset: 0`, never from its children, and
    // the rows overflow rather than stretching it, so adding rows can never
    // re-fire this. Verified by attaching a real observer and appending rows:
    // zero additional fires.
    const ro = new ResizeObserver(([entry]) => {
      const next = read(entry.contentRect.height, entry.contentRect.width);
      setField((prev) =>
        prev.rows === next.rows && prev.perRow === next.perRow && prev.tile === next.tile
          ? prev
          : { ...next, measured: true },
      );
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return field;
}

interface Props {
  /**
   * Cream over the photographs, 0 to 1. One value, every row.
   *
   * A pair rather than a number, because the right amount is not the same on
   * the two screens. A phone shows about a third as many tiles at three times
   * the size, so the same veil leaves far more of one photograph under the
   * words, and the words are bigger relative to the page. Both numbers were
   * read off the tuner, one per board.
   */
  veil?: number | { base: number; md: number };
}

const PortalMosaic = ({ veil = 0.62 }: Props) => {
  // One cream value, or two. Written once here so the two places that paint
  // the veil cannot answer the question differently.
  const veilBg =
    typeof veil === 'number'
      ? `rgba(253,249,240,${veil})`
      : { base: `rgba(253,249,240,${veil.base})`, md: `rgba(253,249,240,${veil.md})` };
  const affords = useAffordsMosaic();
  const [fieldEl, setFieldEl] = useState<HTMLDivElement | null>(null);
  const { tile, rows: rowCount, perRow, measured } = useField(fieldEl);
  const [sheetReady, setSheetReady] = useState(false);
  const [sheetFailed, setSheetFailed] = useState(false);

  // Decode the sheet before painting a single tile. Without this the 120 tiles
  // appear as 120 empty boxes and then pop, which on a slow phone is worse
  // than the still photograph. iOS also stops decoding under memory pressure
  // and fires NEITHER load nor error, so this can never gate the FORM, only
  // the decoration: see reference_ios_image_memory.
  useEffect(() => {
    if (!affords) return;
    let live = true;
    const img = new Image();
    img.onload = () => { if (live) setSheetReady(true); };
    img.onerror = () => { if (live) setSheetFailed(true); };
    img.src = SPRITE;
    return () => { live = false; };
  }, [affords]);

  const still = !affords || sheetFailed;

  const rows = useMemo(
    () =>
      Array.from({ length: rowCount }, (_, r) =>
        Array.from({ length: perRow }, (_, i) => ((r + 1) * 17 + i * 11) % N_TILES),
      ),
    [rowCount, perRow],
  );

  if (still) {
    return (
      <>
        <Box
          position="absolute"
          inset={0}
          backgroundImage={`url('${FALLBACK}')`}
          backgroundSize="cover"
          backgroundPosition={{ base: 'center 30%', md: 'center' }}
          backgroundRepeat="no-repeat"
          aria-hidden="true"
        />
        <Box position="absolute" inset={0} bg={veilBg} aria-hidden="true" />
      </>
    );
  }

  // Exactly what the -50% keyframe moves: half the row's own width, built from
  // the same numbers that build the row so the two cannot drift apart.
  const travelOf = (s: Tile) => perRow * s.tw + (perRow - 0.5) * s.gap;

  const field = (s: Tile, tileRows: number[][]) => (
    <Box
      ref={setFieldEl}
      aria-hidden="true"
      position="absolute"
      inset={0}
      overflow="hidden"
      display="flex"
      flexDirection="column"
      // FLEX-START, deliberately, and do not "improve" this to center.
      //
      // The container's TOP is the only edge of it that never moves: its
      // bottom travels every time a door opens and the page gets taller.
      // Anchoring the rows to the top is therefore the only arrangement in
      // which the photographs hold still. Centering the surplus looks tidier
      // in a screenshot and costs a vertical jump of the whole field on the
      // page's primary interaction: measured 71px, landing in a single
      // frame, on a door switch at 1280x600.
      //
      // So the surplus bleeds off the bottom, under the footer, which is what
      // it did before and is the right place for it.
      gap={`${s.gap}px`}
      // `measured` as well as `sheetReady`: a field whose row count still
      // comes from the window is exactly the bug being fixed, so it must not
      // be painted on the way in. Both flags settle in the same commit, so on
      // a cold load this is the same 0.6s fade it always was.
      opacity={sheetReady && measured ? 1 : 0}
      transition="opacity 0.6s ease"
      sx={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
    >
      {tileRows.map((row, r) => (
        <Box
          key={r}
          data-mosaic-row=""
          display="flex"
          gap={`${s.gap}px`}
          width="max-content"
          flexShrink={0}
          willChange="transform"
          sx={{
            animation: `${r % 2 === 0 ? 'veroMosaicLeft' : 'veroMosaicRight'} ${(
              travelOf(s) / ((r % 2 === 0 ? SPEED.left : SPEED.right) * rowJitter(r))
            ).toFixed(1)}s linear infinite`,
            // A NEGATIVE delay, so every row starts part way through its own
            // loop instead of all of them starting at zero together.
            //
            // Differing durations alone only separate the rows as the
            // difference accumulates: measured, same-direction rows begin
            // within 0.121px of each other and take about half a minute to
            // spread 23px. So the field spent its first impression as the
            // marching grid this file says it avoids, which is the arrival
            // everybody actually sees. Starting each row at a different phase
            // makes it true from the first frame.
            animationDelay: `-${(((r * 7) % 13) / 13) * 60}s`,
            '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
          }}
        >
          {[...row, ...row].map((t, i) => (
            <Box
              key={i}
              flexShrink={0}
              width={`${s.tw}px`}
              height={`${s.th}px`}
              backgroundImage={`url('${SPRITE}')`}
              backgroundRepeat="no-repeat"
              backgroundSize={`${COLS * s.tw}px ${ROWS_IN_SHEET * s.th}px`}
              backgroundPosition={`-${(t % COLS) * s.tw}px -${Math.floor(t / COLS) * s.th}px`}
            />
          ))}
        </Box>
      ))}
    </Box>
  );

  return (
    <>
      {/* The keyframes live here rather than in the theme because nothing else
          on the site uses them, and -50% is only correct because each row
          renders its tiles exactly twice.

          THE FIELD HOLDS STILL WHILE ANYONE IS INSIDE THE FORM. The hook is
          the page wrapper in Portal.tsx and not a sibling of this field,
          because the form comes AFTER the field in the DOM and no sibling
          combinator reaches backwards. `:focus-within` rather than
          `:has(input:focus)`, which is what was asked for literally: focus
          also lands on the password's show/hide button, and scoping to inputs
          alone restarts the drift for as long as it sits there, measured 16px
          of travel in the middle of typing a password.

          animation-play-state, NEVER `animation: none`. The reduced-motion
          rule above can use none because it applies from the first frame;
          removing the animation from a row that is already part way through
          its loop snaps it sideways by up to 2625px, measured. Pausing keeps
          the current time, so it resumes from exactly where it stopped.

          CSS and not React state: pausing this way re-renders nothing, and
          measured it leaks 0ms across a Tab from one field to the next, where
          a handler deferred through rAF or a transition leaks a frame. */}
      <style>{`
@keyframes veroMosaicLeft { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes veroMosaicRight { from { transform: translateX(-50%); } to { transform: translateX(0); } }
[data-mosaic-hold]:focus-within [data-mosaic-row] { animation-play-state: paused; }
`}</style>
      {field(tile, rows)}
      <Box position="absolute" inset={0} bg={veilBg} aria-hidden="true" />
    </>
  );
};

export default PortalMosaic;
