import {
  Box,
  Flex,
  Text,
  VStack,
  Image,
  Icon,
  SimpleGrid,
} from '@chakra-ui/react';
import { useState, useRef, useCallback } from 'react';
import { FaDownload, FaExternalLinkAlt, FaPlay, FaImage } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import ImageModal from './ImageModal';

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
  const [originRect, setOriginRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

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

        {/* Download All link */}
        <Box mt={6}>
          <CTAButton href={driveUrl} icon={FaExternalLinkAlt} size="sm">
            Download All from Drive
          </CTAButton>
        </Box>

        {warning && (
          <Text mt={4} fontSize="sm" color="orange.500" fontWeight="300" maxW="500px" mx="auto">
            {warning}
          </Text>
        )}
      </Box>

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
                mt={rootFiles.length > 0 || sIdx > 0 ? { base: 10, md: 14 } : 0}
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
        />
      )}

      {/* Bottom secondary CTA — Download All */}
      {totalCount > 0 && (
        <Box bg="gray.50" py={12} px={6} textAlign="center">
          <VStack spacing={4}>
            <Text fontSize="xs" fontWeight="500" textTransform="uppercase" letterSpacing="0.2em" color="#c9a96e">
              Want everything?
            </Text>
            <Box w="30px" h="1px" bg="#c9a96e" />
            <Text fontSize="sm" color="gray.600" fontWeight="300" maxW="420px" lineHeight="1.8">
              Download all photos in one go via Drive. Large galleries may split into multiple ZIP files — that's normal.
            </Text>
            <CTAButton href={driveUrl} icon={FaExternalLinkAlt}>
              Open Drive Folder
            </CTAButton>
          </VStack>
        </Box>
      )}
    </Box>
  );
};

export default ClientGallery;
