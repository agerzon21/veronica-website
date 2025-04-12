import { Box, Image, Skeleton } from '@chakra-ui/react';
import { motion } from 'framer-motion';
import ImageModal from './ImageModal';
import { useState, useEffect, useRef, useMemo } from 'react';

interface GalleryGridProps {
  images: Array<{
    url: string;
  }>;
}

interface ImageDimensions {
  url: string;
  width: number;
  height: number;
  loaded: boolean;
}

const MotionBox = motion(Box);

// Cache for image dimensions
const imageDimensionCache = new Map<string, ImageDimensions>();

// Function to generate Cloudinary URL with transformations
const getOptimizedImageUrl = (url: string, width: number) => {
  const baseUrl = url.split('/upload/')[0];
  const imagePath = url.split('/upload/')[1];
  return `${baseUrl}/upload/w_${width},q_auto,f_auto/${imagePath}`;
};

const GalleryGrid = ({ images }: GalleryGridProps) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(3);
  const [visibleImages, setVisibleImages] = useState<Set<string>>(new Set());

  // Memoize the image URLs to prevent unnecessary recalculations
  const imageUrls = useMemo(() => images.map(img => img.url), [images]);

  // Intersection Observer for lazy loading
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const imgUrl = entry.target.getAttribute('data-src');
            if (imgUrl) {
              setVisibleImages((prev) => new Set([...prev, imgUrl]));
            }
          }
        });
      },
      {
        rootMargin: '50px 0px',
        threshold: 0.1,
      }
    );

    const elements = document.querySelectorAll('[data-src]');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [imageDimensions]);

  useEffect(() => {
    const loadImageDimensions = async () => {
      const dimensions = await Promise.all(
        imageUrls.map(async (url) => {
          // Check cache first
          if (imageDimensionCache.has(url)) {
            return imageDimensionCache.get(url)!;
          }

          // Load new dimensions if not in cache
          return new Promise<ImageDimensions>((resolve) => {
            const img = new window.Image();
            img.onload = () => {
              const dimension = {
                url,
                width: img.naturalWidth,
                height: img.naturalHeight,
                loaded: false
              };
              // Cache the result
              imageDimensionCache.set(url, dimension);
              resolve(dimension);
            };
            img.src = url;
          });
        })
      );
      setImageDimensions(dimensions);
    };

    loadImageDimensions();
  }, [imageUrls]);

  useEffect(() => {
    const updateColumnCount = () => {
      if (containerRef.current) {
        const width = containerRef.current.offsetWidth;
        if (width < 768) setColumnCount(1);
        else if (width < 1024) setColumnCount(2);
        else setColumnCount(3);
      }
    };

    updateColumnCount();
    window.addEventListener('resize', updateColumnCount);
    return () => window.removeEventListener('resize', updateColumnCount);
  }, []);

  const handleImageClick = (imageUrl: string) => {
    setSelectedImage(imageUrl);
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setSelectedImage(null);
  };

  // Calculate the aspect ratio for each image
  const getAspectRatio = (width: number, height: number) => {
    return width / height;
  };

  // Sort images to create a balanced distribution
  const sortedImages = useMemo(() => {
    return [...imageDimensions].sort((a, b) => {
      const ratioA = getAspectRatio(a.width, a.height);
      const ratioB = getAspectRatio(b.width, b.height);
      
      // Group images into categories based on aspect ratio
      const categoryA = ratioA > 1.5 ? 'wide' : ratioA < 0.8 ? 'tall' : 'square';
      const categoryB = ratioB > 1.5 ? 'wide' : ratioB < 0.8 ? 'tall' : 'square';
      
      // Define the order of categories
      const categoryOrder = { wide: 0, square: 1, tall: 2 };
      
      // Sort by category first
      if (categoryOrder[categoryA] !== categoryOrder[categoryB]) {
        return categoryOrder[categoryA] - categoryOrder[categoryB];
      }
      
      // Within the same category, alternate between ascending and descending
      return Math.random() > 0.5 ? ratioA - ratioB : ratioB - ratioA;
    });
  }, [imageDimensions]);

  if (imageDimensions.length === 0) {
    return (
      <Box 
        ref={containerRef}
        py={8} 
        px={4}
        maxW="1400px"
        mx="auto"
      >
        <Box
          display="grid"
          gridTemplateColumns={`repeat(${columnCount}, 1fr)`}
          gap={4}
        >
          {[...Array(6)].map((_, index) => (
            <Skeleton
              key={index}
              height="300px"
              borderRadius="lg"
            />
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box 
      ref={containerRef}
      py={8} 
      px={4}
      maxW="1400px"
      mx="auto"
    >
      <Box
        display="grid"
        gridTemplateColumns={`repeat(${columnCount}, 1fr)`}
        gap={4}
      >
        {sortedImages.map((image, index) => {
          const isVisible = visibleImages.has(image.url);
          const containerWidth = containerRef.current?.offsetWidth || 1200;
          const imageWidth = Math.floor(containerWidth / columnCount);
          
          return (
            <MotionBox
              key={index}
              position="relative"
              overflow="hidden"
              borderRadius="lg"
              whileHover={{ scale: 1.02 }}
              transition={{ duration: 0.3 }}
              cursor="pointer"
              onClick={() => handleImageClick(image.url)}
              gridRow={`span ${getAspectRatio(image.width, image.height) > 1.5 ? 2 : 1}`}
            >
              <Skeleton
                isLoaded={isVisible}
                height="100%"
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
              >
                <Image
                  src={isVisible ? getOptimizedImageUrl(image.url, imageWidth) : ''}
                  data-src={image.url}
                  alt={`Gallery image ${index + 1}`}
                  width="100%"
                  height="100%"
                  objectFit="cover"
                  transition="all 0.3s ease"
                  _hover={{ filter: 'brightness(0.9)' }}
                  loading="lazy"
                  onLoad={() => {
                    setImageDimensions(prev => 
                      prev.map(img => 
                        img.url === image.url ? { ...img, loaded: true } : img
                      )
                    );
                  }}
                />
              </Skeleton>
            </MotionBox>
          );
        })}
      </Box>

      {selectedImage && (
        <ImageModal
          isOpen={isModalOpen}
          onClose={handleModalClose}
          imageUrl={selectedImage}
          imageAlt="Gallery image"
        />
      )}
    </Box>
  );
};

export default GalleryGrid; 