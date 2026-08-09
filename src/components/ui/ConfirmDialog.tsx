import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Stack,
} from '@chakra-ui/react';
import { useRef, type ReactNode } from 'react';
import CTAButton from './CTAButton';

/**
 * Confirm dialog that replaces window.confirm() everywhere in /admin.
 * window.confirm() on iOS Safari shows the URL host in the dialog title
 * (unavoidable), truncates long strings ugly, blocks the JS thread, and
 * looks nothing like the rest of the app. This is a proper modal that
 * plays well with our design system + goes full-screen on mobile so the
 * touch targets are big.
 *
 * Usage — the caller controls open state so cascading confirms + async
 * flows are natural:
 *
 *   const [confirmOpen, setConfirmOpen] = useState(false);
 *   ...
 *   <ConfirmDialog
 *     isOpen={confirmOpen}
 *     title="Delete photo?"
 *     body="This can't be undone."
 *     confirmLabel="Delete"
 *     danger
 *     onConfirm={() => { doDelete(); setConfirmOpen(false); }}
 *     onCancel={() => setConfirmOpen(false)}
 *   />
 */

interface Props {
  isOpen: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog = ({
  isOpen,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  isLoading = false,
  onConfirm,
  onCancel,
}: Props) => {
  // The dialog needs a focusable "least destructive" ref for a11y —
  // cancel is always the right default so escape / autofocus lands
  // somewhere safe.
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <AlertDialog
      isOpen={isOpen}
      onClose={onCancel}
      leastDestructiveRef={cancelRef}
      // Full-screen on mobile so the buttons are big + reachable; a
      // slide-in-from-bottom sheet feel. Regular centered dialog on
      // desktop where mouse tap targets don't matter.
      size={{ base: 'full', md: 'md' }}
      isCentered={{ base: false, md: true } as any}
      motionPreset="slideInBottom"
    >
      <AlertDialogOverlay>
        <AlertDialogContent
          borderRadius={{ base: 0, md: 'md' }}
          mx={{ base: 0, md: 4 }}
          my={{ base: 0, md: 'auto' }}
        >
          <AlertDialogHeader
            fontSize={{ base: 'lg', md: 'md' }}
            fontWeight="500"
            color="gray.800"
            pt={{ base: 6, md: 5 }}
          >
            {title}
          </AlertDialogHeader>
          {body && (
            <AlertDialogBody fontSize={{ base: 'sm', md: 'sm' }} color="gray.600" pt={0}>
              {body}
            </AlertDialogBody>
          )}
          <AlertDialogFooter
            pb={{ base: 'max(env(safe-area-inset-bottom), 16px)', md: 5 }}
            pt={{ base: 4, md: 3 }}
          >
            <Stack
              direction={{ base: 'column-reverse', md: 'row' }}
              spacing={2}
              w="100%"
              justify={{ base: 'stretch', md: 'flex-end' }}
            >
              {/* Cancel gets rendered first structurally so the ref lands
                  on it, but column-reverse on mobile puts confirm above
                  cancel for one-handed reachability. */}
              <CTAButton
                onClick={onCancel}
                variant="ghost"
                size="sm"
                fullWidth
              >
                {cancelLabel}
              </CTAButton>
              <CTAButton
                onClick={onConfirm}
                variant={danger ? 'danger' : 'solid'}
                size="sm"
                isLoading={isLoading}
                fullWidth
              >
                {confirmLabel}
              </CTAButton>
            </Stack>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  );
};

export default ConfirmDialog;
