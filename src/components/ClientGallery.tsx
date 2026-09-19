import {
  Box,
  Flex,
  Text,
  VStack,
  Image,
  Icon,
  Input,
  SimpleGrid,
} from '@chakra-ui/react';
import { useState, useRef, useCallback, useEffect, useMemo, Fragment } from 'react';
import FaCheck from '../icons/fa/FaCheck';
import FaChevronUp from '../icons/fa/FaChevronUp';
import FaClock from '../icons/fa/FaClock';
import FaCopy from '../icons/fa/FaCopy';
import FaDownload from '../icons/fa/FaDownload';
import FaExternalLinkAlt from '../icons/fa/FaExternalLinkAlt';
import FaEye from '../icons/fa/FaEye';
import FaEyeSlash from '../icons/fa/FaEyeSlash';
import FaGoogle from '../icons/fa/FaGoogle';
import FaHeart from '../icons/fa/FaHeart';
import FaImage from '../icons/fa/FaImage';
import FaInfoCircle from '../icons/fa/FaInfoCircle';
import FaMobileAlt from '../icons/fa/FaMobileAlt';
import FaPlay from '../icons/fa/FaPlay';
import FaRegHeart from '../icons/fa/FaRegHeart';
import FaShareAlt from '../icons/fa/FaShareAlt';
import FaStar from '../icons/fa/FaStar';
import CTAButton from './ui/CTAButton';
import ImageModal from './ImageModal';
// The portal header owns the scroll-strip treatment (centred while the items
// fit, edge fades and tappable chevrons once they do not). The gallery's own
// strip uses the same one rather than a second copy of it, so a phone reads
// both navs identically.
import { ScrollStrip, useNavSelectionLock } from './PortalHeader';
import {
  AT_BOTTOM_THRESHOLD,
  HEADER_CLEARANCE,
  PORTAL_NAV_H,
  portalChrome,
  type PortalChrome,
} from './portalLayout';

// Same URL used by the homepage GoogleReviewsSection — single source of
// truth would be nicer, but keeping the duplication local rather than
// dragging the whole reviews section's data along.
const GOOGLE_WRITE_REVIEW_URL = 'https://g.page/r/CSNq8ccyWt_wEAE/review';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  // Natural image dimensions from Drive's imageMediaMetadata. Used
  // by the justified-layout gallery to size each tile to the photo's
  // real aspect ratio at first paint — no reflow while thumbs load.
  width: number | null;
  height: number | null;
  thumbnailUrl: string;
  viewUrl: string;
  downloadUrl: string;
  originalUrl: string;
  driveViewUrl: string;
}

export interface FolderSection {
  id: string;
  name: string;
  files: DriveFile[];
}

interface ClientGalleryProps {
  clientName: string | null;
  driveUrl: string;
  // Files placed directly in the gallery's root folder (no subfolder).
  rootFiles: DriveFile[];
  // One entry per subfolder, in delivery order. Empty array if Veronika
  // delivered as a flat folder.
  sections: FolderSection[];
  warning?: string;
  // When set, render a "Share this gallery" section at the bottom with
  // a copyable one-click link + an email-invite form. Used on the
  // /portal/pass route (gallery-only) where the viewer has no portal
  // account — the password they typed is the auth. Full-mode portals
  // get a richer share UI inside the Gallery Pass section instead, so
  // we leave this prop unset for them.
  galleryPassword?: string;
  // ISO timestamp for when this gallery stops being accessible.
  // Surfaced under the header count as an "available until" line so
  // clients know when to save their photos by. Passed by both routes:
  // /portal/pass reads it from the gallery-auth response, full portal
  // reads it from the client-auth response. Null when the gallery
  // doesn't expire.
  expiresAt?: string | null;
  // Favorites — when both are provided, the heart UI is enabled on
  // every tile + inside the modal, and a dedicated Favorites section
  // appears at the bottom. Only wired up for full-portal users
  // (guests on /portal/pass leave these undefined, which disables the
  // whole feature — guests have no persistent identity to attach
  // favorites to). See ClientPortalView for the API call + optimistic
  // update.
  favorites?: string[];
  onToggleFavorite?: (photoId: string, currentlyFavorite: boolean) => void;
  // Set by the gallery-only route (/portal/pass), where there is no
  // contract and so no progress indicator: the portal header carries
  // the section nav itself and this component must not render its own
  // sticky strip as well. The parent drives that header with
  // useGalleryNav (exported below), which is the same hook this file
  // uses, so the two can never drift apart.
  sectionNavInHeader?: boolean;
  // True when the PAGE keeps a sticky nav row of its own under the
  // header, above this gallery, AT DESKTOP WIDTHS. The full portal does
  // while it still has progress to report; /portal/pass never does; a
  // phone never does, whatever this says, which portalChrome handles.
  // It is not about who draws the row, it is about how tall the chrome
  // above a heading is, which is what every scroll target here has to
  // clear. Getting it from the parent rather than guessing is why
  // /portal/pass stopped landing its headings a whole nav row too low.
  portalNavRow?: boolean;
  // Hand this gallery's section nav up to the page around it.
  //
  // The PHONE portal header carries these items itself, in its middle
  // slot, because below `md` the strip this component draws does not
  // render at all and the header is the only chrome there is. The header
  // is a sibling of this component, not a child, so the items have to
  // travel upwards.
  //
  // Reported rather than lifted, and that is the whole point: there is
  // exactly ONE useGalleryNav on the page and it is the one below. A
  // second copy built up in the parent to feed the header would double
  // every scroll listener in the gallery and give the strip and the
  // header two independent opinions about which section is current,
  // which would visibly drift apart on a long scroll. The filter state
  // the nav is built from lives down here, so down here is where it has
  // to be built.
  onSectionNav?: (nav: GalleryNav | null) => void;
}

interface GridTileProps {
  file: DriveFile;
  index: number;
  onSelect: (i: number) => void;
  setRef: (el: HTMLDivElement | null) => void;
  // Favorites — omitted for guests on /portal/pass (no persistent
  // identity to attach hearts to); provided for full-portal users.
  isFavorite?: boolean;
  onToggleFavorite?: (photoId: string, currentlyFavorite: boolean) => void;
}

/**
 * One thumbnail in the gallery grid. Extracted as its own component so each
 * tile owns its thumbnail-load state — if a thumbnail fails (e.g. Drive's
 * thumbnail endpoint occasionally 4xx's video files until they're fully
 * processed) we swap to a placeholder card instead of leaving the user with
 * a broken-image icon. Video files also get a play-icon overlay so it's
 * clear they're not photos before the user even clicks.
 */
/**
 * Drive thumbnails are served straight from drive.google.com, and _drive.ts
 * hard-codes sz=w800 — about 300KB each. A 163-file gallery is therefore ~36MB
 * of thumbnails pulled from a third-party host, which is what was killing them
 * on phones: iOS Safari cancels image requests under memory and connection
 * pressure, the cancel surfaces as onError, and the tile went to a permanent
 * placeholder. Same measured file at sz=w400 is 83KB and at w600 is 179KB, so
 * letting the browser pick against `sizes` cuts a phone's payload 2-4x.
 */
const thumbAt = (url: string, width: number): string => {
  try {
    const u = new URL(url);
    u.searchParams.set('sz', `w${width}`);
    return u.toString();
  } catch {
    // Not a URL we can parse — fall back to whatever the API gave us.
    return url;
  }
};

// Grid is 2 columns on phones, 3 at md, 4 at lg (see the SimpleGrid below).
const THUMB_SIZES = '(min-width: 62em) 25vw, (min-width: 48em) 33vw, 50vw';

// A failed thumbnail was permanent: one cancelled request and that tile showed
// a placeholder for the rest of the session even though the file is fine. Retry
// before giving up — the failures this is built for are transient.
const MAX_THUMB_RETRIES = 2;

const GridTile = ({ file, index, onSelect, setRef, isFavorite, onToggleFavorite }: GridTileProps) => {
  const [thumbFailed, setThumbFailed] = useState(false);
  // Bumping this remounts the <img>, which forces a fresh request; a failed
  // response is not cached, so the retry actually goes back to the network.
  const [attempt, setAttempt] = useState(0);
  const retryTimer = useRef<number | null>(null);
  const isVideo = file.mimeType.startsWith('video/');

  useEffect(
    () => () => {
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    },
    [],
  );

  const handleThumbError = () => {
    if (attempt >= MAX_THUMB_RETRIES) {
      setThumbFailed(true);
      return;
    }
    // Back off so a retry storm does not recreate the pressure that caused the
    // failure. 400ms, then 800ms.
    const delay = 400 * 2 ** attempt;
    retryTimer.current = window.setTimeout(() => setAttempt((a) => a + 1), delay);
  };
  const favoritesEnabled = Boolean(onToggleFavorite);

  const handleHeartClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleFavorite?.(file.id, Boolean(isFavorite));
  };

  return (
    <Box
      ref={setRef}
      position="relative"
      cursor="pointer"
      overflow="hidden"
      role="group"
      onClick={() => onSelect(index)}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Box position="relative" pb="100%" overflow="hidden" bg="gray.100">
        {thumbFailed ? (
          // Placeholder: dark tile with appropriate icon + filename. Shown
          // when Drive's thumbnail endpoint doesn't return an image (most
          // common cause: a video whose thumbnail Drive hasn't generated
          // yet, or any non-standard file mime type).
          <Flex
            position="absolute"
            inset={0}
            direction="column"
            align="center"
            justify="center"
            bg="gray.900"
            color="whiteAlpha.800"
            p={4}
          >
            <Flex
              bg="rgba(201, 169, 110, 0.15)"
              borderRadius="full"
              w="56px"
              h="56px"
              align="center"
              justify="center"
              mb={3}
            >
              <Icon
                as={isVideo ? FaPlay : FaImage}
                color="brand.accent"
                boxSize={5}
                ml={isVideo ? 1 : 0}
              />
            </Flex>
            <Text
              fontSize="2xs"
              textAlign="center"
              noOfLines={2}
              letterSpacing="0.02em"
              color="whiteAlpha.700"
            >
              {file.name}
            </Text>
          </Flex>
        ) : (
          <>
            <Image
              key={attempt}
              src={thumbAt(file.thumbnailUrl, 800)}
              srcSet={`${thumbAt(file.thumbnailUrl, 400)} 400w, ${thumbAt(
                file.thumbnailUrl,
                600,
              )} 600w, ${thumbAt(file.thumbnailUrl, 800)} 800w`}
              sizes={THUMB_SIZES}
              alt={file.name}
              onError={handleThumbError}
              position="absolute"
              inset={0}
              w="100%"
              h="100%"
              objectFit="cover"
              loading="lazy"
              decoding="async"
              transition="transform 0.5s ease"
              _groupHover={{ transform: 'scale(1.03)' }}
            />
            {isVideo && (
              // Play icon overlay on video thumbnails — even when the
              // thumbnail loads correctly, users should see immediately
              // that this is a video. The lightbox CTA will then read
              // "Open in Drive" instead of "Save to Photos" (since
              // videos are almost always over our 40MB threshold).
              <Flex
                position="absolute"
                inset={0}
                align="center"
                justify="center"
                pointerEvents="none"
              >
                <Flex
                  bg="rgba(0, 0, 0, 0.55)"
                  borderRadius="full"
                  w="52px"
                  h="52px"
                  align="center"
                  justify="center"
                  backdropFilter="blur(4px)"
                >
                  <Icon as={FaPlay} color="white" boxSize={4} ml={1} />
                </Flex>
              </Flex>
            )}
          </>
        )}
        <Box
          position="absolute"
          inset={0}
          bg="rgba(0,0,0,0)"
          transition="background 0.3s ease"
          _groupHover={{ bg: 'rgba(0,0,0,0.15)' }}
          pointerEvents="none"
        />
      </Box>
      {/* Per-photo quick-download in the corner — desktop only. Hidden on
          touch via @media (hover: hover) since iOS Safari fires :hover on
          first tap, which would briefly flash this icon. Canonical mobile
          save flow is the "Save to Photos" button inside the lightbox. */}
      <Box
        as="a"
        href={file.downloadUrl}
        download={file.name}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        position="absolute"
        top={2}
        right={2}
        bg="rgba(0,0,0,0.55)"
        color="white"
        w="32px"
        h="32px"
        display={{ base: 'none', md: 'flex' }}
        alignItems="center"
        justifyContent="center"
        borderRadius="full"
        opacity={0}
        transition="opacity 0.3s ease, background 0.2s ease"
        aria-label={`Download ${file.name}`}
        sx={{
          WebkitTapHighlightColor: 'transparent',
          '@media (hover: hover)': {
            '.chakra-group:hover &, [role="group"]:hover &': { opacity: 1 },
          },
        }}
        _hover={{ bg: 'brand.accent' }}
      >
        <Icon as={FaDownload} boxSize={3.5} />
      </Box>

      {/* Favorite heart — top-left corner, opposite the download.
          Always visible when the photo IS favorited (so users see
          their picks at a glance while scrolling); only appears on
          hover otherwise. Mobile shows it always since there's no
          hover — the extra visual weight is worth it for tap
          discoverability. Only rendered when favorites are enabled
          (full-portal users). */}
      {favoritesEnabled && (
        <Box
          as="button"
          type="button"
          onClick={handleHeartClick}
          position="absolute"
          top={2}
          left={2}
          bg={isFavorite ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.45)'}
          color={isFavorite ? '#ff4c68' : 'white'}
          w="32px"
          h="32px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          borderRadius="full"
          border="none"
          cursor="pointer"
          opacity={isFavorite ? 1 : { base: 0.85, md: 0 }}
          transition="opacity 0.25s ease, background 0.2s ease, color 0.2s ease"
          aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={isFavorite}
          sx={{
            WebkitTapHighlightColor: 'transparent',
            // Show on hover for desktop — matches the download-icon
            // reveal pattern above so the two corner controls feel
            // consistent.
            '@media (hover: hover)': {
              '.chakra-group:hover &, [role="group"]:hover &': { opacity: 1 },
            },
          }}
          _hover={{ bg: 'rgba(0,0,0,0.75)', color: '#ff4c68' }}
        >
          <Icon as={isFavorite ? FaHeart : FaRegHeart} boxSize={3.5} />
        </Box>
      )}
    </Box>
  );
};

const ClientGallery = ({
  clientName,
  driveUrl,
  rootFiles,
  sections,
  warning,
  galleryPassword,
  expiresAt,
  favorites,
  onToggleFavorite,
  sectionNavInHeader = false,
  portalNavRow = false,
  onSectionNav,
}: ClientGalleryProps) => {
  const favoritesEnabled = Boolean(onToggleFavorite);
  const favoritesSet = new Set(favorites ?? []);
  const favoritesCount = favoritesSet.size;

  // "Show only favorites" filter — toggled from the Favorites info
  // card at the bottom of the gallery. When active, the whole grid
  // collapses to just hearted photos in their original section
  // context (not a separate grid), the sections without any
  // favorites get greyed out in the top nav, and a prominent
  // banner explains the filter state so users can't get "stuck"
  // wondering where all their photos went.
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const filterActive = favoritesEnabled && showFavoritesOnly && favoritesCount > 0;

  const displayRootFiles = filterActive
    ? rootFiles.filter((f) => favoritesSet.has(f.id))
    : rootFiles;
  const displaySections = filterActive
    ? sections
        .map((s) => ({ ...s, files: s.files.filter((f) => favoritesSet.has(f.id)) }))
        .filter((s) => s.files.length > 0)
    : sections;

  // Which section IDs contain at least one favorite? Used by the top
  // nav to grey out (and disable) pills for sections that would be
  // empty in the filtered view. Always computed against the full
  // sections, not the filtered ones, so the set stays stable across
  // filter toggling.
  const sectionsWithFavorites = new Set(
    sections.filter((s) => s.files.some((f) => favoritesSet.has(f.id))).map((s) => s.id),
  );

  // Flatten the CURRENT display set into one ordered array. When the
  // filter is on, this walks only the visible photos so arrow-key
  // navigation in the lightbox stays within favorites too. Modal
  // photo index maps into THIS array.
  const allFiles = [...displayRootFiles, ...displaySections.flatMap((s) => s.files)];
  const totalCount = allFiles.length;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Refs per thumbnail (indexed against the flat allFiles array) so
  // ImageModal can animate open from the clicked thumbnail's rect.
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [originRect, setOriginRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  // Two different questions, and conflating them is what used to make
  // "the header carries the nav" also mean "there is no nav".
  //
  // hasSectionNav: are there sections worth navigating AT ALL? That decides
  // whether this component builds a nav and hands it up, and it does not care
  // who draws the control.
  // showSectionNav: does THIS component draw the sticky strip? That is the
  // same question minus the surfaces whose header carries the sections itself:
  // /portal/pass always, and a completed portal, where the header's photo bar
  // is the control and a strip under it would list the same sections twice.
  //
  // The predicate is exported and the portal calls it too, see
  // galleryDrawsNavRow.
  const hasSectionNav = galleryDrawsNavRow({
    rootFiles,
    sections,
    favoritesEnabled,
    sectionNavInHeader: false,
  });
  const showSectionNav = hasSectionNav && !sectionNavInHeader;

  // How tall the sticky chrome above this gallery's headings is. A nav row is
  // pinned under the header either because this gallery drew one or because
  // the page around it keeps its own. Both are the same height at the same
  // offset, so a heading only has to know whether one is there.
  //
  // Both are also hidden below `md`, where the phone header carries the nav
  // instead, so what comes back is responsive: the header alone on a phone in
  // every one of these states, and either the header alone or the header plus
  // a nav row on a desktop depending on this answer. The heading margins take the responsive value straight into `sx`;
  // the scan thresholds ask for the live one inside their handlers.
  const chrome = portalChrome(showSectionNav || portalNavRow);

  // Section nav data: the item list, which one is current, and the
  // scroll handlers. Lives in a hook rather than inside the strip so
  // the portal header can render the very same items as a segmented
  // control on a finished portal, off one implementation.
  const sectionNav = useGalleryNav({
    sections,
    favoritesEnabled,
    sectionsWithFavorites,
    filterActive,
    chrome,
    // Enabled when SOMEBODY is going to render this nav, which is either the
    // strip below or a parent that asked for it. Not a width question, which
    // is the point: the strip is display:none on a phone rather than
    // unmounted, so this stays enabled and the header's photo bar has a live
    // active id to show.
    //
    // The `onSectionNav` half is what keeps there being exactly ONE enabled
    // useGalleryNav on the page. /portal/pass builds its own up in Portal.tsx
    // and passes no reporter, so this copy stays dark; the full portal has no
    // copy of its own and asks for this one. Two enabled copies would double
    // every scroll listener in the gallery and give the strip and the bar
    // separate opinions about which section is current, which drifts apart
    // over a long scroll.
    enabled: showSectionNav || (hasSectionNav && !!onSectionNav),
  });

  // Hand the nav up, see onSectionNav. A memo because the parent puts what it
  // gets into state, and a fresh object every render would be a fresh state
  // value every render, which is a render loop.
  const reportedNav = useMemo<GalleryNav | null>(
    () =>
      hasSectionNav
        ? {
            items: sectionNav.items,
            activeId: sectionNav.activeId,
            setActiveId: sectionNav.setActiveId,
          }
        : null,
    [hasSectionNav, sectionNav.items, sectionNav.activeId, sectionNav.setActiveId],
  );
  useEffect(() => {
    onSectionNav?.(reportedNav);
  }, [onSectionNav, reportedNav]);
  // Take it back on the way out, in its own effect so it runs on unmount and
  // NOT between two reports. Folding this into the cleanup above would push a
  // null in front of every update, and a parent rendering the header off that
  // would blink its section bar away and back on every scroll.
  useEffect(() => {
    if (!onSectionNav) return;
    return () => onSectionNav(null);
  }, [onSectionNav]);

  // Watch whether ANY part of the gallery is in the viewport. Used to
  // gate the sticky bottom action bar (Download All + Share): it only
  // shows when the client is actually looking at the gallery, not when
  // they're up reading their contract or down at the login-password
  // section in the full portal. On /portal/pass the whole page is the
  // gallery so this is always true — no visible change there.
  const galleryRootRef = useRef<HTMLDivElement | null>(null);
  const [isGalleryVisible, setIsGalleryVisible] = useState(false);
  useEffect(() => {
    const el = galleryRootRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsGalleryVisible(entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleOpen = (i: number) => {
    const el = itemRefs.current[i];
    if (el) {
      const r = el.getBoundingClientRect();
      setOriginRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    } else {
      setOriginRect(null);
    }
    setSelectedIndex(i);
  };
  const handleClose = useCallback(() => {
    setSelectedIndex(null);
    setOriginRect(null);
  }, []);
  const handleNext = useCallback(() => {
    setSelectedIndex((i) => (i !== null && i < totalCount - 1 ? i + 1 : i));
  }, [totalCount]);
  const handlePrev = useCallback(() => {
    setSelectedIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  }, []);
  const getImageRect = useCallback((index: number) => {
    const el = itemRefs.current[index];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }, []);

  const selected = selectedIndex !== null ? allFiles[selectedIndex] : null;

  return (
    // No explicit bg — the parent controls it. Inside ClientPortalView
    // the photos-section wrapper is white for alternation. On the
    // standalone /portal/pass route, Portal.tsx wraps ClientGallery
    // in a Box with the necessary Navbar clearance so both routes
    // reach here without double-padding.
    //
    // overflowX clip, not hidden: the gallery owns the whole page on
    // /portal/pass, where nothing above it can stop a stray pixel of overflow
    // making the document draggable sideways on a phone. `hidden` would force
    // the other axis to auto and turn this into a scrollport, which would
    // break the sticky section strip below; `clip` creates no scroll container
    // and leaves sticky alone.
    <Box ref={galleryRootRef} minH="100vh" overflowX="clip">
      {/* Top nav sits ABOVE the header so it mirrors the portal-level
          nav (which also sits above the portal header). DESKTOP only:
          it is display:none below `md`, where the portal header's own
          section bar carries these very items, off the same hook, and a
          second row would be the third thing competing for a 390px
          phone. Skipped entirely when the portal header carries the
          items as a segmented control instead. */}
      {showSectionNav && (
        <TopSectionNav
          items={sectionNav.items}
          activeId={sectionNav.activeId}
          setActiveId={sectionNav.setActiveId}
        />
      )}

      {/* Header — id lets the Info pill in the top nav scroll back
          here. All the top-of-gallery orientation lives inside: title,
          count (with favorite total in parens), expiration ribbon,
          save-tips card. Padding matches other portal sections
          (was thicker before; Alex correctly flagged it as visually
          heavier than its neighbors). scrollMarginTop clears the fixed
          portal header plus the sticky section strip, at both widths
          now that phones get the strip too. */}
      <Box
        id="gallery-info-section"
        sx={{ scrollMarginTop: chrome.scrollMargin }}
        px={{ base: 4, md: 8 }}
        pt={{ base: 6, md: 8 }}
        pb={{ base: 6, md: 8 }}
        textAlign="center"
      >
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="brand.accent"
          mb={3}
        >
          Private Gallery
        </Text>
        <Box w="40px" h="1px" bg="brand.accent" mx="auto" mb={5} />
        <Text
          as="h1"
          fontSize={{ base: '2xl', md: '3xl' }}
          fontWeight="200"
          color="gray.800"
          letterSpacing="0.02em"
          mb={2}
          m={0}
        >
          {clientName ? `Welcome, ${clientName}` : 'Your Photos'}
        </Text>
        {totalCount > 0 && (
          // Count line — always reports the TOTAL number of photos.
          // When favorites are enabled and non-zero, tacks on the
          // hearted count in parens so clients see at a glance how
          // many they've picked out. Sections count follows as a
          // secondary bullet.
          <Text fontSize="sm" color="gray.500" fontWeight="300" mt={2}>
            {totalCount} {totalCount === 1 ? 'photo' : 'photos'}
            {favoritesEnabled && favoritesCount > 0 && (
              <Text as="span" color="brand.accent" fontWeight="400">
                {' '}({favoritesCount} favorited)
              </Text>
            )}
            {sections.length > 0 && (
              <>
                {' · '}
                {sections.length} {sections.length === 1 ? 'section' : 'sections'}
              </>
            )}
          </Text>
        )}

        {/* Available-until ribbon — actual visible banner with notched
            ends so it doesn't blend into the header metadata like the
            old subtle line did. Bold date sits inside the ribbon; the
            "contact Veronika / download by" note lives below it as a
            small footnote so the two read as one grouped object. */}
        {expiresAt && (
          <ExpiryRibbon
            expiresAt={expiresAt}
            footnote={
              galleryPassword
                ? 'Contact Veronika if you need it extended.'
                : 'Download what you want to keep by then.'
            }
          />
        )}

        {/* Save-tips card — warm gold-tinted card so it reads as
            helpful info rather than a legal footnote. Horizontal
            three-column on desktop; on mobile we go with a compact
            single-line-per-tip layout (icon + tight two-line copy)
            so the card doesn't take up half the viewport. Order
            leads with long-press because it's the fastest path. */}
        <Box
          mt={{ base: 6, md: 8 }}
          maxW="720px"
          mx="auto"
          bg="brand.surface"
          border="1px solid"
          borderColor="brand.accentBorder"
          borderRadius="md"
          px={{ base: 4, md: 6 }}
          py={{ base: 4, md: 5 }}
          textAlign="left"
        >
          <Text
            fontSize="2xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="brand.accentText"
            textAlign="center"
            mb={{ base: 3, md: 4 }}
          >
            How to save your photos
          </Text>
          <Flex
            direction={{ base: 'column', md: 'row' }}
            gap={{ base: 2.5, md: 5 }}
            align="stretch"
          >
            <SaveTip
              icon={FaMobileAlt}
              title="Long-press &amp; Save"
              body="On phone, hold any photo and pick Save to send it to your camera roll."
            />
            <SaveTip
              icon={FaImage}
              title="Or tap, then Save"
              body="Tap a photo to open it, then use the Save button. Print quality lives under View original in Drive."
            />
            <SaveTip
              icon={FaDownload}
              title="Download All"
              body="For every photo at print quality, use the Download All button at the bottom of the page."
            />
          </Flex>
        </Box>

        {warning && (
          <Text mt={4} fontSize="sm" color="orange.500" fontWeight="300" maxW="500px" mx="auto">
            {warning}
          </Text>
        )}
      </Box>

      {/* Review CTA — warm gold-tinted card, elevated visual weight so
          this doesn't get lost like the outline-only version did.
          Sits right below the header so it's the first thing after the
          welcome, before the photo grid. Personal italic note stays —
          it's the emotional anchor. Five gold stars evoke the ask
          without saying "please review" out loud. */}
      <Box px={6} pb={{ base: 8, md: 10 }}>
        <Box
          maxW="520px"
          mx="auto"
          bg="brand.surface"
          border="1px solid"
          borderColor="brand.accentBorder"
          borderRadius="md"
          px={{ base: 6, md: 8 }}
          py={{ base: 6, md: 7 }}
          textAlign="center"
        >
          <Flex justify="center" gap={1} mb={4} color="brand.accentText">
            {[0, 1, 2, 3, 4].map((i) => (
              <Icon key={i} as={FaStar} boxSize={4} />
            ))}
          </Flex>
          <Text
            fontSize="sm"
            color="gray.700"
            fontStyle="italic"
            lineHeight="1.8"
            mb={5}
          >
            Loved your photos? A few kind words on Google mean the world.
            {/* Signature on its own line, so it does not need a dash to
                separate it from the sentence above. */}
            <Text
              as="span"
              display="block"
              mt={2}
              fontStyle="normal"
              color="gray.600"
              fontWeight="400"
            >
              Veronika
            </Text>
          </Text>
          <CTAButton
            href={GOOGLE_WRITE_REVIEW_URL}
            icon={FaGoogle}
            variant="solid"
            size="sm"
          >
            Leave a Review
          </CTAButton>
        </Box>
      </Box>

      {/* Filter-on banner — appears only when the favorites filter is
          engaged. Warm gold-tinted card matching the rest of the
          treatment; canonical CTAButton for "Show all photos" so it
          matches every other outline button on the site. */}
      {filterActive && (
        <FilterActiveBanner
          shownCount={
            displayRootFiles.length + displaySections.reduce((n, s) => n + s.files.length, 0)
          }
          totalCount={rootFiles.length + sections.reduce((n, s) => n + s.files.length, 0)}
          onClear={() => setShowFavoritesOnly(false)}
        />
      )}

      {/* Grid — renders the current display set (filtered or not).
          When the favorites filter is on, sections with 0 hearts
          drop out entirely and the flat allFiles array walks only
          the visible photos, so modal arrow-nav stays consistent. */}
      {totalCount > 0 ? (
        <Box px={{ base: 2, md: 6 }} pb={20}>
          {/* Root-level files (no subfolder). Show first, no header — these
              are the files Veronika placed directly in the gallery root. If
              she delivered everything in subfolders, this is empty. */}
          {displayRootFiles.length > 0 && (
            <SimpleGrid
              columns={{ base: 2, md: 3, lg: 4 }}
              spacing={{ base: 1, md: 2 }}
            >
              {displayRootFiles.map((file, i) => (
                <GridTile
                  key={file.id}
                  file={file}
                  index={i}
                  onSelect={handleOpen}
                  setRef={(el) => { itemRefs.current[i] = el; }}
                  isFavorite={favoritesSet.has(file.id)}
                  onToggleFavorite={onToggleFavorite}
                />
              ))}
            </SimpleGrid>
          )}

          {/* Sections — one per subfolder. Each gets its own labeled grid.
              Index offset accumulates so itemRefs[i] always maps to
              allFiles[i] (the same array the lightbox navigates by). */}
          {displaySections.map((section, sIdx) => {
            const offset =
              displayRootFiles.length +
              displaySections.slice(0, sIdx).reduce((acc, s) => acc + s.files.length, 0);
            return (
              <Box
                key={section.id}
                // The nav finds sections by DOM id rather than by a ref
                // held in this component, so the portal header can drive
                // the same navigation from outside the gallery.
                id={gallerySectionDomId(section.id)}
                // Consistent breathing room above every section header,
                // even the first one, now that the sticky top nav bar
                // is gone. (Previously the first section had mt=0 so it
                // could sit tight against that nav bar's bottom edge.)
                mt={{ base: 8, md: 12 }}
                // scroll-margin-top so smooth-scroll lands the section
                // header below whatever chrome this surface has.
                sx={{ scrollMarginTop: chrome.scrollMargin }}
              >
                {/* Section header — matches the gallery's main header
                    treatment but scaled down: small gold uppercase label,
                    larger section name in light weight, thin gold rule.
                    Consistent with the rest of the site's typography. */}
                <Box textAlign="center" mb={{ base: 6, md: 8 }} px={4}>
                  <Text
                    fontSize="2xs"
                    fontWeight="500"
                    textTransform="uppercase"
                    letterSpacing="0.25em"
                    color="brand.accent"
                    mb={2}
                  >
                    Section
                  </Text>
                  <Text
                    as="h2"
                    fontSize={{ base: 'xl', md: '2xl' }}
                    fontWeight="200"
                    color="gray.800"
                    letterSpacing="0.02em"
                    m={0}
                    mb={2}
                  >
                    {section.name}
                  </Text>
                  <Box w="30px" h="1px" bg="brand.accent" mx="auto" mb={1.5} />
                  <Text fontSize="xs" color="gray.500" fontWeight="300">
                    {section.files.length} {section.files.length === 1 ? 'photo' : 'photos'}
                  </Text>
                </Box>
                <SimpleGrid
                  columns={{ base: 2, md: 3, lg: 4 }}
                  spacing={{ base: 1, md: 2 }}
                >
                  {section.files.map((file, i) => {
                    const flatIndex = offset + i;
                    return (
                      <GridTile
                        key={file.id}
                        file={file}
                        index={flatIndex}
                        onSelect={handleOpen}
                        setRef={(el) => { itemRefs.current[flatIndex] = el; }}
                        isFavorite={favoritesSet.has(file.id)}
                        onToggleFavorite={onToggleFavorite}
                      />
                    );
                  })}
                </SimpleGrid>
              </Box>
            );
          })}

          {/* Favorites info + filter section — informational card
              (not a duplicate grid). Explains how favorites work,
              exposes the filter toggle, and reserves space for the
              future "request an album" flow. Only rendered for full-
              portal users (favoritesEnabled). Reachable via the
              Favorites pill in the top nav. */}
          {favoritesEnabled && (
            <FavoritesInfoSection
              count={favoritesCount}
              filterActive={filterActive}
              onToggleFilter={() => setShowFavoritesOnly((v) => !v)}
              scrollMargin={chrome.scrollMargin}
            />
          )}
        </Box>
      ) : filterActive ? (
        // Filter is on and somehow returned zero — defensive edge
        // case (favorites list out of sync with the gallery, or
        // Vero removed a photo the client had hearted). Give a
        // clear way out.
        <Box textAlign="center" py={16} px={6}>
          <Text color="gray.500" fontWeight="300" mb={4}>
            No favorited photos in the current view.
          </Text>
          <CTAButton
            onClick={() => setShowFavoritesOnly(false)}
            variant="outline"
            size="sm"
          >
            Show all photos
          </CTAButton>
        </Box>
      ) : (
        <Box textAlign="center" py={20} px={6}>
          <Text color="gray.500" fontWeight="300" mb={4}>
            Photo previews aren't loading, but your gallery is ready.
          </Text>
          <CTAButton href={driveUrl} icon={FaExternalLinkAlt}>
            View in Google Drive
          </CTAButton>
        </Box>
      )}

      {/* Lightbox — same ImageModal the public gallery uses. The download
          props swap the bottom CTA to "Download" (saving the file via the
          anchor's download attribute) and the share icon is hidden since
          client photos don't have a public share URL. */}
      {selected && selectedIndex !== null && (
        <ImageModal
          isOpen={true}
          onClose={handleClose}
          imageUrl={selected.viewUrl}
          imageAlt={selected.name}
          onNext={handleNext}
          onPrevious={handlePrev}
          currentIndex={selectedIndex}
          totalImages={totalCount}
          photoData={{
            url: selected.viewUrl,
            alt: selected.name,
            title: selected.name,
            description: '',
          }}
          originRect={originRect}
          getImageRect={getImageRect}
          downloadUrl={selected.downloadUrl}
          downloadFilename={selected.name}
          mobileSaveUrl={selected.originalUrl}
          fileSize={selected.size ?? undefined}
          driveViewUrl={selected.driveViewUrl}
          hideShare
          // Lets the modal preload ±10 photos around the current one so
          // arrow-key nav in either direction lands on a warm browser
          // cache. Returns undefined for out-of-range indexes; modal
          // treats that as "skip".
          getViewUrl={(i) => allFiles[i]?.viewUrl}
          // Fade the close animation to opacity 0 instead of landing
          // at full opacity on the thumbnail. Client galleries use a
          // uniform square grid regardless of photo aspect, so a
          // full-opacity landing would visibly mismatch the thumb's
          // aspect at the last frame. Public masonry gallery leaves
          // this off — its thumbs match photo aspects exactly.
          fadeOnClose
          // Favorite state for the currently-open photo + callback.
          // The heart in the modal top bar is only rendered when
          // onToggleFavorite is provided (full-portal only).
          isFavorite={favoritesSet.has(selected.id)}
          onToggleFavorite={
            onToggleFavorite
              ? () => onToggleFavorite(selected.id, favoritesSet.has(selected.id))
              : undefined
          }
        />
      )}

      {/* The old "Want everything?" bottom section was removed — Download
          All now lives in the sticky action bar (rendered below), always
          reachable regardless of scroll position. No point duplicating. */}

      {/* Share section — only rendered when the parent route passes a
          gallery password, i.e. /portal/pass (gallery-only access).
          Full-mode portals have a richer share UI in their Gallery Pass
          section already. The id is the scroll-target the sticky bar's
          Share button jumps to; the equivalent Gallery Pass section
          inside ClientPortalView uses the same id for the same reason. */}
      {galleryPassword && (
        <Box
          id="gallery-share-section"
          // Scroll offset clears the chrome this surface actually has.
          // Without it, smooth-scroll from the sticky Share button lands
          // the section under those bars and clips its header and intro.
          sx={{ scrollMarginTop: chrome.scrollMargin }}
        >
          <GalleryShareSection galleryPassword={galleryPassword} />
        </Box>
      )}

      {/* Sticky bottom action bar. Auto-hides while the photo modal is
          open (selectedIndex non-null) so it doesn't float over the
          modal's controls. Also hides when the gallery is scrolled out
          of view: matters in the full portal, where without this the
          bar would linger over the contract / balance / password
          sections and look out of context. Navigation is not its job
          at any width, the sticky section strip above handles that on
          phones as well as desktop. */}
      {selectedIndex === null && totalCount > 0 && isGalleryVisible && (
        <GalleryActionBar driveUrl={driveUrl} />
      )}
    </Box>
  );
};

/**
 * Sticky bottom action bar. Always visible while the user is browsing the
 * gallery grid (auto-hides when the photo modal opens, see caller).
 * Contains the two things clients most often reach for:
 *   1. Download All, opens the Drive folder for the full-quality set
 *   2. Share, smooth-scrolls to the share section (present on both
 *      /portal/pass and inside ClientPortalView via #gallery-share-section)
 * Both are unconditional, which is the whole point of the bar. Section
 * navigation is not here at any width: the sticky pill strip at the top
 * now renders on phones too, so there is one way to move around the
 * gallery rather than two that have to agree with each other.
 */
interface GalleryActionBarProps {
  driveUrl: string;
}

function GalleryActionBar({ driveUrl }: GalleryActionBarProps) {
  const handleShareClick = useCallback(() => {
    // The share target has id="gallery-share-section" on both routes:
    // /portal/pass renders GalleryShareSection below, the full portal
    // renders ClientPortalView's Gallery Pass section. Fall back to
    // scrolling to the very bottom if neither is present (defensive).
    scrollToElementId('gallery-share-section', 'bottom');
  }, []);

  return (
    <Box
      position="fixed"
      bottom={{ base: 3, md: 5 }}
      left="50%"
      transform="translateX(-50%)"
      zIndex={40}
      bg="rgba(255, 255, 255, 0.92)"
      backdropFilter="blur(10px)"
      border="1px solid"
      borderColor="rgba(201, 169, 110, 0.35)"
      borderRadius="full"
      boxShadow="0 10px 30px rgba(0, 0, 0, 0.12)"
      px={{ base: 2, md: 3 }}
      py={{ base: 1.5, md: 2 }}
    >
      <Flex gap={{ base: 1, md: 2 }} align="center">
        <ActionBarButton href={driveUrl} newTab icon={FaDownload} label="Download All" />
        <ActionBarDivider />
        <ActionBarButton onClick={handleShareClick} icon={FaShareAlt} label="Share" />
      </Flex>
    </Box>
  );
}

interface ActionBarButtonProps {
  href?: string;
  newTab?: boolean;
  onClick?: () => void;
  icon: typeof FaDownload;
  label: string;
}

function ActionBarButton({ href, newTab, onClick, icon, label }: ActionBarButtonProps) {
  const common = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    px: { base: 3, md: 4 },
    py: 2,
    fontSize: '2xs',
    fontWeight: 500,
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
    color: 'gray.700',
    bg: 'transparent',
    border: 'none',
    borderRadius: 'full',
    cursor: 'pointer',
    transition: 'all 0.2s',
    _hover: { color: 'brand.accent', bg: 'rgba(201, 169, 110, 0.08)' },
    sx: { WebkitTapHighlightColor: 'transparent' },
    whiteSpace: 'nowrap' as const,
  };
  const content = (
    <>
      <Icon as={icon} boxSize={3} />
      <Box as="span">{label}</Box>
    </>
  );
  if (href) {
    return (
      <Box
        as="a"
        href={href}
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...common}
      >
        {content}
      </Box>
    );
  }
  return (
    <Box as="button" type="button" onClick={onClick} {...common}>
      {content}
    </Box>
  );
}

function ActionBarDivider() {
  return <Box w="1px" h="18px" bg="rgba(201, 169, 110, 0.35)" flexShrink={0} />;
}

/**
 * Format the gallery expiration date. Same UTC-safe idiom used
 * elsewhere in the app (see ClientPortalView.formatDate) so the
 * displayed day matches what Veronika typed regardless of the
 * viewer's timezone.
 */
function formatGalleryExpiry(iso: string): string {
  const datePart = iso.split('T')[0];
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * One item in the "How to save your photos" card. Renders as a
 * three-across row on desktop and a stacked list on mobile. The
 * icon sits inside a soft gold circle so the card reads as friendly
 * info, not a warning.
 */
function SaveTip({
  icon,
  title,
  body,
}: {
  icon: typeof FaMobileAlt;
  title: string;
  body: string;
}) {
  return (
    <Flex
      direction={{ base: 'row', md: 'column' }}
      align={{ base: 'flex-start', md: 'center' }}
      textAlign={{ base: 'left', md: 'center' }}
      gap={{ base: 2.5, md: 3 }}
      flex={1}
    >
      <Flex
        flexShrink={0}
        w={{ base: '28px', md: '36px' }}
        h={{ base: '28px', md: '36px' }}
        borderRadius="full"
        bg="#f3e6bf"
        align="center"
        justify="center"
        color="brand.accentText"
        mt={{ base: 0.5, md: 0 }}
      >
        <Icon as={icon} boxSize={{ base: 3, md: 4 }} />
      </Flex>
      <Box>
        <Text
          fontSize={{ base: 'xs', md: 'sm' }}
          fontWeight="500"
          color="gray.800"
          mb={0.5}
          dangerouslySetInnerHTML={{ __html: title }}
        />
        <Text fontSize={{ base: '2xs', md: 'xs' }} color="gray.600" fontWeight="300" lineHeight="1.5">
          {body}
        </Text>
      </Box>
    </Flex>
  );
}

/**
 * Ribbon-style banner for the gallery-expiry callout. Renders as a
 * warm gold ribbon with chevron-notched ends so it visually reads as
 * an actual banner (not just a text line). The date is bolded inside
 * the ribbon; a small footnote sits below (contact-Veronika / download-
 * by) so the two feel like one grouped object.
 *
 * Kept as its own component so if we ever want to reuse this ribbon
 * treatment elsewhere (e.g. contract-signed banner) we can just call
 * it — please don't duplicate the clip-path values by hand.
 */
function ExpiryRibbon({
  expiresAt,
  footnote,
}: {
  expiresAt: string;
  footnote: string;
}) {
  return (
    <Box mt={5} textAlign="center">
      <Flex
        as="span"
        display="inline-flex"
        align="center"
        justify="center"
        gap={2}
        bgGradient="linear(to-r, #f3e6bf, #ecd8a3)"
        color="#5f4a12"
        // Chevron-notched ends. 10px points give a subtle ribbon feel
        // without looking like a Christmas ornament. The extra outer
        // padding compensates for the visual "eating" the notches do.
        px={{ base: 8, md: 12 }}
        py={2}
        fontSize={{ base: 'xs', md: 'sm' }}
        fontWeight="400"
        letterSpacing="0.04em"
        sx={{
          clipPath:
            'polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)',
          WebkitClipPath:
            'polygon(10px 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 10px 100%, 0 50%)',
        }}
      >
        <Icon as={FaClock} boxSize={3} />
        <Box as="span">
          Available until{' '}
          <Text as="span" fontWeight="700">
            {formatGalleryExpiry(expiresAt)}
          </Text>
        </Box>
      </Flex>
      <Text
        mt={1.5}
        fontSize="2xs"
        color="gray.500"
        fontWeight="300"
        lineHeight="1.5"
      >
        {footnote}
      </Text>
    </Box>
  );
}

/**
 * Favorites info section at the bottom of the gallery grid. NOT a
 * duplicate photo grid — it's an informational + control card that:
 *   - explains how favorites work (mirrors the save-tips card format)
 *   - exposes the "Show only favorites" filter toggle
 *   - reserves space for the future "Request an album" flow
 *
 * When the filter is toggled ON, the gallery grid above collapses
 * to favorited photos in their original sections (see ClientGallery
 * root for filter state + rendering). Section pills in the top nav
 * grey out for sections with zero favorites. A prominent filter-
 * active banner appears above the grid so users can't miss the
 * filter state.
 *
 * ID is the scroll target for the Favorites pill in the top nav.
 */
function FavoritesInfoSection({
  count,
  filterActive,
  onToggleFilter,
  scrollMargin,
}: {
  count: number;
  filterActive: boolean;
  onToggleFilter: () => void;
  /** From the gallery's own PortalChrome, so this heading clears the same
      chrome every other one does. Passed rather than imported because how
      much chrome there is depends on the surface, not on this card, and
      responsive because it also depends on the width. */
  scrollMargin: PortalChrome['scrollMargin'];
}) {
  return (
    <Box
      id="gallery-favorites-section"
      sx={{ scrollMarginTop: scrollMargin }}
      mt={{ base: 10, md: 14 }}
      pt={{ base: 8, md: 10 }}
      borderTop="1px solid"
      borderColor="gray.100"
    >
      {/* Section header — matches the gallery's Info header treatment
          so the two feel like siblings. */}
      <Box textAlign="center" mb={{ base: 6, md: 8 }} px={4}>
        <Text
          fontSize="2xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="brand.accent"
          mb={2}
        >
          Favorites
        </Text>
        <Text
          as="h2"
          fontSize={{ base: 'xl', md: '2xl' }}
          fontWeight="200"
          color="gray.800"
          letterSpacing="0.02em"
          m={0}
          mb={2}
        >
          {count === 0
            ? 'Save your favorite photos'
            : `${count} ${count === 1 ? 'photo' : 'photos'} saved`}
        </Text>
        <Box w="30px" h="1px" bg="brand.accent" mx="auto" mb={2} />
        <Text fontSize="xs" color="gray.500" fontWeight="300" maxW="440px" mx="auto" lineHeight="1.7">
          A quick way to keep track of the photos you love, for
          picking prints, sharing with family, or building an album.
        </Text>
      </Box>

      {/* Info + filter toggle card — warm gold-tinted, same treatment
          as the save-tips card at the top of the gallery so both read
          as informational callouts. */}
      <Box px={{ base: 4, md: 6 }} pb={{ base: 10, md: 14 }}>
        <Box
          maxW="720px"
          mx="auto"
          bg="brand.surface"
          border="1px solid"
          borderColor="brand.accentBorder"
          borderRadius="md"
          px={{ base: 5, md: 7 }}
          py={{ base: 5, md: 6 }}
        >
          <Flex
            direction={{ base: 'column', md: 'row' }}
            gap={{ base: 4, md: 6 }}
            align={{ base: 'stretch', md: 'center' }}
          >
            <Flex flex={1} direction="column" gap={2}>
              <Flex align="center" gap={2}>
                <Icon as={FaHeart} boxSize={3.5} color="#ff4c68" />
                <Text
                  fontSize="sm"
                  fontWeight="500"
                  color="gray.800"
                  letterSpacing="0.02em"
                >
                  How favorites work
                </Text>
              </Flex>
              <Text fontSize="xs" color="gray.700" fontWeight="300" lineHeight="1.7">
                Tap the heart on any photo, in the grid or in the lightbox,
                to mark it as a favorite. Use the toggle here to show only
                your favorites across every section, then toggle back off to
                see the whole gallery again.
              </Text>
            </Flex>
            <Box flexShrink={0} textAlign={{ base: 'left', md: 'right' }}>
              <CTAButton
                onClick={onToggleFilter}
                icon={filterActive ? FaEyeSlash : FaEye}
                variant={filterActive ? 'solid' : 'outline'}
                size="sm"
                isDisabled={!filterActive && count === 0}
              >
                {filterActive
                  ? 'Show all photos'
                  : count === 0
                  ? 'Filter (need favorites)'
                  : `Show only favorites (${count})`}
              </CTAButton>
            </Box>
          </Flex>
        </Box>

        {/* Album placeholder — reserves space in the design for the
            future request-an-album flow. For now it's a plain-text
            "coming soon" note with a Contact CTA (canonical CTAButton
            → /contact) so users have a path if they want an album
            done today. */}
        <Box
          maxW="720px"
          mx="auto"
          mt={{ base: 4, md: 5 }}
          bg="white"
          border="1px dashed"
          borderColor="gray.200"
          borderRadius="md"
          px={{ base: 5, md: 7 }}
          py={{ base: 5, md: 6 }}
          textAlign="center"
        >
          <Text
            fontSize="2xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.22em"
            color="gray.500"
            mb={2}
          >
            Coming soon
          </Text>
          <Text
            fontSize="sm"
            fontWeight="400"
            color="gray.800"
            mb={2}
            lineHeight="1.5"
          >
            Request a printed album from your favorites
          </Text>
          <Text
            fontSize="xs"
            color="gray.500"
            fontWeight="300"
            maxW="440px"
            mx="auto"
            lineHeight="1.7"
            mb={4}
          >
            Right here, you&rsquo;ll soon be able to send Veronika your
            favorite selections and get a quote back for a printed album.
            For now, reach out and she can put one together the classic way.
          </Text>
          <CTAButton to="/contact" variant="outline" size="sm">
            Contact Veronika
          </CTAButton>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Prominent banner shown above the photo grid when the favorites
 * filter is active. Warm gold-tinted card, canonical CTAButton for
 * "Show all photos" so it visually matches every other outline
 * button on the site. Copy tells the user exactly what they're
 * seeing so nobody thinks the gallery got smaller.
 */
function FilterActiveBanner({
  shownCount,
  totalCount,
  onClear,
}: {
  shownCount: number;
  totalCount: number;
  onClear: () => void;
}) {
  return (
    <Box px={{ base: 4, md: 6 }} pb={{ base: 4, md: 5 }}>
      <Flex
        maxW="720px"
        mx="auto"
        direction={{ base: 'column', md: 'row' }}
        align={{ base: 'stretch', md: 'center' }}
        justify="space-between"
        gap={{ base: 3, md: 4 }}
        bg="brand.surface"
        border="1px solid"
        borderColor="brand.accentBorder"
        borderRadius="md"
        px={{ base: 4, md: 5 }}
        py={{ base: 3, md: 3 }}
      >
        <Flex align="center" gap={2.5}>
          <Icon as={FaHeart} boxSize={3.5} color="#ff4c68" flexShrink={0} />
          <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.700" fontWeight="400">
            Filtering by favorites:{' '}
            <Text as="span" fontWeight="600">
              showing {shownCount} of {totalCount} photos
            </Text>
          </Text>
        </Flex>
        <Box flexShrink={0}>
          <CTAButton onClick={onClear} variant="outline" size="sm">
            Show all photos
          </CTAButton>
        </Box>
      </Flex>
    </Box>
  );
}

/**
 * Everything the section nav scrolls to is addressed by DOM id, never by
 * a ref held inside this file. That is what lets the portal header drive
 * the same navigation from outside the gallery.
 */
const scrollBehavior = (): ScrollBehavior =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';

/**
 * Scroll to an element by id. `fallback` says where to go when the
 * element is not on the page, which is what happens to a section while
 * the favorites filter is hiding it.
 */
function scrollToElementId(id: string, fallback?: 'top' | 'bottom') {
  const behavior = scrollBehavior();
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior, block: 'start' });
    return;
  }
  if (fallback === 'top') {
    window.scrollTo({ top: 0, behavior });
  } else if (fallback === 'bottom') {
    window.scrollTo({ top: document.body.scrollHeight, behavior });
  }
}

/** DOM id for a folder section's wrapper in the grid. */
export const gallerySectionDomId = (sectionId: string) => `gallery-section-${sectionId}`;

// The Info and Favorites bookends. These are real element ids, so the
// whole nav is addressed one way and activeId can hold any of them.
const INFO_ID = 'gallery-info-section';
const FAVORITES_ID = 'gallery-favorites-section';

/**
 * One entry in the gallery's section nav.
 *
 * `kind` is how a renderer knows where the dividers belong: Info, then
 * the folder sections, then Favorites. The label is always written out,
 * Info and Favorites included. Their icon sits next to the word, it does
 * not stand in for it.
 */
export interface GalleryNavItem {
  /** The element this scrolls to. Doubles as the React key and the active id. */
  id: string;
  label: string;
  kind: 'info' | 'section' | 'favorites';
  icon?: typeof FaInfoCircle;
  /** True when the favorites filter is on and this section holds none. */
  disabled: boolean;
  scrollTo: () => void;
}

/**
 * Does this gallery draw its own sticky nav row?
 *
 * Exported because the full portal has to know the answer BEFORE it renders.
 * Its own second sticky row pins to the very same band, at the same offset and
 * the same height, and it stands down when the gallery's strip takes over. The
 * two decisions used to be made in two places off two different facts: the
 * gallery drew a strip whenever favorites were on, and the portal stood down
 * only when files had come back. Those disagree in exactly one state, and it
 * is a state that really happens: a Drive listing that threw. The server sends
 * a warning and two empty file lists, the portal renders the gallery for its
 * "previews aren't loading" message, and the client got both nav rows pinned
 * to the same 48px, painted on top of each other, for as long as they stayed
 * in the Photos section.
 *
 * One predicate, called by the gallery that draws the row and by the portal
 * that has to stand down for it, is the only version of this that cannot drift
 * apart again.
 *
 * With no photos at all there is nothing to draw a strip FOR, which is the
 * other half of the same fact: the failure UI renders one block, no section
 * headings, and the Favorites card lives inside the grid so it is not there
 * either. A strip whose every pill scrolls to the top of the page is not
 * navigation, and it would still take the band.
 */
export function galleryDrawsNavRow({
  rootFiles,
  sections,
  favoritesEnabled,
  sectionNavInHeader,
}: {
  rootFiles: DriveFile[];
  sections: FolderSection[];
  favoritesEnabled: boolean;
  sectionNavInHeader: boolean;
}): boolean {
  if (sectionNavInHeader) return false;
  const hasPhotos = rootFiles.length > 0 || sections.some((s) => s.files.length > 0);
  if (!hasPhotos) return false;
  // Worth showing once there is more than one section, or once favorites give
  // Info and Favorites something to bookend.
  return sections.length > 1 || favoritesEnabled;
}

export interface UseGalleryNavOptions {
  sections: FolderSection[];
  /** Full portal only. Guests on /portal/pass get no Favorites item. */
  favoritesEnabled?: boolean;
  /** Section ids holding at least one favorite. Only read while filtering. */
  sectionsWithFavorites?: Set<string>;
  /** True while the "show only favorites" filter is on. */
  filterActive?: boolean;
  /**
   * The surface's sticky chrome. The scan's activation line has to sit just
   * below whatever is actually pinned above the sections it measures, so a
   * caller whose nav lives in the header (/portal/pass) passes the one-row
   * chrome and the gallery's own strip passes the two-row one. Defaults to two
   * rows, which is the full portal.
   */
  chrome?: PortalChrome;
  /** False skips the scroll listeners, for a copy nothing is rendering. */
  enabled?: boolean;
}

export interface GalleryNav {
  items: GalleryNavItem[];
  activeId: string | null;
  /**
   * "The reader picked this." Not a plain setState: it lights the item up and
   * holds the scroll scan off it until the scroll that follows has landed, so
   * the sections in between do not each flash in the highlight on the way.
   * Every caller gets that, the strip below and the portal header on
   * /portal/pass alike, because the guard lives behind this setter rather than
   * in either of them.
   */
  setActiveId: (id: string) => void;
}

/**
 * The gallery's section nav as data: what the items are, which one the
 * reader is inside, and how to get to each.
 *
 * It lives in a hook rather than inside the strip below because a
 * finished portal renders these same items as a segmented control up in
 * the portal header, with no strip at all. Two renderers, one source of
 * items and one definition of "current", so they cannot drift.
 *
 * For the header to own the nav, the parent calls this with the same
 * sections it hands to ClientGallery and passes sectionNavInHeader so
 * the gallery does not also draw a strip. The chrome goes with it: a nav
 * inside the header means one row of chrome, not two, and the scan's
 * activation line has to sit under the chrome that is really there.
 *
 *   const nav = useGalleryNav({ sections, chrome: portalChrome(false) });
 *   <PortalHeader navItems={nav.items} activeNavId={nav.activeId}
 *     onNavSelect={(id) => { nav.setActiveId(id); }} />
 *   <ClientGallery sections={sections} sectionNavInHeader ... />
 *
 * Each item carries its own scrollTo, so the header's handler is just
 * `item.scrollTo()`. Nothing about section positions has to be
 * reimplemented up there.
 */
export function useGalleryNav({
  sections,
  favoritesEnabled = false,
  sectionsWithFavorites,
  filterActive = false,
  chrome = portalChrome(true),
  enabled = true,
}: UseGalleryNavOptions): GalleryNav {
  const [activeId, setActiveIdState] = useState<string | null>(null);
  // The same guard the portal's own nav uses, which has the identical scan and
  // had the identical flicker. The HOLD behind it is shared rather than one
  // each, so a pick in the burger up in the header stops this scan too: the
  // two sit side by side on a phone and a pick in one used to leave the other
  // rattling. See useNavSelectionLock in PortalHeader.
  const lock = useNavSelectionLock();

  // Keys rather than the objects themselves: ClientGallery rebuilds the
  // sections array and the favorites Set on every render, so identity
  // says nothing. Without this the scroll listeners below would tear
  // down and resubscribe on every frame of a scroll.
  const sectionsKey = sections.map((s) => `${s.id}::${s.name}`).join('||');
  const favoritesKey = sectionsWithFavorites
    ? [...sectionsWithFavorites].sort().join('||')
    : '';

  const items = useMemo<GalleryNavItem[]>(() => {
    const built: GalleryNavItem[] = [
      {
        id: INFO_ID,
        label: 'Info',
        kind: 'info',
        icon: FaInfoCircle,
        disabled: false,
        scrollTo: () => scrollToElementId(INFO_ID, 'top'),
      },
    ];
    sections.forEach((section) => {
      const id = gallerySectionDomId(section.id);
      built.push({
        id,
        label: section.name,
        kind: 'section',
        // Greyed out (and inert) when the filter is on and this section
        // has nothing hearted in it. The item stays in the list so the
        // nav does not reshuffle as the filter toggles.
        disabled: filterActive && !(sectionsWithFavorites?.has(section.id) ?? false),
        scrollTo: () => scrollToElementId(id),
      });
    });
    if (favoritesEnabled) {
      built.push({
        id: FAVORITES_ID,
        label: 'Favorites',
        kind: 'favorites',
        icon: FaHeart,
        disabled: false,
        scrollTo: () => scrollToElementId(FAVORITES_ID, 'bottom'),
      });
    }
    return built;
    // sectionsKey and favoritesKey stand in for sections and
    // sectionsWithFavorites, see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionsKey, favoritesKey, favoritesEnabled, filterActive]);

  // Bookkeeping ref that mirrors scroll position, used inside the
  // active-section scan to know whether to defer to Info/Favorites
  // rather than picking a section. A ref (not state) so the callback
  // always sees the freshest value without needing to re-subscribe.
  const isAtExtremeRef = useRef<null | 'top' | 'bottom'>(null);

  // Watch scroll position for the "am I at the top / bottom of the
  // page?" cases. At the very top, Info lights up; at the very
  // bottom, Favorites lights up (if enabled), matching where those
  // targets sit in the DOM. Without these overrides, short trailing
  // sections would never satisfy the section-scan's activation
  // threshold and the last item would never light.
  useEffect(() => {
    if (!enabled) return;
    const updateExtremes = () => {
      const y = window.scrollY;
      const winH = window.innerHeight;
      const docH = document.documentElement.scrollHeight;
      // Asked for per frame, not closed over: a phone has one row of chrome
      // and a desktop may have two, and this listener is already subscribed to
      // resize, so reading it here is what makes crossing the breakpoint free.
      const { atTopThreshold } = chrome.metrics();
      // Both overrides go through the lock. Without that, a pick made while
      // the reader is still at the top of the page would be overruled by the
      // Info rule on the very next frame of its own smooth scroll.
      if (y <= atTopThreshold) {
        isAtExtremeRef.current = 'top';
        setActiveIdState(lock.resolve(INFO_ID));
      } else if (y + winH >= docH - AT_BOTTOM_THRESHOLD) {
        isAtExtremeRef.current = 'bottom';
        // Favorites is the last item only when the feature is enabled.
        // Otherwise let the section-scan pick whatever section is
        // closest to the bottom.
        if (favoritesEnabled) setActiveIdState(lock.resolve(FAVORITES_ID));
      } else {
        isAtExtremeRef.current = null;
        // Don't clear activeId here, leave whatever section the scan
        // picked. Only take over when the user genuinely reaches an
        // extreme.
      }
    };
    updateExtremes();
    window.addEventListener('scroll', updateExtremes, { passive: true });
    window.addEventListener('resize', updateExtremes);
    // And once more whenever a pick anywhere on the page stops being held,
    // for the same reason the section scan below watches: the last scroll
    // event of somebody else's smooth scroll is one frame too early for a nav
    // that spent it standing still. See NavSelectionLock.watch.
    const unwatch = lock.watch(updateExtremes);
    return () => {
      window.removeEventListener('scroll', updateExtremes);
      window.removeEventListener('resize', updateExtremes);
      unwatch();
    };
  }, [favoritesEnabled, enabled, lock, chrome]);

  // Active-section tracking via a rAF-throttled scroll listener.
  // Same approach as PortalTopNav: on every scroll frame, pick the
  // item whose element has the largest top value that is still at or
  // above the chrome's activation line (just below whatever is pinned
  // above it). That is the section the reader has most recently
  // scrolled INTO.
  useEffect(() => {
    if (!enabled) return;
    let raf: number | null = null;
    const update = () => {
      raf = null;
      if (isAtExtremeRef.current !== null) return;
      // Live, for the same reason as the extremes scan above.
      const { activationLine } = chrome.metrics();
      let currentId: string | null = null;
      let bestTop = -Infinity;
      items.forEach((item) => {
        // Missing element: a section the favorites filter is hiding.
        const el = document.getElementById(item.id);
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        if (top <= activationLine && top > bestTop) {
          bestTop = top;
          currentId = item.id;
        }
      });
      const next = lock.resolve(currentId);
      if (next) setActiveIdState(next);
    };
    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // The scan's extra look once a pick is let go, see the extremes effect
    // above and NavSelectionLock.watch. It is registered AFTER that one, which
    // is the order they run in, and the same order a scroll frame runs them:
    // extremes first, then this, which stands down when the page is at one.
    const unwatch = lock.watch(update);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      unwatch();
    };
  }, [items, enabled, lock, chrome]);

  const setActiveId = useCallback(
    (id: string) => {
      lock.hold(id);
      setActiveIdState(id);
    },
    [lock],
  );

  return { items, activeId, setActiveId };
}

/**
 * Sticky section-nav strip. A horizontal row of pills directly under the
 * fixed portal header. Each pill scrolls to its section, and the section
 * the reader is inside highlights itself.
 *
 * Renders at every width. Phones used to navigate through a bottom-sheet
 * "Jump" drawer instead, which meant two navigations to keep in step and
 * a sheet that covered the photos it was navigating.
 *
 * The scrolling behaviour is ScrollStrip, the very component the portal's
 * own second nav row uses: centred while the items fit, and when they do
 * not, edge fades plus a tappable chevron on whichever side still has
 * something on it. One implementation, so the gallery strip and the portal
 * strip cannot read differently on the same phone.
 *
 * Chose this over a right-side rail after user testing: the rail ate
 * too much of the photo grid area on desktop. A thin top strip is a
 * much smaller footprint for the same navigation.
 */
interface TopSectionNavProps {
  items: GalleryNavItem[];
  activeId: string | null;
  setActiveId: (id: string) => void;
}

function TopSectionNav({ items, activeId, setActiveId }: TopSectionNavProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pillRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});

  // Whenever the active pill changes, scroll it into view within the
  // horizontal strip so it stays visible even when the item list
  // overflows the viewport. Scrolls the container directly rather
  // than using pill.scrollIntoView(): the latter would move the
  // page vertically when the sticky nav is out of view (block:
  // 'nearest' has an escape hatch to page-scroll when the element
  // isn't reachable within its scroll containers). That was
  // producing the "click Bottom, page springs back up" bounce.
  useEffect(() => {
    if (!activeId) return;
    const pill = pillRefs.current[activeId];
    const container = scrollRef.current;
    if (!pill || !container) return;
    const targetLeft =
      pill.offsetLeft - container.clientWidth / 2 + pill.offsetWidth / 2;
    container.scrollTo({ left: targetLeft, behavior: scrollBehavior() });
  }, [activeId]);

  return (
    <Box
      position="sticky"
      // Sits directly under the fixed portal header, and is exactly
      // PORTAL_NAV_H tall, so the two together end where the two-row
      // chrome says they do. Drawing this row is also what tells every
      // scroll margin in this file that there are two rows to clear.
      top={HEADER_CLEARANCE}
      h={`${PORTAL_NAV_H}px`}
      // Desktop only. On a phone this row is gone, the header's section bar
      // has its job, and portalChrome answers with the header alone
      // accordingly. display:none rather than unmounting, so the hook feeding
      // both stays enabled and there is only ever one scan.
      display={{ base: 'none', md: 'flex' }}
      alignItems="center"
      zIndex={10}
      bg="rgba(255, 255, 255, 0.94)"
      backdropFilter="blur(10px)"
    >
      <Box flex="1" minW={0}>
        {/* Centring, the edge fades and the tappable chevrons all come
            from ScrollStrip, which is what the portal's own nav row uses.
            Its horizontal padding matches the fade exactly, so the first
            and last pills never sit underneath the gradient on a narrow
            phone. */}
        <ScrollStrip scrollRef={scrollRef}>
          {items.map((item, i) => (
            <Fragment key={item.id}>
              {/* Divider wherever the kind changes, so Info and
                  Favorites read as page-level next to the
                  section-level items between them. */}
              {i > 0 && items[i - 1].kind !== item.kind && <NavStripDivider />}
              <NavPill
                pillRef={(el) => {
                  pillRefs.current[item.id] = el;
                }}
                icon={item.icon}
                label={item.label}
                active={activeId === item.id}
                disabled={item.disabled}
                onClick={() => {
                  // The tap is the answer: this lights the pill up at
                  // once AND holds the scroll scan off it until the
                  // scroll lands, so the sections the page travels
                  // through do not each take a turn in the highlight.
                  setActiveId(item.id);
                  item.scrollTo();
                }}
              />
            </Fragment>
          ))}
        </ScrollStrip>
      </Box>
    </Box>
  );
}

// A single pill in the top nav strip. Handles active-vs-inactive
// styling and, for the Info and Favorites bookends, a small icon
// alongside the word. The word is always there, the icon never
// replaces it.
function NavPill({
  pillRef,
  icon,
  label,
  active,
  disabled = false,
  onClick,
}: {
  pillRef: (el: HTMLDivElement | null) => void;
  icon?: typeof FaChevronUp;
  label: string;
  active: boolean;
  // When true, pill renders greyed + non-interactive. Used by
  // section pills when the favorites filter is on and the section
  // has zero favorited photos, so users see clearly which sections
  // still have content in the filtered view.
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      ref={pillRef}
      as="button"
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-current={active ? 'true' : undefined}
      flexShrink={0}
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      gap={1.5}
      px={{ base: 4, md: 5 }}
      py={2}
      // Thumb-sized on phones, where this strip is now the only way to
      // move between sections. Still inside the PORTAL_NAV_H band.
      minH={{ base: '44px', md: 'auto' }}
      fontSize="2xs"
      fontWeight="500"
      letterSpacing="0.2em"
      textTransform="uppercase"
      color={disabled ? 'gray.300' : active ? 'white' : 'gray.700'}
      bg={active && !disabled ? 'brand.accent' : 'transparent'}
      border="1px solid"
      borderColor={disabled ? 'gray.200' : active ? 'brand.accent' : 'gray.200'}
      borderRadius="full"
      transition="all 0.25s ease"
      cursor={disabled ? 'not-allowed' : 'pointer'}
      opacity={disabled ? 0.5 : 1}
      _hover={
        disabled
          ? {}
          : active
          ? { bg: 'brand.accentStrong', borderColor: 'brand.accentStrong' }
          : {
              borderColor: 'brand.accent',
              color: 'brand.accent',
              bg: 'rgba(201, 169, 110, 0.06)',
            }
      }
      sx={{
        WebkitTapHighlightColor: 'transparent',
        '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
      }}
    >
      {icon && <Icon as={icon} boxSize={2.5} />}
      <Box as="span">{label}</Box>
    </Box>
  );
}

// Slim vertical divider between the Top/Bottom pills and the section
// pills, so they read as "page-level" vs "section-level" controls.
function NavStripDivider() {
  return <Box w="1px" h="20px" bg="gray.200" flexShrink={0} mx={1} />;
}

/**
 * Share section for gallery-only access (the /portal/pass route).
 * Three paths: copy the one-click URL, copy just the password, or have
 * us email an invite. The email path is rate-limited server-side at
 * 5/24h per gallery — same limit the full-portal share uses — so
 * "anyone with the password can share" doesn't turn into a spam
 * vector.
 */
function GalleryShareSection({ galleryPassword }: { galleryPassword: string }) {
  const directUrl =
    (typeof window !== 'undefined' ? window.location.origin : 'https://vero.photography') +
    `/portal/pass?password=${encodeURIComponent(galleryPassword)}`;

  const [urlCopied, setUrlCopied] = useState(false);
  const [pwCopied, setPwCopied] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<
    { kind: 'ok' | 'err'; text: string } | null
  >(null);
  const [remainingToday, setRemainingToday] = useState<number | null>(null);

  const copy = async (text: string, set: (b: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      set(true);
      setTimeout(() => set(false), 2000);
    } catch {
      // Fallback: nothing. Users can long-press the visible string.
    }
  };

  const sendInvite = async () => {
    setInviteMessage(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim())) {
      setInviteMessage({ kind: 'err', text: 'Enter a valid email address.' });
      return;
    }
    setInviteSending(true);
    try {
      const res = await fetch('/api/portal/share-gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gallery_password: galleryPassword,
          target_email: inviteEmail.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setInviteMessage({ kind: 'ok', text: `Invite sent to ${inviteEmail.trim()}.` });
        setInviteEmail('');
        if (typeof data.remaining_today === 'number') {
          setRemainingToday(data.remaining_today);
        }
      } else {
        setInviteMessage({ kind: 'err', text: data.error || `Could not send (status ${res.status}).` });
      }
    } catch {
      setInviteMessage({ kind: 'err', text: 'Could not reach the server.' });
    } finally {
      setInviteSending(false);
    }
  };

  return (
    <Box bg="white" borderTop="1px solid" borderColor="gray.100" py={12} px={6}>
      <VStack maxW="520px" mx="auto" spacing={6}>
        <VStack spacing={2}>
          <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="brand.accentText">
            Share these photos
          </Text>
          <Box w="30px" h="1px" bg="brand.accent" />
        </VStack>

        <Text fontSize="sm" color="gray.600" fontWeight="300" textAlign="center" lineHeight="1.7">
          Want to share these with family or friends? Anyone with the link below can view the gallery, no account needed.
        </Text>

        {/* One-click link — HERO action. The primary way we want people
            to share; big centered "Copy Link" button with the URL as
            a visible-but-secondary preview underneath. Password + email
            paths still exist below as clearly-labeled alternatives, but
            visually demoted so nobody wonders which to pick. */}
        <Box
          w="100%"
          bg="brand.surface"
          border="1px solid"
          borderColor="brand.accentBorder"
          borderRadius="md"
          px={{ base: 5, md: 7 }}
          py={{ base: 6, md: 7 }}
          textAlign="center"
        >
          <Text
            fontSize="2xs"
            fontWeight="500"
            textTransform="uppercase"
            letterSpacing="0.25em"
            color="brand.accentText"
            mb={4}
          >
            Easiest: one-click link
          </Text>
          <CTAButton
            onClick={() => copy(directUrl, setUrlCopied)}
            icon={urlCopied ? FaCheck : FaCopy}
            variant="solid"
            size="md"
            fullWidth
          >
            {urlCopied ? 'Link Copied!' : 'Copy Link'}
          </CTAButton>
          <Text
            mt={4}
            fontSize="xs"
            color="gray.500"
            fontWeight="300"
            fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
            noOfLines={1}
            wordBreak="break-all"
          >
            {directUrl}
          </Text>
          <Text mt={2} fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.6">
            Paste anywhere: text, email, WhatsApp. Opens the gallery instantly, no password to type.
          </Text>
        </Box>

        {/* Secondary paths — visually demoted so they read as "in case
            you need it," not as equal alternatives. Email above manual
            password because "send them the link" is a much more common
            path than "read a password to someone over the phone." */}
        <Box w="100%" pt={2}>
          <Flex align="center" gap={3} mb={5}>
            <Box flex={1} h="1px" bg="gray.200" />
            <Text
              fontSize="2xs"
              fontWeight="500"
              textTransform="uppercase"
              letterSpacing="0.2em"
              color="gray.400"
              whiteSpace="nowrap"
            >
              Or, more ways
            </Text>
            <Box flex={1} h="1px" bg="gray.200" />
          </Flex>

          {/* Email invite */}
          <VStack w="100%" spacing={2} align="stretch" mb={6}>
            <Text fontSize="xs" color="gray.500" fontWeight="400" lineHeight="1.6">
              Have us email the one-click link:
            </Text>
            <Flex gap={2} direction={{ base: 'column', sm: 'row' }}>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="friend@example.com"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                h="40px"
                bg="white"
                fontSize="sm"
                _focus={{ borderColor: 'brand.accent', boxShadow: '0 0 0 1px #c9a96e' }}
              />
              <CTAButton
                onClick={sendInvite}
                variant="outline"
                size="sm"
                isLoading={inviteSending}
                loadingText="Sending..."
              >
                Send Invite
              </CTAButton>
            </Flex>
            <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.5">
              Up to 5 invites per 24-hour period so nothing gets spammy.
              {remainingToday !== null && (
                <> ({remainingToday} left today.)</>
              )}
            </Text>
            {inviteMessage && (
              <Text
                fontSize="xs"
                fontWeight="400"
                color={inviteMessage.kind === 'err' ? 'red.500' : 'green.600'}
              >
                {inviteMessage.text}
              </Text>
            )}
          </VStack>

          {/* Plain password fallback — last, least-common path (used
              when someone can't click the link but can type a password
              read aloud over a call). */}
          <VStack w="100%" spacing={2} align="stretch">
            <Text fontSize="xs" color="gray.500" fontWeight="400" lineHeight="1.6">
              Or go to <Text as="span" fontWeight="500" color="gray.700">vero.photography/portal/pass</Text> and enter this password:
            </Text>
            <Flex
              align="center"
              gap={2}
              bg="gray.50"
              border="1px solid"
              borderColor="gray.200"
              borderRadius="sm"
              px={3}
              py={2}
            >
              <Text
                fontSize="sm"
                color="gray.800"
                fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
                fontWeight="500"
                flex="1"
                minW={0}
                textAlign="left"
                letterSpacing="0.05em"
              >
                {galleryPassword}
              </Text>
              <Box
                as="button"
                type="button"
                onClick={() => copy(galleryPassword, setPwCopied)}
                aria-label="Copy password"
                p={1.5}
                borderRadius="sm"
                color="gray.500"
                cursor="pointer"
                _hover={{ color: 'brand.accent', bg: 'gray.100' }}
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Icon as={pwCopied ? FaCheck : FaCopy} boxSize={3} />
              </Box>
            </Flex>
          </VStack>
        </Box>
      </VStack>
    </Box>
  );
}

export default ClientGallery;
