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
import { FaDownload, FaExternalLinkAlt, FaPlay, FaImage, FaGoogle, FaCopy, FaCheck, FaStar, FaShareAlt, FaChevronUp, FaChevronDown, FaListUl } from 'react-icons/fa';
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
}

interface GridTileProps {
  file: DriveFile;
  index: number;
  onSelect: (i: number) => void;
  setRef: (el: HTMLDivElement | null) => void;
}

/**
 * One thumbnail in the gallery grid. Extracted as its own component so each
 * tile owns its thumbnail-load state — if a thumbnail fails (e.g. Drive's
 * thumbnail endpoint occasionally 4xx's video files until they're fully
 * processed) we swap to a placeholder card instead of leaving the user with
 * a broken-image icon. Video files also get a play-icon overlay so it's
 * clear they're not photos before the user even clicks.
 */
const GridTile = ({ file, index, onSelect, setRef }: GridTileProps) => {
  const [thumbFailed, setThumbFailed] = useState(false);
  const isVideo = file.mimeType.startsWith('video/');

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
}: ClientGalleryProps) => {
  // Flatten everything into one ordered array. The lightbox navigates by
  // index into this array, so prev/next walks across all sections in
  // delivery order. Section headers are purely visual — they don't gate
  // navigation. This matches photographer-platform convention (Pixieset,
  // ShootProof) where you scroll through the full set seamlessly.
  const allFiles = [...rootFiles, ...sections.flatMap((s) => s.files)];
  const totalCount = allFiles.length;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Refs per thumbnail (indexed against the flat allFiles array) so
  // ImageModal can animate open from the clicked thumbnail's rect.
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  // Refs per section header so the sticky section-nav can scroll to them.
  // Keyed by section.id since sections can be reordered without remounting.
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [originRect, setOriginRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

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
    <Box bg="white" minH="100vh" pt="72px">
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

      {/* The old top sticky section-nav bar was removed — the desktop
          right-rail timeline + the mobile "Jump" button in the sticky
          bottom bar cover the same "jump between sections" need without
          the redundant top strip. As a bonus, its borderBottom no longer
          crowds the first section's SECTION label with a tight extra
          horizontal line. */}

      {/* Grid */}
      {totalCount > 0 ? (
        <Box px={{ base: 2, md: 6 }} pb={20}>
          {/* Root-level files (no subfolder). Show first, no header — these
              are the files Veronika placed directly in the gallery root. If
              she delivered everything in subfolders, this is empty. */}
          {rootFiles.length > 0 && (
            <SimpleGrid
              columns={{ base: 2, md: 3, lg: 4 }}
              spacing={{ base: 1, md: 2 }}
            >
              {rootFiles.map((file, i) => (
                <GridTile
                  key={file.id}
                  file={file}
                  index={i}
                  onSelect={handleOpen}
                  setRef={(el) => { itemRefs.current[i] = el; }}
                />
              ))}
            </SimpleGrid>
          )}

          {/* Sections — one per subfolder. Each gets its own labeled grid.
              Index offset accumulates so itemRefs[i] always maps to
              allFiles[i] (the same array the lightbox navigates by). */}
          {sections.map((section, sIdx) => {
            const offset =
              rootFiles.length +
              sections.slice(0, sIdx).reduce((acc, s) => acc + s.files.length, 0);
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
                // header below the fixed Navbar (72px) with a little
                // breathing room, not flush against it.
                sx={{ scrollMarginTop: '92px' }}
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
                      />
                    );
                  })}
                </SimpleGrid>
              </Box>
            );
          })}
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
        <Box id="gallery-share-section">
          <GalleryShareSection galleryPassword={galleryPassword} />
        </Box>
      )}

      {/* Sticky bottom action bar + desktop right-rail timeline.
          Both auto-hide while the photo modal is open (selectedIndex
          non-null) so they don't visually fight the modal's controls. */}
      {selectedIndex === null && totalCount > 0 && (
        <>
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
          {sections.length > 0 && (
            <SectionTimelineRail
              sections={sections}
              sectionRefs={sectionRefs}
              rootFilesLabel={rootFiles.length > 0 ? 'Top' : null}
              scrollToTop={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              scrollToBottom={() =>
                window.scrollTo({
                  top: document.body.scrollHeight,
                  behavior: 'smooth',
                })
              }
              scrollToSection={scrollToSection}
            />
          )}
        </>
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
 * Desktop-only right-rail timeline. Persistent orientation aid + fast
 * jump navigation for large galleries where scrolling to a specific
 * section (or back to the top) is otherwise a chore.
 *
 * Each section header is observed via IntersectionObserver, and the
 * rail highlights whichever section is currently at the top of the
 * viewport. Click any label to smooth-scroll there. Hidden on mobile
 * (`display={{ base: 'none', md: 'flex' }}`) because a slim right-edge
 * strip is too cramped on phones — the sticky bar's Jump button opens
 * a bottom-sheet drawer with the same list instead.
 */
interface SectionTimelineRailProps {
  sections: FolderSection[];
  sectionRefs: React.MutableRefObject<{ [id: string]: HTMLDivElement | null }>;
  rootFilesLabel: string | null;
  scrollToTop: () => void;
  scrollToBottom: () => void;
  scrollToSection: (id: string) => void;
}

function SectionTimelineRail({
  sections,
  sectionRefs,
  scrollToTop,
  scrollToBottom,
  scrollToSection,
}: SectionTimelineRailProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Observe every section header via a rootMargin trick: entries are
  // "intersecting" only when they're in the top 40% of the viewport,
  // so the highlight tracks what's actually near the top rather than
  // whatever happens to overlap the middle. The topmost intersecting
  // entry wins.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const topmost = visible.reduce((best, e) =>
          e.boundingClientRect.top < best.boundingClientRect.top ? e : best,
        );
        const id = topmost.target.getAttribute('data-section-id');
        if (id) setActiveId(id);
      },
      { rootMargin: '-140px 0px -60% 0px', threshold: 0 },
    );
    const refs = sectionRefs.current;
    Object.entries(refs).forEach(([id, el]) => {
      if (el) {
        el.setAttribute('data-section-id', id);
        observer.observe(el);
      }
    });
    return () => observer.disconnect();
  }, [sections, sectionRefs]);

  return (
    <Box
      position="fixed"
      right={4}
      top="50%"
      transform="translateY(-50%)"
      zIndex={30}
      display={{ base: 'none', md: 'flex' }}
      flexDirection="column"
      bg="rgba(255, 255, 255, 0.92)"
      backdropFilter="blur(10px)"
      border="1px solid"
      borderColor="rgba(201, 169, 110, 0.35)"
      borderRadius="lg"
      boxShadow="0 8px 24px rgba(0, 0, 0, 0.08)"
      py={2}
      minW="140px"
      maxW="180px"
      maxH="70vh"
      overflowY="auto"
    >
      <RailButton icon={FaChevronUp} label="Top" onClick={scrollToTop} />
      <RailDivider />
      {sections.map((s) => (
        <RailSectionLabel
          key={s.id}
          label={s.name}
          active={activeId === s.id}
          onClick={() => scrollToSection(s.id)}
        />
      ))}
      <RailDivider />
      <RailButton icon={FaChevronDown} label="Bottom" onClick={scrollToBottom} />
    </Box>
  );
}

function RailButton({
  icon,
  label,
  onClick,
}: {
  icon: typeof FaChevronUp;
  label: string;
  onClick: () => void;
}) {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      display="flex"
      alignItems="center"
      gap={2}
      w="100%"
      px={4}
      py={2}
      fontSize="2xs"
      fontWeight="500"
      letterSpacing="0.15em"
      textTransform="uppercase"
      color="gray.500"
      bg="transparent"
      border="none"
      cursor="pointer"
      transition="all 0.2s"
      _hover={{ color: '#c9a96e', bg: 'rgba(201, 169, 110, 0.06)' }}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <Icon as={icon} boxSize={2.5} />
      <Box as="span">{label}</Box>
    </Box>
  );
}

function RailSectionLabel({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Box
      as="button"
      type="button"
      onClick={onClick}
      w="100%"
      textAlign="left"
      px={4}
      py={2}
      fontSize="xs"
      fontWeight={active ? 500 : 400}
      color={active ? '#c9a96e' : 'gray.600'}
      bg={active ? 'rgba(201, 169, 110, 0.08)' : 'transparent'}
      border="none"
      borderLeft="2px solid"
      borderLeftColor={active ? '#c9a96e' : 'transparent'}
      cursor="pointer"
      transition="all 0.2s"
      _hover={{ color: '#c9a96e', bg: 'rgba(201, 169, 110, 0.06)' }}
      sx={{ WebkitTapHighlightColor: 'transparent' }}
      noOfLines={1}
    >
      {label}
    </Box>
  );
}

function RailDivider() {
  return <Box h="1px" bg="gray.100" mx={4} my={1} />;
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

        {/* One-click link */}
        <VStack w="100%" spacing={2} align="stretch">
          <Text fontSize="xs" color="gray.500" fontWeight="500" letterSpacing="0.05em">
            One-click link
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
              fontSize="xs"
              color="gray.700"
              fontFamily="'SFMono-Regular', Menlo, Consolas, monospace"
              flex="1"
              minW={0}
              noOfLines={1}
              textAlign="left"
            >
              {directUrl}
            </Text>
            <Box
              as="button"
              type="button"
              onClick={() => copy(directUrl, setUrlCopied)}
              aria-label="Copy link"
              p={1.5}
              borderRadius="sm"
              color="gray.500"
              cursor="pointer"
              _hover={{ color: '#c9a96e', bg: 'gray.100' }}
              sx={{ WebkitTapHighlightColor: 'transparent' }}
            >
              <Icon as={urlCopied ? FaCheck : FaCopy} boxSize={3} />
            </Box>
          </Flex>
        </VStack>

        {/* Plain password as fallback */}
        <VStack w="100%" spacing={2} align="stretch">
          <Text fontSize="xs" color="gray.500" fontWeight="500" letterSpacing="0.05em">
            Or — go to vero.photography/portal/pass and use this password
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
              fontSize="md"
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

        {/* Email invite */}
        <VStack w="100%" spacing={2} align="stretch">
          <Text fontSize="xs" color="gray.500" fontWeight="500" letterSpacing="0.05em">
            Or send via email
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
              variant="solid"
              size="sm"
              isLoading={inviteSending}
              loadingText="Sending..."
            >
              Send Invite
            </CTAButton>
          </Flex>
          <Text fontSize="xs" color="gray.500" fontWeight="300" lineHeight="1.5">
            We'll email them with the same one-click link. To keep things from getting spammy, this gallery can send up to 5 invites in any 24-hour period.
            {remainingToday !== null && (
              <> ({remainingToday} {remainingToday === 1 ? 'left' : 'left'} today.)</>
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
      </VStack>
    </Box>
  );
}

export default ClientGallery;
