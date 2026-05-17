import { extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  styles: {
    global: {
      html: {
        // Lock horizontal panning on mobile (combined with the viewport
        // user-scalable=no in index.html) so users can't pinch-zoom or
        // sideways-drag into broken layouts. Vertical scroll stays free.
        touchAction: 'pan-y',
        overscrollBehaviorX: 'none',
      },
      body: {
        bg: 'white',
        color: 'gray.800',
        overflowX: 'hidden',
        touchAction: 'pan-y',
        overscrollBehaviorX: 'none',
      },
    },
  },
  components: {
    Heading: {
      baseStyle: {
        fontWeight: 'light',
        letterSpacing: 'tight',
        lineHeight: '1.2',
      },
    },
    Text: {
      baseStyle: {
        color: 'gray.600',
      },
    },
    Container: {
      baseStyle: {
        maxW: 'container.xl',
      },
    },
    Image: {
      baseStyle: {
        borderRadius: 'lg',
      },
    },
  },
  textStyles: {
    subtitle: {
      fontSize: { base: 'lg', md: 'xl' },
      color: 'gray.600',
      textAlign: 'center',
    },
    body: {
      fontSize: { base: 'sm', md: 'md' },
      color: 'gray.600',
    },
  },
});

export default theme; 