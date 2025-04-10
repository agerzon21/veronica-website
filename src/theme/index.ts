import { extendTheme } from '@chakra-ui/react';

const theme = extendTheme({
  styles: {
    global: {
      body: {
        bg: 'white',
        color: 'gray.800',
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