import {
  Box,
  Flex,
  Text,
  VStack,
  Image,
  Icon,
  SimpleGrid,
} from '@chakra-ui/react';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaDownload, FaExternalLinkAlt } from 'react-icons/fa';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '@chakra-ui/icons';
import CTAButton from './ui/CTAButton';

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  thumbnailUrl: string;
  viewUrl: string;
  downloadUrl: string;
}

interface ClientGalleryProps {
  clientName: string | null;
  driveUrl: string;
  files: DriveFile[];
  warning?: string;
}

const ClientGallery = ({ clientName, driveUrl, files, warning }: ClientGalleryProps) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const openAt = (i: number) => setSelectedIndex(i);
  const close = useCallback(() => setSelectedIndex(null), []);
  const next = useCallback(() => {
    if (selectedIndex !== null && selectedIndex < files.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  }, [selectedIndex, files.length]);
  const prev = useCallback(() => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  }, [selectedIndex]);

  // Keyboard navigation when the viewer is open.
  useEffect(() => {
    if (selectedIndex === null) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedIndex, close, next, prev]);

  // Scroll lock while the viewer is open.
  useEffect(() => {
    if (selectedIndex === null) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    };
  }, [selectedIndex]);

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
                position="relative"
                cursor="pointer"
                overflow="hidden"
                role="group"
                onClick={() => openAt(i)}
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
                  {/* Hover overlay: dim + download icon in corner */}
                  <Box
                    position="absolute"
                    inset={0}
                    bg="rgba(0,0,0,0)"
                    transition="background 0.3s ease"
                    _groupHover={{ bg: 'rgba(0,0,0,0.15)' }}
                    pointerEvents="none"
                  />
                </Box>
                {/* Per-photo download corner button — accessible to mouse + keyboard */}
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
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                  borderRadius="full"
                  opacity={0}
                  transition="opacity 0.3s ease, background 0.2s ease"
                  _groupHover={{ opacity: 1 }}
                  _hover={{ bg: '#c9a96e' }}
                  aria-label={`Download ${file.name}`}
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
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

      {/* Lightbox viewer */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 2100,
              background: 'rgba(0,0,0,0.93)',
            }}
            onClick={close}
          >
            {/* Top bar — counter + close + per-photo download */}
            <Flex
              position="absolute"
              top={0}
              left={0}
              right={0}
              px={{ base: 4, md: 8 }}
              py={4}
              justify="space-between"
              align="center"
              zIndex={2}
              onClick={(e) => e.stopPropagation()}
            >
              <Text
                fontSize="xs"
                color="whiteAlpha.700"
                letterSpacing="0.15em"
                fontWeight="400"
              >
                {(selectedIndex ?? 0) + 1} / {files.length}
              </Text>
              <Flex gap={5} align="center">
                <Box
                  as="a"
                  href={selected.downloadUrl}
                  download={selected.name}
                  color="whiteAlpha.800"
                  transition="color 0.3s"
                  _hover={{ color: '#c9a96e' }}
                  aria-label="Download photo"
                  display="flex"
                  alignItems="center"
                  gap={2}
                  fontSize="xs"
                  fontWeight="400"
                  letterSpacing="0.2em"
                  textTransform="uppercase"
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <Icon as={FaDownload} boxSize={3.5} />
                  <Box as="span" display={{ base: 'none', md: 'inline' }}>
                    Download
                  </Box>
                </Box>
                <Box
                  as="button"
                  type="button"
                  onClick={close}
                  color="whiteAlpha.800"
                  transition="color 0.3s"
                  _hover={{ color: 'white' }}
                  aria-label="Close"
                  sx={{ WebkitTapHighlightColor: 'transparent' }}
                >
                  <CloseIcon boxSize={3} />
                </Box>
              </Flex>
            </Flex>

            {/* Prev arrow */}
            {selectedIndex !== null && selectedIndex > 0 && (
              <Box
                as="button"
                type="button"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); prev(); }}
                position="absolute"
                left={{ base: 2, md: 6 }}
                top="50%"
                transform="translateY(-50%)"
                zIndex={2}
                w="44px"
                h="44px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                color="whiteAlpha.600"
                transition="color 0.3s"
                _hover={{ color: 'white' }}
                aria-label="Previous"
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <ChevronLeftIcon boxSize={8} />
              </Box>
            )}

            {/* Next arrow */}
            {selectedIndex !== null && selectedIndex < files.length - 1 && (
              <Box
                as="button"
                type="button"
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); next(); }}
                position="absolute"
                right={{ base: 2, md: 6 }}
                top="50%"
                transform="translateY(-50%)"
                zIndex={2}
                w="44px"
                h="44px"
                display="flex"
                alignItems="center"
                justifyContent="center"
                color="whiteAlpha.600"
                transition="color 0.3s"
                _hover={{ color: 'white' }}
                aria-label="Next"
                sx={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <ChevronRightIcon boxSize={8} />
              </Box>
            )}

            {/* The image itself */}
            <Flex
              position="absolute"
              inset={0}
              align="center"
              justify="center"
              p={{ base: 4, md: 12 }}
              onClick={(e) => e.stopPropagation()}
            >
              <Image
                src={selected.viewUrl}
                alt={selected.name}
                maxW="100%"
                maxH="100%"
                objectFit="contain"
                userSelect="none"
                draggable={false}
              />
            </Flex>

            {/* Filename at bottom */}
            <Box
              position="absolute"
              bottom={0}
              left={0}
              right={0}
              px={{ base: 4, md: 8 }}
              py={4}
              textAlign="center"
              pointerEvents="none"
            >
              <Text
                fontSize="xs"
                color="whiteAlpha.500"
                fontWeight="300"
                letterSpacing="0.05em"
                noOfLines={1}
              >
                {selected.name}
              </Text>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

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
