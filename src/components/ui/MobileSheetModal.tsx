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
  contentProps?: ModalContentProps;
}

const MobileSheetModal = ({
  title,
  headerRight,
  footer,
  children,
  desktopSize = 'md',
  hideCloseButton = false,
  contentProps,
  ...modalProps
}: Props) => {
  return (
    <Modal
      {...modalProps}
      size={{ base: 'full', md: desktopSize } as any}
      isCentered={{ base: false, md: true } as any}
      motionPreset="slideInBottom"
      scrollBehavior="inside"
    >
      <ModalOverlay />
      <ModalContent
        borderRadius={{ base: 0, md: 'md' }}
        mx={{ base: 0, md: 4 }}
        my={{ base: 0, md: 'auto' }}
        maxH={{ base: '100dvh', md: 'auto' }}
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
