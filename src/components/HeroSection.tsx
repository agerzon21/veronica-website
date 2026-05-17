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

// Final on-screen camera widths — the size the camera shrinks DOWN to at end-of-scroll.
const FINAL_WIDTH_DESKTOP = 480;
const FINAL_WIDTH_MOBILE_RATIO = 0.85;
const FINAL_WIDTH_MOBILE_MAX = 420;

// Cap natural size so we don't allocate absurd GPU memory on 4K monitors.
const MAX_NATURAL_WIDTH = 6000;

// CameraBody rendered at a configurable CSS-natural width (passed in as px).
// The parent animates CSS transform scale DOWN from 1 → finalScale to shrink it.
// Critical for iOS Safari: it rasterizes elements at their CSS-natural size, and
// bitmap-DOWNSCALING is sharp while bitmap-UPSCALING (the old approach) is blurry.
const CameraBody = React.forwardRef<
  HTMLDivElement,
  { children: React.ReactNode; isMobile: boolean; width: number }
>(({ children, isMobile, width }, ref) => {
  const bounds = isMobile ? LCD_BOUNDS.mobile : LCD_BOUNDS.desktop;
  return (
    <Box
      ref={ref}
      position="relative"
      style={{
        width,
        aspectRatio: isMobile ? '4 / 5' : '5 / 4',
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
        width={isMobile ? '125%' : '100%'}
        height={isMobile ? '80%' : '100%'}
        objectFit="contain"
        transform={isMobile ? 'translate(-50%, -50%) rotate(-90deg)' : 'translate(-50%, -50%)'}
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
      >
        {children}
      </Box>
    </Box>
  );
});
CameraBody.displayName = 'CameraBody';

// Computes the camera's natural CSS size — large enough that the LCD covers the
// viewport with a 1.2× buffer, capped to MAX_NATURAL_WIDTH.
const computeCameraSize = (
  vw: number,
  vh: number,
): { natural: number; final: number; isMobile: boolean } => {
  const isMobile = vw < 768;
  const bounds = isMobile ? LCD_BOUNDS.mobile : LCD_BOUNDS.desktop;
  const camAspect = isMobile ? 4 / 5 : 5 / 4; // width/height
  const camForVw = (vw * 100) / bounds.width;
  const camForVh = (vh * camAspect * 100) / bounds.height;
  const natural = Math.min(
    Math.max(camForVw, camForVh) * 1.2,
    MAX_NATURAL_WIDTH,
  );
  const final = isMobile
    ? Math.min(vw * FINAL_WIDTH_MOBILE_RATIO, FINAL_WIDTH_MOBILE_MAX)
    : FINAL_WIDTH_DESKTOP;
  return { natural, final, isMobile };
};

const HeroSection: React.FC<HeroSectionProps> = ({ images }) => {
  const sectionRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
    layoutEffect: false,
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

  const bounds = size.isMobile ? LCD_BOUNDS.mobile : LCD_BOUNDS.desktop;
  const lcdCenter = lcdCenterOf(bounds);
  const lcdOffsetX = 50 - lcdCenter.x;
  const lcdOffsetY = 50 - lcdCenter.y;
  const finalScale = size.final / size.natural;

  // ─── SCROLL CHOREOGRAPHY ───
  const CAMERA_ZOOM_VH = 60;
  const TEXT_FADE_START_VH = 50;
  const TEXT_FADE_DURATION_VH = 15;
  const STABLE_SCROLL_VH = 0;

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
    [`${lcdOffsetY}%`, '0%'],
  );

  const cornerOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);
  const headerOpacity = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [0, 1]);
  const headerY = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [-30, 0]);
  const footerOpacity = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [0, 1]);
  const footerY = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [30, 0]);
  const scrollHintOpacity = useTransform(scrollYProgress, [0, 0.05], [1, 0]);

  return (
    <Box ref={sectionRef} position="relative" width="100%" height={`${SECTION_HEIGHT_VH}vh`} bg="white">
      <Box position="sticky" top={0} width="100%" height="100dvh" overflow="hidden" bg="white">
        {/* HEADER — absolutely positioned at top of viewport. No longer in flex
            flow with the camera, since the camera at natural size is huge and
            would push header/footer off-screen. */}
        <Box
          position="absolute"
          top={{ base: '90px', md: '100px', lg: '110px' }}
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
          <MotionBox
            style={{
              scale: cameraScale,
              x: cameraOffsetX,
              y: cameraOffsetY,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transformStyle: 'preserve-3d',
            }}
            transformOrigin={`${lcdCenter.x}% ${lcdCenter.y}%`}
          >
            <CameraBody isMobile={size.isMobile} width={size.natural}>
              <ImageCarousel images={images} height="100%" hideDevIndicator />
            </CameraBody>
          </MotionBox>
        </Box>

        {/* FOOTER — absolutely positioned at bottom of viewport */}
        <Box
          position="absolute"
          bottom={{ base: '30px', md: '40px' }}
          left="50%"
          transform="translateX(-50%)"
          width={{ base: '100%', md: 'auto' }}
          maxW="100vw"
          px={{ base: 4, md: 0 }}
          zIndex={3}
        >
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
        </Box>

        {/* Viewfinder corners */}
        <ViewfinderCorner corner="tl" opacity={cornerOpacity} />
        <ViewfinderCorner corner="tr" opacity={cornerOpacity} />
        <ViewfinderCorner corner="bl" opacity={cornerOpacity} />
        <ViewfinderCorner corner="br" opacity={cornerOpacity} />

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
  );
};

export default HeroSection;
