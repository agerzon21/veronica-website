import { Box } from '@chakra-ui/react';
import { useEffect, useMemo, useState } from 'react';

/**
 * The drifting field of photographs behind the client portal's sign-in.
 *
 * ONE SPRITE, NOT 120 IMAGES. Every tile is a background-position into
 * public/assets/portal/mosaic.webp, built by scripts/build-portal-mosaic.mjs.
 * One request, one decode. It is also LIGHTER than what it replaces: the page
 * used to load a single full-bleed photograph at 913 KB, and the sheet is
 * about 220 KB for a hundred and twenty of them.
 *
 * ODD ROWS TRAVEL LEFT, EVEN ROWS RIGHT, each at its own duration so the
 * field never resolves into a grid marching in step. Each row renders its
 * tiles twice and translates by exactly -50%, which is what makes the loop
 * seamless rather than snapping.
 *
 * THE VEIL IS ONE VALUE ON EVERY ROW. Earlier versions lightened the top so
 * the gold eyebrow would clear 4.5:1 and it read as a spotlight, which the
 * owner rejected twice. Measured against the real sheet, a third of its
 * pixels sit in the darkest luminance decile and brand.accentText needs a
 * background within two percent of cream, so no uniform value was ever going
 * to carry it. The header brings its own soft spot instead (PortalHalo).
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

interface Size {
  tw: number;
  th: number;
  gap: number;
  rows: number;
  perRow: number;
}

const DESKTOP: Size = { tw: 105, th: 140, gap: 5, rows: 7, perRow: 14 };
const PHONE: Size = { tw: 70, th: 94, gap: 4, rows: 10, perRow: 9 };

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

interface Props {
  /** Cream over the photographs, 0 to 1. One value, every row. */
  veil?: number;
}

const PortalMosaic = ({ veil = 0.62 }: Props) => {
  const affords = useAffordsMosaic();
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

  const tiles = useMemo(() => {
    const build = (s: Size) =>
      Array.from({ length: s.rows }, (_, r) =>
        Array.from({ length: s.perRow }, (_, i) => ((r + 1) * 17 + i * 11) % N_TILES),
      );
    return { desktop: build(DESKTOP), phone: build(PHONE) };
  }, []);

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
        <Box position="absolute" inset={0} bg={`rgba(253,249,240,${veil})`} aria-hidden="true" />
      </>
    );
  }

  const field = (s: Size, rows: number[][], display: Record<string, string>) => (
    <Box
      aria-hidden="true"
      position="absolute"
      inset={0}
      overflow="hidden"
      display={display}
      flexDirection="column"
      gap={`${s.gap}px`}
      opacity={sheetReady ? 1 : 0}
      transition="opacity 0.6s ease"
      sx={{ '@media (prefers-reduced-motion: reduce)': { transition: 'none' } }}
    >
      {rows.map((row, r) => (
        <Box
          key={r}
          display="flex"
          gap={`${s.gap}px`}
          width="max-content"
          willChange="transform"
          sx={{
            animation: `${r % 2 === 0 ? 'veroMosaicLeft' : 'veroMosaicRight'} ${r % 2 === 0 ? 58 : 66}s linear infinite`,
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
          renders its tiles exactly twice. */}
      <style>{`
@keyframes veroMosaicLeft { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes veroMosaicRight { from { transform: translateX(-50%); } to { transform: translateX(0); } }
`}</style>
      {field(PHONE, tiles.phone, { base: 'flex', md: 'none' })}
      {field(DESKTOP, tiles.desktop, { base: 'none', md: 'flex' })}
      <Box position="absolute" inset={0} bg={`rgba(253,249,240,${veil})`} aria-hidden="true" />
    </>
  );
};

export default PortalMosaic;
