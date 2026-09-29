import { Box, Spinner, type BoxProps } from '@chakra-ui/react';
import { useState, type CSSProperties, type MouseEventHandler } from 'react';

/**
 * <img> wrapped with a warm-cream placeholder background and a
 * centered gold spinner that shows while the image is loading.
 * Cross-fades: spinner opacity 1→0 as image opacity 0→1 on load.
 *
 * Used by the public gallery grid + individual photo pages + related
 * photo thumbnails so photos never appear as blank/broken while
 * they're streaming in from the /api/photo Drive proxy.
 *
 * All Box props are spread onto the container so callers control
 * sizing (w, h, aspectRatio, borderRadius, etc.) as normal.
 */

interface LoadingImageProps extends Omit<BoxProps, 'onClick' | 'srcSet' | 'sizes'> {
  src: string;
  alt: string;
  title?: string;
  /**
   * Responsive candidates, passed straight through to the <img>.
   *
   * Deliberately NOT built in here. The right `sizes` is a property of the
   * caller's layout, not of this wrapper: the individual photo page paints
   * the same photograph at 100vw in one place and inside a 187x220
   * object-fit: cover tile in another, and those want different numbers.
   * src/utils/gridSrcSet.ts builds the srcset itself.
   */
  srcSet?: string;
  sizes?: string;
  imgObjectFit?: CSSProperties['objectFit'];
  imgStyle?: CSSProperties;
  onClick?: MouseEventHandler<HTMLImageElement>;
  spinnerSize?: 'sm' | 'md' | 'lg';
  loading?: 'lazy' | 'eager';
  /** React 18.3 renders this as the fetchpriority attribute. */
  fetchPriority?: 'high' | 'low' | 'auto';
}

const LoadingImage = ({
  src,
  alt,
  title,
  srcSet,
  sizes,
  imgObjectFit = 'cover',
  imgStyle,
  onClick,
  spinnerSize = 'md',
  loading = 'lazy',
  fetchPriority,
  ...boxProps
}: LoadingImageProps) => {
  const [loaded, setLoaded] = useState(false);
  return (
    <Box position="relative" overflow="hidden" bg="brand.surfaceSunken" {...boxProps}>
      <Spinner
        color="brand.accentText"
        thickness="2px"
        size={spinnerSize}
        speed="0.8s"
        position="absolute"
        top="50%"
        left="50%"
        transform="translate(-50%, -50%)"
        opacity={loaded ? 0 : 1}
        transition="opacity 0.35s ease"
        pointerEvents="none"
        aria-hidden={loaded}
      />
      <img
        src={src}
        srcSet={srcSet}
        sizes={sizes}
        alt={alt}
        title={title}
        onClick={onClick}
        onLoad={() => setLoaded(true)}
        // Errored images still flip loaded so the spinner doesn't
        // stay forever. The failed <img> will show the browser's
        // native broken-image icon (rare in practice — Drive proxy
        // is reliable).
        onError={() => setLoaded(true)}
        loading={loading}
        fetchPriority={fetchPriority}
        style={{
          width: '100%',
          height: '100%',
          objectFit: imgObjectFit,
          display: 'block',
          position: 'relative',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 0.45s ease',
          ...imgStyle,
        }}
      />
    </Box>
  );
};

export default LoadingImage;
