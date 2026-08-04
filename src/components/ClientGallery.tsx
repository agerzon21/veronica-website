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
import { FaDownload, FaExternalLinkAlt, FaPlay, FaImage, FaGoogle, FaCopy, FaCheck, FaStar, FaShareAlt, FaChevronUp, FaChevronLeft, FaChevronRight, FaListUl, FaHeart, FaRegHeart, FaMobileAlt, FaInfoCircle, FaClock, FaEye, FaEyeSlash } from 'react-icons/fa';
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
  expiresAt,
  favorites,
  onToggleFavorite,
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
    // the photos-section wrapper is white for alternation. On the
    // standalone /portal/pass route, Portal.tsx wraps ClientGallery
    // in a Box with the necessary Navbar clearance so both routes
    // reach here without double-padding.
    <Box ref={galleryRootRef} minH="100vh">
      {/* Top nav MOVED ABOVE the header so it mirrors the portal-level
          nav (which also sits above the portal header). Desktop-only
          (mobile navigates via the sticky bottom bar's Jump drawer).
          Renders whenever we have >1 section OR the favorites feature
          is on (Info + Favorites are useful even without multiple
          sections). */}
      {(sections.length > 1 || favoritesEnabled) && (
        <TopSectionNav
          sections={sections}
          sectionRefs={sectionRefs}
          onSectionClick={scrollToSection}
          sectionsWithFavorites={sectionsWithFavorites}
          filterActive={filterActive}
          scrollToInfo={() => {
            const el = document.getElementById('gallery-info-section');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          scrollToFavorites={
            favoritesEnabled
              ? () => {
                  const el = document.getElementById('gallery-favorites-section');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  else
                    window.scrollTo({
                      top: document.body.scrollHeight,
                      behavior: 'smooth',
                    });
                }
              : null
          }
        />
      )}

      {/* Header — id lets the Info pill in the top nav scroll back
          here. All the top-of-gallery orientation lives inside: title,
          count (with favorite total in parens), expiration ribbon,
          save-tips card. Padding matches other portal sections
          (was thicker before; Alex correctly flagged it as visually
          heavier than its neighbors). scrollMarginTop accounts for
          the fixed site Navbar (72px) + sticky TopSectionNav
          (~52px on desktop). */}
      <Box
        id="gallery-info-section"
        sx={{ scrollMarginTop: { base: '90px', md: '140px' } }}
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
          // Count line — always reports the TOTAL number of photos.
          // When favorites are enabled and non-zero, tacks on the
          // hearted count in parens so clients see at a glance how
          // many they've picked out. Sections count follows as a
          // secondary bullet.
          <Text fontSize="sm" color="gray.500" fontWeight="300" mt={2}>
            {totalCount} {totalCount === 1 ? 'photo' : 'photos'}
            {favoritesEnabled && favoritesCount > 0 && (
              <Text as="span" color="#c9a96e" fontWeight="400">
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
          bg="#fdf9f0"
          border="1px solid"
          borderColor="#e8d9a8"
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
            color="#c9a96e"
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
          favoritesEnabled={favoritesEnabled}
          scrollToInfo={() => {
            const el = document.getElementById('gallery-info-section');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          scrollToFavorites={() => {
            const el = document.getElementById('gallery-favorites-section');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            else window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
          }}
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
  favoritesEnabled: boolean;
  scrollToInfo: () => void;
  scrollToFavorites: () => void;
}

function GalleryActionBar({
  driveUrl,
  sections,
  hasSections,
  scrollToSection,
  favoritesEnabled,
  scrollToInfo,
  scrollToFavorites,
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
                label="Info"
                icon={FaInfoCircle}
                onClick={() => jumpAndClose(scrollToInfo)}
              />
              {sections.map((s) => (
                <DrawerRow
                  key={s.id}
                  label={s.name}
                  onClick={() => jumpAndClose(() => scrollToSection(s.id))}
                />
              ))}
              {favoritesEnabled && (
                <DrawerRow
                  label="Favorites"
                  icon={FaHeart}
                  onClick={() => jumpAndClose(scrollToFavorites)}
                />
              )}
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
        color="#8a6e35"
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
}: {
  count: number;
  filterActive: boolean;
  onToggleFilter: () => void;
}) {
  return (
    <Box
      id="gallery-favorites-section"
      sx={{ scrollMarginTop: { base: '90px', md: '140px' } }}
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
          color="#c9a96e"
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
        <Box w="30px" h="1px" bg="#c9a96e" mx="auto" mb={2} />
        <Text fontSize="xs" color="gray.500" fontWeight="300" maxW="440px" mx="auto" lineHeight="1.7">
          A quick way to keep track of the photos you love — for
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
          bg="#fdf9f0"
          border="1px solid"
          borderColor="#e8d9a8"
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
                Tap the heart on any photo — in the grid or in the lightbox —
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
        bg="#fdf9f0"
        border="1px solid"
        borderColor="#e8d9a8"
        borderRadius="md"
        px={{ base: 4, md: 5 }}
        py={{ base: 3, md: 3 }}
      >
        <Flex align="center" gap={2.5}>
          <Icon as={FaHeart} boxSize={3.5} color="#ff4c68" flexShrink={0} />
          <Text fontSize={{ base: 'xs', md: 'sm' }} color="gray.700" fontWeight="400">
            Filtering by favorites —{' '}
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
  // Section IDs that contain at least one favorited photo. Used to
  // grey out (and disable) pills whose sections would be empty in
  // the filtered view.
  sectionsWithFavorites: Set<string>;
  // When true, the favorites filter is active — pills for sections
  // in `sectionsWithFavorites` render normally; all other section
  // pills render greyed + non-interactive.
  filterActive: boolean;
  scrollToInfo: () => void;
  // Null when favorites feature is disabled (guests on /portal/pass)
  // — pill is omitted entirely from the nav rather than shown as an
  // inactive control.
  scrollToFavorites: (() => void) | null;
}

// Sentinel activeId values for the Info + Favorites bookend pills.
// Kept as string literals so they share the same activeId state as
// section IDs and pillRefs keys.
const INFO_ID = 'gallery-info-section';
const FAVORITES_ID = 'gallery-favorites-section';

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
  sectionsWithFavorites,
  filterActive,
  scrollToInfo,
  scrollToFavorites,
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
  // active-section scan to know whether to defer to Info/Favorites
  // rather than picking a section. A ref (not state) so the callback
  // always sees the freshest value without needing to re-subscribe.
  const isAtExtremeRef = useRef<null | 'top' | 'bottom'>(null);

  // Watch scroll position for the "am I at the top / bottom of the
  // page?" cases. At the very top, Info lights up; at the very
  // bottom, Favorites lights up (if enabled) — matching where those
  // targets sit in the DOM. Without these overrides, short trailing
  // sections would never satisfy the section-scan's activation
  // threshold and the last pill would never light.
  useEffect(() => {
    const updateExtremes = () => {
      const y = window.scrollY;
      const winH = window.innerHeight;
      const docH = document.documentElement.scrollHeight;
      if (y <= AT_TOP_THRESHOLD) {
        isAtExtremeRef.current = 'top';
        setActiveId(INFO_ID);
      } else if (y + winH >= docH - AT_BOTTOM_THRESHOLD) {
        isAtExtremeRef.current = 'bottom';
        // Favorites is the last pill only when the feature's enabled.
        // Otherwise let the section-scan pick whatever section is
        // closest to the bottom.
        if (scrollToFavorites) setActiveId(FAVORITES_ID);
      } else {
        isAtExtremeRef.current = null;
        // Don't clear activeId here — leave whatever section the
        // scan picked. Only take over when the user genuinely
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
  }, [scrollToFavorites]);

  // Active-section tracking via a rAF-throttled scroll listener.
  // Same approach as PortalTopNav: on every scroll frame, pick the
  // section with the largest top value that's still ≤ 150 (just
  // below the sticky nav bottom). That's the section the user has
  // most recently scrolled INTO.
  //
  // Includes gallery-info-section and gallery-favorites-section in
  // the scan (via document.getElementById) — without them, the Info
  // and Favorites pills only ever lit up via the "at page extreme"
  // special case, which didn't fire on regular scroll-back-to-top.
  useEffect(() => {
    const ACTIVATION_LINE = 150;
    let raf: number | null = null;
    const update = () => {
      raf = null;
      if (isAtExtremeRef.current !== null) return;
      let currentId: string | null = null;
      let bestTop = -Infinity;

      // Walk every candidate id: Info + section refs + Favorites.
      // Info first so we don't drop it, and Favorites separately
      // because it lives in its own DOM subtree (not sectionRefs).
      const consider = (id: string, el: HTMLElement | null) => {
        if (!el) return;
        const top = el.getBoundingClientRect().top;
        if (top <= ACTIVATION_LINE && top > bestTop) {
          bestTop = top;
          currentId = id;
        }
      };

      consider(INFO_ID, document.getElementById(INFO_ID));
      Object.entries(sectionRefs.current).forEach(([id, el]) => consider(id, el));
      consider(FAVORITES_ID, document.getElementById(FAVORITES_ID));

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
  // overflows the viewport. Scrolls the container directly rather
  // than using pill.scrollIntoView() — the latter would move the
  // page vertically when the sticky nav is out of view (block:
  // 'nearest' has an escape hatch to page-scroll when the element
  // isn't reachable within its scroll containers). That was
  // producing the "click Bottom → page springs back up" bounce.
  useEffect(() => {
    if (!activeId) return;
    const pill = pillRefs.current[activeId];
    const container = scrollRef.current;
    if (!pill || !container) return;
    const targetLeft =
      pill.offsetLeft - container.clientWidth / 2 + pill.offsetWidth / 2;
    container.scrollTo({ left: targetLeft, behavior: 'smooth' });
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
              pillRefs.current[INFO_ID] = el;
            }}
            icon={FaInfoCircle}
            label="Info"
            active={activeId === INFO_ID}
            onClick={() => {
              setActiveId(INFO_ID);
              scrollToInfo();
            }}
          />
          <NavStripDivider />
          {sections.map((section) => {
            // Grey + disable the pill when the favorites filter is
            // on and this section has zero favorited photos. Users
            // still see the section name (so the nav layout doesn't
            // shift when they toggle the filter), just clearly can't
            // navigate to it.
            const disabled = filterActive && !sectionsWithFavorites.has(section.id);
            return (
              <NavPill
                key={section.id}
                pillRef={(el) => {
                  pillRefs.current[section.id] = el;
                }}
                label={section.name}
                active={activeId === section.id}
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  // Optimistic highlight: flip active immediately so
                  // the pill lights up on tap even before smooth-
                  // scroll + scroll-scan settle. The scan will correct
                  // any drift as the scroll lands.
                  setActiveId(section.id);
                  onSectionClick(section.id);
                }}
              />
            );
          })}
          {scrollToFavorites && (
            <>
              <NavStripDivider />
              <NavPill
                pillRef={(el) => {
                  pillRefs.current[FAVORITES_ID] = el;
                }}
                icon={FaHeart}
                label="Favorites"
                active={activeId === FAVORITES_ID}
                onClick={() => {
                  setActiveId(FAVORITES_ID);
                  scrollToFavorites();
                }}
              />
            </>
          )}
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
      color={disabled ? 'gray.300' : active ? 'white' : 'gray.700'}
      bg={active && !disabled ? '#c9a96e' : 'transparent'}
      border="1px solid"
      borderColor={disabled ? 'gray.200' : active ? '#c9a96e' : 'gray.200'}
      borderRadius="full"
      transition="all 0.25s ease"
      cursor={disabled ? 'not-allowed' : 'pointer'}
      opacity={disabled ? 0.5 : 1}
      _hover={
        disabled
          ? {}
          : active
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
