import {
  Box,
  Text,
  VStack,
  Image,
  Icon,
  SimpleGrid,
} from '@chakra-ui/react';
import { useState, useRef, useCallback } from 'react';
import { FaDownload, FaExternalLinkAlt } from 'react-icons/fa';
import CTAButton from './ui/CTAButton';
import ImageModal from './ImageModal';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailUrl: string;
  viewUrl: string;
  downloadUrl: string;
  originalUrl: string;
}

interface ClientGalleryProps {
  clientName: string | null;
  driveUrl: string;
  files: DriveFile[];
  warning?: string;
}

const ClientGallery = ({ clientName, driveUrl, files, warning }: ClientGalleryProps) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // Refs per thumbnail so ImageModal can animate open from the clicked
  // thumbnail's rect and animate close back to its current rect — same
  // motion language as the public gallery uses via GalleryGrid.
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
    setSelectedIndex((i) => (i !== null && i < files.length - 1 ? i + 1 : i));
  }, [files.length]);
  const handlePrev = useCallback(() => {
    setSelectedIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  }, []);
  const getImageRect = useCallback((index: number) => {
    const el = itemRefs.current[index];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }, []);

  const selected = selectedIndex !== null ? files[selectedIndex] : null;

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
        {files.length > 0 && (
          <Text fontSize="sm" color="gray.500" fontWeight="300" mt={2}>
            {files.length} {files.length === 1 ? 'photo' : 'photos'}
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
      {files.length > 0 ? (
        <Box px={{ base: 2, md: 6 }} pb={20}>
          <SimpleGrid
            columns={{ base: 2, md: 3, lg: 4 }}
            spacing={{ base: 1, md: 2 }}
          >
            {files.map((file, i) => (
              <Box
                key={file.id}
                ref={(el: HTMLDivElement | null) => { itemRefs.current[i] = el; }}
                position="relative"
                cursor="pointer"
                overflow="hidden"
                role="group"
                onClick={() => handleOpen(i)}
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <Box position="relative" pb="100%" overflow="hidden" bg="gray.100">
                  <Image
                    src={file.thumbnailUrl}
                    alt={file.name}
                    position="absolute"
                    inset={0}
                    w="100%"
                    h="100%"
                    objectFit="cover"
                    loading="lazy"
                    transition="transform 0.5s ease"
                    _groupHover={{ transform: 'scale(1.03)' }}
                  />
                  <Box
                    position="absolute"
                    inset={0}
                    bg="rgba(0,0,0,0)"
                    transition="background 0.3s ease"
                    _groupHover={{ bg: 'rgba(0,0,0,0.15)' }}
                    pointerEvents="none"
                  />
                </Box>
                {/* Per-photo quick-download in the corner — desktop power
                    users only. Hidden on touch devices via the @media
                    (hover: hover) media query: touch devices fire :hover
                    on tap, which would briefly flash this icon and confuse
                    the "tap a photo to open lightbox" interaction. The
                    canonical mobile save flow is the "Save to Photos"
                    button inside the lightbox. */}
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
            ))}
          </SimpleGrid>
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
          totalImages={files.length}
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
          hideShare
        />
      )}

      {/* Bottom secondary CTA — Download All */}
      {files.length > 0 && (
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
