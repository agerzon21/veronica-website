import { ToastProvider, ToastOptionProvider } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * Mounts Chakra's toast machinery for the routes that actually use it.
 *
 * WHY THIS EXISTS
 *
 * `ChakraProvider` always mounts `ToastProvider`, and Chakra's toast component
 * does `import { motion } from 'framer-motion'` at module scope. That single
 * import is what dragged framer-motion's drag and layout-projection machinery
 * (~40 KB) into the homepage bundle, for a feature no public page uses:
 * `useToast` appears in 14 files and every one is Admin, Portal, Journal or
 * VoiceInput. It is also what made a LazyMotion conversion measure as exactly
 * zero — Chakra kept pulling the full `motion` regardless.
 *
 * So the app root uses Chakra's toast-free `Provider` and the three lazy routes
 * that need toasts mount this instead. Because those routes are code-split, the
 * toast code and the framer-motion features it needs land in THEIR chunks.
 *
 * IF TOASTS EVER STOP APPEARING somewhere, this is the first thing to check:
 * the component calling `useToast` must be rendered underneath a <ToastHost>.
 * `useToast` does not throw without one, it just silently renders nothing,
 * which is exactly the kind of failure that goes unnoticed.
 */
export default function ToastHost({ children }: { children: ReactNode }) {
  return (
    <ToastOptionProvider value={undefined}>
      {children}
      <ToastProvider />
    </ToastOptionProvider>
  );
}
