import { Box, Text, Link as ChakraLink, VStack, Flex, Image } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import Reveal, { useReveal } from './ui/Reveal';
import { gridSrcSet } from '../utils/gridSrcSet';

/**
 * `sourceWidth` is the file's own pixel width, copied from
 * src/data/photo-dims.json (which scripts/measure-photos.mjs writes). It is
 * the last srcset candidate, so a device that paints past the 1600 top rung
 * keeps the original instead of dropping to it. Importing photo-dims.json
 * here would be the drift-proof way to get it, but that file pulls
 * src/data/photos.ts and its 18KB of dims plus the photos CSV into
 * the /gallery chunk to read four numbers.
 *
 * If one of these four photographs is ever swapped, update the number with
 * it. Getting it wrong only changes which candidate the browser prefers, and
 * only for devices past 1600 device px; it cannot break the tile, because
 * `src` is this same file.
 */
const categories = [
  {
    name: 'portraits',
    title: 'Portraits',
    image: '/assets/photos/portraits/shadow-play-portrait.webp',
    sourceWidth: 3000,
    link: '/gallery/portraits',
    objectPosition: 'center 50%'
  },
  {
    name: 'weddings',
    title: 'Weddings',
    image: '/assets/photos/weddings/newlyweds-running-sea.webp',
    sourceWidth: 3500,
    link: '/gallery/weddings',
    objectPosition: 'center 25%'
  },
  {
    name: 'family',
    title: 'Family',
    image: '/assets/photos/family/elegant-family-studio-portrait-black.webp',
    sourceWidth: 3000,
    link: '/gallery/family',
    objectPosition: 'center 40%'
  },
  {
    name: 'maternity',
    title: 'Maternity',
    image: '/assets/photos/maternity/couples-beach-baby-bump-moment.webp',
    sourceWidth: 3000,
    link: '/gallery/maternity',
    objectPosition: 'center 35%'
  }
];

/**
 * What one tile actually asks its source for.
 *
 * Below 48em the four tiles stack full width, so the tile IS the window and
 * 100vw is the honest number (measured 380 CSS px painted in a 412 window).
 *
 * From 48em up they sit four-across, so each is about a quarter of the window
 * wide, and 25vw would be badly wrong: the tile is 65vh tall, and object-fit:
 * cover on a landscape source in a box that narrow scales it to match the
 * HEIGHT and crops the sides off. The source width consumed is therefore
 * 0.65 * vh * aspect, which for these four (1.32 to 1.50) is 0.86 to 0.98 of
 * vh. 100vh covers the widest of them with 2% to spare, and only understates
 * a tile when the window is more than 4x wider than it is tall.
 *
 * vh in `sizes` is measured, not assumed: Chrome picks the 3500px original on
 * a 768x1024 iPad at DPR 2 (needs 1999) and the 1600 rung on a 1440x900
 * laptop at DPR 1 (needs 1440). If a browser ever failed to parse it the whole
 * attribute falls back to 100vw, which is generous everywhere except that iPad
 * case, so the failure mode is a rung too small on a tablet, never a hole.
 */
const TILE_SIZES = '(min-width: 48em) 100vh, 100vw';

const GalleryCategories = () => {
  // One observer for all five reveals, on the same Box it has always watched.
  // The four cards have to arrive as one staggered run; giving each its own
  // observer would start them separately as they scrolled past and turn the
  // stagger into five unrelated fades.
  const { ref, shown } = useReveal({ amount: 0.1 });

  return (
    <Box ref={ref} layerStyle="sectionTight" px={{ base: 4, md: 8, lg: 12 }}>
      <Reveal shown={shown} from={{ opacity: 0, y: 25 }} duration={0.8}>
        <Flex
          direction={{ base: 'column', md: 'row' }}
          // Near-flush, deliberately. The reference the owner keeps citing
          // runs "minimal spacing between grid items, creating a dense,
          // compact presentation" — at 16/20px these read as four detached
          // cards; at 2px they read as one band of work.
          gap={{ base: 2, md: 3 }}
          justify="center"
        >
          {categories.map((category, index) => (
            <ChakraLink
              as={Link}
              to={category.link}
              key={category.name}
              _hover={{ textDecoration: 'none' }}
              flex="1"
            >
              <Reveal
                shown={shown}
                from={{ opacity: 0, y: 20 }}
                duration={0.6}
                delay={index * 0.1}
                style={{ height: '100%' }}
              >
                <Box
                  position="relative"
                  h={{ base: '250px', md: '65vh' }}
                  overflow="hidden"
                  cursor="pointer"
                  data-group
                >
                  {/* A real <img>, not a backgroundImage Box.
                      These four were the heaviest thing on /gallery and the
                      only images on the site no audit had ever flagged:
                      PageSpeed never reported them, because its image-delivery
                      audit skips CSS backgrounds, whose painted size it cannot
                      read. Measured at the Lighthouse mobile profile, 3000 to
                      3500px originals were painted into a 380x250 tile, 1,534
                      KiB for the four. An <img> can carry the srcset the grid
                      already builds.

                      image-set() would have kept the Box, and was rejected:
                      an unsupported or mistyped value there means NO
                      background at all, where a bad srcset candidate still
                      leaves `src`.

                      alt is empty on purpose. The photograph is behind the
                      label, the link is already named by the "Portraits" and
                      "View Gallery" text inside it, and a described background
                      would prepend a second sentence to every one of those
                      four link names. */}
                  <Image
                    src={category.image}
                    srcSet={gridSrcSet(category.image, category.sourceWidth)}
                    sizes={TILE_SIZES}
                    alt=""
                    loading="lazy"
                    position="absolute"
                    inset={0}
                    w="100%"
                    h="100%"
                    objectFit="cover"
                    objectPosition={category.objectPosition}
                    transition="all 0.6s ease"
                    _groupHover={{ transform: 'scale(1.05)', filter: 'brightness(0.4)' }}
                    filter="brightness(0.6)"
                  />
                  <VStack
                    position="absolute"
                    inset={0}
                    justify="center"
                    align="center"
                    spacing={3}
                    zIndex={1}
                  >
                    {/* These tiles are 65vh panels, not cards in a grid — the
                        title carries the whole section, so it takes the
                        sectionTitle ramp. Colour is the only override.
                        The old hover animated letterSpacing 0.2em → 0.3em,
                        which interpolated straight through the tracking values
                        the label system is built on and left the type at a
                        value no token defines for the length of the
                        transition. The lift does the same job without
                        touching the type. */}
                    <Text
                      textStyle="sectionTitle"
                      color="white"
                      textAlign="center"
                      transition="transform 0.4s ease"
                      _groupHover={{ transform: 'translateY(-4px)' }}
                    >
                      {category.title}
                    </Text>
                    {/* 40px is the site's rule width (see PageHeader). It was
                        animating 30px → 50px, so the resting state matched
                        nothing and the "correct" width existed only mid-
                        transition. Fixed width, opacity does the hover. */}
                    <Box
                      w="40px"
                      h="1px"
                      bg="brand.accent"
                      opacity={0.8}
                      transition="opacity 0.4s ease"
                      _groupHover={{ opacity: 1 }}
                    />
                    <Text
                      textStyle="ctaLabel"
                      color="whiteAlpha.800"
                      opacity={0}
                      transform="translateY(5px)"
                      transition="all 0.4s ease"
                      _groupHover={{ opacity: 1, transform: 'translateY(0)' }}
                      // Touch never fires hover, so on a phone this tile
                      // showed a name and a rule with nothing saying it was a
                      // link. Drawn at rest where hover is unavailable.
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
              </Reveal>
            </ChakraLink>
          ))}
        </Flex>
      </Reveal>
    </Box>
  );
};

export default GalleryCategories;
