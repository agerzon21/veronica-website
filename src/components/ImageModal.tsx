import {
  Box,
  Text,
  Flex,
  Icon,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  Spinner,
} from '@chakra-ui/react';
import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon, ExternalLinkIcon } from '@chakra-ui/icons';
import FaDownload from '../icons/fa/FaDownload';
import FaExternalLinkAlt from '../icons/fa/FaExternalLinkAlt';
import FaHeart from '../icons/fa/FaHeart';
import FaRegHeart from '../icons/fa/FaRegHeart';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import React from 'react';
import { m } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useCopyNotification } from './CopyNotification';
import CTAButton from './ui/CTAButton';
import { prefersReducedMotion } from '../utils/motion';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface ImageModalProps {
  isOpen: boolean;
  onClose: (currentIndex: number) => void;
  imageUrl: string;
  /**
   * A version of THIS photograph the browser has already downloaded, so the
   * lightbox opens on the picture instead of a spinner.
   *
   * The gallery grid serves a 400/800/1600 rung and the modal loads the
   * 2400px original, so once the grid stopped serving originals the first
   * click on any tile became a cold 300-900KB fetch behind an empty box. This
   * is the exact url the tile already has, whichever rung that turned out to
   * be, so it is guaranteed warm.
   */
  placeholderUrl?: string;
  imageAlt?: string;
  onNext?: () => void;
  onPrevious?: () => void;
  currentIndex?: number;
  totalImages?: number;
  photoData?: {
    id?: string;
    url: string;
    alt: string;
    title: string;
    description: string;
  };
  category?: string;
  originRect?: Rect | null;
  getImageRect?: (index: number) => Rect | null;
  // When set, the bottom CTA becomes a "Download" button (with the file
  // saved via the anchor's download attribute) instead of the default
  // "View Photo Page" link. Lets the client portal reuse this same modal.
  downloadUrl?: string;
  downloadFilename?: string;
  // On touch devices, "download" goes to the phone's Files app, which is the
  // wrong destination — clients want photos in Photos / Camera Roll. When
  // mobileSaveUrl is provided (and we detect a touch device), the bottom CTA
  // pre-fetches the photo and shares via Web Share API → "Save to Photos".
  mobileSaveUrl?: string;
  // File size in bytes. Used to short-circuit the Web Share flow on big
  // files where pre-fetching through our proxy would either time out the
  // Vercel function, exhaust mobile browser memory, or just waste a lot of
  // bandwidth. Above the threshold (LARGE_FILE_THRESHOLD), the mobile CTA
  // becomes "Open in Drive" — links to Drive's native viewer where the
  // user gets a proper download button regardless of file size.
  fileSize?: number;
  driveViewUrl?: string;
  // Hide the share icon in the top bar (client portal galleries don't share).
  hideShare?: boolean;
  // Optional: returns the display URL for the photo at any index. When
  // provided, the modal preloads a sliding window of adjacent photos so
  // arrow-key navigation feels instant (browser cache stays warm ahead
  // of the user). These URLs go direct to Drive (not our proxy), so
  // preloading costs nothing on our origin. Silently no-ops if omitted.
  getViewUrl?: (index: number) => string | null | undefined;
  // Favorites — when onToggleFavorite is provided, a heart button
  // appears in the modal top bar. Reflects isFavorite state and calls
  // the toggle on click. Only wired up for full-portal users; guests
  // on /portal/pass leave both props undefined.
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  // Close-animation flavor. Default (undefined / false) is the
  // "precise landing" behavior — image shrinks to its actual thumb
  // rect at full opacity so it feels like it goes back INTO its
  // spot. That looks best when thumbs match photo aspects (public
  // masonry gallery). Set to true for the client gallery where
  // thumbs are uniform squares and the aspect mismatch at the end
  // of a full-opacity landing looks awkward — fading to invisibility
  // during the shrink hides the mismatch entirely.
  fadeOnClose?: boolean;
}

// 40 MB. Reasoning: typical wedding/portrait JPEGs are 5–25 MB (well
// under), high-end JPEGs hit 20–50 MB (just above), TIFFs/RAWs/videos
// start at 50+ MB (clearly above). 40 MB keeps the Save-to-Photos flow
// for ~95% of real photos and gracefully degrades the rest to Drive's
// native viewer where size isn't a problem.
const LARGE_FILE_THRESHOLD = 40 * 1024 * 1024;

/**
 * How many photos to preload on either side of the current one.
 *
 * This used to be a flat 10, on the reasoning that preloads go straight to
 * Drive and so "cost us nothing". True of our bandwidth, badly false of the
 * client's memory. Ten either side is twenty-one images at full size, and at
 * 2000px each that is roughly 220MB of decoded bitmap. A desktop shrugs. An
 * iPhone holding a 943 photo grid does not: Safari stops decoding, and when it
 * does, it fires NEITHER load nor error. The spinner then span forever, every
 * arrow press queued twenty more full-size decodes, and the gallery was dead
 * until the tab was closed. Desktop never saw it.
 */
const PRELOAD_RADIUS_ROOMY = 10;
const PRELOAD_RADIUS_TIGHT = 2;

/**
 * Widths we will ask Drive for, in buckets.
 *
 * Buckets rather than the exact pixel figure so that two phones of similar
 * size still share a cache entry, and so a rotation does not refetch.
 */
const WIDTH_BUCKETS = [800, 1200, 1600, 2000] as const;

/** The ceiling for a device we are being careful with. */
const TIGHT_MAX_WIDTH = 1200;

/**
 * The LAYOUT viewport. Not the same thing as window.innerWidth.
 *
 * WHY THIS EXISTS, AND WHY EVERY SIZE IN THIS FILE COMES THROUGH IT
 * On desktop Chrome the two agree, so this looks like pointless ceremony.
 * On iOS Safari they do not: window.innerWidth and window.innerHeight report
 * the VISUAL viewport, the rectangle you are actually looking at, which
 * SHRINKS as you pinch in. document.documentElement.clientWidth/clientHeight
 * report the LAYOUT viewport, the box that position:fixed is laid out
 * against, which pinch zoom does not touch.
 *
 * Sizing a fixed overlay from the visual viewport produces one of the
 * strangest bugs this project has had. A client pinching a photo in their
 * gallery reported that the photo did not zoom at all while the little
 * "6 / 943" counter ballooned to fill the frame, and that the whole thing
 * lurched toward the top left. Both symptoms are the same arithmetic:
 *
 *   the photo box was 0.9 * window.innerWidth wide, and on iOS
 *   window.innerWidth == layoutWidth / zoom, so the box became
 *   0.9 * layoutWidth / zoom CSS px, which the browser then drew at
 *   zoom times its size. 0.9 * layoutWidth on screen. Exactly what it was
 *   before the pinch, every time, at every zoom level.
 *
 * The counter lives in an inset:0 overlay measured against the layout
 * viewport, so it did not shrink and the zoom magnified it for real. Photo
 * pinned, chrome enormous. And since top/left are the same fraction of the
 * same shrinking number, the box also walked toward the origin as it went.
 *
 * So: anything that positions or sizes the fixed overlay reads from here.
 */
function layoutViewport(): { width: number; height: number } {
  if (typeof document === 'undefined') {
    return { width: 1024, height: 768 };
  }
  const el = document.documentElement;
  return {
    width: el.clientWidth || window.innerWidth,
    height: el.clientHeight || window.innerHeight,
  };
}

/** The smallest bucket that still covers this screen at its pixel density. */
function deviceImageWidth(): number {
  if (typeof window === 'undefined') return 2000;
  // Capped at 2: beyond that the extra pixels are invisible on a photo while
  // the decode cost keeps climbing with their square.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // Longest side, so a rotation does not trigger a refetch at a bigger size.
  // Layout viewport, so a pinch does not either: on iOS the visual viewport
  // halves as you zoom in, and asking for a SMALLER image the moment someone
  // wants a closer look is precisely backwards. The numbers a real phone and
  // a real desktop produce are unchanged from before this note.
  const vp = layoutViewport();
  const longest = Math.max(vp.width, vp.height);
  let needed = Math.ceil(longest * dpr);
  // Without this, the rotation allowance alone pushes a 390 by 844 phone to
  // 1688 and therefore into the 2000 bucket, which is the exact request that
  // was breaking it. 1200 already exceeds what a phone can resolve.
  if (isTightMemory()) needed = Math.min(needed, TIGHT_MAX_WIDTH);
  return WIDTH_BUCKETS.find((w) => w >= needed) ?? 2000;
}

/** Is this a device we should be careful with? */
function isTightMemory(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return true;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return true;
  // Layout viewport for the same reason as deviceImageWidth above: a pinch
  // must not change our answer to "what kind of device is this".
  const vp = layoutViewport();
  return Math.min(vp.width, vp.height) < 768;
}

/**
 * Pinch to zoom, in numbers.
 *
 * MAX is 4 because the photo behind it is not infinite: a phone deliberately
 * fetches at 1200px (see deviceImageWidth) and past roughly 4x that is mush,
 * so letting someone keep going only buys disappointment. SETTLE is the slack
 * we forgive at the end of a gesture, so a pinch that lands at 1.008 snaps
 * back to fit rather than leaving the photo a hair off centre for good.
 */
const MAX_ZOOM = 4;
const DOUBLE_TAP_ZOOM = 2.5;
const ZOOM_SETTLE = 1.02;
/** How far a one finger drag must travel before it counts as a swipe. */
const SWIPE_PX = 50;
/** Longest gap between two taps that still reads as one double tap. */
const DOUBLE_TAP_MS = 320;

/**
 * Rewrite a Drive thumbnail url to a different width.
 *
 * The api builds these at a fixed sz=w2000 (api/_drive.ts). Rewriting here
 * rather than there keeps the decision with the only code that knows the
 * screen it is about to draw on. Anything that does not match is returned
 * untouched, so a non-Drive url still works.
 */
export function sizedViewUrl(url: string, width: number): string {
  return url.replace(/([?&]sz=)w\d+/i, `$1w${width}`);
}

// formatFileSize was used by the removed "Original · XX MB" menu item;
// keeping the definition would be dead code, so it's been removed.

// Split-button dropdown used on both desktop and mobile flows. Two
// equally-weighted options so users see both paths up front, instead of
// Primary option is platform-specific (anchor download on desktop,
// Web Share API call on mobile) so the caller passes either
// `primaryHref` or `onPrimary`. Secondary option is always Drive's
// viewer for the full-res original — same link in both contexts.
interface DownloadMenuProps {
  triggerLabel: string;
  primaryTitle: string;
  primaryDesc: string;
  primaryHref?: string;
  primaryDownload?: string | boolean;
  onPrimary?: () => void;
  // When true, the primary item is greyed out + non-clickable. Used on the
  // mobile flow while the photo blob is still being pre-fetched — the
  // share API needs the blob in hand at click time.
  primaryDisabled?: boolean;
  // Called when the dropdown opens. The mobile flow uses this to kick off
  // the pre-fetch lazily, instead of fetching every modal-opened photo.
  onMenuOpen?: () => void;
  // When provided, adds a second menu item "View original in Drive"
  // that opens the full-res original in Drive's viewer. Absent for
  // the public portfolio (no per-photo Drive URL there); present for
  // all client-portal galleries.
  driveViewUrl?: string;
  fileSize?: number;
}

const DownloadMenu = ({
  triggerLabel,
  primaryTitle,
  primaryDesc,
  primaryHref,
  primaryDownload,
  onPrimary,
  primaryDisabled,
  onMenuOpen,
  driveViewUrl,
}: DownloadMenuProps) => {
  // Chakra's MenuButton owns the popper reference ref and the aria-expanded
  // wiring, and CTAButton is not a forwardRef component — passing it as
  // `as={CTAButton}` drops the ref and the menu loses its anchor. So this
  // trigger stays a MenuButton, but every value below is now the CTAButton
  // `variant="outline" tone="dark" size="sm"` recipe verbatim (plus the one
  // thing CTAButton has no concept of, `_expanded`), so it renders identically
  // to the CTAButtons sitting beside it in the bottom bar — including the
  // 44px mobile touch target it was previously missing.
  const triggerStyles = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    px: { base: 4, md: 5 },
    py: { base: 3, md: 2 },
    minH: { base: '44px', md: 'auto' },
    fontSize: { base: 'xs', md: '2xs' },
    fontWeight: 400,
    textTransform: 'uppercase' as const,
    letterSpacing: { base: '0.15em', md: '0.18em' },
    lineHeight: 1,
    borderRadius: 0,
    border: '1px solid',
    borderColor: 'brand.accent',
    color: 'brand.accent',
    bg: 'transparent',
    cursor: 'pointer',
    transition: 'all 0.4s ease',
    whiteSpace: 'nowrap' as const,
    _hover: { bg: 'brand.accent', color: 'white', transform: 'translateY(-2px)' },
    _active: {
      bg: 'brand.accentStrong',
      borderColor: 'brand.accentStrong',
      color: 'white',
      transform: 'translateY(0)',
    },
    _expanded: { bg: 'brand.accent', color: 'white' },
    sx: { WebkitTapHighlightColor: 'transparent' },
  };
  const listStyles = {
    bg: 'rgba(15, 15, 15, 0.96)',
    border: '1px solid',
    borderColor: 'whiteAlpha.200',
    borderRadius: 0,
    minW: '260px',
    py: 1,
    zIndex: 1600,
    boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
  };
  const itemStyles = {
    bg: 'transparent',
    py: 3,
    px: 4,
    _hover: { bg: 'whiteAlpha.100' },
    _focus: { bg: 'whiteAlpha.100' },
  };

  return (
    <Menu placement="top-end" gutter={8} onOpen={onMenuOpen}>
      <MenuButton as={Box} {...triggerStyles}>
        {/* MenuButton wraps children in an inner span, so flex `gap` on
            the trigger doesn't propagate down to the icon/label/chevron.
            Wrap in our own Flex so the gap actually applies. */}
        <Flex as="span" align="center" gap={2}>
          <Icon as={FaDownload} boxSize={3.5} />
          <Box as="span">{triggerLabel}</Box>
          <ChevronDownIcon boxSize={3.5} />
        </Flex>
      </MenuButton>
      <MenuList {...listStyles}>
        <MenuItem
          {...(primaryHref
            ? {
                as: 'a',
                href: primaryHref,
                download: primaryDownload,
              }
            : { onClick: onPrimary })}
          isDisabled={primaryDisabled}
          closeOnSelect={!primaryDisabled}
          {...itemStyles}
        >
          <Box>
            <Text color="white" fontSize="sm" fontWeight="400" mb={0.5}>
              {primaryTitle}
            </Text>
            <Text color="whiteAlpha.600" fontSize="xs">
              {primaryDesc}
            </Text>
          </Box>
        </MenuItem>
        {/* Second option: full-res original via Drive's viewer. The
            per-photo optimize-vs-original decision that used to make
            every click feel weighty is now framed as "save now" vs
            "see original in Drive" — different-shaped choices instead
            of two-download-formats. Only renders when the caller
            passes a driveViewUrl (i.e. gallery contexts, not the
            public portfolio). */}
        {driveViewUrl && (
          <MenuItem
            as="a"
            href={driveViewUrl}
            target="_blank"
            rel="noopener noreferrer"
            {...itemStyles}
          >
            <Box>
              <Text color="white" fontSize="sm" fontWeight="400" mb={0.5}>
                View original in Drive
              </Text>
              <Text color="whiteAlpha.600" fontSize="xs">
                Print-quality — opens Google Drive
              </Text>
            </Box>
          </MenuItem>
        )}
      </MenuList>
    </Menu>
  );
};

/**
 * Best-effort measurement of the fixed nav header so scroll-centering
 * math can keep the current thumbnail visible in the space BELOW it.
 * Falls back to a conservative default when there's no <nav> or when
 * we're server-rendering.
 */
function measureHeaderHeight(): number {
  if (typeof document === 'undefined') return 0;
  const nav = document.querySelector('nav');
  if (!nav) return 80;
  return Math.round(nav.getBoundingClientRect().bottom);
}

const ImageModal = ({
  isOpen,
  onClose,
  imageUrl,
  placeholderUrl,
  imageAlt = 'Gallery image',
  onNext,
  onPrevious,
  currentIndex,
  totalImages,
  photoData,
  category,
  originRect,
  getImageRect,
  downloadUrl,
  downloadFilename,
  mobileSaveUrl,
  fileSize,
  driveViewUrl,
  hideShare,
  getViewUrl,
  isFavorite,
  onToggleFavorite,
  fadeOnClose,
}: ImageModalProps) => {
  // Touch-device detection. Captured once on mount via useEffect so SSR/
  // prerender stays consistent (no `window` access during render).
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice(
      window.matchMedia?.('(pointer: coarse)').matches ||
        /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
    );
  }, []);
  const isLargeFile =
    typeof fileSize === 'number' && fileSize > LARGE_FILE_THRESHOLD;
  const useMobileSaveFlow =
    isTouchDevice && Boolean(mobileSaveUrl) && !isLargeFile;
  const useMobileDriveFlow =
    isTouchDevice && isLargeFile && Boolean(driveViewUrl);

  // Pre-fetch the photo file lazily, only when the user opens the share
  // dropdown. Previously we fetched on every modal open — wasteful, since
  // most modal opens never trigger a share, and each fetch is ~1.5MB of
  // Vercel Origin Transfer we don't get back.
  //
  // Why pre-fetch at all (vs fetching inside the share click):
  //   iOS Safari's `navigator.share()` requires "transient activation" —
  //   the user gesture must still be valid when share() is called. After
  //   an `await fetch(...)`, the gesture is consumed and share silently
  //   fails. So we fetch ahead of time, and the share button just calls
  //   share() synchronously on the buffered blob.
  //
  // Why the dropdown is a good prefetch trigger:
  //   The dropdown takes a click to open. Reading the two options + tapping
  //   takes another ~400-700ms typically. That window is plenty of time for
  //   the fetch to complete on any reasonable connection. If the user is
  //   on a slow link or super-fast, the menu item shows "Preparing…" and
  //   stays disabled until the blob lands.
  //
  // The inFlightUrl ref guards against navigation races: if the user opens
  // the menu on photo A (starts fetch), then arrows to photo B before the
  // fetch lands, we don't want photo A's blob to clobber photo B's state.
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [isFetchingBlob, setIsFetchingBlob] = useState(false);
  const inFlightUrl = useRef<string | null>(null);

  useEffect(() => {
    // Reset blob state whenever the selected photo changes. Any in-flight
    // fetch is invalidated by clearing the ref.
    setPhotoBlob(null);
    setIsFetchingBlob(false);
    inFlightUrl.current = null;
  }, [mobileSaveUrl]);

  // Track whether the currently-displayed photo has finished loading, so
  // we can show a spinner overlay when arrow-key navigation lands on a
  // photo that isn't in the browser cache yet. We reset to true whenever
  // the imageUrl changes (new photo → assume not loaded), then flip to
  // false in the img's onLoad. Prevents the confused "did my click even
  // work?" state when Drive takes a couple seconds to serve a fresh one.
  const [currentImageLoading, setCurrentImageLoading] = useState(true);

  /**
   * The url actually drawn, sized to this screen.
   *
   * The api hands us a fixed 2000px url. On a phone that is several times more
   * pixels than the display can show, and the decode is what tipped Safari
   * over. Recomputed on resize so a rotation or a desktop window resize picks
   * a sensible bucket rather than keeping whatever the first paint chose.
   */
  const [displayWidth, setDisplayWidth] = useState(deviceImageWidth);
  useEffect(() => {
    const onResize = () => setDisplayWidth(deviceImageWidth());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  const displayUrl = useMemo(
    () => sizedViewUrl(imageUrl, displayWidth),
    [imageUrl, displayWidth],
  );

  useEffect(() => {
    setCurrentImageLoading(true);
  }, [displayUrl]);

  /**
   * Never spin forever.
   *
   * When Safari runs out of image memory it fires NEITHER load nor error, so
   * both handlers below are dead and the spinner is permanent. A client is
   * then looking at a black screen with no way to understand it. After this
   * long we stop claiming to be loading, which lets the failure state below
   * render something honest instead.
   */
  useEffect(() => {
    if (!currentImageLoading) return;
    const t = window.setTimeout(() => setCurrentImageLoading(false), 15000);
    return () => window.clearTimeout(t);
  }, [currentImageLoading, displayUrl]);

  // Preload a sliding window of neighbours around the current
  // index. Cheap for us (viewUrl → Drive direct, not our proxy) and huge
  // for perceived speed — arrow-key mashing hits pre-warmed browser cache
  // instead of triggering fresh Drive fetches per click.
  //
  // Each preload uses `new Image()`; the browser dedupes identical URLs
  // via its HTTP cache, so if a URL was already loaded (either by earlier
  // navigation or a previous preload), calling this again is a no-op.
  useEffect(() => {
    if (typeof currentIndex !== 'number' || !getViewUrl) return;
    const preloaders: HTMLImageElement[] = [];
    const radius = isTightMemory() ? PRELOAD_RADIUS_TIGHT : PRELOAD_RADIUS_ROOMY;
    const width = deviceImageWidth();
    for (let offset = -radius; offset <= radius; offset++) {
      if (offset === 0) continue; // current photo is the <img src> below
      const url = getViewUrl(currentIndex + offset);
      if (!url) continue;
      const img = new Image();
      // Same width the visible photo asks for, so a preload warms the cache
      // entry the modal will actually use rather than a second, larger one.
      img.src = sizedViewUrl(url, width);
      preloaders.push(img);
    }
    // No cleanup needed — the Image instances get GC'd naturally when
    // out of scope. Cancelling in-flight requests isn't worth the effort
    // (browser will just abandon them if we navigate away).
  }, [currentIndex, getViewUrl]);

  const triggerPrefetch = useCallback(() => {
    if (!useMobileSaveFlow || !mobileSaveUrl) return;
    if (photoBlob || isFetchingBlob) return;
    const targetUrl = mobileSaveUrl;
    inFlightUrl.current = targetUrl;
    setIsFetchingBlob(true);
    fetch(targetUrl)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((blob) => {
        if (inFlightUrl.current === targetUrl) setPhotoBlob(blob);
      })
      .catch((err) => {
        console.warn('[ImageModal] pre-fetch failed:', err);
        // photoBlob stays null → menu item stays disabled, user can retry
        // by closing and reopening the menu.
      })
      .finally(() => {
        if (inFlightUrl.current === targetUrl) {
          setIsFetchingBlob(false);
          inFlightUrl.current = null;
        }
      });
  }, [useMobileSaveFlow, mobileSaveUrl, photoBlob, isFetchingBlob]);

  const handleMobileSave = useCallback(() => {
    // Inside the click handler — must stay synchronous up to the point where
    // we hand off to navigator.share() to preserve the user gesture.
    if (!mobileSaveUrl) return;
    const filename = downloadFilename || 'photo.jpg';

    if (photoBlob) {
      const file = new File([photoBlob], filename, {
        type: photoBlob.type || 'image/jpeg',
      });
      if (navigator.canShare?.({ files: [file] })) {
        // The share sheet is presented synchronously; the promise resolves
        // when the user picks an option or dismisses. AbortError = dismiss,
        // which we treat as a no-op.
        navigator.share({ files: [file] }).catch((err) => {
          if ((err as Error).name === 'AbortError') return;
          console.warn('[ImageModal] share failed, falling back:', err);
        });
        return;
      }
      // Browser doesn't support file sharing — fall through to the
      // open-in-new-tab path so user can long-press to save manually.
    }

    // Either the pre-fetch failed (CORS or 5xx) or this browser can't share
    // files. Best fallback: open the image URL in a new tab. iOS Safari
    // shows the image; user long-press → "Save to Photos". This works
    // because we're still inside the user-gesture sync code path.
    const a = document.createElement('a');
    a.href = mobileSaveUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [mobileSaveUrl, downloadFilename, photoBlob]);
  // The swipe used to keep its two points in React state and write to them on
  // every touchmove. It lives in gestureRef now: see the touch gesture block
  // below for why a render per touchmove was the whole bug.
  const scrollYRef = useRef(0);
  const scrollLockedRef = useRef(false);
  // Ref to the actual displayed <img> element so we can measure its
  // ACTUAL rect at close time. The container is a fixed openPos
  // rectangle but the img inside is object-fit: contain — so its
  // displayed rect can be much smaller (e.g., a portrait photo in a
  // landscape container is letterboxed). Landing math needs the img
  // rect, not the container rect, to end exactly on the thumbnail.
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [isClosing, setIsClosing] = useState(false);
  const [showUI, setShowUI] = useState(false);
  const [backdropOpacity, setBackdropOpacity] = useState(1);

  const navigate = useNavigate();
  const { show: showCopied, Notification: CopyNotification } = useCopyNotification();
  const photoPageUrl =
    photoData && category && photoData.id ? `/photo/${category}/${photoData.id}` : null;
  const photoTitle = photoData?.title?.replace(' | Vero Photography', '') ?? '';

  const handleViewPhotoPage = useCallback(() => {
    // Use replace because GalleryGrid already pushed this exact URL when the
    // modal opened. Without replace, navigate() would push a duplicate entry
    // on top and require TWO back presses to escape the photo page.
    if (photoPageUrl) navigate(photoPageUrl, { replace: true });
  }, [navigate, photoPageUrl]);

  // The m.div lives at a FIXED base rect (centered in viewport)
  // and we animate CSS TRANSFORMS on top of it — scaleX/scaleY/x/y —
  // instead of animating top/left/width/height directly. Transforms
  // are composited on the GPU and don't trigger layout on each frame;
  // animating the layout properties on a page with hundreds of grid
  // thumbnails behind us caused visible frame drops on close.
  //
  // The fractions are of the LAYOUT viewport, never window.innerWidth. See
  // layoutViewport() at the top of this file for the full story; the short
  // version is that this object is recomputed on every render, a touchmove
  // used to cause a render, and on iOS window.innerWidth shrinks while you
  // pinch. So a pinch was resizing and re-seating this box under the user's
  // fingers, which is the "it pushes the photo into the top left corner"
  // report, and the reason the photo never appeared to zoom while the
  // counter over it grew huge.
  const vp = layoutViewport();
  const openPos = {
    top: vp.height * 0.075,
    left: vp.width * 0.05,
    width: vp.width * 0.9,
    height: vp.height * 0.85,
  };

  // Convert a viewport-relative Rect to the transform values needed to
  // make the (openPos-sized, openPos-positioned) m.div visually
  // land on that rect. Because transform-origin is set to top-left,
  // scale shrinks the container from the top-left corner and x/y then
  // slide it into place.
  //
  // We use UNIFORM scale (single factor) instead of non-uniform
  // scaleX/scaleY so the image inside doesn't distort while the aspect
  // ratio of the container is changing. That means the shrunk image
  // sits inside the target rect (letterboxed on one axis if the
  // aspects differ) rather than filling it — but no distortion is
  // vastly better than an exact-fit-but-warped animation. With
  // aspect-matched thumbnails (masonry layout) the image lands
  // exactly on the thumb; with mismatched aspects there's a tiny
  // "click" as the modal unmounts and the actual thumb becomes
  // visible, which reads as natural for a "goes back into its spot"
  // effect.
  const rectToTransform = (rect: Rect) => {
    const scaleX = rect.width / openPos.width;
    const scaleY = rect.height / openPos.height;
    const scale = Math.min(scaleX, scaleY);
    const visualW = openPos.width * scale;
    const visualH = openPos.height * scale;
    return {
      scale,
      x: rect.left - openPos.left + (rect.width - visualW) / 2,
      y: rect.top - openPos.top + (rect.height - visualH) / 2,
      opacity: 1,
      borderRadius: 0,
    };
  };

  const openTransform = {
    scale: 1,
    x: 0,
    y: 0,
    opacity: 1,
    borderRadius: 0,
  };

  // Animation target — starts at the open state, changes to close target
  const [animTarget, setAnimTarget] = useState(openTransform);
  const [animTransition, setAnimTransition] = useState({
    duration: 0.55,
    ease: [0.16, 1, 0.3, 1] as number[],
  });

  // Initial state — computed once on mount from the thumbnail rect
  // the user clicked, so the open animation flies FROM the thumb TO
  // fullscreen. Lazy useState so the window-dims computation happens
  // once and the value is stable across renders.
  const [initialPos] = useState(() => {
    if (!originRect) {
      return { ...openTransform, opacity: 0 };
    }
    return rectToTransform(originRect);
  });

  // Update the scroll position the page will be restored to on modal
  // close. Because the scroll lock uses body: fixed; top: -scrollY, we
  // adjust body.top in lockstep — that way the page VISUALLY tracks
  // arrow-key nav underneath the backdrop, so by the time the user
  // closes, the current thumbnail is already centered on screen and
  // the close animation has a real place to fly back to. Without this,
  // close had to do a jarring double-scroll (restore to open position,
  // then jump to current-thumb position), which flashed the underlying
  // page during the backdrop fade.
  const scrollLockTo = useCallback((y: number) => {
    if (!scrollLockedRef.current) return;
    scrollYRef.current = y;
    document.body.style.top = `-${y}px`;
  }, []);

  const handleClose = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    setShowUI(false);

    // Thumbnail is already centered on-screen (the arrow-nav effect
    // keeps it there while the modal is open) — so we just capture
    // its rect and animate. No scroll juggling, no double-jump.
    // The scroll-lock cleanup runs when the modal unmounts and lands
    // the page cleanly on the last position we tracked.
    // Drop any zoom BEFORE measuring. The landing math below wants the rect
    // the photo occupies at fit; a zoomed rect would send it flying off to
    // one side on the way back to its thumbnail. Written straight to the
    // element, so the getBoundingClientRect on the next line already sees it.
    resetZoom(false);

    const targetRect = getImageRect?.(currentIndex ?? 0);
    const imgRect = imgRef.current?.getBoundingClientRect();

    setBackdropOpacity(0);
    // Slightly longer than the open animation so the close feels
    // "settled" rather than snappy; ease-out curve mirrors the open.
    setAnimTransition({ duration: 0.55, ease: [0.16, 1, 0.3, 1] });

    if (targetRect && imgRect && imgRect.width > 0 && imgRect.height > 0) {
      // Precise landing: the img (not the container) ends visually
      // ON the thumbnail rect. Uniform scale so no distortion; the
      // translate is derived so the img's center lands on the
      // thumb's center.
      //
      // Opacity behavior is controlled by the fadeOnClose prop:
      //   default (public masonry gallery) → stays at 1, image
      //     lands full-opacity on the matching thumb, seamless
      //     reveal when modal unmounts.
      //   fadeOnClose=true (client square-grid gallery) → fades to
      //     0 during the shrink, hiding the fact that the uniform
      //     square thumb doesn't match the photo's real aspect
      //     ratio at landing. That mismatch was the "format
      //     mismatch becomes evident" issue on client galleries.
      const scale = Math.min(
        targetRect.width / imgRect.width,
        targetRect.height / imgRect.height,
      );
      const containerX = openPos.left;
      const containerY = openPos.top;
      const imgCX = imgRect.left + imgRect.width / 2;
      const imgCY = imgRect.top + imgRect.height / 2;
      const targetCX = targetRect.left + targetRect.width / 2;
      const targetCY = targetRect.top + targetRect.height / 2;
      // With transform-origin: top-left, a point at container-relative
      // offset (dx, dy) ends up at (containerX + tx + dx*scale, ...)
      // after scale+translate. Solve for tx/ty so the img center
      // lands on the target center.
      const tx = targetCX - containerX - (imgCX - containerX) * scale;
      const ty = targetCY - containerY - (imgCY - containerY) * scale;
      setAnimTarget({
        scale,
        x: tx,
        y: ty,
        opacity: fadeOnClose ? 0 : 1,
        borderRadius: 0,
      });
    } else if (targetRect) {
      // Fallback (image not yet measurable) — container-based scale.
      // Slightly less precise landing but no worse than what we had.
      setAnimTarget(rectToTransform(targetRect));
    } else {
      setAnimTarget((prev) => ({ ...prev, opacity: 0 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClosing, getImageRect, currentIndex, fadeOnClose]);

  const handleAnimComplete = useCallback(() => {
    if (isClosing) {
      onClose(currentIndex ?? 0);
    } else if (!showUI) {
      setShowUI(true);
    }
  }, [isClosing, onClose, currentIndex, showUI]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && onPrevious) onPrevious();
      if (e.key === 'ArrowRight' && onNext) onNext();
      if (e.key === 'Escape') handleClose();
    },
    [onNext, onPrevious, handleClose]
  );

  // Scroll lock — only depends on isOpen so it won't re-run mid-animation
  useEffect(() => {
    if (isOpen) {
      scrollYRef.current = window.scrollY;
      scrollLockedRef.current = true;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollYRef.current}px`;
      document.body.style.width = '100%';
      return () => {
        if (scrollLockedRef.current) {
          document.body.style.overflow = '';
          document.body.style.position = '';
          document.body.style.top = '';
          document.body.style.width = '';
          window.scrollTo(0, scrollYRef.current);
          scrollLockedRef.current = false;
        }
      };
    }
  }, [isOpen]);

  // Keyboard listener — separate so handler changes don't re-lock scroll
  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  // Center the current thumbnail in the viewport whenever the user
  // arrows to a new photo. Runs UNDER the still-opaque backdrop so
  // the scroll shift is invisible — the only reason we do it is to
  // set the page up for a smooth close animation later. Skip the
  // first render (the user just clicked a thumb they were already
  // looking at, so it's already in view — scrolling now would create
  // a visible jump behind the fading-in backdrop).
  const skipFirstScrollRef = useRef(true);
  useEffect(() => {
    if (!isOpen || isClosing) return;
    if (skipFirstScrollRef.current) {
      skipFirstScrollRef.current = false;
      return;
    }
    const rect = getImageRect?.(currentIndex ?? 0);
    if (!rect) return;
    // Center the thumb in the VIEWABLE area (below the fixed nav
    // header), not the raw viewport. Without this the close animation
    // could land the image partially under the sticky header, which
    // reads as an ugly snap when the modal unmounts and the thumb
    // clips against the header at its final resting spot.
    const headerHeight = measureHeaderHeight();
    const viewableTop = headerHeight;
    const viewableHeight = Math.max(1, window.innerHeight - headerHeight);
    const target = Math.max(
      0,
      scrollYRef.current +
        rect.top -
        (viewableTop + viewableHeight / 2) +
        rect.height / 2,
    );
    scrollLockTo(target);
  }, [currentIndex, isOpen, isClosing, getImageRect, scrollLockTo]);

  // Resize listener — recompute the image's fullscreen rect when the viewport
  // changes. Without this the image stays pinned at the size/position it had
  // when the modal opened, while the rest of the UI (top bar, bottom CTA,
  // arrows) follows the new viewport, looking visibly broken. Uses an instant
  // transition because the user is actively dragging the window edge and any
  // animation lag reads as jank.
  //
  // Guarded on the layout viewport actually having changed. iOS fires resize
  // for a pinch as well as for a rotation, and reacting to a pinch here would
  // cancel an in flight open animation and throw away the zoom the user is in
  // the middle of setting, several times a second.
  const lastLayoutRef = useRef(layoutViewport());
  useEffect(() => {
    if (!isOpen || isClosing) return;
    lastLayoutRef.current = layoutViewport();
    const handleResize = () => {
      const next = layoutViewport();
      const prev = lastLayoutRef.current;
      if (next.width === prev.width && next.height === prev.height) return;
      lastLayoutRef.current = next;
      // Base position (openPos) is recomputed via re-render on resize;
      // just snap the transform back to identity so the image sits
      // dead-center in the new viewport with no lag. The zoom goes with it:
      // its pan bounds were computed against the old frame.
      resetZoom(false);
      setAnimTransition({ duration: 0, ease: [0, 0, 1, 1] });
      setAnimTarget(openTransform);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isClosing]);

  const handleShare = () => {
    if (photoData && category) {
      const shareUrl = `/photo/${category}/${photoData.id}`;
      const fullUrl = `${window.location.origin}${shareUrl}`;
      if (navigator.share) {
        navigator.share({
          title: 'Vero Photography',
          text: 'Check out this beautiful photo from Vero Photography',
          url: fullUrl,
        });
      } else {
        navigator.clipboard.writeText(fullUrl).then(() => showCopied());
      }
    }
  };

  /**
   * ── Touch gestures ──────────────────────────────────────────────────────
   *
   * WHAT WAS HERE BEFORE, AND WHY IT HAD TO GO
   * Three handlers that read e.touches[0], stored it in REACT STATE on every
   * touchmove, and on touchend turned the horizontal difference into a photo
   * change. Two separate faults, and a client hit both at once trying to
   * pinch a photo on an iPhone:
   *
   *   1. It could not see a second finger. A pinch is two touches; reading
   *      touches[0] reads one of them, and neither Chrome nor Safari promises
   *      a stable TouchList order between events, so the "one" it read kept
   *      swapping sides mid gesture. A pinch therefore ended as a swipe, in
   *      whichever direction the list happened to be ordered at the end.
   *   2. setState per touchmove meant a re-render per touchmove, and the
   *      fixed image box was recomputed from window.innerWidth on each of
   *      them. On iOS that number is the visual viewport and shrinks as you
   *      pinch. See layoutViewport() at the top of this file.
   *
   * WHAT IT DOES NOW
   * One gesture state machine in a ref, so nothing here re-renders anything.
   * The zoom transform is written straight onto the <img> via imgRef, which
   * is also why it cannot re-enter the bug above: no React state changes
   * during a gesture, so nothing recomputes any layout.
   *
   *   two fingers  -> pinch, anchored on the midpoint between them
   *   one finger while zoomed -> pan, clamped so the photo cannot be dragged
   *                              away from the frame
   *   one finger at fit -> the old swipe to change photo, unchanged
   *   double tap on the photo -> toggle between fit and DOUBLE_TAP_ZOOM
   *
   * Pinch scale is computed from the STARTING finger distance rather than
   * accumulated per event on purpose. A duplicate touchmove, which is exactly
   * what you get when the two fingers are over different elements and both
   * bubble here, then recomputes the same absolute number and changes
   * nothing, instead of applying the same delta twice.
   */
  const zoomRef = useRef({ scale: 1, x: 0, y: 0 });
  const gestureRef = useRef({
    mode: 'none' as 'none' | 'swipe' | 'pan' | 'pinch',
    /** True once any part of this gesture had two fingers down. */
    multi: false,
    /** True when the gesture began on the photo or the backdrop, rather than
     *  on the top bar, the arrows or the Save button. */
    onPhoto: false,
    /** True when it began on the photo itself. Gates the double tap. */
    onImage: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    startDist: 0,
    startScale: 1,
  });
  const lastTapRef = useRef({ at: 0, x: 0, y: 0 });
  const backdropRef = useRef<HTMLDivElement | null>(null);

  /** Write the current zoom onto the image. No state, no render. */
  const applyZoom = useCallback((animate: boolean) => {
    const img = imgRef.current;
    if (!img) return;
    const { scale, x, y } = zoomRef.current;
    img.style.transition =
      animate && !prefersReducedMotion() ? 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)' : '';
    img.style.transform =
      scale === 1 && x === 0 && y === 0 ? '' : `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
    img.style.willChange = scale === 1 ? '' : 'transform';
  }, []);

  /**
   * Keep the zoom sane: never below fit, never past MAX_ZOOM, and never
   * panned so far that the frame shows empty space beside the photo. The
   * bound is against the CONTAINER, so an axis where the whole photo already
   * fits does not pan at all, which is what stops a portrait photo sliding
   * sideways out of view.
   */
  const clampZoom = useCallback(() => {
    const z = zoomRef.current;
    z.scale = Math.min(MAX_ZOOM, Math.max(1, z.scale));
    const img = imgRef.current;
    if (!img) return;
    const maxX = Math.max(0, (img.offsetWidth * z.scale - openPos.width) / 2);
    const maxY = Math.max(0, (img.offsetHeight * z.scale - openPos.height) / 2);
    z.x = Math.min(maxX, Math.max(-maxX, z.x));
    z.y = Math.min(maxY, Math.max(-maxY, z.y));
  }, [openPos.width, openPos.height]);

  const resetZoom = useCallback(
    (animate: boolean) => {
      zoomRef.current = { scale: 1, x: 0, y: 0 };
      applyZoom(animate);
    },
    [applyZoom],
  );

  /** Scale about a screen point, leaving whatever is under it where it is. */
  const zoomAbout = useCallback(
    (nextScale: number, px: number, py: number) => {
      const z = zoomRef.current;
      const cx = openPos.left + openPos.width / 2;
      const cy = openPos.top + openPos.height / 2;
      // The image is flex-centred, so at rest its centre is the container's.
      // A point sitting at (px, py) is at image-local ((px - cx - x) / scale);
      // solving for the translate that keeps it there after the scale change
      // gives this. Same identity both directions, so pinching back out
      // unwinds exactly.
      const ratio = nextScale / z.scale;
      z.x = px - cx - (px - cx - z.x) * ratio;
      z.y = py - cy - (py - cy - z.y) * ratio;
      z.scale = nextScale;
    },
    [openPos.left, openPos.top, openPos.width, openPos.height],
  );

  const fingerGap = (a: React.Touch, b: React.Touch) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const fingerMid = (a: React.Touch, b: React.Touch) => ({
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  });

  const beginPinch = (e: React.TouchEvent) => {
    const g = gestureRef.current;
    g.mode = 'pinch';
    g.multi = true;
    g.startDist = fingerGap(e.touches[0], e.touches[1]) || 1;
    g.startScale = zoomRef.current.scale;
    const m = fingerMid(e.touches[0], e.touches[1]);
    g.lastX = m.x;
    g.lastY = m.y;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isClosing) return;
    const img = imgRef.current;
    // Any settle animation still running would fight the finger.
    if (img) img.style.transition = '';
    const g = gestureRef.current;

    if (e.touches.length >= 2) {
      beginPinch(e);
      return;
    }
    // A finger going down while a pinch is still unwinding is the tail of
    // that pinch, not the start of a swipe.
    if (g.multi) return;

    const t = e.touches[0];
    if (!t) return;
    const target = e.target as Node;
    g.onImage = !!img && (img === target || img.contains(target));
    g.onPhoto = g.onImage || backdropRef.current === target;
    g.mode = zoomRef.current.scale > ZOOM_SETTLE ? 'pan' : 'swipe';
    g.multi = false;
    g.startX = t.clientX;
    g.startY = t.clientY;
    g.lastX = t.clientX;
    g.lastY = t.clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const g = gestureRef.current;

    if (e.touches.length >= 2) {
      // A second finger can arrive mid swipe without a fresh touchstart
      // reaching us, so promote here rather than assuming touchstart saw it.
      if (g.mode !== 'pinch') {
        beginPinch(e);
        return;
      }
      const gap = fingerGap(e.touches[0], e.touches[1]);
      const m = fingerMid(e.touches[0], e.touches[1]);
      const next = Math.min(MAX_ZOOM, Math.max(1, (g.startScale * gap) / g.startDist));
      zoomAbout(next, m.x, m.y);
      // Then follow the fingers as the pair travels across the screen, so a
      // pinch that drifts takes the photo with it instead of fighting it.
      zoomRef.current.x += m.x - g.lastX;
      zoomRef.current.y += m.y - g.lastY;
      g.lastX = m.x;
      g.lastY = m.y;
      clampZoom();
      applyZoom(false);
      return;
    }

    const t = e.touches[0];
    if (!t) return;

    if (g.mode === 'pan' && g.onPhoto) {
      zoomRef.current.x += t.clientX - g.lastX;
      zoomRef.current.y += t.clientY - g.lastY;
      g.lastX = t.clientX;
      g.lastY = t.clientY;
      clampZoom();
      applyZoom(false);
      return;
    }

    if (g.mode === 'swipe') {
      g.lastX = t.clientX;
      g.lastY = t.clientY;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const g = gestureRef.current;

    // Fingers still down: a pinch that dropped to one finger becomes a pan,
    // and that one finger must not be read as a swipe on the way up.
    if (e.touches.length >= 1) {
      if (g.mode === 'pinch') {
        g.mode = zoomRef.current.scale > ZOOM_SETTLE ? 'pan' : 'none';
        g.lastX = e.touches[0].clientX;
        g.lastY = e.touches[0].clientY;
      }
      return;
    }

    const { mode, multi, onPhoto, onImage, startX, startY, lastX, lastY } = g;
    g.mode = 'none';
    g.multi = false;

    if (mode === 'pinch' || multi) {
      if (zoomRef.current.scale <= ZOOM_SETTLE) resetZoom(true);
      else {
        clampZoom();
        applyZoom(true);
      }
      return;
    }

    const travelled = startX - lastX;

    // A tap, not a drag. Tested BEFORE the pan branch on purpose: a finger
    // going down while the photo is already zoomed opens in pan mode, so
    // asking "was this a swipe that barely moved" would never see the taps
    // of someone trying to double tap their way back out of a zoom, which is
    // the single most likely moment for them to want it.
    if (Math.hypot(travelled, startY - lastY) < 10) {
      if (!onPhoto) return;
      const now = Date.now();
      const tap = lastTapRef.current;
      const isSecond =
        onImage && now - tap.at < DOUBLE_TAP_MS && Math.hypot(lastX - tap.x, lastY - tap.y) < 40;
      if (isSecond) {
        lastTapRef.current = { at: 0, x: 0, y: 0 };
        if (zoomRef.current.scale > ZOOM_SETTLE) resetZoom(true);
        else {
          zoomAbout(DOUBLE_TAP_ZOOM, lastX, lastY);
          clampZoom();
          applyZoom(true);
        }
        return;
      }
      lastTapRef.current = { at: now, x: lastX, y: lastY };
      return;
    }

    if (mode === 'pan') {
      clampZoom();
      applyZoom(true);
      return;
    }

    if (mode !== 'swipe' || !onPhoto) return;

    // Swipe to change photo. Phone widths only, as before, and never while
    // zoomed in: there the same drag is a pan, and the gesture never got
    // this far.
    if (layoutViewport().width >= 768) return;
    if (zoomRef.current.scale > ZOOM_SETTLE) return;
    if (travelled > SWIPE_PX && onNext) onNext();
    else if (travelled < -SWIPE_PX && onPrevious) onPrevious();
  };

  // A new photo arrives in the SAME <img> element, so without this the
  // previous photo's zoom transform would still be sitting on it.
  useEffect(() => {
    resetZoom(false);
  }, [displayUrl, resetZoom]);

  if (!isOpen) return null;

  return (
    <Box
      position="fixed"
      inset="0"
      zIndex={2100}
      // The gestures live on the OVERLAY, not on the image container. They
      // used to sit on the container, which carries pointerEvents:none and so
      // only ever saw touches that began on the photo itself. A pinch with one
      // finger on the photo and the other on the black around it was therefore
      // half visible to us and half not. Up here both fingers are in the same
      // subtree whatever they land on. Duplicate touchmoves, which is what you
      // get when the two fingers are over different children and each bubbles
      // separately, are harmless: see the gesture block above.
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      // `none`, because from here down the pinch is ours to draw. React
      // attaches touchmove passively at the root, so e.preventDefault() in
      // the handlers above is a no-op and this declaration is the only thing
      // that actually stops the browser doing its own thing underneath us.
      sx={{ touchAction: 'none' }}
    >
      {/* Dark backdrop. Fade-out matches the image close animation so
          the two motions land together — otherwise the backdrop finished
          fading first and the user could see the still-shrinking image
          floating over the underlying page, which read as ghostly. */}
      <m.div
        ref={backdropRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: backdropOpacity }}
        transition={{ duration: isClosing ? 0.55 : 0.3, ease: [0.16, 1, 0.3, 1] }}
        style={{
          position: 'absolute',
          inset: 0,
          // Fully opaque, not 0.92. Eight percent of the page behind was
          // compositing through, so wherever that page was white you got a
          // faint RGB(20,20,20) line and wherever it was dark you got black.
          // The result read as stray white lines down the right and along the
          // bottom, which is exactly what a client reported. Nothing behind a
          // photo should be competing with it anyway.
          background: 'rgb(0,0,0)',
        }}
        onClick={handleClose}
      />

      {/* Top bar */}
      <Flex
        position="absolute"
        top={0}
        left={0}
        right={0}
        px={{ base: 4, md: 8 }}
        py={5}
        justify="space-between"
        align="center"
        zIndex={1450}
        opacity={showUI ? 1 : 0}
        transition="opacity 0.25s"
        pointerEvents={showUI ? 'auto' : 'none'}
      >
        <Text
          textStyle="metaCaption"
          color="whiteAlpha.600"
          userSelect="none"
          onClick={(e) => e.stopPropagation()}
        >
          {currentIndex !== undefined && totalImages !== undefined
            ? `${currentIndex + 1} / ${totalImages}`
            : ''}
        </Text>

        <Flex gap={5} align="center" onClick={(e) => e.stopPropagation()}>
          {/* Favorite action moved to the bottom bar as a labeled
              pill button next to Save — see FavoriteButton usage
              below. Discoverable there than a tiny top-corner heart
              that users kept missing. */}
          {photoData && category && !hideShare && (
            <Box
              as="button"
              aria-label="Share photo"
              onClick={handleShare}
              color="whiteAlpha.600"
              transition="color 0.3s"
              _hover={{ color: 'brand.accent' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <ExternalLinkIcon boxSize={4} />
            </Box>
          )}
          <Box
            as="button"
            aria-label="Close"
            onClick={(e: React.MouseEvent) => {
              e.stopPropagation();
              handleClose();
            }}
            color="whiteAlpha.600"
            transition="color 0.3s"
            _hover={{ color: 'white' }}
            sx={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <CloseIcon boxSize={3} />
          </Box>
        </Flex>
      </Flex>

      {/* Bottom bar — photo title (left) + action CTA (right). The action is
          "Download" for client-portal galleries (downloadUrl set) or "View
          Photo Page" for the public gallery (photoPageUrl set). Same showUI
          gating as the top bar so both fade in together once the open
          animation lands. */}
      {(photoPageUrl || downloadUrl) && (
        <Flex
          position="absolute"
          bottom={0}
          left={0}
          right={0}
          px={{ base: 4, md: 8 }}
          py={{ base: 4, md: 5 }}
          justify="space-between"
          align="center"
          gap={4}
          zIndex={1450}
          opacity={showUI ? 1 : 0}
          transition="opacity 0.25s"
          pointerEvents={showUI ? 'auto' : 'none'}
          bg="linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0))"
          onClick={(e) => e.stopPropagation()}
        >
          {photoTitle && (
            <Text
              // bodyCopy, not cardTitle: this sits in a fixed-height control
              // bar beside the Favourite and Save pills. At 20px the title had
              // roughly 110px on a 375px screen — about seven characters.
              textStyle="bodyCopy"
              color="whiteAlpha.900"
              noOfLines={1}
              flex="1 1 auto"
              minW={0}
            >
              {photoTitle}
            </Text>
          )}
          {/* Right-side action cluster — labeled Favorite pill (when
              the parent wired up onToggleFavorite) sits to the left of
              the Save/Download/Open action. Same-shape pills side by
              side so users see them as peer choices: "keep this one"
              vs "download this one." Previously the favorite was a
              small heart icon in the top-right of the modal which
              nobody noticed — the label + peer-with-Save placement
              is the fix. */}
          <Flex gap={2} align="center" flexShrink={0}>
          {onToggleFavorite && (
            <CTAButton
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              icon={isFavorite ? FaHeart : FaRegHeart}
              variant={isFavorite ? 'solid' : 'outline'}
              tone="dark"
              size="sm"
            >
              {isFavorite ? 'Favorited' : 'Favorite'}
            </CTAButton>
          )}
          {downloadUrl || mobileSaveUrl || driveViewUrl ? (
            useMobileDriveFlow ? (
              // Large-file path on mobile: skip the in-app save flow
              // entirely. Pre-fetching a 100+ MB blob through our Vercel
              // proxy would either time out, exhaust browser memory, or
              // waste a lot of bandwidth. Drive's native viewer handles
              // arbitrarily large files just fine.
              <CTAButton
                href={driveViewUrl!}
                newTab
                icon={FaExternalLinkAlt}
                tone="dark"
                size="sm"
              >
                Open in Drive
              </CTAButton>
            ) : useMobileSaveFlow ? (
              // Mobile path: two-option menu. The dropdown mechanic
              // is still required by iOS — Web Share needs a *synchronous*
              // user gesture, which we get from the MenuItem click; the
              // prefetch fires when the menu opens, so by the time the
              // user taps the item the blob is usually ready. If it's
              // not, the item shows "Preparing…" and stays disabled.
              //
              // Second option: "View original in Drive" — full-res escape
              // hatch. Framed as a different kind of action (see in Drive)
              // rather than a second download format so users don't have
              // to make an image-quality decision every time.
              <DownloadMenu
                fileSize={fileSize}
                onPrimary={handleMobileSave}
                onMenuOpen={triggerPrefetch}
                primaryTitle="Save to Photos"
                primaryDesc={photoBlob ? 'Ready to save' : 'Preparing…'}
                primaryDisabled={!photoBlob}
                driveViewUrl={driveViewUrl}
                triggerLabel="Save"
              />
            ) : downloadUrl ? (
              // Desktop path: same two-option menu shape as mobile so
              // the two feel like one component. Primary is an anchor
              // download rather than a share-blob call, since desktop
              // browsers just save the file straight from the link.
              <DownloadMenu
                fileSize={fileSize}
                primaryHref={downloadUrl}
                primaryDownload={downloadFilename ?? true}
                primaryTitle="Download"
                primaryDesc="Save to this device"
                driveViewUrl={driveViewUrl}
                triggerLabel="Download"
              />
            ) : (
              <CTAButton onClick={handleViewPhotoPage} tone="dark" size="sm">
                View Photo Page →
              </CTAButton>
            )
          ) : (
            <CTAButton onClick={handleViewPhotoPage} tone="dark" size="sm">
              View Photo Page →
            </CTAButton>
          )}
          </Flex>
        </Flex>
      )}

      {/* Navigation arrows */}
      {onPrevious && (
        <Flex
          position="absolute"
          left={{ base: 2, md: 6 }}
          top="50%"
          transform="translateY(-50%)"
          zIndex={1450}
          as="button"
          aria-label="Previous image"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onPrevious();
          }}
          align="center"
          justify="center"
          w="44px"
          h="44px"
          color="whiteAlpha.500"
          transition="color 0.3s"
          _hover={{ color: 'white' }}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
          opacity={showUI ? 1 : 0}
          pointerEvents={showUI ? 'auto' : 'none'}
        >
          <ChevronLeftIcon boxSize={8} />
        </Flex>
      )}

      {onNext && (
        <Flex
          position="absolute"
          right={{ base: 2, md: 6 }}
          top="50%"
          transform="translateY(-50%)"
          zIndex={1450}
          as="button"
          aria-label="Next image"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onNext();
          }}
          align="center"
          justify="center"
          w="44px"
          h="44px"
          color="whiteAlpha.500"
          transition="color 0.3s"
          _hover={{ color: 'white' }}
          sx={{ WebkitTapHighlightColor: 'transparent' }}
          opacity={showUI ? 1 : 0}
          pointerEvents={showUI ? 'auto' : 'none'}
        >
          <ChevronRightIcon boxSize={8} />
        </Flex>
      )}

      {/* Image container — animates between thumbnail rect and centered rect.
          Base rect is fixed (openPos); scaleX/scaleY/x/y transforms shrink
          the container to the thumb rect on close. transform-origin: top-left
          means scaleX shrinks the width from the left edge and x=0 is
          "aligned to left edge of openPos" — so the transform math is
          intuitive (see rectToTransform). will-change hints the browser to
          composite this layer on the GPU. */}
      <m.div
        initial={initialPos}
        animate={animTarget}
        transition={animTransition}
        onAnimationComplete={handleAnimComplete}
        style={{
          position: 'fixed',
          top: openPos.top,
          left: openPos.left,
          width: openPos.width,
          height: openPos.height,
          transformOrigin: 'top left',
          willChange: 'transform, opacity',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 1400,
        }}
      >
        {/* Underneath the real one, and only until it lands. objectFit
            contain, matching the photo above it, so the swap is a change of
            resolution and nothing else: no reframe, no jump. aria-hidden
            because the photograph above carries the description. */}
        {placeholderUrl && currentImageLoading && (
          <img
            src={placeholderUrl}
            alt=""
            aria-hidden
            draggable={false}
            style={{
              position: 'absolute',
              maxHeight: '100%',
              maxWidth: '100%',
              objectFit: 'contain',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        )}
        <img
          ref={imgRef}
          src={displayUrl}
          alt={imageAlt}
          draggable={false}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          onLoad={() => setCurrentImageLoading(false)}
          onError={() => setCurrentImageLoading(false)}
          style={{
            maxHeight: '100%',
            maxWidth: '100%',
            objectFit: 'contain',
            userSelect: 'none',
            pointerEvents: 'auto',
            // The zoom writes `transform` on this element directly, from the
            // gesture handlers, and is deliberately NOT listed here: a
            // property React has never set through the style prop is a
            // property React will not clear on re-render, so a render landing
            // mid pinch cannot snap the photo back to fit.
            transformOrigin: 'center center',
          }}
        />
        {/* Spinner overlay for the case where arrow-key nav landed on a
            photo the browser hasn't cached yet. Sits above the image so
            the user sees SOMETHING happening (rather than a blank void
            that gets them mashing the arrow key again). Auto-hides on
            img onLoad / onError. */}
        {currentImageLoading && (
          <Box
            position="absolute"
            top="50%"
            left="50%"
            transform="translate(-50%, -50%)"
            pointerEvents="none"
          >
            <Spinner
              size="lg"
              color="whiteAlpha.800"
              thickness="2px"
              speed="0.9s"
              emptyColor="whiteAlpha.200"
            />
          </Box>
        )}
      </m.div>
      <CopyNotification />
    </Box>
  );
};

export default ImageModal;
