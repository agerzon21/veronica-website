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
      // iOS Safari auto-zooms whenever the user focuses a form input
      // whose computed font-size is under 16px, and doesn't zoom back
      // out after submit — so a client logging into the portal on
      // iPhone would land on the authenticated view still zoomed in,
      // needing to pinch out to see the whole layout. Forcing 16px on
      // mobile prevents the trigger. Restored to inherit-from-Chakra
      // sizing on larger viewports where auto-zoom isn't a factor.
      '@media (max-width: 768px)': {
        'input[type=email], input[type=password], input[type=text], input[type=tel], input[type=search], input[type=number], textarea, select':
          {
            fontSize: '16px !important',
          },
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