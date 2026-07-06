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
        // Sets the color of the iOS rubber-band overscroll area (the
        // strip that appears when you drag past the top or bottom of a
        // page). Without this, iOS falls back to the theme-color meta
        // (#000000), so overscroll flashes black on our otherwise-white
        // pages — jarring, especially at the bottom of the client portal
        // when a section collapses and the page suddenly gets shorter.
        bg: 'white',
      },
      body: {
        bg: 'white',
        color: 'gray.800',
        overflowX: 'hidden',
        touchAction: 'pan-y',
        overscrollBehaviorX: 'none',
      },
      // NOTE: the iOS-input-auto-zoom fix (font-size 16px on inputs at
      // mobile widths) lives in a <style> block in index.html, NOT here.
      // Chakra's global-style compiler was silently stripping the
      // `@media (max-width: 768px)` block with the input[type=...] selectors
      // when we tried this from the theme — the selectors never landed in
      // the built bundle. Raw CSS in the HTML head bypasses that entirely
      // and applies before Chakra even hydrates.
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