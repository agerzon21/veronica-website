import React, { useRef, useState, useEffect } from 'react';
import { Box, Flex, VStack, Text, Link, Icon, Image } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { motion, useScroll, useTransform, useSpring, MotionValue } from 'framer-motion';
import { FaMapMarkerAlt, FaCamera, FaGlobe } from 'react-icons/fa';
import ImageCarousel from './ImageCarousel';

const MotionBox = motion(Box);

interface HeroSectionProps {
  images: Array<{
    url: string;
    position?: string;
    mobileUrl?: string;
    mobilePosition?: string;
  }>;
}

const STATS = [
  { label: 'Based in', value: 'Scranton, PA', icon: FaMapMarkerAlt },
  { label: 'Experience', value: '12+ Years', icon: FaCamera },
  { label: 'Available', value: 'Worldwide', icon: FaGlobe },
];

const ViewfinderCorner: React.FC<{
  corner: 'tl' | 'tr' | 'bl' | 'br';
  opacity: MotionValue<number>;
}> = ({ corner, opacity }) => {
  const positions: Record<typeof corner, any> = {
    tl: { top: '110px', left: '40px', borderTop: '1px solid #c9a96e', borderLeft: '1px solid #c9a96e' },
    tr: { top: '110px', right: '40px', borderTop: '1px solid #c9a96e', borderRight: '1px solid #c9a96e' },
    bl: { bottom: '40px', left: '40px', borderBottom: '1px solid #c9a96e', borderLeft: '1px solid #c9a96e' },
    br: { bottom: '40px', right: '40px', borderBottom: '1px solid #c9a96e', borderRight: '1px solid #c9a96e' },
  };
  return (
    <MotionBox
      position="absolute"
      width="48px"
      height="48px"
      pointerEvents="none"
      zIndex={6}
      style={{ opacity }}
      {...positions[corner]}
    />
  );
};

const CAMERA_IMAGE_SRC = '/assets/images/eos_r6_mark_ii_body_2.webp';

const LCD_BOUNDS = {
  desktop: { left: 22, top: 45, width: 37, height: 34 },
  mobile: { left: 46, top: 43, width: 27, height: 30 },
};

const lcdCenterOf = (b: { left: number; top: number; width: number; height: number }) => ({
  x: b.left + b.width / 2,
  y: b.top + b.height / 2,
});

// Final on-screen camera widths — the camera shrinks DOWN to this size at scroll
// end. Capped per orientation, lower-bounded so it stays recognizable.
const FINAL_WIDTH_LANDSCAPE_MAX = 540;
const FINAL_WIDTH_PORTRAIT_MAX = 320;
const FINAL_WIDTH_MIN = 200;

// If full layout (footer inside sticky) would force the camera below this
// height, drop into "extracted footer" mode: footer is hoisted to live just
// below the sticky viewport so the user can reveal it by continuing to scroll.
// Camera then only has to share space with the header above it.
const MIN_FULL_LAYOUT_CAMERA_HEIGHT = 180;

// Cap natural size so we don't allocate absurd GPU memory on 4K monitors.
const MAX_NATURAL_WIDTH = 6000;

// Vertical layout budget. The fixed Navbar overlays the top of the viewport, so
// HEADER_RESERVED has to include its height plus the hero header content plus a
// small visual buffer. FOOTER_RESERVED only includes the footer content + a
// buffer to the viewport bottom. SAFE_BUFFER sits between navbar/header and
// footer/viewport-bottom — what reads as "breathing room", not whitespace.
const NAVBAR_HEIGHT = 72;
const HEADER_CONTENT = 92;
const FOOTER_CONTENT = 130;
const SAFE_BUFFER = 16;
const CAMERA_GAP = 24;

const HEADER_RESERVED = NAVBAR_HEIGHT + SAFE_BUFFER + HEADER_CONTENT;
const FOOTER_RESERVED = FOOTER_CONTENT + SAFE_BUFFER;

// CameraBody rendered at a configurable CSS-natural width (passed in as px).
// The parent animates CSS transform scale DOWN from 1 → finalScale to shrink it.
// Critical for iOS Safari: it rasterizes elements at their CSS-natural size, and
// bitmap-DOWNSCALING is sharp while bitmap-UPSCALING (the old approach) is blurry.
const CameraBody = React.forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; isPortrait: boolean; width: number }
>(({ children, isPortrait, width }, ref) => {
  const bounds = isPortrait ? LCD_BOUNDS.mobile : LCD_BOUNDS.desktop;
  return (
    <Box
      ref={ref}
      position="relative"
      style={{
        width,
        aspectRatio: isPortrait ? '4 / 5' : '5 / 4',
      }}
    >
      <Image
        src={CAMERA_IMAGE_SRC}
        alt="Canon EOS R6 camera back"
        htmlWidth={800}
        htmlHeight={640}
        decoding="sync"
        fetchPriority="high"
        position="absolute"
        top="50%"
        left="50%"
        width={isPortrait ? '125%' : '100%'}
        height={isPortrait ? '80%' : '100%'}
        objectFit="contain"
        transform={isPortrait ? 'translate(-50%, -50%) rotate(-90deg)' : 'translate(-50%, -50%)'}
        draggable={false}
        userSelect="none"
        sx={{ imageRendering: 'high-quality' }}
      />
      <Box
        position="absolute"
        left={`${bounds.left}%`}
        top={`${bounds.top}%`}
        width={`${bounds.width}%`}
        height={`${bounds.height}%`}
        overflow="hidden"
        borderRadius="2px"
        // Inset shadow gives the LCD a recessed bezel look — the photo
        // reads as "behind glass" instead of pasted on. Strength tuned so
        // it's visible at the small final size but doesn't darken the
        // photo too much at scroll-start when LCD covers the viewport.
        boxShadow="inset 0 0 14px 3px rgba(0, 0, 0, 0.55), inset 0 0 0 1px rgba(0, 0, 0, 0.35)"
      >
        {children}
        {/* Glass reflection: a subtle diagonal sheen overlay so the LCD
            picks up an LCD-screen-like highlight instead of looking matte.
            Pointer-events:none so it never blocks the carousel interactions. */}
        <Box
          position="absolute"
          inset={0}
          pointerEvents="none"
          zIndex={2}
          background="linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 18%, transparent 40%, transparent 65%, rgba(0,0,0,0.08) 100%)"
        />
      </Box>
    </Box>
  );
});
CameraBody.displayName = 'CameraBody';

// Computes the camera's natural CSS size (huge — fills viewport + 1.2× buffer
// so the LCD covers it at scroll start, allowing sharp iOS bitmap-downscaling)
// and its final shrunken size (fits within the viewport with room reserved for
// the header/footer). Orientation follows viewport aspect ratio, NOT a width
// breakpoint — so iPhone landscape uses the landscape camera at a size that
// fits, not a fixed 480px that dwarfs the 393px-tall viewport.
const computeCameraSize = (
  vw: number,
  vh: number,
): {
  natural: number;
  final: number;
  finalHeight: number;
  isPortrait: boolean;
  verticalShiftPx: number;
  extractFooter: boolean;
} => {
  const isPortrait = vh > vw;
  const bounds = isPortrait ? LCD_BOUNDS.mobile : LCD_BOUNDS.desktop;
  const camAspect = isPortrait ? 4 / 5 : 5 / 4; // width/height

  // Natural: large enough that the LCD covers the viewport with 20% overshoot.
  const camForVw = (vw * 100) / bounds.width;
  const camForVh = (vh * camAspect * 100) / bounds.height;
  const natural = Math.min(
    Math.max(camForVw, camForVh) * 1.2,
    MAX_NATURAL_WIDTH,
  );

  const hPadding = isPortrait ? 20 : 48;
  const maxFinalW = isPortrait ? FINAL_WIDTH_PORTRAIT_MAX : FINAL_WIDTH_LANDSCAPE_MAX;
  const availableW = vw - 2 * hPadding;

  // Try the full layout first (header + camera + footer all inside sticky).
  // If the resulting camera would be cramped, switch to extracted-footer mode:
  // the camera only has to share the viewport with the header, and the footer
  // sits just below the sticky and is revealed by additional scroll.
  const fullAvailableH = vh - HEADER_RESERVED - FOOTER_RESERVED - 2 * CAMERA_GAP;
  const extractFooter = fullAvailableH < MIN_FULL_LAYOUT_CAMERA_HEIGHT;

  const availableH = extractFooter
    ? vh - HEADER_RESERVED - CAMERA_GAP - SAFE_BUFFER
    : fullAvailableH;
  const final = Math.max(
    FINAL_WIDTH_MIN,
    Math.min(availableW, availableH * camAspect, maxFinalW),
  );
  const finalHeight = final / camAspect;

  // The fixed Navbar overlays the top NAVBAR_HEIGHT of the viewport. If the
  // camera centered at vh/2 would push the header up behind the navbar, shift
  // the whole stack DOWN until the header clears it. On tall viewports
  // (desktop) this stays 0 and the stack sits at the visual center.
  const minCameraCenterY =
    NAVBAR_HEIGHT + SAFE_BUFFER + HEADER_CONTENT + CAMERA_GAP + finalHeight / 2;
  const verticalShiftPx = Math.max(0, minCameraCenterY - vh / 2);

  return { natural, final, finalHeight, isPortrait, verticalShiftPx, extractFooter };
};

const HeroSection: React.FC<HeroSectionProps> = ({ images }) => {
  const sectionRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress: rawProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
    layoutEffect: false,
  });

  // Spring-smooth the scroll progress that every camera animation reads.
  // Native iOS touch scroll fires events at a coarser rate than the render
  // frame — feeding the raw value to useTransform gives choppy animation
  // even though the scroll itself feels instant. This spring lerps between
  // sample points at 60fps and produces buttery animation values without
  // touching how scroll feels. Tuning: stiffness/damping picked to match
  // the responsiveness of Lenis @ lerp 0.18 (smooth but snappy on
  // direction reversal); restDelta keeps it from settling jittery near 0/1.
  const scrollYProgress = useSpring(rawProgress, {
    stiffness: 220,
    damping: 35,
    mass: 0.4,
    restDelta: 0.0005,
  });

  // Camera natural + final sizes. Updates on width change or large height change
  // (orientation flip). Small height changes (iOS chrome retract/extend) are
  // ignored to keep the camera stable mid-scroll.
  const [size, setSize] = useState(() => {
    if (typeof window === 'undefined') return computeCameraSize(1200, 800);
    return computeCameraSize(window.innerWidth, window.innerHeight);
  });
  useEffect(() => {
    let lastW = window.innerWidth;
    let lastH = window.innerHeight;
    const update = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (w === lastW && Math.abs(h - lastH) < 100) return;
      lastW = w;
      lastH = h;
      setSize(computeCameraSize(w, h));
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const bounds = size.isPortrait ? LCD_BOUNDS.mobile : LCD_BOUNDS.desktop;
  const lcdCenter = lcdCenterOf(bounds);
  const lcdOffsetX = 50 - lcdCenter.x;
  const lcdOffsetY = 50 - lcdCenter.y;
  const finalScale = size.final / size.natural;

  // CSS-pixel offsets that determine header/footer positions at scroll end.
  // anchorOffset places them CAMERA_GAP px outside the camera's final edges;
  // verticalShiftPx pushes both DOWN equally to clear the navbar overlay on
  // short viewports — header gap shrinks, footer gap grows by the same amount
  // so the two stay visually balanced around the (shifted) camera.
  const anchorOffset = size.finalHeight / 2 + CAMERA_GAP;
  const headerBottomOffset = anchorOffset - size.verticalShiftPx;
  const footerTopOffset = anchorOffset + size.verticalShiftPx;

  // Motion-y at scroll end translates the camera body down by verticalShiftPx
  // so its center matches the header/footer anchor. Expressed as a percentage
  // of the natural element's height (framer-motion's % translation is in
  // unscaled CSS pixels, applied after scale, so this stays geometrically
  // correct at any finalScale).
  const naturalHeight = size.natural / (size.isPortrait ? 4 / 5 : 5 / 4);
  const verticalShiftPct = (size.verticalShiftPx * 100) / naturalHeight;

  // ─── SCROLL CHOREOGRAPHY ───
  const CAMERA_ZOOM_VH = 60;
  const TEXT_FADE_START_VH = 50;
  const TEXT_FADE_DURATION_VH = 15;
  const STABLE_SCROLL_VH = 30;

  const ANIMATIONS_END_VH = Math.max(
    CAMERA_ZOOM_VH,
    TEXT_FADE_START_VH + TEXT_FADE_DURATION_VH,
  );
  const PINNED_SCROLL_VH = ANIMATIONS_END_VH + STABLE_SCROLL_VH;
  const SECTION_HEIGHT_VH = PINNED_SCROLL_VH + 100;
  const CAMERA_ZOOM_END = CAMERA_ZOOM_VH / PINNED_SCROLL_VH;
  const TEXT_FADE_START = TEXT_FADE_START_VH / PINNED_SCROLL_VH;
  const TEXT_FADE_END = (TEXT_FADE_START_VH + TEXT_FADE_DURATION_VH) / PINNED_SCROLL_VH;

  // Scale animates DOWN from 1 (full natural size, LCD covers viewport) to
  // finalScale (camera at small final size). Direction is critical for iOS.
  const cameraScale = useTransform(scrollYProgress, [0, CAMERA_ZOOM_END], [1, finalScale]);

  // Offset (% of own width / height): puts LCD at viewport center at start,
  // body-centered at end.
  const cameraOffsetX = useTransform(
    scrollYProgress,
    [0, CAMERA_ZOOM_END],
    [`${lcdOffsetX}%`, '0%'],
  );
  const cameraOffsetY = useTransform(
    scrollYProgress,
    [0, CAMERA_ZOOM_END],
    [`${lcdOffsetY}%`, `${verticalShiftPct}%`],
  );

  const cornerOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);
  const headerOpacity = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [0, 1]);
  const headerY = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [-30, 0]);
  const footerOpacity = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [0, 1]);
  const footerY = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [30, 0]);
  const scrollHintOpacity = useTransform(scrollYProgress, [0, 0.05], [1, 0]);

  // Progress indicator visibility: fades in once the user has started
  // scrolling (so it doesn't sit empty at scroll 0), holds through the
  // cinematic, then fades out as the animation completes so it doesn't
  // linger over the rest of the page.
  const progressOpacity = useTransform(
    scrollYProgress,
    [0, 0.04, 0.94, 1],
    [0, 1, 1, 0],
  );

  const footerContent = (
    <VStack spacing={4} align="center">
      <Flex gap={{ base: 6, md: 10, lg: 14 }} align="center">
        {STATS.map((stat, i) => (
          <React.Fragment key={stat.label}>
            <VStack spacing={2} minW={{ base: '80px', md: '100px' }}>
              <Icon as={stat.icon} boxSize={4} color="#c9a96e" />
              <Text
                fontSize="10px"
                fontWeight="500"
                textTransform="uppercase"
                letterSpacing="0.2em"
                color="#c9a96e"
              >
                {stat.label}
              </Text>
              <Text fontSize="sm" fontWeight="200" color="gray.700">
                {stat.value}
              </Text>
            </VStack>
            {i < STATS.length - 1 && <Box w="1px" h="50px" bg="#c9a96e" opacity={0.3} />}
          </React.Fragment>
        ))}
      </Flex>
      <Link
        as={RouterLink}
        to="/contact"
        fontSize="xs"
        fontWeight="400"
        color="gray.700"
        textTransform="uppercase"
        letterSpacing="0.2em"
        display="inline-block"
        px={8}
        py={3}
        mt={2}
        border="1px solid"
        borderColor="#c9a96e"
        transition="all 0.4s ease"
        _hover={{
          textDecoration: 'none',
          bg: '#c9a96e',
          color: 'white',
          transform: 'translateY(-2px)',
        }}
      >
        Book a Session
      </Link>
    </VStack>
  );

  return (
    <>
    <Box ref={sectionRef} position="relative" width="100%" height={`${SECTION_HEIGHT_VH}vh`} bg="white">
      <Box
        position="sticky"
        top={0}
        width="100%"
        height="100dvh"
        overflow="hidden"
        bg="white"
      >
        {/* HEADER — anchored CAMERA_GAP px above the camera's top edge. Symmetric
            with the footer below. Whitespace between header and camera no longer
            balloons on tall viewports because the position tracks the camera's
            final size, not the viewport top. */}
        <Box
          position="absolute"
          bottom={`calc(50% + ${headerBottomOffset}px)`}
          left="50%"
          transform="translateX(-50%)"
          width={{ base: '100%', md: 'auto' }}
          maxW="100vw"
          px={{ base: 4, md: 0 }}
          zIndex={3}
        >
          <MotionBox style={{ opacity: headerOpacity, y: headerY }}>
            <VStack spacing={3} align="center">
              <Text
                fontSize="xs"
                fontWeight="500"
                textTransform="uppercase"
                letterSpacing="0.3em"
                color="#c9a96e"
              >
                Veronika Gerzon
              </Text>
              <Box w="40px" h="1px" bg="#c9a96e" />
              <Text
                fontSize={{ base: 'lg', md: '2xl', lg: '3xl' }}
                fontWeight="200"
                fontStyle="italic"
                color="gray.700"
                letterSpacing="wide"
                lineHeight="1.2"
                textAlign="center"
              >
                Wedding & Portrait Photographer
              </Text>
            </VStack>
          </MotionBox>
        </Box>

        {/* CAMERA — absolutely positioned, centered. Natural CSS size is
            viewport-fill (huge); CSS transform scale shrinks it DOWN during
            scroll. Wrapped in a centering Box so motion's x/y can be relative
            to own size on top of the -50% centering transform. */}
        <Box
          position="absolute"
          top="50%"
          left="50%"
          transform="translate(-50%, -50%)"
          zIndex={2}
        >
          {/* transform-origin stays at element center (default). Shrinking
              toward LCD center would anchor the small camera at the LCD
              position within the huge natural box — i.e. bottom-left of the
              viewport. Scaling around the body center keeps the body centered
              at viewport center at scroll end. The motion x/y still puts the
              LCD at viewport center at scroll start. */}
          <MotionBox
            style={{
              scale: cameraScale,
              x: cameraOffsetX,
              y: cameraOffsetY,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transformStyle: 'preserve-3d',
              willChange: 'transform',
            }}
          >
            <CameraBody isPortrait={size.isPortrait} width={size.natural}>
              <ImageCarousel images={images} height="100%" hideDevIndicator />
            </CameraBody>
          </MotionBox>
        </Box>

        {/* FOOTER — when the camera + footer can fit inside the sticky
            viewport, anchor it just below the camera's bottom edge and let it
            fade in with the cinematic. When they can't (extracted mode, eg.
            landscape phone), the footer is rendered as a sibling AFTER the
            sticky section instead — see below. */}
        {!size.extractFooter && (
          <Box
            position="absolute"
            top={`calc(50% + ${footerTopOffset}px)`}
            left="50%"
            transform="translateX(-50%)"
            width={{ base: '100%', md: 'auto' }}
            maxW="100vw"
            px={{ base: 4, md: 0 }}
            zIndex={3}
          >
            <MotionBox style={{ opacity: footerOpacity, y: footerY }}>
              {footerContent}
            </MotionBox>
          </Box>
        )}

        {/* Viewfinder corners */}
        <ViewfinderCorner corner="tl" opacity={cornerOpacity} />
        <ViewfinderCorner corner="tr" opacity={cornerOpacity} />
        <ViewfinderCorner corner="bl" opacity={cornerOpacity} />
        <ViewfinderCorner corner="br" opacity={cornerOpacity} />

        {/* Scroll progress indicator — thin gold rail on the right edge of
            the viewport that fills as you scroll through the cinematic.
            Fades in once scrolling starts and fades out once the animation
            settles, so it never overlays the rest of the page. */}
        <MotionBox
          position="absolute"
          right={{ base: '14px', md: '22px' }}
          top="50%"
          marginTop="-60px"
          width="2px"
          height="120px"
          bg="rgba(201, 169, 110, 0.22)"
          borderRadius="2px"
          zIndex={5}
          pointerEvents="none"
          style={{ opacity: progressOpacity }}
        >
          <MotionBox
            width="100%"
            height="100%"
            bg="#c9a96e"
            borderRadius="2px"
            style={{
              scaleY: scrollYProgress,
              transformOrigin: '50% 0%',
              boxShadow: '0 0 8px rgba(201, 169, 110, 0.6)',
            }}
          />
        </MotionBox>

        {/* Scroll hint */}
        <MotionBox
          position="absolute"
          bottom={{ base: '24px', md: '32px' }}
          left="50%"
          transform="translateX(-50%)"
          zIndex={5}
          pointerEvents="none"
          style={{ opacity: scrollHintOpacity }}
        >
          <VStack spacing={3} align="center">
            <Text
              fontSize="10px"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.4em"
              color="white"
              textShadow="0 1px 6px rgba(0,0,0,0.55)"
              pl="0.4em"
            >
              Scroll
            </Text>
            <Box
              position="relative"
              width="22px"
              height="36px"
              border="1.5px solid rgba(201, 169, 110, 0.75)"
              borderRadius="14px"
              boxShadow="0 1px 6px rgba(0,0,0,0.3)"
            >
              <motion.div
                style={{
                  position: 'absolute',
                  top: 6,
                  left: '50%',
                  marginLeft: -1.5,
                  width: 3,
                  height: 7,
                  background: '#c9a96e',
                  borderRadius: 2,
                  boxShadow: '0 0 6px rgba(201,169,110,0.85)',
                }}
                animate={{
                  y: [0, 12, 12],
                  opacity: [1, 0, 0],
                }}
                transition={{
                  duration: 1.6,
                  ease: 'easeInOut',
                  repeat: Infinity,
                  repeatDelay: 0.1,
                }}
              />
            </Box>
          </VStack>
        </MotionBox>
      </Box>
    </Box>
    {/* Extracted footer: sibling of the sticky section, not inside it. Once
        the sticky scrolls past the viewport, this block appears underneath as
        a regular flow element — guaranteed to never overlap the next section
        (Instagram) because it's part of the normal document flow, not pinned
        or offset. */}
    {size.extractFooter && (
      <Box
        width="100%"
        bg="white"
        py={6}
        px={4}
        display="flex"
        justifyContent="center"
      >
        {footerContent}
      </Box>
    )}
    </>
  );
};

export default HeroSection;
