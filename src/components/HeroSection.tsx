import React, { useRef, useState, useEffect } from 'react';
import { Box, Flex, VStack, Text, Link, Icon, Image, useBreakpointValue } from '@chakra-ui/react';
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
// LCD bounding box (dialed in visually): left 22%, top 45%, width 37%, height 34%.
const CAMERA_IMAGE_SRC = '/assets/images/eos_r6_mark_ii_body_2.webp';
const CAMERA_WIDTH = 480;
const CAMERA_HEIGHT = 384; // 480 / (800/640) preserves 5:4 aspect
const LCD_LEFT_PCT = 22;
const LCD_TOP_PCT = 45;
const LCD_WIDTH_PCT = 37;
const LCD_HEIGHT_PCT = 34;

// LCD center within the camera box, as percentages — used for transform-origin
// so the scale animation keeps the LCD anchored on screen.
const LCD_CENTER_X_PCT = LCD_LEFT_PCT + LCD_WIDTH_PCT / 2; // 40.5%
const LCD_CENTER_Y_PCT = LCD_TOP_PCT + LCD_HEIGHT_PCT / 2; // 62%

// LCD's horizontal offset from camera center, used to slide camera so LCD is
// centered in viewport at start (full-bleed) and camera is centered at end.
const LCD_OFFSET_FROM_CAMERA_CENTER_X = ((50 - LCD_CENTER_X_PCT) / 100) * CAMERA_WIDTH;

const CameraBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Box
    position="relative"
    width={`${CAMERA_WIDTH}px`}
    height={`${CAMERA_HEIGHT}px`}
  >
    <Image
      src={CAMERA_IMAGE_SRC}
      alt="Canon EOS R6 camera back"
      width="100%"
      height="100%"
      objectFit="contain"
      draggable={false}
      userSelect="none"
    />
    <Box
      position="absolute"
      left={`${LCD_LEFT_PCT}%`}
      top={`${LCD_TOP_PCT}%`}
      width={`${LCD_WIDTH_PCT}%`}
      height={`${LCD_HEIGHT_PCT}%`}
      overflow="hidden"
      borderRadius="2px"
    >
      {children}
    </Box>
  </Box>
);

const HeroSection: React.FC<HeroSectionProps> = ({ images }) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const isMobile = useBreakpointValue({ base: true, md: false });

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start start', 'end end'],
    layoutEffect: false,
  });

  // Responsive max scale — ensures LCD fills the viewport regardless of width.
  // LCD natural width ≈ 38% × CAMERA_WIDTH. Required scale = viewport_w / LCD_natural_width.
  const [maxScale, setMaxScale] = useState(7);
  useEffect(() => {
    const recompute = () => {
      const lcdNativeWidth = CAMERA_WIDTH * (LCD_WIDTH_PCT / 100);
      const requiredScale = window.innerWidth / lcdNativeWidth + 0.2;
      setMaxScale(Math.max(requiredScale, 6));
    };
    recompute();
    window.addEventListener('resize', recompute);
    return () => window.removeEventListener('resize', recompute);
  }, []);

  // ─── ANIMATION TIMING (all driven by scroll progress 0 → 1) ───
  //
  // Sequential, three-stage choreography:
  //   1. Camera zooms out (0  → 0.40)   — text invisible during this stage
  //   2. Text fades in    (0.40 → 0.55) — once camera is locked at scale 1.0
  //   3. Stable end-state (0.55 → 1.0)  — everything visible, nothing moving
  //
  // Tweak these ranges to make a stage start earlier/later. Tweak the slide
  // distances (-30 / 30) to make text drop down / rise up more dramatically.

  const CAMERA_ZOOM_END = 0.35;
  const TEXT_FADE_START = 0.55;
  const TEXT_FADE_END = 0.55;

  // Camera scales from "LCD fills viewport" down to natural (1.0×).
  const cameraScale = useTransform(scrollYProgress, [0, CAMERA_ZOOM_END], [maxScale, 1.0]);

  // Camera horizontal offset: at start push camera right so LCD center is at
  // viewport center (full-bleed). At end no offset, camera body centered.
  const cameraOffsetX = useTransform(
    scrollYProgress,
    [0, CAMERA_ZOOM_END],
    [LCD_OFFSET_FROM_CAMERA_CENTER_X, 0],
  );

  // Gold viewfinder corners — visible early, fade out as camera zooms back
  const cornerOpacity = useTransform(scrollYProgress, [0, 0.12], [1, 0]);

  // Header (name + title) ABOVE camera: slides down from above + fades in
  const headerOpacity = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [0, 1]);
  const headerY = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [-30, 0]);

  // Footer (stats + CTA) BELOW camera: slides up from below + fades in
  const footerOpacity = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [0, 1]);
  const footerY = useTransform(scrollYProgress, [TEXT_FADE_START, TEXT_FADE_END], [30, 0]);

  // MOBILE — static stacked layout
  if (isMobile) {
    return (
      <Box position="relative" width="100%">
        <Box height="60vh" position="relative" overflow="hidden">
          <ImageCarousel images={images} height="100%" hideDevIndicator />
          <Box position="absolute" top="20px" left="20px" w="28px" h="28px" borderTop="1px solid #c9a96e" borderLeft="1px solid #c9a96e" pointerEvents="none" />
          <Box position="absolute" top="20px" right="20px" w="28px" h="28px" borderTop="1px solid #c9a96e" borderRight="1px solid #c9a96e" pointerEvents="none" />
          <Box position="absolute" bottom="20px" left="20px" w="28px" h="28px" borderBottom="1px solid #c9a96e" borderLeft="1px solid #c9a96e" pointerEvents="none" />
          <Box position="absolute" bottom="20px" right="20px" w="28px" h="28px" borderBottom="1px solid #c9a96e" borderRight="1px solid #c9a96e" pointerEvents="none" />
        </Box>
        <Flex bg="white" align="center" justify="center" px={6} py={14}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
          >
            <VStack spacing={6} align="center" maxW="400px">
              <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.2em" color="#c9a96e">
                Veronika Gerzon
              </Text>
              <Box w="35px" h="1px" bg="#c9a96e" />
              <Text fontSize="xl" fontWeight="200" color="gray.700" fontStyle="italic" lineHeight="1.3" textAlign="center">
                Wedding & Portrait Photographer
              </Text>
              <VStack spacing={3} pt={4}>
                {STATS.map((stat) => (
                  <Flex key={stat.label} gap={3} align="center">
                    <Text fontSize="10px" fontWeight="500" textTransform="uppercase" letterSpacing="0.2em" color="#c9a96e">
                      {stat.label}
                    </Text>
                    <Text fontSize="sm" fontWeight="200" color="gray.700">
                      {stat.value}
                    </Text>
                  </Flex>
                ))}
              </VStack>
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
                mt={4}
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
          </motion.div>
        </Flex>
      </Box>
    );
  }

  // DESKTOP — scroll-driven camera reveal
  return (
    <Box ref={sectionRef} position="relative" width="100%" height="220vh" bg="white">
      <Box position="sticky" top={0} width="100%" height="100vh" overflow="hidden" bg="white">
        {/* Flex column: camera on top (scales), bio info below (fades in).
            pt clears the fixed navbar (~74px) with comfortable breathing room. */}
        <Flex
          position="absolute"
          inset={0}
          direction="column"
          align="center"
          justify="center"
          pt={{ md: '100px', lg: '110px' }}
          pb="40px"
          gap="24px"
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
                fontSize={{ md: '2xl', lg: '3xl' }}
                fontWeight="200"
                fontStyle="italic"
                color="gray.700"
                letterSpacing="wide"
                lineHeight="1.2"
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
            style={{ scale: cameraScale, x: cameraOffsetX }}
            transformOrigin={`${LCD_CENTER_X_PCT}% ${LCD_CENTER_Y_PCT}%`}
          >
            <CameraBody>
              <ImageCarousel images={images} height="100%" hideDevIndicator />
            </CameraBody>
          </MotionBox>

          {/* FOOTER below camera: stats + CTA */}
          <MotionBox style={{ opacity: footerOpacity, y: footerY }}>
            <VStack spacing={4} align="center">
              <Flex gap={{ md: 10, lg: 14 }} align="center">
              {STATS.map((stat, i) => (
                <React.Fragment key={stat.label}>
                  <VStack spacing={2} minW="100px">
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
      </Box>
    </Box>
  );
};

export default HeroSection;
