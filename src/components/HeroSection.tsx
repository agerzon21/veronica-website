import React, { useRef, useState, useEffect } from 'react';
import { Box, Flex, VStack, Text, Link, Icon, Image } from '@chakra-ui/react';
import { Link as RouterLink } from 'react-router-dom';
import { motion, useScroll, useTransform, MotionValue } from 'framer-motion';
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

// Gold L-corner bracket overlay used during the initial viewfinder phase
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

// Real Canon EOS R6 Mark II product photo used as the camera body.
// On desktop the camera is shown horizontally (landscape, 5:4 aspect, LCD on
// the left side of the body). On mobile it's rotated 90° COUNTER-clockwise
// (eyepiece ends up on the LEFT, Canon branding on the RIGHT) so mobile-shape
// carousel photos display naturally inside the now-vertical LCD.
const CAMERA_IMAGE_SRC = '/assets/images/eos_r6_mark_ii_body_2.webp';

// LCD bounding box for each orientation (as % of CameraBody container).
// Mobile bounds are the desktop bounds rotated 90° CCW. For CCW rotation:
//   new_left   = old_top
//   new_top    = 100 - old_left - old_width
//   new_width  = old_height
//   new_height = old_width
const LCD_BOUNDS = {
  desktop: { left: 22, top: 45, width: 37, height: 34 },
  mobile: { left: 46, top: 43, width: 27, height: 30 },
};

// Derived helpers — LCD center is used as the scale transform-origin so the
// LCD stays anchored on screen during zoom. Horizontal offset is the distance
// from camera center to LCD center, used to slide the camera so the LCD lands
// at viewport center at start (full-bleed) and the camera body is centered at
// the end.
const lcdCenterOf = (b: { left: number; top: number; width: number; height: number }) => ({
  x: b.left + b.width / 2,
  y: b.top + b.height / 2,
});

// CameraBody — responsive container that goes portrait on mobile / landscape
// on desktop. The Canon image is rotated 90° on mobile via CSS, while the LCD
// container (with the photo carousel) is a separate non-rotated sibling at the
// rotated LCD bounds — so portrait photos display naturally inside without
// being themselves rotated.
const CameraBody = React.forwardRef<HTMLDivElement, { children: React.ReactNode }>(
  ({ children }, ref) => (
    <Box
      ref={ref}
      position="relative"
      // Width is the SMALLER of:
      //   - 85vw (mobile) / 480px (desktop) — width-based bound, the natural sizing
      //   - height-derived (svh-based) — caps the camera so the header above and
      //     footer below always have room and aren't cropped on short viewports
      //     (e.g. iPhone Safari with chrome visible, phone in landscape)
      // Using svh (small-viewport-height) instead of dvh keeps the size stable
      // as the browser chrome shows/hides — otherwise the camera would resize
      // mid-scroll which causes the maxScale recompute and the "zoom in before
      // zoom out" glitch on iOS Safari.
      width={{
        base: 'min(85vw, calc(45svh * 4 / 5))',
        md: 'min(480px, calc(60svh * 5 / 4))',
      }}
      maxWidth={{ base: '420px', md: '500px' }}
      aspectRatio={{ base: '4 / 5', md: '5 / 4' }}
    >
      {/* Canon image. On mobile: rendered at 5:4 dimensions inside a 4:5
          container, then rotated 90° to fill the container after rotation.
          width 125% / height 80% gives a 5:4 box (since container is 4:5),
          which becomes 4:5 fitting the container after the 90° rotation. */}
      <Image
        src={CAMERA_IMAGE_SRC}
        alt="Canon EOS R6 camera back"
        // Native pixel dimensions of the source — helps iOS Safari pick a
        // higher-quality rasterization path instead of stretching a small
        // cached bitmap when the parent applies a large CSS scale transform.
        htmlWidth={800}
        htmlHeight={640}
        decoding="sync"
        fetchPriority="high"
        position="absolute"
        top="50%"
        left="50%"
        width={{ base: '125%', md: '100%' }}
        height={{ base: '80%', md: '100%' }}
        objectFit="contain"
        transform={{
          base: 'translate(-50%, -50%) rotate(-90deg)',
          md: 'translate(-50%, -50%)',
        }}
        draggable={false}
        userSelect="none"
        sx={{
          // Ask the browser for the highest-quality scaling algorithm
          // (default is browser-dependent and often coarse on iOS).
          imageRendering: 'high-quality',
        }}
      />
      {/* LCD container — positioned at the rotated-LCD bounds on mobile,
          original bounds on desktop. NOT rotated, so the photo carousel
          inside displays in its natural portrait/landscape orientation. */}
      <Box
        position="absolute"
        left={{ base: `${LCD_BOUNDS.mobile.left}%`, md: `${LCD_BOUNDS.desktop.left}%` }}
        top={{ base: `${LCD_BOUNDS.mobile.top}%`, md: `${LCD_BOUNDS.desktop.top}%` }}
        width={{ base: `${LCD_BOUNDS.mobile.width}%`, md: `${LCD_BOUNDS.desktop.width}%` }}
        height={{ base: `${LCD_BOUNDS.mobile.height}%`, md: `${LCD_BOUNDS.desktop.height}%` }}
        overflow="hidden"
        borderRadius="2px"
      >
        {children}
      </Box>
    </Box>
  ),
);
CameraBody.displayName = 'CameraBody';

const HeroSection: React.FC<HeroSectionProps> = ({ images }) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cameraBoxRef = useRef<HTMLDivElement>(null);
  // Tracks the last width used to compute maxScale. iOS Safari fires resize
  // events when its bottom chrome bar hides/shows as the user scrolls — but
  // only the height changes, not the width. Recomputing maxScale on those
  // height-only events causes the camera to briefly "zoom IN" at scroll
  // progress=0 (since the new maxScale lands at progress 0). Guarding on width
  // keeps maxScale stable through chrome retraction.
  const lastWidthRef = useRef<number>(0);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
    layoutEffect: false,
  });

  // Track whether we're on a mobile viewport. The camera image is rotated 90°
  // and the LCD bounds shift, so transform-origin + horizontal offset need to
  // use the orientation-specific LCD center. Initialized with the actual
  // viewport size on first render (not just `false`) so iOS Safari doesn't
  // briefly render with desktop transform values then re-rasterize on update.
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 768,
  );
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Resolve the active LCD bounds + derived center/offset for the current
  // orientation. These drive the scale's transform-origin and the camera's
  // horizontal slide-in offset.
  const lcdBounds = isMobile ? LCD_BOUNDS.mobile : LCD_BOUNDS.desktop;
  const lcdCenter = lcdCenterOf(lcdBounds);
  const lcdOffsetPct = 50 - lcdCenter.x; // 9.5 on desktop, 12 on mobile

  // Responsive max scale — ensures LCD fills the viewport regardless of width.
  // Measures the actual rendered camera box (which is responsive via Chakra
  // breakpoint props), then derives the scale needed for the LCD to fill the
  // viewport. Uses ResizeObserver so it adapts to viewport changes correctly
  // on both mobile (smaller camera) and desktop (fixed 480px camera).
  // Initial estimate of maxScale. Computed from the viewport before the
  // first paint so iOS Safari doesn't render with a too-small scale, then
  // re-rasterize and look blurry until the user scrolls. The useEffect below
  // refines this to the exact value once the camera box is measured.
  const [maxScale, setMaxScale] = useState(() => {
    if (typeof window === 'undefined') return 7;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const onMobile = w < 768;
    const bounds = onMobile ? LCD_BOUNDS.mobile : LCD_BOUNDS.desktop;
    // Estimate camera width from the Chakra responsive props
    const estCameraW = onMobile ? w * 0.85 : 480;
    const estCameraH = estCameraW * (onMobile ? 5 / 4 : 4 / 5);
    const lcdW = estCameraW * (bounds.width / 100);
    const lcdH = estCameraH * (bounds.height / 100);
    return Math.max(w / lcdW, h / lcdH) * 1.2;
  });
  useEffect(() => {
    const recompute = () => {
      const box = cameraBoxRef.current;
      if (!box) return;
      const cameraWidth = box.offsetWidth;
      const cameraHeight = box.offsetHeight;
      if (cameraWidth === 0 || cameraHeight === 0) return;

      // Skip if only viewport height changed (iOS Safari chrome hide/show).
      // Camera width is svh-based, so the box dimensions are also stable on
      // height-only changes — recomputing would shift maxScale at progress=0
      // and look like a "zoom in" right when the user starts scrolling.
      if (window.innerWidth === lastWidthRef.current) return;
      lastWidthRef.current = window.innerWidth;

      // LCD dimensions as % of camera, dependent on orientation. The scale
      // needs to cover BOTH viewport width AND height — otherwise on tall
      // mobile viewports (e.g. 375×844) the LCD fills width but leaves the
      // camera body visible top/bottom. Take the max of the two requirements.
      const isMobileViewport = window.innerWidth < 768;
      const bounds = isMobileViewport ? LCD_BOUNDS.mobile : LCD_BOUNDS.desktop;
      const lcdNativeWidth = cameraWidth * (bounds.width / 100);
      const lcdNativeHeight = cameraHeight * (bounds.height / 100);
      const scaleForWidth = window.innerWidth / lcdNativeWidth;
      const scaleForHeight = window.innerHeight / lcdNativeHeight;
      // 1.2× buffer (not a flat +0.3) — gives proportional margin across
      // viewport sizes so the LCD's photo content extends well past the
      // viewport edges and no camera body / LCD bezel from the camera image
      // peeks in at the edges during the full-bleed start state.
      const requiredScale = Math.max(scaleForWidth, scaleForHeight) * 1.2;
      setMaxScale(Math.max(requiredScale, 3));
    };
    // Initial measurement after layout settles
    const timer = setTimeout(recompute, 50);
    const observer = new ResizeObserver(recompute);
    const node = cameraBoxRef.current;
    if (node) observer.observe(node);
    window.addEventListener('resize', recompute);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, []);

  // ─── SCROLL CHOREOGRAPHY (in vh — 1% of viewport height) ───
  //
  // Four independent knobs. Each one is an absolute scroll distance you can
  // tune without affecting the others.
  //
  //   CAMERA_ZOOM_VH       — how much scroll drives the camera zoom-out
  //   TEXT_FADE_START_VH   — scroll position where text BEGINS fading in
  //                          (lower = earlier; can overlap the zoom by setting
  //                          this below CAMERA_ZOOM_VH for a coordinated feel)
  //   TEXT_FADE_DURATION_VH — how SLOWLY the text fades in (length of the fade)
  //   STABLE_SCROLL_VH     — how much "everything locked" scroll at the end
  //                          before the page moves past the hero to Instagram
  //
  // The section height auto-derives. Animations end at whichever finishes
  // last (camera zoom vs text fade), then stable kicks in.

  const CAMERA_ZOOM_VH = 60;
  const TEXT_FADE_START_VH = 50;
  const TEXT_FADE_DURATION_VH = 15;
  const STABLE_SCROLL_VH = 0;

  // Derived — don't usually need to touch.
  const ANIMATIONS_END_VH = Math.max(
    CAMERA_ZOOM_VH,
    TEXT_FADE_START_VH + TEXT_FADE_DURATION_VH,
  );
  const PINNED_SCROLL_VH = ANIMATIONS_END_VH + STABLE_SCROLL_VH;
  const SECTION_HEIGHT_VH = PINNED_SCROLL_VH + 100; // +100vh for the sticky inner
  const CAMERA_ZOOM_END = CAMERA_ZOOM_VH / PINNED_SCROLL_VH;
  const TEXT_FADE_START = TEXT_FADE_START_VH / PINNED_SCROLL_VH;
  const TEXT_FADE_END = (TEXT_FADE_START_VH + TEXT_FADE_DURATION_VH) / PINNED_SCROLL_VH;

  // Camera scales from "LCD fills viewport" down to natural (1.0×).
  const cameraScale = useTransform(scrollYProgress, [0, CAMERA_ZOOM_END], [maxScale, 1.0]);

  // Camera horizontal offset (as % of camera width): at start push camera right
  // so LCD center is at viewport center (full-bleed). At end no offset, camera
  // body centered. Percentage-based so it adapts to mobile vs desktop camera sizes.
  const cameraOffsetX = useTransform(
    scrollYProgress,
    [0, CAMERA_ZOOM_END],
    [`${lcdOffsetPct}%`, '0%'],
  );

  // Gold viewfinder corners — visible early, fade out as camera zooms back
  const cornerOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);

  // Header (name + title) ABOVE camera: slides down from above + fades in
  // gradually over the TEXT_FADE_DURATION_VH window after the camera zoom.
  const headerOpacity = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [0, 1]);
  const headerY = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [-30, 0]);

  // Footer (stats + CTA) BELOW camera: slides up from below + fades in
  const footerOpacity = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [0, 1]);
  const footerY = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [30, 0]);

  // "Scroll" hint at bottom of viewport — visible at start, fades out as soon
  // as the user begins scrolling (the camera zoom is just starting).
  const scrollHintOpacity = useTransform(scrollYProgress, [0, 0.05], [1, 0]);

  // Unified mobile + desktop — scroll-driven camera reveal
  return (
    <Box ref={sectionRef} position="relative" width="100%" height={`${SECTION_HEIGHT_VH}vh`} bg="white">
      {/* sticky inner uses 100dvh (dynamic viewport height) so it matches the
          VISIBLE viewport on mobile — 100vh refers to the LARGE viewport on
          iOS Safari (the size when chrome bars are hidden), which made the
          scroll indicator at the bottom land under the Safari toolbar. */}
      <Box position="sticky" top={0} width="100%" height="100dvh" overflow="hidden" bg="white">
        {/* Flex column: camera on top (scales), bio info below (fades in).
            pt clears the fixed navbar (~74px) with comfortable breathing room. */}
        <Flex
          position="absolute"
          inset={0}
          direction="column"
          align="center"
          justify="center"
          pt={{ base: '90px', md: '100px', lg: '110px' }}
          pb={{ base: '30px', md: '40px' }}
          gap={{ base: '16px', md: '24px' }}
          px={{ base: 4, md: 0 }}
          zIndex={2}
        >
          {/* HEADER above camera: name + divider + title */}
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

          {/* CAMERA in the middle (scales + slides).
              Note: deliberately NOT using willChange="transform" — that hint
              caused the browser to keep a low-res rasterized bitmap of the
              camera during rapid scale changes, which showed up as pixelation
              when scrolling out→in quickly. Without it, the browser re-renders
              at each scale and quality stays sharp. */}
          <MotionBox
            style={{
              scale: cameraScale,
              x: cameraOffsetX,
              // iOS Safari rasterization hints — without these the camera
              // renders at a low-res raster initially (page looks blurry on
              // real iPhones until the user scrolls and triggers re-paint).
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transformStyle: 'preserve-3d',
            }}
            transformOrigin={`${lcdCenter.x}% ${lcdCenter.y}%`}
          >
            <CameraBody ref={cameraBoxRef}>
              <ImageCarousel images={images} height="100%" hideDevIndicator />
            </CameraBody>
          </MotionBox>

          {/* FOOTER below camera: stats + CTA */}
          <MotionBox style={{ opacity: footerOpacity, y: footerY }}>
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
        </MotionBox>
        </Flex>

        {/* Viewfinder corners during the initial phase */}
        <ViewfinderCorner corner="tl" opacity={cornerOpacity} />
        <ViewfinderCorner corner="tr" opacity={cornerOpacity} />
        <ViewfinderCorner corner="bl" opacity={cornerOpacity} />
        <ViewfinderCorner corner="br" opacity={cornerOpacity} />

        {/* Scroll-down hint at the bottom of the viewport — small "SCROLL"
            label with a thin gold rail and a pill that travels down it.
            Fades out as soon as the user starts scrolling. */}
        <MotionBox
          position="absolute"
          // Sticky inner is sized in 100dvh now, so its bottom is at the
          // visible viewport bottom on mobile regardless of chrome state.
          // 24px clears it cleanly above any toolbar/home indicator.
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
              pl="0.4em" // optical centering for letterSpacing on the last char
            >
              Scroll
            </Text>
            {/* Mouse outline with a glowing scroll-wheel dot animating down */}
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
  );
};

export default HeroSection;
