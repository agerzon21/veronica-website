import {
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Stack,
  type ModalContentProps,
  type ModalProps,
} from '@chakra-ui/react';
import { type ReactNode } from 'react';

/**
 * Thin wrapper over Chakra Modal that goes full-screen on mobile and
 * behaves like a normal centered modal on desktop. Every admin modal
 * with a form should use this — the raw Chakra Modal with size="md"/"lg"
 * gets cramped on 375px viewports and the on-screen keyboard covers
 * half of it when Textarea gets focus.
 *
 * On mobile:
 *   - Full-screen (no rounded corners, no margin)
 *   - Slides in from the bottom
 *   - Footer honors env(safe-area-inset-bottom)
 *   - ModalFooterStack renders footer buttons stacked column-reverse
 *     so the primary action sits above cancel (one-handed reach)
 *
 * On desktop:
 *   - Standard centered modal at whatever size the caller passes
 *   - Buttons in a row on the right
 */

interface Props extends Omit<ModalProps, 'children' | 'size'> {
  title?: ReactNode;
  headerRight?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  // Desktop-only size. On mobile we always go full-screen.
  desktopSize?: ModalProps['size'];
  // Rare escape hatch — some modals don't want a close X (e.g. a
  // confirmation flow where you must pick an action).
  hideCloseButton?: boolean;
  /**
   * Anchor to the BOTTOM of the phone instead of filling the screen.
   *
   * For action sheets, whose controls have to be inside thumb reach. A form
   * should stay full screen: at 82dvh with a software keyboard up there is
   * almost nothing left to type into.
   *
   * THE ONE DECLARATION EVERYTHING TURNS ON is minH: 0. Chakra 2.8's modal
   * theme emits dialog { maxW: '100vw', minH: '$100vh', my: '0' } for
   * size="full" (node_modules/@chakra-ui/theme/dist/esm/components/modal.mjs),
   * and min-height beats max-height, so without overriding it the dialog fills
   * the screen, mt:'auto' is inert and the rows render at the TOP however the
   * rest is set. That is why every sheet in this panel has been full screen
   * with its close button in the one corner a right thumb cannot reach.
   *
   * With minH cleared, mt:'auto' works because the dialog container is a
   * full height flex row with align-items flex-start at base (isCentered is
   * false there), and an auto cross axis margin overrides align-items and
   * absorbs the free space. scrollBehavior="inside" already handles a long
   * body on a short phone.
   *
   * Desktop is untouched: it stays a centred modal.
   */
  sheet?: boolean;
  contentProps?: ModalContentProps;
}

const MobileSheetModal = ({
  title,
  headerRight,
  footer,
  children,
  desktopSize = 'md',
  hideCloseButton = false,
  sheet = false,
  contentProps,
  ...modalProps
}: Props) => {
  return (
    <Modal
      {...modalProps}
      size={{ base: 'full', md: desktopSize } as any}
      /**
       * isCentered IS NOT RESPONSIVE. Chakra takes a boolean, and the object
       * below is an object, which is truthy, so this has read "centered" at
       * every width since the day it was written, base included. The `as any`
       * is what let it through the type system.
       *
       * Left alone for the normal path, because that is what every modal in
       * the panel has always looked like and changing it here would move all
       * of them. A sheet needs the container aligned to the top so an auto top
       * margin can absorb the free space and push it to the bottom, so a sheet
       * says so plainly and gets its desktop centring back from `my: auto`
       * on the content instead.
       */
      isCentered={sheet ? false : ({ base: false, md: true } as any)}
      motionPreset="slideInBottom"
      scrollBehavior="inside"
    >
      <ModalOverlay />
      <ModalContent
        borderRadius={{ base: 0, md: 'md' }}
        mx={{ base: 0, md: 4 }}
        my={{ base: 0, md: 'auto' }}
        // A sheet caps itself lower, below; declaring maxH twice would let the
        // later spread silently win, which TypeScript is right to object to.
        {...(sheet ? {} : { maxH: { base: '100dvh', md: 'auto' } })}
        {...(sheet
          ? {
              /**
               * Doubled selector, and the reason is specificity, not taste.
               *
               * Three attempts failed and each was measured. Style props lost
               * because Chakra's own config decides the order, not the order
               * they are written. Plain sx lost because of the CASCADE: for
               * size="full" the theme emits
               *
               *   @media screen and (min-width: 0em) and (max-width: 47.98em) {
               *     .css-xxx { min-height: var(--chakra-vh); margin-top: 0px }
               *   }
               *
               * AFTER these declarations and at the same single class
               * specificity, so it wins. Dumping the matched rules is what
               * showed it: max-height: 82dvh from this very object applied
               * fine, while min-height and margin-top from the same object
               * were overwritten a few rules later.
               *
               * '&&' emits .css-xxx.css-xxx, which outranks a single class
               * whatever the order, so this holds without depending on where
               * emotion happens to insert it.
               */
              sx: {
                '&&': {
                  minHeight: 0,
                  height: 'auto',
                  maxHeight: '82dvh',
                  // The container is align-items flex-start for a sheet, so an
                  // auto top margin absorbs the free space and pushes it down.
                  marginTop: 'auto',
                  marginBottom: 0,
                  borderTopLeftRadius: '16px',
                  borderTopRightRadius: '16px',
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                  // Desktop stays the centred modal it has always been.
                  '@media (min-width: 48em)': {
                    maxHeight: 'none',
                    marginTop: 'auto',
                    marginBottom: 'auto',
                    borderRadius: '0.375rem',
                  },
                },
              },
            }
          : {})}
        {...contentProps}
      >
        {title !== undefined && (
          <ModalHeader
            fontSize={{ base: 'md', md: 'md' }}
            fontWeight="500"
            color="gray.800"
            pr={{ base: 12, md: 12 }}
            pt={{ base: 5, md: 4 }}
          >
            {title}
            {headerRight}
          </ModalHeader>
        )}
        {!hideCloseButton && (
          <ModalCloseButton
            size={{ base: 'lg', md: 'md' } as any}
            top={{ base: 3, md: 2 }}
            right={{ base: 3, md: 2 }}
          />
        )}
        <ModalBody pb={footer ? 4 : { base: 'max(env(safe-area-inset-bottom), 16px)', md: 5 }}>
          {children}
        </ModalBody>
        {footer && (
          <ModalFooter
            pt={3}
            pb={{ base: 'max(env(safe-area-inset-bottom), 16px)', md: 4 }}
            borderTop={{ base: '1px solid', md: 'none' }}
            borderColor={{ base: 'gray.100', md: 'transparent' }}
          >
            {footer}
          </ModalFooter>
        )}
      </ModalContent>
    </Modal>
  );
};

/**
 * Footer helper — buttons stack full-width column-reverse on mobile
 * (primary CTA above cancel/back) and row on desktop. Consumers pass
 * buttons as children; this component just arranges them.
 */
export const MobileSheetFooter = ({ children }: { children: ReactNode }) => (
  <Stack
    direction={{ base: 'column-reverse', md: 'row' }}
    spacing={2}
    w="100%"
    justify={{ base: 'stretch', md: 'flex-end' }}
  >
    {children}
  </Stack>
);

export default MobileSheetModal;
