import {
  ThemeProvider,
  ColorModeProvider,
  EnvironmentProvider,
  CSSReset,
  GlobalStyle,
} from '@chakra-ui/react';
import type { ReactNode } from 'react';
import type { Theme } from '@chakra-ui/react';

/**
 * ChakraProvider without the toast machinery.
 *
 * WHY NOT JUST USE ChakraProvider
 *
 * `ChakraProvider` and `ChakraBaseProvider` are both `createProvider(theme)`,
 * and createProvider unconditionally renders `<ToastProvider>`. Chakra's toast
 * component does `import { motion } from 'framer-motion'` at module scope, so
 * mounting it drags framer-motion's drag and layout-projection machinery
 * (~40 KB) into whatever chunk the provider lives in — the homepage bundle —
 * for a feature no public page uses. `useToast` appears in 14 files and every
 * one is Admin, Portal, Journal or VoiceInput. It is also why converting the
 * app to LazyMotion measured as exactly zero: Chakra kept pulling full `motion`
 * no matter what the app did.
 *
 * WHY COMPOSED RATHER THAN DEEP-IMPORTED
 *
 * Chakra does export a toast-free `Provider`, but only from
 * `@chakra-ui/react/dist/esm/provider/index.mjs`, which has no types and is an
 * internal path that a minor upgrade could move. Every piece it composes IS
 * public, so this rebuilds the same tree from the public API. If Chakra changes
 * what its provider composes, this file needs the same change — compare against
 * node_modules/@chakra-ui/react/dist/esm/provider/provider.mjs after upgrading.
 *
 * Deliberately omitted from the original: `portalZIndex` (unset here, so the
 * upstream code path is the no-PortalManager branch) and the `resetCSS: false`
 * / `disableGlobalStyle` branches, which this app never used.
 */
export default function AppChakraProvider({
  theme,
  children,
}: {
  theme: Record<string, unknown> | Partial<Theme>;
  children: ReactNode;
}) {
  return (
    <ThemeProvider theme={theme as Partial<Theme>}>
      <ColorModeProvider options={(theme as { config?: never }).config}>
        <CSSReset />
        <GlobalStyle />
        <EnvironmentProvider>{children}</EnvironmentProvider>
      </ColorModeProvider>
    </ThemeProvider>
  );
}
