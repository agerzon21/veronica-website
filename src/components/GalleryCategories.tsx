import { Box, Text, Link as ChakraLink, VStack, Flex, Image, type ResponsiveValue } from '@chakra-ui/react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import Reveal, { useReveal } from './ui/Reveal';
import { gridSrcSet } from '../utils/gridSrcSet';
import { GALLERY_COMING_SOON, type GalleryCategory } from '../data/gallery-categories';

/**
 * `sourceWidth` is the file's own pixel width, copied from
 * src/data/photo-dims.json (which scripts/measure-photos.mjs writes). It is
 * the last srcset candidate, so a device that paints past the 1600 top rung
 * keeps the original instead of dropping to it. Importing photo-dims.json
 * here would be the drift-proof way to get it, but that file pulls
 * src/data/photos.ts and its 18KB of dims plus the photos CSV into
 * the /gallery chunk to read four numbers.
 *
 * If one of these photographs is ever swapped, update the number with it.
 * Getting it wrong only changes which candidate the browser prefers, and
 * only for devices past 1600 device px; it cannot break the tile, because
 * `src` is this same file.
 *
 * `image: null` is a category with no cover yet. It shows as a "Coming soon"
 * tile, like any category on GALLERY_COMING_SOON (src/data/gallery-categories.ts).
 */
interface Tile {
  name: GalleryCategory;
  title: string;
  image: string | null;
  sourceWidth: number;
  objectPosition: string;
}

/** The four tall panels, side by side from 48em up. */
const PANELS: Tile[] = [
  {
    name: 'portraits',
    title: 'Portraits',
    image: '/assets/photos/portraits/shadow-play-portrait.webp',
    sourceWidth: 3000,
    objectPosition: 'center 50%',
  },
  {
    name: 'weddings',
    title: 'Weddings',
    image: '/assets/photos/weddings/newlyweds-running-sea.webp',
    sourceWidth: 3500,
    objectPosition: 'center 25%',
  },
  {
    name: 'family',
    title: 'Family',
    image: '/assets/photos/family/elegant-family-studio-portrait-black.webp',
    sourceWidth: 3000,
    objectPosition: 'center 40%',
  },
  {
    name: 'maternity',
    title: 'Maternity',
    image: '/assets/photos/maternity/couples-beach-baby-bump-moment.webp',
    sourceWidth: 3000,
    objectPosition: 'center 35%',
  },
];

/**
 * Full-width bands under the panels, one above the other (the owner's layout,
 * 2026-10-03). A band is landscape at every width, which suits what goes in
 * them: a proposal is two people in a wide place, and aerial work is wide by
 * nature.
 */
const BANDS: Tile[] = [
  {
    name: 'proposals',
    title: 'Proposals',
    // 1536px wide, the best file there is for now. The band shows about two
    // fifths of its height, so the crop sits on the lantern with the date on
    // it and the kiss below it, with the sky of lanterns still around them.
    image: '/assets/photos/proposals/lantern-release-proposal.webp',
    sourceWidth: 1536,
    objectPosition: 'center 59%',
  },
  {
    name: 'aerial',
    title: 'Aerial',
    image: null,
    sourceWidth: 0,
    objectPosition: 'center 50%',
  },
];

/**
 * What one tile actually asks its source for.
 *
 * Below 48em the tiles stack full width, so the tile IS the window and
 * 100vw is the honest number (measured 380 CSS px painted in a 412 window).
 *
 * From 48em up the panels sit four-across, so each is about a quarter of the
 * window wide, and 25vw would be badly wrong: the tile is 65vh tall, and
 * object-fit: cover on a landscape source in a box that narrow scales it to
 * match the HEIGHT and crops the sides off. The source width consumed is
 * therefore 0.65 * vh * aspect, which for these four (1.32 to 1.50) is 0.86 to
 * 0.98 of vh. 100vh covers the widest of them with 2% to spare, and only
 * understates a tile when the window is more than 4x wider than it is tall.
 *
 * vh in `sizes` is measured, not assumed: Chrome picks the 3500px original on
 * a 768x1024 iPad at DPR 2 (needs 1999) and the 1600 rung on a 1440x900
 * laptop at DPR 1 (needs 1440). If a browser ever failed to parse it the whole
 * attribute falls back to 100vw, which is generous everywhere except that iPad
 * case, so the failure mode is a rung too small on a tablet, never a hole.
 *
 * A band is the full width at every size, so it is simply 100vw.
 */
const PANEL_SIZES = '(min-width: 48em) 100vh, 100vw';
const BAND_SIZES = '100vw';

const PANEL_HEIGHT = { base: '250px', md: '65vh' };
const BAND_HEIGHT = { base: '250px', md: '40vh' };

const isComingSoon = (tile: Tile) => tile.image === null || GALLERY_COMING_SOON.includes(tile.name);

const GalleryCategories = () => {
  // One observer for every reveal, on the same Box it has always watched.
  // The tiles have to arrive as one staggered run; giving each its own
  // observer would start them separately as they scrolled past and turn the
  // stagger into unrelated fades.
  const { ref, shown } = useReveal({ amount: 0.1 });

  return (
    <Box ref={ref} layerStyle="sectionTight" px={{ base: 4, md: 8, lg: 12 }}>
      <Reveal shown={shown} from={{ opacity: 0, y: 25 }} duration={0.8}>
        {/* Near-flush, deliberately. The reference the owner keeps citing
            runs "minimal spacing between grid items, creating a dense,
            compact presentation", at 16/20px these read as detached cards; at
            2px they read as one band of work. The bands keep the same gap. */}
        <Flex direction="column" gap={{ base: 2, md: 3 }}>
          <Flex direction={{ base: 'column', md: 'row' }} gap={{ base: 2, md: 3 }} justify="center">
            {PANELS.map((tile, index) => (
              <TileSlot key={tile.name} tile={tile} index={index} shown={shown} h={PANEL_HEIGHT} sizes={PANEL_SIZES} flex="1" />
            ))}
          </Flex>
          {BANDS.map((tile, index) => (
            <TileSlot
              key={tile.name}
              tile={tile}
              index={PANELS.length + index}
              shown={shown}
              h={BAND_HEIGHT}
              minH={{ md: '280px' }}
              sizes={BAND_SIZES}
            />
          ))}
        </Flex>
      </Reveal>
    </Box>
  );
};

function TileSlot({
  tile,
  index,
  shown,
  h,
  minH,
  sizes,
  flex,
}: {
  tile: Tile;
  index: number;
  shown: boolean;
  h: ResponsiveValue<string>;
  minH?: ResponsiveValue<string>;
  sizes: string;
  flex?: string;
}) {
  const reveal = (child: JSX.Element) => (
    <Reveal shown={shown} from={{ opacity: 0, y: 20 }} duration={0.6} delay={index * 0.1} style={{ height: '100%' }}>
      {child}
    </Reveal>
  );

  if (isComingSoon(tile)) {
    // Not a link: there is no gallery behind it yet, and a tile that looks
    // tappable and goes nowhere is worse than one that says so.
    return <Box flex={flex}>{reveal(<ComingSoonTile tile={tile} h={h} minH={minH} />)}</Box>;
  }

  return (
    <ChakraLink as={Link} to={`/gallery/${tile.name}`} _hover={{ textDecoration: 'none' }} flex={flex} display="block">
      {reveal(<PhotoTile tile={tile} h={h} minH={minH} sizes={sizes} />)}
    </ChakraLink>
  );
}

function PhotoTile({
  tile,
  h,
  minH,
  sizes,
}: {
  tile: Tile;
  h: ResponsiveValue<string>;
  minH?: ResponsiveValue<string>;
  sizes: string;
}) {
  const image = tile.image as string;
  return (
    <Box position="relative" h={h} minH={minH} overflow="hidden" cursor="pointer" data-group>
      {/* A real <img>, not a backgroundImage Box.
          These were the heaviest thing on /gallery and the only images on the
          site no audit had ever flagged: PageSpeed never reported them,
          because its image-delivery audit skips CSS backgrounds, whose painted
          size it cannot read. Measured at the Lighthouse mobile profile, 3000
          to 3500px originals were painted into a 380x250 tile, 1,534 KiB for
          the four. An <img> can carry the srcset the grid already builds.

          image-set() would have kept the Box, and was rejected: an
          unsupported or mistyped value there means NO background at all,
          where a bad srcset candidate still leaves `src`.

          alt is empty on purpose. The photograph is behind the label, the
          link is already named by the "Portraits" and "View Gallery" text
          inside it, and a described background would prepend a second
          sentence to every one of those link names. */}
      <Image
        src={image}
        srcSet={gridSrcSet(image, tile.sourceWidth)}
        sizes={sizes}
        alt=""
        loading="lazy"
        position="absolute"
        inset={0}
        w="100%"
        h="100%"
        objectFit="cover"
        objectPosition={tile.objectPosition}
        transition="all 0.6s ease"
        _groupHover={{ transform: 'scale(1.05)', filter: 'brightness(0.4)' }}
        filter="brightness(0.6)"
      />
      <VStack position="absolute" inset={0} justify="center" align="center" spacing={3} zIndex={1}>
        {/* These tiles are panels, not cards in a grid, the title carries the
            whole section, so it takes the sectionTitle ramp. Colour is the
            only override. The old hover animated letterSpacing 0.2em → 0.3em,
            which interpolated straight through the tracking values the label
            system is built on and left the type at a value no token defines
            for the length of the transition. The lift does the same job
            without touching the type. */}
        <Text
          textStyle="sectionTitle"
          color="white"
          textAlign="center"
          transition="transform 0.4s ease"
          _groupHover={{ transform: 'translateY(-4px)' }}
        >
          {tile.title}
        </Text>
        {/* 40px is the site's rule width (see PageHeader). It was animating
            30px → 50px, so the resting state matched nothing and the
            "correct" width existed only mid-transition. Fixed width, opacity
            does the hover. */}
        <Box w="40px" h="1px" bg="brand.accent" opacity={0.8} transition="opacity 0.4s ease" _groupHover={{ opacity: 1 }} />
        <Text
          textStyle="ctaLabel"
          color="whiteAlpha.800"
          opacity={0}
          transform="translateY(5px)"
          transition="all 0.4s ease"
          _groupHover={{ opacity: 1, transform: 'translateY(0)' }}
          // Touch never fires hover, so on a phone this tile showed a name
          // and a rule with nothing saying it was a link. Drawn at rest where
          // hover is unavailable.
          sx={{
            '@media (hover: none)': {
              opacity: 1,
              transform: 'translateY(0)',
            },
          }}
        >
          View Gallery
        </Text>
      </VStack>
    </Box>
  );
}

/**
 * A category with no gallery yet: a dark panel with gold line work, no photo.
 *
 * It was cream first, to read as "not yet" beside the dark photo panels. Under
 * the Proposals band that backfired: a pale band next to a dark one of the
 * same size looks taller, and Alex saw it as longer although the two measured
 * identical. Dark matches the photo panels' weight, and the line work plus
 * "Coming soon" still say it is not open (2026-10-04, his pick of two).
 *
 * The line work is the one thing specific to each: contour lines for aerial
 * (land seen from above, the way a map draws it), rings for proposals.
 */
function ComingSoonTile({ tile, h, minH }: { tile: Tile; h: ResponsiveValue<string>; minH?: ResponsiveValue<string> }) {
  return (
    <Box
      position="relative"
      h={h}
      minH={minH}
      overflow="hidden"
      bg="brand.surfaceDark"
      data-testid={`coming-soon-${tile.name}`}
    >
      <Box position="absolute" inset={0} color="brand.accent" opacity={0.45} aria-hidden>
        {tile.name === 'aerial' ? <Contours /> : <Rings />}
      </Box>
      {/* A soft clearing behind the title, so no line runs through the type. */}
      <Box
        position="absolute"
        inset={0}
        aria-hidden
        sx={{
          background:
            'radial-gradient(ellipse 30% 42% at 50% 50%, var(--chakra-colors-brand-surfaceDark) 45%, transparent 100%)',
        }}
      />
      <VStack position="absolute" inset={0} justify="center" align="center" spacing={3} zIndex={1}>
        <Text textStyle="sectionTitle" color="white" textAlign="center">
          {tile.title}
        </Text>
        <Box w="40px" h="1px" bg="brand.accent" opacity={0.8} />
        <Text textStyle="eyebrowOnDark">Coming soon</Text>
      </VStack>
    </Box>
  );
}

/**
 * Topographic contours, drawn the way a survey map draws them: level lines of
 * ONE smooth landscape (a few hills and a gentle swell), traced with marching
 * squares, so lines never cross the way stacked rings around separate hills
 * do. Worked out once per mount rather than shipped as path data. The frame is
 * wide and cropped to the tile (slice), so the band and the phone tile show
 * different stretches of the same land.
 */
const CONTOUR_W = 1600;
const CONTOUR_H = 500;

function contourPath(): string {
  const cell = 12.5;
  const cols = Math.round(CONTOUR_W / cell);
  const rows = Math.round(CONTOUR_H / cell);
  const hills = [
    { x: 330, y: 300, a: 1.0, sx: 270, sy: 190 },
    { x: 1080, y: 170, a: 1.25, sx: 340, sy: 220 },
    { x: 1510, y: 440, a: 0.8, sx: 220, sy: 170 },
    { x: 760, y: 480, a: 0.55, sx: 210, sy: 120 },
  ];
  const height = (x: number, y: number) =>
    hills.reduce((sum, h) => sum + h.a * Math.exp(-(((x - h.x) / h.sx) ** 2 + ((y - h.y) / h.sy) ** 2)), 0) +
    0.05 * Math.sin(x / 150) * Math.cos(y / 120);
  const grid: number[][] = [];
  for (let j = 0; j <= rows; j++) {
    grid.push([]);
    for (let i = 0; i <= cols; i++) grid[j].push(height(i * cell, j * cell));
  }
  const pt = (x: number, y: number) => `${x.toFixed(1)} ${y.toFixed(1)}`;
  let d = '';
  for (let level = 0.1; level < 1.3; level += 0.085) {
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        // Corners clockwise from top left, and which of them stand above the level.
        const tl = grid[j][i], tr = grid[j][i + 1], br = grid[j + 1][i + 1], bl = grid[j + 1][i];
        const index = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
        if (index === 0 || index === 15) continue;
        const x = i * cell;
        const y = j * cell;
        // Where the level crosses each edge, interpolated along it.
        const T = pt(x + (cell * (level - tl)) / (tr - tl), y);
        const R = pt(x + cell, y + (cell * (level - tr)) / (br - tr));
        const B = pt(x + (cell * (level - bl)) / (br - bl), y + cell);
        const L = pt(x, y + (cell * (level - tl)) / (bl - tl));
        const seg = (a: string, b: string) => `M${a}L${b}`;
        switch (index) {
          case 1: case 14: d += seg(L, B); break;
          case 2: case 13: d += seg(B, R); break;
          case 3: case 12: d += seg(L, R); break;
          case 4: case 11: d += seg(T, R); break;
          case 6: case 9: d += seg(T, B); break;
          case 7: case 8: d += seg(T, L); break;
          // Saddles: two separate crossings.
          case 5: case 10: d += seg(T, R) + seg(L, B); break;
        }
      }
    }
  }
  return d;
}

function Contours() {
  const d = useMemo(contourPath, []);
  return (
    <svg viewBox={`0 0 ${CONTOUR_W} ${CONTOUR_H}`} preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Rings: two loose sets of concentric circles, like a stone dropped in still water. */
function Rings() {
  const sets = [
    { cx: 1250, cy: 250, from: 40, step: 46, count: 7 },
    { cx: 380, cy: 330, from: 30, step: 40, count: 5 },
  ];
  return (
    <svg viewBox="0 0 1600 500" preserveAspectRatio="xMidYMid slice" width="100%" height="100%">
      {sets.flatMap((s) =>
        Array.from({ length: s.count }, (_, i) => (
          <circle
            key={`${s.cx}-${i}`}
            cx={s.cx}
            cy={s.cy}
            r={s.from + i * s.step}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )),
      )}
    </svg>
  );
}

export default GalleryCategories;
