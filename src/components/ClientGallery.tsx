import {
  Box,
  Flex,
  Text,
  VStack,
  Image,
  Icon,
  Input,
  SimpleGrid,
  Drawer,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerBody,
  DrawerCloseButton,
  useDisclosure,
} from '@chakra-ui/react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { FaDownload, FaExternalLinkAlt, FaPlay, FaImage, FaGoogle, FaCopy, FaCheck, FaStar, FaShareAlt, FaChevronUp, FaChevronDown, FaChevronLeft, FaChevronRight, FaListUl, FaHeart, FaRegHeart } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import ImageModal from './ImageModal';

// Same URL used by the homepage GoogleReviewsSection — single source of
// truth would be nicer, but keeping the duplication local rather than
// dragging the whole reviews section's data along.
const GOOGLE_WRITE_REVIEW_URL = 'https://g.page/r/CSNq8ccyWt_wEAE/review';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
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
  // Favorites — when both are provided, the heart UI is enabled on
  // every tile + inside the modal, and a filter chip appears above
  // the grid. Only wired up for full-portal users (guests on
  // /portal/pass leave these undefined, which disables the whole
  // feature — guests have no persistent identity to attach favorites
  // to). See ClientPortalView for the API call + optimistic update.
  favorites?: string[];
  onToggleFavorite?: (photoId: string, currentlyFavorite: boolean) => void;
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
const GridTile = ({ file, index, onSelect, setRef, isFavorite, onToggleFavorite }: GridTileProps) => {
  const [thumbFailed, setThumbFailed] = useState(false);
  const isVideo = file.mimeType.startsWith('video/');
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
                color="#c9a96e"
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
              src={file.thumbnailUrl}
              alt={file.name}
              onError={() => setThumbFailed(true)}
              position="absolute"
              inset={0}
              w="100%"
              h="100%"
              objectFit="cover"
              loading="lazy"
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
        _hover={{ bg: '#c9a96e' }}
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
  favorites,
  onToggleFavorite,
}: ClientGalleryProps) => {
  const favoritesEnabled = Boolean(onToggleFavorite);
  const favoritesSet = new Set(favorites ?? []);
  const favoritesCount = favoritesSet.size;

  // "Show only favorites" filter — client-side toggle above the grid.
  // When on, we filter rootFiles + each section's files down to just
  // hearted photos. Sections with zero favorites drop out entirely so
  // the section headers don't leave "empty section" boxes.
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

  // Flatten everything into one ordered array. The lightbox navigates by
  // index into this array, so prev/next walks across all sections in
  // delivery order. Section headers are purely visual — they don't gate
  // navigation. This matches photographer-platform convention (Pixieset,
  // ShootProof) where you scroll through the full set seamlessly.
  //
  // When the favorites filter is active, we walk the FILTERED array so
  // arrow-key nav in the modal stays within favorites too.
  const allFiles = [...displayRootFiles, ...displaySections.flatMap((s) => s.files)];
  const totalCount = allFiles.length;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Refs per thumbnail (indexed against the flat allFiles array) so
  // ImageModal can animate open from the clicked thumbnail's rect.
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Refs per section header so the sticky section-nav can scroll to them.
  // Keyed by section.id since sections can be reordered without remounting.
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [originRect, setOriginRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

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

  const scrollToSection = useCallback((id: string) => {
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
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
    // the photos-section wrapper is gray.50 for alternation. On the
    // standalone /portal/pass route, the html/body theme default
    // (white) shows through. Both look correct without hard-coding.
    <Box ref={galleryRootRef} minH="100vh" pt="72px">
      {/* Header */}
      <Box px={{ base: 4, md: 8 }} py={{ base: 8, md: 12 }} textAlign="center">
        <Text
          fontSize="xs"
          fontWeight="500"
          textTransform="uppercase"
          letterSpacing="0.25em"
          color="#c9a96e"
          mb={3}
        >
          Private Gallery
        </Text>
        <Box w="40px" h="1px" bg="#c9a96e" mx="auto" mb={5} />
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
          <Text fontSize="sm" color="gray.500" fontWeight="300" mt={2}>
            {totalCount} {totalCount === 1 ? 'photo' : 'photos'}
            {sections.length > 0 && (
              <>
                {' · '}
                {sections.length} {sections.length === 1 ? 'section' : 'sections'}
              </>
            )}
          </Text>
        )}

        {/* Save-tips disclaimer — subtle info line, sets expectation for
            the per-photo Save button and points people at the sticky
            Download All widget for print-quality originals. Long-press
            is genuinely the fastest mobile save (uses zero of our
            bandwidth, saves instantly), so we lead with that. */}
        <Text
          mt={5}
          fontSize="xs"
          color="gray.500"
          fontWeight="300"
          lineHeight="1.9"
          maxW="540px"
          mx="auto"
          px={4}
        >
          On phone, <Text as="span" fontWeight="500" color="gray.700">press &amp; hold</Text> any photo to save it instantly. Or use the{' '}
          <Text as="span" fontWeight="500" color="gray.700">Save</Text> button after opening one. For print-quality originals of the whole set, use{' '}
          <Text as="span" fontWeight="500" color="gray.700">Download All</Text> at the bottom of the page.
        </Text>

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
          bg="#fdf9f0"
          border="1px solid"
          borderColor="#e8d9a8"
          borderRadius="md"
          px={{ base: 6, md: 8 }}
          py={{ base: 6, md: 7 }}
          textAlign="center"
        >
          <Flex justify="center" gap={1} mb={4} color="#c9a96e">
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
            <Text as="span" fontStyle="normal" color="gray.600" fontWeight="400">
              {' — Veronika'}
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

      {/* Top sticky section-nav — restored on desktop after trying the
          right-side rail: the rail took up too much of the photo area
          and hid a lot of content. A slim horizontal strip at the top
          is a much smaller footprint. Mobile still has the sticky
          bottom bar's "Jump" drawer, but the top strip appears there
          too as an at-a-glance list.

          Active-section tracking + auto-scroll-into-view + edge fade
          masks all live inside TopSectionNav (defined below). Fade
          masks are the visual cue that there's more when the folder
          list overflows the viewport — the borderBottom is gone since
          it was crowding the first section's header. */}
      {displaySections.length > 1 && (
        <TopSectionNav
          sections={displaySections}
          sectionRefs={sectionRefs}
          onSectionClick={scrollToSection}
          scrollToTop={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          scrollToBottom={() =>
            window.scrollTo({
              top: document.body.scrollHeight,
              behavior: 'smooth',
            })
          }
        />
      )}

      {/* Favorites filter chip — appears above the grid only when
          favorites feature is active. When user has 0 favorites, shows
          a soft hint. When 1+, shows count + toggle to filter. When
          filter is ACTIVE, chip flips to a louder "showing favorites"
          state with an ✕ so users can't lose track that the view is
          filtered. */}
      {favoritesEnabled && (
        <FavoritesChip
          count={favoritesCount}
          filterActive={filterActive}
          onToggleFilter={() => setShowFavoritesOnly((v) => !v)}
        />
      )}

      {/* Grid — renders the filtered set (displayRootFiles /
          displaySections) so the "show favorites only" toggle above
          collapses everything else in one shot. Original `rootFiles`
          / `sections` are still available for count math. */}
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
                ref={(el: HTMLDivElement | null) => {
                  sectionRefs.current[section.id] = el;
                }}
                // Consistent breathing room above every section header —
                // even the first one — now that the sticky top nav bar
                // is gone. (Previously the first section had mt=0 so it
                // could sit tight against that nav bar's bottom edge.)
                mt={{ base: 8, md: 12 }}
                // scroll-margin-top so smooth-scroll lands the section
                // header below the fixed Navbar (72px) + the sticky
                // TopSectionNav strip (~52px on desktop). 140px = the
                // sum plus a bit of breathing room. Mobile doesn't
                // have the top strip so it's slightly excessive there,
                // which is fine — just lands a touch lower, no bug.
                sx={{ scrollMarginTop: '140px' }}
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
                    color="#c9a96e"
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
                  <Box w="30px" h="1px" bg="#c9a96e" mx="auto" mb={1.5} />
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
        </Box>
      ) : filterActive ? (
        /* Filter is on but somehow there are 0 results (edge case, only
           if favorites list got out of sync with the gallery). Give
           the user a way back to the unfiltered view. */
        <Box textAlign="center" py={20} px={6}>
          <Text color="gray.500" fontWeight="300" mb={4}>
            No favorites in the current view.
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
            Photo previews aren't loading — but your gallery is ready.
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
          // Scroll offset accounts for the fixed Navbar (72px) plus,
          // on desktop, the sticky section nav (~52px). Without this,
          // smooth-scroll from the sticky Share button lands the
          // section under those bars and clips its header + intro.
          sx={{ scrollMarginTop: { base: '90px', md: '140px' } }}
        >
          <GalleryShareSection galleryPassword={galleryPassword} />
        </Box>
      )}

      {/* Sticky bottom action bar. Auto-hides while the photo modal is
          open (selectedIndex non-null) so it doesn't float over the
          modal's controls. Also hides when the gallery is scrolled out
          of view — matters in the full portal, where without this the
          bar would linger over the contract / balance / password
          sections and look out of context. Desktop no longer has a
          right-side rail timeline — the top sticky section nav (above)
          is the desktop navigation. Mobile still gets the "Jump"
          drawer via this bar. */}
      {selectedIndex === null && totalCount > 0 && isGalleryVisible && (
        <GalleryActionBar
          driveUrl={driveUrl}
          sections={sections}
          hasSections={sections.length > 0}
          scrollToSection={scrollToSection}
          scrollToTop={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          scrollToBottom={() =>
            window.scrollTo({
              top: document.body.scrollHeight,
              behavior: 'smooth',
            })
          }
        />
      )}
    </Box>
  );
};

/**
 * Sticky bottom action bar. Always visible while the user is browsing the
 * gallery grid (auto-hides when the photo modal opens — see caller).
 * Contains the two things clients most often reach for:
 *   1. Download All → opens the Drive folder for the full-quality set
 *   2. Share → smooth-scrolls to the share section (present on both
 *      /portal/pass and inside ClientPortalView via #gallery-share-section)
 * On mobile, a third "Jump to" button appears when there are sections,
 * opening a bottom-sheet drawer of the section list — the mobile
 * equivalent of the desktop right-rail timeline (which is too narrow
 * to work well on phone screens).
 */
interface GalleryActionBarProps {
  driveUrl: string;
  sections: FolderSection[];
  hasSections: boolean;
  scrollToSection: (id: string) => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

function GalleryActionBar({
  driveUrl,
  sections,
  hasSections,
  scrollToSection,
  scrollToTop,
  scrollToBottom,
}: GalleryActionBarProps) {
  const jumpDrawer = useDisclosure();

  const handleShareClick = useCallback(() => {
    // The share target has id="gallery-share-section" on both routes:
    // /portal/pass → GalleryShareSection below; full-portal →
    // ClientPortalView Gallery Pass section. Fall back to scrolling to
    // the very bottom of the page if neither is present (defensive).
    const el = document.getElementById('gallery-share-section');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    }
  }, []);

  const jumpAndClose = useCallback(
    (fn: () => void) => {
      fn();
      jumpDrawer.onClose();
    },
    [jumpDrawer],
  );

  return (
    <>
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
          <ActionBarButton
            href={driveUrl}
            newTab
            icon={FaDownload}
            label="Download All"
          />
          <ActionBarDivider />
          <ActionBarButton
            onClick={handleShareClick}
            icon={FaShareAlt}
            label="Share"
          />
          {hasSections && (
            <>
              <ActionBarDivider display={{ base: 'block', md: 'none' }} />
              <ActionBarButton
                onClick={jumpDrawer.onOpen}
                icon={FaListUl}
                label="Jump"
                display={{ base: 'inline-flex', md: 'none' }}
              />
            </>
          )}
        </Flex>
      </Box>

      {/* Mobile-only jump drawer. Section list + Top/Bottom.
          Desktop uses the right-rail timeline instead. */}
      <Drawer
        isOpen={jumpDrawer.isOpen}
        onClose={jumpDrawer.onClose}
        placement="bottom"
        size="sm"
      >
        <DrawerOverlay bg="blackAlpha.500" />
        <DrawerContent
          borderTopRadius="xl"
          maxH="70vh"
          bg="white"
        >
          <DrawerCloseButton mt={1} />
          <DrawerHeader
            fontSize="sm"
            fontWeight="500"
            letterSpacing="0.15em"
            textTransform="uppercase"
            color="#c9a96e"
            borderBottom="1px solid"
            borderColor="gray.100"
          >
            Jump to
          </DrawerHeader>
          <DrawerBody py={2} px={0}>
            <VStack align="stretch" spacing={0}>
              <DrawerRow
                label="Top"
                icon={FaChevronUp}
                onClick={() => jumpAndClose(scrollToTop)}
              />
              {sections.map((s) => (
                <DrawerRow
                  key={s.id}
                  label={s.name}
                  onClick={() => jumpAndClose(() => scrollToSection(s.id))}
                />
              ))}
              <DrawerRow
                label="Bottom"
                icon={FaChevronDown}
                onClick={() => jumpAndClose(scrollToBottom)}
              />
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}

interface ActionBarButtonProps {
  href?: string;
  newTab?: boolean;
  onClick?: () => void;
  icon: typeof FaDownload;
  label: string;
  display?: any;
}

function ActionBarButton({ href, newTab, onClick, icon, label, display }: ActionBarButtonProps) {
  const common = {
    display: display ?? 'inline-flex',
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
    _hover: { color: '#c9a96e', bg: 'rgba(201, 169, 110, 0.08)' },
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

function ActionBarDivider({ display }: { display?: any }) {
  return (
    <Box
      w="1px"
      h="18px"
      bg="rgba(201, 169, 110, 0.35)"
      display={display ?? 'block'}
      flexShrink={0}
    />
  );
}

function DrawerRow({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon?: typeof FaChevronUp;
  onClick: () => void;
}) {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      w="100%"
      textAlign="left"
      px={6}
      py={4}
      fontSize="sm"
      fontWeight="400"
      color="gray.800"
      bg="transparent"
      border="none"
      borderBottom="1px solid"
      borderColor="gray.100"
      cursor="pointer"
      display="flex"
      alignItems="center"
      gap={3}
      transition="background 0.15s"
      _hover={{ bg: 'gray.50' }}
      _active={{ bg: 'gray.100' }}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      {icon && <Icon as={icon} boxSize={3} color="gray.400" />}
      <Box as="span">{label}</Box>
    </Box>
  );
}

/**
 * Favorites filter chip. Sits above the gallery grid. Three states:
 *   - No favorites yet: soft hint "Tap ♥ on any photo to save it here."
 *   - Some favorites, filter OFF: shows "12 favorites · Show favorites only"
 *     as a subtle chip.
 *   - Filter ON: chip flips to loud gold-tinted "Showing 12 favorites · ✕"
 *     that's impossible to miss, so users can't get "stuck" in a filtered
 *     view thinking the gallery has fewer photos.
 *
 * Rendered only when favorites feature is enabled (full-portal users).
 */
function FavoritesChip({
  count,
  filterActive,
  onToggleFilter,
}: {
  count: number;
  filterActive: boolean;
  onToggleFilter: () => void;
}) {
  // Zero-favorite state — soft hint, no toggle to activate.
  if (count === 0 && !filterActive) {
    return (
      <Flex justify="center" px={4} pb={4}>
        <Flex
          align="center"
          gap={2}
          px={4}
          py={2}
          bg="gray.50"
          border="1px solid"
          borderColor="gray.200"
          borderRadius="full"
          fontSize="xs"
          color="gray.500"
          fontWeight="300"
        >
          <Icon as={FaRegHeart} boxSize={3} />
          <Box as="span">Tap the ♥ on any photo to save it as a favorite.</Box>
        </Flex>
      </Flex>
    );
  }

  return (
    <Flex justify="center" px={4} pb={4}>
      <Flex
        as="button"
        type="button"
        onClick={onToggleFilter}
        align="center"
        gap={2}
        px={4}
        py={2}
        bg={filterActive ? '#fdf9f0' : 'transparent'}
        border="1px solid"
        borderColor={filterActive ? '#c9a96e' : 'gray.200'}
        borderRadius="full"
        fontSize="xs"
        fontWeight="500"
        letterSpacing="0.05em"
        color={filterActive ? '#8a6e35' : 'gray.700'}
        cursor="pointer"
        transition="all 0.2s"
        _hover={{
          borderColor: '#c9a96e',
          color: '#8a6e35',
          bg: '#fdf9f0',
        }}
        sx={{ WebkitTapHighlightColor: 'transparent' }}
      >
        <Icon as={FaHeart} boxSize={3} color={filterActive ? '#ff4c68' : '#c9a96e'} />
        <Box as="span">
          {filterActive
            ? `Showing ${count} ${count === 1 ? 'favorite' : 'favorites'}`
            : `${count} ${count === 1 ? 'favorite' : 'favorites'} · Show only these`}
        </Box>
        {filterActive && (
          <Box as="span" ml={1} fontSize="sm" opacity={0.7}>
            ✕
          </Box>
        )}
      </Flex>
    </Flex>
  );
}

/**
 * Sticky top section-nav bar. Horizontal strip of pill buttons under the
 * fixed Navbar (top: 72px). Each pill scrolls to its section on click,
 * and the currently-visible section auto-highlights via
 * IntersectionObserver. If the pill list overflows the viewport width
 * (long section names or lots of them), we fade the edges as a scroll-
 * ability cue and auto-scroll the active pill into view when the user
 * scrolls the page to it.
 *
 * Chose this over a right-side rail after user testing: the rail ate
 * too much of the photo grid area on desktop. A thin top strip is a
 * much smaller footprint for the same navigation.
 */
interface TopSectionNavProps {
  sections: FolderSection[];
  sectionRefs: React.MutableRefObject<{ [id: string]: HTMLDivElement | null }>;
  onSectionClick: (id: string) => void;
  scrollToTop: () => void;
  scrollToBottom: () => void;
}

// Sentinel activeId values for the Top and Bottom pills. Kept as string
// literals (not enum) so they can share the same activeId state as
// section IDs and be referenced from pillRefs by the same key.
const TOP_ID = '__top__';
const BOTTOM_ID = '__bottom__';

// Distance from the top/bottom of the page where we consider the user
// to have "arrived" there. Top threshold has to be larger than the
// scrollMarginTop for section headers (~92px) + the sticky nav's height,
// otherwise the very first section immediately steals the highlight
// the moment the user starts scrolling down from a fresh page load.
const AT_TOP_THRESHOLD = 200;
const AT_BOTTOM_THRESHOLD = 80;

function TopSectionNav({
  sections,
  sectionRefs,
  onSectionClick,
  scrollToTop,
  scrollToBottom,
}: TopSectionNavProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pillRefs = useRef<{ [id: string]: HTMLDivElement | null }>({});

  // Overflow indicators — same pattern as PortalTopNav. Tappable
  // chevrons on each side, visible only when there's content to
  // scroll to that side. Combined with the fade masks below, makes
  // horizontal scrollability obvious on galleries with many or
  // long section names.
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setCanScrollLeft(el.scrollLeft > 4);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [sections]);
  const scrollBy = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  // Bookkeeping ref that mirrors scroll position, used inside the
  // IntersectionObserver callback to know whether to defer to
  // Top/Bottom rather than picking a section. A ref (not state) so
  // the observer callback always sees the freshest value without
  // needing to re-subscribe on every scroll tick.
  const isAtExtremeRef = useRef<null | 'top' | 'bottom'>(null);

  // Watch scroll position for the "am I at the top / bottom of the
  // page?" cases. Those override the section observation because when
  // the user explicitly clicks Top/Bottom (or scrolls all the way
  // there), we want the corresponding pill to light up — not the
  // nearest section, which is what happened with the old right-rail.
  useEffect(() => {
    const updateExtremes = () => {
      const y = window.scrollY;
      const winH = window.innerHeight;
      const docH = document.documentElement.scrollHeight;
      if (y <= AT_TOP_THRESHOLD) {
        isAtExtremeRef.current = 'top';
        setActiveId(TOP_ID);
      } else if (y + winH >= docH - AT_BOTTOM_THRESHOLD) {
        isAtExtremeRef.current = 'bottom';
        setActiveId(BOTTOM_ID);
      } else {
        isAtExtremeRef.current = null;
        // Don't clear activeId here — leave whatever section the
        // observer picked. Only take over when the user genuinely
        // reaches an extreme.
      }
    };
    updateExtremes();
    window.addEventListener('scroll', updateExtremes, { passive: true });
    window.addEventListener('resize', updateExtremes);
    return () => {
      window.removeEventListener('scroll', updateExtremes);
      window.removeEventListener('resize', updateExtremes);
    };
  }, []);

  // Active-section tracking via a rAF-throttled scroll listener.
  // Same approach as PortalTopNav: on every scroll frame, pick the
  // section with the largest top value that's still ≤ 150 (just
  // below the sticky nav bottom). That's the section the user has
  // most recently scrolled INTO. Skips entirely when the user is
  // at a page extreme so Top/Bottom stays highlighted there.
  //
  // Replaces the previous IntersectionObserver approach which fired
  // on threshold changes and could miss transitions — was the cause
  // of "click Photos, Share lights up" and "scroll up, skip Contract"
  // symptoms in the portal, and slightly wonky Password highlighting.
  useEffect(() => {
    const ACTIVATION_LINE = 150;
    let raf: number | null = null;
    const update = () => {
      raf = null;
      if (isAtExtremeRef.current !== null) return;
      let currentId: string | null = null;
      let bestTop = -Infinity;
      const refs = sectionRefs.current;
      Object.entries(refs).forEach(([id, el]) => {
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        if (top <= ACTIVATION_LINE && top > bestTop) {
          bestTop = top;
          currentId = id;
        }
      });
      if (currentId) setActiveId(currentId);
    };
    const onScroll = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [sections, sectionRefs]);

  // Whenever the active pill changes, scroll it into view within the
  // horizontal strip so it stays visible even when the section list
  // overflows the viewport. `inline: 'center'` keeps it roughly
  // centered; `block: 'nearest'` prevents the strip from moving the
  // whole page vertically.
  useEffect(() => {
    if (!activeId) return;
    const pill = pillRefs.current[activeId];
    if (pill && 'scrollIntoView' in pill) {
      pill.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [activeId]);

  return (
    <Box
      // Desktop-only. Mobile navigates via the sticky bottom bar's
      // "Jump" drawer instead — the top strip's horizontal scroll is
      // less nice on phone screens than a full-height bottom-sheet
      // list, and we don't need both.
      display={{ base: 'none', md: 'block' }}
      position="sticky"
      top="72px"
      zIndex={10}
      bg="rgba(255, 255, 255, 0.94)"
      backdropFilter="blur(10px)"
      py={3}
    >
      <Box position="relative">
        {/* Overflow indicators — subtle tappable chevrons that appear
            on whichever side has more content to scroll to. Combined
            with the wider (44px) fade masks below, makes the strip
            readably scrollable on narrow phones + long section-name
            lists. */}
        <ScrollChevron
          direction="left"
          visible={canScrollLeft}
          onClick={() => scrollBy(-200)}
        />
        <ScrollChevron
          direction="right"
          visible={canScrollRight}
          onClick={() => scrollBy(200)}
        />
        <Box
          ref={scrollRef}
          overflowX="auto"
          sx={{
            maskImage:
              'linear-gradient(90deg, transparent 0, black 44px, black calc(100% - 44px), transparent 100%)',
            WebkitMaskImage:
              'linear-gradient(90deg, transparent 0, black 44px, black calc(100% - 44px), transparent 100%)',
            '&::-webkit-scrollbar': { display: 'none' },
            scrollbarWidth: 'none',
          }}
        >
          <Flex
            gap={2}
            // Generous horizontal padding so first/last pills sit within
            // the "solid" (unfaded) part of the mask and never look cut
            // off. Also centers the pill list on wide screens when the
            // content is narrower than the viewport.
            px={12}
            justify="center"
            minW="max-content"
            align="center"
        >
          <NavPill
            pillRef={(el) => {
              pillRefs.current[TOP_ID] = el;
            }}
            icon={FaChevronUp}
            label="Top"
            active={activeId === TOP_ID}
            onClick={scrollToTop}
          />
          <NavStripDivider />
          {sections.map((section) => (
            <NavPill
              key={section.id}
              pillRef={(el) => {
                pillRefs.current[section.id] = el;
              }}
              label={section.name}
              active={activeId === section.id}
              onClick={() => {
                // Optimistic highlight: flip active immediately so the
                // pill lights up on tap even before smooth-scroll +
                // IntersectionObserver settle. The observer will
                // correct any drift as the scroll lands.
                setActiveId(section.id);
                onSectionClick(section.id);
              }}
            />
          ))}
          <NavStripDivider />
          <NavPill
            pillRef={(el) => {
              pillRefs.current[BOTTOM_ID] = el;
            }}
            icon={FaChevronDown}
            label="Bottom"
            active={activeId === BOTTOM_ID}
            onClick={scrollToBottom}
          />
          </Flex>
        </Box>
      </Box>
    </Box>
  );
}

// Overflow scroll indicator. Shown on horizontal scroll strips
// (TopSectionNav, PortalTopNav in ClientPortalView) only when the
// content overflows in the given direction. Tap-to-scroll for
// accessibility (200px per tap ≈ one pill on any screen).
function ScrollChevron({
  direction,
  visible,
  onClick,
}: {
  direction: 'left' | 'right';
  visible: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      aria-label={direction === 'left' ? 'Scroll left' : 'Scroll right'}
      position="absolute"
      top="50%"
      transform="translateY(-50%)"
      {...(direction === 'left' ? { left: 1 } : { right: 1 })}
      zIndex={2}
      display="flex"
      alignItems="center"
      justifyContent="center"
      w="28px"
      h="28px"
      borderRadius="full"
      bg="rgba(255, 255, 255, 0.9)"
      backdropFilter="blur(6px)"
      color="#c9a96e"
      border="1px solid"
      borderColor="rgba(201, 169, 110, 0.35)"
      boxShadow="0 2px 6px rgba(0, 0, 0, 0.08)"
      cursor="pointer"
      transition="all 0.2s"
      _hover={{
        bg: '#c9a96e',
        color: 'white',
        borderColor: '#c9a96e',
      }}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Icon as={direction === 'left' ? FaChevronLeft : FaChevronRight} boxSize={2.5} />
    </Box>
  );
}

// A single pill in the top nav strip. Handles active-vs-inactive
// styling and (optionally) leading icon for the Top/Bottom pills.
function NavPill({
  pillRef,
  icon,
  label,
  active,
  onClick,
}: {
  pillRef: (el: HTMLDivElement | null) => void;
  icon?: typeof FaChevronUp;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      ref={pillRef}
      as="button"
      type="button"
      onClick={onClick}
      flexShrink={0}
      display="inline-flex"
      alignItems="center"
      gap={1.5}
      px={{ base: 4, md: 5 }}
      py={2}
      fontSize="2xs"
      fontWeight="500"
      letterSpacing="0.2em"
      textTransform="uppercase"
      color={active ? 'white' : 'gray.700'}
      bg={active ? '#c9a96e' : 'transparent'}
      border="1px solid"
      borderColor={active ? '#c9a96e' : 'gray.200'}
      borderRadius="full"
      transition="all 0.25s ease"
      cursor="pointer"
      _hover={
        active
          ? { bg: '#b8964f', borderColor: '#b8964f' }
          : {
              borderColor: '#c9a96e',
              color: '#c9a96e',
              bg: 'rgba(201, 169, 110, 0.06)',
            }
      }
      sx={{ WebkitTapHighlightColor: 'transparent' }}
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
          <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.25em" color="#c9a96e">
            Share these photos
          </Text>
          <Box w="30px" h="1px" bg="#c9a96e" />
        </VStack>

        <Text fontSize="sm" color="gray.600" fontWeight="300" textAlign="center" lineHeight="1.7">
          Want to share these with family or friends? Anyone with the link below can view the gallery — no account needed.
        </Text>

        {/* One-click link — HERO action. The primary way we want people
            to share; big centered "Copy Link" button with the URL as
            a visible-but-secondary preview underneath. Password + email
            paths still exist below as clearly-labeled alternatives, but
            visually demoted so nobody wonders which to pick. */}
        <Box
          w="100%"
          bg="#fdf9f0"
          border="1px solid"
          borderColor="#e8d9a8"
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
            color="#c9a96e"
            mb={4}
          >
            Easiest — one-click link
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
            Paste anywhere — text, email, WhatsApp. Opens the gallery instantly, no password to type.
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
                _focus={{ borderColor: '#c9a96e', boxShadow: '0 0 0 1px #c9a96e' }}
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
                _hover={{ color: '#c9a96e', bg: 'gray.100' }}
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
